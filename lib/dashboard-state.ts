/**
 * Dashboard State Management
 * 
 * Manages interactive state for the meals dashboard:
 * - Selected shop (previous vs next delivery)
 * - Filter settings (status, date range)
 * - Expanded meal details
 */

import { MealCoverage, TescoReceipt, Meal } from './meals-data';

export type ShopPeriod = 'previous' | 'current' | 'next';
export type StatusFilter = 'all' | 'covered' | 'partial' | 'missing' | 'unknown';

export interface DashboardState {
  selectedShop: ShopPeriod;
  statusFilter: StatusFilter;
  expandedMealId: string | null;
  dateRange: {
    start: string;
    end: string;
  };
}

export interface ShopData {
  period: ShopPeriod;
  label: string;
  receipt: TescoReceipt | null;
  deliveryDate: string;
  orderTotal: number;
  itemCount: number;
}

export const defaultState: DashboardState = {
  selectedShop: 'current',
  statusFilter: 'all',
  expandedMealId: null,
  dateRange: {
    start: '2026-04-13',
    end: '2026-04-19',
  },
};

// Mock data for previous shop (simulated historical data)
export const previousShopReceipt: TescoReceipt = {
  orderNumber: '4611-8983-19',
  deliveryDate: '2026-04-03',
  deliverySlot: '20:00-21:00',
  orderTotal: 94.56,
  items: [
    { name: 'Chicken breast fillets 500g', quantity: 2, price: 7.00 },
    { name: 'Basmati rice 1kg', quantity: 1, price: 2.50 },
    { name: 'Egg noodles 300g', quantity: 2, price: 3.00 },
    { name: 'KFC Zinger burger meal', quantity: 2, price: 12.00 },
    { name: 'Jasmine rice 500g', quantity: 1, price: 2.20 },
    { name: 'Chicken thighs 1kg', quantity: 1, price: 5.50 },
    { name: 'Stir fry sauce', quantity: 2, price: 3.00 },
    { name: 'Spring onions bunch', quantity: 1, price: 0.80 },
    { name: 'Garlic bread', quantity: 1, price: 1.50 },
    { name: 'Frozen chips 1kg', quantity: 1, price: 1.80 },
    { name: 'Kidney beans 400g', quantity: 3, price: 2.10 },
    { name: 'Baked beans 420g', quantity: 4, price: 2.80 },
  ],
  substitutions: [],
  unavailable: [],
  shortLifeItems: [],
};

// Next shop (upcoming - currently empty basket)
export const nextShopReceipt: TescoReceipt = {
  orderNumber: 'TBD',
  deliveryDate: '2026-04-17',
  deliverySlot: '20:00-21:00',
  orderTotal: 0,
  items: [],
  substitutions: [],
  unavailable: [],
  shortLifeItems: [],
};

// Shop data collection
export const shopDataMap: Record<ShopPeriod, ShopData> = {
  previous: {
    period: 'previous',
    label: 'Previous Shop (Apr 3)',
    receipt: previousShopReceipt,
    deliveryDate: '2026-04-03',
    orderTotal: 94.56,
    itemCount: 12,
  },
  current: {
    period: 'current',
    label: 'Current Shop (Apr 10)',
    receipt: null, // Will be loaded from real-data.ts
    deliveryDate: '2026-04-10',
    orderTotal: 0,
    itemCount: 0,
  },
  next: {
    period: 'next',
    label: 'Next Shop (Apr 17)',
    receipt: nextShopReceipt,
    deliveryDate: '2026-04-17',
    orderTotal: 0,
    itemCount: 0,
  },
};

/**
 * Filter coverage data based on status filter
 */
export function filterCoverage(
  coverage: MealCoverage[],
  filter: StatusFilter
): MealCoverage[] {
  if (filter === 'all') return coverage;
  return coverage.filter(c => c.status === filter);
}

/**
 * Get coverage stats for a specific filter
 */
export function getFilterStats(coverage: MealCoverage[]) {
  const total = coverage.length;
  return {
    all: total,
    covered: coverage.filter(c => c.status === 'covered').length,
    partial: coverage.filter(c => c.status === 'partial').length,
    missing: coverage.filter(c => c.status === 'missing').length,
    unknown: coverage.filter(c => c.status === 'unknown').length,
  };
}

/**
 * Analyze coverage for a specific shop
 */
export function analyzeCoverageForShop(
  meals: Meal[],
  receipt: TescoReceipt
): MealCoverage[] {
  const items = receipt.items.map(i => i.name.toLowerCase());
  
  return meals.map(meal => {
    const mealLower = meal.content.toLowerCase();
    const matchedItems: string[] = [];
    const missingItems: string[] = [];
    
    // Keyword mappings
    const keywords: Record<string, string[]> = {
      'pizza': ['pizza'],
      'potato': ['potato', 'potatoes'],
      'cheese': ['cheese'],
      'beans': ['beans', 'kidney beans', 'baked beans'],
      'gammon': ['gammon', 'ham'],
      'steak': ['steak', 'beef'],
      'salad': ['lettuce', 'tomato', 'cucumber', 'salad'],
      'toastie': ['bread', 'cheese'],
      'chicken': ['chicken', 'chicken breast', 'chicken thighs'],
      'rice': ['rice', 'basmati', 'jasmine'],
      'noodles': ['noodles', 'egg noodles'],
      'kfc': ['kfc', 'zinger'],
      'sticky rice': ['rice'],
    };
    
    let matchCount = 0;
    let totalKeywords = 0;
    
    for (const [category, words] of Object.entries(keywords)) {
      if (mealLower.includes(category)) {
        totalKeywords++;
        const hasMatch = words.some(word => 
          items.some(item => item.includes(word))
        );
        if (hasMatch) {
          matchCount++;
          matchedItems.push(category);
        } else {
          missingItems.push(category);
        }
      }
    }
    
    // Special cases
    if (mealLower.includes('jacket potatoes') || mealLower.includes('baked potatoes')) {
      if (!matchedItems.includes('potato')) {
        totalKeywords++;
        if (items.some(i => i.includes('potato'))) {
          matchCount++;
          matchedItems.push('potatoes');
        } else {
          missingItems.push('potatoes');
        }
      }
    }
    
    const coverageScore = totalKeywords > 0 ? Math.round((matchCount / totalKeywords) * 100) : 50;
    
    let status: MealCoverage['status'] = 'unknown';
    if (coverageScore >= 80) status = 'covered';
    else if (coverageScore >= 50) status = 'partial';
    else if (coverageScore > 0) status = 'missing';
    
    return {
      meal,
      status,
      coverageScore,
      matchedItems,
      missingItems,
    };
  });
}
