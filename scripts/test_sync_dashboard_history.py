"""Tests for spec 035 — Dashboard Order History Retention.

Covers FR-001..FR-010 (and AS-001..AS-009 acceptance scenarios) for the
``scripts/sync-dashboard-data.py`` order-history retention feature:

* ``assemble_orders(active, historical, cap)`` — pure helper.
* ``load_historical_orders(cap, sidecar_path)`` — sidecar read with safe fallback.
* ``persist_historical_orders(orders, sidecar_path)`` — atomic JSON write.
* ``build_dashboard_payload(...)`` integration with --max-history / --no-history.

The test file lives alongside the production module so it uses the existing
``importlib.util`` loading convention from the other scripts tests.
"""
from __future__ import annotations

import importlib.util
import io
import json
import os
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


def _receipt(order_id: str, delivery_date: str, **overrides) -> dict:
    """Build a minimal OrderBlob-shaped dict for testing."""
    blob = {
        "orderNumber": order_id,
        "orderId": order_id,
        "deliveryDate": delivery_date,
        "deliverySlot": "10:00-11:00",
        "orderTotal": 0,
        "items": [],
        "substitutions": [],
        "unavailable": [],
        "shortLifeItems": [],
        "status": "active",
        "orderBlobPath": f"orders/{delivery_date}/{order_id}.json",
    }
    blob.update(overrides)
    return blob


# ---------------------------------------------------------------------------
# Pure helper — assemble_orders (FR-002, FR-004, FR-005, FR-006)
# ---------------------------------------------------------------------------


class AssembleOrdersTests(unittest.TestCase):
    def test_assemble_orders_merges_active_and_historical_distinct_ids(self):
        # AS-002: N historical + 1 active = N+1 entries, orderId-deduplicated.
        module = load_module()
        active = _receipt("6521-BBBB-0002", "2026-07-02")
        historical = [
            _receipt("6521-AAAA-0001", "2026-06-25"),
            _receipt("6521-CCCC-0003", "2026-06-10"),
        ]
        result = module.assemble_orders(active, historical, cap=6)
        ids = {o["orderId"] for o in result}
        self.assertEqual(ids, {"6521-AAAA-0001", "6521-CCCC-0003", "6521-BBBB-0002"})
        self.assertEqual(len(result), 3)

    def test_assemble_orders_replaces_duplicate_orderId_with_active(self):
        # AS-004 / FR-004: most-recent-wins on orderId collision.
        module = load_module()
        active = _receipt("6521-AAAA-0001", "2026-07-02", orderTotal=99)
        historical = [_receipt("6521-AAAA-0001", "2026-06-25", orderTotal=10)]
        result = module.assemble_orders(active, historical, cap=6)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["orderId"], "6521-AAAA-0001")
        self.assertEqual(result[0]["deliveryDate"], "2026-07-02")
        self.assertEqual(result[0]["orderTotal"], 99)

    def test_assemble_orders_sorts_by_deliveryDate_ascending(self):
        # FR-002: orders[] sorted by deliveryDate ASC.
        module = load_module()
        active = _receipt("6521-NEW", "2026-09-01")
        historical = [
            _receipt("6521-OLD1", "2026-05-01"),
            _receipt("6521-OLD2", "2026-06-15"),
            _receipt("6521-MID", "2026-07-15"),
        ]
        result = module.assemble_orders(active, historical, cap=6)
        dates = [o["deliveryDate"] for o in result]
        self.assertEqual(dates, ["2026-05-01", "2026-06-15", "2026-07-15", "2026-09-01"])

    def test_assemble_orders_caps_at_max_plus_active(self):
        # AS-003 / FR-005: cap evicts oldest by deliveryDate ASC.
        module = load_module()
        historical = [
            _receipt(f"6521-O{i:02d}", f"2026-{m:02d}-01")
            for i, m in enumerate(range(2, 8), start=1)  # 6 historical entries (Feb..Jul 2026)
        ]
        active = _receipt("6521-NEW", "2026-12-01")
        result = module.assemble_orders(active, historical, cap=6)
        # cap + active = 7
        self.assertEqual(len(result), 7)
        ids = [o["orderId"] for o in result]
        self.assertEqual(ids[0], "6521-O01")  # oldest historical retained (Feb 2026)
        self.assertIn("6521-NEW", ids)  # newest retained
        # All dates strictly ascending.
        dates = [o["deliveryDate"] for o in result]
        self.assertEqual(dates, sorted(dates))
        self.assertEqual(dates[0], "2026-02-01")
        self.assertEqual(dates[-1], "2026-12-01")

    def test_assemble_orders_fifo_evicts_oldest_when_cap_reached(self):
        # FR-005: explicit FIFO eviction test with cap=2 (cap+1 = 3 entries).
        module = load_module()
        historical = [
            _receipt("6521-A", "2026-01-01"),
            _receipt("6521-B", "2026-02-01"),
        ]
        active = _receipt("6521-C", "2026-03-01")
        result = module.assemble_orders(active, historical, cap=2)
        # Expected: cap+1 = 3 entries; oldest first, newest last.
        ids = [o["orderId"] for o in result]
        self.assertEqual(ids, ["6521-A", "6521-B", "6521-C"])
        self.assertEqual([o["deliveryDate"] for o in result], ["2026-01-01", "2026-02-01", "2026-03-01"])

    def test_assemble_orders_is_pure_with_no_mutation(self):
        # NFR-005: pure function, no mutation of inputs.
        module = load_module()
        active = _receipt("6521-A", "2026-02-01")
        historical = [_receipt("6521-B", "2026-01-01")]
        before_hist = list(historical)
        result = module.assemble_orders(active, historical, cap=6)
        # historical list reference unchanged
        self.assertEqual(historical, before_hist)
        # result is a new list, not historical aliased
        self.assertIsNot(result, historical)

    def test_assemble_orders_cap_zero_returns_only_active(self):
        # Edge case: cap=0 ⇒ only the active receipt is returned (parity with --no-history).
        module = load_module()
        active = _receipt("6521-NEW", "2026-07-15")
        historical = [_receipt("6521-OLD", "2026-06-01")]
        result = module.assemble_orders(active, historical, cap=0)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["orderId"], "6521-NEW")


# ---------------------------------------------------------------------------
# Sidecar IO — load_historical_orders / persist_historical_orders (FR-001, NFR-005)
# ---------------------------------------------------------------------------


class SidecarIOTests(unittest.TestCase):
    def test_load_historical_orders_returns_empty_on_missing_file(self):
        # AS-008: missing sidecar ⇒ empty list, no exception.
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            sidecar = Path(tmp) / "orders" / "previously_synced.json"
            # parent directory intentionally absent
            result = module.load_historical_orders(cap=6, sidecar_path=sidecar)
        self.assertEqual(result, [])

    def test_load_historical_orders_returns_empty_on_corrupt_json(self):
        # AS-008: corrupt JSON ⇒ empty list (INFO log via print, no exception).
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            sidecar_dir = Path(tmp) / "orders"
            sidecar_dir.mkdir(parents=True, exist_ok=True)
            sidecar = sidecar_dir / "previously_synced.json"
            sidecar.write_text("not-json{{garbage", encoding="utf-8")
            result = module.load_historical_orders(cap=6, sidecar_path=sidecar)
        self.assertEqual(result, [])

    def test_load_historical_orders_filters_non_dict_or_missing_orderId(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            sidecar = Path(tmp) / "previously_synced.json"
            sidecar.write_text(json.dumps([
                _receipt("6521-OK", "2026-06-01"),
                {"no_order_id": True},
                "string-entry",
                None,
                _receipt("6521-OK2", "2026-06-15"),
            ]), encoding="utf-8")
            result = module.load_historical_orders(cap=6, sidecar_path=sidecar)
        ids = [o["orderId"] for o in result]
        self.assertEqual(ids, ["6521-OK", "6521-OK2"])

    def test_load_historical_orders_respects_cap(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            sidecar = Path(tmp) / "previously_synced.json"
            sidecar.write_text(json.dumps([
                _receipt(f"6521-X{i}", f"2026-06-{i+1:02d}") for i in range(10)
            ]), encoding="utf-8")
            result = module.load_historical_orders(cap=3, sidecar_path=sidecar)
        self.assertEqual(len(result), 3)

    def test_persist_historical_orders_writes_valid_json_and_is_atomic(self):
        # T040: output file contains valid JSON identical to input, atomic via .tmp.
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            sidecar = Path(tmp) / "orders" / "previously_synced.json"
            orders = [
                _receipt("6521-A", "2026-01-01"),
                _receipt("6521-B", "2026-02-01"),
            ]
            module.persist_historical_orders(orders, sidecar_path=sidecar)
            # File exists, parent created, contents are valid JSON equal to input list.
            self.assertTrue(sidecar.exists())
            self.assertTrue(sidecar.parent.is_dir())
            loaded = json.loads(sidecar.read_text(encoding="utf-8"))
            self.assertEqual(loaded, orders)
            # No .tmp leftover.
            tmp_path = sidecar.with_suffix(".json.tmp")
            self.assertFalse(tmp_path.exists())


# ---------------------------------------------------------------------------
# Integration with build_dashboard_payload (FR-002, FR-007, FR-008, FR-009)
# ---------------------------------------------------------------------------


class BuildDashboardPayloadHistoryTests(unittest.TestCase):
    def _cache_data(self):
        # Minimal cache: no receipt at all, just an active receipt-style stub.
        return {
            "meals": [],
            "receipt": {
                "order_number": "6521-NEW",
                "delivery_date": "2026-07-02",
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

    def test_build_dashboard_payload_includes_historical_orders(self):
        # AS-001: historical entries + active receipt = cap+1 entries.
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            sidecar = Path(tmp) / "orders" / "previously_synced.json"
            sidecar.parent.mkdir(parents=True, exist_ok=True)
            sidecar.write_text(json.dumps([
                _receipt("6521-AAAA-0001", "2026-06-25"),
            ]), encoding="utf-8")
            payload = module.build_dashboard_payload(
                self._cache_data(),
                overrides=[],
                api_url="https://example.test/api/dashboard-sync",
                api_secret="secret",
                max_history=6,
                no_history=False,
                sidecar_path=sidecar,
            )
        self.assertEqual(len(payload["orders"]), 2)
        ids = [o["orderId"] for o in payload["orders"]]
        self.assertEqual(ids, ["6521-AAAA-0001", "6521-NEW"])

    def test_build_dashboard_payload_with_no_history_flag_returns_single_element(self):
        # AS-007 / FR-008: --no-history ⇒ one-entry orders[], sidecar not read.
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            sidecar = Path(tmp) / "orders" / "previously_synced.json"
            sidecar.parent.mkdir(parents=True, exist_ok=True)
            sidecar.write_text(json.dumps([
                _receipt("6521-SHOULD-BE-IGNORED", "2026-06-25"),
            ]), encoding="utf-8")
            payload = module.build_dashboard_payload(
                self._cache_data(),
                overrides=[],
                api_url="https://example.test/api/dashboard-sync",
                api_secret="secret",
                max_history=6,
                no_history=True,
                sidecar_path=sidecar,
            )
        self.assertEqual(len(payload["orders"]), 1)
        self.assertEqual(payload["orders"][0]["orderId"], "6521-NEW")

    def test_build_dashboard_payload_max_history_override_cap_three(self):
        # AS-006 / T042: parametrised cap.
        module = load_module()
        receipts = [_receipt(f"6521-H{i}", f"2026-06-{i+1:02d}") for i in range(5)]
        with tempfile.TemporaryDirectory() as tmp:
            sidecar = Path(tmp) / "orders" / "previously_synced.json"
            sidecar.parent.mkdir(parents=True, exist_ok=True)
            sidecar.write_text(json.dumps(receipts), encoding="utf-8")
            for cap, expected in [(0, 1), (3, 4), (6, 6)]:
                payload = module.build_dashboard_payload(
                    self._cache_data(),
                    overrides=[],
                    api_url="https://example.test/api/dashboard-sync",
                    api_secret="secret",
                    max_history=cap,
                    no_history=False,
                    sidecar_path=sidecar,
                )
                self.assertEqual(
                    len(payload["orders"]), expected,
                    f"cap={cap} expected orders length {expected}, got {len(payload['orders'])}",
                )

    def test_build_dashboard_payload_logs_summary_line(self):
        # FR-009: INFO summary line via stdout print().
        module = load_module()
        with tempfile.TemporaryDirectory() as tmp:
            sidecar = Path(tmp) / "orders" / "previously_synced.json"
            captured = io.StringIO()
            with patch("sys.stdout", captured):
                module.build_dashboard_payload(
                    self._cache_data(),
                    overrides=[],
                    api_url="https://example.test/api/dashboard-sync",
                    api_secret="secret",
                    max_history=6,
                    no_history=False,
                    sidecar_path=sidecar,
                )
        out = captured.getvalue()
        self.assertIn("orders: published", out)
        self.assertIn("active: 6521-NEW", out)
        self.assertIn("history: 0", out)
        self.assertIn("cap: 6", out)


# ---------------------------------------------------------------------------
# CLI: argparse flags present (FR-003, FR-008)
# ---------------------------------------------------------------------------


class CliFlagsTests(unittest.TestCase):
    def test_help_text_includes_max_history_and_no_history(self):
        module = load_module()
        parser = module.build_arg_parser()
        help_text = parser.format_help()
        self.assertIn("--max-history", help_text)
        self.assertIn("--no-history", help_text)


if __name__ == "__main__":
    unittest.main()
