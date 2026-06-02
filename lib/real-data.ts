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
  "delivery_date": "2026-06-05",
  "delivery_sort": "",
  "order_number": "5421-8162-00",
  "order_total": 6.2,
  "items": [
    {
        "name": "Tesco British Mature Grated Cheddar Cheese 250 GSubstitutions: On",
        "quantity": 1,
        "price": 2.13
    },
    {
        "name": "Tesco British Mature Cheddar Cheese 10 Slices, 250 GSubstitutions: On",
        "quantity": 1,
        "price": 2.37
    },
    {
        "name": "Tesco Mango 450GSubstitutions: On",
        "quantity": 1,
        "price": 4.1
    },
    {
        "name": "Creamfields Red Leicester Cheese 400GSubstitutions: On",
        "quantity": 1,
        "price": 2.49
    },
    {
        "name": "Activia Rhubarb Gut Health Yoghurt Multipack 4x115gSubstitutions: On",
        "quantity": 1,
        "price": 2.75
    },
    {
        "name": "Tesco Cheese and Garlic Flatbread 230gSubstitutions: On",
        "quantity": 1,
        "price": 1.1
    },
    {
        "name": "Tesco Italian Unsmoked Pancetta 2 X65gSubstitutions: On",
        "quantity": 1,
        "price": 1.95
    },
    {
        "name": "Tesco Thin Cut Beef Steaks 395GSubstitutions: On",
        "quantity": 1,
        "price": 4.5
    },
    {
        "name": "Tesco Beef Steaks with Peppercorn Sauce 320gSubstitutions: On",
        "quantity": 1,
        "price": 8.0
    },
    {
        "name": "La Famiglia Rana Tuscan Ragu Pappardelle 814gSubstitutions: On",
        "quantity": 1,
        "price": 18.0
    },
    {
        "name": "Acre Lane Lamb Mince 454GSubstitutions: On",
        "quantity": 1,
        "price": 5.7
    },
    {
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
        "quantity": 1,
        "price": 1.8
    },
    {
        "name": "\u2020 Calbee Takoyaki Ball Japanese Style BBQ Sauce Flavour Corn Puffs 75gSubstitutions: On",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "Tesco Red Peppers EachSubstitutions: On",
        "quantity": 1,
        "price": 0.7
    },
    {
        "name": "Tesco White Iced Ring Doughnuts 4 PackSubstitutions: On",
        "quantity": 1,
        "price": 0.95
    },
    {
        "name": "Tesco Naturally Sweet Sweetcorn 325GSubstitutions: On",
        "quantity": 1,
        "price": 0.53
    },
    {
        "name": "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
        "quantity": 1,
        "price": 0.67
    },
    {
        "name": "Tesco WatermelonSubstitutions: On",
        "quantity": 1,
        "price": 3.75
    },
    {
        "name": "\u2020 Calbee Seaweed & Salt Flavour Potato Chips 130gSubstitutions: On",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "Hayden's 4 Delicious Yum YumsSubstitutions: On",
        "quantity": 1,
        "price": 1.75
    },
    {
        "name": "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On",
        "quantity": 1,
        "price": 1.33
    },
    {
        "name": "\u2020 Calbee Honey Butter Flavour Potato Chips 130gSubstitutions: On",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "Tesco Italian Chopped Tomatoes 4 X 400GSubstitutions: On",
        "quantity": 1,
        "price": 1.85
    },
    {
        "name": "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
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
    "id": "6gm39q8WFFj8whvh",
    "content": "Pizza (Leo)",
    "date": "2026-06-03",
    "labels": [
      "children"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gjW67xrPHqWxQJ9",
    "content": "Fried rice",
    "date": "2026-06-03",
    "labels": [
      "adult"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gm39xgq2669Xq29",
    "content": "Tony and Barbara cooking",
    "date": "2026-06-04",
    "labels": [
      "adults",
      "children",
      "plusTonyandBarbara"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6Rv6P5rj7RjvV6j9",
    "content": "chicken / garlic bread and chips",
    "date": "2026-06-05",
    "labels": [
      "children"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gm3FPvHmFx6HRM9",
    "content": "Rana",
    "date": "2026-06-05",
    "labels": [
      "adults",
      "plusTonyandBarbara"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gm3FRVWGg36q5R9",
    "content": "Eastbourne",
    "date": "2026-06-06",
    "labels": [
      "adults",
      "children"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gm3FVR926f6QR39",
    "content": "Eastbourne",
    "date": "2026-06-07",
    "labels": [
      "adults",
      "children"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  }
];












































































































































































































































































































// Transform and export
export const realReceipt = transformCachedOrder(realLatestOrder);

export const realMealsCheckSummary = {
  "coverage_percentage": 14,
  "covered": 1,
  "delivery_date": "2026-06-05",
  "meals_covered": 1,
  "meals_total": 7,
  "missing": 6,
  "order_total": 6.2,
  "partial": 0,
  "unmatched_groceries": 24
};






































































































































































// Coverage data - pre-computed by sync script (do not edit manually)
export const realCoverage: MealCoverage[] = [
  {
    "meal": {
      "id": "6gm39q8WFFj8whvh",
      "content": "Pizza (Leo)",
      "date": "2026-06-03",
      "labels": [
        "children"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "missing",
    "coverageScore": 0,
    "matchedItems": [],
    "missingItems": [
      "Tesco British Mature Grated Cheddar Cheese 250 GSubstitutions: On",
      "Tesco British Mature Cheddar Cheese 10 Slices, 250 GSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Creamfields Red Leicester Cheese 400GSubstitutions: On",
      "Activia Rhubarb Gut Health Yoghurt Multipack 4x115gSubstitutions: On",
      "Tesco Cheese and Garlic Flatbread 230gSubstitutions: On",
      "Tesco Italian Unsmoked Pancetta 2 X65gSubstitutions: On",
      "Tesco Thin Cut Beef Steaks 395GSubstitutions: On",
      "Tesco Beef Steaks with Peppercorn Sauce 320gSubstitutions: On",
      "La Famiglia Rana Tuscan Ragu Pappardelle 814gSubstitutions: On",
      "Acre Lane Lamb Mince 454GSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "\u2020 Calbee Takoyaki Ball Japanese Style BBQ Sauce Flavour Corn Puffs 75gSubstitutions: On",
      "Tesco Red Peppers EachSubstitutions: On",
      "Tesco White Iced Ring Doughnuts 4 PackSubstitutions: On",
      "Tesco Naturally Sweet Sweetcorn 325GSubstitutions: On",
      "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
      "Tesco WatermelonSubstitutions: On",
      "\u2020 Calbee Seaweed & Salt Flavour Potato Chips 130gSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On",
      "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On",
      "\u2020 Calbee Honey Butter Flavour Potato Chips 130gSubstitutions: On",
      "Tesco Italian Chopped Tomatoes 4 X 400GSubstitutions: On"
    ]
  },
  {
    "meal": {
      "id": "6gjW67xrPHqWxQJ9",
      "content": "Fried rice",
      "date": "2026-06-03",
      "labels": [
        "adult"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "missing",
    "coverageScore": 0,
    "matchedItems": [],
    "missingItems": [
      "Tesco British Mature Grated Cheddar Cheese 250 GSubstitutions: On",
      "Tesco British Mature Cheddar Cheese 10 Slices, 250 GSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Creamfields Red Leicester Cheese 400GSubstitutions: On",
      "Activia Rhubarb Gut Health Yoghurt Multipack 4x115gSubstitutions: On",
      "Tesco Cheese and Garlic Flatbread 230gSubstitutions: On",
      "Tesco Italian Unsmoked Pancetta 2 X65gSubstitutions: On",
      "Tesco Thin Cut Beef Steaks 395GSubstitutions: On",
      "Tesco Beef Steaks with Peppercorn Sauce 320gSubstitutions: On",
      "La Famiglia Rana Tuscan Ragu Pappardelle 814gSubstitutions: On",
      "Acre Lane Lamb Mince 454GSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "\u2020 Calbee Takoyaki Ball Japanese Style BBQ Sauce Flavour Corn Puffs 75gSubstitutions: On",
      "Tesco Red Peppers EachSubstitutions: On",
      "Tesco White Iced Ring Doughnuts 4 PackSubstitutions: On",
      "Tesco Naturally Sweet Sweetcorn 325GSubstitutions: On",
      "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
      "Tesco WatermelonSubstitutions: On",
      "\u2020 Calbee Seaweed & Salt Flavour Potato Chips 130gSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On",
      "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On",
      "\u2020 Calbee Honey Butter Flavour Potato Chips 130gSubstitutions: On",
      "Tesco Italian Chopped Tomatoes 4 X 400GSubstitutions: On"
    ]
  },
  {
    "meal": {
      "id": "6gm39xgq2669Xq29",
      "content": "Tony and Barbara cooking",
      "date": "2026-06-04",
      "labels": [
        "adults",
        "children",
        "plusTonyandBarbara"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "[external] Tony and Barbara cooking",
        "name": "[external] Tony and Barbara cooking",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": [],
    "notes": "external"
  },
  {
    "meal": {
      "id": "6Rv6P5rj7RjvV6j9",
      "content": "chicken / garlic bread and chips",
      "date": "2026-06-05",
      "labels": [
        "children"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "missing",
    "coverageScore": 0,
    "matchedItems": [],
    "missingItems": [
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On"
    ]
  },
  {
    "meal": {
      "id": "6gm3FPvHmFx6HRM9",
      "content": "Rana",
      "date": "2026-06-05",
      "labels": [
        "adults",
        "plusTonyandBarbara"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "missing",
    "coverageScore": 0,
    "matchedItems": [],
    "missingItems": [
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On"
    ]
  },
  {
    "meal": {
      "id": "6gm3FRVWGg36q5R9",
      "content": "Eastbourne",
      "date": "2026-06-06",
      "labels": [
        "adults",
        "children"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "missing",
    "coverageScore": 0,
    "matchedItems": [],
    "missingItems": [
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On"
    ]
  },
  {
    "meal": {
      "id": "6gm3FVR926f6QR39",
      "content": "Eastbourne",
      "date": "2026-06-07",
      "labels": [
        "adults",
        "children"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "missing",
    "coverageScore": 0,
    "matchedItems": [],
    "missingItems": [
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On"
    ]
  }
];




























































































































































































































































































