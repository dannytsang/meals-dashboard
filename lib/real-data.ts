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
  "delivery_date": "2026-05-12",
  "delivery_sort": "",
  "order_number": "9021-8031-78",
  "order_total": 65.32,
  "items": [
    {
        "name": "Cadbury Dairy Milk &More Lotus Biscoff Chocolate Bar 195g",
        "quantity": 1,
        "price": 2.5
    },
    {
        "name": "\u2020 Cadbury Dairy Milk Chocolate Bar 180g",
        "quantity": 1,
        "price": 2.75
    },
    {
        "name": "Tesco Bacon Lettuce & Tom Sandwich",
        "quantity": 1,
        "price": 1.9
    },
    {
        "name": "Tesco Chicken Bacon & Lettuce Sandwich",
        "quantity": 1,
        "price": 2.75
    },
    {
        "name": "Walkers Wotsits Cheese Multipack Crisps 6x16.5g",
        "quantity": 2,
        "price": 3.5
    },
    {
        "name": "\u2020 Walkers Quavers Cheese Multipack Crisps 6x16g",
        "quantity": 2,
        "price": 2.2
    },
    {
        "name": "Charlie Bigham's Sweet & Sour Pork with Jasmine Rice 750g",
        "quantity": 2,
        "price": 16.0
    },
    {
        "name": "Creamfields Mature Grated Cheddar 250g",
        "quantity": 1,
        "price": 1.99
    },
    {
        "name": "La Famiglia Rana Arrabbiata Fresh Sauce 200g",
        "quantity": 1,
        "price": 1.89
    },
    {
        "name": "La Famiglia Rana Caramelised Garlic & Pecorino Flatbread 183g",
        "quantity": 1,
        "price": 2.05
    },
    {
        "name": "La Famiglia Rana Spinach & Ricotta Ravioli 250g",
        "quantity": 1,
        "price": 2.06
    },
    {
        "name": "Tesco Broccoli Loose 0.301KG",
        "quantity": 1,
        "price": 0.66
    },
    {
        "name": "Tesco Garlic Flatbread 225g",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Tesco Iceberg Lettuce 200G",
        "quantity": 1,
        "price": 0.52
    },
    {
        "name": "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
        "quantity": 1,
        "price": 1.81
    },
    {
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "quantity": 2,
        "price": 3.6
    },
    {
        "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "quantity": 2,
        "price": 4.5
    },
    {
        "name": "Bisto Favourite Gravy Granules 450g",
        "quantity": 1,
        "price": 4.75
    },
    {
        "name": "\u2020 Dr Pepper Regular 500 M",
        "quantity": 2,
        "price": 2.74
    },
    {
        "name": "\u2020 Growers Harvest Apple Juice From Concentrate 6 X 200Ml",
        "quantity": 1,
        "price": 1.89
    },
    {
        "name": "\u2020 Growers Harvest Orange Juice From Concentrate 6 X 200Ml",
        "quantity": 1,
        "price": 1.89
    },
    {
        "name": "Hayden's 4 Delicious Yum Yums",
        "quantity": 1,
        "price": 1.75
    },
    {
        "name": "\u2020 Maoam Bloxx 4 Pack 88G",
        "quantity": 1,
        "price": 0.49
    },
    {
        "name": "\u2020 Pringles Original Sharing Crisps 185g",
        "quantity": 1,
        "price": 1.85
    },
    {
        "name": "\u2020 Pringles Sour Cream & Onion Sharing Crisps 185g",
        "quantity": 1,
        "price": 1.85
    },
    {
        "name": "\u2020 Pringles Sour Cream & Onion Snacking Crisps 40G",
        "quantity": 1,
        "price": 0.76
    },
    {
        "name": "Tesco Baby Plum Tomatoes 300G",
        "quantity": 1,
        "price": 0.75
    },
    {
        "name": "Tesco Brown Onions 3 Pack",
        "quantity": 1,
        "price": 0.76
    },
    {
        "name": "Tesco White Iced Ring Doughnuts 4 Pack",
        "quantity": 1,
        "price": 0.95
    },
    {
        "name": "Tesco Whole Large Cucumber",
        "quantity": 1,
        "price": 0.91
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 2.15
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 4.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 2.5
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 2.15
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "Products Any",
        "quantity": 1,
        "price": 3.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 3.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 3.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 2.5
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 2.15
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "Products Any",
        "quantity": 1,
        "price": 3.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 3.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 3.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 2.5
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 2.15
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products Any",
        "quantity": 1,
        "price": 3.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 3.0
    },
    {
        "name": "Products Buy",
        "quantity": 1,
        "price": 5.0
    },
    {
        "name": "Products",
        "quantity": 1,
        "price": 1.0
    }
]
};
















































































































































































































































// Real meal plan from Todoist (April 13-19, 2026)
// section_id 6gJfvHHqHrCMPcp9 = Ashlee's lunch section -> meal_type: 'lunch'
// section_id 6Rv6PrQrrFWQRg7h = Planned section -> meal_type: 'dinner'
export const realMealPlan: Meal[] = [
  {
    "id": "",
    "content": "London",
    "date": "2026-05-14",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "chicken / garlic bread and chips",
    "date": "2026-05-15",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Sweet and sour pork and rice",
    "date": "2026-05-15",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Steak and mash",
    "date": "2026-05-16",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Roast pork, roast potatoes",
    "date": "2026-05-17",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Battered fish and new potatoes",
    "date": "2026-05-18",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Pork and rice",
    "date": "2026-05-19",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  }
];















































































































































































































































// Transform and export
export const realReceipt = transformCachedOrder(realLatestOrder);

export const realMealsCheckSummary = {
  "order_total": 65.32,
  "delivery_date": "2026-05-12",
  "meals_covered": 5,
  "meals_total": 7,
  "unmatched_groceries": 80,
  "coverage_percentage": 71,
  "day_coverage": [
    {
      "date": "2026-05-14",
      "status": "missing",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-15",
      "status": "delivery",
      "is_delivery_day": true
    },
    {
      "date": "2026-05-16",
      "status": "covered",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-17",
      "status": "covered",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-18",
      "status": "covered",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-19",
      "status": "delivery",
      "is_delivery_day": true
    },
    {
      "date": "2026-05-20",
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
      "content": "London",
      "date": "2026-05-14",
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
      "date": "2026-05-15",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Chicken Bacon & Lettuce Sandwich",
        "name": "Tesco Chicken Bacon & Lettuce Sandwich",
        "quantity": 1,
        "price": 2.75
      },
      {
        "ingredient": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "quantity": 2,
        "price": 3.6
      },
      {
        "ingredient": "Tesco Cheddar Mash 450G",
        "name": "Tesco Cheddar Mash 450G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "name": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Beef Dripping Roast Potatoes 800G",
        "name": "Tesco Finest Beef Dripping Roast Potatoes 800G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Fresh Mashed Potato 800G",
        "name": "Tesco Fresh Mashed Potato 800G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Potato Slices 350G",
        "name": "Tesco Potato Slices 350G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Sweet and sour pork and rice",
      "date": "2026-05-15",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Bacon Lettuce & Tom Sandwich",
        "name": "Tesco Bacon Lettuce & Tom Sandwich",
        "quantity": 1,
        "price": 1.9
      },
      {
        "ingredient": "Tesco Chicken Bacon & Lettuce Sandwich",
        "name": "Tesco Chicken Bacon & Lettuce Sandwich",
        "quantity": 1,
        "price": 2.75
      },
      {
        "ingredient": "Charlie Bigham's Sweet & Sour Pork with Jasmine Rice 750g",
        "name": "Charlie Bigham's Sweet & Sour Pork with Jasmine Rice 750g",
        "quantity": 2,
        "price": 16.0
      },
      {
        "ingredient": "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
        "name": "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
        "quantity": 1,
        "price": 1.81
      },
      {
        "ingredient": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "quantity": 2,
        "price": 3.6
      },
      {
        "ingredient": "Tesco Fire Pit 6 Bbq Maple Pork Loin Steaks 600G",
        "name": "Tesco Fire Pit 6 Bbq Maple Pork Loin Steaks 600G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Crackling Pork Loin Joint 637G",
        "name": "Tesco Crackling Pork Loin Joint 637G",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Steak and mash",
      "date": "2026-05-16",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "quantity": 2,
        "price": 3.6
      },
      {
        "ingredient": "Tesco Cheddar Mash 450G",
        "name": "Tesco Cheddar Mash 450G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "name": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Beef Dripping Roast Potatoes 800G",
        "name": "Tesco Finest Beef Dripping Roast Potatoes 800G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Fresh Mashed Potato 800G",
        "name": "Tesco Fresh Mashed Potato 800G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Fire Pit 6 Bbq Maple Pork Loin Steaks 600G",
        "name": "Tesco Fire Pit 6 Bbq Maple Pork Loin Steaks 600G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Potato Slices 350G",
        "name": "Tesco Potato Slices 350G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Beef Steaks with Peppercorn Sauce 320g",
        "name": "Tesco Beef Steaks with Peppercorn Sauce 320g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Roast pork, roast potatoes",
      "date": "2026-05-17",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Bacon Lettuce & Tom Sandwich",
        "name": "Tesco Bacon Lettuce & Tom Sandwich",
        "quantity": 1,
        "price": 1.9
      },
      {
        "ingredient": "Tesco Chicken Bacon & Lettuce Sandwich",
        "name": "Tesco Chicken Bacon & Lettuce Sandwich",
        "quantity": 1,
        "price": 2.75
      },
      {
        "ingredient": "Charlie Bigham's Sweet & Sour Pork with Jasmine Rice 750g",
        "name": "Charlie Bigham's Sweet & Sour Pork with Jasmine Rice 750g",
        "quantity": 2,
        "price": 16.0
      },
      {
        "ingredient": "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
        "name": "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
        "quantity": 1,
        "price": 1.81
      },
      {
        "ingredient": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "quantity": 2,
        "price": 3.6
      },
      {
        "ingredient": "Tesco Cheddar Mash 450G",
        "name": "Tesco Cheddar Mash 450G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "name": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Beef Dripping Roast Potatoes 800G",
        "name": "Tesco Finest Beef Dripping Roast Potatoes 800G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Fresh Mashed Potato 800G",
        "name": "Tesco Fresh Mashed Potato 800G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Fire Pit 6 Bbq Maple Pork Loin Steaks 600G",
        "name": "Tesco Fire Pit 6 Bbq Maple Pork Loin Steaks 600G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Potato Slices 350G",
        "name": "Tesco Potato Slices 350G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Crackling Pork Loin Joint 637G",
        "name": "Tesco Crackling Pork Loin Joint 637G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Battered fish and new potatoes",
      "date": "2026-05-18",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "quantity": 2,
        "price": 3.6
      },
      {
        "ingredient": "Tesco Cheddar Mash 450G",
        "name": "Tesco Cheddar Mash 450G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "name": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Beef Dripping Roast Potatoes 800G",
        "name": "Tesco Finest Beef Dripping Roast Potatoes 800G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Fresh Mashed Potato 800G",
        "name": "Tesco Fresh Mashed Potato 800G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Potato Slices 350G",
        "name": "Tesco Potato Slices 350G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Lightly Dusted Cod Fillets 255G",
        "name": "Tesco Lightly Dusted Cod Fillets 255G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Tuna Chunks In Brine 4 X 145G",
        "name": "Tesco Tuna Chunks In Brine 4 X 145G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Pork and rice",
      "date": "2026-05-19",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Bacon Lettuce & Tom Sandwich",
        "name": "Tesco Bacon Lettuce & Tom Sandwich",
        "quantity": 1,
        "price": 1.9
      },
      {
        "ingredient": "Tesco Chicken Bacon & Lettuce Sandwich",
        "name": "Tesco Chicken Bacon & Lettuce Sandwich",
        "quantity": 1,
        "price": 2.75
      },
      {
        "ingredient": "Charlie Bigham's Sweet & Sour Pork with Jasmine Rice 750g",
        "name": "Charlie Bigham's Sweet & Sour Pork with Jasmine Rice 750g",
        "quantity": 2,
        "price": 16.0
      },
      {
        "ingredient": "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
        "name": "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
        "quantity": 1,
        "price": 1.81
      },
      {
        "ingredient": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "quantity": 2,
        "price": 3.6
      },
      {
        "ingredient": "Tesco Fire Pit 6 Bbq Maple Pork Loin Steaks 600G",
        "name": "Tesco Fire Pit 6 Bbq Maple Pork Loin Steaks 600G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Crackling Pork Loin Joint 637G",
        "name": "Tesco Crackling Pork Loin Joint 637G",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  }
];































































































































































































































