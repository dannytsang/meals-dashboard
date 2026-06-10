/**
 * Meals Dashboard Data Layer
 * 
 * Interfaces with the meals skill to fetch:
 * - Meal plans from Todoist
 * - Grocery receipts from Gmail/Tesco
 * - Coverage analysis
 */

export interface Meal {
  id: string;
  content: string;
  date: string;
  labels: string[];
  section: string;
  meal_type?: 'lunch' | 'dinner';
  priority?: number;
  description?: string;
  is_completed?: boolean;
  completed_at?: string;
}

export interface GroceryItem {
  name: string;
  quantity: number;
  unit?: string;
  price?: number;
  category?: string;
  substitutedWith?: string;
}

export interface TescoReceipt {
  orderNumber: string;
  deliveryDate: string;
  deliverySlot: string;
  orderTotal: number;
  items: GroceryItem[];
  substitutions: Substitution[];
  unavailable: UnavailableItem[];
  shortLifeItems: ShortLifeItem[];
}

export interface Substitution {
  original: string;
  substitutedWith: string;
  price?: number;
}

export interface UnavailableItem {
  name: string;
  quantity: number;
}

export interface ShortLifeItem {
  name: string;
  daysRemaining: number;
}

export interface MatchedItem {
  ingredient: string;
  name: string;
  quantity: number | null;
  price: number | null;
}

export interface MealCoverage {
  meal: Meal;
  status: 'covered' | 'partial' | 'missing' | 'unknown';
  coverageScore: number;
  matchedItems: MatchedItem[];
  missingItems: string[];
  notes?: string;
}

export interface CoverageSummary {
  totalMeals: number;
  covered: number;
  partial: number;
  missing: number;
  unknown: number;
  coveragePercentage: number;
}

export interface DeliveryWindow {
  date: string;
  slot: string;
  orderTotal: number;
  status: 'pending' | 'delivered' | 'scheduled';
}

// Mock data for development - will be replaced with actual skill integration
export const mockMeals: Meal[] = [
  { id: '1', content: 'Pasta Bolognese', date: '2026-04-13', labels: ['adult', 'children'], section: 'Planned' },
  { id: '2', content: 'Salmon with potatoes', date: '2026-04-14', labels: ['adult'], section: 'Planned' },
  { id: '3', content: 'Fish fingers', date: '2026-04-14', labels: ['children'], section: 'Planned' },
  { id: '4', content: 'Lamb curry', date: '2026-04-15', labels: ['adult', 'children'], section: 'Planned' },
  { id: '5', content: 'Shepherd\'s pie', date: '2026-04-16', labels: ['adult', 'children'], section: 'Planned' },
  { id: '6', content: 'Stir fry', date: '2026-04-17', labels: ['adult', 'children'], section: 'Planned' },
];

export const mockReceipt: TescoReceipt = {
  orderNumber: '1234-5678-90',
  deliveryDate: '2026-04-12',
  deliverySlot: '20:00-21:00',
  orderTotal: 57.43,
  items: [
    { name: 'Beef mince 500g', quantity: 1, price: 4.50 },
    { name: 'Pasta 500g', quantity: 2, price: 1.20 },
    { name: 'Salmon fillets x2', quantity: 1, price: 6.00 },
    { name: 'New potatoes 1kg', quantity: 1, price: 1.50 },
    { name: 'Lamb mince 500g', quantity: 2, price: 5.00 },
    { name: 'Curry sauce', quantity: 1, price: 1.80 },
    { name: 'Fish fingers 10 pack', quantity: 1, price: 3.50 },
    { name: 'Stir fry veg mix', quantity: 2, price: 2.00 },
    { name: 'Egg noodles', quantity: 1, price: 1.50 },
    { name: 'Onions 1kg', quantity: 1, price: 1.20 },
    { name: 'Carrots 500g', quantity: 1, price: 0.60 },
    { name: 'Frozen peas', quantity: 1, price: 1.20 },
  ],
  substitutions: [],
  unavailable: [],
  shortLifeItems: [
    { name: 'Salmon fillets x2', daysRemaining: 2 },
    { name: 'Stir fry veg mix', daysRemaining: 3 },
  ],
};

export const mockCoverage: MealCoverage[] = [
  { meal: mockMeals[0], status: 'covered', coverageScore: 100, matchedItems: [{ingredient: 'Beef mince', name: 'Beef mince', quantity: 1, price: 0}, {ingredient: 'Pasta', name: 'Pasta', quantity: 1, price: 0}, {ingredient: 'Onions', name: 'Onions', quantity: 1, price: 0}, {ingredient: 'Carrots', name: 'Carrots', quantity: 1, price: 0}], missingItems: [] },
  { meal: mockMeals[1], status: 'covered', coverageScore: 100, matchedItems: [{ingredient: 'Salmon fillets', name: 'Salmon fillets', quantity: 1, price: 0}, {ingredient: 'New potatoes', name: 'New potatoes', quantity: 1, price: 0}], missingItems: [] },
  { meal: mockMeals[2], status: 'covered', coverageScore: 100, matchedItems: [{ingredient: 'Fish fingers', name: 'Fish fingers', quantity: 1, price: 0}], missingItems: [] },
  { meal: mockMeals[3], status: 'covered', coverageScore: 100, matchedItems: [{ingredient: 'Lamb mince', name: 'Lamb mince', quantity: 1, price: 0}, {ingredient: 'Curry sauce', name: 'Curry sauce', quantity: 1, price: 0}], missingItems: [] },
  { meal: mockMeals[4], status: 'partial', coverageScore: 70, matchedItems: [{ingredient: 'Lamb mince', name: 'Lamb mince', quantity: 1, price: 0}, {ingredient: 'Frozen peas', name: 'Frozen peas', quantity: 1, price: 0}, {ingredient: 'Carrots', name: 'Carrots', quantity: 1, price: 0}], missingItems: ['Potatoes for mash'], notes: 'Need potatoes' },
  { meal: mockMeals[5], status: 'covered', coverageScore: 100, matchedItems: [{ingredient: 'Stir fry veg', name: 'Stir fry veg', quantity: 1, price: 0}, {ingredient: 'Egg noodles', name: 'Egg noodles', quantity: 1, price: 0}], missingItems: [] },
];

// Data fetching functions (will integrate with meals skill scripts)
export async function fetchMealPlan(startDate: string, endDate: string): Promise<Meal[]> {
  return mockMeals;
}

export async function fetchLatestReceipt(): Promise<TescoReceipt | null> {
  return mockReceipt;
}

export async function analyzeCoverage(meals: Meal[], receipt: TescoReceipt): Promise<MealCoverage[]> {
  return mockCoverage;
}

export function calculateCoverageSummary(coverage: MealCoverage[]): CoverageSummary {
  const total = coverage.length;
  const covered = coverage.filter(c => c.status === 'covered').length;
  const partial = coverage.filter(c => c.status === 'partial').length;
  const missing = coverage.filter(c => c.status === 'missing').length;
  const unknown = coverage.filter(c => c.status === 'unknown').length;

  return {
    totalMeals: total,
    covered,
    partial,
    missing,
    unknown,
    coveragePercentage: Math.round(((covered + partial * 0.5) / total) * 100),
  };
}

/**
 * Generate upcoming delivery windows based on a known delivery date.
 * Tesco delivers on Tuesday (2) and Saturday (6).
 * Pass the most recent delivery date (ISO string or null) to anchor the pattern.
 */
export function getUpcomingDeliveries(deliveryDate: string | null): DeliveryWindow[] {
  if (!deliveryDate) return [];

  const toISODateLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toISODateLocal(today);

  const deliveries: DeliveryWindow[] = [];
  const deliveryDays = [2, 6]; // Tuesday, Saturday

  for (let offset = 0; offset <= 14; offset++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + offset);
    const dow = checkDate.getDay();

    if (deliveryDays.includes(dow)) {
      const dateStr = toISODateLocal(checkDate);
      const status: 'pending' | 'delivered' | 'scheduled' =
        dateStr === deliveryDate ? 'delivered' :
        dateStr < todayStr ? 'delivered' : 'pending';

      deliveries.push({
        date: dateStr,
        slot: 'Evening',
        orderTotal: 0,
        status,
      });

      if (deliveries.length >= 4) break;
    }
  }

  return deliveries;
}
