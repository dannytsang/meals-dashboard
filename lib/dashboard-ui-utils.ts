import { calculateCoverageSummary, DeliveryWindow, GeneratedProductMetadata, GroceryItem, MatchedItem, MealCoverage, TescoReceipt } from './meals-data';
import { cleanItemName } from './item-utils';
import { findProductInfo } from './product-database';

/** Product metadata TTL in days. Must match PRODUCT_ENRICHMENT_MAX_AGE_DAYS in sync-dashboard-data.py (default 21). */
export const PRODUCT_METADATA_TTL_DAYS = 21;

function _computeExpiresAt(lastFetched: string | undefined): string | undefined {
  if (!lastFetched) return undefined;
  const d = new Date(lastFetched);
  if (isNaN(d.getTime())) return undefined;
  d.setDate(d.getDate() + PRODUCT_METADATA_TTL_DAYS);
  return d.toISOString();
}

export interface CachedOrderItem {
  name: string;
  quantity: number;
  price?: number;
  substitutedWith?: string;
  /** Spec 021 / FR-004 — blob path; resolved to productMetadata at dashboard read time. */
  productBlobPath?: string;
  productMetadata?: GeneratedProductMetadata;
  product_metadata?: GeneratedProductMetadata;
}

export interface CachedOrderLike {
  email_id?: string;
  email_date?: string;
  delivery_date?: string | null;
  delivery_sort?: string;
  order_number?: string | null;
  order_total?: number;
  total?: number;
  items?: CachedOrderItem[];
  substitutions?: {
    original?: string;
    name?: string;
    substitutedWith?: string;
    substituted_with?: string;
    substitution?: string;
  }[];
  // Spec 018 — order status tracking. Optional; absent means "active".
  status?: 'active' | 'cancelled' | 'superseded' | 'refunded';
  refund_amount?: number;
}

export interface MealsCheckSummaryLike {
  coverage_percentage?: number;
  covered?: number;
  delivery_date?: string | null;
  meals_covered?: number;
  meals_total?: number;
  missing?: number;
  order_total?: number | null;
  partial?: number;
  unmatched_groceries?: number;
}

export interface HeadlineMetrics {
  orderTotal: number | null;
  deliveryDate: string | null;
  mealsCovered: number;
  mealsTotal: number;
  unmatchedGroceries: number;
  coveragePercentage: number;
}

export const EMPTY_RECEIPT: TescoReceipt = {
  orderNumber: 'Unknown',
  deliveryDate: '',
  deliverySlot: 'Evening',
  orderTotal: 0,
  items: [],
  substitutions: [],
  unavailable: [],
  shortLifeItems: [],
};

export function getCategoryForItem(itemName: string): string {
  const name = itemName.toLowerCase();
  if (name.includes('chicken') || name.includes('beef') || name.includes('pork') ||
      name.includes('gammon') || name.includes('steak') || name.includes('bacon') ||
      name.includes('ham') || name.includes('sausage')) return 'Meat';
  if (name.includes('milk') || name.includes('yoghurt') || name.includes('cheese') ||
      name.includes('cream') || name.includes('butter') || name.includes('eggs')) return 'Dairy';
  if (name.includes('strawberr') || name.includes('raspberr') || name.includes('blueberr') ||
      name.includes('blackberr') || name.includes('grape') || name.includes('tomato') ||
      name.includes('cucumber') || name.includes('celery') || name.includes('pepper') ||
      name.includes('lettuce') || name.includes('potato') || name.includes('broccoli')) return 'Fresh';
  if (name.includes('frozen') || name.includes('microwave')) return 'Frozen';
  if (name.includes('bread') || name.includes('pizza') || name.includes('pasta') ||
      name.includes('biscuit')) return 'Bakery';
  if (name.includes('juice') || name.includes('drink')) return 'Beverages';
  return 'Pantry';
}

export function transformCachedOrderSafely(order: CachedOrderLike | null | undefined): TescoReceipt {
  if (!order) return EMPTY_RECEIPT;

  const items = order.items ?? [];
  const orderTotal = order.order_total ?? order.total ?? items.reduce((sum, item) => sum + (item.price || 0), 0);
  const shortLifeKeywords = ['strawberries', 'raspberries', 'blueberries', 'blackberries',
    'lettuce', 'salad', 'spinach', 'herbs', 'fresh', 'bread', 'milk'];

  const shortLifeItems = items
    .filter(item => shortLifeKeywords.some(kw => item.name.toLowerCase().includes(kw)))
    .map(item => ({
      name: item.name,
      daysRemaining: item.name.toLowerCase().includes('berry') ||
                     item.name.toLowerCase().includes('lettuce') ? 2 : 5,
    }));

  const itemSubstitutions = items
    .filter(item => item.substitutedWith)
    .map(item => ({ original: item.name, substitutedWith: item.substitutedWith as string }));

  const topLevelSubstitutions = (order.substitutions ?? [])
    .map(substitution => ({
      original: substitution.original || substitution.name || '',
      substitutedWith: substitution.substitutedWith || substitution.substituted_with || substitution.substitution || '',
    }))
    .filter(substitution => substitution.original && substitution.substitutedWith);

  const substitutions = [...itemSubstitutions, ...topLevelSubstitutions];

  return {
    orderNumber: order.order_number || 'Unknown',
    deliveryDate: order.delivery_date || order.email_date || '',
    deliverySlot: 'Evening',
    orderTotal,
    items: items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      category: getCategoryForItem(item.name),
      substitutedWith: item.substitutedWith,
      productMetadata: item.productMetadata ?? item.product_metadata,
    })),
    substitutions,
    unavailable: [],
    shortLifeItems,
    orderStatus: order.status,
    refundAmount: order.refund_amount,
  };
}

export function tokenizeForMatch(value: string): string[] {
  return value.toLowerCase().split(/[\s,]+/).filter(word => word.length > 2);
}

export function classifyOrderItemMatch(item: Pick<GroceryItem, 'name'>, coverage: MealCoverage[]): 'matched' | 'unmatched' {
  const itemWords = tokenizeForMatch(item.name);
  const isMatched = coverage.some(entry => {
    const mealWords = tokenizeForMatch(entry.meal.content);
    return itemWords.some(itemWord => mealWords.some(mealWord => mealWord.includes(itemWord) || itemWord.includes(mealWord)));
  });
  return isMatched ? 'matched' : 'unmatched';
}

export function buildHeadlineMetrics(
  summary: MealsCheckSummaryLike | null | undefined,
  receipt: TescoReceipt | null | undefined,
  coverage: MealCoverage[],
  deliveries: DeliveryWindow[],
): HeadlineMetrics {
  const computed = calculateCoverageSummary(coverage);
  return {
    orderTotal: summary?.order_total ?? receipt?.orderTotal ?? null,
    deliveryDate: summary?.delivery_date ?? deliveries[0]?.date ?? receipt?.deliveryDate ?? null,
    mealsCovered: summary?.meals_covered ?? computed.covered,
    mealsTotal: summary?.meals_total ?? coverage.length,
    unmatchedGroceries: summary?.unmatched_groceries ?? receipt?.items.length ?? 0,
    coveragePercentage: summary?.coverage_percentage ?? (Number.isFinite(computed.coveragePercentage) ? computed.coveragePercentage : 0),
  };
}

export function getCoverageColorFromScore(score: number): string {
  if (score >= 80) return 'var(--accent-emerald)';
  if (score >= 50) return 'var(--accent-amber)';
  return 'var(--accent-rose)';
}

export function deriveCollapsedCoverageColor(meals: MealCoverage[]): string {
  if (meals.length === 0) return 'transparent';
  const average = Math.round(meals.reduce((sum, meal) => sum + meal.coverageScore, 0) / meals.length);
  return getCoverageColorFromScore(average);
}

export function isTodoistMealCompleted(meal: MealCoverage['meal'] | null | undefined): boolean {
  return meal?.is_completed === true;
}

export function getTodoistCompletionLabel(meal: MealCoverage['meal'] | null | undefined): string | null {
  if (!isTodoistMealCompleted(meal)) return null;
  return meal?.completed_at ? `Completed in Todoist · ${meal.completed_at}` : 'Completed in Todoist';
}

export function getDisplayedProductName(name: string): string {
  return cleanItemName(name);
}

/**
 * Format a use-by ISO date (YYYY-MM-DD) into a human-readable label
 * like "Sat 19th". Used by the meal detail "Use today" section.
 * Spec 019 / FR-05.
 */
export function formatUseByDate(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return isoDate;
  const d = new Date(year, month, day);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  const suffix = (() => {
    if (day >= 11 && day <= 13) return 'th';
    const last = day % 10;
    if (last === 1) return 'st';
    if (last === 2) return 'nd';
    if (last === 3) return 'rd';
    return 'th';
  })();
  return `${weekday} ${day}${suffix}`;
}

export function getProductModalPrice(item: Pick<GroceryItem, 'price'> | null | undefined): number | null {
  return typeof item?.price === 'number' ? item.price : null;
}

export type OrderItemSortMode = 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc';

export function sortOrderItems<T extends Pick<GroceryItem, 'name' | 'price'>>(items: T[], sortMode: OrderItemSortMode): T[] {
  const sorted = [...items];
  const compareNames = (a: T, b: T) => cleanItemName(a.name).localeCompare(cleanItemName(b.name));

  if (sortMode === 'price-asc' || sortMode === 'price-desc') {
    return sorted.sort((a, b) => {
      const aHasPrice = typeof a.price === 'number';
      const bHasPrice = typeof b.price === 'number';
      if (aHasPrice !== bHasPrice) return aHasPrice ? -1 : 1;
      if (aHasPrice && bHasPrice && a.price !== b.price) {
        return sortMode === 'price-asc' ? (a.price as number) - (b.price as number) : (b.price as number) - (a.price as number);
      }
      return compareNames(a, b);
    });
  }

  const nameResult = sorted.sort(compareNames);
  return sortMode === 'name-desc' ? nameResult.reverse() : nameResult;
}

export function getCoverageStatusLabel(status: MealCoverage['status']): string {
  if (status === 'covered') return 'Complete';
  if (status === 'partial') return 'Partial';
  return 'Missing';
}

export function getCoverageStatusColor(status: MealCoverage['status']): string {
  if (status === 'covered') return 'var(--accent-emerald)';
  if (status === 'partial') return 'var(--accent-amber)';
  return 'var(--accent-rose)';
}

export interface ResolvedProductInfo {
  title: string;
  description: string;
  storage: string;
  preparation: string;
  ingredients: string;
  allergens: string;
  nutrition: string;
  image: string;
  productUrl?: string;
  lastFetched?: string;
  expiresAt?: string;
  source: 'generated' | 'local' | 'fallback';
}

export function resolveProductInfoForItem(item: GroceryItem): ResolvedProductInfo {
  const generated = item.productMetadata;
  if (generated) {
    const expiresAt = _computeExpiresAt(generated.lastFetched);
    // Spec 027 Rev 2 / FR-014: Apollo partial success wins. If Apollo
    // returned an empty description, fall through to the Firecrawl
    // snippet (third tier of the chain). The Firecrawl snippet is
    // populated by the Python sync pipeline at
    // `scripts/sync-dashboard-data.py:_fetch_firecrawl_search_snippet`
    // and cached in `products/{tpnc}.json` under the `firecrawl` key
    // with a 21-day TTL matching Apollo.
    const firecrawlSnippet = generated.firecrawl?.snippet;
    const hasFirecrawlSnippet = typeof firecrawlSnippet === 'string' && firecrawlSnippet.trim() !== '';
    const description =
      generated.description
      || (hasFirecrawlSnippet ? firecrawlSnippet : '')
      || 'Generated Tesco product details are incomplete for this item.';
    return {
      title: generated.title || cleanItemName(item.name),
      description,
      storage: generated.storage || 'Check packaging for storage instructions.',
      preparation: generated.preparation || '',
      ingredients: generated.ingredients || '',
      allergens: generated.allergens || '',
      nutrition: generated.nutrition || 'Nutrition information not available from generated Tesco metadata.',
      image: generated.imageUrl || '',
      productUrl: generated.productUrl,
      lastFetched: generated.lastFetched,
      expiresAt,
      source: 'generated',
    };
  }

  const local = findProductInfo(item.name);
  if (local) {
    return {
      title: cleanItemName(item.name),
      description: local.description,
      storage: local.storage,
      preparation: '',
      ingredients: '',
      allergens: '',
      nutrition: local.nutrition,
      image: local.image || '',
      lastFetched: undefined,
      expiresAt: undefined,
      source: 'local',
    };
  }

  return {
    title: cleanItemName(item.name),
    description: 'Product information not available in generated data or the local product database.',
    storage: 'Check packaging for storage instructions.',
    preparation: '',
    ingredients: '',
    allergens: '',
    nutrition: 'Nutrition information not available.',
    image: '',
    lastFetched: undefined,
    expiresAt: undefined,
    source: 'fallback',
  };
}

function normalizeProductMatchText(value: string): string {
  return cleanItemName(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(kebabs|potatoes|fries|pies|bites|skins)\b/g, match => match.slice(0, -1))
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAllSignificantTokens(haystack: string, needle: string): boolean {
  const tokens = normalizeProductMatchText(needle)
    .split(' ')
    .filter(token => token.length > 2 && !['tesco', 'finest', 'fire', 'pit'].includes(token));
  if (tokens.length === 0) return false;
  const normalizedHaystack = normalizeProductMatchText(haystack);
  return tokens.every(token => normalizedHaystack.split(' ').some(haystackToken => haystackToken === token || haystackToken.startsWith(token) || token.startsWith(haystackToken)));
}

export function findReceiptItemForMatchedItem(
  matchedItem: Pick<MatchedItem, 'name' | 'ingredient' | 'quantity' | 'price'>,
  receiptItems: GroceryItem[],
): GroceryItem {
  const candidates = [matchedItem.name, matchedItem.ingredient].filter(Boolean);

  for (const candidate of candidates) {
    const directMatch = receiptItems.find(item => item.name.toLowerCase() === candidate.toLowerCase());
    if (directMatch) return directMatch;
  }

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeProductMatchText(candidate);
    const cleanedMatch = receiptItems.find(item => normalizeProductMatchText(item.name) === normalizedCandidate);
    if (cleanedMatch) return cleanedMatch;
  }

  for (const candidate of candidates) {
    const containmentMatch = receiptItems.find(item => containsAllSignificantTokens(item.name, candidate));
    if (containmentMatch) return containmentMatch;
  }

  return {
    name: matchedItem.name,
    quantity: matchedItem.quantity ?? 0,
    price: matchedItem.price ?? undefined,
  };
}

export function getPartialMealMissingExplanation(meal: MealCoverage): string[] {
  if (meal.status !== 'partial') return [];
  return meal.missingExplanations ?? [];
}
