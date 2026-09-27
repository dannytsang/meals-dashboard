"""AS-018: selected legacy compatibility policy at the actual client boundary."""
import copy
import json
import os
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch
import pytest
from test_publication_config_isolation import sync, config, PAYLOAD
from test_migration_authority import Response, VALID


@pytest.mark.parametrize('mode', ['disabled', 'complete', 'url-only', 'auth-only'])
@pytest.mark.parametrize('snapshot', [None, [], [VALID]])
def test_selected_mode_policy(tmp_path, mode, snapshot):
    env = config(tmp_path, mode, '1')
    output, writes = StringIO(), []
    def post(body, url, secret, dry_run=False):
        if not dry_run: writes.append(('secondary' if 'secondary.invalid' in url else 'primary', copy.deepcopy(body)))
        return True, {'publicationProtocol': 1, 'manifestPath': 'meta/manifest-synthetic.json'}
    response = Response(json.dumps({'ok': snapshot is not None, 'overrides': snapshot or []}), 500 if snapshot is None else 200)
    with patch.dict(os.environ, env, clear=True), patch.object(sync, 'load_dashboard_env'), \
         patch.object(sync.sys, 'argv', ['sync', '--no-history', '--no-build']), \
         patch.object(sync, 'read_dashboard_cache', return_value={'meals': [], 'coverage_base_version': 1}), \
         patch.object(sync.urllib.request, 'urlopen', return_value=response) as read, \
         patch.object(sync, 'build_dashboard_payload', return_value={**PAYLOAD, 'products': []}) as build, \
         patch.object(sync, 'post_dashboard_data_to_api', side_effect=post), redirect_stdout(output):
        result = sync.main()
    assert read.call_count == 1
    text = output.getvalue()
    if snapshot is None and mode == 'complete':
        assert result == 1 and writes == []
        build.assert_not_called()
    else:
        build.assert_called_once()
        assert build.call_args.args[1] == (snapshot or [])
        assert {target for target, _ in writes} == ({'primary', 'secondary'} if mode == 'complete' else {'primary'})
        assert result == (1 if mode in ('url-only', 'auth-only') else 0)
    if snapshot is None:
        assert 'Manual overrides from authoritative source:' not in text
        if mode != 'complete': assert 'without an override snapshot' in text
    else:
        assert f'Manual overrides from authoritative source: {len(snapshot)}' in text
    if mode in ('url-only', 'auth-only'):
        assert 'Secondary publication requires both' in text and 'PARTIAL' in text
    for private in ['synthetic-primary-secret', 'synthetic-secondary-secret', 'primary.invalid', 'secondary.invalid', 'PRIMARY_ONLY_SENTINEL']:
        assert private not in text
