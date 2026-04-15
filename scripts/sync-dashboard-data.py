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
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, Tuple

# Base paths - use absolute paths for clarity
BASE_PATH = Path('/home/openclaw/workspace/openclaw')
MEALS_SKILL_PATH = BASE_PATH / 'skills' / 'meals'
DASHBOARD_PATH = BASE_PATH / 'agents' / 'openclaw' / 'meals-dashboard'
REAL_DATA_PATH = DASHBOARD_PATH / 'lib' / 'real-data.ts'
SYNC_META_PATH = DASHBOARD_PATH / 'lib' / 'sync-meta.ts'
RECEIPT_CACHE = MEALS_SKILL_PATH / 'data' / 'receipt_coverage_cache.json'
MEAL_PLAN_CACHE = MEALS_SKILL_PATH / 'data' / 'meal-plan-cache.json'
DASHBOARD_CACHE = MEALS_SKILL_PATH / 'data' / 'dashboard_cache.json'


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
        items = [
            {"name": i.get("name", ""), "quantity": i.get("quantity", 1), "price": i.get("price", 0)}
            for i in raw_items
        ]
        items_json = json.dumps(items, indent=4)
        order_block = [
            f'export const realLatestOrder: CachedOrder = {{',
            f'  "email_id": "",',
            f'  "email_date": "",',
            f'  "delivery_date": "{receipt.get("delivery_date", "")}",',
            f'  "delivery_sort": "",',
            f'  "order_number": "{receipt.get("order_number", "")}",',
            f'  "items": {items_json}',
            '};',
            '',
        ]
        lines = lines[:receipt_start] + [l + '\n' for l in order_block] + lines[receipt_end+1:]
        print(f"  ✓ Updated receipt data ({len(items)} items)")
    
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
            meals_block.append(meal_entry)
            
            # Use matched item names directly from cache (already resolved by meal_coverage)
            # No need to re-run find_receipt_item_match() - meal_coverage already did the resolution
            matched_ingredient_names = m.get("matched_items", [])
            resolved_matched_items = []
            for item_name in matched_ingredient_names:
                # Try to find the item in raw_items to get quantity and price
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
                    # Use the item name directly from cache (already a product name, not just ingredient)
                    resolved_matched_items.append({
                        "ingredient": item_name,
                        "name": item_name,
                        "quantity": None,
                        "price": None,
                    })
            
            # Build coverage entry with resolved items
            coverage_entry = {
                "meal": meal_entry,
                "status": m.get("status", "unknown"),
                "coverageScore": m.get("coverage_score", 0),
                "matchedItems": resolved_matched_items,
                "missingItems": m.get("missing_items", []),
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


def update_sync_meta(timestamp: str) -> bool:
    """Update lib/sync-meta.ts with sync timestamp."""
    print(f"  Updating lib/sync-meta.ts...")
    
    content = f'''// Auto-generated by sync-dashboard-data.py
export const syncMeta = {{
  lastSync: "{timestamp}",
  lastSyncDisplay: "{datetime.now().strftime('%d %b %Y, %H:%M')}"
}};
'''
    
    with open(SYNC_META_PATH, 'w') as f:
        f.write(content)
    
    print("  ✓ Updated sync-meta.ts")
    return True


def get_git_status() -> Tuple[bool, str]:
    """Check if there are uncommitted changes."""
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=DASHBOARD_PATH,
        capture_output=True,
        text=True
    )
    has_changes = bool(result.stdout.strip())
    return has_changes, result.stdout


def commit_and_push(message: str, dry_run: bool = False) -> bool:
    """Commit and push changes."""
    if dry_run:
        print(f"  ⚠ Dry run - not committing")
        return True
    
    print("  Committing changes...")
    
    # Add all changes
    subprocess.run(["git", "add", "-A"], cwd=DASHBOARD_PATH, capture_output=True)
    
    # Check if there are changes to commit
    status = subprocess.run(
        ["git", "status", "--porcelain"], 
        cwd=DASHBOARD_PATH, 
        capture_output=True, 
        text=True
    )
    if not status.stdout.strip():
        print("  ✓ No changes to commit")
        return True
    
    # Commit
    result = subprocess.run(
        ["git", "commit", "-m", message],
        cwd=DASHBOARD_PATH,
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"  ✗ Commit failed: {result.stderr}")
        return False
    
    print(f"  ✓ Committed")
    
    # Push
    result = subprocess.run(
        ["git", "push"],
        cwd=DASHBOARD_PATH,
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"  ✗ Push failed: {result.stderr}")
        return False
    
    print("  ✓ Pushed to origin")
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
        print(f"  ✗ Build failed")
        return False, result.stderr[-500:]
    
    print("  ✓ Build complete")
    return True, ""


def main():
    parser = argparse.ArgumentParser(description="Sync dashboard data from Todoist and Tesco")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without making changes")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--skip-fetch", action="store_true", help="Skip fetching, just use cached data")
    parser.add_argument("--message", "-m", help="Custom commit message")
    parser.add_argument("--no-build", action="store_true", help="Skip build step")
    args = parser.parse_args()
    
    print("=" * 50)
    print("DASHBOARD DATA SYNC")
    print("=" * 50)
    print()
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    
    # Check for dashboard cache from meals check (preferred source)
    dashboard_cache = read_dashboard_cache()
    
    if dashboard_cache:
        print("[1] Found dashboard cache from meals check (using unified data)")
        print(f"  Cache generated: {dashboard_cache.get('generated_at', 'unknown')}")
        print(f"  Meals: {len(dashboard_cache.get('meals', []))}")
        print(f"  Receipt items: {len(dashboard_cache.get('receipt', {}).get('items', []))}")
        print()
        
        # Use cache data directly (no re-analysis needed)
        use_cache = True
    else:
        print("[1] No dashboard cache found, falling back to legacy sync")
        print()
        use_cache = False
        
        # Legacy path: fetch and analyse
        if not args.skip_fetch:
            print("[1a] Fetching fresh data...")
            
            # Fetch Tesco receipt
            _, receipt_output = fetch_tesco_receipt(days=14)
            print()
            
            # Fetch meal plan and parse JSON
            success, meal_plan_output = fetch_meal_plan(days=7)
            if success and meal_plan_output:
                try:
                    meal_plan_data = json.loads(meal_plan_output)
                    if "meals" in meal_plan_data:
                        for meal in meal_plan_data["meals"]:
                            section_id = meal.get("section_id", "")
                            meal["meal_type"] = "lunch" if section_id == ASHLEE_LUNCH_SECTION_ID else "dinner"
                except json.JSONDecodeError as e:
                    print(f"  ⚠ Failed to parse meal plan JSON: {e}")
                    meal_plan_data = None
            print()
        else:
            print("[1a] Skipping fetch (--skip-fetch)")
            print()
        
        # Step 2: Read cached data
        print("[2] Reading cached data...")
        receipt_data = read_cache_json(RECEIPT_CACHE)
        if args.skip_fetch:
            meal_plan_data = read_cache_json(MEAL_PLAN_CACHE)
        
        print(f"  Receipt: {'found' if receipt_data else 'not found'}")
        print(f"  Meal plan: {'found' if meal_plan_data else 'not found'}")
        
        if not receipt_data and not meal_plan_data:
            print("\n  ✗ No data found. Exiting.")
            return
        print()
    
    # Step 3: Update sync metadata
    print("[3] Updating sync metadata...")
    update_sync_meta(timestamp)
    print()
    
    # Step 4: Update real-data.ts
    print("[4] Updating dashboard data...")
    if use_cache:
        update_real_data_ts_from_cache(dashboard_cache)
    else:
        update_real_data_ts(receipt_data, meal_plan_data)
    print()
    
    # Step 5: Build (unless skipped)
    if not args.no_build and not args.dry_run:
        print("[5] Building dashboard...")
        success, error = build_dashboard()
        if not success:
            print(f"  ✗ Build failed: {error}")
            return
        print()
    
    # Step 6: Commit and push
    print("[6] Committing and pushing...")
    has_changes, _ = get_git_status()
    
    if has_changes:
        message = args.message or f"sync: update dashboard data {timestamp}"
        success = commit_and_push(message, dry_run=args.dry_run)
        if not success:
            print("  ✗ Failed to push")
            return
    else:
        print("  ✓ No changes to commit")
    print()
    
    print("=" * 50)
    print("SYNC COMPLETE")
    print("=" * 50)
    
    if args.dry_run:
        print("\n⚠ This was a dry run. No changes were made.")
        print("Run without --dry-run to actually sync and deploy.")


if __name__ == "__main__":
    main()