/**
 * Item display utilities for the meals dashboard.
 */

/**
 * Strip "Substitutions: On" and similar suffixes from item names.
 * The raw receipt data embeds "Substitutions: On" in item names, but
 * substitution info is shown separately in the product modal.
 */
export function cleanItemName(name: string): string {
  return name.replace(/\s*Substitutions:\s*On\s*$/i, '').trim();
}

// Spec 019 / FR-04 — re-export the canonical MatchedItem from meals-data
// so this module (and the dashboard client) sees the same shape, including
// the shelf-life + source fields populated by the Python pipeline.
export type { MatchedItem } from './meals-data';

import type { MatchedItem } from './meals-data';

/**
 * Deduplicate matched items by their cleaned name.
 *
 * The meal_coverage module can sometimes return both:
 *   "Tesco Aioli Dip 200G Substitutions: On"
 *   "Tesco Aioli Dip 200G"
 * as separate matched items for the same ingredient.
 * This function deduplicates by cleaned name to avoid showing
 * the same product twice in the meal detail modal.
 */
export function deduplicateMatchedItems(items: MatchedItem[]): MatchedItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = cleanItemName(item.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function calculateMatchedItemsTotal(items: MatchedItem[]): number {
  return items.reduce((total, item) => total + (typeof item.price === 'number' ? item.price : 0), 0);
}
