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
  "delivery_date": "2026-06-09",
  "delivery_sort": "",
  "order_number": "5421-8182-00",
  "order_total": 57.15,
  "items": [
    {
        "name": "Tesco Cherries Punnet 200G",
        "quantity": 1,
        "price": 7.2
    },
    {
        "name": "Tesco Potato Slices 350G",
        "quantity": 1,
        "price": 1.17
    },
    {
        "name": "Activia Rhubarb Gut Health Yoghurt Multipack 4x115g",
        "quantity": 1,
        "price": 3.5
    },
    {
        "name": "Tesco 6 Boneless Salmon Fillets 780G",
        "quantity": 1,
        "price": 12.0
    },
    {
        "name": "Tesco Beef Lasagne 750G",
        "quantity": 1,
        "price": 4.5
    },
    {
        "name": "Tesco Blueberries 500G",
        "quantity": 1,
        "price": 4.55
    },
    {
        "name": "Tesco Cheddar Mash 450G",
        "quantity": 1,
        "price": 3.49
    },
    {
        "name": "Tesco Finest Duck Ragu with Pappardelle 750g",
        "quantity": 1,
        "price": 6.0
    },
    {
        "name": "Tesco Fire Pit 4 Maple Bbq Chicken Kebabs 260G",
        "quantity": 1,
        "price": 4.0
    },
    {
        "name": "Tesco Garlic & Cheese Mushrooms 200g",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "Tesco Green Seedless Grapes Pack 500G",
        "quantity": 1,
        "price": 3.6
    },
    {
        "name": "Tesco Parmentier Potatoes 400G",
        "quantity": 1,
        "price": 1.43
    },
    {
        "name": "\u2020\u00a0Tesco Apple And Mango From Concentrate 1 Litre",
        "quantity": 1,
        "price": 1.17
    },
    {
        "name": "\u2020\u00a0Tesco Pure Orange Juice With Bits 1 Litre",
        "quantity": 1,
        "price": 2.33
    },
    {
        "name": "Tesco Watermelon",
        "quantity": 1,
        "price": 3.75
    },
    {
        "name": "Tesco Raw King Prawns 165gSubstitutions: On",
        "quantity": 1,
        "price": 2.24
    },
    {
        "name": "Tesco Sweet Chilli Stir Fry Sauce 165gSubstitutions: On",
        "quantity": 1,
        "price": 0.74
    },
    {
        "name": "Tesco Finest Beef Dripping Roast Potatoes 800GSubstitutions: On",
        "quantity": 1,
        "price": 3.6
    },
    {
        "name": "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814gSubstitutions: On",
        "quantity": 1,
        "price": 7.0
    },
    {
        "name": "Tesco Mango 450GSubstitutions: On",
        "quantity": 1,
        "price": 4.25
    },
    {
        "name": "Tesco Crackling Pork Loin Joint 637GSubstitutions: On",
        "quantity": 1,
        "price": 3.85
    },
    {
        "name": "Tesco Stonebaked Classic Margherita Pizza 306gSubstitutions: On",
        "quantity": 1,
        "price": 4.5
    },
    {
        "name": "Tesco Egg Noodles 300GSubstitutions: On",
        "quantity": 1,
        "price": 0.74
    },
    {
        "name": "Tesco Large Vegetable Stir Fry 570gSubstitutions: On",
        "quantity": 1,
        "price": 1.28
    },
    {
        "name": "Tesco Beef Steaks with Peppercorn Sauce 320gSubstitutions: On",
        "quantity": 1,
        "price": 4.15
    },
    {
        "name": "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
        "quantity": 1,
        "price": 1.2
    },
    {
        "name": "Grower's Harvest Sweetcorn 907GSubstitutions: On",
        "quantity": 1,
        "price": 1.35
    },
    {
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
        "quantity": 1,
        "price": 1.8
    },
    {
        "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400gSubstitutions: On",
        "quantity": 1,
        "price": 4.5
    },
    {
        "name": "Tesco Chocolate Iced Ring Doughnuts 4 PackSubstitutions: On",
        "quantity": 1,
        "price": 0.95
    },
    {
        "name": "\u2020 Calbee Hot & Spicy Flavour Potato Chips 130gSubstitutions: On",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
        "quantity": 1,
        "price": 0.67
    },
    {
        "name": "\u2020 Calbee Seaweed & Salt Flavour Potato Chips 130gSubstitutions: On",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "\u2020 Corsodyl Active Gum Repair Toothpaste - Fresh Mint 75mlSubstitutions: On",
        "quantity": 1,
        "price": 4.0
    },
    {
        "name": "Hayden's 4 Delicious Yum YumsSubstitutions: On",
        "quantity": 1,
        "price": 1.75
    },
    {
        "name": "\u2020 Walkers Wotsits Cheese Multipack Crisps 20x16.5gSubstitutions: On",
        "quantity": 1,
        "price": 4.25
    },
    {
        "name": "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On",
        "quantity": 1,
        "price": 1.33
    }
]
};





















































































































































































































































































































// Real meal plan from Todoist (April 13-19, 2026)
// section_id 6gJfvHHqHrCMPcp9 = Ashlee's lunch section -> meal_type: 'lunch'
// section_id 6Rv6PrQrrFWQRg7h = Planned section -> meal_type: 'dinner'
export const realMealPlan: Meal[] = [
  {
    "id": "6gmwxMWqmP37Xm4h",
    "content": "Duck pasta",
    "date": "2026-06-08",
    "labels": [
      "adults"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gmwxW4W3W5cfhm9",
    "content": "Chicken kebab and potato slices",
    "date": "2026-06-09",
    "labels": [
      "children"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gmwxXjg5WxGR6x9",
    "content": "Pork kebab, potato slices and stuffed mushrooms",
    "date": "2026-06-09",
    "labels": [
      "adults"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gpvwVFrrCXGWc4h",
    "content": "Stir fry",
    "date": "2026-06-10",
    "labels": [
      "adults"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gpvwXf7Cr6gm57h",
    "content": "Pizza (Leo)",
    "date": "2026-06-10",
    "labels": [
      "children"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gpvwcxwrG7xg249",
    "content": "Cheesy mash (Ashlee)",
    "date": "2026-06-10",
    "labels": [
      "children"
    ],
    "section": "Planned",
    "meal_type": "lunch"
  },
  {
    "id": "6gpvwgWvVwrXhGvh",
    "content": "Roast pork, roast potatoes and veg",
    "date": "2026-06-11",
    "labels": [
      "adults",
      "children"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6Rv6P5rj7RjvV6j9",
    "content": "Rice / garlic bread",
    "date": "2026-06-12",
    "labels": [
      "children"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gpvx26cwvh4rm69",
    "content": "Spicy pork & nduja fettuccine",
    "date": "2026-06-12",
    "labels": [
      "adults"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  }
];




















































































































































































































































































































// Transform and export
export const realReceipt = transformCachedOrder(realLatestOrder);

export const realMealsCheckSummary = {
  "coverage_percentage": 56,
  "covered": 4,
  "delivery_date": "2026-06-09",
  "meals_covered": 5,
  "meals_total": 9,
  "missing": 4,
  "order_total": 57.15,
  "partial": 1,
  "unmatched_groceries": 33
};














































































































































































// Coverage data - pre-computed by sync script (do not edit manually)
export const realCoverage: MealCoverage[] = [
  {
    "meal": {
      "id": "6gmwxMWqmP37Xm4h",
      "content": "Duck pasta",
      "date": "2026-06-08",
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
      "Tesco Cherries Punnet 200G",
      "Tesco Potato Slices 350G",
      "Activia Rhubarb Gut Health Yoghurt Multipack 4x115g",
      "Tesco 6 Boneless Salmon Fillets 780G",
      "Tesco Beef Lasagne 750G",
      "Tesco Blueberries 500G",
      "Tesco Cheddar Mash 450G",
      "Tesco Finest Duck Ragu with Pappardelle 750g",
      "Tesco Fire Pit 4 Maple Bbq Chicken Kebabs 260G",
      "Tesco Garlic & Cheese Mushrooms 200g",
      "Tesco Green Seedless Grapes Pack 500G",
      "Tesco Parmentier Potatoes 400G",
      "\u2020\u00a0Tesco Apple And Mango From Concentrate 1 Litre",
      "\u2020\u00a0Tesco Pure Orange Juice With Bits 1 Litre",
      "Tesco Watermelon"
    ]
  },
  {
    "meal": {
      "id": "6gmwxW4W3W5cfhm9",
      "content": "Chicken kebab and potato slices",
      "date": "2026-06-09",
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
      "Tesco Raw King Prawns 165gSubstitutions: On",
      "Tesco Sweet Chilli Stir Fry Sauce 165gSubstitutions: On",
      "Tesco Finest Beef Dripping Roast Potatoes 800GSubstitutions: On",
      "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814gSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco Crackling Pork Loin Joint 637GSubstitutions: On",
      "Tesco Stonebaked Classic Margherita Pizza 306gSubstitutions: On",
      "Tesco Egg Noodles 300GSubstitutions: On",
      "Tesco Large Vegetable Stir Fry 570gSubstitutions: On",
      "Tesco Beef Steaks with Peppercorn Sauce 320gSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "Grower's Harvest Sweetcorn 907GSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400gSubstitutions: On",
      "Tesco Chocolate Iced Ring Doughnuts 4 PackSubstitutions: On",
      "\u2020 Calbee Hot & Spicy Flavour Potato Chips 130gSubstitutions: On",
      "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
      "\u2020 Calbee Seaweed & Salt Flavour Potato Chips 130gSubstitutions: On",
      "\u2020 Corsodyl Active Gum Repair Toothpaste - Fresh Mint 75mlSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On",
      "\u2020 Walkers Wotsits Cheese Multipack Crisps 20x16.5gSubstitutions: On",
      "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On"
    ]
  },
  {
    "meal": {
      "id": "6gmwxXjg5WxGR6x9",
      "content": "Pork kebab, potato slices and stuffed mushrooms",
      "date": "2026-06-09",
      "labels": [
        "adults"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814gSubstitutions: On",
        "name": "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814gSubstitutions: On",
        "quantity": 1,
        "price": 7.0
      },
      {
        "ingredient": "Tesco Crackling Pork Loin Joint 637GSubstitutions: On",
        "name": "Tesco Crackling Pork Loin Joint 637GSubstitutions: On",
        "quantity": 1,
        "price": 3.85
      },
      {
        "ingredient": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
        "quantity": 1,
        "price": 1.8
      }
    ],
    "missingItems": [
      "Tesco Raw King Prawns 165gSubstitutions: On",
      "Tesco Sweet Chilli Stir Fry Sauce 165gSubstitutions: On",
      "Tesco Finest Beef Dripping Roast Potatoes 800GSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco Stonebaked Classic Margherita Pizza 306gSubstitutions: On",
      "Tesco Egg Noodles 300GSubstitutions: On",
      "Tesco Large Vegetable Stir Fry 570gSubstitutions: On",
      "Tesco Beef Steaks with Peppercorn Sauce 320gSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "Grower's Harvest Sweetcorn 907GSubstitutions: On",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400gSubstitutions: On",
      "Tesco Chocolate Iced Ring Doughnuts 4 PackSubstitutions: On",
      "\u2020 Calbee Hot & Spicy Flavour Potato Chips 130gSubstitutions: On",
      "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
      "\u2020 Calbee Seaweed & Salt Flavour Potato Chips 130gSubstitutions: On",
      "\u2020 Corsodyl Active Gum Repair Toothpaste - Fresh Mint 75mlSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On",
      "\u2020 Walkers Wotsits Cheese Multipack Crisps 20x16.5gSubstitutions: On",
      "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On"
    ]
  },
  {
    "meal": {
      "id": "6gpvwVFrrCXGWc4h",
      "content": "Stir fry",
      "date": "2026-06-10",
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
      "Tesco Raw King Prawns 165gSubstitutions: On",
      "Tesco Sweet Chilli Stir Fry Sauce 165gSubstitutions: On",
      "Tesco Finest Beef Dripping Roast Potatoes 800GSubstitutions: On",
      "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814gSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco Crackling Pork Loin Joint 637GSubstitutions: On",
      "Tesco Stonebaked Classic Margherita Pizza 306gSubstitutions: On",
      "Tesco Egg Noodles 300GSubstitutions: On",
      "Tesco Large Vegetable Stir Fry 570gSubstitutions: On",
      "Tesco Beef Steaks with Peppercorn Sauce 320gSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "Grower's Harvest Sweetcorn 907GSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400gSubstitutions: On",
      "Tesco Chocolate Iced Ring Doughnuts 4 PackSubstitutions: On",
      "\u2020 Calbee Hot & Spicy Flavour Potato Chips 130gSubstitutions: On",
      "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
      "\u2020 Calbee Seaweed & Salt Flavour Potato Chips 130gSubstitutions: On",
      "\u2020 Corsodyl Active Gum Repair Toothpaste - Fresh Mint 75mlSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On",
      "\u2020 Walkers Wotsits Cheese Multipack Crisps 20x16.5gSubstitutions: On",
      "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On"
    ]
  },
  {
    "meal": {
      "id": "6gpvwXf7Cr6gm57h",
      "content": "Pizza (Leo)",
      "date": "2026-06-10",
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
        "ingredient": "Tesco Stonebaked Classic Margherita Pizza 306gSubstitutions: On",
        "name": "Tesco Stonebaked Classic Margherita Pizza 306gSubstitutions: On",
        "quantity": 1,
        "price": 4.5
      }
    ],
    "missingItems": [
      "Tesco Raw King Prawns 165gSubstitutions: On",
      "Tesco Sweet Chilli Stir Fry Sauce 165gSubstitutions: On",
      "Tesco Finest Beef Dripping Roast Potatoes 800GSubstitutions: On",
      "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814gSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco Crackling Pork Loin Joint 637GSubstitutions: On",
      "Tesco Egg Noodles 300GSubstitutions: On",
      "Tesco Large Vegetable Stir Fry 570gSubstitutions: On",
      "Tesco Beef Steaks with Peppercorn Sauce 320gSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "Grower's Harvest Sweetcorn 907GSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400gSubstitutions: On",
      "Tesco Chocolate Iced Ring Doughnuts 4 PackSubstitutions: On",
      "\u2020 Calbee Hot & Spicy Flavour Potato Chips 130gSubstitutions: On",
      "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
      "\u2020 Calbee Seaweed & Salt Flavour Potato Chips 130gSubstitutions: On",
      "\u2020 Corsodyl Active Gum Repair Toothpaste - Fresh Mint 75mlSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On",
      "\u2020 Walkers Wotsits Cheese Multipack Crisps 20x16.5gSubstitutions: On",
      "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On"
    ]
  },
  {
    "meal": {
      "id": "6gpvwcxwrG7xg249",
      "content": "Cheesy mash (Ashlee)",
      "date": "2026-06-10",
      "labels": [
        "children"
      ],
      "section": "Planned",
      "meal_type": "lunch"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "[external] Cheesy mash (Ashlee)",
        "name": "[external] Cheesy mash (Ashlee)",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": [],
    "notes": "external"
  },
  {
    "meal": {
      "id": "6gpvwgWvVwrXhGvh",
      "content": "Roast pork, roast potatoes and veg",
      "date": "2026-06-11",
      "labels": [
        "adults",
        "children"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814gSubstitutions: On",
        "name": "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814gSubstitutions: On",
        "quantity": 1,
        "price": 7.0
      },
      {
        "ingredient": "Tesco Crackling Pork Loin Joint 637GSubstitutions: On",
        "name": "Tesco Crackling Pork Loin Joint 637GSubstitutions: On",
        "quantity": 1,
        "price": 3.85
      }
    ],
    "missingItems": [
      "Tesco Raw King Prawns 165gSubstitutions: On",
      "Tesco Sweet Chilli Stir Fry Sauce 165gSubstitutions: On",
      "Tesco Finest Beef Dripping Roast Potatoes 800GSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco Stonebaked Classic Margherita Pizza 306gSubstitutions: On",
      "Tesco Egg Noodles 300GSubstitutions: On",
      "Tesco Large Vegetable Stir Fry 570gSubstitutions: On",
      "Tesco Beef Steaks with Peppercorn Sauce 320gSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "Grower's Harvest Sweetcorn 907GSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400gSubstitutions: On",
      "Tesco Chocolate Iced Ring Doughnuts 4 PackSubstitutions: On",
      "\u2020 Calbee Hot & Spicy Flavour Potato Chips 130gSubstitutions: On",
      "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
      "\u2020 Calbee Seaweed & Salt Flavour Potato Chips 130gSubstitutions: On",
      "\u2020 Corsodyl Active Gum Repair Toothpaste - Fresh Mint 75mlSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On",
      "\u2020 Walkers Wotsits Cheese Multipack Crisps 20x16.5gSubstitutions: On",
      "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On"
    ]
  },
  {
    "meal": {
      "id": "6Rv6P5rj7RjvV6j9",
      "content": "Rice / garlic bread",
      "date": "2026-06-12",
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
      "Tesco Raw King Prawns 165gSubstitutions: On",
      "Tesco Sweet Chilli Stir Fry Sauce 165gSubstitutions: On",
      "Tesco Finest Beef Dripping Roast Potatoes 800GSubstitutions: On",
      "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814gSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco Crackling Pork Loin Joint 637GSubstitutions: On",
      "Tesco Stonebaked Classic Margherita Pizza 306gSubstitutions: On",
      "Tesco Egg Noodles 300GSubstitutions: On",
      "Tesco Large Vegetable Stir Fry 570gSubstitutions: On",
      "Tesco Beef Steaks with Peppercorn Sauce 320gSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "Grower's Harvest Sweetcorn 907GSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400gSubstitutions: On",
      "Tesco Chocolate Iced Ring Doughnuts 4 PackSubstitutions: On",
      "\u2020 Calbee Hot & Spicy Flavour Potato Chips 130gSubstitutions: On",
      "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
      "\u2020 Calbee Seaweed & Salt Flavour Potato Chips 130gSubstitutions: On",
      "\u2020 Corsodyl Active Gum Repair Toothpaste - Fresh Mint 75mlSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On",
      "\u2020 Walkers Wotsits Cheese Multipack Crisps 20x16.5gSubstitutions: On",
      "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On"
    ]
  },
  {
    "meal": {
      "id": "6gpvx26cwvh4rm69",
      "content": "Spicy pork & nduja fettuccine",
      "date": "2026-06-12",
      "labels": [
        "adults"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814gSubstitutions: On",
        "name": "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814gSubstitutions: On",
        "quantity": 1,
        "price": 7.0
      },
      {
        "ingredient": "Tesco Crackling Pork Loin Joint 637GSubstitutions: On",
        "name": "Tesco Crackling Pork Loin Joint 637GSubstitutions: On",
        "quantity": 1,
        "price": 3.85
      }
    ],
    "missingItems": [
      "Tesco Raw King Prawns 165gSubstitutions: On",
      "Tesco Sweet Chilli Stir Fry Sauce 165gSubstitutions: On",
      "Tesco Finest Beef Dripping Roast Potatoes 800GSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco Stonebaked Classic Margherita Pizza 306gSubstitutions: On",
      "Tesco Egg Noodles 300GSubstitutions: On",
      "Tesco Large Vegetable Stir Fry 570gSubstitutions: On",
      "Tesco Beef Steaks with Peppercorn Sauce 320gSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "Grower's Harvest Sweetcorn 907GSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400gSubstitutions: On",
      "Tesco Chocolate Iced Ring Doughnuts 4 PackSubstitutions: On",
      "\u2020 Calbee Hot & Spicy Flavour Potato Chips 130gSubstitutions: On",
      "\u2020 Tesco Sparkling Water Lemon & Lime 1 LitreSubstitutions: On",
      "\u2020 Calbee Seaweed & Salt Flavour Potato Chips 130gSubstitutions: On",
      "\u2020 Corsodyl Active Gum Repair Toothpaste - Fresh Mint 75mlSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On",
      "\u2020 Walkers Wotsits Cheese Multipack Crisps 20x16.5gSubstitutions: On",
      "\u2020 Tesco Apple & Elderflower Sparkling Water 1 LitreSubstitutions: On"
    ]
  }
];




































































































































































































































































































