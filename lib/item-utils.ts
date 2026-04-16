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
export interface MatchedItem {
  ingredient: string;
  name: string;
  quantity: number | null;
  price: number | null;
}

export function deduplicateMatchedItems(items: MatchedItem[]): MatchedItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = cleanItemName(item.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
