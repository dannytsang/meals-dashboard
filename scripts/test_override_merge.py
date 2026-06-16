#!/usr/bin/env python3
"""Unit tests for the override merge in sync-dashboard-data.py.

Spec 019 / FR-07 / T061 — the manual override flow now persists
overrides to the Vercel blob via /api/overrides. The Python sync
fetches the overrides and merges them into the meals list as
matched items. This test verifies the merge logic.

Run with: python3 test_override_merge.py
"""

import importlib.util
import os
import sys
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parent / "sync-dashboard-data.py"


def load_module():
    spec = importlib.util.spec_from_file_location("sync_dashboard_data", MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sync_dashboard_data = load_module()


class TestApplyManualOverridesToMeals(unittest.TestCase):
    def setUp(self):
        self.sample_meals = [
            {
                'id': 'm1',
                'content': 'Rice / garlic bread',
                'date': '2026-06-19',
                'status': 'missing',
                'coverage_score': 0,
                'matched_items': [],
                'missing_items': ['Tesco Blueberries 500G', 'Garlic bread 2 pack'],
            },
            {
                'id': 'm2',
                'content': 'Pizza (Leo)',
                'date': '2026-06-17',
                'status': 'partial',
                'coverage_score': 60,
                'matched_items': [
                    {'name': 'Tesco Pizza 350g', 'ingredient': 'Tesco Pizza 350g', 'quantity': 1, 'price': 2.5},
                ],
                'missing_items': ['Mozzarella 200g'],
            },
        ]

    def test_empty_overrides_returns_meals_unchanged(self):
        result = sync_dashboard_data.apply_manual_overrides_to_meals(self.sample_meals, [])
        self.assertEqual(result, self.sample_meals)

    def test_none_overrides_returns_meals_unchanged(self):
        result = sync_dashboard_data.apply_manual_overrides_to_meals(self.sample_meals, None)
        self.assertEqual(result, self.sample_meals)

    def test_override_adds_synthetic_matched_item(self):
        overrides = [{
            'meal_date': '2026-06-19',
            'meal_name': 'Rice / garlic bread',
            'item_name': 'Garlic bread 2 pack',
            'quantity': 1,
            'status': 'covered',
            'reason': 'already in freezer',
        }]
        result = sync_dashboard_data.apply_manual_overrides_to_meals(self.sample_meals, overrides)
        rice = next(m for m in result if m['content'] == 'Rice / garlic bread')
        self.assertEqual(len(rice['matched_items']), 1)
        added = rice['matched_items'][0]
        self.assertEqual(added['name'], 'Garlic bread 2 pack')
        self.assertEqual(added['source'], 'manual_override')
        self.assertEqual(added['manualOverride']['reason'], 'already in freezer')

    def test_override_flips_missing_to_partial(self):
        overrides = [{
            'meal_date': '2026-06-19',
            'meal_name': 'Rice / garlic bread',
            'item_name': 'Garlic bread 2 pack',
            'quantity': 1,
            'status': 'covered',
        }]
        result = sync_dashboard_data.apply_manual_overrides_to_meals(self.sample_meals, overrides)
        rice = next(m for m in result if m['content'] == 'Rice / garlic bread')
        self.assertEqual(rice['status'], 'partial')
        self.assertGreaterEqual(int(rice['coverage_score']), 50)

    def test_override_for_unknown_meal_is_skipped(self):
        overrides = [{
            'meal_date': '2026-06-25',
            'meal_name': 'Out-of-range meal',
            'item_name': 'Tesco Sushi 200g',
            'quantity': 1,
            'status': 'covered',
        }]
        result = sync_dashboard_data.apply_manual_overrides_to_meals(self.sample_meals, overrides)
        # No meal gets a new matched item
        for m in result:
            overrides_in = [it for it in m['matched_items'] if it.get('source') == 'manual_override']
            self.assertEqual(overrides_in, [])

    def test_override_marks_existing_match_as_manual(self):
        # Pizza (Leo) already has Tesco Pizza 350g as a real order match.
        # If the user adds a manual override for the SAME item, we
        # should mark the existing match as manual_override (not
        # duplicate the entry).
        overrides = [{
            'meal_date': '2026-06-17',
            'meal_name': 'Pizza (Leo)',
            'item_name': 'Tesco Pizza 350g',
            'quantity': 1,
            'status': 'covered',
            'reason': 'manual assertion',
        }]
        result = sync_dashboard_data.apply_manual_overrides_to_meals(self.sample_meals, overrides)
        pizza = next(m for m in result if m['content'] == 'Pizza (Leo)')
        # Still one matched item, not two
        self.assertEqual(len(pizza['matched_items']), 1)
        # And it's now flagged as manual_override
        self.assertEqual(pizza['matched_items'][0]['source'], 'manual_override')
        self.assertEqual(pizza['matched_items'][0]['manualOverride']['reason'], 'manual assertion')

    def test_override_with_missing_fields_is_skipped_safely(self):
        overrides = [
            # Missing item_name
            {'meal_date': '2026-06-19', 'meal_name': 'Rice / garlic bread', 'quantity': 1, 'status': 'covered'},
            # Missing meal_name
            {'meal_date': '2026-06-19', 'item_name': 'Garlic bread 2 pack', 'quantity': 1, 'status': 'covered'},
            # Missing meal_date
            {'meal_name': 'Rice / garlic bread', 'item_name': 'Garlic bread 2 pack', 'quantity': 1, 'status': 'covered'},
            # Empty strings
            {'meal_date': '', 'meal_name': 'Rice / garlic bread', 'item_name': 'Garlic bread 2 pack'},
        ]
        result = sync_dashboard_data.apply_manual_overrides_to_meals(self.sample_meals, overrides)
        rice = next(m for m in result if m['content'] == 'Rice / garlic bread')
        # No malformed override should land
        self.assertEqual(rice['matched_items'], [])


class TestFetchManualOverrides(unittest.TestCase):
    """Smoke test that the fetch function handles missing config gracefully."""

    def test_returns_empty_when_no_url(self):
        result = sync_dashboard_data.fetch_manual_overrides('', 'some-secret')
        self.assertEqual(result, [])

    def test_returns_empty_when_no_secret(self):
        result = sync_dashboard_data.fetch_manual_overrides('https://example.com/api/overrides', '')
        self.assertEqual(result, [])


if __name__ == '__main__':
    unittest.main()
