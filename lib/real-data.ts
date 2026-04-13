/**
 * Real Meals Data Fetcher
 * 
 * Fetches data from the meals skill scripts and cache files.
 * This replaces the mock data with actual data from Todoist and Tesco.
 */

import { Meal, TescoReceipt, MealCoverage, DeliveryWindow } from './meals-data';

// Path to meals skill (relative to project root)
const MEALS_SKILL_PATH = '../../skills/meals';

interface FetchMealPlanResult {
  meals: Meal[];
  total_meals: number;
  date_range: { start: string; end: string };
  message?: string;
}

interface CachedOrder {
  email_id: string;
  email_date: string;
  delivery_date: string | null;
  delivery_sort: string;
  order_number: string | null;
  items: {
    name: string;
    quantity: number;
    price: number;
  }[];
}

interface ReceiptCache {
  current_delivery_date: string;
  orders: CachedOrder[];
}

/**
 * Fetch meal plan from Todoist via the meals skill
 */
export async function fetchRealMealPlan(startDate: string, endDate: string): Promise<Meal[]> {
  try {
    // In a real implementation, this would call the Python script
    // For now, we'll read from a JSON file that gets updated by a build script
    const response = await fetch('/data/meal-plan.json');
    if (!response.ok) throw new Error('Failed to fetch meal plan');
    const data: FetchMealPlanResult = await response.json();
    return data.meals;
  } catch (error) {
    console.error('Error fetching meal plan:', error);
    return [];
  }
}

/**
 * Get the latest Tesco receipt from cache
 */
export async function fetchLatestReceipt(): Promise<TescoReceipt | null> {
  try {
    const response = await fetch('/data/latest-receipt.json');
    if (!response.ok) throw new Error('Failed to fetch receipt');
    return await response.json();
  } catch (error) {
    console.error('Error fetching receipt:', error);
    return null;
  }
}

/**
 * Transform cached order data to TescoReceipt format
 */
export function transformCachedOrder(order: CachedOrder): TescoReceipt {
  const totalPrice = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  // Identify short-life items (fresh produce with short shelf life)
  const shortLifeKeywords = ['strawberries', 'raspberries', 'blueberries', 'blackberries', 
    'lettuce', 'salad', 'spinach', 'herbs', 'fresh', 'bread', 'milk'];
  
  const shortLifeItems = order.items
    .filter(item => shortLifeKeywords.some(kw => item.name.toLowerCase().includes(kw)))
    .map(item => ({
      name: item.name,
      daysRemaining: item.name.toLowerCase().includes('berry') || 
                     item.name.toLowerCase().includes('lettuce') ? 2 : 5,
    }));
  
  // Map items with categories
  const getCategory = (itemName: string): string => {
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
  };
  
  return {
    orderNumber: order.order_number || 'Unknown',
    deliveryDate: order.delivery_date || order.email_date,
    deliverySlot: 'Evening',
    orderTotal: totalPrice,
    items: order.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      category: getCategory(item.name),
    })),
    substitutions: [],
    unavailable: [],
    shortLifeItems,
  };
}

/**
 * Simple coverage analysis based on keyword matching
 * This is a simplified version - the real meals skill has more sophisticated logic
 */
export function analyzeCoverage(meals: Meal[], receipt: TescoReceipt): MealCoverage[] {
  const items = receipt.items.map(i => i.name.toLowerCase());
  
  return meals.map(meal => {
    const mealLower = meal.content.toLowerCase();
    const matchedItems: string[] = [];
    const missingItems: string[] = [];
    
    // Simple keyword matching (real implementation uses meal_ingredient_lookup.py)
    const keywords: Record<string, string[]> = {
      'pizza': ['pizza'],
      'potato': ['potato', 'potatoes'],
      'cheese': ['cheese'],
      'beans': ['beans'],
      'gammon': ['gammon', 'ham'],
      'steak': ['steak', 'beef'],
      'salad': ['lettuce', 'tomato', 'cucumber', 'salad'],
      'toastie': ['bread', 'cheese'],
      'chicken': ['chicken'],
      'rice': ['rice'],
      'noodles': ['noodles', 'pasta'],
      'kfc': ['chicken'],
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
      totalKeywords++;
      if (items.some(i => i.includes('potato'))) {
        matchCount++;
        matchedItems.push('potatoes');
      } else {
        missingItems.push('potatoes');
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

// Real data from the meals skill cache (April 10, 2026 delivery)
export const realLatestOrder: CachedOrder = {
  "email_id": "19d777b317c3b7fe",
  "email_date": "2026-04-10T14:00:00",
  "delivery_date": "Friday 10 April 2026",
  "delivery_sort": "2026-04-10T00:00:00",
  "order_number": "4611-8983-20",
  "items": [
    { "name": "Crosta & Mollica Salami Napoli Sourdough Pizza 413g", "quantity": 1, "price": 6.25 },
    { "name": "Crosta & Mollica Stromboli Spicy Salami Sourdough Pizza 447g", "quantity": 1, "price": 6.25 },
    { "name": "Rosedene Farms Blueberries 150G", "quantity": 1, "price": 1.31 },
    { "name": "Tesco Blueberries 150G", "quantity": 1, "price": 2.0 },
    { "name": "Tesco Celery", "quantity": 1, "price": 0.75 },
    { "name": "Tesco Organic Celery", "quantity": 1, "price": 1.3 },
    { "name": "Actimel Immune Support Live Yoghurt Drink - Multifruit 8x100g", "quantity": 1, "price": 2.5 },
    { "name": "Activia Rhubarb Gut Health Yoghurt Multipack 4x115g", "quantity": 1, "price": 2.75 },
    { "name": "Innocent Wonder Green Juice 750Ml", "quantity": 1, "price": 2.5 },
    { "name": "Rosedene Farms Raspberries 125G", "quantity": 1, "price": 1.49 },
    { "name": "Tesco Blackberries 250G", "quantity": 3, "price": 8.25 },
    { "name": "Tesco Finest Green Grapes Seedless 500G", "quantity": 3, "price": 6.0 },
    { "name": "Tesco Finest Red Grapes Seedless 500G", "quantity": 1, "price": 2.0 },
    { "name": "Tesco Fire Pit 2 Salt & Pepper Beef Steaks 200G", "quantity": 1, "price": 4.04 },
    { "name": "Tesco Gammon Steak With Cheese & Pineapple 345G", "quantity": 1, "price": 3.96 },
    { "name": "Tesco Iceberg Lettuce 200G", "quantity": 2, "price": 1.28 },
    { "name": "Tesco Pork Loin Joint 1.900KG", "quantity": 1, "price": 7.6 },
    { "name": "Tesco Pork Stir Fry 500G", "quantity": 1, "price": 4.3 },
    { "name": "Tesco Strawberries 400G", "quantity": 1, "price": 2.6 },
    { "name": "Yoplait Frubes Yoghurt Tubes - Strawberry, Red Berry & Peach 9x37g", "quantity": 1, "price": 1.5 },
    { "name": "Aunt Bessie's Maple & Thyme Glazed Carrots 500g", "quantity": 1, "price": 2.5 },
    { "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g", "quantity": 2, "price": 4.5 },
    { "name": "Tesco Frozen Broccoli Florets 900G", "quantity": 1, "price": 1.07 },
    { "name": "Butterkist Microwave Popcorn Sweet & Salted 3X60g", "quantity": 1, "price": 1.75 },
    { "name": "De Cecco Conchiglie Rigate 500g", "quantity": 1, "price": 2.0 },
    { "name": "Jammie Dodgers Biscuits 140G", "quantity": 1, "price": 0.65 },
    { "name": "Tesco All Rounder Potatoes 2Kg", "quantity": 1, "price": 1.32 },
    { "name": "Tesco Baby Plum Tomatoes 300G", "quantity": 2, "price": 1.8 },
    { "name": "Tesco Baking Potatoes 2kg", "quantity": 1, "price": 1.4 },
    { "name": "Tesco Medium Free Range Eggs 12 Pack", "quantity": 1, "price": 2.85 },
    { "name": "Tesco Red Peppers Each", "quantity": 2, "price": 1.4 },
    { "name": "Tesco Whole Cucumber Each", "quantity": 1, "price": 0.8 },
  ]
};

// Real meal plan from Todoist (April 13-17, 2026)
export const realMealPlan: Meal[] = [
  { id: '6gJfvMfJ43rpMf4h', content: 'Mash potato, cheese, beans', date: '2026-04-13', labels: [], section: 'Planned' },
  { id: '6gJg7wWGPVH3J289', content: 'Pizza', date: '2026-04-13', labels: ['adult'], section: 'Planned' },
  { id: '6gJg7xQ73r4GFg6h', content: 'Toastie', date: '2026-04-13', labels: ['children'], section: 'Planned' },
  { id: '6gJfvXWQ62xmcvFh', content: 'Sticky rice', date: '2026-04-14', labels: [], section: 'Planned' },
  { id: '6gJfXmmr9Hjp2MH9', content: 'Gammon, baked potatoes and salad', date: '2026-04-14', labels: ['children'], section: 'Planned' },
  { id: '6gJfXqChQ7wx9JFh', content: 'Beef steaks, baked potatoes and salad', date: '2026-04-14', labels: ['adult'], section: 'Planned' },
  { id: '6gJfvVvqpMpG8mv9', content: 'Ham and cheese toastie', date: '2026-04-15', labels: [], section: 'Planned' },
  { id: '6gJhvC5QhXC2hHR9', content: 'Pizza (Leo)', date: '2026-04-15', labels: ['children'], section: 'Planned' },
  { id: '6gMPhXmqffW8MMGh', content: 'Mash potato cheese (Ashlee)', date: '2026-04-15', labels: ['children'], section: 'Planned' },
  { id: '6gJhvG6JXWPw4GGh', content: 'Chicken and rice veg (Terina)', date: '2026-04-15', labels: ['adult'], section: 'Planned' },
  { id: '6gJfvcwHgh5hx2gh', content: 'Jacket potatoes (school)', date: '2026-04-16', labels: [], section: 'Planned' },
  { id: '6gJhvfx2j3fxQFv9', content: 'KFC', date: '2026-04-16', labels: ['children'], section: 'Planned' },
  { id: '6gJfvgmG5cHr2Wrh', content: 'KFC', date: '2026-04-17', labels: [], section: 'Planned' },
  { id: '6gM4f6gQjgVXPq49', content: 'Chicken and noodles (Terina)', date: '2026-04-17', labels: ['adult'], section: 'Planned' },
  { id: '6Rv6P5rj7RjvV6j9', content: 'chicken / garlic bread and chips', date: '2026-04-17', labels: ['children'], section: 'Planned' },
];

// Transform and export
export const realReceipt = transformCachedOrder(realLatestOrder);
export const realCoverage = analyzeCoverage(realMealPlan, realReceipt);
