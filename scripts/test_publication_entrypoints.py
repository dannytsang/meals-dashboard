import importlib
from contextlib import redirect_stdout
from io import StringIO
import os
import tempfile
import unittest
from unittest.mock import patch

sync = importlib.import_module('sync-dashboard-data')
backfill = importlib.import_module('backfill_tesco_product_metadata')


class EntryPointTests(unittest.TestCase):
    def test_legacy_enrichment_labels_are_not_logged_by_dual_processing(self):
        output = StringIO()
        with patch.dict(os.environ, {'MEALS_PUBLICATION_PROTOCOL': '1'}), redirect_stdout(output):
            with sync.private_processing_output():
                print('SYNTHETIC_PRIVATE_SENTINEL')
        self.assertEqual(output.getvalue(), '')

    def test_one_authoritative_snapshot_one_build_and_one_fanout_and_fail_closed(self):
        snapshot = [{'meal_date': '2026-09-25', 'meal_name': 'Synthetic', 'item_name': 'Synthetic'}]
        payload = {'orders': [], 'coverage': [], 'summary': {}, 'deliveryWindows': [], 'coverageWindow': [], 'products': []}
        result = {'ok': True, 'main': {'ok': True, 'response': {}}, 'products': {'ok': True, 'response': {}},
                  'targets': {'primary': {'main': {'ok': True, 'response': {}}, 'products': {'ok': True, 'response': {}}}}}
        env = {'MEALS_PUBLICATION_PROTOCOL': '1', 'DASHBOARD_DATA_API_URL': 'http://primary/api/dashboard-sync',
               'MEALS_DASHBOARD_DATA_SECRET': 'synthetic-p', 'MEAL_PLANNER_DASHBOARD_DATA_API_URL': 'http://secondary/api/dashboard-sync',
               'MEAL_PLANNER_DASHBOARD_DATA_SECRET': 'synthetic-s'}
        for authority in [snapshot, None]:
            with patch.dict(os.environ, env, clear=True), patch.object(sync, 'load_dashboard_env'), \
                 patch.object(sync.sys, 'argv', ['sync', '--no-history', '--no-build']), \
                 patch.object(sync, 'read_dashboard_cache', return_value={'meals': []}), \
                 patch.object(sync, 'fetch_manual_overrides', return_value=authority) as fetch, \
                 patch.object(sync, 'build_dashboard_payload', return_value=payload) as build, \
                 patch.object(sync, 'publish_split_dashboard_payload', return_value=result) as publish, \
                 patch.object(sync, 'fetch_meal_plan') as collect, redirect_stdout(StringIO()):
                self.assertEqual(sync.main(), 0 if authority is not None else 1)
                fetch.assert_called_once_with('http://primary/api/overrides', 'synthetic-p')
                collect.assert_not_called()
                if authority is not None:
                    self.assertEqual(build.call_count, 1)
                    self.assertIs(build.call_args.args[1], snapshot)
                    self.assertEqual(publish.call_count, 1)
                    self.assertIs(publish.call_args.args[0], payload)
                else:
                    build.assert_not_called(); publish.assert_not_called()

    def test_normal_and_backfill_entrypoints_use_durable_protocol_and_target_bindings(self):
        with tempfile.TemporaryDirectory() as root:
            calls = []
            def post(body, url, secret, dry_run=False):
                calls.append((body, url, dry_run))
                return True, {'publicationProtocol': 1, 'manifestPath': 'meta/manifest-' + ('p' if 'primary' in url else 's') + '.json', 'productsManifestPath': 'meta/products-manifest-fixture.json'}
            env = {'MEALS_PUBLICATION_PROTOCOL': '1', 'MEALS_PUBLICATION_STATE_DIR': root}
            destinations = [('primary', 'http://primary/api/dashboard-sync', 'p'), ('secondary', 'http://secondary/api/dashboard-sync', 's')]
            with patch.dict(os.environ, env, clear=True), patch.object(sync, 'post_dashboard_data_to_api', side_effect=post):
                payload = {'orders': [], 'coverage': [], 'summary': {}, 'deliveryWindows': [], 'coverageWindow': [], 'products': [{'productBlobPath': 'products/1.json'}]}
                result = sync.publish_split_dashboard_payload(payload, destinations[0][1], 'p', secondary_url=destinations[1][1], secondary_secret='s')
                self.assertTrue(result['ok'])
                mains = [body for body, url, dry in calls if url.endswith('dashboard-sync') and not dry]
                self.assertEqual(len(mains), 2)
                self.assertEqual(mains[0]['publication']['runId'], mains[1]['publication']['runId'])
                self.assertEqual({k:v for k,v in mains[0].items() if k != 'publication'}, {k:v for k,v in mains[1].items() if k != 'publication'})
                for body, url, dry in calls:
                    if 'dashboard-products-sync' in url:
                        self.assertEqual(body['mainManifestPath'], 'meta/manifest-' + ('p' if 'primary' in url else 's') + '.json')
                calls.clear()
                self.assertTrue(all(v['ok'] for v in backfill._publish_products_to_targets({'products': payload['products']}, destinations).values()))
                self.assertTrue(all('orders' not in body and 'mainManifestPath' not in body for body, _, _ in calls))


if __name__ == '__main__': unittest.main()
