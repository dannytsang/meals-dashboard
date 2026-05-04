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
  "delivery_date": "2026-05-01",
  "delivery_sort": "",
  "order_number": "2911-8014-861",
  "order_total": 90.61,
  "items": [
    {
        "name": "Tesco Blueberries 250G",
        "quantity": 1,
        "price": 2.15
    },
    {
        "name": "Tesco Blueberries 150G",
        "quantity": 2,
        "price": 2.0
    },
    {
        "name": "Actimel Immune Support Multifruit Yogurt Drink 12 x 100g",
        "quantity": 1,
        "price": 3.25
    },
    {
        "name": "Activia Rhubarb Gut Health Yoghurt Multipack 4x115g",
        "quantity": 1,
        "price": 1.75
    },
    {
        "name": "Bay Fishmongers Salmon 0.464KG",
        "quantity": 1,
        "price": 5.29
    },
    {
        "name": "Fire Pit 2 Minted Lamb Leg Steaks 250g",
        "quantity": 1,
        "price": 4.0
    },
    {
        "name": "Noel Sliced Tapas Selection 120G",
        "quantity": 1,
        "price": 2.17
    },
    {
        "name": "Tesco British Whole Milk 568Ml, 1 Pint",
        "quantity": 1,
        "price": 0.85
    },
    {
        "name": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "quantity": 1,
        "price": 8.0
    },
    {
        "name": "Tesco Firepit 6 Minted Lamb Kebabs 360g",
        "quantity": 1,
        "price": 4.0
    },
    {
        "name": "Tesco Fresh Mashed Potato 800G",
        "quantity": 1,
        "price": 1.25
    },
    {
        "name": "Tesco Garlic & Cheese Mushrooms 200g",
        "quantity": 1,
        "price": 1.42
    },
    {
        "name": "Tesco Honey Roast Ham Slices 400g",
        "quantity": 1,
        "price": 2.19
    },
    {
        "name": "Tesco Iceberg Lettuce 200G",
        "quantity": 1,
        "price": 0.64
    },
    {
        "name": "Tesco Lamb Diced Leg 300G",
        "quantity": 1,
        "price": 7.75
    },
    {
        "name": "Tesco Perfectly Ripe Plums 325G",
        "quantity": 1,
        "price": 2.15
    },
    {
        "name": "Tesco Potato Slices 350G",
        "quantity": 1,
        "price": 1.08
    },
    {
        "name": "Tesco Red Seedless Grapes 500G",
        "quantity": 2,
        "price": 3.0
    },
    {
        "name": "Tesco Unsmoked Gammon Joint 750G",
        "quantity": 1,
        "price": 3.65
    },
    {
        "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "quantity": 2,
        "price": 4.5
    },
    {
        "name": "Chicago Town Deep Dish Pepperoni Pizzas 2 X 155G",
        "quantity": 2,
        "price": 2.69
    },
    {
        "name": "Itsu Pork Gyozas 240G",
        "quantity": 2,
        "price": 7.36
    },
    {
        "name": "Tesco 10 Prawn Kushiyaki Skewers 180g",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Tesco 8 Prawn Bao Buns 256g",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Belazu Rosemary Snack Mix 120g",
        "quantity": 1,
        "price": 2.7
    },
    {
        "name": "\u2020 Belazu Truffle & Pecorino Nut Mix 135g",
        "quantity": 1,
        "price": 2.88
    },
    {
        "name": "\u2020 FREE SAMPLE - Coca-Cola Zero Caffeine Zero Sugar 330ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Tesco Apple And Mango From Concentrate 1 Litre",
        "quantity": 1,
        "price": 1.16
    },
    {
        "name": "Tesco Baby Plum Tomatoes 300G",
        "quantity": 1,
        "price": 0.9
    },
    {
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.79
    },
    {
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 1.85
    },
    {
        "name": "Tesco Finest Extra Fruity Hot Cross Buns 4 pack",
        "quantity": 1,
        "price": 2.0
    },
    {
        "name": "Tesco Finest Pink Lady Apple 4 Pack",
        "quantity": 1,
        "price": 2.5
    },
    {
        "name": "\u2020 Tesco Pure Orange Juice With Bits 1 Litre",
        "quantity": 2,
        "price": 2.34
    },
    {
        "name": "Tesco Seeded Large Burger Buns 4 Pack",
        "quantity": 1,
        "price": 1.0
    },
    {
        "name": "Tesco Sweet Easy Peelers 600g",
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
    "content": "Salmon, jacket potatoes, salad",
    "date": "2026-05-04",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Minted lamb, new potatoes, salad",
    "date": "2026-05-05",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Lamb kebab, new potatoes, salad",
    "date": "2026-05-05",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Pizza (Leo)",
    "date": "2026-05-06",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Mash potato and cheese (Ashlee)",
    "date": "2026-05-06",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Korean style noodles (Terina)",
    "date": "2026-05-06",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Belly pork, potatoes, salad",
    "date": "2026-05-07",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Chicken potato and salad",
    "date": "2026-05-07",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Minted lamb lasagna",
    "date": "2026-05-08",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "chicken / garlic bread and chips",
    "date": "2026-05-08",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  }
];












































































































































































// Transform and export
export const realReceipt = transformCachedOrder(realLatestOrder);

export const realMealsCheckSummary = {
  "order_total": 90.61,
  "delivery_date": "2026-05-01",
  "meals_covered": 5,
  "meals_total": 7,
  "unmatched_groceries": 9,
  "coverage_percentage": 71,
  "day_coverage": [
    {
      "date": "2026-05-04",
      "status": "covered",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-05",
      "status": "delivery",
      "is_delivery_day": true
    },
    {
      "date": "2026-05-06",
      "status": "covered",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-07",
      "status": "covered",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-08",
      "status": "delivery",
      "is_delivery_day": true
    },
    {
      "date": "2026-05-09",
      "status": "gap",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-10",
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
      "content": "Salmon, jacket potatoes, salad",
      "date": "2026-05-04",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Bay Fishmongers Salmon 0.464KG",
        "name": "Bay Fishmongers Salmon 0.464KG",
        "quantity": 1,
        "price": 5.29
      },
      {
        "ingredient": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "name": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "quantity": 1,
        "price": 8.0
      },
      {
        "ingredient": "Tesco Fresh Mashed Potato 800G",
        "name": "Tesco Fresh Mashed Potato 800G",
        "quantity": 1,
        "price": 1.25
      },
      {
        "ingredient": "Tesco Honey Roast Ham Slices 400g",
        "name": "Tesco Honey Roast Ham Slices 400g",
        "quantity": 1,
        "price": 2.19
      },
      {
        "ingredient": "Tesco Potato Slices 350G",
        "name": "Tesco Potato Slices 350G",
        "quantity": 1,
        "price": 1.08
      },
      {
        "ingredient": "Tesco 10 Prawn Kushiyaki Skewers 180g",
        "name": "Tesco 10 Prawn Kushiyaki Skewers 180g",
        "quantity": 1,
        "price": 1.0
      },
      {
        "ingredient": "Tesco 8 Prawn Bao Buns 256g",
        "name": "Tesco 8 Prawn Bao Buns 256g",
        "quantity": 1,
        "price": 1.0
      },
      {
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.79
      },
      {
        "ingredient": "Tesco Baking Potatoes 2kg",
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 1.85
      },
      {
        "ingredient": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "name": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Minted lamb, new potatoes, salad",
      "date": "2026-05-05",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Fire Pit 2 Minted Lamb Leg Steaks 250g",
        "name": "Fire Pit 2 Minted Lamb Leg Steaks 250g",
        "quantity": 1,
        "price": 4.0
      },
      {
        "ingredient": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "name": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "quantity": 1,
        "price": 8.0
      },
      {
        "ingredient": "Tesco Firepit 6 Minted Lamb Kebabs 360g",
        "name": "Tesco Firepit 6 Minted Lamb Kebabs 360g",
        "quantity": 1,
        "price": 4.0
      },
      {
        "ingredient": "Tesco Fresh Mashed Potato 800G",
        "name": "Tesco Fresh Mashed Potato 800G",
        "quantity": 1,
        "price": 1.25
      },
      {
        "ingredient": "Tesco Honey Roast Ham Slices 400g",
        "name": "Tesco Honey Roast Ham Slices 400g",
        "quantity": 1,
        "price": 2.19
      },
      {
        "ingredient": "Tesco Lamb Diced Leg 300G",
        "name": "Tesco Lamb Diced Leg 300G",
        "quantity": 1,
        "price": 7.75
      },
      {
        "ingredient": "Tesco Potato Slices 350G",
        "name": "Tesco Potato Slices 350G",
        "quantity": 1,
        "price": 1.08
      },
      {
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.79
      },
      {
        "ingredient": "Tesco Baking Potatoes 2kg",
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 1.85
      },
      {
        "ingredient": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "name": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Lamb kebab, new potatoes, salad",
      "date": "2026-05-05",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Fire Pit 2 Minted Lamb Leg Steaks 250g",
        "name": "Fire Pit 2 Minted Lamb Leg Steaks 250g",
        "quantity": 1,
        "price": 4.0
      },
      {
        "ingredient": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "name": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "quantity": 1,
        "price": 8.0
      },
      {
        "ingredient": "Tesco Firepit 6 Minted Lamb Kebabs 360g",
        "name": "Tesco Firepit 6 Minted Lamb Kebabs 360g",
        "quantity": 1,
        "price": 4.0
      },
      {
        "ingredient": "Tesco Fresh Mashed Potato 800G",
        "name": "Tesco Fresh Mashed Potato 800G",
        "quantity": 1,
        "price": 1.25
      },
      {
        "ingredient": "Tesco Honey Roast Ham Slices 400g",
        "name": "Tesco Honey Roast Ham Slices 400g",
        "quantity": 1,
        "price": 2.19
      },
      {
        "ingredient": "Tesco Lamb Diced Leg 300G",
        "name": "Tesco Lamb Diced Leg 300G",
        "quantity": 1,
        "price": 7.75
      },
      {
        "ingredient": "Tesco Potato Slices 350G",
        "name": "Tesco Potato Slices 350G",
        "quantity": 1,
        "price": 1.08
      },
      {
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.79
      },
      {
        "ingredient": "Tesco Baking Potatoes 2kg",
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 1.85
      },
      {
        "ingredient": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "name": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Pizza (Leo)",
      "date": "2026-05-06",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Chicago Town Deep Dish Pepperoni Pizzas 2 X 155G",
        "name": "Chicago Town Deep Dish Pepperoni Pizzas 2 X 155G",
        "quantity": 2,
        "price": 2.69
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Mash potato and cheese (Ashlee)",
      "date": "2026-05-06",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "name": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "quantity": 1,
        "price": 8.0
      },
      {
        "ingredient": "Tesco Fresh Mashed Potato 800G",
        "name": "Tesco Fresh Mashed Potato 800G",
        "quantity": 1,
        "price": 1.25
      },
      {
        "ingredient": "Tesco Honey Roast Ham Slices 400g",
        "name": "Tesco Honey Roast Ham Slices 400g",
        "quantity": 1,
        "price": 2.19
      },
      {
        "ingredient": "Tesco Potato Slices 350G",
        "name": "Tesco Potato Slices 350G",
        "quantity": 1,
        "price": 1.08
      },
      {
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.79
      },
      {
        "ingredient": "Tesco Baking Potatoes 2kg",
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 1.85
      },
      {
        "ingredient": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "name": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Korean style noodles (Terina)",
      "date": "2026-05-06",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "quantity": 2,
        "price": 4.5
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Belly pork, potatoes, salad",
      "date": "2026-05-07",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "name": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "quantity": 1,
        "price": 8.0
      },
      {
        "ingredient": "Tesco Fresh Mashed Potato 800G",
        "name": "Tesco Fresh Mashed Potato 800G",
        "quantity": 1,
        "price": 1.25
      },
      {
        "ingredient": "Tesco Honey Roast Ham Slices 400g",
        "name": "Tesco Honey Roast Ham Slices 400g",
        "quantity": 1,
        "price": 2.19
      },
      {
        "ingredient": "Tesco Potato Slices 350G",
        "name": "Tesco Potato Slices 350G",
        "quantity": 1,
        "price": 1.08
      },
      {
        "ingredient": "Tesco Unsmoked Gammon Joint 750G",
        "name": "Tesco Unsmoked Gammon Joint 750G",
        "quantity": 1,
        "price": 3.65
      },
      {
        "ingredient": "Itsu Pork Gyozas 240G",
        "name": "Itsu Pork Gyozas 240G",
        "quantity": 2,
        "price": 7.36
      },
      {
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.79
      },
      {
        "ingredient": "Tesco Baking Potatoes 2kg",
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 1.85
      },
      {
        "ingredient": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "name": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Chicken potato and salad",
      "date": "2026-05-07",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "name": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "quantity": 1,
        "price": 8.0
      },
      {
        "ingredient": "Tesco Fresh Mashed Potato 800G",
        "name": "Tesco Fresh Mashed Potato 800G",
        "quantity": 1,
        "price": 1.25
      },
      {
        "ingredient": "Tesco Honey Roast Ham Slices 400g",
        "name": "Tesco Honey Roast Ham Slices 400g",
        "quantity": 1,
        "price": 2.19
      },
      {
        "ingredient": "Tesco Potato Slices 350G",
        "name": "Tesco Potato Slices 350G",
        "quantity": 1,
        "price": 1.08
      },
      {
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.79
      },
      {
        "ingredient": "Tesco Baking Potatoes 2kg",
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 1.85
      },
      {
        "ingredient": "Tesco Hunters Chicken Breast Fillets 430g",
        "name": "Tesco Hunters Chicken Breast Fillets 430g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "name": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Minted lamb lasagna",
      "date": "2026-05-08",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Fire Pit 2 Minted Lamb Leg Steaks 250g",
        "name": "Fire Pit 2 Minted Lamb Leg Steaks 250g",
        "quantity": 1,
        "price": 4.0
      },
      {
        "ingredient": "Tesco Firepit 6 Minted Lamb Kebabs 360g",
        "name": "Tesco Firepit 6 Minted Lamb Kebabs 360g",
        "quantity": 1,
        "price": 4.0
      },
      {
        "ingredient": "Tesco Lamb Diced Leg 300G",
        "name": "Tesco Lamb Diced Leg 300G",
        "quantity": 1,
        "price": 7.75
      },
      {
        "ingredient": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "quantity": 2,
        "price": 4.5
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "chicken / garlic bread and chips",
      "date": "2026-05-08",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "name": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "quantity": 1,
        "price": 8.0
      },
      {
        "ingredient": "Tesco Fresh Mashed Potato 800G",
        "name": "Tesco Fresh Mashed Potato 800G",
        "quantity": 1,
        "price": 1.25
      },
      {
        "ingredient": "Tesco Honey Roast Ham Slices 400g",
        "name": "Tesco Honey Roast Ham Slices 400g",
        "quantity": 1,
        "price": 2.19
      },
      {
        "ingredient": "Tesco Potato Slices 350G",
        "name": "Tesco Potato Slices 350G",
        "quantity": 1,
        "price": 1.08
      },
      {
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.79
      },
      {
        "ingredient": "Tesco Baking Potatoes 2kg",
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 1.85
      },
      {
        "ingredient": "Tesco Hunters Chicken Breast Fillets 430g",
        "name": "Tesco Hunters Chicken Breast Fillets 430g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "name": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  }
];




























































































































































