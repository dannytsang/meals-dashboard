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
  "order_total": 46.2,
  "items": [
    {
        "name": "Emmi High Protein Caffe Latte 370ml",
        "quantity": 1,
        "price": 1.32
    },
    {
        "name": "Tesco Bacon Lettuce & Tom Sandwich",
        "quantity": 1,
        "price": 1.9
    },
    {
        "name": "Tesco Bolognese Pasta Bake 750g",
        "quantity": 1,
        "price": 3.25
    },
    {
        "name": "Tesco Quiche-Lorraine 400g",
        "quantity": 1,
        "price": 1.75
    },
    {
        "name": "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
        "quantity": 1,
        "price": 1.95
    },
    {
        "name": "Tesco The Chicken Club Sandwich",
        "quantity": 1,
        "price": 1.45
    },
    {
        "name": "Tesco Three Cheese Pasta Bake 750g",
        "quantity": 1,
        "price": 3.25
    },
    {
        "name": "Walls 4 Hearty Sausage Rolls 220G",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Butterkist Microwave Popcorn Sweet & Salted 3X60g",
        "quantity": 1,
        "price": 2.5
    },
    {
        "name": "Caxton Pink & White Wafers 6 Pack 85G",
        "quantity": 1,
        "price": 0.7
    },
    {
        "name": "\u2020\u00a0Dr Pepper Regular 500 M",
        "quantity": 1,
        "price": 2.83
    },
    {
        "name": "\u2020\u00a0Keep It Handy Assorted Plasters Pack 42pk",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "\u2020\u00a0Kind Protein Caramel Nut 50g",
        "quantity": 1,
        "price": 1.08
    },
    {
        "name": "\u2020\u00a0Maoam Bloxx 4 Pack 88G",
        "quantity": 1,
        "price": 0.49
    },
    {
        "name": "\u2020\u00a0McCoy's Flame Grilled Steak Multipack Crisps 6x25g",
        "quantity": 1,
        "price": 5.25
    },
    {
        "name": "McVitie's Jaffa Cakes - Hot Honey Flavour 10 Pack",
        "quantity": 1,
        "price": 0.75
    },
    {
        "name": "Nescafe Dolce Gusto Kit Kat Cocoa Beverage Pods x16 256g",
        "quantity": 1,
        "price": 7.5
    },
    {
        "name": "\u2020\u00a0Pringles Salt & Vinegar Sharing Crisps 165g",
        "quantity": 1,
        "price": 1.75
    },
    {
        "name": "\u2020\u00a0Skinny Whip Double Chocolate Nougat Bars 5 x 20g",
        "quantity": 1,
        "price": 0.95
    },
    {
        "name": "\u2020\u00a0Swizzels Drumsticks Squashies Original Bag 60G",
        "quantity": 1,
        "price": 0.53
    },
    {
        "name": "Tesco Finest Apple & Cinnamon Hot Cross Buns 4 Pack",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "Tesco Finest Extra Fruity Hot Cross Buns 4 pack",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "Emmi High Protein Caffe Latte 370ml",
        "quantity": 1,
        "price": 1.32
    },
    {
        "name": "Tesco Bacon Lettuce & Tom Sandwich",
        "quantity": 1,
        "price": 1.9
    },
    {
        "name": "Tesco Bolognese Pasta Bake 750g",
        "quantity": 1,
        "price": 3.25
    },
    {
        "name": "Tesco Quiche-Lorraine 400g",
        "quantity": 1,
        "price": 1.75
    },
    {
        "name": "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
        "quantity": 1,
        "price": 1.95
    },
    {
        "name": "Tesco The Chicken Club Sandwich",
        "quantity": 1,
        "price": 1.45
    },
    {
        "name": "Tesco Three Cheese Pasta Bake 750g",
        "quantity": 1,
        "price": 3.25
    },
    {
        "name": "Walls 4 Hearty Sausage Rolls 220G",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Butterkist Microwave Popcorn Sweet & Salted 3X60g",
        "quantity": 1,
        "price": 2.5
    },
    {
        "name": "Caxton Pink & White Wafers 6 Pack 85G",
        "quantity": 1,
        "price": 0.7
    },
    {
        "name": "\u2020\u00a0Dr Pepper Regular 500 M",
        "quantity": 1,
        "price": 2.83
    },
    {
        "name": "\u2020\u00a0Keep It Handy Assorted Plasters Pack 42pk",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "\u2020\u00a0Kind Protein Caramel Nut 50g",
        "quantity": 1,
        "price": 1.08
    },
    {
        "name": "\u2020\u00a0Maoam Bloxx 4 Pack 88G",
        "quantity": 1,
        "price": 0.49
    },
    {
        "name": "\u2020\u00a0McCoy's Flame Grilled Steak Multipack Crisps 6x25g",
        "quantity": 1,
        "price": 5.25
    },
    {
        "name": "McVitie's Jaffa Cakes - Hot Honey Flavour 10 Pack",
        "quantity": 1,
        "price": 0.75
    },
    {
        "name": "Nescafe Dolce Gusto Kit Kat Cocoa Beverage Pods x16 256g",
        "quantity": 1,
        "price": 7.5
    },
    {
        "name": "\u2020\u00a0Pringles Salt & Vinegar Sharing Crisps 165g",
        "quantity": 1,
        "price": 1.75
    },
    {
        "name": "\u2020\u00a0Skinny Whip Double Chocolate Nougat Bars 5 x 20g",
        "quantity": 1,
        "price": 0.95
    },
    {
        "name": "\u2020\u00a0Swizzels Drumsticks Squashies Original Bag 60G",
        "quantity": 1,
        "price": 0.53
    },
    {
        "name": "Tesco Finest Apple & Cinnamon Hot Cross Buns 4 Pack",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "Tesco Finest Extra Fruity Hot Cross Buns 4 pack",
        "quantity": 1,
        "price": 2.0
    }
]
};





























































































































































































































































































// Real meal plan from Todoist (April 13-19, 2026)
// section_id 6gJfvHHqHrCMPcp9 = Ashlee's lunch section -> meal_type: 'lunch'
// section_id 6Rv6PrQrrFWQRg7h = Planned section -> meal_type: 'dinner'
export const realMealPlan: Meal[] = [
  {
    "id": "6Rv6P5rj7RjvV6j9",
    "content": "chicken / garlic bread and chips",
    "date": "2026-05-29",
    "labels": [
      "children"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gjW34qmRx7gGxV9",
    "content": "Eating out",
    "date": "2026-05-28",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gjW648qHw7v9xQh",
    "content": "Beef strip curry and boiled rice",
    "date": "2026-05-30",
    "labels": [
      "adults"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gjW67xrPHqWxQJ9",
    "content": "Fried rice",
    "date": "2026-05-31",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  }
];




























































































































































































































































































// Transform and export
export const realReceipt = transformCachedOrder(realLatestOrder);

export const realMealsCheckSummary = {
  "coverage_percentage": 50,
  "covered": 1,
  "delivery_date": "2026-05-30",
  "meals_covered": 2,
  "meals_total": 4,
  "missing": 2,
  "order_total": 46.2,
  "partial": 1,
  "unmatched_groceries": 42
};






















































































































































// Coverage data - pre-computed by sync script (do not edit manually)
export const realCoverage: MealCoverage[] = [
  {
    "meal": {
      "id": "6Rv6P5rj7RjvV6j9",
      "content": "chicken / garlic bread and chips",
      "date": "2026-05-29",
      "labels": [
        "children"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "partial",
    "coverageScore": 50,
    "matchedItems": [
      {
        "ingredient": "Tesco The Chicken Club Sandwich",
        "name": "Tesco The Chicken Club Sandwich",
        "quantity": 1,
        "price": 1.45
      }
    ],
    "missingItems": [
      "Emmi High Protein Caffe Latte 370ml",
      "Tesco Bacon Lettuce & Tom Sandwich",
      "Tesco Bolognese Pasta Bake 750g",
      "Tesco Quiche-Lorraine 400g",
      "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
      "Tesco Three Cheese Pasta Bake 750g",
      "Walls 4 Hearty Sausage Rolls 220G",
      "Butterkist Microwave Popcorn Sweet & Salted 3X60g",
      "Caxton Pink & White Wafers 6 Pack 85G",
      "\u2020\u00a0Dr Pepper Regular 500 M",
      "\u2020\u00a0Keep It Handy Assorted Plasters Pack 42pk",
      "\u2020\u00a0Kind Protein Caramel Nut 50g",
      "\u2020\u00a0Maoam Bloxx 4 Pack 88G",
      "\u2020\u00a0McCoy's Flame Grilled Steak Multipack Crisps 6x25g",
      "McVitie's Jaffa Cakes - Hot Honey Flavour 10 Pack",
      "Nescafe Dolce Gusto Kit Kat Cocoa Beverage Pods x16 256g",
      "\u2020\u00a0Pringles Salt & Vinegar Sharing Crisps 165g",
      "\u2020\u00a0Skinny Whip Double Chocolate Nougat Bars 5 x 20g",
      "\u2020\u00a0Swizzels Drumsticks Squashies Original Bag 60G",
      "Tesco Finest Apple & Cinnamon Hot Cross Buns 4 Pack",
      "Tesco Finest Extra Fruity Hot Cross Buns 4 pack"
    ]
  },
  {
    "meal": {
      "id": "6gjW34qmRx7gGxV9",
      "content": "Eating out",
      "date": "2026-05-28",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [],
    "missingItems": [
      "Emmi High Protein Caffe Latte 370ml",
      "Tesco Bacon Lettuce & Tom Sandwich",
      "Tesco Bolognese Pasta Bake 750g",
      "Tesco Quiche-Lorraine 400g",
      "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
      "Tesco The Chicken Club Sandwich",
      "Tesco Three Cheese Pasta Bake 750g",
      "Walls 4 Hearty Sausage Rolls 220G",
      "Butterkist Microwave Popcorn Sweet & Salted 3X60g",
      "Caxton Pink & White Wafers 6 Pack 85G",
      "\u2020\u00a0Dr Pepper Regular 500 M",
      "\u2020\u00a0Keep It Handy Assorted Plasters Pack 42pk",
      "\u2020\u00a0Kind Protein Caramel Nut 50g",
      "\u2020\u00a0Maoam Bloxx 4 Pack 88G",
      "\u2020\u00a0McCoy's Flame Grilled Steak Multipack Crisps 6x25g",
      "McVitie's Jaffa Cakes - Hot Honey Flavour 10 Pack",
      "Nescafe Dolce Gusto Kit Kat Cocoa Beverage Pods x16 256g",
      "\u2020\u00a0Pringles Salt & Vinegar Sharing Crisps 165g",
      "\u2020\u00a0Skinny Whip Double Chocolate Nougat Bars 5 x 20g",
      "\u2020\u00a0Swizzels Drumsticks Squashies Original Bag 60G",
      "Tesco Finest Apple & Cinnamon Hot Cross Buns 4 Pack",
      "Tesco Finest Extra Fruity Hot Cross Buns 4 pack"
    ],
    "notes": "external"
  },
  {
    "meal": {
      "id": "6gjW648qHw7v9xQh",
      "content": "Beef strip curry and boiled rice",
      "date": "2026-05-30",
      "labels": [
        "adults"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "missing",
    "coverageScore": 0,
    "matchedItems": [],
    "missingItems": [
      "Emmi High Protein Caffe Latte 370ml",
      "Tesco Bacon Lettuce & Tom Sandwich",
      "Tesco Bolognese Pasta Bake 750g",
      "Tesco Quiche-Lorraine 400g",
      "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
      "Tesco Three Cheese Pasta Bake 750g",
      "Walls 4 Hearty Sausage Rolls 220G",
      "Butterkist Microwave Popcorn Sweet & Salted 3X60g",
      "Caxton Pink & White Wafers 6 Pack 85G",
      "\u2020\u00a0Dr Pepper Regular 500 M",
      "\u2020\u00a0Keep It Handy Assorted Plasters Pack 42pk",
      "\u2020\u00a0Kind Protein Caramel Nut 50g",
      "\u2020\u00a0Maoam Bloxx 4 Pack 88G",
      "\u2020\u00a0McCoy's Flame Grilled Steak Multipack Crisps 6x25g",
      "McVitie's Jaffa Cakes - Hot Honey Flavour 10 Pack",
      "Nescafe Dolce Gusto Kit Kat Cocoa Beverage Pods x16 256g",
      "\u2020\u00a0Pringles Salt & Vinegar Sharing Crisps 165g",
      "\u2020\u00a0Skinny Whip Double Chocolate Nougat Bars 5 x 20g",
      "\u2020\u00a0Swizzels Drumsticks Squashies Original Bag 60G",
      "Tesco Finest Apple & Cinnamon Hot Cross Buns 4 Pack",
      "Tesco Finest Extra Fruity Hot Cross Buns 4 pack"
    ]
  },
  {
    "meal": {
      "id": "6gjW67xrPHqWxQJ9",
      "content": "Fried rice",
      "date": "2026-05-31",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "missing",
    "coverageScore": 0,
    "matchedItems": [],
    "missingItems": [
      "Emmi High Protein Caffe Latte 370ml",
      "Tesco Bacon Lettuce & Tom Sandwich",
      "Tesco Bolognese Pasta Bake 750g",
      "Tesco Quiche-Lorraine 400g",
      "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
      "Tesco Three Cheese Pasta Bake 750g",
      "Walls 4 Hearty Sausage Rolls 220G",
      "Butterkist Microwave Popcorn Sweet & Salted 3X60g",
      "Caxton Pink & White Wafers 6 Pack 85G",
      "\u2020\u00a0Dr Pepper Regular 500 M",
      "\u2020\u00a0Keep It Handy Assorted Plasters Pack 42pk",
      "\u2020\u00a0Kind Protein Caramel Nut 50g",
      "\u2020\u00a0Maoam Bloxx 4 Pack 88G",
      "\u2020\u00a0McCoy's Flame Grilled Steak Multipack Crisps 6x25g",
      "McVitie's Jaffa Cakes - Hot Honey Flavour 10 Pack",
      "Nescafe Dolce Gusto Kit Kat Cocoa Beverage Pods x16 256g",
      "\u2020\u00a0Pringles Salt & Vinegar Sharing Crisps 165g",
      "\u2020\u00a0Skinny Whip Double Chocolate Nougat Bars 5 x 20g",
      "\u2020\u00a0Swizzels Drumsticks Squashies Original Bag 60G",
      "Tesco Finest Apple & Cinnamon Hot Cross Buns 4 Pack",
      "Tesco Finest Extra Fruity Hot Cross Buns 4 pack"
    ]
  }
];












































































































































































































































































