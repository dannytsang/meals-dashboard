"""Tests for backfill_tesco_product_metadata.py."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parent))
import importlib as _importlib
_backfill_mod = _importlib.import_module('backfill_tesco_product_metadata')
_sync_mod = _importlib.import_module('sync-dashboard-data')

# Expose for tests
_resolve_tpnc = _backfill_mod._resolve_tpnc
_read_cache = _backfill_mod._read_cache
_build_backfill_payload = _backfill_mod._build_backfill_payload
backfill_entry = _backfill_mod.backfill_entry


class TestResolveTpnc(unittest.TestCase):
    """Tests for tpnc resolution."""

    def test_existing_shop_url(self):
        """New /shop/ URL is parsed directly for tpnc."""
        entry = {'productUrl': 'https://www.tesco.com/shop/en-GB/products/134527861'}
        tpnc = _resolve_tpnc(entry, 'Some Item')
        self.assertEqual(tpnc, '134527861')

    def test_groceries_url_falls_back_to_search(self):
        """Old /groceries/ URL triggers search-based resolution."""
        entry = {'productUrl': 'https://www.tesco.com/groceries/en-GB/products/12345'}
        with patch.object(_backfill_mod, '_search_tpnc', return_value='999888777') as mock:
            tpnc = _resolve_tpnc(entry, 'Tesco Item')
            mock.assert_called_once_with('Tesco Item')
            self.assertEqual(tpnc, '999888777')

    def test_tpnc_already_present(self):
        """Entry with tpnc returns it without searching."""
        entry = {'tpnc': '123456789', 'productUrl': 'https://www.tesco.com/groceries/en-GB/products/123'}
        with patch.object(_backfill_mod, '_search_tpnc') as mock:
            tpnc = _resolve_tpnc(entry, 'Tesco Item')
            mock.assert_not_called()
            self.assertEqual(tpnc, '123456789')


class TestBackfillEntry(unittest.TestCase):
    """Tests for backfill_entry."""

    def test_upgrades_legacy_entry(self):
        """Legacy entry (no tpnc) is upgraded to full Apollo fields.

        Tesco now returns /shop/ URLs. The entry's productUrl must use the /shop/
        form so _resolve_tpnc can parse the tpnc without a network search.
        """
        # Use new /shop/ URL (Tesco's current product page format)
        legacy = {
            'title': 'Tesco Raspberries 150G',
            'productUrl': 'https://www.tesco.com/shop/en-GB/products/134527861',
            'source': 'tesco',
        }
        apollo_product = {
            'tpnc': '134527861',
            'gtin': '5051555110340',
            'title': 'Tesco Raspberries 150G',
            'description': ['Raspberries'],
            'details': {
                'storage': 'Store in a cool, dry place.',
                'preparationAndUsage': 'Ready to eat.',
                'productMarketing': 'Fresh raspberries.',
            },
            'media': {'images': [{'url': 'https://example.com/img.jpg'}]},
        }
        with patch.object(_sync_mod, '_fetch_tesco_apollo_cache', return_value=apollo_product):
            result = backfill_entry(legacy, 'Tesco Raspberries 150G')

        self.assertEqual(result.get('tpnc'), '134527861')
        self.assertEqual(result.get('gtin'), '5051555110340')
        self.assertIn('Raspberries', result.get('description', ''))
        self.assertIn('cool, dry place', result.get('storage', ''))
        self.assertIn('Ready to eat', result.get('preparation', ''))
        self.assertEqual(result.get('imageUrl'), 'https://example.com/img.jpg')
        self.assertEqual(result.get('source'), 'tesco.com')
        self.assertIsNotNone(result.get('lastFetched'))
        self.assertEqual(result.get('title'), 'Tesco Raspberries 150G')

    def test_sets_unmatched_on_fetch_failure(self):
        """Records unmatched reason when product page fetch fails."""
        legacy = {'productUrl': 'https://www.tesco.com/shop/en-GB/products/999'}
        with patch.object(_sync_mod, '_fetch_tesco_apollo_cache', return_value=None):
            result = backfill_entry(legacy, 'Some Item')

        self.assertIn('unmatched', result)
        self.assertIn('product page fetch failed', result['unmatched'])

    def test_sets_unmatched_when_tpnc_not_resolved(self):
        """Records unmatched when tpnc cannot be resolved."""
        legacy = {'productUrl': 'https://www.tesco.com/groceries/en-GB/products/999'}
        with patch.object(_backfill_mod, '_resolve_tpnc', return_value=None):
            result = backfill_entry(legacy, 'Some Item')

        self.assertIn('unmatched', result)
        self.assertIn('could not resolve tpnc', result['unmatched'])


class TestCacheReadWrite(unittest.TestCase):
    """Tests for cache I/O helpers."""

    def test_read_cache_empty_for_missing_file(self):
        """Returns {} when cache file does not exist."""
        with tempfile.TemporaryDirectory() as tmp:
            result = _read_cache(Path(tmp) / 'nonexistent.json')
            self.assertEqual(result, {})

    def test_read_cache_exits_for_corrupt_json(self):
        """Exits with code 1 on corrupt JSON."""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'corrupt.json'
            path.write_text('{ invalid json }')
            with self.assertRaises(SystemExit) as ctx:
                _read_cache(path)
            self.assertEqual(ctx.exception.code, 1)


class TestBackfillPayloadConstruction(unittest.TestCase):
    """Tests for product-only backfill publication."""

    def test_builds_product_only_payload_from_snapshot(self):
        """Backfill payload should contain only products, not dashboard state."""
        products = {
            '123456789': {
                'productBlobPath': 'products/123456789.json',
                'tpnc': '123456789',
                'title': 'Tesco Beef Mince 500g',
                'description': 'Beef mince',
                'source': 'test-fixture',
                'lastFetched': '2026-06-15T12:00:00Z',
            }
        }

        payload = _build_backfill_payload(products)

        self.assertIsNotNone(payload)
        self.assertEqual(list(payload.keys()), ['products'])
        self.assertEqual(len(payload['products']), 1)
        self.assertEqual(payload['products'][0]['productBlobPath'], 'products/123456789.json')
        self.assertEqual(payload['products'][0]['tpnc'], '123456789')

    def test_returns_none_for_empty_product_snapshot(self):
        """Without products, the backfill payload should be omitted."""
        payload = _build_backfill_payload({})
        self.assertIsNone(payload)

if __name__ == '__main__':
    unittest.main()
