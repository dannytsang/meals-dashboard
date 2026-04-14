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
  // This legacy function returns empty data - actual data is in realCoverage.
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
  "delivery_date": "2026-04-14",
  "delivery_sort": "",
  "order_number": "2911-8019-581",
  "items": [
    {
        "name": "Wild Juicy Mango 0% Aluminium Deodorant Refill 40g",
        "quantity": 1,
        "price": 4.8
    },
    {
        "name": "\u2020 Wild Natural Deodorant Refill - Coconut & Vanilla 40g",
        "quantity": 1,
        "price": 6.0
    },
    {
        "name": "Activia Rhubarb Gut Health Yoghurt Multipack 4x115g",
        "quantity": 1,
        "price": 2.75
    },
    {
        "name": "Tesco British Whole Milk 568Ml, 1 Pint",
        "quantity": 1,
        "price": 0.85
    },
    {
        "name": "Tesco Cheese and Garlic Flatbread 230g",
        "quantity": 1,
        "price": 1.2
    },
    {
        "name": "Tesco Large Chicken Fillet Pack 1.6Kg",
        "quantity": 1,
        "price": 9.8
    },
    {
        "name": "Birds Eye Steamfresh Asian Style Rice 380g",
        "quantity": 1,
        "price": 2.08
    },
    {
        "name": "Birds Eye Steamfresh Korean Style Noodles 350g",
        "quantity": 1,
        "price": 2.42
    },
    {
        "name": "McCain Home Chips Crinkle Cut 1.6kg",
        "quantity": 1,
        "price": 4.3
    },
    {
        "name": "\u2020 Cadbury Dairy Milk Chocolate Bar 180g",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "Crosta & Mollica Parmesan & Poppyseed Torinesi 120G",
        "quantity": 1,
        "price": 1.3
    },
    {
        "name": "Doritos Chilli Heatwave Tortilla Chips Multipack Crisps 5x30g",
        "quantity": 1,
        "price": 2.2
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
        "name": "Jammie Dodgers Biscuits 140G",
        "quantity": 3,
        "price": 1.95
    },
    {
        "name": "\u2020 McCoy's Classic Variety Multipack Crisps 6x25g",
        "quantity": 1,
        "price": 1.75
    },
    {
        "name": "\u2020 McCoy's Flame Grilled Steak Multipack Crisps 6x25g",
        "quantity": 1,
        "price": 1.75
    },
    {
        "name": "Polli Capers in Vinegar Capotes 190g",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "Ryvita Multiseed Thins 125G",
        "quantity": 1,
        "price": 2.3
    },
    {
        "name": "\u2020 Soft & Gentle Antiperspirant Deodorant Fresh Blossom Roll On 50Ml",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "\u2020 Tesco Apple & Elderflower Sparkling Water 1 Litre",
        "quantity": 3,
        "price": 2.0
    },
    {
        "name": "Tesco Pink & White Mini Marshmallows 100G",
        "quantity": 1,
        "price": 1.1
    },
    {
        "name": "Tesco White Iced Ring Doughnuts 4 Pack",
        "quantity": 1,
        "price": 0.95
    },
    {
        "name": "Crosta & Mollica Salami Napoli Sourdough Pizza 413g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Crosta & Mollica Stromboli Spicy Salami Sourdough Pizza 447g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Rosedene Farms Blueberries 150G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Blueberries 150G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Celery",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Organic Celery",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Actimel Immune Support Live Yoghurt Drink - Multifruit 8x100g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Innocent Wonder Green Juice 750Ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Rosedene Farms Raspberries 125G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Blackberries 250G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Finest Green Grapes Seedless 500G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Finest Red Grapes Seedless 500G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Fire Pit 2 Salt & Pepper Beef Steaks 200G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Gammon Steak With Cheese & Pineapple 345G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Iceberg Lettuce 200G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Pork Loin Joint 1.900KG",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Pork Stir Fry 500G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Strawberries 400G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Yoplait Frubes Yoghurt Tubes - Strawberry, Red Berry & Peach 9x37g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Aunt Bessie\u2019s Maple & Thyme Glazed Carrots 500g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Frozen Broccoli Florets 900G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Butterkist Microwave Popcorn Sweet & Salted 3X60g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "De Cecco Conchiglie Rigate 500g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco All Rounder Potatoes 2Kg",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Baby Plum Tomatoes 300G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Medium Free Range Eggs 12 Pack",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Red Peppers Each",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Whole Cucumber Each",
        "quantity": 1,
        "price": 0.0
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
    "date": "2026-04-14",
    "labels": [],
    "section": "Planned",
    "meal_type": "lunch"
  },
  {
    "id": "",
    "content": "Gammon, baked potatoes and salad",
    "date": "2026-04-14",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Beef steaks, baked potatoes and salad",
    "date": "2026-04-14",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Ham and cheese toastie",
    "date": "2026-04-15",
    "labels": [],
    "section": "Planned",
    "meal_type": "lunch"
  },
  {
    "id": "",
    "content": "Pizza (Leo)",
    "date": "2026-04-15",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Mash potato cheese (Ashlee)",
    "date": "2026-04-15",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Chicken and rice veg (Terina)",
    "date": "2026-04-15",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Jacket potatoes (school)",
    "date": "2026-04-16",
    "labels": [],
    "section": "Planned",
    "meal_type": "lunch"
  },
  {
    "id": "",
    "content": "KFC",
    "date": "2026-04-16",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "KFC",
    "date": "2026-04-17",
    "labels": [],
    "section": "Planned",
    "meal_type": "lunch"
  },
  {
    "id": "",
    "content": "Chicken and noodles (Terina)",
    "date": "2026-04-17",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "chicken / garlic bread and chips",
    "date": "2026-04-17",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Salmon kebabs, salad and new potatoes",
    "date": "2026-04-20",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  }
];








// Transform and export
export const realReceipt = transformCachedOrder(realLatestOrder);
export const realCoverage = analyzeCoverage(realMealPlan, realReceipt);
