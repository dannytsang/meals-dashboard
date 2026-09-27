"""Real producer/replay fault boundaries; synthetic idempotent transport only."""
import copy
import importlib
import json
import os
import subprocess
import sys
from pathlib import Path
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch

import pytest
from publication_recovery import RecoveryPublisher, CheckpointError

sync = importlib.import_module('sync-dashboard-data')
backfill = importlib.import_module('backfill_tesco_product_metadata')
DEST = [('primary', 'http://primary.invalid/api/dashboard-sync', 'synthetic-p'),
        ('secondary', 'http://secondary.invalid/api/dashboard-sync', 'synthetic-s')]
PAYLOAD = {'orders': [], 'coverage': [], 'summary': {}, 'deliveryWindows': [],
           'coverageWindow': [], 'dataGeneratedAt': '2030-01-01T00:00:00Z',
           'products': [{'productBlobPath': 'products/1.json', 'title': 'PAYLOAD_SENTINEL'}]}
HOSTILE = 'PRIVATE_ERROR_SENTINEL https://user:password@private.invalid/?token=secret'


class Server:
    def __init__(self):
        self.requests = []
        self.committed = {}
        self.effects = []

    def post(self, body, url, secret, dry_run=False):
        identity = body['publication']
        key = (identity['runId'], identity['target'], identity['phase'])
        if not dry_run:
            self.requests.append(key)
            if key not in self.committed:
                self.effects.append(key)
                self.committed[key] = copy.deepcopy(body)
        return True, {'publicationProtocol': 1,
                      'manifestPath': 'meta/manifest-synthetic.json',
                      'productsManifestPath': 'meta/products-manifest-synthetic.json'}


def inject_save(publisher, position, after):
    save = publisher._save
    calls = []
    def fault():
        calls.append(1)
        if len(calls) == position and not after:
            raise OSError(HOSTILE)
        save()
        if len(calls) == position and after:
            raise OSError(HOSTILE)
    publisher._save = fault
    return calls


def assert_known(result, server):
    for _, target, phase in server.requests:
        assert result['targets'][target][phase]['ok'], (target, phase, result)
    assert result['checkpoint'] == {'ok': False, 'error': 'publication checkpoint unavailable'}
    assert result['ok'] is False
    assert result['status'] == ('partial' if server.requests else 'failed')
    assert 'PRIVATE_ERROR_SENTINEL' not in json.dumps(result)
    assert 'PAYLOAD_SENTINEL' not in json.dumps(result)


@pytest.mark.parametrize('after', [False, True], ids=['before-save', 'after-save'])
@pytest.mark.parametrize('position', range(1, 9))
def test_full_entrypoint_each_save_preserves_ack_and_restart(tmp_path, position, after):
    server = Server()
    publisher = RecoveryPublisher(tmp_path/'state', server.post)
    saves = inject_save(publisher, position, after)
    with patch.dict(os.environ, {'MEALS_PUBLICATION_PROTOCOL': '1'}), \
         patch.object(sync, 'recovery_publisher', return_value=publisher):
        result = sync.publish_split_dashboard_payload(PAYLOAD, DEST[0][1], DEST[0][2],
                    secondary_url=DEST[1][1], secondary_secret=DEST[1][2])
    assert len(saves) == position
    assert_known(result, server)
    old = set(server.effects)
    restarted = RecoveryPublisher(tmp_path/'state', server.post)
    restarted.replay(DEST)
    restarted.replay(DEST)
    assert len(server.effects) == len(set(server.effects))
    assert old <= set(server.effects)
    assert json.loads((tmp_path/'state/pending.json').read_text())['entries'] == []
    assert all(key[0] == server.requests[0][0] for key in server.requests) if server.requests else True


@pytest.mark.parametrize('after', [False, True])
@pytest.mark.parametrize('position', range(1, 5))
def test_product_adapter_each_save_preserves_checkpoint(tmp_path, position, after):
    server = Server()
    publisher = RecoveryPublisher(tmp_path/'state', server.post)
    saves = inject_save(publisher, position, after)
    with patch.dict(os.environ, {'MEALS_PUBLICATION_PROTOCOL': '1'}), \
         patch.object(sync, 'recovery_publisher', return_value=publisher):
        result = backfill._publish_products_to_targets({'products': PAYLOAD['products']}, DEST)
    assert len(saves) == position
    for _, target, _ in server.requests:
        assert result[target]['ok'] is True
    assert all(r['checkpoint'] == {'ok': False, 'error': 'publication checkpoint unavailable'} for r in result.values())
    assert 'PRIVATE_ERROR_SENTINEL' not in json.dumps(result)
    restarted = RecoveryPublisher(tmp_path/'state', server.post)
    restarted.replay(DEST)
    restarted.replay(DEST)
    assert len(server.effects) == len(set(server.effects))
    assert all(key[2] == 'products' for key in server.requests)


@pytest.mark.parametrize('after', [False, True])
@pytest.mark.parametrize('position', range(1, 8))
def test_replay_each_save_preserves_ack_and_identity(tmp_path, position, after):
    failed = lambda *a, **k: (False, {'error': 'synthetic unavailable'})
    RecoveryPublisher(tmp_path/'state', failed).publish(PAYLOAD, DEST)
    server = Server()
    publisher = RecoveryPublisher(tmp_path/'state', server.post)
    saves = inject_save(publisher, position, after)
    try:
        result = publisher.replay(DEST)
    except CheckpointError:
        assert not server.requests
    else:
        assert_known(result, server)
    assert len(saves) == position
    restarted = RecoveryPublisher(tmp_path/'state', server.post)
    restarted.replay(DEST)
    restarted.replay(DEST)
    assert len(server.effects) == 4
    assert len(server.effects) == len(set(server.effects))
    assert len({key[0] for key in server.requests}) == 1
    assert json.loads((tmp_path/'state/pending.json').read_text())['entries'] == []


@pytest.mark.parametrize('raise_error', [False, True])
@pytest.mark.parametrize('preflight', [False, True])
def test_hostile_transport_after_primary_does_not_erase_success(tmp_path, raise_error, preflight):
    server = Server()
    def post(body, url, secret, dry_run=False):
        if body['publication']['target'] == 'secondary' and (preflight or not dry_run):
            if raise_error:
                raise RuntimeError(HOSTILE)
            return False, {'error': HOSTILE, 'status': 403, 'payload': PAYLOAD}
        return server.post(body, url, secret, dry_run)
    result = RecoveryPublisher(tmp_path/'state', post).publish(PAYLOAD, DEST)
    assert result['targets']['primary']['main']['ok']
    assert result['targets']['primary']['products']['ok']
    assert not result['targets']['secondary']['main']['ok']
    assert result['status'] == 'partial'
    assert HOSTILE not in json.dumps(result)
    assert 'PAYLOAD_SENTINEL' not in json.dumps(result)


def test_backfill_cli_checkpoint_failure_is_not_complete(tmp_path):
    server = Server()
    publisher = RecoveryPublisher(tmp_path/'state', server.post)
    inject_save(publisher, 2, False)
    output = StringIO()
    cache = {'synthetic': {'tpnc': '1', 'source': 'tesco.com', 'lastFetched': '2030-01-01T00:00:00Z'}}
    with patch.dict(os.environ, {'MEALS_PUBLICATION_PROTOCOL': '1',
                 'DASHBOARD_DATA_API_URL': DEST[0][1], 'MEALS_DASHBOARD_DATA_SECRET': DEST[0][2]}, clear=True), \
         patch.object(sync, 'load_dashboard_env'), patch.object(sync, 'recovery_publisher', return_value=publisher), \
         patch.object(backfill, '_read_cache', return_value=cache), patch.object(backfill, '_write_cache'), \
         patch.object(backfill.sys, 'argv', ['backfill']), redirect_stdout(output):
        assert backfill.main() == 1
    assert 'Publication: complete' not in output.getvalue()
    assert 'checkpoint unavailable' in output.getvalue().lower()
    assert len(server.effects) == 1


def test_replay_cli_reports_known_phase_and_checkpoint_failure(tmp_path):
    RecoveryPublisher(tmp_path/'state', lambda *a, **k: (False, {})).publish(PAYLOAD, DEST[:1])
    server = Server()
    publisher = RecoveryPublisher(tmp_path/'state', server.post)
    inject_save(publisher, 2, False)
    output = StringIO()
    with patch.dict(os.environ, {'MEALS_PUBLICATION_PROTOCOL': '1',
                'DASHBOARD_DATA_API_URL': DEST[0][1], 'MEALS_DASHBOARD_DATA_SECRET': DEST[0][2]}, clear=True), \
         patch.object(sync, 'load_dashboard_env'), patch.object(sync, 'recovery_publisher', return_value=publisher), \
         patch.object(sync.sys, 'argv', ['sync', '--replay-publication']), redirect_stdout(output):
        assert sync.main() == 1
    assert 'primary: main=ok' in output.getvalue()
    assert 'checkpoint unavailable' in output.getvalue().lower()
    assert HOSTILE not in output.getvalue()


@pytest.mark.parametrize('products_only', [False, True])
def test_fault_then_real_process_restart_preserves_server_identity(tmp_path, products_only):
    # The synthetic server ledger outlives both client processes. Record every
    # request separately from unique committed effects to prove replay dedup.
    code = '''
import json, sys
from pathlib import Path
from publication_recovery import RecoveryPublisher
root = Path(sys.argv[1])
ledger_path = root / 'server.json'
def post(body, url, secret, dry_run=False):
    if not dry_run:
        ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {'requests': [], 'effects': []}
        p = body['publication']
        key = [p['runId'], p['target'], p['phase']]
        ledger['requests'].append(key)
        if key not in ledger['effects']: ledger['effects'].append(key)
        ledger_path.write_text(json.dumps(ledger))
    return True, {'publicationProtocol': 1, 'manifestPath': 'meta/manifest-synthetic.json'}
p = RecoveryPublisher(root / 'checkpoint', post)
dest = [('primary', 'http://primary.invalid/api/dashboard-sync', 'synthetic')]
if sys.argv[2] == 'fault':
    original = p._save
    count = [0]
    def save():
        count[0] += 1
        if count[0] == 2: raise OSError('PRIVATE_ERROR_SENTINEL')
        original()
    p._save = save
    result = p.publish({'dataGeneratedAt': '2030-01-01T00:00:00Z', 'products': [{'productBlobPath': 'products/1.json'}]}, dest, products_only=sys.argv[3] == '1')
else:
    result = p.replay(dest)
print(json.dumps(result))
'''
    args = [sys.executable, '-B', '-c', code, str(tmp_path)]
    first = subprocess.run(args + ['fault', str(int(products_only))], cwd=Path(__file__).parent,
                           capture_output=True, text=True, check=True)
    failed = json.loads(first.stdout)
    assert failed['status'] == 'partial'
    assert failed['checkpoint']['ok'] is False
    assert 'PRIVATE_ERROR_SENTINEL' not in first.stdout + first.stderr
    for _ in range(2):
        done = subprocess.run(args + ['replay'], cwd=Path(__file__).parent,
                              capture_output=True, text=True, check=True)
        assert json.loads(done.stdout)['ok'] is True
    ledger = json.loads((tmp_path/'server.json').read_text())
    assert len(ledger['effects']) == (1 if products_only else 2)
    assert len(ledger['requests']) == len(ledger['effects']) + 1  # one ambiguous ack replayed
    assert len({request[0] for request in ledger['requests']}) == 1
