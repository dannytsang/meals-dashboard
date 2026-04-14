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


def find_receipt_item_match(ingredient_name: str, receipt_items: list) -> Optional[Dict]:
    """Find the best matching receipt item for an ingredient name.
    
    Uses substring matching to find the receipt item that contains or is
    contained by the ingredient name.
    """
    ingredient_lower = ingredient_name.lower()
    
    # First, try exact substring match
    for item in receipt_items:
        item_lower = item.get("name", "").lower()
        if ingredient_lower in item_lower or item_lower in ingredient_lower:
            return item
    
    # Try first word match
    first_word = ingredient_lower.split(" ")[0] if " " in ingredient_lower else ingredient_lower
    if len(first_word) > 2:
        for item in receipt_items:
            item_lower = item.get("name", "").lower()
            if first_word in item_lower:
                return item
    
    return None


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
            
            # Resolve ingredient names to actual receipt item names
            matched_ingredient_names = m.get("matched_items", [])
            resolved_matched_items = []
            for ing_name in matched_ingredient_names:
                matched_receipt_item = find_receipt_item_match(ing_name, raw_items)
                if matched_receipt_item:
                    # Use the actual receipt item name
                    resolved_matched_items.append({
                        "ingredient": ing_name,
                        "name": matched_receipt_item.get("name", ing_name),
                        "quantity": matched_receipt_item.get("quantity", 1),
                        "price": matched_receipt_item.get("price", 0),
                    })
                else:
                    # Keep the ingredient name if no receipt match
                    resolved_matched_items.append({
                        "ingredient": ing_name,
                        "name": ing_name,
                        "quantity": 1,
                        "price": 0,
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