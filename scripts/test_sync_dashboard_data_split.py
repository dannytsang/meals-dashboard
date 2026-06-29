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
