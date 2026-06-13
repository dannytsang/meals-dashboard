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
    substitutedWith?: string;
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
      substitutedWith: item.substitutedWith,
    })),
    substitutions: order.items
      .filter(item => item.substitutedWith)
      .map(item => ({ original: item.name, substitutedWith: item.substitutedWith as string })),
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
  "delivery_date": "2026-06-16",
  "delivery_sort": "",
  "order_number": "5421-8594-00",
  "order_total": 59.69,
  "items": [
    {
        "name": "Tesco Blueberries 500GSubstitutions: On",
        "quantity": 1,
        "price": 4.55
    },
    {
        "name": "Tesco Mango 450GSubstitutions: On",
        "quantity": 1,
        "price": 4.25
    },
    {
        "name": "Tesco Fire Pit 4 Sweet & Smoky Pork Kebabs 340GSubstitutions: On",
        "quantity": 1,
        "price": 8.0
    },
    {
        "name": "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
        "quantity": 1,
        "price": 1.2
    },
    {
        "name": "Tesco Party Salad 455GSubstitutions: On",
        "quantity": 1,
        "price": 3.0
    },
    {
        "name": "Tesco Mini Hash Brown Bites 700gSubstitutions: On",
        "quantity": 1,
        "price": 2.25
    },
    {
        "name": "Firepit Tesco 4 Sweet & Smokey BBQ Salmon Skewers 250gSubstitutions: On",
        "quantity": 1,
        "price": 6.66
    },
    {
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
        "quantity": 1,
        "price": 1.8
    },
    {
        "name": "Fire Pit Tesco 8 Pork, Mozzarella and Tomato Kofta Kebabs 320gSubstitutions: On",
        "quantity": 1,
        "price": 3.34
    },
    {
        "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400gSubstitutions: On",
        "quantity": 1,
        "price": 4.5
    },
    {
        "name": "Tesco Waffle Fries 550gSubstitutions: On",
        "quantity": 1,
        "price": 2.1
    },
    {
        "name": "Tesco Finest 2 Steak &Ale Pies 400gSubstitutions: On",
        "quantity": 1,
        "price": 3.3
    },
    {
        "name": "Tesco White Iced Ring Doughnuts 4 PackSubstitutions: On",
        "quantity": 1,
        "price": 0.95
    },
    {
        "name": "Suntrail Farms Soft Citrus Pack 600GSubstitutions: On",
        "quantity": 1,
        "price": 1.19
    },
    {
        "name": "Tesco WatermelonSubstitutions: On",
        "quantity": 1,
        "price": 3.75
    },
    {
        "name": "\u2020 TRESemme Heat Defence Care & Protect Spray 60mlSubstitutions: On",
        "quantity": 1,
        "price": 6.4
    },
    {
        "name": "\u2020 Tesco Health Ibuprofen 200mg Pain Relief Tablets 16sSubstitutions: On",
        "quantity": 1,
        "price": 0.7
    },
    {
        "name": "Hayden's 4 Delicious Yum YumsSubstitutions: On",
        "quantity": 1,
        "price": 1.75
    }
]
};




















































































































































































































































































































































// Real meal plan from Todoist (April 13-19, 2026)
// section_id 6gJfvHHqHrCMPcp9 = Ashlee's lunch section -> meal_type: 'lunch'
// section_id 6Rv6PrQrrFWQRg7h = Planned section -> meal_type: 'dinner'
export const realMealPlan: Meal[] = [
  {
    "id": "6gqRfc74rv9Xpr9h",
    "content": "Costco sausages (lunch - frozen)",
    "date": "2026-06-13",
    "labels": [
      "adults",
      "children"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gqRffWGfCHW3mWh",
    "content": "Terina and Leo swimming",
    "date": "2026-06-13",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gqj7Cjg89J3cVJ9",
    "content": "Burger flat bread salad",
    "date": "2026-06-13",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gqRfhhXmm83g459",
    "content": "Roast beef, roast potatoes, roast carrots, broccoli",
    "date": "2026-06-14",
    "labels": [
      "adults",
      "children"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gmwxq3VVV5g59jh",
    "content": "Salmon (frozen) and potato slices and frozen veg",
    "date": "2026-06-15",
    "labels": [
      "adults",
      "plusTonyandBarbara"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gqRfq2F877Wq4j9",
    "content": "Chicken (frozen), chips (frozen) and frozen veg",
    "date": "2026-06-15",
    "labels": [
      "children"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gqx9whGvfPGRxgh",
    "content": "Tony and Barbara cooking",
    "date": "2026-06-16",
    "labels": [
      "adults",
      "children",
      "plusTonyandBarbara"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gqh5rFmJv96P439",
    "content": "Pizza (Leo)",
    "date": "2026-06-17",
    "labels": [
      "children"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gqh5w5f29mWr4p9",
    "content": "Cheesy mash (Ashlee)",
    "date": "2026-06-17",
    "labels": [
      "children"
    ],
    "section": "Planned",
    "meal_type": "lunch"
  },
  {
    "id": "6gr7WjpWMqVXm3Rh",
    "content": "Pie and mini hash browns",
    "date": "2026-06-17",
    "labels": [
      "adults"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gr7Wp9rH5VJ98W9",
    "content": "Tony and Barbara cooking",
    "date": "2026-06-18",
    "labels": [
      "adults",
      "children",
      "plusTonyandBarbara"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gr7WvpC7gjr4q49",
    "content": "Pork kebab, waffle fries and salad",
    "date": "2026-06-19",
    "labels": [
      "adults",
      "plusTonyandBarbara"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6Rv6P5rj7RjvV6j9",
    "content": "Rice / garlic bread",
    "date": "2026-06-19",
    "labels": [
      "children"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  }
];



















































































































































































































































































































































// Transform and export
export const realReceipt = transformCachedOrder(realLatestOrder);

export const realMealsCheckSummary = {
  "coverage_percentage": 77,
  "covered": 8,
  "delivery_date": "2026-06-16",
  "meals_covered": 10,
  "meals_total": 13,
  "missing": 3,
  "order_total": 59.69,
  "partial": 2,
  "unmatched_groceries": 23
};













































































































































































































// Coverage data - pre-computed by sync script (do not edit manually)
export const realCoverage: MealCoverage[] = [
  {
    "meal": {
      "id": "6gqRfc74rv9Xpr9h",
      "content": "Costco sausages (lunch - frozen)",
      "date": "2026-06-13",
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
      "Calbee Takoyaki Ball Japanese Style BBQ Sauce Flavour Corn Puffs 75g",
      "Tesco 4 Smash Burger 340g",
      "Tesco British Beef Medium Roasting Joint 0.868KG",
      "Tesco Chicken & Vegetable Soup 600g",
      "Tesco Green Seedless Grapes Pack 500G",
      "Yamas Authentic Greek Feta Pdo 150G",
      "\u2020\u00a0Calbee Honey Butter Flavour Potato Chips\u00a0130g",
      "\u2020\u00a0Calbee Hot & Spicy Flavour Potato Chips\u00a0130g",
      "De Cecco Conchiglie Rigate 500g",
      "De Cecco Penne Rigate 500G",
      "Hovis Best of Both Medium Bread 800g",
      "\u2020\u00a0Lenor In-Wash Scent Booster Gold Orchid 735g",
      "Loyd Grossman Flame Baked Pizza Bases 2 Pack 220G",
      "Old El Paso Cheesy Baked Enchilada Kit 663G",
      "Old El Paso Crunchy Taco Shells X12 156G",
      "Patak's Indian Garlic & Coriander Mini Naan Breads 4 Pack",
      "\u2020\u00a0Tesco Apple And Mango From Concentrate 1 Litre",
      "Tesco Carrots 1Kg",
      "Tesco Maris Piper Potatoes 2Kg",
      "\u2020\u00a0Tesco Pure Apple Juice 1 Litre",
      "\u2020\u00a0Tesco Pure Orange Juice With Bits 1 Litre"
    ],
    "missingExplanations": []
  },
  {
    "meal": {
      "id": "6gqRffWGfCHW3mWh",
      "content": "Terina and Leo swimming",
      "date": "2026-06-13",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "[external] Terina and Leo swimming",
        "name": "[external] Terina and Leo swimming",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": [],
    "missingExplanations": [],
    "notes": "external"
  },
  {
    "meal": {
      "id": "6gqj7Cjg89J3cVJ9",
      "content": "Burger flat bread salad",
      "date": "2026-06-13",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco 4 Smash Burger 340g",
        "name": "Tesco 4 Smash Burger 340g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco British Beef Medium Roasting Joint 0.868KG",
        "name": "Tesco British Beef Medium Roasting Joint 0.868KG",
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
        "ingredient": "Patak's Indian Garlic & Coriander Mini Naan Breads 4 Pack",
        "name": "Patak's Indian Garlic & Coriander Mini Naan Breads 4 Pack",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": [
      "Calbee Takoyaki Ball Japanese Style BBQ Sauce Flavour Corn Puffs 75g",
      "Tesco Chicken & Vegetable Soup 600g",
      "Tesco Green Seedless Grapes Pack 500G",
      "Yamas Authentic Greek Feta Pdo 150G",
      "\u2020\u00a0Calbee Honey Butter Flavour Potato Chips\u00a0130g",
      "\u2020\u00a0Calbee Hot & Spicy Flavour Potato Chips\u00a0130g",
      "De Cecco Conchiglie Rigate 500g",
      "De Cecco Penne Rigate 500G",
      "\u2020\u00a0Lenor In-Wash Scent Booster Gold Orchid 735g",
      "Loyd Grossman Flame Baked Pizza Bases 2 Pack 220G",
      "Old El Paso Cheesy Baked Enchilada Kit 663G",
      "Old El Paso Crunchy Taco Shells X12 156G",
      "\u2020\u00a0Tesco Apple And Mango From Concentrate 1 Litre",
      "Tesco Carrots 1Kg",
      "Tesco Maris Piper Potatoes 2Kg",
      "\u2020\u00a0Tesco Pure Apple Juice 1 Litre",
      "\u2020\u00a0Tesco Pure Orange Juice With Bits 1 Litre"
    ],
    "missingExplanations": []
  },
  {
    "meal": {
      "id": "6gqRfhhXmm83g459",
      "content": "Roast beef, roast potatoes, roast carrots, broccoli",
      "date": "2026-06-14",
      "labels": [
        "adults",
        "children"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "partial",
    "coverageScore": 50,
    "matchedItems": [
      {
        "ingredient": "Tesco British Beef Medium Roasting Joint 0.868KG",
        "name": "Tesco British Beef Medium Roasting Joint 0.868KG",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Carrots 1Kg",
        "name": "Tesco Carrots 1Kg",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Maris Piper Potatoes 2Kg",
        "name": "Tesco Maris Piper Potatoes 2Kg",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": [
      "Calbee Takoyaki Ball Japanese Style BBQ Sauce Flavour Corn Puffs 75g",
      "Tesco 4 Smash Burger 340g",
      "Tesco Chicken & Vegetable Soup 600g",
      "Tesco Green Seedless Grapes Pack 500G",
      "Yamas Authentic Greek Feta Pdo 150G",
      "\u2020\u00a0Calbee Honey Butter Flavour Potato Chips\u00a0130g",
      "\u2020\u00a0Calbee Hot & Spicy Flavour Potato Chips\u00a0130g",
      "De Cecco Conchiglie Rigate 500g",
      "De Cecco Penne Rigate 500G",
      "Hovis Best of Both Medium Bread 800g",
      "\u2020\u00a0Lenor In-Wash Scent Booster Gold Orchid 735g",
      "Loyd Grossman Flame Baked Pizza Bases 2 Pack 220G",
      "Old El Paso Cheesy Baked Enchilada Kit 663G",
      "Old El Paso Crunchy Taco Shells X12 156G",
      "Patak's Indian Garlic & Coriander Mini Naan Breads 4 Pack",
      "\u2020\u00a0Tesco Apple And Mango From Concentrate 1 Litre",
      "\u2020\u00a0Tesco Pure Apple Juice 1 Litre",
      "\u2020\u00a0Tesco Pure Orange Juice With Bits 1 Litre"
    ],
    "missingExplanations": [
      "broccoli"
    ]
  },
  {
    "meal": {
      "id": "6gmwxq3VVV5g59jh",
      "content": "Salmon (frozen) and potato slices and frozen veg",
      "date": "2026-06-15",
      "labels": [
        "adults",
        "plusTonyandBarbara"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "partial",
    "coverageScore": 50,
    "matchedItems": [
      {
        "ingredient": "Tesco Maris Piper Potatoes 2Kg",
        "name": "Tesco Maris Piper Potatoes 2Kg",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": [
      "Calbee Takoyaki Ball Japanese Style BBQ Sauce Flavour Corn Puffs 75g",
      "Tesco 4 Smash Burger 340g",
      "Tesco British Beef Medium Roasting Joint 0.868KG",
      "Tesco Chicken & Vegetable Soup 600g",
      "Tesco Green Seedless Grapes Pack 500G",
      "Yamas Authentic Greek Feta Pdo 150G",
      "\u2020\u00a0Calbee Honey Butter Flavour Potato Chips\u00a0130g",
      "\u2020\u00a0Calbee Hot & Spicy Flavour Potato Chips\u00a0130g",
      "De Cecco Conchiglie Rigate 500g",
      "De Cecco Penne Rigate 500G",
      "Hovis Best of Both Medium Bread 800g",
      "\u2020\u00a0Lenor In-Wash Scent Booster Gold Orchid 735g",
      "Loyd Grossman Flame Baked Pizza Bases 2 Pack 220G",
      "Old El Paso Cheesy Baked Enchilada Kit 663G",
      "Old El Paso Crunchy Taco Shells X12 156G",
      "Patak's Indian Garlic & Coriander Mini Naan Breads 4 Pack",
      "\u2020\u00a0Tesco Apple And Mango From Concentrate 1 Litre",
      "Tesco Carrots 1Kg",
      "\u2020\u00a0Tesco Pure Apple Juice 1 Litre",
      "\u2020\u00a0Tesco Pure Orange Juice With Bits 1 Litre"
    ],
    "missingExplanations": []
  },
  {
    "meal": {
      "id": "6gqRfq2F877Wq4j9",
      "content": "Chicken (frozen), chips (frozen) and frozen veg",
      "date": "2026-06-15",
      "labels": [
        "children"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Chicken & Vegetable Soup 600g",
        "name": "Tesco Chicken & Vegetable Soup 600g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "\u2020\u00a0Calbee Honey Butter Flavour Potato Chips\u00a0130g",
        "name": "\u2020\u00a0Calbee Honey Butter Flavour Potato Chips\u00a0130g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "\u2020\u00a0Calbee Hot & Spicy Flavour Potato Chips\u00a0130g",
        "name": "\u2020\u00a0Calbee Hot & Spicy Flavour Potato Chips\u00a0130g",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": [
      "Calbee Takoyaki Ball Japanese Style BBQ Sauce Flavour Corn Puffs 75g",
      "Tesco 4 Smash Burger 340g",
      "Tesco British Beef Medium Roasting Joint 0.868KG",
      "Tesco Green Seedless Grapes Pack 500G",
      "Yamas Authentic Greek Feta Pdo 150G",
      "De Cecco Conchiglie Rigate 500g",
      "De Cecco Penne Rigate 500G",
      "Hovis Best of Both Medium Bread 800g",
      "\u2020\u00a0Lenor In-Wash Scent Booster Gold Orchid 735g",
      "Loyd Grossman Flame Baked Pizza Bases 2 Pack 220G",
      "Old El Paso Cheesy Baked Enchilada Kit 663G",
      "Old El Paso Crunchy Taco Shells X12 156G",
      "Patak's Indian Garlic & Coriander Mini Naan Breads 4 Pack",
      "\u2020\u00a0Tesco Apple And Mango From Concentrate 1 Litre",
      "Tesco Carrots 1Kg",
      "Tesco Maris Piper Potatoes 2Kg",
      "\u2020\u00a0Tesco Pure Apple Juice 1 Litre",
      "\u2020\u00a0Tesco Pure Orange Juice With Bits 1 Litre"
    ],
    "missingExplanations": []
  },
  {
    "meal": {
      "id": "6gqx9whGvfPGRxgh",
      "content": "Tony and Barbara cooking",
      "date": "2026-06-16",
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
    "missingExplanations": [],
    "notes": "external"
  },
  {
    "meal": {
      "id": "6gqh5rFmJv96P439",
      "content": "Pizza (Leo)",
      "date": "2026-06-17",
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
      "Tesco Blueberries 500GSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco Fire Pit 4 Sweet & Smoky Pork Kebabs 340GSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "Tesco Party Salad 455GSubstitutions: On",
      "Tesco Mini Hash Brown Bites 700gSubstitutions: On",
      "Firepit Tesco 4 Sweet & Smokey BBQ Salmon Skewers 250gSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "Fire Pit Tesco 8 Pork, Mozzarella and Tomato Kofta Kebabs 320gSubstitutions: On",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400gSubstitutions: On",
      "Tesco Waffle Fries 550gSubstitutions: On",
      "Tesco Finest 2 Steak &Ale Pies 400gSubstitutions: On",
      "Tesco White Iced Ring Doughnuts 4 PackSubstitutions: On",
      "Suntrail Farms Soft Citrus Pack 600GSubstitutions: On",
      "Tesco WatermelonSubstitutions: On",
      "\u2020 TRESemme Heat Defence Care & Protect Spray 60mlSubstitutions: On",
      "\u2020 Tesco Health Ibuprofen 200mg Pain Relief Tablets 16sSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On"
    ],
    "missingExplanations": []
  },
  {
    "meal": {
      "id": "6gqh5w5f29mWr4p9",
      "content": "Cheesy mash (Ashlee)",
      "date": "2026-06-17",
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
    "missingExplanations": [],
    "notes": "external"
  },
  {
    "meal": {
      "id": "6gr7WjpWMqVXm3Rh",
      "content": "Pie and mini hash browns",
      "date": "2026-06-17",
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
        "ingredient": "Tesco Mini Hash Brown Bites 700gSubstitutions: On",
        "name": "Tesco Mini Hash Brown Bites 700gSubstitutions: On",
        "quantity": 1,
        "price": 2.25
      },
      {
        "ingredient": "Tesco Finest 2 Steak &Ale Pies 400gSubstitutions: On",
        "name": "Tesco Finest 2 Steak &Ale Pies 400gSubstitutions: On",
        "quantity": 1,
        "price": 3.3
      }
    ],
    "missingItems": [
      "Tesco Blueberries 500GSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco Fire Pit 4 Sweet & Smoky Pork Kebabs 340GSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "Tesco Party Salad 455GSubstitutions: On",
      "Firepit Tesco 4 Sweet & Smokey BBQ Salmon Skewers 250gSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "Fire Pit Tesco 8 Pork, Mozzarella and Tomato Kofta Kebabs 320gSubstitutions: On",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400gSubstitutions: On",
      "Tesco Waffle Fries 550gSubstitutions: On",
      "Tesco White Iced Ring Doughnuts 4 PackSubstitutions: On",
      "Suntrail Farms Soft Citrus Pack 600GSubstitutions: On",
      "Tesco WatermelonSubstitutions: On",
      "\u2020 TRESemme Heat Defence Care & Protect Spray 60mlSubstitutions: On",
      "\u2020 Tesco Health Ibuprofen 200mg Pain Relief Tablets 16sSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On"
    ],
    "missingExplanations": []
  },
  {
    "meal": {
      "id": "6gr7Wp9rH5VJ98W9",
      "content": "Tony and Barbara cooking",
      "date": "2026-06-18",
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
    "missingExplanations": [],
    "notes": "external"
  },
  {
    "meal": {
      "id": "6gr7WvpC7gjr4q49",
      "content": "Pork kebab, waffle fries and salad",
      "date": "2026-06-19",
      "labels": [
        "adults",
        "plusTonyandBarbara"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Fire Pit 4 Sweet & Smoky Pork Kebabs 340GSubstitutions: On",
        "name": "Tesco Fire Pit 4 Sweet & Smoky Pork Kebabs 340GSubstitutions: On",
        "quantity": 1,
        "price": 8.0
      },
      {
        "ingredient": "Tesco Party Salad 455GSubstitutions: On",
        "name": "Tesco Party Salad 455GSubstitutions: On",
        "quantity": 1,
        "price": 3.0
      },
      {
        "ingredient": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
        "quantity": 1,
        "price": 1.8
      },
      {
        "ingredient": "Fire Pit Tesco 8 Pork, Mozzarella and Tomato Kofta Kebabs 320gSubstitutions: On",
        "name": "Fire Pit Tesco 8 Pork, Mozzarella and Tomato Kofta Kebabs 320gSubstitutions: On",
        "quantity": 1,
        "price": 3.34
      },
      {
        "ingredient": "Tesco Waffle Fries 550gSubstitutions: On",
        "name": "Tesco Waffle Fries 550gSubstitutions: On",
        "quantity": 1,
        "price": 2.1
      }
    ],
    "missingItems": [
      "Tesco Blueberries 500GSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "Tesco Mini Hash Brown Bites 700gSubstitutions: On",
      "Firepit Tesco 4 Sweet & Smokey BBQ Salmon Skewers 250gSubstitutions: On",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400gSubstitutions: On",
      "Tesco Finest 2 Steak &Ale Pies 400gSubstitutions: On",
      "Tesco White Iced Ring Doughnuts 4 PackSubstitutions: On",
      "Suntrail Farms Soft Citrus Pack 600GSubstitutions: On",
      "Tesco WatermelonSubstitutions: On",
      "\u2020 TRESemme Heat Defence Care & Protect Spray 60mlSubstitutions: On",
      "\u2020 Tesco Health Ibuprofen 200mg Pain Relief Tablets 16sSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On"
    ],
    "missingExplanations": []
  },
  {
    "meal": {
      "id": "6Rv6P5rj7RjvV6j9",
      "content": "Rice / garlic bread",
      "date": "2026-06-19",
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
      "Tesco Blueberries 500GSubstitutions: On",
      "Tesco Mango 450GSubstitutions: On",
      "Tesco Fire Pit 4 Sweet & Smoky Pork Kebabs 340GSubstitutions: On",
      "Tesco British Whole Milk 1.13L, 2 PintsSubstitutions: On",
      "Tesco Party Salad 455GSubstitutions: On",
      "Tesco Mini Hash Brown Bites 700gSubstitutions: On",
      "Firepit Tesco 4 Sweet & Smokey BBQ Salmon Skewers 250gSubstitutions: On",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260GSubstitutions: On",
      "Fire Pit Tesco 8 Pork, Mozzarella and Tomato Kofta Kebabs 320gSubstitutions: On",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400gSubstitutions: On",
      "Tesco Waffle Fries 550gSubstitutions: On",
      "Tesco Finest 2 Steak &Ale Pies 400gSubstitutions: On",
      "Tesco White Iced Ring Doughnuts 4 PackSubstitutions: On",
      "Suntrail Farms Soft Citrus Pack 600GSubstitutions: On",
      "Tesco WatermelonSubstitutions: On",
      "\u2020 TRESemme Heat Defence Care & Protect Spray 60mlSubstitutions: On",
      "\u2020 Tesco Health Ibuprofen 200mg Pain Relief Tablets 16sSubstitutions: On",
      "Hayden's 4 Delicious Yum YumsSubstitutions: On"
    ],
    "missingExplanations": []
  }
];



































































































































































































































































































































