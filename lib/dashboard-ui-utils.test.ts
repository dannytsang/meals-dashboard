import { describe, it, expect } from 'vitest';
import type { GroceryItem, MealCoverage, TescoReceipt } from './meals-data';
import {
  EMPTY_RECEIPT,
  buildHeadlineMetrics,
  classifyOrderItemMatch,
  deriveCollapsedCoverageColor,
  getDisplayedProductName,
  findReceiptItemForMatchedItem,
  getPartialMealMissingExplanation,
  getCoverageStatusLabel,
  getProductModalPrice,
  getTodoistCompletionLabel,
  isTodoistMealCompleted,
  resolveProductInfoForItem,
  sortOrderItems,
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

  it('preserves generated product metadata attached to receipt items', () => {
    const receipt = transformCachedOrderSafely({
      email_id: '',
      email_date: '2026-06-10',
      delivery_date: '2026-06-12',
      delivery_sort: '',
      order_number: '123',
      order_total: 4,
      items: [{
        name: 'Tesco Product',
        quantity: 1,
        price: 1.25,
        productMetadata: { title: 'Tesco Product Title', description: 'Generated Tesco details', source: 'tesco' },
      }],
    });
    expect(receipt.items[0].productMetadata).toMatchObject({
      title: 'Tesco Product Title',
      description: 'Generated Tesco details',
      source: 'tesco',
    });
  });

  // Spec 018 — order status tracking plumb-through.
  it('passes order status through to the receipt when present', () => {
    const receipt = transformCachedOrderSafely({
      email_id: '',
      email_date: '2026-06-10',
      delivery_date: '2026-06-12',
      delivery_sort: '',
      order_number: '123',
      order_total: 4,
      status: 'cancelled',
      items: [],
    });
    expect(receipt.orderStatus).toBe('cancelled');
  });

  it('passes refund amount through to the receipt when present', () => {
    const receipt = transformCachedOrderSafely({
      email_id: '',
      email_date: '2026-06-10',
      delivery_date: '2026-06-12',
      delivery_sort: '',
      order_number: '123',
      order_total: 4,
      status: 'refunded',
      refund_amount: 3.5,
      items: [],
    });
    expect(receipt.refundAmount).toBe(3.5);
  });

  it('omits orderStatus when no status is provided (pre-018 default)', () => {
    const receipt = transformCachedOrderSafely({
      email_id: '',
      email_date: '2026-06-10',
      delivery_date: '2026-06-12',
      delivery_sort: '',
      order_number: '123',
      order_total: 4,
      items: [],
    });
    expect(receipt.orderStatus).toBeUndefined();
    expect(receipt.refundAmount).toBeUndefined();
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

  it('resolves a meal matched item to the same receipt item used by the product modal', () => {
    const receiptItems: GroceryItem[] = [
      { name: 'Tesco Maris Piper Potatoes 2Kg', quantity: 1, price: 2 },
      { name: 'Tesco Broccoli 375g', quantity: 1, price: 1 },
    ];

    expect(findReceiptItemForMatchedItem({ ingredient: 'Potatoes', name: 'Tesco Maris Piper Potatoes 2Kg', quantity: null, price: null }, receiptItems)).toEqual(receiptItems[0]);
  });

  it('uses the receipt price when a matched meal ingredient is a shorter phrase than the order item name', () => {
    const receiptItems: GroceryItem[] = [
      { name: 'Tesco Fire Pit 4 Sweet & Smoky Pork Kebabs 340GSubstitutions: On', quantity: 1, price: 8 },
    ];

    expect(findReceiptItemForMatchedItem({ ingredient: 'pork kebab', name: 'pork kebab', quantity: null, price: null }, receiptItems)).toEqual(receiptItems[0]);
  });

  it('keeps generated matched-item price when the item is from a different receipt window', () => {
    expect(findReceiptItemForMatchedItem(
      { ingredient: 'Tesco British Beef Medium Roasting Joint 0.868KG', name: 'Tesco British Beef Medium Roasting Joint 0.868KG', quantity: 1, price: 13.02 },
      [],
    )).toEqual({
      name: 'Tesco British Beef Medium Roasting Joint 0.868KG',
      quantity: 1,
      price: 13.02,
    });
  });

  it('does not render a fabricated zero price when no product price is available', () => {
    expect(getProductModalPrice({})).toBeNull();
  });

  it('does not fabricate quantity when no receipt item can be resolved', () => {
    expect(findReceiptItemForMatchedItem({ ingredient: 'external', name: '[external] cooking', quantity: null, price: null }, [])).toMatchObject({
      name: '[external] cooking',
      quantity: 0,
      price: undefined,
    });
  });
});

describe('partial meal missing explanations', () => {
  it('shows targeted missing explanations for partial meals only', () => {
    const partialMeal: MealCoverage = {
      meal: { id: '1', content: 'Roast beef, roast potatoes, roast carrots, broccoli', date: '2026-06-14', labels: [], section: 'Planned' },
      status: 'partial',
      coverageScore: 50,
      matchedItems: [],
      missingItems: ['Tesco Blueberries 500G'],
      missingExplanations: ['broccoli'],
    };
    const coveredMeal: MealCoverage = { ...partialMeal, status: 'covered', coverageScore: 100 };

    expect(getPartialMealMissingExplanation(partialMeal)).toEqual(['broccoli']);
    expect(getPartialMealMissingExplanation(coveredMeal)).toEqual([]);
  });
});

describe('generated product metadata resolution', () => {
  it('prefers generated product metadata over local product fallback', () => {
    const item: GroceryItem = {
      name: 'Tesco Unknown Thing',
      quantity: 1,
      price: 2,
      productMetadata: { title: 'Generated Tesco Title', description: 'Generated description', imageUrl: 'https://example.test/item.jpg', storage: 'Keep chilled', source: 'tesco' },
    };

    expect(resolveProductInfoForItem(item)).toMatchObject({
      title: 'Generated Tesco Title',
      description: 'Generated description',
      image: 'https://example.test/item.jpg',
      storage: 'Keep chilled',
      source: 'generated',
    });
  });

  it('uses truthful fallback product text when generated metadata is absent', () => {
    const item: GroceryItem = { name: 'Definitely Unknown Item', quantity: 1, price: 2 };

    expect(resolveProductInfoForItem(item)).toMatchObject({
      source: 'fallback',
      description: 'Product information not available in generated data or the local product database.',
    });
  });
});

describe('order item sorting', () => {
  const items: GroceryItem[] = [
    { name: 'Tesco Zucchini Substitutions: On', quantity: 1, price: 3 },
    { name: 'Apple Pack', quantity: 1, price: 2 },
    { name: 'Loose Bananas', quantity: 1 },
  ];

  it('sorts alphabetically by cleaned display name ascending by default', () => {
    expect(sortOrderItems(items, 'name-asc').map(item => item.name)).toEqual([
      'Apple Pack',
      'Loose Bananas',
      'Tesco Zucchini Substitutions: On',
    ]);
  });

  it('sorts alphabetically by cleaned display name descending', () => {
    expect(sortOrderItems(items, 'name-desc').map(item => item.name)).toEqual([
      'Tesco Zucchini Substitutions: On',
      'Loose Bananas',
      'Apple Pack',
    ]);
  });

  it('sorts by price low-to-high with missing prices last', () => {
    expect(sortOrderItems(items, 'price-asc').map(item => item.name)).toEqual([
      'Apple Pack',
      'Tesco Zucchini Substitutions: On',
      'Loose Bananas',
    ]);
  });

  it('sorts by price high-to-low with missing prices last', () => {
    expect(sortOrderItems(items, 'price-desc').map(item => item.name)).toEqual([
      'Tesco Zucchini Substitutions: On',
      'Apple Pack',
      'Loose Bananas',
    ]);
  });
});

describe('simple coverage labels', () => {
  it('maps individual meal status to simple labels without RAG wording or percentages', () => {
    expect(getCoverageStatusLabel('covered')).toBe('Complete');
    expect(getCoverageStatusLabel('partial')).toBe('Partial');
    expect(getCoverageStatusLabel('missing')).toBe('Missing');
  });
});
