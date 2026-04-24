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
  "delivery_date": "2026-05-19",
  "delivery_sort": "",
  "order_number": "9021-8754-78",
  "order_total": 1.2,
  "items": [
    {
        "name": "Tesco British Whole Milk 1.13L, 2 Pints",
        "quantity": 1,
        "price": 1.2
    }
]
};




















































































































































// Real meal plan from Todoist (April 13-19, 2026)
// section_id 6gJfvHHqHrCMPcp9 = Ashlee's lunch section -> meal_type: 'lunch'
// section_id 6Rv6PrQrrFWQRg7h = Planned section -> meal_type: 'dinner'
export const realMealPlan: Meal[] = [
  {
    "id": "",
    "content": "Mash and cheese",
    "date": "2026-04-24",
    "labels": [],
    "section": "Planned",
    "meal_type": "lunch"
  },
  {
    "id": "",
    "content": "Tuscan Ragu pappardelle",
    "date": "2026-04-24",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "chicken / garlic bread and chips",
    "date": "2026-04-24",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Tony and Barbara cooking",
    "date": "2026-04-25",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Steak with peppercorn, salad, curly fries",
    "date": "2026-04-26",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Chicken omelette (Terina)",
    "date": "2026-04-27",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Toastie",
    "date": "2026-04-27",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "KFC",
    "date": "2026-04-28",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  }
];




















































































































































// Transform and export
export const realReceipt = transformCachedOrder(realLatestOrder);

export const realMealsCheckSummary = {
  "order_total": 1.2,
  "delivery_date": "2026-05-19",
  "meals_covered": 1,
  "meals_total": 7,
  "unmatched_groceries": 0,
  "coverage_percentage": 14,
  "day_coverage": [
    {
      "date": "2026-04-24",
      "status": "delivery",
      "is_delivery_day": true
    },
    {
      "date": "2026-04-25",
      "status": "covered",
      "is_delivery_day": false
    },
    {
      "date": "2026-04-26",
      "status": "missing",
      "is_delivery_day": false
    },
    {
      "date": "2026-04-27",
      "status": "missing",
      "is_delivery_day": false
    },
    {
      "date": "2026-04-28",
      "status": "delivery",
      "is_delivery_day": true
    },
    {
      "date": "2026-04-29",
      "status": "gap",
      "is_delivery_day": false
    },
    {
      "date": "2026-04-30",
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
      "content": "Mash and cheese",
      "date": "2026-04-24",
      "labels": [],
      "section": "Planned",
      "meal_type": "lunch"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Cheese and Garlic Flatbread 230g",
        "name": "Tesco Cheese and Garlic Flatbread 230g",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Tuscan Ragu pappardelle",
      "date": "2026-04-24",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "La Famiglia Rana Tuscan Ragu Pappardelle 814g",
        "name": "La Famiglia Rana Tuscan Ragu Pappardelle 814g",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "chicken / garlic bread and chips",
      "date": "2026-04-24",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Cheese and Garlic Flatbread 230g",
        "name": "Tesco Cheese and Garlic Flatbread 230g",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Tony and Barbara cooking",
      "date": "2026-04-25",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Steak with peppercorn, salad, curly fries",
      "date": "2026-04-26",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "\u2020 McCoy's Flame Grilled Steak Multipack Crisps 6x25g",
        "name": "\u2020 McCoy's Flame Grilled Steak Multipack Crisps 6x25g",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Chicken omelette (Terina)",
      "date": "2026-04-27",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Large Chicken Fillet Pack 1.6Kg",
        "name": "Tesco Large Chicken Fillet Pack 1.6Kg",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Toastie",
      "date": "2026-04-27",
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
      "content": "KFC",
      "date": "2026-04-28",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "takeaway - no ingredients needed",
        "name": "takeaway - no ingredients needed",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": [],
    "notes": "takeaway - no ingredients needed"
  }
];




































































































































