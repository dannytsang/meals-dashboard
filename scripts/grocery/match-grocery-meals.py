#!/usr/bin/env python3
"""
Match grocery items to meal plan tasks.
Takes grocery items JSON and meal plan JSON, outputs match analysis.
Tracks quantity consumption across matched meals.
"""

import sys
import json
import re
import yaml
from pathlib import Path
from typing import List, Dict, Any
from collections import defaultdict


def load_clarified_patterns() -> List[Dict]:
    """
    Load clarified meal patterns from YAML config
    
    Returns:
        List of pattern dicts with regex patterns and reasons
    """
    try:
        # Find config file relative to script location
        script_dir = Path(__file__).parent
        config_path = script_dir.parent.parent / "config" / "clarified_meals.yaml"

        if not config_path.exists():
            return []
        
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
        
        return config.get('clarified_patterns', [])
    except Exception as e:
        print(f"Warning: Could not load clarified meals config: {e}", file=sys.stderr)
        return []


def is_clarified_meal(meal_name: str, patterns: List[Dict]) -> tuple:
    """
    Check if a meal matches any clarified pattern
    
    Args:
        meal_name: Name of the meal
        patterns: List of pattern dicts from config
        
    Returns:
        (is_clarified: bool, reason: str or None, display_note: str or None)
    """
    meal_lower = meal_name.lower()
    
    for pattern_data in patterns:
        pattern = pattern_data.get('pattern', '')
        if not pattern:
            continue
        
        try:
            if re.search(pattern, meal_lower, re.IGNORECASE):
                return (
                    True,
                    pattern_data.get('reason', 'clarified'),
                    pattern_data.get('display_note', 'Clarified')
                )
        except re.error:
            # Invalid regex, skip
            continue
    
    return False, None, None


# Common ingredient to meal type mappings
INGREDIENT_KEYWORDS = {
    'chicken': ['chicken', 'poultry', 'breast', 'thigh', 'wing', 'drumstick', 'hunters chicken'],
    'beef': ['beef', 'steak', 'mince', 'ground beef', 'stir fry strips'],
    'pork': ['pork', 'bacon', 'ham', 'gammon', 'sausage', 'loin'],
    'lamb': ['lamb', 'lamb mince'],
    'duck': ['duck', 'aromatic duck', 'crispy duck', 'spring roll'],
    'fish': ['fish', 'salmon', 'cod', 'tuna', 'haddock', 'prawn', 'seafood'],
    'tofu': ['tofu', 'grillable tofu', 'cauldron'],
    'pasta': ['pasta', 'spaghetti', 'tagliatelle', 'penne', 'fusilli', 'macaroni', 'noodles', 'lasagna', 'lasagne'],
    'rice': ['rice', 'basmati', 'jasmine', 'long grain'],
    'potato': ['potato', 'potatoes', 'chips', 'mash', 'roast', 'baked', 'parmentier', 'slices'],
    'vegetables': ['veg', 'vegetables', 'broccoli', 'carrot', 'peas', 'beans', 'onion', 'pepper', 'stir fry'],
    'pizza': ['pizza'],
    'chilli': ['chilli', 'kidney beans', 'chili'],
    'bolognese': ['bolognese', 'ragu'],
    'nuggets': ['nuggets', 'fish fingers'],
    'eggs': ['egg', 'eggs'],
    'bread_rolls': ['rolls', 'buns', 'bread rolls', 'hot dog rolls', 'burger buns'],
}

# Meals that can use multiple protein types (mince interchangeable)
# Format: meal_type: {allowed_proteins: protein categories, required_keywords: must contain these words}
FLEXIBLE_MEAL_MAPPINGS = {
    'bolognese': {
        'proteins': ['beef', 'lamb'],
        'required_in_item': ['mince']  # Must be mince, not strips/steak
    },
    'chilli': {
        'proteins': ['beef', 'lamb'],
        'required_in_item': ['mince']  # Must be mince
    },
    'cottage_pie': {
        'proteins': ['beef', 'lamb'],
        'required_in_item': ['mince']  # Cottage/Shepherd's pie use mince
    },
}

# Restricted categories that only match meals with specific keywords
# Format: category: [required meal keywords]
# Duck removed - can match any meal, not just Chinese-specific
RESTRICTED_CATEGORIES = {}

def normalize_text(text: str) -> str:
    """Normalize text for matching."""
    return text.lower().strip()

def find_ingredient_categories(item_name: str) -> List[str]:
    """Find which ingredient categories this item belongs to."""
    import re
    item_lower = normalize_text(item_name)
    categories = []
    
    for category, keywords in INGREDIENT_KEYWORDS.items():
        for keyword in keywords:
            # Use word boundaries for short keywords (3 chars or less) to avoid false matches
            # e.g., "ham" in "Gressingham" or "cod" in "chocolate"
            if len(keyword) <= 3:
                # Require word boundary for short keywords
                pattern = r'\b' + re.escape(keyword) + r'\b'
                if re.search(pattern, item_lower):
                    categories.append(category)
                    break
            else:
                # For longer keywords, substring match is fine
                if keyword in item_lower:
                    categories.append(category)
                    break
    
    return categories

def match_item_to_meals(item: Dict[str, Any], meals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Match a grocery item to potential meals."""
    item_categories = find_ingredient_categories(item['name'])
    matches = []
    
    for meal in meals:
        meal_name = normalize_text(meal['content'])
        matched = False
        matched_cat = None
        
        # Check if any item category appears in meal name
        for category in item_categories:
            # Check if this is a restricted category
            if category in RESTRICTED_CATEGORIES:
                # Restricted category - only match if meal contains required keywords
                required_keywords = RESTRICTED_CATEGORIES[category]
                if any(kw in meal_name for kw in required_keywords):
                    matched = True
                    matched_cat = category
                    break
            else:
                # Normal category matching
                if category in meal_name or any(kw in meal_name for kw in INGREDIENT_KEYWORDS.get(category, [])):
                    matched = True
                    matched_cat = category
                    break
        
        # Check flexible meal mappings (e.g., beef/lamb mince for bolognese)
        if not matched:
            for meal_type, requirements in FLEXIBLE_MEAL_MAPPINGS.items():
                # Check if this meal type is in the meal name
                if meal_type in meal_name or any(kw in meal_name for kw in INGREDIENT_KEYWORDS.get(meal_type, [])):
                    # Check if item meets requirements
                    allowed_proteins = requirements['proteins']
                    required_keywords = requirements.get('required_in_item', [])
                    
                    # Check if item has required keywords (e.g., "mince")
                    item_name_lower = normalize_text(item['name'])
                    has_required = all(kw in item_name_lower for kw in required_keywords)
                    
                    if has_required:
                        # Check if item is one of the allowed proteins
                        for protein in allowed_proteins:
                            if protein in item_categories:
                                matched = True
                                matched_cat = f"{protein} (via {meal_type})"
                                break
                    
                    if matched:
                        break
        
        if matched:
            matches.append({
                'meal': meal['content'],
                'date': meal['date'],
                'matched_category': matched_cat,
                'completed': meal.get('completed', False)
            })
    
    return matches

def calculate_quantity_allocation(items: List[Dict[str, Any]], item_matches: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate how much of each item is allocated to matched meals,
    and how much remains available for new meals.
    """
    # Track quantity by item name
    item_inventory = {}
    for item in items:
        name = item['name']
        qty = item.get('quantity', 1)
        if name not in item_inventory:
            item_inventory[name] = {
                'total_quantity': qty,
                'allocated_quantity': 0,
                'remaining_quantity': qty,
                'item': item
            }
    
    # Allocate quantities to matched meals (1 quantity per match)
    for im in item_matches:
        if im['matched']:
            item_name = im['item']['name']
            num_matches = len(im['matches'])
            
            if item_name in item_inventory:
                # Allocate 1 quantity per matched meal (or all if not enough)
                allocated = min(num_matches, item_inventory[item_name]['remaining_quantity'])
                item_inventory[item_name]['allocated_quantity'] += allocated
                item_inventory[item_name]['remaining_quantity'] -= allocated
    
    return item_inventory

def analyze_matches(items: List[Dict[str, Any]], meals: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze all matches between items and meals, tracking quantities."""
    
    # Load clarified meal patterns
    clarified_patterns = load_clarified_patterns()
    
    # Separate meals into those needing matching vs already clarified
    meals_to_match = []
    clarified_meals = []
    
    for meal in meals:
        is_clarified, reason, display_note = is_clarified_meal(meal.get('content', ''), clarified_patterns)
        if is_clarified:
            clarified_meals.append({
                'meal': meal,
                'reason': reason,
                'display_note': display_note
            })
        else:
            meals_to_match.append(meal)
    
    # Match items to meals (only non-clarified meals)
    item_matches = []
    for item in items:
        matches = match_item_to_meals(item, meals_to_match)
        item_matches.append({
            'item': item,
            'matches': matches,
            'matched': len(matches) > 0
        })
    
    # Calculate quantity allocation
    item_inventory = calculate_quantity_allocation(items, item_matches)
    
    # Enrich matched items with quantity info
    matched_items_enriched = []
    for im in item_matches:
        if im['matched']:
            item_name = im['item']['name']
            inv = item_inventory.get(item_name, {})
            
            enriched = im.copy()
            enriched['quantity_info'] = {
                'total': inv.get('total_quantity', 0),
                'allocated': inv.get('allocated_quantity', 0),
                'remaining': inv.get('remaining_quantity', 0),
                'fully_allocated': inv.get('remaining_quantity', 0) == 0
            }
            matched_items_enriched.append(enriched)
    
    # Find unmatched items (or items with remaining quantity)
    unmatched_items = []
    for im in item_matches:
        item_name = im['item']['name']
        inv = item_inventory.get(item_name, {})
        remaining = inv.get('remaining_quantity', 0)
        
        # Include if not matched OR if matched but has remaining quantity
        if not im['matched'] or remaining > 0:
            unmatched_im = im.copy()
            if remaining > 0:
                # Create a copy with remaining quantity
                unmatched_im['item'] = im['item'].copy()
                unmatched_im['item']['quantity'] = remaining
                unmatched_im['item']['note'] = f"{remaining} of {inv.get('total_quantity', 0)} remaining after matches"
            unmatched_items.append(unmatched_im)
    
    # Find meals without matching items (only from meals that need matching)
    meal_items = defaultdict(list)
    for im in item_matches:
        for match in im['matches']:
            meal_key = f"{match['date']}|{match['meal']}"
            meal_items[meal_key].append(im['item']['name'])
    
    unmatched_meals = []
    for meal in meals_to_match:
        meal_key = f"{meal['date']}|{meal['content']}"
        if meal_key not in meal_items:
            unmatched_meals.append(meal)
    
    return {
        'matched_items': matched_items_enriched,
        'unmatched_items': unmatched_items,
        'unmatched_meals': unmatched_meals,
        'clarified_meals': clarified_meals,
        'item_inventory': item_inventory,
        'summary': {
            'total_items': len(items),
            'matched_items_count': len(matched_items_enriched),
            'unmatched_items_count': len(unmatched_items),
            'fully_allocated_items': sum(1 for inv in item_inventory.values() if inv['remaining_quantity'] == 0),
            'partially_allocated_items': sum(1 for inv in item_inventory.values() if 0 < inv['remaining_quantity'] < inv['total_quantity']),
            'total_meals': len(meals),
            'meals_needing_matching': len(meals_to_match),
            'clarified_meals_count': len(clarified_meals),
            'meals_with_matches': len(meal_items),
            'meals_without_matches': len(unmatched_meals)
        }
    }

def main():
    if len(sys.argv) < 3:
        print("Usage: match-grocery-meals.py <grocery_json> <meals_json>", file=sys.stderr)
        sys.exit(1)
    
    # Load grocery items
    with open(sys.argv[1], 'r') as f:
        grocery_data = json.load(f)
        items = grocery_data.get('items', [])
    
    # Load meal plan
    with open(sys.argv[2], 'r') as f:
        meal_data = json.load(f)
        meals = meal_data.get('meals', [])
    
    # Analyze matches
    analysis = analyze_matches(items, meals)
    
    # Check for bread rolls without corresponding protein (hot dogs/burgers)
    bread_roll_items = []
    hot_dog_sausages = False
    burger_proteins = False
    
    for item in items:
        item_name = item['name'].lower()
        if 'hot dog rolls' in item_name or 'burger buns' in item_name:
            bread_roll_items.append(item)
        elif 'hot dog sausages' in item_name or 'frankfurters' in item_name:
            hot_dog_sausages = True
        elif any(protein in item_name for protein in ['beef mince', 'lamb mince', 'burger patty']):
            burger_proteins = True
    
    # Add warning if bread rolls found without matching protein
    if bread_roll_items and not hot_dog_sausages:
        analysis['bread_roll_warning'] = {
            'message': 'Hot dog rolls found but no sausages detected - do you need to buy sausages?',
            'items': bread_roll_items,
            'suggestion': 'Consider adding hot dog sausages to your shopping list'
        }
    
    if any('burger buns' in item['name'].lower() for item in bread_roll_items) and not burger_proteins:
        analysis['burger_bun_warning'] = {
            'message': 'Burger buns found but no burger protein detected - do you need mince or patties?',
            'items': [item for item in bread_roll_items if 'burger buns' in item['name'].lower()],
            'suggestion': 'Consider adding burger mince or pre-made patties'
        }
    
    # Output as JSON
    print(json.dumps(analysis, indent=2))

if __name__ == '__main__':
    main()
