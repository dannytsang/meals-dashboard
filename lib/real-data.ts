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
  "delivery_date": "2026-05-05",
  "delivery_sort": "",
  "order_number": "9021-8747-68",
  "order_total": 56.23,
  "items": [
    {
        "name": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G Substitutions: On",
        "quantity": 1,
        "price": 3.76
    },
    {
        "name": "\u2020 Pringles Original Sharing Crisps 185g Substitutions: On",
        "quantity": 1,
        "price": 1.85
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
    "content": "Minted lamb, new potatoes, veg",
    "date": "2026-05-05",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Lamb kebab, new potatoes, veg",
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
  "order_total": 56.23,
  "delivery_date": "2026-05-05",
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
    "matchedItems": [],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Minted lamb, new potatoes, veg",
      "date": "2026-05-05",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G Substitutions: On",
        "name": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G Substitutions: On",
        "quantity": 1,
        "price": 3.76
      },
      {
        "ingredient": "Tesco Finest Sweet Potato Fries 300g",
        "name": "Tesco Finest Sweet Potato Fries 300g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Triple Cook Chips 400g",
        "name": "Tesco Finest Triple Cook Chips 400g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
        "name": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "\u2020 Dr Pepper Regular 500 M",
        "name": "\u2020 Dr Pepper Regular 500 M",
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
      "content": "Lamb kebab, new potatoes, veg",
      "date": "2026-05-05",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G Substitutions: On",
        "name": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G Substitutions: On",
        "quantity": 1,
        "price": 3.76
      },
      {
        "ingredient": "Tesco Finest Sweet Potato Fries 300g",
        "name": "Tesco Finest Sweet Potato Fries 300g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Triple Cook Chips 400g",
        "name": "Tesco Finest Triple Cook Chips 400g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
        "name": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "\u2020 Dr Pepper Regular 500 M",
        "name": "\u2020 Dr Pepper Regular 500 M",
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
        "ingredient": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "name": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "quantity": null,
        "price": null
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
        "ingredient": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G Substitutions: On",
        "name": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G Substitutions: On",
        "quantity": 1,
        "price": 3.76
      },
      {
        "ingredient": "Tesco Finest Sweet Potato Fries 300g",
        "name": "Tesco Finest Sweet Potato Fries 300g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Triple Cook Chips 400g",
        "name": "Tesco Finest Triple Cook Chips 400g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
        "name": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
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
        "ingredient": "THE GYM KITCHEN FOOD TO FUEL CHICKEN CARBONARA PASTA 400G",
        "name": "THE GYM KITCHEN FOOD TO FUEL CHICKEN CARBONARA PASTA 400G",
        "quantity": null,
        "price": null
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
        "ingredient": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G Substitutions: On",
        "name": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G Substitutions: On",
        "quantity": 1,
        "price": 3.76
      },
      {
        "ingredient": "Tesco Finest Sweet Potato Fries 300g",
        "name": "Tesco Finest Sweet Potato Fries 300g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Triple Cook Chips 400g",
        "name": "Tesco Finest Triple Cook Chips 400g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
        "name": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
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
        "ingredient": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G Substitutions: On",
        "name": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G Substitutions: On",
        "quantity": 1,
        "price": 3.76
      },
      {
        "ingredient": "THE GYM KITCHEN FOOD TO FUEL CHICKEN CARBONARA PASTA 400G",
        "name": "THE GYM KITCHEN FOOD TO FUEL CHICKEN CARBONARA PASTA 400G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Sweet Potato Fries 300g",
        "name": "Tesco Finest Sweet Potato Fries 300g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Triple Cook Chips 400g",
        "name": "Tesco Finest Triple Cook Chips 400g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
        "name": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "name": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "quantity": null,
        "price": null
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
        "ingredient": "THE GYM KITCHEN FOOD TO FUEL CHICKEN CARBONARA PASTA 400G",
        "name": "THE GYM KITCHEN FOOD TO FUEL CHICKEN CARBONARA PASTA 400G",
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
      "date": "2026-05-08",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G Substitutions: On",
        "name": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G Substitutions: On",
        "quantity": 1,
        "price": 3.76
      },
      {
        "ingredient": "THE GYM KITCHEN FOOD TO FUEL CHICKEN CARBONARA PASTA 400G",
        "name": "THE GYM KITCHEN FOOD TO FUEL CHICKEN CARBONARA PASTA 400G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Sweet Potato Fries 300g",
        "name": "Tesco Finest Sweet Potato Fries 300g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Triple Cook Chips 400g",
        "name": "Tesco Finest Triple Cook Chips 400g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
        "name": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "name": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "quantity": null,
        "price": null
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






























































































































































