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
  "delivery_date": "2026-06-02",
  "delivery_sort": "",
  "order_number": "6221-8755-512",
  "order_total": 45.35,
  "items": [
    {
        "name": "Calbee Asian Style Chips Umami Salt Flavour Potato Chips 130g",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "Calbee Honey Butter Flavour Potato Chips\u00a0130g",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "Tesco Finest Extra Fruity Hot Cross Buns 4 pack",
        "quantity": 1,
        "price": 1.19
    },
    {
        "name": "Actimel Immune Support Live Yoghurt Drink - Multifruit 8x100g",
        "quantity": 1,
        "price": 2.5
    },
    {
        "name": "Activia Rhubarb Gut Health Yoghurt Multipack 4x115g",
        "quantity": 1,
        "price": 2.75
    },
    {
        "name": "Tesco Beef Stir Fry Strips 357G",
        "quantity": 1,
        "price": 12.8
    },
    {
        "name": "Tesco Blueberries 500G",
        "quantity": 1,
        "price": 4.55
    },
    {
        "name": "Tesco Boneless Salmon Fillets 4 Pack 520g",
        "quantity": 1,
        "price": 7.5
    },
    {
        "name": "Tesco British Whole Milk 1.13L, 2 Pints",
        "quantity": 1,
        "price": 1.2
    },
    {
        "name": "Tesco Green Seedless Grapes Pack 500G",
        "quantity": 1,
        "price": 2.2
    },
    {
        "name": "Tesco Guacamole 163g",
        "quantity": 1,
        "price": 1.1
    },
    {
        "name": "Tesco Italian Unsmoked Pancetta 2 X65g",
        "quantity": 1,
        "price": 1.95
    },
    {
        "name": "Tesco Large Broccoli Pack 500G",
        "quantity": 1,
        "price": 1.08
    },
    {
        "name": "Tesco Perfectly Ripe Nectarines Minimum 3",
        "quantity": 1,
        "price": 2.5
    },
    {
        "name": "Tesco Tzatziki Dip 200G",
        "quantity": 1,
        "price": 1.1
    },
    {
        "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "quantity": 1,
        "price": 4.5
    },
    {
        "name": "\u2020\u00a0Cantabile Blueberry Flavored Ade 230ml",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "\u2020\u00a0Cantabile Green Grape Flavoured Ade 230ml",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "\u2020\u00a0Cantabile Peach Flavour Ice Tea 230ml",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Deli Kitchen Carb Lite Wheat Tortilla Wraps 6 Pack 300g",
        "quantity": 1,
        "price": 1.9
    },
    {
        "name": "Happy Egg Free Range Eggs Medium 6 Pack",
        "quantity": 1,
        "price": 2.35
    },
    {
        "name": "\u2020\u00a0Hobgoblin King Goblin Ale Beer Bottle 500ml",
        "quantity": 1,
        "price": 1.87
    },
    {
        "name": "\u2020\u00a0Oakham Ales Citra 500Ml",
        "quantity": 1,
        "price": 2.13
    },
    {
        "name": "\u2020\u00a0St Austell Proper Job Ale 500Ml",
        "quantity": 1,
        "price": 1.52
    },
    {
        "name": "\u2020\u00a0St Austell Tribute 500Ml",
        "quantity": 1,
        "price": 1.98
    },
    {
        "name": "Tesco All Rounder Potatoes 2Kg",
        "quantity": 1,
        "price": 1.32
    },
    {
        "name": "\u2020\u00a0Tesco Apple And Mango From Concentrate 1 Litre",
        "quantity": 1,
        "price": 1.16
    },
    {
        "name": "Tesco Carrots 1Kg",
        "quantity": 1,
        "price": 0.69
    },
    {
        "name": "\u2020\u00a0Tesco Finest Crinkle Cut Roast Beef & Horseradish Flavour Hand Cooked Crisps 150g",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "\u2020\u00a0Tesco Pure Orange Juice With Bits 1 Litre",
        "quantity": 1,
        "price": 2.34
    },
    {
        "name": "Tesco Sweet Easy Peelers 600g",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "Tesco Cheese and Garlic Flatbread 230gSubstitutions: On",
        "quantity": 1,
        "price": 1.1
    },
    {
        "name": "Tesco Italian Unsmoked Pancetta 2 X65gSubstitutions: On",
        "quantity": 1,
        "price": 3.9
    },
    {
        "name": "Tesco Mango 450GSubstitutions: On",
        "quantity": 1,
        "price": 4.1
    },
    {
        "name": "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
        "quantity": 1,
        "price": 1.2
    },
    {
        "name": "La Famiglia Rana Tuscan Ragu Pappardelle 814gSubstitutions: On",
        "quantity": 1,
        "price": 18.0
    },
    {
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
        "quantity": 1,
        "price": 3.6
    },
    {
        "name": "Tesco White Iced Ring Doughnuts 4 PackSubstitutions: On",
        "quantity": 1,
        "price": 0.95
    },
    {
        "name": "\u2020 Tesco Summer Fruits Sparkling Flavoured Water 1 LitreSubstitutions: On",
        "quantity": 1,
        "price": 0.67
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
        "name": "Hayden's 4 Delicious Yum YumsSubstitutions: On",
        "quantity": 1,
        "price": 1.75
    },
    {
        "name": "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On",
        "quantity": 1,
        "price": 0.66
    }
]
};






































































































































































































































































































// Real meal plan from Todoist (April 13-19, 2026)
// section_id 6gJfvHHqHrCMPcp9 = Ashlee's lunch section -> meal_type: 'lunch'
// section_id 6Rv6PrQrrFWQRg7h = Planned section -> meal_type: 'dinner'
export const realMealPlan: Meal[] = [
  {
    "id": "6gm39j7WvfwXrrh9",
    "content": "Tony and Barbara cooking",
    "date": "2026-05-31",
    "labels": [
      "adults",
      "children",
      "plusTonyandBarbara"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gm39mH34Fj3Fph9",
    "content": "Tony and Barbara cooking",
    "date": "2026-06-01",
    "labels": [
      "adults",
      "children",
      "plusTonyandBarbara"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gjW648qHw7v9xQh",
    "content": "Beef strip curry and boiled rice",
    "date": "2026-06-02",
    "labels": [
      "adults",
      "plusTonyandBarbara"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
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
    "id": "6gm3FPvHmFx6HRM9",
    "content": "Rana",
    "date": "2026-06-05",
    "labels": [
      "adults",
      "plusTonyandBarbara"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  }
];





































































































































































































































































































// Transform and export
export const realReceipt = transformCachedOrder(realLatestOrder);

export const realMealsCheckSummary = {
  "coverage_percentage": 0,
  "covered": 0,
  "delivery_date": "2026-06-02",
  "meals_covered": 0,
  "meals_total": 8,
  "missing": 8,
  "order_total": 45.35,
  "partial": 0,
  "unmatched_groceries": 43
};































































































































































// Coverage data - pre-computed by sync script (do not edit manually)
export const realCoverage: MealCoverage[] = [
  {
    "meal": {
      "id": "6gm39j7WvfwXrrh9",
      "content": "Tony and Barbara cooking",
      "date": "2026-05-31",
      "labels": [
        "adults",
        "children",
        "plusTonyandBarbara"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "missing",
    "coverageScore": 0,
    "matchedItems": [],
    "missingItems": [
      "Calbee Asian Style Chips Umami Salt Flavour Potato Chips 130g",
      "Calbee Honey Butter Flavour Potato Chips\u00a0130g",
      "Tesco Finest Extra Fruity Hot Cross Buns 4 pack",
      "Actimel Immune Support Live Yoghurt Drink - Multifruit 8x100g",
      "Activia Rhubarb Gut Health Yoghurt Multipack 4x115g",
      "Tesco Beef Stir Fry Strips 357G",
      "Tesco Blueberries 500G",
      "Tesco Boneless Salmon Fillets 4 Pack 520g",
      "Tesco British Whole Milk 1.13L, 2 Pints",
      "Tesco Green Seedless Grapes Pack 500G",
      "Tesco Guacamole 163g",
      "Tesco Italian Unsmoked Pancetta 2 X65g",
      "Tesco Large Broccoli Pack 500G",
      "Tesco Perfectly Ripe Nectarines Minimum 3",
      "Tesco Tzatziki Dip 200G",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
      "\u2020\u00a0Cantabile Blueberry Flavored Ade 230ml",
      "\u2020\u00a0Cantabile Green Grape Flavoured Ade 230ml",
      "\u2020\u00a0Cantabile Peach Flavour Ice Tea 230ml",
      "Deli Kitchen Carb Lite Wheat Tortilla Wraps 6 Pack 300g",
      "Happy Egg Free Range Eggs Medium 6 Pack",
      "\u2020\u00a0Hobgoblin King Goblin Ale Beer Bottle 500ml",
      "\u2020\u00a0Oakham Ales Citra 500Ml",
      "\u2020\u00a0St Austell Proper Job Ale 500Ml",
      "\u2020\u00a0St Austell Tribute 500Ml",
      "Tesco All Rounder Potatoes 2Kg",
      "\u2020\u00a0Tesco Apple And Mango From Concentrate 1 Litre",
      "Tesco Carrots 1Kg",
      "\u2020\u00a0Tesco Finest Crinkle Cut Roast Beef & Horseradish Flavour Hand Cooked Crisps 150g",
      "\u2020\u00a0Tesco Pure Orange Juice With Bits 1 Litre",
      "Tesco Sweet Easy Peelers 600g"
    ]
  },
  {
    "meal": {
      "id": "6gm39mH34Fj3Fph9",
      "content": "Tony and Barbara cooking",
      "date": "2026-06-01",
      "labels": [
        "adults",
        "children",
        "plusTonyandBarbara"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "missing",
    "coverageScore": 0,
    "matchedItems": [],
    "missingItems": [
      "Calbee Asian Style Chips Umami Salt Flavour Potato Chips 130g",
      "Calbee Honey Butter Flavour Potato Chips\u00a0130g",
      "Tesco Finest Extra Fruity Hot Cross Buns 4 pack",
      "Actimel Immune Support Live Yoghurt Drink - Multifruit 8x100g",
      "Activia Rhubarb Gut Health Yoghurt Multipack 4x115g",
      "Tesco Beef Stir Fry Strips 357G",
      "Tesco Blueberries 500G",
      "Tesco Boneless Salmon Fillets 4 Pack 520g",
      "Tesco British Whole Milk 1.13L, 2 Pints",
      "Tesco Green Seedless Grapes Pack 500G",
      "Tesco Guacamole 163g",
      "Tesco Italian Unsmoked Pancetta 2 X65g",
      "Tesco Large Broccoli Pack 500G",
      "Tesco Perfectly Ripe Nectarines Minimum 3",
      "Tesco Tzatziki Dip 200G",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
      "\u2020\u00a0Cantabile Blueberry Flavored Ade 230ml",
      "\u2020\u00a0Cantabile Green Grape Flavoured Ade 230ml",
      "\u2020\u00a0Cantabile Peach Flavour Ice Tea 230ml",
      "Deli Kitchen Carb Lite Wheat Tortilla Wraps 6 Pack 300g",
      "Happy Egg Free Range Eggs Medium 6 Pack",
      "\u2020\u00a0Hobgoblin King Goblin Ale Beer Bottle 500ml",
      "\u2020\u00a0Oakham Ales Citra 500Ml",
      "\u2020\u00a0St Austell Proper Job Ale 500Ml",
      "\u2020\u00a0St Austell Tribute 500Ml",
      "Tesco All Rounder Potatoes 2Kg",
      "\u2020\u00a0Tesco Apple And Mango From Concentrate 1 Litre",
      "Tesco Carrots 1Kg",
      "\u2020\u00a0Tesco Finest Crinkle Cut Roast Beef & Horseradish Flavour Hand Cooked Crisps 150g",
      "\u2020\u00a0Tesco Pure Orange Juice With Bits 1 Litre",
      "Tesco Sweet Easy Peelers 600g"
    ]
  },
  {
    "meal": {
      "id": "6gjW648qHw7v9xQh",
      "content": "Beef strip curry and boiled rice",
      "date": "2026-06-02",
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
      "Tesco Cheese and Garlic Flatbread 230gSubstitutions: On",
      "Tesco Italian Unsmoked Pancetta 2 X65gSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "La Famiglia Rana Tuscan Ragu Pappardelle 814gSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "Tesco White Iced Ring Doughnuts 4 PackSubstitutions: On",
      "\u2020 Tesco Summer Fruits Sparkling Flavoured Water 1 LitreSubstitutions: On",
      "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
      "Tesco WatermelonSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On",
      "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On"
    ]
  },
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
      "Tesco Cheese and Garlic Flatbread 230gSubstitutions: On",
      "Tesco Italian Unsmoked Pancetta 2 X65gSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "La Famiglia Rana Tuscan Ragu Pappardelle 814gSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "Tesco White Iced Ring Doughnuts 4 PackSubstitutions: On",
      "\u2020 Tesco Summer Fruits Sparkling Flavoured Water 1 LitreSubstitutions: On",
      "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
      "Tesco WatermelonSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On",
      "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On"
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
      "Tesco Cheese and Garlic Flatbread 230gSubstitutions: On",
      "Tesco Italian Unsmoked Pancetta 2 X65gSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "La Famiglia Rana Tuscan Ragu Pappardelle 814gSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "Tesco White Iced Ring Doughnuts 4 PackSubstitutions: On",
      "\u2020 Tesco Summer Fruits Sparkling Flavoured Water 1 LitreSubstitutions: On",
      "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
      "Tesco WatermelonSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On",
      "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On"
    ]
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
      "Tesco Cheese and Garlic Flatbread 230gSubstitutions: On",
      "Tesco Italian Unsmoked Pancetta 2 X65gSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "La Famiglia Rana Tuscan Ragu Pappardelle 814gSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "Tesco White Iced Ring Doughnuts 4 PackSubstitutions: On",
      "\u2020 Tesco Summer Fruits Sparkling Flavoured Water 1 LitreSubstitutions: On",
      "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
      "Tesco WatermelonSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On",
      "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On"
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
    "status": "missing",
    "coverageScore": 0,
    "matchedItems": [],
    "missingItems": [
      "Tesco Cheese and Garlic Flatbread 230gSubstitutions: On",
      "Tesco Italian Unsmoked Pancetta 2 X65gSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "La Famiglia Rana Tuscan Ragu Pappardelle 814gSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "Tesco White Iced Ring Doughnuts 4 PackSubstitutions: On",
      "\u2020 Tesco Summer Fruits Sparkling Flavoured Water 1 LitreSubstitutions: On",
      "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
      "Tesco WatermelonSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On",
      "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On"
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
      "Tesco Cheese and Garlic Flatbread 230gSubstitutions: On",
      "Tesco Italian Unsmoked Pancetta 2 X65gSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "La Famiglia Rana Tuscan Ragu Pappardelle 814gSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "Tesco White Iced Ring Doughnuts 4 PackSubstitutions: On",
      "\u2020 Tesco Summer Fruits Sparkling Flavoured Water 1 LitreSubstitutions: On",
      "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
      "Tesco WatermelonSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On",
      "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On"
    ]
  }
];





















































































































































































































































































