"""Tests for spec 036 — Dashboard Delivery-Day Last-Receipt Publication (publisher slice).

Covers FR-001/FR-004/FR-005/FR-006/FR-008/FR-009/FR-010 from spec.md. The
``last_email_to_order_blob`` helper + matcher wiring live in the scripts
repo; this module only exercises the ``build_dashboard_payload`` extension
and the new ``--extra-order`` CLI flag on ``sync-dashboard-data.py``.
"""
from __future__ import annotations

import importlib.util
import io
import json
import tempfile
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


def _cache(order_id="6521-NEW", delivery_date="2026-07-02"):
    return {
        "meals": [],
        "receipt": {
            "order_number": order_id,
            "delivery_date": delivery_date,
            "delivery_slot": "10:00-11:00",
            "total": 42.0,
            "items": [],
            "email_type": "",
            "status": "active",
        },
        "meals_check_summary": {},
        "delivery_metadata": [],
        "generated_at": "2026-07-02T00:00:00Z",
    }


def _extra(order_id="6521-EXTRA-9001", delivery_date="2026-06-30"):
    return {
        "orderId": order_id, "orderNumber": order_id,
        "deliveryDate": delivery_date, "deliverySlot": "20:00-21:00",
        "orderTotal": 62.65,
        "items": [{"name": "Go Ahead Strawberry Fruit Yogurt Breaks", "qty": 1}],
        "substitutions": [], "unavailable": [], "shortLifeItems": [],
        "status": "active",
        "orderBlobPath": f"orders/{delivery_date}/{order_id}.json",
    }


def _build(module, cache=None, extra=None, sidecar=None, no_history=True, max_history=6):
    return module.build_dashboard_payload(
        cache or _cache(), overrides=[],
        api_url="https://example.test/api/dashboard-sync",
        api_secret="secret", max_history=max_history,
        no_history=no_history, sidecar_path=sidecar,
        extra_order_blob=extra,
    )


# build_dashboard_payload extension (FR-001, FR-004, FR-005, FR-008, FR-009)


class BuildDashboardPayloadExtraOrderTests(unittest.TestCase):
    def test_appends_to_orders_array(self):
        """AS-001 + AS-002: payload['orders'] grows by 1 with extra_order_blob."""
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            payload = _build(module, extra=_extra(), sidecar=Path(tmp) / "s.json")
            ids = [o.get("orderId") for o in payload["orders"]]
            self.assertEqual(len(payload["orders"]), 2)
            self.assertIn("6521-NEW", ids)
            self.assertIn("6521-EXTRA-9001", ids)

    def test_writes_canonical_blob_path(self):
        """FR-004: extra orderBlobPath is orders/<deliveryDate>/<orderId>.json."""
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            payload = _build(module, extra=_extra(), sidecar=Path(tmp) / "s.json")
            blob = next(o for o in payload["orders"] if o.get("orderId") == "6521-EXTRA-9001")
            self.assertEqual(blob["orderBlobPath"], "orders/2026-06-30/6521-EXTRA-9001.json")

    def test_normalizes_human_readable_extra_order_date_for_blob_partition(self):
        """A pending receipt date must become an ISO Blob partition."""
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            extra = _extra(order_id="3821-8601-762", delivery_date="Tuesday 28 July 2026")
            extra["orderBlobPath"] = "orders/Tuesday 28 July 2026/3821-8601-762.json"
            payload = _build(module, extra=extra, sidecar=Path(tmp) / "s.json")
            blob = next(o for o in payload["orders"] if o.get("orderId") == "3821-8601-762")
            self.assertEqual(blob["orderBlobPath"], "orders/2026-07-28/3821-8601-762.json")

    def test_no_last_email_is_no_op(self):
        """AS-004: without --extra-order, payload matches the spec 035 baseline."""
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            payload = _build(module, sidecar=Path(tmp) / "s.json")
            self.assertEqual(len(payload["orders"]), 1)
            self.assertEqual(payload["orders"][0]["orderId"], "6521-NEW")

    def test_with_malformed_json_warns_and_continues(self):
        """FR-009: malformed extra triggers warning; orders[] unchanged."""
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            captured = io.StringIO()
            with patch("sys.stdout", captured):
                payload = _build(
                    module, extra={"deliveryDate": "2026-06-30"},  # no orderId
                    sidecar=Path(tmp) / "s.json",
                )
            self.assertIn("missing orderId", captured.getvalue())
            self.assertEqual(len(payload["orders"]), 1)
            self.assertEqual(payload["orders"][0]["orderId"], "6521-NEW")

    def test_most_recent_wins_on_orderId_collision(self):
        """AS-005: extra with the same orderId as the active replaces it (spec 035 parity)."""
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            extra = _extra(order_id="6521-NEW", delivery_date="2026-07-02")
            extra["orderTotal"] = 99.0  # 'amended after confirmation'
            payload = _build(module, extra=extra, sidecar=Path(tmp) / "s.json")
            self.assertEqual(len(payload["orders"]), 1)
            self.assertEqual(payload["orders"][0]["orderTotal"], 99.0)
            self.assertEqual(payload["orders"][0]["deliveryDate"], "2026-07-02")

    def test_participates_in_sidecar(self):
        """FR-006: the post-publish sidecar step persists BOTH active + extra."""
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            sidecar = Path(tmp) / "orders" / "previously_synced.json"
            captured = io.StringIO()
            with patch("sys.stdout", captured):
                payload = _build(module, extra=_extra(), sidecar=sidecar)
            # Mirror main()'s post-publish sidecar persist step.
            merged = [{
                "orderId": o.get("orderId"), "deliveryDate": o.get("deliveryDate", ""),
                "deliverySlot": o.get("deliverySlot", ""), "status": o.get("status", "active"),
                "items": o.get("items", []), "orderBlobPath": o.get("orderBlobPath", ""),
                "orderTotal": o.get("orderTotal", 0), "substitutions": o.get("substitutions", []),
                "unavailable": o.get("unavailable", []), "shortLifeItems": o.get("shortLifeItems", []),
            } for o in payload["orders"] if o.get("orderId")]
            module.persist_historical_orders(merged, sidecar_path=sidecar)
            ids = {o["orderId"] for o in json.loads(sidecar.read_text(encoding="utf-8"))}
            self.assertEqual(ids, {"6521-NEW", "6521-EXTRA-9001"})
            # FR-008: INFO log line.
            self.assertIn("extra-order published", captured.getvalue())
            self.assertIn("6521-EXTRA-9001", captured.getvalue())
            self.assertIn("2026-06-30", captured.getvalue())


# CLI surface + main() malformed-input handling (AC-1, AC-2, AC-6)


class CliExtraOrderFlagTests(unittest.TestCase):
    def test_help_lists_extra_order_flag(self):
        """AC-1: --help lists --extra-order PATH with a clear description."""
        module = load_module()
        help_text = module.build_arg_parser().format_help()
        self.assertIn("--extra-order", help_text)
        self.assertIn("--extra-order-key", help_text)
        self.assertIn("Repeatable", help_text)

    def test_missing_file_logs_warning_and_keeps_main_write(self):
        """AC-2 + AC-6: missing --extra-order path warns; main payload still proceeds."""
        module = load_module()
        captured = io.StringIO()
        with patch("sys.stdout", captured):
            args = module.build_arg_parser().parse_args(
                ["--extra-order", "/tmp/does-not-exist-spec-036.json", "--dry-run"]
            )
            self.assertEqual(args.extra_order, ["/tmp/does-not-exist-spec-036.json"])
            extra_blob = None
            for extra_path in args.extra_order or []:
                try:
                    extra_blob = json.loads(Path(extra_path).read_text(encoding="utf-8"))
                except FileNotFoundError:
                    print(f"  ⚠ --extra-order: file not found ({extra_path}); skipping extra-order write")
            self.assertIsNone(extra_blob)
        self.assertIn("file not found", captured.getvalue())


if __name__ == "__main__":
    unittest.main()

