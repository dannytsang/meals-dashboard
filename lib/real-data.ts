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
  order_total?: number;
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
  const totalPrice = order.order_total ?? order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
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
 * This is a simplified version - the real meals skill has more sophisticated logic.
 * NOTE: Coverage data is now pre-computed by the sync script. This function
 * is kept for type compatibility but returns empty data.
 */
export function analyzeCoverage(meals: Meal[], receipt: TescoReceipt): MealCoverage[] {
  // Coverage is now pre-computed by the sync script.
  // NOTE: analyzeCoverage() returns empty data.
  // Coverage data is loaded at runtime from pre-computed realCoverage.
  return meals.map(meal => ({
    meal,
    status: 'unknown' as const,
    coverageScore: 0,
    matchedItems: [],
    missingItems: [],
  }));
}

// Real data from the meals skill cache (April 10, 2026 delivery)
export const realLatestOrder: CachedOrder = {
  "email_id": "",
  "email_date": "",
  "delivery_date": "2026-05-22",
  "delivery_sort": "",
  "order_number": "5121-8713-222",
  "order_total": 50.2,
  "items": [
    {
        "name": "Tesco The Chicken Club Sandwich Substitutions: On",
        "quantity": 1,
        "price": 1.45
    },
    {
        "name": "Emmi High Protein Caffe Latte 370ml Substitutions: On",
        "quantity": 1,
        "price": 1.32
    },
    {
        "name": "Tesco Three Cheese Pasta Bake 750g Substitutions: On",
        "quantity": 1,
        "price": 3.25
    },
    {
        "name": "Tesco Smoky Bacon Sarnie - Tangy Ketchup Substitutions: On",
        "quantity": 1,
        "price": 1.95
    },
    {
        "name": "Walls 4 Hearty Sausage Rolls 220G Substitutions: On",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Tesco Bolognese Pasta Bake 750g Substitutions: On",
        "quantity": 1,
        "price": 3.25
    },
    {
        "name": "Tesco Quiche-Lorraine 400g Substitutions: On",
        "quantity": 1,
        "price": 1.75
    },
    {
        "name": "\u2020 Pringles Salt & Vinegar Sharing Crisps 165g Substitutions: On",
        "quantity": 1,
        "price": 1.75
    },
    {
        "name": "\u2020 McCoy's Flame Grilled Steak Multipack Crisps 6x25g Substitutions: On",
        "quantity": 3,
        "price": 5.25
    },
    {
        "name": "\u2020 Maoam Bloxx 4 Pack 88G Substitutions: On",
        "quantity": 1,
        "price": 0.49
    },
    {
        "name": "McVitie's Jaffa Cakes - Hot Honey Flavour 10 Pack Substitutions: On",
        "quantity": 1,
        "price": 0.75
    },
    {
        "name": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G Substitutions: On",
        "quantity": 1,
        "price": 0.53
    },
    {
        "name": "\u2020 Cantabile Double Mango Flavored Ade 230ml Substitutions: On",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "\u2020 Calbee Seaweed & Salt Flavour Potato Chips 130g Substitutions: On",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "Nescafe Dolce Gusto Kit Kat Cocoa Beverage Pods x16 256g Substitutions: On",
        "quantity": 2,
        "price": 7.5
    }
]
};

























































































































































































































































// Real meal plan from Todoist (April 13-19, 2026)
// section_id 6gJfvHHqHrCMPcp9 = Ashlee's lunch section -> meal_type: 'lunch'
// section_id 6Rv6PrQrrFWQRg7h = Planned section -> meal_type: 'dinner'
export const realMealPlan: Meal[] = [
  {
    "id": "",
    "content": "Costco",
    "date": "2026-05-21",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Mussels and part baked bread",
    "date": "2026-05-22",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "chicken / garlic bread and chips",
    "date": "2026-05-22",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Terina, Leo and Ashlee out",
    "date": "2026-05-23",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  }
];
























































































































































































































































// Transform and export
export const realReceipt = transformCachedOrder(realLatestOrder);

export const realMealsCheckSummary = {
  "order_total": 50.2,
  "delivery_date": "2026-05-22",
  "meals_covered": 1,
  "meals_total": 7,
  "unmatched_groceries": 21,
  "coverage_percentage": 14,
  "day_coverage": [
    {
      "date": "2026-05-21",
      "status": "missing",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-22",
      "status": "delivery",
      "is_delivery_day": true
    },
    {
      "date": "2026-05-23",
      "status": "missing",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-24",
      "status": "gap",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-25",
      "status": "gap",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-26",
      "status": "gap",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-27",
      "status": "gap",
      "is_delivery_day": false
    }
  ]
};


















































































































// Coverage data - pre-computed by sync script (do not edit manually)
export const realCoverage: MealCoverage[] = [
  {
    "meal": {
      "id": "",
      "content": "Costco",
      "date": "2026-05-21",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "missing",
    "coverageScore": 0,
    "matchedItems": [],
    "missingItems": [],
    "notes": "No matching items"
  },
  {
    "meal": {
      "id": "",
      "content": "Mussels and part baked bread",
      "date": "2026-05-22",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "\u2020 Calbee Seaweed & Salt Flavour Potato Chips 130g Substitutions: On",
        "name": "\u2020 Calbee Seaweed & Salt Flavour Potato Chips 130g Substitutions: On",
        "quantity": 1,
        "price": 1.5
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "chicken / garlic bread and chips",
      "date": "2026-05-22",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco The Chicken Club Sandwich Substitutions: On",
        "name": "Tesco The Chicken Club Sandwich Substitutions: On",
        "quantity": 1,
        "price": 1.45
      },
      {
        "ingredient": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G Substitutions: On",
        "name": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G Substitutions: On",
        "quantity": 1,
        "price": 0.53
      },
      {
        "ingredient": "\u2020 Calbee Seaweed & Salt Flavour Potato Chips 130g Substitutions: On",
        "name": "\u2020 Calbee Seaweed & Salt Flavour Potato Chips 130g Substitutions: On",
        "quantity": 1,
        "price": 1.5
      },
      {
        "ingredient": "Tesco The Chicken Club Sandwich",
        "name": "Tesco The Chicken Club Sandwich",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "name": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Terina, Leo and Ashlee out",
      "date": "2026-05-23",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "missing",
    "coverageScore": 0,
    "matchedItems": [],
    "missingItems": [],
    "notes": "No matching items"
  }
];








































































































































































































































