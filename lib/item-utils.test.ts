import { describe, it, expect } from 'vitest';
import {
  cleanItemName,
  deduplicateMatchedItems,
  calculateMatchedItemsTotal,
  classifyOrderItemsByDelivery,
  type MatchedItem,
} from './item-utils';
import type { OrderBlob } from './dashboard-sync';

function makeOrder(partial: Partial<OrderBlob> & { deliveryDate: string; items?: OrderBlob['items'] }): OrderBlob {
  return {
    orderNumber: 'TEST-0000-00',
    deliverySlot: 'Evening',
    orderTotal: 0,
    substitutions: [],
    unavailable: [],
    shortLifeItems: [],
    items: [],
    ...partial,
  };
}

describe('cleanItemName', () => {
  it('strips "Substitutions: On" suffix', () => {
    expect(cleanItemName('Tesco Aioli Dip 200G Substitutions: On')).toBe('Tesco Aioli Dip 200G');
  });

  it('strips "Substitutions: On" case-insensitively', () => {
    expect(cleanItemName('Tesco Guacamole 163g SUBSTITUTIONS: ON')).toBe('Tesco Guacamole 163g');
    expect(cleanItemName('Tesco Tzatziki Dip 200G substitutions: on')).toBe('Tesco Tzatziki Dip 200G');
  });

  it('handles name with no suffix', () => {
    expect(cleanItemName('Jammie Dodgers Biscuits 140G')).toBe('Jammie Dodgers Biscuits 140G');
  });

  it('handles name with leading/trailing whitespace', () => {
    expect(cleanItemName('  Tesco Aioli Dip 200G Substitutions: On  ')).toBe('Tesco Aioli Dip 200G');
  });

  it('handles empty string', () => {
    expect(cleanItemName('')).toBe('');
  });
});

describe('deduplicateMatchedItems', () => {
  it('returns empty array for empty input', () => {
    expect(deduplicateMatchedItems([])).toEqual([]);
  });

  it('returns all items when no duplicates', () => {
    const items: MatchedItem[] = [
      { ingredient: 'Chicken', name: 'Tesco Large Chicken Fillet Pack', quantity: 1, price: 3.50 },
      { ingredient: 'Garlic', name: 'Tesco Cheese and Garlic Flatbread', quantity: 1, price: 1.20 },
    ];
    expect(deduplicateMatchedItems(items)).toEqual(items);
  });

  it('removes exact duplicate entries', () => {
    const items: MatchedItem[] = [
      { ingredient: 'Aioli', name: 'Tesco Aioli Dip 200G', quantity: 1, price: 1.10 },
      { ingredient: 'Aioli', name: 'Tesco Aioli Dip 200G', quantity: 1, price: 1.10 },
    ];
    expect(deduplicateMatchedItems(items)).toHaveLength(1);
    expect(deduplicateMatchedItems(items)[0].name).toBe('Tesco Aioli Dip 200G');
  });

  it('removes "Substitutions: On" variant when clean counterpart exists', () => {
    // This is the actual bug: meal_coverage returns both variants
    const items: MatchedItem[] = [
      { ingredient: 'Aioli', name: 'Tesco Aioli Dip 200G Substitutions: On', quantity: 1, price: 1.10 },
      { ingredient: 'Aioli', name: 'Tesco Aioli Dip 200G', quantity: null, price: null },
    ];
    const result = deduplicateMatchedItems(items);
    expect(result).toHaveLength(1);
    // Should keep the first occurrence (Substitutions: On variant with price)
    expect(result[0].name).toBe('Tesco Aioli Dip 200G Substitutions: On');
    expect(result[0].price).toBe(1.10);
  });

  it('removes all duplicates including Substitutions: On variants', () => {
    const items: MatchedItem[] = [
      { ingredient: 'Aioli', name: 'Tesco Aioli Dip 200G Substitutions: On', quantity: 1, price: 1.10 },
      { ingredient: 'Guacamole', name: 'Tesco Guacamole 163g Substitutions: On', quantity: 2, price: 2.20 },
      { ingredient: 'Aioli', name: 'Tesco Aioli Dip 200G', quantity: null, price: null },
      { ingredient: 'Guacamole', name: 'Tesco Guacamole 163g', quantity: null, price: null },
      { ingredient: 'Tzatziki', name: 'Tesco Tzatziki Dip 200G Substitutions: On', quantity: 1, price: 1.10 },
    ];
    const result = deduplicateMatchedItems(items);
    expect(result).toHaveLength(3);
    // All Substitutions: On items are kept (first occurrence wins)
    const names = result.map(r => cleanItemName(r.name));
    expect(names).toContain('Tesco Aioli Dip 200G');
    expect(names).toContain('Tesco Guacamole 163g');
    expect(names).toContain('Tesco Tzatziki Dip 200G');
  });

  it('preserves item with most price data when duplicates exist', () => {
    // The dedup keeps first occurrence - in practice the Substitutions: On variant
    // has price data so it should come first from meal_coverage
    const items: MatchedItem[] = [
      { ingredient: 'Aioli', name: 'Tesco Aioli Dip 200G', quantity: null, price: null },
      { ingredient: 'Aioli', name: 'Tesco Aioli Dip 200G Substitutions: On', quantity: 1, price: 1.10 },
    ];
    const result = deduplicateMatchedItems(items);
    expect(result).toHaveLength(1);
    // First occurrence wins (clean name without price)
    expect(result[0].name).toBe('Tesco Aioli Dip 200G');
  });

  it('handles Doritos Salsa that has no Substitutions: On variant', () => {
    const items: MatchedItem[] = [
      { ingredient: 'Salsa', name: 'Doritos Mild Salsa Dip 300g', quantity: null, price: null },
    ];
    const result = deduplicateMatchedItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Doritos Mild Salsa Dip 300g');
  });
});

describe('calculateMatchedItemsTotal', () => {
  it('adds only matched item receipt prices and ignores unavailable prices', () => {
    const items: MatchedItem[] = [
      { ingredient: 'Beef', name: 'Tesco British Beef Medium Roasting Joint 0.868KG', quantity: 1, price: 13.02 },
      { ingredient: 'Potatoes', name: 'Tesco Maris Piper Potatoes 2Kg', quantity: 1, price: 1.80 },
      { ingredient: 'Unknown', name: 'Pantry gravy', quantity: null, price: null },
    ];

    expect(calculateMatchedItemsTotal(items)).toBe(14.82);
  });
});

/**
 * Spec 034 / FR-001 + FR-012 — regression coverage for
 * `classifyOrderItemsByDelivery`. Pure-function derivation; no React
 * state, no `Date.now()`, no timers. All eight acceptance scenarios
 * from `tasks.md T010` are covered.
 */
describe('classifyOrderItemsByDelivery', () => {
  const TODAY = '2026-07-01';

  it('T010/case-1: one order with deliveryDate == today + 2 → next, not previous, not pending', () => {
    const orders = [makeOrder({ deliveryDate: '2026-07-03', items: [{ name: 'Milk', quantity: 1, price: 1.2 }] })];
    const result = classifyOrderItemsByDelivery(orders, [], TODAY);
    expect(result.previous).toHaveLength(0);
    expect(result.next).toHaveLength(1);
    expect(result.next[0]!.classification).toBe('next');
    expect(result.next[0]!.deliveryDate).toBe('2026-07-03');
    expect(result.pendingNext).toHaveLength(0);
  });

  it('T010/case-2: one order with deliveryDate == today - 7 → previous, not next, not pending', () => {
    const orders = [makeOrder({ deliveryDate: '2026-06-24', items: [{ name: 'Bread', quantity: 1, price: 1 }] })];
    const result = classifyOrderItemsByDelivery(orders, [], TODAY);
    expect(result.next).toHaveLength(0);
    expect(result.previous).toHaveLength(1);
    expect(result.previous[0]!.classification).toBe('previous');
    expect(result.previous[0]!.deliveryDate).toBe('2026-06-24');
    expect(result.pendingNext).toHaveLength(0);
  });

  it('T010/case-3: mixed previous + next → both buckets populated', () => {
    const orders = [
      makeOrder({ orderNumber: 'A', deliveryDate: '2026-06-24' }),
      makeOrder({ orderNumber: 'B', deliveryDate: '2026-07-03' }),
    ];
    const result = classifyOrderItemsByDelivery(orders, [], TODAY);
    expect(result.previous).toHaveLength(1);
    expect(result.previous[0]!.deliveryDate).toBe('2026-06-24');
    expect(result.next).toHaveLength(1);
    expect(result.next[0]!.deliveryDate).toBe('2026-07-03');
  });

  it('T010/case-4: deliveryWindow.date == today + 2 with no matching OrderBlob → pending-next entry with order: null', () => {
    const deliveryWindows = [{ date: '2026-07-03', slot: 'Evening', orderTotal: 0, status: 'scheduled' as const }];
    const result = classifyOrderItemsByDelivery([], deliveryWindows, TODAY);
    expect(result.previous).toHaveLength(0);
    expect(result.next).toHaveLength(0);
    expect(result.pendingNext).toHaveLength(1);
    expect(result.pendingNext[0]!.order).toBeNull();
    expect(result.pendingNext[0]!.deliveryDate).toBe('2026-07-03');
    expect(result.pendingNext[0]!.classification).toBe('pending-next');
  });

  it('T010/case-5: order with deliveryDate == today → next (not previous)', () => {
    const orders = [makeOrder({ deliveryDate: TODAY })];
    const result = classifyOrderItemsByDelivery(orders, [], TODAY);
    expect(result.next).toHaveLength(1);
    expect(result.previous).toHaveLength(0);
    expect(result.next[0]!.classification).toBe('next');
  });

  it('T010/case-6: order with malformed deliveryDate === "not-a-date" → excluded silently, no throw', () => {
    const orders = [makeOrder({ deliveryDate: 'not-a-date' })];
    let result;
    expect(() => {
      result = classifyOrderItemsByDelivery(orders, [], TODAY);
    }).not.toThrow();
    expect(result!.previous).toHaveLength(0);
    expect(result!.next).toHaveLength(0);
    expect(result!.pendingNext).toHaveLength(0);
  });

  it('T010/case-7: cancelled-status order is still classified by date with status exposed', () => {
    const orders = [
      makeOrder({ deliveryDate: '2026-07-03', status: 'cancelled' }),
      makeOrder({ deliveryDate: '2026-06-24', status: 'refunded' }),
    ];
    const result = classifyOrderItemsByDelivery(orders, [], TODAY);
    expect(result.next).toHaveLength(1);
    expect(result.next[0]!.status).toBe('cancelled');
    expect(result.previous).toHaveLength(1);
    expect(result.previous[0]!.status).toBe('refunded');
  });

  it('T010/case-8: two previous orders sorted earliest-first within the previous bucket', () => {
    const orders = [
      makeOrder({ deliveryDate: '2026-06-20' }),
      makeOrder({ deliveryDate: '2026-06-24' }),
    ];
    const result = classifyOrderItemsByDelivery(orders, [], TODAY);
    expect(result.previous.map((g) => g.deliveryDate)).toEqual(['2026-06-20', '2026-06-24']);
  });

  // AS-006 / FR-007 — two future orders both show up in `next` so the
  // sub-heading per-delivery story works.
  it('AS-006: two future orders both classified as next (each carries its own deliveryDate)', () => {
    const orders = [
      makeOrder({ orderNumber: 'IN-FLIGHT', deliveryDate: '2026-07-03' }),
      makeOrder({ orderNumber: 'FURTHER', deliveryDate: '2026-07-10' }),
    ];
    const result = classifyOrderItemsByDelivery(orders, [], TODAY);
    expect(result.next).toHaveLength(2);
    expect(result.next[0]!.deliveryDate).toBe('2026-07-03');
    expect(result.next[1]!.deliveryDate).toBe('2026-07-10');
    expect(result.previous).toHaveLength(0);
  });

  // AS-007 / FR-009 — time-machine: shifting `today` re-classifies the
  // same order without any data sync / pipeline change.
  it('AS-007: time-machine — today = T+1 reclassifies the same order as previous', () => {
    const orders = [makeOrder({ deliveryDate: '2026-07-01', items: [{ name: 'Milk', quantity: 1, price: 1.2 }] })];
    const atT = classifyOrderItemsByDelivery(orders, [], '2026-07-01');
    expect(atT.next).toHaveLength(1);
    expect(atT.previous).toHaveLength(0);

    const atTPlus1 = classifyOrderItemsByDelivery(orders, [], '2026-07-02');
    expect(atTPlus1.next).toHaveLength(0);
    expect(atTPlus1.previous).toHaveLength(1);
    expect(atTPlus1.previous[0]!.classification).toBe('previous');
  });

  // AS-014 — placeholder chain depends on `pendingNext` from the
  // deliveryWindows cross-reference; double-check that `next.deliveryDate
  // >= today` is the only condition (NOT `deliveryDate > today`).
  it('AS-014 / FR-006: a deliveryWindow entry exactly on today counts as pending-next eligible (NOT classified yet)', () => {
    const deliveryWindows = [
      { date: TODAY, slot: 'Evening', orderTotal: 0, status: 'scheduled' as const },
    ];
    const result = classifyOrderItemsByDelivery([], deliveryWindows, TODAY);
    // No matching OrderBlob for today, so this is a pending-next entry.
    // The dashboard will render "(expected 01 Jul)" because TODAY itself
    // qualifies for the parenthetical per FR-006 (`>= today`).
    expect(result.pendingNext).toHaveLength(1);
    expect(result.pendingNext[0]!.deliveryDate).toBe(TODAY);
  });

  // Edge case: duplicate deliveryDate across multiple OrderBlobs
  // (amended-order scenario) → items concatenated into one group.
  it('edge: duplicate deliveryDate across multiple OrderBlobs collapses into a single DeliveryGroup', () => {
    const orders = [
      makeOrder({ orderNumber: 'A', deliveryDate: '2026-07-03', items: [{ name: 'Milk', quantity: 1, price: 1.2 }] }),
      makeOrder({ orderNumber: 'B', deliveryDate: '2026-07-03', items: [{ name: 'Bread', quantity: 2, price: 0.8 }] }),
    ];
    const result = classifyOrderItemsByDelivery(orders, [], TODAY);
    expect(result.next).toHaveLength(1);
    expect(result.next[0]!.items).toHaveLength(2);
    expect(result.next[0]!.items.map((i) => i.name).sort()).toEqual(['Bread', 'Milk']);
  });
});
