#!/usr/bin/env python3
"""Unit tests for spec 027 Rev 2 Firecrawl sync-time tier.

Tests scripts/sync-dashboard-data.py:_fetch_firecrawl_search_snippet
in isolation. Mocks urllib.request.urlopen and verifies:
  - FR-002: only /v1/search is called (never /v1/scrape).
  - FR-003: query contains 'site:tesco.com' AND the cleaned item name.
  - FR-004: successful search returns outcome='ok' with the snippet.
  - FR-005: MEALS_FIRECRAWL_FALLBACK off → outcome='disabled'.
  - FR-007: missing FIRECRAWL_API_KEY → outcome='no_key'.
  - FR-009: HTTP errors return outcome='http_error' with status code.
  - FR-016: malformed JSON returns outcome='malformed'.
  - Zero hits → outcome='not_found'.
  - Network errors → outcome='error'.
  - FR-011: stdlib only (urllib, json, datetime).

Run with: python3 scripts/test_firecrawl_search.py
"""

import json
import os
import sys
import unittest
from datetime import datetime, timezone
from unittest import mock

# Make the scripts directory importable
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

# The module is named `sync-dashboard-data.py` (with a hyphen) so
# Python's import system cannot resolve it as a bare module name. Load
# it explicitly via importlib under a synthetic name.
import importlib.util

_MODULE_PATH = os.path.join(SCRIPTS_DIR, 'sync-dashboard-data.py')
_SPEC = importlib.util.spec_from_file_location('sync_dashboard_data', _MODULE_PATH)
sync_dashboard_data = importlib.util.module_from_spec(_SPEC)
sys.modules['sync_dashboard_data'] = sync_dashboard_data

# Module import has side effects (sets up paths). Patch out the env
# vars that would otherwise fail in a unit-test environment (no Gmail
# creds, no Vercel Blob credentials).
with mock.patch.dict(os.environ, {
    'BLOB_READ_WRITE_TOKEN': '',
    'BLOB_STORE_ID': '',
    'MEALS_DASHBOARD_DATA_SECRET': '',
    'DASHBOARD_DATA_API_URL': '',
    'MEALS_DEBUG_MODE': '0',
}, clear=False):
    _SPEC.loader.exec_module(sync_dashboard_data)

sdd = sync_dashboard_data


class FakeResponse:
    """Minimal context-manager-compatible stand-in for urllib response."""

    def __init__(self, status: int = 200, body: bytes = b'{}', headers=None):
        self.status = status
        self._body = body
        self.headers = headers or {}

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        return False


def _ok_body(snippet: str) -> bytes:
    return json.dumps({
        'success': True,
        'data': [
            {'url': 'https://example.com/x', 'title': 'Tesco X', 'description': snippet},
        ],
        'id': 'fake-id',
    }).encode('utf-8')


def _empty_body() -> bytes:
    return json.dumps({'success': True, 'data': []}).encode('utf-8')


class FirecrawlSearchSyncTests(unittest.TestCase):
    """Spec 027 Rev 2 / FR-016: vitest-like coverage for the Python sync-tier function."""

    def setUp(self):
        # Reset module-level mutable state
        sdd._missing_firecrawl_key_warned = False
        # Snapshot env
        self._saved = {}
        for key in (
            sdd.MEALS_FIRECRAWL_FALLBACK_ENV,
            sdd.FIRECRAWL_API_KEY_ENV,
            'MEALS_PRODUCT_ENRICHMENT_TIMEOUT_SECONDS',
            'MEALS_PRODUCT_ENRICHMENT_DELAY_SECONDS',
            'MEALS_PRODUCT_ENRICHMENT_MAX_AGE_DAYS',
        ):
            self._saved[key] = os.environ.get(key)
        for key in self._saved:
            os.environ.pop(key, None)

    def tearDown(self):
        for key, value in self._saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        sdd._missing_firecrawl_key_warned = False

    # --- FR-005: disabled by default ---

    def test_disabled_by_default(self):
        """MEALS_FIRECRAWL_FALLBACK unset → outcome='disabled'."""
        with mock.patch.object(sdd.urllib.request, 'urlopen') as mock_urlopen:
            result = sdd._fetch_firecrawl_search_snippet('Tesco Milk')
        self.assertEqual(result['outcome'], 'disabled')
        mock_urlopen.assert_not_called()

    def test_disabled_when_zero(self):
        """MEALS_FIRECRAWL_FALLBACK=0 → outcome='disabled'."""
        os.environ[sdd.MEALS_FIRECRAWL_FALLBACK_ENV] = '0'
        os.environ[sdd.FIRECRAWL_API_KEY_ENV] = 'fc-test-key'
        with mock.patch.object(sdd.urllib.request, 'urlopen') as mock_urlopen:
            result = sdd._fetch_firecrawl_search_snippet('Tesco Milk')
        self.assertEqual(result['outcome'], 'disabled')
        mock_urlopen.assert_not_called()

    # --- FR-007: missing API key ---

    def test_missing_api_key(self):
        """MEALS_FIRECRAWL_FALLBACK=1 but no FIRECRAWL_API_KEY → outcome='no_key'."""
        os.environ[sdd.MEALS_FIRECRAWL_FALLBACK_ENV] = '1'
        with mock.patch.object(sdd.urllib.request, 'urlopen') as mock_urlopen:
            result = sdd._fetch_firecrawl_search_snippet('Tesco Milk')
        self.assertEqual(result['outcome'], 'no_key')
        mock_urlopen.assert_not_called()

    def test_missing_api_key_warns_once(self):
        """The 'missing key' warning is logged once per process, not per call."""
        os.environ[sdd.MEALS_FIRECRAWL_FALLBACK_ENV] = '1'
        with mock.patch.object(sdd.urllib.request, 'urlopen'), \
             mock.patch('builtins.print') as mock_print:
            sdd._fetch_firecrawl_search_snippet('Tesco Milk')
            sdd._fetch_firecrawl_search_snippet('Tesco Eggs')
            sdd._fetch_firecrawl_search_snippet('Tesco Bread')
        warning_lines = [c for c in mock_print.call_args_list
                         if 'FIRECRAWL_API_KEY' in str(c)]
        self.assertEqual(len(warning_lines), 1)

    # --- FR-003, FR-004: successful search ---

    def test_successful_search(self):
        os.environ[sdd.MEALS_FIRECRAWL_FALLBACK_ENV] = '1'
        os.environ[sdd.FIRECRAWL_API_KEY_ENV] = 'fc-test-key'
        response = FakeResponse(status=200, body=_ok_body('Storage: keep refrigerated.'))
        with mock.patch.object(sdd.urllib.request, 'urlopen', return_value=response) as mock_urlopen:
            result = sdd._fetch_firecrawl_search_snippet('Tesco British Semi Skimmed Milk 2.272L')
        self.assertEqual(result['outcome'], 'ok')
        self.assertEqual(result['snippet'], 'Storage: keep refrigerated.')
        self.assertIn('lastFetched', result)

        # Verify the request: URL, body, headers. urllib normalizes
        # header names to title-case on read; "Content-Type" becomes
        # "Content-type". Check both.
        self.assertEqual(mock_urlopen.call_count, 1)
        request_arg = mock_urlopen.call_args[0][0]
        self.assertEqual(request_arg.full_url, sdd.FIRECRAWL_SEARCH_URL)
        self.assertIn('Bearer fc-test-key', request_arg.headers.get('Authorization', ''))
        self.assertIn(
            'application/json',
            [
                request_arg.headers.get('Content-Type'),
                request_arg.headers.get('Content-type'),
                request_arg.headers.get('content-type'),
            ],
        )
        body = json.loads(request_arg.data.decode('utf-8'))
        self.assertEqual(body['limit'], 1)
        self.assertIn('site:tesco.com', body['query'])
        self.assertTrue(body['query'].startswith('Tesco British Semi Skimmed Milk 2.272L '))

    def test_strips_substitutions_marker(self):
        """The Apollo fetcher strips 'Subs: On' from item names. Spec 027
        Rev 2 does the same via _clean_item_name_for_firecrawl."""
        os.environ[sdd.MEALS_FIRECRAWL_FALLBACK_ENV] = '1'
        os.environ[sdd.FIRECRAWL_API_KEY_ENV] = 'fc-test-key'
        response = FakeResponse(status=200, body=_ok_body('snippet'))
        with mock.patch.object(sdd.urllib.request, 'urlopen', return_value=response) as mock_urlopen:
            sdd._fetch_firecrawl_search_snippet('Tesco Milk Substitutions: On')
        body = json.loads(mock_urlopen.call_args[0][0].data.decode('utf-8'))
        self.assertTrue(body['query'].startswith('Tesco Milk '))
        self.assertNotIn('Substitutions', body['query'])

    # --- Zero hits → not_found ---

    def test_zero_hits_returns_not_found(self):
        os.environ[sdd.MEALS_FIRECRAWL_FALLBACK_ENV] = '1'
        os.environ[sdd.FIRECRAWL_API_KEY_ENV] = 'fc-test-key'
        response = FakeResponse(status=200, body=_empty_body())
        with mock.patch.object(sdd.urllib.request, 'urlopen', return_value=response):
            result = sdd._fetch_firecrawl_search_snippet('No Such Product')
        self.assertEqual(result['outcome'], 'not_found')
        self.assertIn('lastFetched', result)

    def test_success_false_returns_not_found(self):
        os.environ[sdd.MEALS_FIRECRAWL_FALLBACK_ENV] = '1'
        os.environ[sdd.FIRECRAWL_API_KEY_ENV] = 'fc-test-key'
        response = FakeResponse(status=200, body=json.dumps({'success': False, 'data': []}).encode())
        with mock.patch.object(sdd.urllib.request, 'urlopen', return_value=response):
            result = sdd._fetch_firecrawl_search_snippet('Tesco X')
        self.assertEqual(result['outcome'], 'not_found')

    def test_empty_snippet_returns_not_found(self):
        os.environ[sdd.MEALS_FIRECRAWL_FALLBACK_ENV] = '1'
        os.environ[sdd.FIRECRAWL_API_KEY_ENV] = 'fc-test-key'
        # description is empty/whitespace
        response = FakeResponse(status=200, body=_ok_body('   '))
        with mock.patch.object(sdd.urllib.request, 'urlopen', return_value=response):
            result = sdd._fetch_firecrawl_search_snippet('Tesco X')
        self.assertEqual(result['outcome'], 'not_found')

    # --- FR-009: HTTP errors ---

    def test_http_error(self):
        os.environ[sdd.MEALS_FIRECRAWL_FALLBACK_ENV] = '1'
        os.environ[sdd.FIRECRAWL_API_KEY_ENV] = 'fc-test-key'
        http_err = sdd.urllib.error.HTTPError(
            url='https://api.firecrawl.dev/v1/search',
            code=429,
            msg='Too Many Requests',
            hdrs=None,
            fp=None,
        )
        with mock.patch.object(sdd.urllib.request, 'urlopen', side_effect=http_err):
            result = sdd._fetch_firecrawl_search_snippet('Tesco X')
        self.assertEqual(result['outcome'], 'http_error')
        self.assertEqual(result['status'], 429)
        self.assertIn('lastFetched', result)

    # --- Network error ---

    def test_network_error(self):
        os.environ[sdd.MEALS_FIRECRAWL_FALLBACK_ENV] = '1'
        os.environ[sdd.FIRECRAWL_API_KEY_ENV] = 'fc-test-key'
        with mock.patch.object(sdd.urllib.request, 'urlopen',
                               side_effect=OSError('ECONNREFUSED')):
            result = sdd._fetch_firecrawl_search_snippet('Tesco X')
        self.assertEqual(result['outcome'], 'error')

    # --- Malformed JSON ---

    def test_malformed_json(self):
        os.environ[sdd.MEALS_FIRECRAWL_FALLBACK_ENV] = '1'
        os.environ[sdd.FIRECRAWL_API_KEY_ENV] = 'fc-test-key'
        response = FakeResponse(status=200, body=b'NOT JSON {')
        with mock.patch.object(sdd.urllib.request, 'urlopen', return_value=response):
            result = sdd._fetch_firecrawl_search_snippet('Tesco X')
        self.assertEqual(result['outcome'], 'malformed')

    # --- FR-002: scrape endpoint NEVER appears ---

    def test_scrape_endpoint_url_not_used(self):
        """Audit: the constructed Firecrawl scrape URL must never appear
        in the source. The script may mention '/v1/scrape' in comments
        for documentation (per the spec), but the literal URL used to
        call the scrape endpoint must not be constructed.
        """
        import inspect
        source = inspect.getsource(sdd)
        self.assertNotIn('https://api.firecrawl.dev/v1/scrape', source)
        # The FRAGMENT '/v1/scrape' MAY appear in comments, but the URL
        # used for scraping must NOT. The above assertion already enforces
        # this — this comment documents why.
        # Also confirm the scrape-specific parameters from the 3-product
        # test (formats=markdown, proxy=stealth) are not used.
        self.assertNotIn('formats', source)
        self.assertNotIn('stealth', source)

    def test_only_search_url_constant(self):
        self.assertEqual(sdd.FIRECRAWL_SEARCH_URL, 'https://api.firecrawl.dev/v1/search')
        self.assertNotIn('/v1/scrape', sdd.FIRECRAWL_SEARCH_URL)

    # --- Helper functions ---

    def test_apollo_description_populated_true(self):
        self.assertTrue(sdd._apollo_description_populated({'description': 'Apollo text'}))
        self.assertTrue(sdd._apollo_description_populated({'description': '   spaced   '}))

    def test_apollo_description_populated_false(self):
        self.assertFalse(sdd._apollo_description_populated({'description': ''}))
        self.assertFalse(sdd._apollo_description_populated({'description': '   '}))
        self.assertFalse(sdd._apollo_description_populated({}))
        self.assertFalse(sdd._apollo_description_populated({'description': None}))

    def test_clean_item_name_for_firecrawl(self):
        self.assertEqual(
            sdd._clean_item_name_for_firecrawl('Tesco Milk Substitutions: On'),
            'Tesco Milk',
        )
        self.assertEqual(
            sdd._clean_item_name_for_firecrawl('Tesco Bread'),
            'Tesco Bread',
        )
        self.assertEqual(
            sdd._clean_item_name_for_firecrawl(''),
            '',
        )

    def test_firecrawl_search_enabled(self):
        os.environ.pop(sdd.MEALS_FIRECRAWL_FALLBACK_ENV, None)
        self.assertFalse(sdd._firecrawl_search_enabled())
        os.environ[sdd.MEALS_FIRECRAWL_FALLBACK_ENV] = '0'
        self.assertFalse(sdd._firecrawl_search_enabled())
        os.environ[sdd.MEALS_FIRECRAWL_FALLBACK_ENV] = '1'
        self.assertTrue(sdd._firecrawl_search_enabled())

    def test_firecrawl_api_key_empty(self):
        os.environ.pop(sdd.FIRECRAWL_API_KEY_ENV, None)
        self.assertIsNone(sdd._firecrawl_api_key())
        os.environ[sdd.FIRECRAWL_API_KEY_ENV] = ''
        self.assertIsNone(sdd._firecrawl_api_key())
        os.environ[sdd.FIRECRAWL_API_KEY_ENV] = '   '
        self.assertIsNone(sdd._firecrawl_api_key())
        os.environ[sdd.FIRECRAWL_API_KEY_ENV] = 'fc-test-key'
        self.assertEqual(sdd._firecrawl_api_key(), 'fc-test-key')

    # --- Outcome shape ---

    def test_outcome_keys_for_ok(self):
        os.environ[sdd.MEALS_FIRECRAWL_FALLBACK_ENV] = '1'
        os.environ[sdd.FIRECRAWL_API_KEY_ENV] = 'fc-test-key'
        response = FakeResponse(status=200, body=_ok_body('snippet'))
        with mock.patch.object(sdd.urllib.request, 'urlopen', return_value=response):
            result = sdd._fetch_firecrawl_search_snippet('Tesco X')
        self.assertIn('outcome', result)
        self.assertEqual(result['outcome'], 'ok')
        self.assertIn('snippet', result)
        self.assertIn('lastFetched', result)

    def test_last_fetched_is_iso_timestamp(self):
        os.environ[sdd.MEALS_FIRECRAWL_FALLBACK_ENV] = '1'
        os.environ[sdd.FIRECRAWL_API_KEY_ENV] = 'fc-test-key'
        response = FakeResponse(status=200, body=_ok_body('snippet'))
        with mock.patch.object(sdd.urllib.request, 'urlopen', return_value=response):
            result = sdd._fetch_firecrawl_search_snippet('Tesco X')
        # Must parse as ISO 8601
        parsed = datetime.fromisoformat(result['lastFetched'])
        self.assertIsNotNone(parsed.tzinfo)


if __name__ == '__main__':
    unittest.main(verbosity=2)
