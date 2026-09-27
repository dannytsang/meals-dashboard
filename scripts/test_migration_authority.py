"""Execute real wrapper functions without importing provider/config side effects."""
import ast
import copy
import importlib
import json
import logging
import os
import re
from contextlib import redirect_stdout
from io import StringIO
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
import pytest

sync = importlib.import_module('sync-dashboard-data')


def wrapper(path, cache):
    tree = ast.parse(Path(path).read_text())
    names = {'write_dashboard_cache', '_dashboard_meal_entry', '_normalise_dashboard_item', 'apply_manual_overrides', '_manual_override_matches', '_manual_override_norm', '_dashboard_overrides_to_legacy_shape'}
    body = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    ns = {'datetime': datetime, 'timezone': timezone, 'json': json, 'logging': logging, 're': re, 'copy': copy,
          'DASHBOARD_CACHE_FILE': cache, '_parse_delivery_iso': lambda x: x,
          'email_type_to_order_status': lambda x: 'active',
          '_annotate_matched_results_with_shelf_life': lambda x, **kw: x,
          'load_dashboard_overrides': lambda: [{'meal_date': '2030-01-01', 'meal_name': 'Synthetic meal', 'item_name': 'LOCAL_ONLY_SENTINEL', 'status': 'covered'}]}
    exec(compile(ast.Module(body=body, type_ignores=[]), str(path), 'exec'), ns)
    return ns


def test_actual_wrapper_empty_primary_removes_local_effects(tmp_path):
    path = os.environ['MIGRATION_WRAPPER_SOURCE']
    w = wrapper(path, tmp_path/'cache.json')
    base = [{'meal': {'id': '1', 'content': 'Synthetic meal', 'due': {'date':'2030-01-01'}}, 'status':'uncovered', 'matched_items':[], 'unmatched_items':[{'name':'Synthetic missing'}]}]
    cache = w['write_dashboard_cache'](last_matched=copy.deepcopy(base), next_matched=[], last_email={}, next_email={}, all_items=[], last_unmatched=[], next_unmatched=[], last_delivery=None, next_delivery=None, next_window_end=None)
    with patch.object(sync, 'get_ui_updated_at', return_value='2030-01-01T00:00:00Z') if hasattr(sync, 'get_ui_updated_at') else patch.object(sync, 'MAX_HISTORICAL_ORDERS', 6):
        payload = sync.build_dashboard_payload(cache, [], no_history=True)
    meal = payload['coverage'][0]['meals'][0]
    assert meal['status'] == 'missing'
    assert meal['coverageScore'] == 0
    assert meal['matchedItems'] == []
    assert cache['coverage_base_version'] == 1


def test_authority_build_is_repeatable_without_mutating_cache(tmp_path):
    w = wrapper(os.environ['MIGRATION_WRAPPER_SOURCE'], tmp_path/'cache.json')
    w['load_dashboard_overrides'] = lambda: []
    base = [{'meal': {'id':'1','content':'Synthetic meal','due':{'date':'2030-01-01'}},'status':'uncovered','matched_items':[],'unmatched_items':[]}]
    cache=w['write_dashboard_cache'](last_matched=base,next_matched=[],last_email={},next_email={},all_items=[],last_unmatched=[],next_unmatched=[],last_delivery=None,next_delivery=None,next_window_end=None)
    before=copy.deepcopy(cache)
    ov=[{'meal_date':'2030-01-01','meal_name':'Synthetic meal','item_name':'PRIMARY_ONLY_SENTINEL','status':'covered'}]
    first=sync.build_dashboard_payload(cache,ov,no_history=True)
    second=sync.build_dashboard_payload(cache,[],no_history=True)
    assert cache == before
    assert first['coverage'][0]['meals'][0]['status']=='partial'
    assert second['coverage'][0]['meals'][0]['status']=='missing'


def execute_wrapper_boundary(tmp_path):
    """Execute main's actual match→local override→cache call AST, not a model.

    Exclude provider imports, startup and report/network work. Only input matcher
    and unrelated annotation/receipt dependencies are synthetic adapters.
    """
    path = os.environ['MIGRATION_WRAPPER_SOURCE']
    w = wrapper(path, tmp_path/'cache.json')
    base = [{'meal': {'id': '1', 'content': 'Synthetic meal', 'due': {'date': '2030-01-01'}},
             'status': 'uncovered', 'matched_items': [], 'unmatched_items': [{'name': 'Missing'}]}]
    local = [{'meal': 'Synthetic meal', 'date': '2030-01-01', 'item': 'LOCAL_ONLY_SENTINEL', 'status': 'covered'}]
    legacy_reads, dashboard_reads = [], []
    w.update({'fuzzy_match_items_to_meals': lambda *a, **kw: copy.deepcopy(base),
              'build_unmatched_groceries': lambda items, matches: list(items),
              'load_manual_overrides': lambda: legacy_reads.append(1) or local,
              'load_dashboard_overrides': lambda: dashboard_reads.append(1) or local,
              'last_email_items': [], 'next_email_items': [], 'last_window_meals': [],
              'next_window_meals': [], 'MATCH_THRESHOLD': 80, 'grocy_stock': None,
              'last_email_entry': {}, 'next_email_entry': {}, 'last_delivery': None,
              'next_delivery': None, 'next_window_end': None, 'dashboard_delivery_metadata': {},
              'moved_order_status': {}})
    tree = ast.parse(Path(path).read_text())
    main = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
    def assigns(n, name):
        return isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in n.targets)
    start = next(i for i, n in enumerate(main.body) if assigns(n, 'last_matched'))
    end = next(i for i, n in enumerate(main.body[start:], start) if assigns(n, 'all_items'))
    boundary = main.body[start:end+1]
    call = next(n for n in ast.walk(main) if isinstance(n, ast.Call)
                and isinstance(n.func, ast.Name) and n.func.id == 'write_dashboard_cache')
    boundary.append(ast.Assign(targets=[ast.Name(id='boundary_cache', ctx=ast.Store())], value=call))
    exec(compile(ast.fix_missing_locations(ast.Module(body=boundary, type_ignores=[])), path, 'exec'), w)
    assert legacy_reads == [1]  # The real pre-cache legacy layer ran.
    assert w['last_matched'][0]['status'] == 'covered'
    assert w['last_matched'][0]['matched_items'][0]['item']['name'] == 'LOCAL_ONLY_SENTINEL'
    assert dashboard_reads == []  # The second local layer no longer runs.
    assert w['boundary_cache']['meals'][0]['status'] == 'missing'
    assert 'LOCAL_ONLY_SENTINEL' not in json.dumps(w['boundary_cache'])
    assert json.loads((tmp_path/'cache.json').read_text()) == w['boundary_cache']
    return w['boundary_cache']


VALID = {'meal_date': '2030-01-01', 'meal_name': 'Synthetic meal', 'item_name': 'PRIMARY_ONLY_SENTINEL',
         'quantity': 1, 'reason': 'synthetic', 'status': 'covered',
         'created_at': '2030-01-01T00:00:00Z', 'updated_at': '2030-01-01T00:00:00Z'}


class Response:
    def __init__(self, body, status=200):
        self.body, self.status = body, status
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self): return self.body.encode()


@pytest.mark.parametrize('snapshot', [[], [VALID], [{**VALID, 'cleared_at': '2030-01-02T00:00:00Z'}]])
def test_actual_wrapper_to_complete_dual_single_valid_snapshot(tmp_path, snapshot):
    cache = execute_wrapper_boundary(tmp_path)
    before = copy.deepcopy(cache)
    reads, writes = [], []
    def read(request, **kwargs):
        reads.append(request.full_url)
        return Response(json.dumps({'ok': True, 'overrides': snapshot}))
    def post(body, url, secret, dry_run=False):
        if not dry_run: writes.append(copy.deepcopy(body))
        return True, {'publicationProtocol': 1, 'manifestPath': 'meta/manifest-test.json'}
    env = {'MEALS_PUBLICATION_PROTOCOL': '1', 'MEALS_PUBLICATION_STATE_DIR': str(tmp_path/'state'),
           'DASHBOARD_DATA_API_URL': 'http://primary.invalid/api/dashboard-sync', 'MEALS_DASHBOARD_DATA_SECRET': 'synthetic-p',
           'MEAL_PLANNER_DASHBOARD_DATA_API_URL': 'http://secondary.invalid/api/dashboard-sync',
           'MEAL_PLANNER_DASHBOARD_DATA_SECRET': 'synthetic-s'}
    with patch.dict(os.environ, env, clear=True), patch.object(sync, 'load_dashboard_env'), \
         patch.object(sync.sys, 'argv', ['sync', '--no-history', '--no-build']), \
         patch.object(sync, 'read_dashboard_cache', return_value=cache), \
         patch.object(sync.urllib.request, 'urlopen', side_effect=read), \
         patch.object(sync, 'post_dashboard_data_to_api', side_effect=post), redirect_stdout(StringIO()):
        assert sync.main() == 0
    assert reads == ['http://primary.invalid/api/overrides']
    assert len(writes) == 2
    assert writes[0]['coverage'] == writes[1]['coverage']
    meal = writes[0]['coverage'][0]['meals'][0]
    active = bool(snapshot and not snapshot[0].get('cleared_at'))
    assert meal['status'] == ('partial' if active else 'missing')
    assert meal['coverageScore'] == (50 if active else 0)
    assert len(meal['matchedItems']) == (1 if active else 0)
    assert 'LOCAL_ONLY_SENTINEL' not in json.dumps(writes)
    assert cache == before


@pytest.mark.parametrize('body,status', [
    ('{"ok":true,"overrides":[]}', 500), ('{"ok":false,"overrides":[]}', 200),
    ('{"overrides":[]}', 200), ('[]', 200), ('{bad PRIVATE_PAYLOAD_SENTINEL', 200),
    (json.dumps({'ok': True, 'overrides': [{}]}), 200),
    (json.dumps({'ok': True, 'overrides': [VALID, VALID]}), 200),
    (json.dumps({'ok': True, 'overrides': [{**VALID, 'quantity': True}]}), 200),
    (json.dumps({'ok': True, 'overrides': [{**VALID, 'quantity': float('nan')}]}), 200),
    (json.dumps({'ok': True, 'overrides': [{**VALID, 'meal_date': '2030-02-30'}]}), 200),
    (json.dumps({'ok': True, 'overrides': [{**VALID, 'status': 'PRIVATE_PAYLOAD_SENTINEL'}]}), 200),
])
def test_complete_dual_bad_authority_never_builds_or_publishes(tmp_path, body, status):
    output = StringIO()
    env = {'MEALS_PUBLICATION_PROTOCOL': '1', 'DASHBOARD_DATA_API_URL': 'http://primary.invalid/api/dashboard-sync',
           'MEALS_DASHBOARD_DATA_SECRET': 'synthetic-p', 'MEAL_PLANNER_DASHBOARD_DATA_API_URL': 'http://secondary.invalid/api/dashboard-sync',
           'MEAL_PLANNER_DASHBOARD_DATA_SECRET': 'synthetic-s'}
    with patch.dict(os.environ, env, clear=True), patch.object(sync, 'load_dashboard_env'), \
         patch.object(sync.sys, 'argv', ['sync', '--no-history', '--no-build']), \
         patch.object(sync, 'read_dashboard_cache', return_value={'meals': [], 'coverage_base_version': 1}), \
         patch.object(sync.urllib.request, 'urlopen', return_value=Response(body, status)) as read, \
         patch.object(sync, 'build_dashboard_payload') as build, \
         patch.object(sync, 'post_dashboard_data_to_api') as post, redirect_stdout(output):
        assert sync.main() == 1
    assert read.call_count == 1
    build.assert_not_called(); post.assert_not_called()
    assert 'PRIVATE_PAYLOAD_SENTINEL' not in output.getvalue()


@pytest.mark.parametrize('version', [None, 0, '1', True, 2])
def test_complete_dual_unversioned_cache_refused_before_read_or_publish(version):
    env = {'MEALS_PUBLICATION_PROTOCOL': '1', 'MEAL_PLANNER_DASHBOARD_DATA_API_URL': 'http://secondary.invalid/api/dashboard-sync',
           'MEAL_PLANNER_DASHBOARD_DATA_SECRET': 'synthetic-s'}
    cache = {'meals': []}
    if version is not None: cache['coverage_base_version'] = version
    with patch.dict(os.environ, env, clear=True), patch.object(sync, 'load_dashboard_env'), \
         patch.object(sync.sys, 'argv', ['sync', '--no-history', '--no-build']), \
         patch.object(sync, 'read_dashboard_cache', return_value=cache), \
         patch.object(sync, 'fetch_manual_overrides') as read, \
         patch.object(sync, 'build_dashboard_payload') as build, \
         patch.object(sync, 'post_dashboard_data_to_api') as post, redirect_stdout(StringIO()):
        assert sync.main() == 1
    read.assert_not_called(); build.assert_not_called(); post.assert_not_called()
