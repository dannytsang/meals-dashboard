#!/usr/bin/env python3
"""
Fetch enhanced coverage analysis for the dashboard.
Uses the meal_coverage_analyzer from the meals skill.
"""

import sys
import json
from pathlib import Path

# Add scripts directory to path
script_dir = Path(__file__).parent.parent / "scripts"
sys.path.insert(0, str(script_dir / "grocery"))

from meal_coverage_analyzer import analyze_meal_plan_coverage

def main():
    order_json = sys.argv[1] if len(sys.argv) > 1 else None
    meals_json = sys.argv[2] if len(sys.argv) > 2 else None
    
    order_items = []
    if order_json:
        try:
            with open(order_json) as f:
                data = json.load(f)
                order_items = [item.get('name', item.get('item_name', '')) for item in data.get('items', [])]
        except Exception:
            pass
    
    planned_meals = []
    if meals_json:
        try:
            with open(meals_json) as f:
                data = json.load(f)
                planned_meals = data.get('meals', [])
        except Exception:
            pass
    
    # Run analysis
    house_stock = {"categories": {}}
    analyses = analyze_meal_plan_coverage(
        planned_meals=planned_meals,
        order_items=order_items,
        house_stock=house_stock,
        receipt_data=None,
        days_ahead=7
    )
    
    output = [a.to_dict() for a in analyses]
    print(json.dumps(output, indent=2))

if __name__ == "__main__":
    main()