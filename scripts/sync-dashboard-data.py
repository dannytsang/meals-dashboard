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
RECEIPT_CACHE = MEALS_SKILL_PATH / 'data' / 'receipt_coverage_cache.json'
MEAL_PLAN_CACHE = MEALS_SKILL_PATH / 'data' / 'meal-plan-cache.json'


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
        "--end-date", str(end),
        "--json"
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


def update_real_data_ts(receipt_data: Dict, meal_plan_data: Dict) -> bool:
    """Update lib/real-data.ts with fresh data."""
    print("  Updating lib/real-data.ts...")
    
    # Read current file
    with open(REAL_DATA_PATH) as f:
        content = f.read()
    
    # Update the receipt data
    if receipt_data and "orders" in receipt_data and receipt_data["orders"]:
        order = receipt_data["orders"][0]
        
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
            print("  ✓ Updated receipt data")
        else:
            print("  ⚠ Could not find realLatestOrder pattern")
    
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
    
    # Step 1: Fetch fresh data (unless skipped)
    receipt_data = None
    meal_plan_data = None
    
    if not args.skip_fetch:
        print("[1] Fetching fresh data...")
        
        # Fetch Tesco receipt
        _, _ = fetch_tesco_receipt(days=14)
        print()
        
        # Fetch meal plan
        _, _ = fetch_meal_plan(days=7)
        print()
    else:
        print("[1] Skipping fetch (--skip-fetch)")
        print()
    
    # Step 2: Read cached data
    print("[2] Reading cached data...")
    receipt_data = read_cache_json(RECEIPT_CACHE)
    meal_plan_data = read_cache_json(MEAL_PLAN_CACHE)
    
    print(f"  Receipt: {'found' if receipt_data else 'not found'}")
    print(f"  Meal plan: {'found' if meal_plan_data else 'not found'}")
    
    if not receipt_data and not meal_plan_data:
        print("\n  ✗ No data found. Exiting.")
        return
    
    print()
    
    # Step 3: Update real-data.ts
    print("[3] Updating dashboard data...")
    update_real_data_ts(receipt_data, meal_plan_data)
    print()
    
    # Step 4: Build (unless skipped)
    if not args.no_build and not args.dry_run:
        print("[4] Building dashboard...")
        success, error = build_dashboard()
        if not success:
            print(f"  ✗ Build failed: {error}")
            return
        print()
    
    # Step 5: Commit and push
    print("[5] Committing and pushing...")
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