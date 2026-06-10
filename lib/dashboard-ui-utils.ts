import { calculateCoverageSummary, DeliveryWindow, GroceryItem, MealCoverage, TescoReceipt } from './meals-data';
import { cleanItemName } from './item-utils';

export interface CachedOrderItem {
  name: string;
  quantity: number;
  price: number;
  substitutedWith?: string;
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
    })),
    substitutions,
    unavailable: [],
    shortLifeItems,
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

export function getProductModalPrice(item: Pick<GroceryItem, 'price'> | null | undefined): number {
  return item?.price ?? 0;
}
