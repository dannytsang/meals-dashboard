"""App002 AS-008, FR-002/003/004/005, NFR-001/002; F2 permanent regressions.

Exercise actual full/product-only commands and real fan-out/checkpoint code.
Only cache, build/enrichment, authority and transport boundaries are synthetic.
"""
import copy
import importlib
import os
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch

import pytest

sync = importlib.import_module('sync-dashboard-data')
backfill = importlib.import_module('backfill_tesco_product_metadata')
PAYLOAD = {'orders': [], 'coverage': [], 'summary': {}, 'deliveryWindows': [],
           'coverageWindow': [], 'dataGeneratedAt': '2026-09-25T00:00:00Z',
           'products': [{'productBlobPath': 'products/1.json', 'tpnc': '1', 'title': 'SYNTHETIC_PRIVATE_LABEL'}]}


def config(tmp_path, secondary, protocol):
    env = {'MEALS_PUBLICATION_PROTOCOL': protocol,
           'MEALS_PUBLICATION_STATE_DIR': str(tmp_path / 'checkpoint'),
           'DASHBOARD_DATA_API_URL': 'http://primary.invalid/api/dashboard-sync',
           'MEALS_DASHBOARD_DATA_SECRET': 'synthetic-primary-secret'}
    if secondary in ('complete', 'url-only'):
        env['MEAL_PLANNER_DASHBOARD_DATA_API_URL'] = 'http://secondary.invalid/api/dashboard-sync'
    if secondary in ('complete', 'auth-only'):
        env['MEAL_PLANNER_DASHBOARD_DATA_SECRET'] = 'synthetic-secondary-secret'
    return env


@pytest.mark.parametrize('protocol', ['0', '1'])
@pytest.mark.parametrize('secondary', ['disabled', 'complete', 'url-only', 'auth-only'])
@pytest.mark.parametrize('entrypoint', ['full', 'products'])
def test_partial_secondary_preserves_primary_and_reports_partial(tmp_path, protocol, secondary, entrypoint):
    env = config(tmp_path, secondary, protocol)
    calls = []
    def post(body, url, secret, dry_run=False):
        target = 'secondary' if 'secondary.invalid' in url else 'primary'
        assert secret == env['MEAL_PLANNER_DASHBOARD_DATA_SECRET' if target == 'secondary' else 'MEALS_DASHBOARD_DATA_SECRET']
        calls.append((target, url, copy.deepcopy(body), dry_run))
        return True, {'publicationProtocol': 1, 'manifestPath': f'meta/manifest-{target}.json',
                      'productsManifestPath': f'meta/products-manifest-{target}.json'}
    output = StringIO()
    payload = copy.deepcopy(PAYLOAD)
    with patch.dict(os.environ, env, clear=True), patch.object(sync, 'load_dashboard_env'), \
         patch.object(sync, 'post_dashboard_data_to_api', side_effect=post), redirect_stdout(output):
        if entrypoint == 'full':
            with patch.object(sync.sys, 'argv', ['sync', '--no-history', '--no-build']), \
                 patch.object(sync, 'read_dashboard_cache', return_value={'meals': []}), \
                 patch.object(sync, 'fetch_manual_overrides', return_value=[]) as authority, \
                 patch.object(sync, 'build_dashboard_payload', return_value=payload) as build, \
                 patch.object(sync, 'publish_split_dashboard_payload', wraps=sync.publish_split_dashboard_payload) as fanout:
                code = sync.main()
                if secondary == 'complete' and protocol == '0':
                    authority.assert_not_called(); build.assert_not_called(); fanout.assert_not_called()
                else:
                    authority.assert_called_once_with('http://primary.invalid/api/overrides', 'synthetic-primary-secret')
                    build.assert_called_once(); fanout.assert_called_once()
        else:
            cache = {'synthetic': {'tpnc': '1', 'title': 'SYNTHETIC_PRIVATE_LABEL',
                                   'lastFetched': '2026-09-25T00:00:00Z', 'source': 'tesco.com'}}
            with patch.object(backfill.sys, 'argv', ['backfill']), \
                 patch.object(backfill, '_read_cache', return_value=cache), \
                 patch.object(backfill, '_write_cache') as write_cache, \
                 patch.object(backfill, 'backfill_entry') as enrich:
                code = backfill.main()
                enrich.assert_not_called()
                if secondary == 'complete' and protocol == '0':
                    write_cache.assert_not_called()
                else:
                    write_cache.assert_called_once()
    text = output.getvalue()
    for private in ['synthetic-primary-secret', 'synthetic-secondary-secret',
                    'primary.invalid', 'secondary.invalid', 'SYNTHETIC_PRIVATE_LABEL']:
        assert private not in text
    assert payload == PAYLOAD
    if secondary == 'complete' and protocol == '0':
        assert code == 1 and calls == []
        assert 'requires MEALS_PUBLICATION_PROTOCOL=1' in text
        return
    writes = [(target, url, body) for target, url, body, dry in calls if not dry]
    assert any(target == 'primary' for target, _, _ in writes)
    assert {target for target, _, _, _ in calls} == ({'primary', 'secondary'} if secondary == 'complete' else {'primary'})
    partial = secondary in ('url-only', 'auth-only')
    assert code == (1 if partial else 0)
    if partial:
        assert 'secondary' in text.lower() and 'configur' in text.lower()
        assert 'PARTIAL' in text.upper()
        assert 'SYNC COMPLETE' not in text
        if entrypoint == 'full':
            assert 'normal meal report continues' in text
    if entrypoint == 'full':
        for target, url, body in writes:
            if url.endswith('dashboard-products-sync'):
                assert body['mainManifestPath'] == f'meta/manifest-{target}.json'
    else:
        assert all(url.endswith('dashboard-products-sync') and 'orders' not in body and 'mainManifestPath' not in body
                   for _, url, body in writes)


def test_complete_dual_authority_failure_remains_fail_closed(tmp_path):
    env = config(tmp_path, 'complete', '1')
    output = StringIO()
    with patch.dict(os.environ, env, clear=True), patch.object(sync, 'load_dashboard_env'), \
         patch.object(sync.sys, 'argv', ['sync', '--no-history', '--no-build']), \
         patch.object(sync, 'read_dashboard_cache', return_value={'meals': []}), \
         patch.object(sync, 'fetch_manual_overrides', return_value=None) as authority, \
         patch.object(sync, 'build_dashboard_payload') as build, \
         patch.object(sync, 'post_dashboard_data_to_api') as transport, redirect_stdout(output):
        assert sync.main() == 1
    authority.assert_called_once()
    build.assert_not_called(); transport.assert_not_called()
    assert 'authoritative Vercel override snapshot unavailable' in output.getvalue()
