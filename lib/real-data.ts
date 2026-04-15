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
  "delivery_date": "2026-04-17",
  "delivery_sort": "",
  "order_number": "7711-8507-752",
  "items": [
    {
        "name": "Tesco Aioli Dip 200G Substitutions: On",
        "quantity": 1,
        "price": 1.1
    },
    {
        "name": "New Covent Garden Soup Co Chicken & Sweetcorn 560g Substitutions: On",
        "quantity": 1,
        "price": 1.75
    },
    {
        "name": "Tesco Guacamole 163g Substitutions: On",
        "quantity": 2,
        "price": 2.2
    },
    {
        "name": "Tesco Soy and Garlic Stir Fry Sauce 165g Substitutions: On",
        "quantity": 1,
        "price": 0.72
    },
    {
        "name": "Tesco Smoky Bacon Sarnie - Tangy Ketchup Substitutions: On",
        "quantity": 1,
        "price": 2.02
    },
    {
        "name": "Tesco Tzatziki Dip 200G Substitutions: On",
        "quantity": 1,
        "price": 1.1
    },
    {
        "name": "Tesco Egg Noodles 300G Substitutions: On",
        "quantity": 1,
        "price": 0.72
    },
    {
        "name": "Tesco Large Vegetable Stir Fry 570g Substitutions: On",
        "quantity": 1,
        "price": 1.29
    },
    {
        "name": "\u2020 Maoam Bloxx 4 Pack 88G Substitutions: On",
        "quantity": 1,
        "price": 0.48
    },
    {
        "name": "Jammie Dodgers Biscuits 140G Substitutions: On",
        "quantity": 3,
        "price": 1.95
    },
    {
        "name": "Warburtons White Sandwich Bread Thins 6 Pack Substitutions: On",
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
    "content": "Ham and cheese toastie",
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
    "content": "Pizza (Leo)",
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
    "meal_type": "dinner"
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
    "meal_type": "dinner"
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
    "content": "Nachos (Ashlee and Danny)",
    "date": "2026-04-18",
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
  },
  {
    "id": "",
    "content": "Hotdogs",
    "date": "2026-04-20",
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
      "content": "Ham and cheese toastie",
      "date": "2026-04-15",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Smoky Bacon Sarnie - Tangy Ketchup Substitutions: On",
        "name": "Tesco Smoky Bacon Sarnie - Tangy Ketchup Substitutions: On",
        "quantity": 1,
        "price": 2.02
      },
      {
        "ingredient": "Warburtons White Sandwich Bread Thins 6 Pack Substitutions: On",
        "name": "Warburtons White Sandwich Bread Thins 6 Pack Substitutions: On",
        "quantity": 1,
        "price": 1.0
      },
      {
        "ingredient": "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
        "name": "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Hovis Best of Both Medium Bread 800g",
        "name": "Hovis Best of Both Medium Bread 800g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Warburtons White Sandwich Bread Thins 6 Pack",
        "name": "Warburtons White Sandwich Bread Thins 6 Pack",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Mash potato cheese (Ashlee)",
      "date": "2026-04-15",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Fire Pit Tesco Beef Smash Burgers 340g",
        "name": "Fire Pit Tesco Beef Smash Burgers 340g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco All Rounder Potatoes 2Kg",
        "name": "Tesco All Rounder Potatoes 2Kg",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Lightly Salted Tortilla Chips 200g",
        "name": "Tesco Lightly Salted Tortilla Chips 200g",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Chicken and rice veg (Terina)",
      "date": "2026-04-15",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "New Covent Garden Soup Co Chicken & Sweetcorn 560g Substitutions: On",
        "name": "New Covent Garden Soup Co Chicken & Sweetcorn 560g Substitutions: On",
        "quantity": 1,
        "price": 1.75
      },
      {
        "ingredient": "Tesco Soy and Garlic Stir Fry Sauce 165g Substitutions: On",
        "name": "Tesco Soy and Garlic Stir Fry Sauce 165g Substitutions: On",
        "quantity": 1,
        "price": 0.72
      },
      {
        "ingredient": "Tesco Large Vegetable Stir Fry 570g Substitutions: On",
        "name": "Tesco Large Vegetable Stir Fry 570g Substitutions: On",
        "quantity": 1,
        "price": 1.29
      },
      {
        "ingredient": "Tesco Soy and Garlic Stir Fry Sauce 165g",
        "name": "Tesco Soy and Garlic Stir Fry Sauce 165g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Large Vegetable Stir Fry 570g",
        "name": "Tesco Large Vegetable Stir Fry 570g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "\u2020 Dr Pepper Regular 500 M",
        "name": "\u2020 Dr Pepper Regular 500 M",
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
      "date": "2026-04-15",
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
      "content": "Jacket potatoes (school)",
      "date": "2026-04-16",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Fire Pit Tesco Beef Smash Burgers 340g",
        "name": "Fire Pit Tesco Beef Smash Burgers 340g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco All Rounder Potatoes 2Kg",
        "name": "Tesco All Rounder Potatoes 2Kg",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Lightly Salted Tortilla Chips 200g",
        "name": "Tesco Lightly Salted Tortilla Chips 200g",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "KFC",
      "date": "2026-04-16",
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
  },
  {
    "meal": {
      "id": "",
      "content": "KFC",
      "date": "2026-04-17",
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
  },
  {
    "meal": {
      "id": "",
      "content": "Chicken and noodles (Terina)",
      "date": "2026-04-17",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "New Covent Garden Soup Co Chicken & Sweetcorn 560g Substitutions: On",
        "name": "New Covent Garden Soup Co Chicken & Sweetcorn 560g Substitutions: On",
        "quantity": 1,
        "price": 1.75
      },
      {
        "ingredient": "Tesco Egg Noodles 300G Substitutions: On",
        "name": "Tesco Egg Noodles 300G Substitutions: On",
        "quantity": 1,
        "price": 0.72
      },
      {
        "ingredient": "Tesco Egg Noodles 300G",
        "name": "Tesco Egg Noodles 300G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
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
      "date": "2026-04-17",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "New Covent Garden Soup Co Chicken & Sweetcorn 560g Substitutions: On",
        "name": "New Covent Garden Soup Co Chicken & Sweetcorn 560g Substitutions: On",
        "quantity": 1,
        "price": 1.75
      },
      {
        "ingredient": "Fire Pit Tesco Beef Smash Burgers 340g",
        "name": "Fire Pit Tesco Beef Smash Burgers 340g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco All Rounder Potatoes 2Kg",
        "name": "Tesco All Rounder Potatoes 2Kg",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Lightly Salted Tortilla Chips 200g",
        "name": "Tesco Lightly Salted Tortilla Chips 200g",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Nachos (Ashlee and Danny)",
      "date": "2026-04-18",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "partial",
    "coverageScore": 87,
    "matchedItems": [
      {
        "ingredient": "Tesco Aioli Dip 200G Substitutions: On",
        "name": "Tesco Aioli Dip 200G Substitutions: On",
        "quantity": 1,
        "price": 1.1
      },
      {
        "ingredient": "Tesco Guacamole 163g Substitutions: On",
        "name": "Tesco Guacamole 163g Substitutions: On",
        "quantity": 2,
        "price": 2.2
      },
      {
        "ingredient": "Tesco Tzatziki Dip 200G Substitutions: On",
        "name": "Tesco Tzatziki Dip 200G Substitutions: On",
        "quantity": 1,
        "price": 1.1
      },
      {
        "ingredient": "Tesco Aioli Dip 200G",
        "name": "Tesco Aioli Dip 200G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Guacamole 163g",
        "name": "Tesco Guacamole 163g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Tzatziki Dip 200G",
        "name": "Tesco Tzatziki Dip 200G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Doritos Mild Salsa Dip 300g",
        "name": "Doritos Mild Salsa Dip 300g",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": [
      "Tesco Guacamole 163g Substitutions: On"
    ],
    "notes": "Need: Tesco Guacamole 163g Substitutions: On"
  },
  {
    "meal": {
      "id": "",
      "content": "Salmon kebabs, salad and new potatoes",
      "date": "2026-04-20",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Raw King Prawns 165g",
        "name": "Tesco Raw King Prawns 165g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Fire Pit Tesco Beef Smash Burgers 340g",
        "name": "Fire Pit Tesco Beef Smash Burgers 340g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Firepit 6 Mango Coconut Lime Fish Skewers 300G",
        "name": "Tesco Firepit 6 Mango Coconut Lime Fish Skewers 300G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco All Rounder Potatoes 2Kg",
        "name": "Tesco All Rounder Potatoes 2Kg",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Lightly Salted Tortilla Chips 200g",
        "name": "Tesco Lightly Salted Tortilla Chips 200g",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Hotdogs",
      "date": "2026-04-20",
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






























