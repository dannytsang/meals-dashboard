import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name('sync-dashboard-data.py')
spec = importlib.util.spec_from_file_location('sync_dashboard_data', MODULE_PATH)
assert spec is not None
assert spec.loader is not None
sync_dashboard_data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync_dashboard_data)


class ProductEnrichmentTests(unittest.TestCase):
    def test_enrich_order_items_adds_confident_metadata_and_uses_cache(self):
        calls = []

        def fetcher(item_name):
            calls.append(item_name)
            return {
                'title': 'Tesco Blueberries 500G',
                'imageUrl': 'https://digitalcontent.api.tesco.com/image.jpg',
                'productUrl': 'https://www.tesco.com/groceries/en-GB/products/123',
                'description': 'Sweet blueberries.',
                'source': 'tesco',
            }

        with tempfile.TemporaryDirectory() as tmp:
            cache_path = Path(tmp) / 'product-cache.json'
            items = [{'name': 'Tesco Blueberries 500G', 'quantity': 1, 'price': 4.55}]

            enriched = sync_dashboard_data.enrich_order_items_with_product_metadata(items, cache_path=cache_path, fetcher=fetcher)
            enriched_again = sync_dashboard_data.enrich_order_items_with_product_metadata(items, cache_path=cache_path, fetcher=fetcher)

            self.assertEqual(enriched[0]['productMetadata']['title'], 'Tesco Blueberries 500G')
            self.assertEqual(enriched_again[0]['productMetadata']['title'], 'Tesco Blueberries 500G')
            self.assertEqual(calls, ['Tesco Blueberries 500G'])
            self.assertIn('tesco blueberries 500g', json.loads(cache_path.read_text()))

    def test_enrich_order_items_preserves_truthful_fallback_when_fetch_fails(self):
        def fetcher(item_name):
            raise TimeoutError('slow pantry elves')

        with tempfile.TemporaryDirectory() as tmp:
            items = [{'name': 'Tesco Unknown Thing', 'quantity': 1, 'price': 1.23}]

            enriched = sync_dashboard_data.enrich_order_items_with_product_metadata(items, cache_path=Path(tmp) / 'product-cache.json', fetcher=fetcher)

            self.assertNotIn('productMetadata', enriched[0])
            self.assertEqual(enriched[0]['name'], 'Tesco Unknown Thing')

    def test_tesco_html_without_product_link_is_not_confident_metadata(self):
        html = '<html><head><title>Tesco search results</title></head><body>No products here</body></html>'

        metadata = sync_dashboard_data._extract_tesco_product_metadata(
            'Tesco Unknown Thing',
            html,
            'https://www.tesco.com/groceries/en-GB/search?query=Tesco%20Unknown%20Thing',
        )

        self.assertIsNone(metadata)

    def test_resolve_matched_items_preserves_generated_details_from_cache(self):
        raw_items = [{'name': 'Tesco Mini Hash Brown Bites 700gSubstitutions: On', 'quantity': 1, 'price': 2.25}]
        matched_items = [
            {'name': 'Tesco British Beef Medium Roasting Joint 0.868KG', 'quantity': 1, 'price': 10.42},
            'Tesco Mini Hash Brown Bites 700gSubstitutions: On',
        ]

        resolved = sync_dashboard_data.resolve_matched_items_for_dashboard(matched_items, raw_items)

        self.assertEqual(resolved, [
            {
                'ingredient': 'Tesco British Beef Medium Roasting Joint 0.868KG',
                'name': 'Tesco British Beef Medium Roasting Joint 0.868KG',
                'quantity': 1,
                'price': 10.42,
            },
            {
                'ingredient': 'Tesco Mini Hash Brown Bites 700gSubstitutions: On',
                'name': 'Tesco Mini Hash Brown Bites 700gSubstitutions: On',
                'quantity': 1,
                'price': 2.25,
            },
        ])


if __name__ == '__main__':
    unittest.main()
