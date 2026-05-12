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
  "delivery_date": "2026-05-08",
  "delivery_sort": "",
  "order_number": "9021-8819-68",
  "order_total": 67.61,
  "items": [
    {
        "name": "Activia Rhubarb Gut Health Yoghurt Multipack 4x115g",
        "quantity": 1,
        "price": 1.75
    },
    {
        "name": "Gressingham Aromatic Half Duck 570G",
        "quantity": 2,
        "price": 12.6
    },
    {
        "name": "Tesco 6 Duck Spring Rolls 216G",
        "quantity": 1,
        "price": 3.15
    },
    {
        "name": "Tesco Bacon Lettuce & Tom Sandwich",
        "quantity": 1,
        "price": 2.02
    },
    {
        "name": "Tesco Broccoli Loose 0.356KG",
        "quantity": 1,
        "price": 0.78
    },
    {
        "name": "Tesco Chestnut Vitamin D Mushrooms 250G",
        "quantity": 1,
        "price": 0.8
    },
    {
        "name": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
        "quantity": 1,
        "price": 2.2
    },
    {
        "name": "Tesco Finest Portobello Vitamin D Mushrooms",
        "quantity": 2,
        "price": 2.8
    },
    {
        "name": "Tesco Finest Sweet Potato Fries 300g",
        "quantity": 1,
        "price": 2.2
    },
    {
        "name": "Tesco Prawn Toasts 4 Pack 120g",
        "quantity": 2,
        "price": 6.8
    },
    {
        "name": "Tesco Ready Rolled Shortcrust Savoury Pastry 320G",
        "quantity": 1,
        "price": 1.35
    },
    {
        "name": "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
        "quantity": 1,
        "price": 1.97
    },
    {
        "name": "\u2020 Dr Pepper Regular 500 M",
        "quantity": 1,
        "price": 1.38
    },
    {
        "name": "\u2020 Lenor In Wash Scent Booster Gold Orchid 155G",
        "quantity": 1,
        "price": 3.3
    },
    {
        "name": "\u2020 Lenor In-Wash Scent Booster Jasmine & White Cedar 280g",
        "quantity": 1,
        "price": 4.8
    },
    {
        "name": "\u2020 Maoam Bloxx 4 Pack 88G",
        "quantity": 1,
        "price": 0.52
    },
    {
        "name": "\u2020 Pepsi Max Cherry No Sugar Cola Bottle 500ml",
        "quantity": 1,
        "price": 1.31
    },
    {
        "name": "\u2020 Robinsons Double Strength Orange No Added Sugar Squash 1L",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "quantity": 1,
        "price": 0.5
    },
    {
        "name": "\u2020 Tesco Apple And Mango From Concentrate 1 Litre",
        "quantity": 1,
        "price": 1.17
    },
    {
        "name": "Tesco Brown Onions 1Kg",
        "quantity": 1,
        "price": 0.99
    },
    {
        "name": "Tesco Carrots 1Kg",
        "quantity": 1,
        "price": 0.69
    },
    {
        "name": "\u2020 Tesco Finest Crinkle Cut Roast Beef & Horseradish Flavour Hand Cooked Crisps 150g",
        "quantity": 2,
        "price": 3.0
    },
    {
        "name": "\u2020 Tesco Pure Orange Juice With Bits 1 Litre",
        "quantity": 2,
        "price": 2.33
    },
    {
        "name": "Tesco Sweet Easy Peelers 600g",
        "quantity": 1,
        "price": 1.5
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
        "name": "Products Items marked with an \u2018\u2020\u2019 include VAT at",
        "quantity": 1,
        "price": 20.0
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
        "name": "Products Items marked with an \u2018\u2020\u2019 include VAT at",
        "quantity": 1,
        "price": 20.0
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
        "name": "Products Items marked with an \u2018\u2020\u2019 include VAT at",
        "quantity": 1,
        "price": 20.0
    }
]
};











































































































































































































// Real meal plan from Todoist (April 13-19, 2026)
// section_id 6gJfvHHqHrCMPcp9 = Ashlee's lunch section -> meal_type: 'lunch'
// section_id 6Rv6PrQrrFWQRg7h = Planned section -> meal_type: 'dinner'
export const realMealPlan: Meal[] = [
  {
    "id": "",
    "content": "Tony and Barbara cooking",
    "date": "2026-05-11",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Tony and Barbara cooking",
    "date": "2026-05-12",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Pizza (Leo)",
    "date": "2026-05-13",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Chicken and chips (Ashlee)",
    "date": "2026-05-13",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Pasta, sauce, garlic bread",
    "date": "2026-05-13",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "London/Tony and Barbara???",
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
  }
];










































































































































































































// Transform and export
export const realReceipt = transformCachedOrder(realLatestOrder);

export const realMealsCheckSummary = {
  "order_total": 67.61,
  "delivery_date": "2026-05-08",
  "meals_covered": 5,
  "meals_total": 7,
  "unmatched_groceries": 37,
  "coverage_percentage": 71,
  "day_coverage": [
    {
      "date": "2026-05-11",
      "status": "covered",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-12",
      "status": "delivery",
      "is_delivery_day": true
    },
    {
      "date": "2026-05-13",
      "status": "covered",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-14",
      "status": "covered",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-15",
      "status": "delivery",
      "is_delivery_day": true
    },
    {
      "date": "2026-05-16",
      "status": "gap",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-17",
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
      "content": "Tony and Barbara cooking",
      "date": "2026-05-11",
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
      "content": "Tony and Barbara cooking",
      "date": "2026-05-12",
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
      "content": "Pizza (Leo)",
      "date": "2026-05-13",
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
      "content": "Chicken and chips (Ashlee)",
      "date": "2026-05-13",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
        "name": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
        "quantity": 1,
        "price": 2.2
      },
      {
        "ingredient": "Tesco Finest Sweet Potato Fries 300g",
        "name": "Tesco Finest Sweet Potato Fries 300g",
        "quantity": 1,
        "price": 2.2
      },
      {
        "ingredient": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "name": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "quantity": 1,
        "price": 0.5
      },
      {
        "ingredient": "\u2020 Tesco Finest Crinkle Cut Roast Beef & Horseradish Flavour Hand Cooked Crisps 150g",
        "name": "\u2020 Tesco Finest Crinkle Cut Roast Beef & Horseradish Flavour Hand Cooked Crisps 150g",
        "quantity": 2,
        "price": 3.0
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Pasta, sauce, garlic bread",
      "date": "2026-05-13",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Garlic Flatbread 225g",
        "name": "Tesco Garlic Flatbread 225g",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "London/Tony and Barbara???",
      "date": "2026-05-14",
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
        "ingredient": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
        "name": "Tesco Finest Golden-Baked Potato Dauphinoise 400g",
        "quantity": 1,
        "price": 2.2
      },
      {
        "ingredient": "Tesco Finest Sweet Potato Fries 300g",
        "name": "Tesco Finest Sweet Potato Fries 300g",
        "quantity": 1,
        "price": 2.2
      },
      {
        "ingredient": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "name": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "quantity": 1,
        "price": 0.5
      },
      {
        "ingredient": "\u2020 Tesco Finest Crinkle Cut Roast Beef & Horseradish Flavour Hand Cooked Crisps 150g",
        "name": "\u2020 Tesco Finest Crinkle Cut Roast Beef & Horseradish Flavour Hand Cooked Crisps 150g",
        "quantity": 2,
        "price": 3.0
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
        "price": 2.02
      },
      {
        "ingredient": "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
        "name": "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
        "quantity": 1,
        "price": 1.97
      },
      {
        "ingredient": "\u2020 Lenor In-Wash Scent Booster Jasmine & White Cedar 280g",
        "name": "\u2020 Lenor In-Wash Scent Booster Jasmine & White Cedar 280g",
        "quantity": 1,
        "price": 4.8
      }
    ],
    "missingItems": []
  }
];


























































































































































































