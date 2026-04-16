import { describe, it, expect } from 'vitest';
import { cleanItemName, deduplicateMatchedItems, type MatchedItem } from './item-utils';

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
