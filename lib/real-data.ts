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
  "delivery_date": "2026-04-24",
  "delivery_sort": "",
  "order_number": "2911-8348-761",
  "items": [
    {
        "name": "Tesco Red Seedless Grapes 500G Substitutions: On",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "Tesco Cheese & Bacon En Croute 410G Substitutions: On",
        "quantity": 1,
        "price": 3.5
    },
    {
        "name": "Birds Eye Steamfresh Family Favourite Mix 540g Substitutions: On",
        "quantity": 2,
        "price": 4.5
    },
    {
        "name": "De Cecco Conchiglie Rigate 500g Substitutions: On",
        "quantity": 1,
        "price": 1.35
    }
]
};



































































// Real meal plan from Todoist (April 13-19, 2026)
// section_id 6gJfvHHqHrCMPcp9 = Ashlee's lunch section -> meal_type: 'lunch'
// section_id 6Rv6PrQrrFWQRg7h = Planned section -> meal_type: 'dinner'
export const realMealPlan: Meal[] = [
  {
    "id": "",
    "content": "Sticky rice",
    "date": "2026-04-22",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Mussels and bread",
    "date": "2026-04-22",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Pizza (Leo)",
    "date": "2026-04-22",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Mash and cheese (Ashlee)",
    "date": "2026-04-22",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Ham and cheese toastie",
    "date": "2026-04-23",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Tony and Barbara cooking",
    "date": "2026-04-23",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Mash and cheese",
    "date": "2026-04-24",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
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

// Coverage data - pre-computed by sync script (do not edit manually)
export const realCoverage: MealCoverage[] = [
  {
    "meal": {
      "id": "",
      "content": "Sticky rice",
      "date": "2026-04-22",
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
      "content": "Mussels and bread",
      "date": "2026-04-22",
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
      "content": "Pizza (Leo)",
      "date": "2026-04-22",
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
      "content": "Mash and cheese (Ashlee)",
      "date": "2026-04-22",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco American Pancake Shaker Mix With Chocolate Chips 155G",
        "name": "Tesco American Pancake Shaker Mix With Chocolate Chips 155G",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Ham and cheese toastie",
      "date": "2026-04-23",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Cheese & Bacon En Croute 410G Substitutions: On",
        "name": "Tesco Cheese & Bacon En Croute 410G Substitutions: On",
        "quantity": 1,
        "price": 3.5
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Tony and Barbara cooking",
      "date": "2026-04-23",
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
      "content": "Mash and cheese",
      "date": "2026-04-24",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco American Pancake Shaker Mix With Chocolate Chips 155G",
        "name": "Tesco American Pancake Shaker Mix With Chocolate Chips 155G",
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
    "status": "missing",
    "coverageScore": 0,
    "matchedItems": [],
    "missingItems": [],
    "notes": "No matching items"
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
        "ingredient": "Tesco American Pancake Shaker Mix With Chocolate Chips 155G",
        "name": "Tesco American Pancake Shaker Mix With Chocolate Chips 155G",
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
        "ingredient": "Tesco Beef Steaks with Peppercorn Sauce 320g",
        "name": "Tesco Beef Steaks with Peppercorn Sauce 320g",
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
    "status": "missing",
    "coverageScore": 0,
    "matchedItems": [],
    "missingItems": [],
    "notes": "No matching items"
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



















































