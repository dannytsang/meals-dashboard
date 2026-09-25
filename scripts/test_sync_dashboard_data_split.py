"""Tests for the split dashboard sync publication helpers."""
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parent / "sync-dashboard-data.py"


def load_module():
    spec = importlib.util.spec_from_file_location("sync_dashboard_data", MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PublishSplitDashboardPayloadTests(unittest.TestCase):
    def test_posts_main_then_products_and_strips_products_from_main(self):
        module = load_module()
        payload = {
            "orders": [{"orderBlobPath": "orders/2026-06-15/5421.json"}],
            "coverage": [{"coverageBlobPath": "coverage/2026-06-15.json"}],
            "summary": {},
            "deliveryWindows": [],
            "coverageWindow": [],
            "dataGeneratedAt": "2026-06-20T00:00:00Z",
            "uiUpdatedAt": "2026-06-20T00:00:00Z",
            "products": [
                {"productBlobPath": "products/123.json", "tpnc": "123", "title": "Apples"}
            ],
        }
        calls = []

        def fake_post(body, api_url, secret, dry_run=False):
            calls.append((body, api_url, secret, dry_run))
            if "products" not in body:
                return True, {"ok": True, "manifestPath": "meta/manifest-fresh.json"}
            return True, {"ok": True}

        with patch.object(module, "post_dashboard_data_to_api", side_effect=fake_post):
            result = module.publish_split_dashboard_payload(
                payload,
                "https://example.test/api/dashboard-sync",
                "secret",
            )

        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][1], "https://example.test/api/dashboard-sync")
        self.assertNotIn("products", calls[0][0])
        self.assertEqual(calls[1][1], "https://example.test/api/dashboard-products-sync")
        self.assertEqual(
            calls[1][0],
            {
                "products": payload["products"],
                "mainManifestPath": "meta/manifest-fresh.json",
            },
        )
        self.assertTrue(result["main"]["ok"])
        self.assertTrue(result["products"]["ok"])

    def test_configured_targets_receive_same_run_and_target_specific_manifests(self):
        module = load_module()
        payload = {
            "orders": [{"orderBlobPath": "orders/2026-06-15/1.json"}],
            "coverage": [], "summary": {}, "deliveryWindows": [], "coverageWindow": [],
            "dataGeneratedAt": "stable-run", "uiUpdatedAt": "stable-ui",
            "products": [{"productBlobPath": "products/123.json", "tpnc": "123"}],
        }
        calls = []

        def fake_post(body, url, secret, dry_run=False):
            calls.append((body, url, secret))
            if url.endswith('/dashboard-sync'):
                target = 'primary' if 'primary' in url else 'secondary'
                return True, {"ok": True, "manifestPath": f"meta/{target}.json"}
            return True, {"productsManifestPath": "meta/products.json"}

        with patch.object(module, "post_dashboard_data_to_api", side_effect=fake_post):
            result = module.publish_split_dashboard_payload(
                payload, "https://primary.test/api/dashboard-sync", "primary-auth",
                secondary_url="https://secondary.test/api/dashboard-sync", secondary_secret="secondary-auth",
            )

        self.assertTrue(result['ok'])
        self.assertEqual(len(calls), 4)
        self.assertEqual(calls[1][0]['mainManifestPath'], 'meta/primary.json')
        self.assertEqual(calls[3][0]['mainManifestPath'], 'meta/secondary.json')
        self.assertEqual(calls[0][0]['dataGeneratedAt'], calls[2][0]['dataGeneratedAt'])
        self.assertEqual(calls[0][2], 'primary-auth')
        self.assertEqual(calls[2][2], 'secondary-auth')

    def test_primary_failure_does_not_suppress_secondary_or_products(self):
        module = load_module()
        payload = {"orders": [], "coverage": [], "summary": {}, "deliveryWindows": [], "coverageWindow": [], "products": [{"productBlobPath": "products/1.json"}]}
        calls = []

        def fake_post(body, url, secret, dry_run=False):
            calls.append(url)
            if 'primary.test' in url:
                return False, {"error": "unavailable"}
            if url.endswith('/dashboard-sync'):
                return True, {"manifestPath": "meta/local.json"}
            return True, {"productsManifestPath": "meta/local-products.json"}

        with patch.object(module, "post_dashboard_data_to_api", side_effect=fake_post):
            result = module.publish_split_dashboard_payload(
                payload, "https://primary.test/api/dashboard-sync", "p",
                secondary_url="https://secondary.test/api/dashboard-sync", secondary_secret="s",
            )
        self.assertFalse(result['ok'])
        self.assertFalse(result['targets']['primary']['main']['ok'])
        self.assertTrue(result['targets']['secondary']['main']['ok'])
        self.assertTrue(result['targets']['secondary']['products']['ok'])
        self.assertIn('https://secondary.test/api/dashboard-products-sync', calls)

    def test_primary_noop_does_not_suppress_initial_secondary(self):
        module = load_module()
        payload = {"orders": [], "coverage": [], "summary": {}, "deliveryWindows": [], "coverageWindow": []}
        calls = []

        def fake_post(body, url, secret, dry_run=False):
            calls.append(url)
            return True, {"manifestPath": "meta/manifest.json", "suppressedNoopWrites": url.startswith('https://primary')}

        with patch.object(module, "post_dashboard_data_to_api", side_effect=fake_post):
            result = module.publish_split_dashboard_payload(
                payload, "https://primary.test/api/dashboard-sync", "p",
                secondary_url="https://secondary.test/api/dashboard-sync", secondary_secret="s",
            )
        self.assertEqual(len(calls), 2)
        self.assertTrue(result['targets']['secondary']['main']['ok'])

    def test_secondary_missing_auth_is_partial_and_primary_is_preserved(self):
        module = load_module()
        payload = {"orders": [], "coverage": [], "summary": {}, "deliveryWindows": [], "coverageWindow": []}
        with patch.object(module, "post_dashboard_data_to_api", return_value=(True, {"manifestPath": "meta/p.json"})):
            result = module.publish_split_dashboard_payload(
                payload, "https://primary.test/api/dashboard-sync", "p",
                secondary_url="https://secondary.test/api/dashboard-sync", secondary_secret="",
            )
        self.assertTrue(result['targets']['primary']['main']['ok'])
        self.assertFalse(result['targets']['secondary']['main']['ok'])
        self.assertEqual(result['targets']['secondary']['main']['response']['error'], 'destination auth not configured')

    def test_single_target_legacy_shape_is_preserved(self):
        module = load_module()
        payload = {"orders": [], "coverage": [], "summary": {}, "deliveryWindows": [], "coverageWindow": []}
        with patch.object(module, "post_dashboard_data_to_api", return_value=(True, {"manifestPath": "meta/p.json"})) as post:
            result = module.publish_split_dashboard_payload(payload, "https://primary.test/api/dashboard-sync", "p")
        self.assertEqual(post.call_count, 1)
        self.assertTrue(result['main']['ok'])
        self.assertTrue(result['ok'])
        self.assertEqual(list(result['targets']), ['primary'])

    def test_post_response_errors_are_redacted(self):
        module = load_module()
        from unittest.mock import MagicMock
        response = MagicMock()
        response.status = 200
        response.__enter__.return_value = response
        response.read.return_value = b'{"manifestPath":"meta/x.json","private":"household payload"}'
        with patch.object(module.urllib.request, 'urlopen', return_value=response):
            ok, metadata = module.post_dashboard_data_to_api({"private": "household payload"}, "https://example.test/api/dashboard-sync", "secret")
        self.assertTrue(ok)
        self.assertNotIn('private', metadata)

    def test_empty_success_body_is_valid_but_malformed_body_fails_safely(self):
        module = load_module()
        from unittest.mock import MagicMock
        response = MagicMock()
        response.status = 200
        response.__enter__.return_value = response
        response.read.return_value = b'{bad json'
        with patch.object(module.urllib.request, 'urlopen', return_value=response):
            ok, metadata = module.post_dashboard_data_to_api({}, "https://example.test/api/dashboard-sync", "secret")
        self.assertFalse(ok)
        self.assertEqual(metadata, {"error": "invalid JSON response"})

    def test_reports_partial_success_when_product_publish_fails(self):
        module = load_module()
        payload = {
            "orders": [],
            "coverage": [],
            "summary": {},
            "deliveryWindows": [],
            "coverageWindow": [],
            "dataGeneratedAt": "2026-06-20T00:00:00Z",
            "uiUpdatedAt": "2026-06-20T00:00:00Z",
            "products": [
                {"productBlobPath": "products/123.json", "tpnc": "123", "title": "Apples"}
            ],
        }

        def fake_post(body, api_url, secret, dry_run=False):
            if "products" in body:
                return False, {"error": "boom"}
            return True, {"ok": True}

        with patch.object(module, "post_dashboard_data_to_api", side_effect=fake_post):
            result = module.publish_split_dashboard_payload(
                payload,
                "https://example.test/api/dashboard-sync",
                "secret",
            )

        self.assertTrue(result["main"]["ok"])
        self.assertFalse(result["products"]["ok"])


if __name__ == "__main__":
    unittest.main()
