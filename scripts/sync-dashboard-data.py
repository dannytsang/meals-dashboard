#!/usr/bin/env python3
"""
Dashboard Data Sync Pipeline
=============================
Syncs meal plan and Tesco order data to the meals-dashboard.

Can be run:
1. Manually:     python3 scripts/sync-dashboard-data.py
2. After check:  (called by meals_check_runner.py or meals.py)
3. Scheduled:    cron job, GitHub Actions, etc.

Usage:
    python3 scripts/sync-dashboard-data.py [--dry-run] [--verbose] [--skip-fetch] [--message "..."]
"""

import sys
import json
import argparse
import subprocess
import re
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime
from typing import Callable, Dict, Any, Optional, Tuple

# Base paths - use absolute paths for clarity. Defaults match Danny's Hermes chef profile
# environment, but can be overridden for local/dev runs.
DASHBOARD_PATH = Path(os.environ.get('MEALS_DASHBOARD_REPO', '/home/hermes/workspace/meals-dashboard')).expanduser().resolve()
MEALS_SCRIPTS_PATH = Path(os.environ.get('MEALS_CHECK_SCRIPTS', '/home/hermes/.hermes/scripts')).expanduser().resolve()
REAL_DATA_PATH = DASHBOARD_PATH / 'lib' / 'real-data.ts'
SYNC_META_PATH = DASHBOARD_PATH / 'lib' / 'sync-meta.ts'
RECEIPT_CACHE = MEALS_SCRIPTS_PATH / 'data' / 'receipt_coverage_cache.json'
MEAL_PLAN_CACHE = MEALS_SCRIPTS_PATH / 'data' / 'meal-plan-cache.json'
DASHBOARD_CACHE = Path(os.environ.get('MEALS_DASHBOARD_CACHE', str(MEALS_SCRIPTS_PATH / 'data' / 'dashboard_cache.json'))).expanduser().resolve()
PRODUCT_METADATA_CACHE = Path(os.environ.get('MEALS_PRODUCT_METADATA_CACHE', str(MEALS_SCRIPTS_PATH / 'data' / 'tesco_product_metadata_cache.json'))).expanduser().resolve()
PRODUCT_ENRICHMENT_TIMEOUT_SECONDS = float(os.environ.get('MEALS_PRODUCT_ENRICHMENT_TIMEOUT_SECONDS', '5'))
PRODUCT_ENRICHMENT_DELAY_SECONDS = float(os.environ.get('MEALS_PRODUCT_ENRICHMENT_DELAY_SECONDS', '0.2'))


def _product_cache_key(item_name: str) -> str:
    return re.sub(r'\s+', ' ', item_name).strip().lower()


def _read_product_metadata_cache(cache_path: Path = PRODUCT_METADATA_CACHE) -> Dict[str, Dict[str, Any]]:
    if not cache_path.exists():
        return {}
    try:
        with open(cache_path) as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception as e:
        print(f"  ⚠ Error reading product metadata cache: {e}")
        return {}


def _write_product_metadata_cache(cache: Dict[str, Dict[str, Any]], cache_path: Path = PRODUCT_METADATA_CACHE) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    with open(cache_path, 'w') as f:
        json.dump(cache, f, indent=2, sort_keys=True)


def _extract_tesco_product_metadata(item_name: str, html: str, search_url: str) -> Optional[Dict[str, Any]]:
    """Extract a conservative product metadata match from a Tesco search page."""
    product_match = re.search(r'href="(?P<path>/groceries/en-GB/products/[^"]+)"', html)
    title_match = re.search(r'<title>(?P<title>.*?)</title>', html, flags=re.IGNORECASE | re.DOTALL)
    image_match = re.search(r'(https://digitalcontent\.api\.tesco\.com/[^"\s<]+)', html)

    if not product_match:
        return None

    cleaned_item = re.sub(r'\bSubstitutions:\s*On\b', '', item_name, flags=re.IGNORECASE).strip()
    metadata: Dict[str, Any] = {
        'title': cleaned_item,
        'productUrl': urllib.parse.urljoin('https://www.tesco.com', product_match.group('path')),
        'source': 'tesco',
    }
    if image_match:
        metadata['imageUrl'] = image_match.group(1)
    if title_match:
        title = re.sub(r'\s+', ' ', re.sub(r'<.*?>', '', title_match.group('title'))).strip()
        if title and 'tesco' not in title.lower():
            metadata['description'] = title
    return metadata


def fetch_tesco_product_metadata(item_name: str, timeout: float = PRODUCT_ENRICHMENT_TIMEOUT_SECONDS) -> Optional[Dict[str, Any]]:
    """Best-effort Tesco website metadata fetch.

    Uses normal public Tesco search pages only. Failures, 403s, rate limits, and
    no confident match return None so dashboard generation can keep truthful
    fallback data.
    """
    cleaned = re.sub(r'\bSubstitutions:\s*On\b', '', item_name, flags=re.IGNORECASE).strip()
    if not cleaned:
        return None
    search_url = 'https://www.tesco.com/groceries/en-GB/search?query=' + urllib.parse.quote(cleaned)
    request = urllib.request.Request(search_url, headers={'User-Agent': 'Mozilla/5.0 meals-dashboard product enrichment'})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            html = response.read(500_000).decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"  ⚠ Tesco product enrichment fallback for {cleaned}: {e}")
        return None
    return _extract_tesco_product_metadata(cleaned, html, search_url)


def enrich_order_items_with_product_metadata(
    items: list,
    cache_path: Path = PRODUCT_METADATA_CACHE,
    fetcher: Callable[[str], Optional[Dict[str, Any]]] = fetch_tesco_product_metadata,
    delay_seconds: float = PRODUCT_ENRICHMENT_DELAY_SECONDS,
) -> list:
    """Return order items with optional generated Tesco product metadata.

    Existing item metadata is preserved. Failed/unmatched enrichment keeps the
    original item unchanged; it never fabricates product details.
    """
    if os.environ.get('MEALS_PRODUCT_ENRICHMENT', '1') == '0':
        return items

    cache = _read_product_metadata_cache(cache_path)
    changed_cache = False
    enriched_items = []

    for item in items:
        enriched = dict(item)
        existing_metadata = enriched.get('productMetadata') or enriched.get('product_metadata')
        if isinstance(existing_metadata, dict) and existing_metadata:
            enriched['productMetadata'] = existing_metadata
            enriched_items.append(enriched)
            continue

        item_name = str(enriched.get('name', '')).strip()
        cache_key = _product_cache_key(item_name)
        metadata = cache.get(cache_key)
        if metadata is None:
            try:
                metadata = fetcher(item_name)
            except Exception as e:
                print(f"  ⚠ Tesco product enrichment fallback for {item_name}: {e}")
                metadata = None
            if metadata:
                cache[cache_key] = metadata
                changed_cache = True
            if delay_seconds > 0:
                time.sleep(delay_seconds)

        if metadata:
            enriched['productMetadata'] = metadata
        enriched_items.append(enriched)

    if changed_cache:
        _write_product_metadata_cache(cache, cache_path)
    return enriched_items


def run_command(cmd: list, timeout: int = 60, cwd: Path = None) -> Tuple[bool, str]:
    """Run a command and return success, output."""
    try:
        result = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True, 
            timeout=timeout, 
            shell=False,
            cwd=cwd
        )
        return result.returncode == 0, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return False, "Command timed out"
    except Exception as e:
        return False, str(e)


ASHLEE_LUNCH_SECTION_ID = "6gJfvHHqHrCMPcp9"

def fetch_meal_plan(days: int = 7) -> Tuple[bool, str]:
    """Fetch meal plan from Todoist."""
    print(f"  Fetching meal plan (next {days} days)...")
    
    from datetime import date, timedelta
    start = date.today()
    end = start + timedelta(days=days)
    
    cmd = [
        "python3",
        str(MEALS_SKILL_PATH / "scripts" / "grocery" / "fetch-meal-plan.py"),
        "--start-date", str(start),
        "--end-date", str(end)
    ]
    
    success, output = run_command(cmd, timeout=90)
    if success:
        print(f"  ✓ Meal plan fetched")
        return True, output
    else:
        print(f"  ⚠ Meal plan fetch returned: {output[:200]}")
        return True, output


def fetch_tesco_receipt(days: int = 14) -> Tuple[bool, str]:
    """Fetch latest Tesco order from Gmail."""
    print(f"  Fetching Tesco receipt (last {days} days)...")
    
    cmd = [
        "python3",
        str(MEALS_SKILL_PATH / "scripts" / "fetch_order.py"),
        "--account", "danny@tsang.uk",
        "--days", str(days),
        "--json"
    ]
    
    success, output = run_command(cmd, timeout=120)
    if success:
        print(f"  ✓ Tesco receipt fetched")
        return True, output
    else:
        print(f"  ✗ Failed: {output[:200]}")
        return False, output


def read_cache_json(path: Path) -> Optional[Dict]:
    """Read a JSON cache file."""
    if not path.exists():
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except Exception as e:
        print(f"  ⚠ Error reading {path}: {e}")
        return None


def get_latest_order(receipt_data: Dict) -> Optional[Dict]:
    """Get the most recent order from receipt data.
    
    The cache has two keys:
    - orders: all orders, but many have empty items
    - selected: orders with items, sorted by date (most recent last)
    """
    if not receipt_data:
        return None
    
    # Use 'selected' if available (has items), otherwise fall back to 'orders'
    for key in ['selected', 'orders']:
        if key in receipt_data and receipt_data[key]:
            # Find the last order with items
            for order in reversed(receipt_data[key]):
                if order.get('items'):
                    return order
    
    return None


# Keywords that indicate a primary ingredient match at start of item name
_PRIMARY_INGREDIENT_KEYWORDS = {
    'chicken', 'beef', 'pork', 'lamb', 'turkey', 'duck', 'fish', 'salmon',
    'cod', 'tuna', 'prawn', 'shrimp', 'rice', 'pasta', 'potato', 'chips',
    'onion', 'garlic', 'carrot', 'broccoli', 'pepper', 'mushroom', 'tomato',
    'cheese', 'milk', 'cream', 'butter', 'egg', 'bread', 'flour',
    'sugar', 'salt', 'oil', 'vinegar', 'noodles', 'flatbread',
    # Common secondary ingredients
    'tomato', 'lemon', 'lime', 'ginger', 'chilli', 'curry', 'soy',
    'honey', 'mustard', 'mayo', 'mayonnaise', 'ketchup', 'bbq',
    'bacon', 'ham', 'sausage', 'steak', 'mince', 'chorizo',
    'sweetcorn', 'peas', 'beans', 'lentil', 'chickpea',
    'coconut', 'almond', 'walnut', 'cashew', 'pine nut',
    'basil', 'oregano', 'thyme', 'rosemary', 'mint', 'coriander', 'parsley',
    'cumin', 'paprika', 'cinnamon', 'nutmeg', 'turmeric', 'curry powder',
}

# Keywords that indicate the item is a prepared/compound dish (weak match for ingredients)
_COMPOUND_DISH_KEYWORDS = {
    'soup', 'sauce', 'curry', 'stew', 'casserole', 'ready meal', 'readymeal',
    'sandwich', 'sarnie', 'wrap', 'pitta', 'pizza', 'pasta', 'noodles',
    'salad', 'smoothie', 'juice', 'drink', 'shake', 'ice cream', 'icecream',
    'cake', 'biscuit', 'cookie', 'chocolate', 'sweet', 'snack',
    'meal deal', 'lunch special', 'dinner special',
}

# Brand prefixes to skip when checking word positions
_BRAND_PREFIXES = {'tesco', 'sainsbury', 'asda', 'morrisons', 'waitrose', 'co-op', 'aldi', 'lidl', 'iceland'}



def _is_weak_match(ingredient_name: str, item_name: str) -> bool:
    """Check if a match is weak (ingredient is a minor word in a compound dish).
    
    Returns True if the match should be rejected because the ingredient
    appears to be a minor component of a prepared dish rather than the
    main ingredient.
    """
    ing_lower = ingredient_name.lower()
    item_lower = item_name.lower()
    
    # Check if item is a compound dish - if so, ingredient appearing in it is weak
    for keyword in _COMPOUND_DISH_KEYWORDS:
        if keyword in item_lower:
            return True
    
    return False


def find_receipt_item_match(ingredient_name: str, receipt_items: list) -> Optional[Dict]:
    """Find the best matching receipt item for an ingredient name.
    
    Uses strict substring matching with these rules:
    1. For primary ingredient keywords, prefer matches where ingredient appears early in item name
    2. Reject compound dishes (soup, sauce, ready meals) as ingredient matches
    3. Prefer exact matches and matches where ingredient is a main descriptor
    """
    ingredient_lower = ingredient_name.lower()
    
    # Split into words for analysis
    ing_words = ingredient_lower.split(" ")
    primary_word = ing_words[0] if ing_words else ingredient_lower
    
    def _get_meaningful_words(item_name: str) -> list:
        """Get words after brand prefix."""
        words = item_name.lower().split()
        # Skip brand prefix if present
        if words and words[0] in _BRAND_PREFIXES:
            words = words[1:]
        return words
    
    def _word_position(item_name: str, word: str) -> int:
        """Get position of word in item name (0-indexed, after brand prefix)."""
        words = _get_meaningful_words(item_name)
        for i, w in enumerate(words):
            if w.startswith(word):
                return i
        return 999  # Not found
    
    best_match = None
    best_match_score = 0
    
    for item in receipt_items:
        item_lower = item.get("name", "").lower()
        item_words = _get_meaningful_words(item.get("name", ""))
        
        # Reject weak matches (ingredient inside compound dish)
        if _is_weak_match(ingredient_lower, item_lower):
            continue
        
        score = 0
        
        # Rule 1: For primary ingredients, check position in item name
        if primary_word in _PRIMARY_INGREDIENT_KEYWORDS:
            pos = _word_position(item.get("name", ""), primary_word)
            if pos <= 2:  # Among first 3 meaningful words = strong match
                score = 100 - pos * 10  # Earlier = better
            elif pos <= 4:
                score = 70
        
        # Rule 2: Exact full match
        if ingredient_lower == item_lower:
            score = 95
        
        # Rule 3: Item contained by ingredient (item is more specific)
        elif item_lower in ingredient_lower and len(item_lower) > 3:
            score = 60
        
        # Rule 4: Ingredient word at start of meaningful words (not brand)
        elif any(w.startswith(primary_word) for w in item_words if len(primary_word) > 2):
            score = 50
        
        # Rule 5: Any word from ingredient starts with ingredient (fallback)
        elif any(w.startswith(ing_word) for ing_word in ing_words for w in item_words if len(ing_word) > 2):
            score = 40
        
        if score > best_match_score:
            best_match_score = score
            best_match = item
    
    return best_match


def read_dashboard_cache() -> Optional[Dict]:
    """Read pre-generated dashboard data from meals check cache.
    
    This is the preferred source when available, as it contains
    the full analysis from the meals check (with manual overrides,
    restaurant detection, etc.) in one place.
    """
    return read_cache_json(DASHBOARD_CACHE)


def resolve_matched_items_for_dashboard(matched_items, raw_items):
    """Resolve cached matched items into dashboard MatchedItem records.

    New cache entries carry receipt details directly as dicts. Older cache entries are
    strings and are resolved against the visible receipt items when possible.
    """
    resolved_matched_items = []
    for matched_item in matched_items or []:
        if isinstance(matched_item, dict):
            item_name = matched_item.get("name") or matched_item.get("product_name") or matched_item.get("ingredient") or ""
            resolved_item = {
                "ingredient": item_name,
                "name": item_name,
                "quantity": matched_item.get("quantity", matched_item.get("qty")),
                "price": matched_item.get("price"),
            }
            product_metadata = matched_item.get("productMetadata") or matched_item.get("product_metadata")
            if isinstance(product_metadata, dict):
                resolved_item["productMetadata"] = product_metadata
            substituted_with = matched_item.get("substitutedWith") or matched_item.get("substituted_with") or matched_item.get("substitution")
            if substituted_with:
                resolved_item["substitutedWith"] = substituted_with
            resolved_matched_items.append(resolved_item)
            continue

        item_name = str(matched_item)
        matched_receipt_item = None
        for ri in raw_items:
            if ri.get('name') == item_name:
                matched_receipt_item = ri
                break

        if matched_receipt_item:
            resolved_matched_items.append({
                "ingredient": item_name,
                "name": matched_receipt_item.get("name", item_name),
                "quantity": matched_receipt_item.get("quantity", 1),
                "price": matched_receipt_item.get("price", 0),
            })
        else:
            # Older string-only cache entries had no receipt details available.
            resolved_matched_items.append({
                "ingredient": item_name,
                "name": item_name,
                "quantity": None,
                "price": None,
            })
    return resolved_matched_items


def update_real_data_ts_from_cache(cache_data: Dict) -> bool:
    """Update lib/real-data.ts from dashboard cache data.
    
    This uses the pre-generated dashboard data which includes
    full coverage analysis with manual overrides and restaurant detection.
    """
    print("  Updating lib/real-data.ts from dashboard cache...")
    
    # Read current file as lines
    with open(REAL_DATA_PATH) as f:
        lines = f.readlines()
    
    # Extract meals and receipt from cache
    meals = cache_data.get("meals", [])
    receipt = cache_data.get("receipt", {})
    meals_check_summary = cache_data.get("meals_check_summary", {})
    
    # Find export line numbers
    receipt_start = None
    receipt_end = None
    meal_plan_start = None
    meal_plan_end = None
    coverage_start = None
    coverage_end = None
    
    for i, line in enumerate(lines):
        if 'export const realLatestOrder: CachedOrder' in line:
            receipt_start = i
        elif 'export const realMealPlan: Meal[]' in line:
            meal_plan_start = i
        elif 'export const realCoverage: MealCoverage[]' in line:
            coverage_start = i
    
    # Find end markers separately (only look for them after start lines)
    for i, line in enumerate(lines):
        stripped = line.strip()
        if receipt_start is not None and receipt_end is None and i > receipt_start and stripped == '};':
            receipt_end = i
        elif meal_plan_start is not None and meal_plan_end is None and i > meal_plan_start and stripped == '];':
            meal_plan_end = i
        elif coverage_start is not None and coverage_end is None and i > coverage_start and (stripped == '];' or stripped == '};'):
            coverage_end = i
            break
    
    # Update receipt data
    if receipt and receipt_start is not None and receipt_end is not None:
        # Filter items to only include fields that CachedOrder expects
        raw_items = receipt.get("items", [])
        raw_items = enrich_order_items_with_product_metadata(raw_items)
        receipt["items"] = raw_items
        top_level_substitutions = receipt.get("substitutions", []) or []
        substitutions_by_original = {}
        for sub in top_level_substitutions:
            original = sub.get("original") or sub.get("name")
            substitute = sub.get("substitutedWith") or sub.get("substituted_with") or sub.get("substitution")
            if isinstance(substitute, dict):
                substitute = substitute.get("name") or substitute.get("product") or substitute.get("title")
            if original and substitute:
                substitutions_by_original[str(original).lower()] = str(substitute)

        items = []
        for i in raw_items:
            item = {"name": i.get("name", ""), "quantity": i.get("quantity", 1), "price": i.get("price", 0)}
            product_metadata = i.get("productMetadata") or i.get("product_metadata")
            if isinstance(product_metadata, dict):
                item["productMetadata"] = product_metadata
            substituted_with = i.get("substitutedWith") or i.get("substituted_with") or i.get("substitution")
            if isinstance(substituted_with, dict):
                substituted_with = substituted_with.get("name") or substituted_with.get("product") or substituted_with.get("title")
            substituted_with = substituted_with or substitutions_by_original.get(str(item["name"]).lower())
            if substituted_with:
                item["substitutedWith"] = str(substituted_with)
            items.append(item)
        items_json = json.dumps(items, indent=4)
        order_total = receipt.get("total", 0)
        order_block = [
            f'export const realLatestOrder: CachedOrder = {{',
            f'  "email_id": "",',
            f'  "email_date": "",',
            f'  "delivery_date": "{receipt.get("delivery_date", "")}",',
            f'  "delivery_sort": "",',
            f'  "order_number": "{receipt.get("order_number", "")}",',
            f'  "order_total": {json.dumps(order_total)},',
            f'  "items": {items_json}',
            '};',
            '',
        ]
        lines = lines[:receipt_start] + [l + '\n' for l in order_block] + lines[receipt_end+1:]
        print(f"  ✓ Updated receipt data ({len(items)} items, total £{order_total:.2f})")

    # Update meals-check-aligned headline metrics
    if meals_check_summary:
        summary_json = json.dumps(meals_check_summary, indent=2)
        summary_block = [
            f'export const realMealsCheckSummary = {summary_json};',
            '',
        ]

        summary_start = None
        summary_end = None
        receipt_transform_idx = None
        for i, line in enumerate(lines):
            if 'export const realReceipt = transformCachedOrder(realLatestOrder);' in line:
                receipt_transform_idx = i
            elif 'export const realMealsCheckSummary =' in line:
                summary_start = i
            elif summary_start is not None and summary_end is None and line.strip() == '};':
                summary_end = i
                break

        if summary_start is not None and summary_end is not None:
            lines = lines[:summary_start] + [l + '\n' for l in summary_block] + lines[summary_end+1:]
        elif receipt_transform_idx is not None:
            insert_at = receipt_transform_idx + 1
            while insert_at < len(lines) and lines[insert_at].strip() == '':
                insert_at += 1
            lines = lines[:insert_at] + [l + '\n' for l in summary_block] + lines[insert_at:]
        print("  ✓ Updated meals check summary data")

        delivery_metadata = cache_data.get("delivery_metadata", [])
        delivery_block = [
            f'export const realDeliveryMetadata: GeneratedDeliveryMetadata[] = {json.dumps(delivery_metadata, indent=2)};',
            'export const realDeliveryWindows: DeliveryWindow[] = deliveryWindowsFromMetadata(realDeliveryMetadata);',
            '',
        ]
        delivery_start = None
        delivery_end = None
        for i, line in enumerate(lines):
            if 'export const realDeliveryMetadata:' in line:
                delivery_start = i
            elif delivery_start is not None and delivery_end is None and line.strip().startswith('export const realDeliveryWindows:'):
                delivery_end = i
                break
        if delivery_start is not None and delivery_end is not None:
            lines = lines[:delivery_start] + [l + '\n' for l in delivery_block] + lines[delivery_end+1:]
        elif summary_start is not None:
            insert_at = summary_end + 1 if summary_end is not None else summary_start + 1
            lines = lines[:insert_at] + [l + '\n' for l in ['', *delivery_block]] + lines[insert_at:]
        print(f"  ✓ Updated delivery metadata ({len(delivery_metadata)} events)")
    
    # Update meal plan and coverage
    if meals:
        # Get receipt items for matching
        raw_items = receipt.get("items", []) if receipt else []
        
        # Format meals for real-data.ts - convert cache format to Meal array
        meals_block = []
        coverage_block = []
        
        for m in meals:
            meal_entry = {
                "id": m.get("id", ""),
                "content": m.get("content", ""),
                "date": m.get("date", ""),
                "labels": m.get("labels", []),
                "section": m.get("section", "Planned"),
            }
            if m.get("meal_type"):
                meal_entry["meal_type"] = m["meal_type"]
            if m.get("is_completed"):
                meal_entry["is_completed"] = True
                if m.get("completed_at"):
                    meal_entry["completed_at"] = m["completed_at"]
            meals_block.append(meal_entry)
            
            # Use matched item names directly from cache (already resolved by meal_coverage)
            # No need to re-run find_receipt_item_match() - meal_coverage already did the resolution
            matched_ingredient_names = m.get("matched_items", [])
            resolved_matched_items = resolve_matched_items_for_dashboard(matched_ingredient_names, raw_items)
            
            # Build coverage entry with resolved items
            coverage_entry = {
                "meal": meal_entry,
                "status": m.get("status", "unknown"),
                "coverageScore": m.get("coverage_score", 0),
                "matchedItems": resolved_matched_items,
                "missingItems": m.get("missing_items", []),
                "missingExplanations": m.get("missing_explanations", []),
            }
            if m.get("notes"):
                coverage_entry["notes"] = m["notes"]
            coverage_block.append(coverage_entry)
        
        # Recalculate line indices after receipt update
        meal_plan_start = None
        meal_plan_end = None
        coverage_start = None
        coverage_end = None
        for i, line in enumerate(lines):
            if 'export const realMealPlan: Meal[]' in line:
                meal_plan_start = i
            elif meal_plan_start is not None and meal_plan_end is None and line.strip() == '];':
                meal_plan_end = i
            elif 'export const realCoverage: MealCoverage[]' in line:
                coverage_start = i
            elif coverage_start is not None and coverage_end is None and line.strip() == '];':
                coverage_end = i
        
        meals_json = json.dumps(meals_block, indent=2)
        meals_lines = [f'export const realMealPlan: Meal[] = {meals_json};', '']
        
        if meal_plan_start is not None and meal_plan_end is not None:
            lines = lines[:meal_plan_start] + [l + '\n' for l in meals_lines] + lines[meal_plan_end+1:]
            print(f"  ✓ Updated meal plan data ({len(meals)} meals)")
        
        # Recalculate indices again
        coverage_start = None
        coverage_end = None
        for i, line in enumerate(lines):
            if 'export const realCoverage: MealCoverage[]' in line:
                coverage_start = i
                # Check if this line contains `= [];` - single-line empty array format
                if '= [];' in line:
                    coverage_end = i
                    break
            elif coverage_start is not None and coverage_end is None:
                stripped = line.strip()
                if stripped == '];' or stripped == '};':
                    # End of array literal
                    coverage_end = i
                    break
        
        coverage_json = json.dumps(coverage_block, indent=2)
        coverage_lines = [f'export const realCoverage: MealCoverage[] = {coverage_json};', '']
        
        if coverage_start is not None and coverage_end is not None:
            lines = lines[:coverage_start] + [l + '\n' for l in coverage_lines] + lines[coverage_end+1:]
            print(f"  ✓ Updated coverage data ({len(coverage_block)} entries)")
    
    # Write back
    with open(REAL_DATA_PATH, 'w') as f:
        f.writelines(lines)
    
    print("  ✓ Saved changes to real-data.ts")
    return True


def update_real_data_ts(receipt_data: Dict, meal_plan_data: Dict) -> bool:
    """Update lib/real-data.ts with fresh data.
    
    DEPRECATED: This is the legacy path. Prefer update_real_data_ts_from_cache()
    which uses pre-generated dashboard data from meals check.
    """
    print("  Updating lib/real-data.ts...")
    
    # Read current file
    with open(REAL_DATA_PATH) as f:
        content = f.read()
    
    # Get the latest order with items
    order = get_latest_order(receipt_data)
    
    if order:
        items_json = json.dumps(order.get("items", []), indent=4)
        
        new_block = f'''export const realLatestOrder: CachedOrder = {{
  "email_id": "{order.get("email_id", "")}",
  "email_date": "{order.get("email_date", "")}",
  "delivery_date": "{order.get("delivery_date", "")}",
  "delivery_sort": "{order.get("delivery_sort", "")}",
  "order_number": "{order.get("order_number", "")}",
  "items": {items_json}
}};'''
        
        # Replace the old block using regex
        pattern = r'export const realLatestOrder: CachedOrder = \{[^}]*"items": \[.*?\]\s*\};'
        new_content = re.sub(pattern, new_block, content, flags=re.DOTALL)
        
        if new_content == content:
            # Try simpler pattern
            new_content = re.sub(
                r'export const realLatestOrder: CachedOrder = \{.*?\};',
                new_block,
                content,
                flags=re.DOTALL
            )
        
        if new_content != content:
            content = new_content
            print(f"  ✓ Updated receipt data ({len(order.get('items', []))} items)")
        else:
            print("  ⚠ Could not find realLatestOrder pattern")
    else:
        print("  ⚠ No order with items found in cache")
    
    # Update meal plan if available
    if meal_plan_data and "meals" in meal_plan_data:
        meals_json = json.dumps(meal_plan_data["meals"], indent=2)
        
        new_content = re.sub(
            r'export const realMealPlan: Meal\[\] = \[.*?\];',
            f'export const realMealPlan: Meal[] = {meals_json};',
            content,
            flags=re.DOTALL
        )
        
        if new_content != content:
            content = new_content
            print("  ✓ Updated meal plan data")
    
    # Write back
    with open(REAL_DATA_PATH, 'w') as f:
        f.write(content)
    
    print("  ✓ Saved changes to real-data.ts")
    return True


def build_dashboard() -> Tuple[bool, str]:
    """Build the Next.js dashboard."""
    print("  Building dashboard...")
    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=DASHBOARD_PATH,
        capture_output=True,
        text=True,
        timeout=180
    )
    if result.returncode != 0:
        print("  ✗ Build failed")
        return False, result.stderr[-500:]
    print("  ✓ Build complete")
    return True, ""


def trigger_vercel_deploy() -> Tuple[bool, str]:
    """Trigger a production deployment via Vercel CLI."""
    print("  Running: npx vercel --prod --yes")
    try:
        result = subprocess.run(
            ["npx", "vercel", "--prod", "--yes"],
            cwd=DASHBOARD_PATH,
            capture_output=True,
            text=True,
            timeout=180,
            shell=False
        )
        if result.returncode == 0:
            output = result.stdout + result.stderr
            for line in output.split("\n"):
                if "Production:" in line or "meals-dashboard" in line:
                    print(f"  {line.strip()}")
            return True, ""
        else:
            return False, result.stderr[-300:] or result.stdout[-300:]
    except subprocess.TimeoutExpired:
        return False, "Deploy timed out after 180s"
    except Exception as e:
        return False, str(e)


def post_dashboard_data_to_api(payload: Dict[str, Any], api_url: str, secret: str, dry_run: bool = False) -> Tuple[bool, Dict[str, Any]]:
    """POST dashboard data to the dashboard's private API endpoint.

    When dry_run=True the request is sent to the split-layout endpoint with `?dryRun=1`.
    The server computes hashes and reports what would change, but performs no Blob writes.
    """
    if not api_url:
        return False, {"error": "DASHBOARD_DATA_API_URL not configured"}
    if not secret:
        return False, {"error": "DASHBOARD_DATA_SECRET not configured"}

    effective_url = api_url
    if dry_run:
        separator = '&' if '?' in api_url else '?'
        effective_url = f"{api_url}{separator}dryRun=1"

    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        effective_url,
        data=data,
        headers={
            'Content-Type': 'application/json',
            'x-dashboard-secret': secret,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode('utf-8')
            parsed = json.loads(body) if body else {}
            if resp.status in (200, 201):
                if dry_run:
                    print("  ✓ Dashboard split-layout dry-run accepted")
                else:
                    print("  ✓ Dashboard split-layout stored to Blob")
                return True, parsed
            return False, {"error": f"API returned {resp.status}", "body": body[:500]}
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8') if e.fp else ''
        parsed = {}
        try:
            parsed = json.loads(body) if body else {}
        except Exception:
            parsed = {"body": body[:500]}
        if e.code == 401:
            return False, {"error": "Unauthorized (check DASHBOARD_DATA_SECRET)", **parsed}
        return False, {"error": f"HTTP {e.code}", **parsed}
    except Exception as e:
        return False, {"error": f"POST failed: {e}"}


def compute_delivery_windows(delivery_metadata: list) -> list:
    """Compute DeliveryWindow entries from raw delivery metadata (shape matches TS DeliveryWindow)."""
    windows = []
    for event in (delivery_metadata or []):
        actual = event.get("actual_delivery_date")
        if not actual:
            continue
        usable = event.get("delivery_usable_date", actual)
        windows.append({
            "date": actual,
            "slot": event.get("slot", ""),
            "orderTotal": event.get("order_total", 0),
            "status": event.get("status", "pending"),
            "usableDate": usable,
            "summary": event.get("summary", f"Delivery {actual}"),
        })
    return windows


def build_dashboard_payload(cache_data: Dict) -> Dict[str, Any]:
    """Build the split-layout dashboard payload for POSTing to /api/dashboard-sync.

    Output shape matches the new server-side route:
      {
        orders: [{...orderBlob, orderBlobPath}],
        coverage: [{...coverageBlob, coverageBlobPath}],
        summary: {...},
        deliveryWindows: [...],
        coverageWindow: ["YYYY-MM-DD", ...]
      }

    Notes:
    - 016/017 in this turn only require the current latest receipt to be projected into
      one order blob. Historical-order backfill arrives naturally as future syncs post
      new order blobs; no migration script is bundled into this step.
    - Coverage is grouped by meal-date into one `coverage/{date}.json` blob per date.
    - The read path flattens these per-date coverage blobs back into the existing
      `DashboardData.coverage: MealCoverage[]` shape for the client.
    """
    meals = cache_data.get("meals", [])
    receipt = dict(cache_data.get("receipt", {}) or {})
    meals_check_summary = dict(cache_data.get("meals_check_summary", {}) or {})
    delivery_metadata = cache_data.get("delivery_metadata", []) or []

    # Enrich receipt items with product metadata before sending.
    raw_items = receipt.get("items", []) or []
    if raw_items:
        raw_items = enrich_order_items_with_product_metadata(raw_items)
        receipt["items"] = raw_items

    delivery_date = receipt.get("delivery_date") or meals_check_summary.get("delivery_date") or ""
    order_number = receipt.get("order_number") or "unknown-order"
    order_blob_path = f"orders/{delivery_date}/{order_number}.json" if delivery_date else f"orders/unknown/{order_number}.json"

    orders = []
    if receipt:
        # Spec 018 — order status tracking. The Python pipeline projects the
        # `status` field onto the receipt (see `write_dashboard_cache`); honour
        # that here so the OrderBlob gets the right value. Fall back to a
        # status derived from `email_type` for backwards compatibility with
        # older dashboard caches.
        receipt_email_type = receipt.get("email_type") or ""
        if receipt.get("status") in {"active", "cancelled", "superseded", "refunded"}:
            order_status = receipt["status"]
        elif receipt_email_type == "cancelled":
            order_status = "cancelled"
        elif receipt_email_type == "refund":
            order_status = "refunded"
        else:
            order_status = "active"

        orders.append({
            "orderNumber": order_number,
            "deliveryDate": delivery_date,
            "deliverySlot": receipt.get("delivery_slot", ""),
            "orderTotal": receipt.get("total", meals_check_summary.get("order_total", 0)),
            "items": raw_items,
            "substitutions": receipt.get("substitutions", []) or [],
            "unavailable": receipt.get("unavailable", []) or [],
            "shortLifeItems": receipt.get("short_life_items", []) or [],
            "status": order_status,
            "orderBlobPath": order_blob_path,
        })

    grouped_by_date = {}
    for m in meals:
        meal_date = m.get("date", "")
        if not meal_date:
            continue
        grouped_by_date.setdefault(meal_date, []).append(m)

    coverage = []
    for meal_date in sorted(grouped_by_date.keys()):
        grouped_meals = []
        for m in grouped_by_date[meal_date]:
            meal_entry = {
                "id": m.get("id", ""),
                "content": m.get("content", ""),
                "date": meal_date,
                "labels": m.get("labels", []),
                "section": m.get("section", "Planned"),
            }
            if m.get("meal_type"):
                meal_entry["meal_type"] = m["meal_type"]
            if m.get("is_completed"):
                meal_entry["is_completed"] = True
                if m.get("completed_at"):
                    meal_entry["completed_at"] = m["completed_at"]

            matched_input = m.get("matched_items", [])
            resolved_matched = resolve_matched_items_for_dashboard(matched_input, raw_items or [])
            coverage_entry = {
                "meal": meal_entry,
                "status": m.get("status", "unknown"),
                "coverageScore": m.get("coverage_score", 0),
                "matchedItems": resolved_matched,
                "missingItems": m.get("missing_items", []),
                "missingExplanations": m.get("missing_explanations", []),
            }
            if m.get("notes"):
                coverage_entry["notes"] = m["notes"]
            grouped_meals.append(coverage_entry)

        coverage.append({
            "date": meal_date,
            "sourceOrderBlobPath": order_blob_path if orders else None,
            "meals": grouped_meals,
            "coverageBlobPath": f"coverage/{meal_date}.json",
        })

    delivery_windows = compute_delivery_windows(delivery_metadata)
    coverage_window = sorted(grouped_by_date.keys())

    return {
        "orders": orders,
        "coverage": coverage,
        "summary": meals_check_summary,
        "deliveryWindows": delivery_windows,
        "coverageWindow": coverage_window,
    }


def main():
    parser = argparse.ArgumentParser(description="Sync dashboard data from Todoist and Tesco to Vercel Blob")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be posted without making changes")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--skip-fetch", action="store_true", help="Skip fetching, just use cached data")
    parser.add_argument("--message", "-m", help="Custom commit message (ignored)")
    parser.add_argument("--no-build", action="store_true", help="Skip build step")
    parser.add_argument("--force-deploy", action="store_true", help="Trigger Vercel deploy even on dry-run")
    args = parser.parse_args()

    print("=" * 50)
    print("DASHBOARD DATA SYNC (Blob)")
    print("=" * 50)
    print()

    # Read dashboard cache from meals check
    dashboard_cache = read_dashboard_cache()

    if not dashboard_cache:
        print("[1] No dashboard cache found.")
        print("  Run meals-check first to generate the cache.")
        return 1

    print("[1] Found dashboard cache")
    print(f"  Cache generated: {dashboard_cache.get('generated_at', 'unknown')}")
    print(f"  Meals: {len(dashboard_cache.get('meals', []))}")
    print(f"  Receipt items: {len(dashboard_cache.get('receipt', {}).get('items', []))}")
    print()

    # Build payload
    print("[2] Building dashboard split-layout payload...")
    payload = build_dashboard_payload(dashboard_cache)
    print(f"  Order blobs: {len(payload['orders'])}")
    print(f"  Coverage blobs: {len(payload['coverage'])}")
    print(f"  Delivery windows: {len(payload['deliveryWindows'])}")
    print(f"  Coverage window dates: {len(payload['coverageWindow'])}")
    print()

    # POST to dashboard API
    print("[3] Posting data to dashboard Blob API...")
    api_url = os.environ.get("DASHBOARD_DATA_API_URL", "")
    secret = os.environ.get("MEALS_DASHBOARD_DATA_SECRET", "")
    # Default to the production split-layout API
    if not api_url:
        api_url = "https://meals-dashboard.vercel.app/api/dashboard-sync"
    success, response = post_dashboard_data_to_api(payload, api_url, secret, dry_run=args.dry_run)
    if not success:
        print(f"  ✗ Failed to post data: {response.get('error', 'unknown error')}")
        detail = response.get('detail') or response.get('body')
        if detail:
            print(f"    {str(detail)[:300]}")
        return 1
    print(f"  Manifest path: {response.get('manifestPath', 'n/a')}")
    if 'written' in response or 'skipped' in response:
        print(f"  Written: {len(response.get('written', []))} | Skipped: {len(response.get('skipped', []))} | Total ops: {response.get('totalOps', 'n/a')}")
    print()

    if args.dry_run:
        print("[dry-run] Split-layout API exercised successfully.")
        print("  No Blob writes, commits, pushes, or deployments were performed.")
        return 0

    # Build dashboard (unless skipped)
    if not args.no_build:
        print("[4] Building dashboard...")
        build_ok, build_error = build_dashboard()
        if not build_ok:
            print(f"  ✗ Build failed: {build_error}")
            return 1
        print()
    else:
        print("[4] Skipping build (--no-build)")
        print()

    # Trigger Vercel deploy
    print("[5] Triggering Vercel production deployment...")
    deploy_ok, deploy_error = trigger_vercel_deploy()
    if not deploy_ok:
        print(f"  ⚠ Deploy warning: {deploy_error}")
    else:
        print("  ✓ Deployment triggered")
    print()

    print("=" * 50)
    print("SYNC COMPLETE")
    print("=" * 50)
    return 0


if __name__ == "__main__":
    sys.exit(main())
