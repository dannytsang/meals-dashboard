"""Private bounded phase recovery for the existing publisher (no scheduler).

All diagnostics are fixed strings. Auth and endpoint URLs are never persisted.
The server protocol, not this process lock, prevents delayed stale writes.
"""
import copy
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import time

MAX_BYTES = 8 * 1024 * 1024
MAX_ENTRIES = 8
MAX_AGE = 24 * 60 * 60


class CheckpointError(Exception):
    pass


def _encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def _endpoint(url):
    return hashlib.sha256(url.encode()).hexdigest()


def _products_url(url):
    return url.rsplit('/', 1)[0] + '/dashboard-products-sync'


class RecoveryPublisher:
    def __init__(self, root, post):
        self.root = Path(root).expanduser()
        self.post = post
        self.state = {'version': 1, 'entries': [], 'latest': {}}

    @contextmanager
    def _locked(self):
        fd = None
        try:
            self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
            info = self.root.lstat()
            if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid():
                raise ValueError('unsafe directory')
            os.chmod(self.root, 0o700)
            fd = os.open(self.root / 'lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            os.fchmod(fd, 0o600)
            deadline = time.monotonic() + 10
            while True:
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() >= deadline:
                        raise ValueError('busy')
                    time.sleep(0.025)
            self._load()
            yield
        except CheckpointError:
            raise
        except (OSError, ValueError, TypeError, KeyError):
            raise CheckpointError('Publication checkpoint unavailable') from None
        finally:
            if fd is not None:
                os.close(fd)

    def _load(self):
        for temporary in self.root.glob('.pending-*'):
            if temporary.is_symlink() or not temporary.is_file():
                raise ValueError('unsafe temporary')
            temporary.unlink()  # abandoned atomic-write payloads are never replayed
        path = self.root / 'pending.json'
        if path.exists() or path.is_symlink():
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
                os.close(fd)
                raise ValueError('unsafe checkpoint')
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, 'rb') as stream:
                raw = stream.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise ValueError('oversize')
            self.state = json.loads(raw)
        s = self.state
        if not isinstance(s, dict):
            raise ValueError('invalid state')
        if s.get('version') != 1 or not isinstance(s.get('entries'), list) or not isinstance(s.get('latest'), dict):
            raise ValueError('invalid state')
        if len(s['entries']) > MAX_ENTRIES or len(s['latest']) > 2:
            raise ValueError('invalid limits')
        for name, generation in s['latest'].items():
            if name not in ('primary', 'secondary') or type(generation) is not int or generation <= 0:
                raise ValueError('invalid watermark')
        for e in s['entries']:
            if (e['target'] not in ('primary', 'secondary') or e['phase'] not in ('main', 'products')
                    or not re.fullmatch('[a-f0-9]{64}', e['endpoint'])
                    or not isinstance(e['payload'], dict) or not isinstance(e['created'], (float, int))):
                raise ValueError('invalid entry')
            p = e['payload']['publication']
            if (p['version'] != 1 or not re.fullmatch('[a-f0-9]{32}', p['runId'])
                    or type(p['generation']) is not int or p['generation'] <= 0
                    or p['target'] != e['target'] or p['phase'] != e['phase']):
                raise ValueError('invalid identity')
        now = time.time()
        s['entries'] = [e for e in s['entries'] if 0 <= now - e['created'] <= MAX_AGE]

    def _save(self):
        raw = _encoded(self.state)
        if len(raw) > MAX_BYTES or len(self.state['entries']) > MAX_ENTRIES:
            raise CheckpointError('Publication checkpoint capacity exceeded')
        fd, path = tempfile.mkstemp(prefix='.pending-', dir=self.root)
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(path, self.root / 'pending.json')
            directory = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
            try: os.fsync(directory)
            finally: os.close(directory)
        finally:
            if os.path.exists(path): os.unlink(path)

    def _attempt(self, entry, url, secret, dry_run=False):
        target_url = _products_url(url) if entry['phase'] == 'products' else url
        body = entry['payload']
        # Authenticate and prove protocol BEFORE any non-dry write, including
        # on replay after a server rollback. Legacy servers ignore unknown fields.
        ok, response = self.post(body, target_url, secret, dry_run=True)
        if not ok or response.get('publicationProtocol') != 1:
            return False, {'error': 'publication protocol preflight failed'}
        if dry_run:
            return True, response
        for attempt in range(2):
            ok, response = self.post(body, target_url, secret, dry_run=False)
            if ok:
                if response.get('publicationProtocol') != 1:
                    return False, {'error': 'publication protocol acknowledgment missing'}
                return True, response
            if response.get('status') in (400, 401, 403, 409):
                break
            if attempt == 0:
                time.sleep(0.25)
        return False, response

    def _run_entry(self, entry, url, secret):
        ok, response = self._attempt(entry, url, secret)
        result = {entry['phase']: {'ok': ok, 'response': response}}
        if not ok:
            return result
        self.state['entries'].remove(entry)
        if entry['phase'] == 'main' and entry.get('products'):
            manifest = response.get('manifestPath')
            if not isinstance(manifest, str) or not manifest.startswith('meta/manifest-'):
                self.state['entries'].append(entry)
                return {'main': {'ok': False, 'response': {'error': 'main manifest acknowledgment missing'}}}
            product_entry = {k: v for k, v in entry.items() if k not in ('payload', 'products')}
            product_entry['phase'] = 'products'
            product_entry['payload'] = {'products': entry['products'], 'mainManifestPath': manifest,
                'publication': {**entry['payload']['publication'], 'phase': 'products'}}
            self.state['entries'].append(product_entry)
            self._save()  # suppress successful main even if process stops here
            result.update(self._run_entry(product_entry, url, secret))
        self._save()
        return result

    def replay(self, destinations):
        results = {}
        configured = {name: (url, secret) for name, url, secret in destinations}
        with self._locked():
            self._save()  # persist retention cleanup even without pending work
            for entry in list(self.state['entries']):
                config = configured.get(entry['target'])
                if config and (not all(config) or _endpoint(config[0]) != entry['endpoint']):
                    results[entry['target']] = {entry['phase']: {'ok': False, 'response': {'error': 'replay destination unavailable or changed'}}}
                    continue
                if not config:
                    continue
                results[entry['target']] = self._run_entry(entry, *config)
        return results

    def publish(self, payload, destinations, products_only=False, dry_run=False):
        payload = copy.deepcopy(payload)
        stamp = payload.get('dataGeneratedAt')
        try:
            generation = int(datetime.fromisoformat(stamp.replace('Z', '+00:00')).timestamp() * 1_000_000) if stamp else time.time_ns() // 1000
            if generation <= 0 or generation > 9007199254740991:
                raise ValueError()
        except (ValueError, AttributeError, TypeError):
            raise CheckpointError('Invalid publication generation') from None
        run_id = hashlib.sha256(_encoded({'generation': generation, 'payload': payload})).hexdigest()[:32]
        phase = 'products' if products_only else 'main'
        targets = {}
        def work():
            for name, url, secret in destinations:
                if name not in ('primary', 'secondary'):
                    raise CheckpointError('Invalid publication target')
                phases = {'main': {'ok': products_only, 'response': {'skipped': 'product-only'}},
                          'products': {'ok': not payload.get('products'), 'response': {'skipped': 'no products'}}}
                targets[name] = phases
                if not url or not secret:
                    phases[phase] = {'ok': False, 'response': {'error': 'destination URL/auth not configured'}}
                    continue
                if generation < self.state['latest'].get(name, 0):
                    phases[phase] = {'ok': False, 'response': {'error': 'publication superseded'}}
                    continue
                if not dry_run:
                    existing = next((e for e in self.state['entries']
                                     if e['target'] == name and e['endpoint'] == _endpoint(url)
                                     and e['payload']['publication']['runId'] == run_id), None)
                    if existing is not None:
                        if existing['phase'] == 'products' and not products_only:
                            phases['main'] = {'ok': True, 'response': {'recovered': True}}
                        phases.update(self._run_entry(existing, url, secret))
                        continue
                main = {k: v for k, v in payload.items() if k != 'products'} if not products_only else payload
                entry = {'target': name, 'endpoint': _endpoint(url), 'phase': phase, 'created': time.time(),
                         'payload': {**main, 'publication': {'version': 1, 'runId': run_id,
                             'generation': generation, 'target': name, 'phase': phase}}}
                if not products_only and payload.get('products'):
                    entry['products'] = payload['products']
                    phases['products'] = {'ok': False, 'response': {'error': 'main phase unavailable'}}
                if dry_run:
                    ok, response = self._attempt(entry, url, secret, dry_run=True)
                    phases[phase] = {'ok': ok, 'response': response}
                    if ok and entry.get('products'):
                        product_entry = {'phase': 'products', 'payload': {'products': entry['products'],
                            'publication': {**entry['payload']['publication'], 'phase': 'products'}}}
                        ok, response = self._attempt(product_entry, url, secret, dry_run=True)
                        phases['products'] = {'ok': ok, 'response': response}
                    continue
                # Each target has at most one unresolved run. New work supersedes
                # its older checkpoint; other targets are never removed here.
                self.state['entries'] = [e for e in self.state['entries'] if e['target'] != name]
                self.state['latest'][name] = generation
                self.state['entries'].append(entry)
                self._save()  # write-ahead pending phase closes process-crash gap
                phases.update(self._run_entry(entry, url, secret))
        if dry_run:
            work()
        else:
            with self._locked(): work()
        ok = all(t['main']['ok'] and t['products']['ok'] for t in targets.values())
        successes = any(p['ok'] and not p['response'].get('skipped') for t in targets.values() for p in t.values())
        return {'targets': targets, 'ok': ok, 'status': 'complete' if ok else 'partial' if successes else 'failed',
                **targets.get('primary', {})}
