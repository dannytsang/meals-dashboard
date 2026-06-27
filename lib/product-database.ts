/**
 * Product Database for Tesco Items
 *
 * Spec 010 Rev 4 (2026-06-22): the 38-entry hand-curated substring-match
 * fallback was removed. The truthful contract is: if we have per-product
 * generated metadata, show it; if not, the modal shows the placeholder.
 * The `ProductInfo` type and `findProductInfo` function are kept as
 * no-op stubs for back-compat with any external callers — they always
 * return `null` / `{}`. The dashboard code path no longer reads this
 * module. See `lib/dashboard-ui-utils.ts:resolveProductInfoForItem`.
 */

export interface ProductInfo {
  name: string;
  description: string;
  storage: string;
  preparation: string;
  image: string;
  nutrition: string;
}

/**
 * Back-compat: kept as an empty object so any module that destructures
 * or imports the symbol still type-checks. The dashboard code path
 * does NOT read this.
 */
export const productDatabase: Record<string, ProductInfo> = {};

/**
 * Back-compat no-op: always returns `null` because the static substring
 * map was removed in spec 010 Rev 4. Kept so external callers (e.g.
 * older branches / external scripts) do not throw on import.
 */
export function findProductInfo(_itemName: string): ProductInfo | null {
  return null;
}
