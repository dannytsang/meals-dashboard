import { describe, it, expect } from 'vitest';
import type { GroceryItem, MealCoverage, TescoReceipt } from './meals-data';
import {
  EMPTY_RECEIPT,
  buildHeadlineMetrics,
  classifyOrderItemMatch,
  deriveCollapsedCoverageColor,
  getDisplayedProductName,
  getProductModalPrice,
  getTodoistCompletionLabel,
  isTodoistMealCompleted,
  transformCachedOrderSafely,
} from './dashboard-ui-utils';

describe('transformCachedOrderSafely', () => {
  it('returns an empty receipt instead of crashing when generated order data is missing', () => {
    expect(transformCachedOrderSafely(null)).toEqual(EMPTY_RECEIPT);
    expect(transformCachedOrderSafely(undefined)).toEqual(EMPTY_RECEIPT);
  });

  it('preserves generated substitution metadata when present on receipt items', () => {
    const receipt = transformCachedOrderSafely({
      email_id: '',
      email_date: '2026-06-10',
      delivery_date: '2026-06-12',
      delivery_sort: '',
      order_number: '123',
      order_total: 4,
      items: [
        { name: 'Original Dip Substitutions: On', quantity: 1, price: 1.25, substitutedWith: 'Better Dip' },
      ],
    });

    expect(receipt.substitutions).toEqual([
      { original: 'Original Dip Substitutions: On', substitutedWith: 'Better Dip' },
    ]);
  });

  it('preserves top-level generated substitution metadata when present', () => {
    const receipt = transformCachedOrderSafely({
      email_id: '',
      email_date: '2026-06-10',
      delivery_date: '2026-06-12',
      delivery_sort: '',
      order_number: '123',
      order_total: 4,
      items: [{ name: 'Original Dip Substitutions: On', quantity: 1, price: 1.25 }],
      substitutions: [{ original: 'Original Dip Substitutions: On', substitutedWith: 'Better Dip' }],
    });

    expect(receipt.substitutions).toEqual([
      { original: 'Original Dip Substitutions: On', substitutedWith: 'Better Dip' },
    ]);
  });
});

describe('buildHeadlineMetrics', () => {
  it('uses safe fallback values when summary and receipt data are absent', () => {
    const metrics = buildHeadlineMetrics(undefined, undefined, [], []);

    expect(metrics).toEqual({
      orderTotal: null,
      deliveryDate: null,
      mealsCovered: 0,
      mealsTotal: 0,
      unmatchedGroceries: 0,
      coveragePercentage: 0,
    });
  });

  it('falls back to receipt order total, first delivery date, raw item count, and computed coverage', () => {
    const receipt: TescoReceipt = {
      orderNumber: '123',
      deliveryDate: '2026-06-12',
      deliverySlot: 'Evening',
      orderTotal: 9.5,
      items: [{ name: 'Pasta', quantity: 1, price: 1 }],
      substitutions: [],
      unavailable: [],
      shortLifeItems: [],
    };
    const coverage: MealCoverage[] = [
      { meal: { id: '1', content: 'Pasta', date: '2026-06-12', labels: [], section: 'Planned' }, status: 'covered', coverageScore: 100, matchedItems: [], missingItems: [] },
    ];

    const metrics = buildHeadlineMetrics(undefined, receipt, coverage, [{ date: '2026-06-13', slot: 'Evening', orderTotal: 0, status: 'pending' }]);

    expect(metrics).toMatchObject({
      orderTotal: 9.5,
      deliveryDate: '2026-06-13',
      mealsCovered: 1,
      mealsTotal: 1,
      unmatchedGroceries: 1,
      coveragePercentage: 100,
    });
  });
});

describe('classifyOrderItemMatch', () => {
  const coverage: MealCoverage[] = [
    { meal: { id: '1', content: 'Chicken pasta', date: '2026-06-12', labels: [], section: 'Planned' }, status: 'covered', coverageScore: 100, matchedItems: [], missingItems: [] },
  ];

  it('uses the dashboard word-overlap heuristic for matched receipt items', () => {
    expect(classifyOrderItemMatch({ name: 'Tesco Chicken Breast' }, coverage)).toBe('matched');
  });

  it('classifies receipt items without overlapping meal words as unmatched', () => {
    expect(classifyOrderItemMatch({ name: 'Blueberries' }, coverage)).toBe('unmatched');
  });
});

describe('deriveCollapsedCoverageColor', () => {
  it('uses the aggregate average score rather than the first meal status', () => {
    expect(deriveCollapsedCoverageColor([
      { meal: { id: '1', content: 'Meal 1', date: '2026-06-12', labels: [], section: 'Planned' }, status: 'covered', coverageScore: 10, matchedItems: [], missingItems: [] },
      { meal: { id: '2', content: 'Meal 2', date: '2026-06-12', labels: [], section: 'Planned' }, status: 'covered', coverageScore: 20, matchedItems: [], missingItems: [] },
    ])).toBe('var(--accent-rose)');
  });
});

describe('Todoist completion presentation', () => {
  it('marks only generated meals with Todoist completion metadata as completed', () => {
    expect(isTodoistMealCompleted({ id: '1', content: 'Duck pancakes', date: '2026-06-15', labels: [], section: 'Planned', is_completed: true })).toBe(true);
    expect(isTodoistMealCompleted({ id: '2', content: 'Chicken pasta', date: '2026-06-15', labels: [], section: 'Planned' })).toBe(false);
  });

  it('shows completion timestamp when the generated meal includes one', () => {
    expect(getTodoistCompletionLabel({ id: '1', content: 'Duck pancakes', date: '2026-06-15', labels: [], section: 'Planned', is_completed: true, completed_at: '2026-06-10T09:00:00Z' })).toBe('Completed in Todoist · 2026-06-10T09:00:00Z');
    expect(getTodoistCompletionLabel({ id: '2', content: 'Chicken pasta', date: '2026-06-15', labels: [], section: 'Planned' })).toBeNull();
  });
});

describe('product detail presentation', () => {
  it('shows the cleaned product name in the modal title', () => {
    expect(getDisplayedProductName('Tesco Aioli Dip 200G Substitutions: On')).toBe('Tesco Aioli Dip 200G');
  });

  it('shows the receipt item total price without multiplying by quantity again', () => {
    const item: GroceryItem = { name: 'Two pizzas', quantity: 2, price: 6 };
    expect(getProductModalPrice(item)).toBe(6);
  });
});
