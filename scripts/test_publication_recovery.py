import json
import multiprocessing
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from publication_recovery import RecoveryPublisher, CheckpointError

PAYLOAD = {'orders': [], 'coverage': [], 'summary': {}, 'deliveryWindows': [], 'coverageWindow': [],
           'dataGeneratedAt': '2026-09-25T00:00:00+00:00', 'products': [{'productBlobPath': 'products/1.json'}]}
DEST = [('primary', 'http://synthetic/api/dashboard-sync', 'synthetic-auth')]


def concurrent_writer(root, index):
    def post(body, url, secret, dry_run=False):
        return False, {'error': 'HTTP 503'}
    RecoveryPublisher(root, post).publish({**PAYLOAD, 'dataGeneratedAt': f'2026-09-25T00:00:0{index}+00:00'}, DEST)


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'private'
        self.calls = []

    def tearDown(self):
        self.temp.cleanup()

    def post(self, body, url, secret, dry_run=False):
        self.calls.append((body, url, dry_run))
        return True, {'manifestPath': 'meta/manifest-fixture.json', 'productsManifestPath': 'meta/products-manifest-fixture.json', 'publicationProtocol': 1}

    def test_product_failure_restart_replays_only_failed_phase_and_own_manifest(self):
        def fail_products(body, url, secret, dry_run=False):
            if 'dashboard-products' in url and not dry_run:
                return False, {'error': 'HTTP 503'}
            return self.post(body, url, secret, dry_run)
        first = RecoveryPublisher(self.root, fail_products).publish(PAYLOAD, DEST)
        self.assertTrue(first['targets']['primary']['main']['ok'])
        state = json.loads((self.root / 'pending.json').read_text())
        self.assertEqual([e['phase'] for e in state['entries']], ['products'])
        self.calls.clear()
        RecoveryPublisher(self.root, self.post).replay(DEST)
        self.assertTrue(self.calls)
        self.assertTrue(all('/dashboard-products-sync' in c[1] for c in self.calls))
        self.assertEqual(self.calls[0][0]['mainManifestPath'], 'meta/manifest-fixture.json')
        self.assertEqual(json.loads((self.root / 'pending.json').read_text())['entries'], [])

    def test_private_bounded_no_auth_and_corrupt_fail_closed(self):
        def fail(*args, **kwargs): return False, {'error': 'HTTP 503'}
        RecoveryPublisher(self.root, fail).publish(PAYLOAD, DEST)
        self.assertEqual(self.root.stat().st_mode & 0o777, 0o700)
        for path in self.root.iterdir(): self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertNotIn('synthetic-auth', (self.root / 'pending.json').read_text())
        (self.root / 'pending.json').write_text('{private-corrupt')
        with self.assertRaisesRegex(CheckpointError, '^Publication checkpoint unavailable$'):
            RecoveryPublisher(self.root, self.post).replay(DEST)
        self.assertFalse(self.calls)

    def test_real_process_restart_and_concurrent_checkpoint_writers(self):
        processes = [multiprocessing.Process(target=concurrent_writer, args=(self.root, i)) for i in range(4)]
        for p in processes: p.start()
        for p in processes: p.join(15); self.assertEqual(p.exitcode, 0)
        state = json.loads((self.root / 'pending.json').read_text())
        self.assertEqual(len(state['entries']), 1)
        self.assertIn('00:00:03', state['entries'][0]['payload']['dataGeneratedAt'])
        code = "from publication_recovery import RecoveryPublisher; import sys; p=RecoveryPublisher(sys.argv[1],lambda *a,**k:(True,{'publicationProtocol':1,'manifestPath':'meta/manifest-test.json'})); p.replay([('primary','http://synthetic/api/dashboard-sync','new-synthetic-auth')])"
        done = subprocess.run([sys.executable, '-c', code, str(self.root)], cwd=Path(__file__).parent, capture_output=True)
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual(json.loads((self.root / 'pending.json').read_text())['entries'], [])

    def test_primary_failure_does_not_stop_secondary_and_outcomes_are_correct(self):
        both = DEST + [('secondary', 'http://second/api/dashboard-sync', 'synthetic-secondary-auth')]
        def primary_failed(body, url, secret, dry_run=False):
            if 'synthetic/api' in url: return False, {'error': 'HTTP 503'}
            return self.post(body, url, secret, dry_run)
        result = RecoveryPublisher(self.root, primary_failed).publish(PAYLOAD, both)
        self.assertEqual(result['status'], 'partial')
        self.assertFalse(result['targets']['primary']['main']['ok'])
        self.assertTrue(result['targets']['secondary']['products']['ok'])
        def failed(*a, **k): return False, {'error': 'HTTP 503'}
        result = RecoveryPublisher(self.root, failed).publish({k:v for k,v in PAYLOAD.items() if k != 'products'}, both)
        self.assertEqual(result['status'], 'failed')

    def test_legacy_server_is_never_retried_or_written_without_protocol(self):
        def old(body, url, secret, dry_run=False):
            self.calls.append(dry_run)
            return True, {'manifestPath': 'legacy'}
        result = RecoveryPublisher(self.root, old).publish(PAYLOAD, DEST)
        self.assertFalse(result['ok'])
        self.assertTrue(all(self.calls))

    def test_timeout_retry_same_identity_and_new_generation_supersedes(self):
        attempts = []
        def timeout(body, url, secret, dry_run=False):
            if dry_run: return True, {'publicationProtocol': 1}
            attempts.append(body)
            return False, {'error': 'request failed (TimeoutError)'}
        RecoveryPublisher(self.root, timeout).publish(PAYLOAD, DEST)
        self.assertEqual(attempts[0], attempts[1])
        newer = {**PAYLOAD, 'dataGeneratedAt': '2026-09-26T00:00:00+00:00'}
        RecoveryPublisher(self.root, self.post).publish(newer, DEST)
        self.assertEqual(json.loads((self.root / 'pending.json').read_text())['entries'], [])
    def test_retention_caps_endpoint_change_and_dry_run(self):
        from unittest.mock import patch
        import publication_recovery as recovery
        def fail(*args, **kwargs): return False, {'error': 'HTTP 503'}
        RecoveryPublisher(self.root, fail).publish(PAYLOAD, DEST)
        state = json.loads((self.root / 'pending.json').read_text())
        state['entries'][0]['created'] -= recovery.MAX_AGE + 1
        (self.root / 'pending.json').write_text(json.dumps(state))
        (self.root / '.pending-abandoned').write_text('synthetic-private')
        RecoveryPublisher(self.root, self.post).replay(DEST)
        self.assertEqual(self.calls, [])
        self.assertFalse((self.root / '.pending-abandoned').exists())
        self.assertEqual(json.loads((self.root / 'pending.json').read_text())['entries'], [])
        with patch.object(recovery, 'MAX_BYTES', 100):
            with self.assertRaises(CheckpointError):
                RecoveryPublisher(self.root, self.post).publish(PAYLOAD, DEST)
        self.assertEqual(self.calls, [])
        RecoveryPublisher(self.root, fail).publish(PAYLOAD, DEST)
        RecoveryPublisher(self.root, self.post).replay([('primary', 'http://changed/api/dashboard-sync', 'new-auth')])
        self.assertEqual(self.calls, [])
        state = json.loads((self.root / 'pending.json').read_text())
        state['entries'] *= 9
        (self.root / 'pending.json').write_text(json.dumps(state))
        with self.assertRaises(CheckpointError): RecoveryPublisher(self.root, self.post).replay(DEST)
        dry_root = self.root / 'dry-run'
        RecoveryPublisher(dry_root, self.post).publish(PAYLOAD, DEST, dry_run=True)
        self.assertFalse(dry_root.exists())
        self.assertTrue(all(c[2] for c in self.calls))

    def test_same_run_forward_restart_uses_product_checkpoint_without_main(self):
        def fail_products(body, url, secret, dry_run=False):
            if 'dashboard-products' in url: return False, {'error': 'HTTP 503'}
            return self.post(body, url, secret, dry_run)
        RecoveryPublisher(self.root, fail_products).publish(PAYLOAD, DEST)
        self.calls.clear()
        result = RecoveryPublisher(self.root, self.post).publish(PAYLOAD, DEST)
        self.assertTrue(result['ok'])
        self.assertTrue(all('dashboard-products' in c[1] for c in self.calls))

    def test_checkpoint_symlink_refused_and_product_only_has_no_dashboard_fields(self):
        self.root.mkdir()
        target = self.root.parent / 'unrelated'
        target.write_text('synthetic')
        (self.root / 'pending.json').symlink_to(target)
        with self.assertRaises(CheckpointError): RecoveryPublisher(self.root, self.post).replay(DEST)
        self.assertEqual(target.read_text(), 'synthetic')
        (self.root / 'pending.json').unlink()
        result = RecoveryPublisher(self.root, self.post).publish({'products': PAYLOAD['products']}, DEST, products_only=True)
        self.assertTrue(result['ok'])
        self.assertTrue(all(set(c[0]) == {'products', 'publication'} for c in self.calls))


if __name__ == '__main__': unittest.main()
