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
  "delivery_date": "2026-06-12",
  "delivery_sort": "",
  "order_number": "5421-8003-00",
  "order_total": 70.04,
  "items": [
    {
        "name": "Yamas Authentic Greek Feta Pdo 150GSubstitutions: On",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "Tesco Chicken & Vegetable Soup 600gSubstitutions: On",
        "quantity": 1,
        "price": 1.5
    },
    {
        "name": "Tesco British Beef Medium Roasting Joint 1KGSubstitutions: On",
        "quantity": 1,
        "price": 15.0
    },
    {
        "name": "Tesco 4 Vegetable Spring Rolls 144gSubstitutions: On",
        "quantity": 1,
        "price": 1.8
    },
    {
        "name": "Tesco Green Seedless Grapes Pack 500GSubstitutions: On",
        "quantity": 1,
        "price": 1.8
    },
    {
        "name": "Gressingham Aromatic Half Duck 570GSubstitutions: On",
        "quantity": 1,
        "price": 12.6
    },
    {
        "name": "Tesco 4 Smash Burger 340gSubstitutions: On",
        "quantity": 1,
        "price": 3.5
    },
    {
        "name": "Tesco Prawn Toast 8 Pack 120gSubstitutions: On",
        "quantity": 1,
        "price": 3.0
    },
    {
        "name": "\u2020 Tesco Pure Apple Juice 1 LitreSubstitutions: On",
        "quantity": 1,
        "price": 1.16
    },
    {
        "name": "\u2020 Tesco Pure Orange Juice With Bits 1 LitreSubstitutions: On",
        "quantity": 1,
        "price": 1.17
    },
    {
        "name": "Patak's Indian Garlic & Coriander Mini Naan Breads 4 PackSubstitutions: On",
        "quantity": 1,
        "price": 1.29
    },
    {
        "name": "Tesco Maris Piper Potatoes 2KgSubstitutions: On",
        "quantity": 1,
        "price": 1.8
    },
    {
        "name": "De Cecco Penne Rigate 500GSubstitutions: On",
        "quantity": 1,
        "price": 1.35
    },
    {
        "name": "De Cecco Conchiglie Rigate 500gSubstitutions: On",
        "quantity": 1,
        "price": 1.35
    },
    {
        "name": "Old El Paso Crunchy Taco Shells X12 156GSubstitutions: On",
        "quantity": 1,
        "price": 1.85
    },
    {
        "name": "Old El Paso Cheesy Baked Enchilada Kit 663GSubstitutions: On",
        "quantity": 1,
        "price": 3.29
    },
    {
        "name": "Tesco Carrots 1KgSubstitutions: On",
        "quantity": 1,
        "price": 0.69
    },
    {
        "name": "\u2020 Lenor In-Wash Scent Booster Gold Orchid 735gSubstitutions: On",
        "quantity": 1,
        "price": 10.5
    },
    {
        "name": "\u2020 Tesco Apple And Mango From Concentrate 1 LitreSubstitutions: On",
        "quantity": 1,
        "price": 1.17
    },
    {
        "name": "Hovis Best of Both Medium Bread 800gSubstitutions: On",
        "quantity": 1,
        "price": 1.15
    },
    {
        "name": "Loyd Grossman Flame Baked Pizza Bases 2 Pack 220GSubstitutions: On",
        "quantity": 1,
        "price": 2.57
    }
]
};






























































































































































































































































































































// Real meal plan from Todoist (April 13-19, 2026)
// section_id 6gJfvHHqHrCMPcp9 = Ashlee's lunch section -> meal_type: 'lunch'
// section_id 6Rv6PrQrrFWQRg7h = Planned section -> meal_type: 'dinner'
export const realMealPlan: Meal[] = [
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
    "id": "6gqRfq2F877Wq4j9",
    "content": "Chicken (frozen), sliced potatoes (frozen) and frozen veg",
    "date": "2026-06-15",
    "labels": [
      "children"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gqRg2GhVJPvxxch",
    "content": "Steak, sliced potatoes (frozen), frozen veg",
    "date": "2026-06-15",
    "labels": [
      "adults"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "6gqRg4qVPF7WcWQ9",
    "content": "Duck pancakes, prawn toast, spring rolls",
    "date": "2026-06-16",
    "labels": [
      "adults",
      "children"
    ],
    "section": "Planned",
    "meal_type": "dinner"
  }
];





























































































































































































































































































































// Transform and export
export const realReceipt = transformCachedOrder(realLatestOrder);

export const realMealsCheckSummary = {
  "coverage_percentage": 92,
  "covered": 8,
  "delivery_date": "2026-06-12",
  "meals_covered": 11,
  "meals_total": 12,
  "missing": 1,
  "order_total": 70.04,
  "partial": 3,
  "unmatched_groceries": 22
};























































































































































































// Coverage data - pre-computed by sync script (do not edit manually)
export const realCoverage: MealCoverage[] = [
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
        "ingredient": "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814g",
        "name": "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814g",
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
        "ingredient": "Tesco Egg Noodles 300G",
        "name": "Tesco Egg Noodles 300G",
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
        "ingredient": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "\u2020\u00a0Calbee Hot & Spicy Flavour Potato Chips\u00a0130g",
        "name": "\u2020\u00a0Calbee Hot & Spicy Flavour Potato Chips\u00a0130g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "\u2020\u00a0Calbee Seaweed & Salt Flavour Potato Chips 130g",
        "name": "\u2020\u00a0Calbee Seaweed & Salt Flavour Potato Chips 130g",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": [
      "Tesco Beef Steaks with Peppercorn Sauce 320g",
      "Tesco British Whole Milk 1.13L, 2 Pints",
      "Tesco Finest Beef Dripping Roast Potatoes 800G",
      "Tesco Mango 450G",
      "Tesco Raw King Prawns 165g",
      "Tesco Stonebaked Classic Margherita Pizza 306g",
      "Tesco Sweet Chilli Stir Fry Sauce 165g",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
      "Grower's Harvest Sweetcorn 907G",
      "\u2020\u00a0Corsodyl Active Gum Repair Toothpaste - Fresh Mint 75ml",
      "Hayden's 4 Delicious Yum Yums",
      "\u2020\u00a0Tesco Apple & Elderflower Sparkling Water 1 Litre",
      "Tesco Chocolate Iced Ring Doughnuts 4 Pack",
      "\u2020\u00a0Tesco Sparkling Water Lemon & Lime 1 Litre",
      "\u2020\u00a0Walkers Wotsits Cheese Multipack Crisps 20x16.5g"
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
      "Tesco Beef Steaks with Peppercorn Sauce 320g",
      "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814g",
      "Tesco British Whole Milk 1.13L, 2 Pints",
      "Tesco Crackling Pork Loin Joint 637G",
      "Tesco Egg Noodles 300G",
      "Tesco Finest Beef Dripping Roast Potatoes 800G",
      "Tesco Large Vegetable Stir Fry 570g",
      "Tesco Mango 450G",
      "Tesco Raw King Prawns 165g",
      "Tesco Stonebaked Classic Margherita Pizza 306g",
      "Tesco Sweet Chilli Stir Fry Sauce 165g",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
      "Grower's Harvest Sweetcorn 907G",
      "\u2020\u00a0Calbee Hot & Spicy Flavour Potato Chips\u00a0130g",
      "\u2020\u00a0Calbee Seaweed & Salt Flavour Potato Chips 130g",
      "\u2020\u00a0Corsodyl Active Gum Repair Toothpaste - Fresh Mint 75ml",
      "Hayden's 4 Delicious Yum Yums",
      "\u2020\u00a0Tesco Apple & Elderflower Sparkling Water 1 Litre",
      "Tesco Chocolate Iced Ring Doughnuts 4 Pack",
      "\u2020\u00a0Tesco Sparkling Water Lemon & Lime 1 Litre",
      "\u2020\u00a0Walkers Wotsits Cheese Multipack Crisps 20x16.5g"
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
        "ingredient": "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814g",
        "name": "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814g",
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
        "ingredient": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
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
      "Tesco Beef Steaks with Peppercorn Sauce 320g",
      "Tesco British Whole Milk 1.13L, 2 Pints",
      "Tesco Egg Noodles 300G",
      "Tesco Finest Beef Dripping Roast Potatoes 800G",
      "Tesco Large Vegetable Stir Fry 570g",
      "Tesco Mango 450G",
      "Tesco Raw King Prawns 165g",
      "Tesco Stonebaked Classic Margherita Pizza 306g",
      "Tesco Sweet Chilli Stir Fry Sauce 165g",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
      "Grower's Harvest Sweetcorn 907G",
      "\u2020\u00a0Calbee Seaweed & Salt Flavour Potato Chips 130g",
      "\u2020\u00a0Corsodyl Active Gum Repair Toothpaste - Fresh Mint 75ml",
      "Hayden's 4 Delicious Yum Yums",
      "\u2020\u00a0Tesco Apple & Elderflower Sparkling Water 1 Litre",
      "Tesco Chocolate Iced Ring Doughnuts 4 Pack",
      "\u2020\u00a0Tesco Sparkling Water Lemon & Lime 1 Litre",
      "\u2020\u00a0Walkers Wotsits Cheese Multipack Crisps 20x16.5g"
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
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Large Vegetable Stir Fry 570g",
        "name": "Tesco Large Vegetable Stir Fry 570g",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "Tesco Sweet Chilli Stir Fry Sauce 165g",
        "name": "Tesco Sweet Chilli Stir Fry Sauce 165g",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": [
      "Tesco Beef Steaks with Peppercorn Sauce 320g",
      "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814g",
      "Tesco British Whole Milk 1.13L, 2 Pints",
      "Tesco Crackling Pork Loin Joint 637G",
      "Tesco Egg Noodles 300G",
      "Tesco Finest Beef Dripping Roast Potatoes 800G",
      "Tesco Mango 450G",
      "Tesco Raw King Prawns 165g",
      "Tesco Stonebaked Classic Margherita Pizza 306g",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
      "Grower's Harvest Sweetcorn 907G",
      "\u2020\u00a0Calbee Hot & Spicy Flavour Potato Chips\u00a0130g",
      "\u2020\u00a0Calbee Seaweed & Salt Flavour Potato Chips 130g",
      "\u2020\u00a0Corsodyl Active Gum Repair Toothpaste - Fresh Mint 75ml",
      "Hayden's 4 Delicious Yum Yums",
      "\u2020\u00a0Tesco Apple & Elderflower Sparkling Water 1 Litre",
      "Tesco Chocolate Iced Ring Doughnuts 4 Pack",
      "\u2020\u00a0Tesco Sparkling Water Lemon & Lime 1 Litre",
      "\u2020\u00a0Walkers Wotsits Cheese Multipack Crisps 20x16.5g"
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
      "id": "6gpvwXf7Cr6gm57h",
      "content": "Pizza (Leo)",
      "date": "2026-06-10",
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
        "ingredient": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "name": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "quantity": null,
        "price": null
      }
    ],
    "missingItems": [
      "Tesco Beef Steaks with Peppercorn Sauce 320g",
      "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814g",
      "Tesco British Whole Milk 1.13L, 2 Pints",
      "Tesco Crackling Pork Loin Joint 637G",
      "Tesco Egg Noodles 300G",
      "Tesco Finest Beef Dripping Roast Potatoes 800G",
      "Tesco Large Vegetable Stir Fry 570g",
      "Tesco Mango 450G",
      "Tesco Raw King Prawns 165g",
      "Tesco Sweet Chilli Stir Fry Sauce 165g",
      "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
      "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
      "Grower's Harvest Sweetcorn 907G",
      "\u2020\u00a0Calbee Hot & Spicy Flavour Potato Chips\u00a0130g",
      "\u2020\u00a0Calbee Seaweed & Salt Flavour Potato Chips 130g",
      "\u2020\u00a0Corsodyl Active Gum Repair Toothpaste - Fresh Mint 75ml",
      "Hayden's 4 Delicious Yum Yums",
      "\u2020\u00a0Tesco Apple & Elderflower Sparkling Water 1 Litre",
      "Tesco Chocolate Iced Ring Doughnuts 4 Pack",
      "\u2020\u00a0Tesco Sparkling Water Lemon & Lime 1 Litre",
      "\u2020\u00a0Walkers Wotsits Cheese Multipack Crisps 20x16.5g"
    ]
  },
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
    "status": "partial",
    "coverageScore": 50,
    "matchedItems": [
      {
        "ingredient": "Old El Paso Crunchy Taco Shells X12 156GSubstitutions: On",
        "name": "Old El Paso Crunchy Taco Shells X12 156GSubstitutions: On",
        "quantity": 1,
        "price": 1.85
      }
    ],
    "missingItems": [
      "Yamas Authentic Greek Feta Pdo 150GSubstitutions: On",
      "Tesco Chicken & Vegetable Soup 600gSubstitutions: On",
      "Tesco British Beef Medium Roasting Joint 1KGSubstitutions: On",
      "Tesco 4 Vegetable Spring Rolls 144gSubstitutions: On",
      "Tesco Green Seedless Grapes Pack 500GSubstitutions: On",
      "Gressingham Aromatic Half Duck 570GSubstitutions: On",
      "Tesco 4 Smash Burger 340gSubstitutions: On",
      "Tesco Prawn Toast 8 Pack 120gSubstitutions: On",
      "\u2020 Tesco Pure Apple Juice 1 LitreSubstitutions: On",
      "\u2020 Tesco Pure Orange Juice With Bits 1 LitreSubstitutions: On",
      "Patak's Indian Garlic & Coriander Mini Naan Breads 4 PackSubstitutions: On",
      "Tesco Maris Piper Potatoes 2KgSubstitutions: On",
      "De Cecco Penne Rigate 500GSubstitutions: On",
      "De Cecco Conchiglie Rigate 500gSubstitutions: On",
      "Old El Paso Cheesy Baked Enchilada Kit 663GSubstitutions: On",
      "Tesco Carrots 1KgSubstitutions: On",
      "\u2020 Lenor In-Wash Scent Booster Gold Orchid 735gSubstitutions: On",
      "\u2020 Tesco Apple And Mango From Concentrate 1 LitreSubstitutions: On",
      "Hovis Best of Both Medium Bread 800gSubstitutions: On",
      "Loyd Grossman Flame Baked Pizza Bases 2 Pack 220GSubstitutions: On"
    ]
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
    "status": "partial",
    "coverageScore": 50,
    "matchedItems": [
      {
        "ingredient": "\u2020 Lenor In-Wash Scent Booster Gold Orchid 735gSubstitutions: On",
        "name": "\u2020 Lenor In-Wash Scent Booster Gold Orchid 735gSubstitutions: On",
        "quantity": 1,
        "price": 10.5
      }
    ],
    "missingItems": [
      "Yamas Authentic Greek Feta Pdo 150GSubstitutions: On",
      "Tesco Chicken & Vegetable Soup 600gSubstitutions: On",
      "Tesco British Beef Medium Roasting Joint 1KGSubstitutions: On",
      "Tesco 4 Vegetable Spring Rolls 144gSubstitutions: On",
      "Tesco Green Seedless Grapes Pack 500GSubstitutions: On",
      "Gressingham Aromatic Half Duck 570GSubstitutions: On",
      "Tesco 4 Smash Burger 340gSubstitutions: On",
      "Tesco Prawn Toast 8 Pack 120gSubstitutions: On",
      "\u2020 Tesco Pure Apple Juice 1 LitreSubstitutions: On",
      "\u2020 Tesco Pure Orange Juice With Bits 1 LitreSubstitutions: On",
      "Patak's Indian Garlic & Coriander Mini Naan Breads 4 PackSubstitutions: On",
      "Tesco Maris Piper Potatoes 2KgSubstitutions: On",
      "De Cecco Penne Rigate 500GSubstitutions: On",
      "De Cecco Conchiglie Rigate 500gSubstitutions: On",
      "Old El Paso Crunchy Taco Shells X12 156GSubstitutions: On",
      "Old El Paso Cheesy Baked Enchilada Kit 663GSubstitutions: On",
      "Tesco Carrots 1KgSubstitutions: On",
      "\u2020 Tesco Apple And Mango From Concentrate 1 LitreSubstitutions: On",
      "Hovis Best of Both Medium Bread 800gSubstitutions: On",
      "Loyd Grossman Flame Baked Pizza Bases 2 Pack 220GSubstitutions: On"
    ]
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
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco British Beef Medium Roasting Joint 1KGSubstitutions: On",
        "name": "Tesco British Beef Medium Roasting Joint 1KGSubstitutions: On",
        "quantity": 1,
        "price": 15.0
      },
      {
        "ingredient": "Tesco 4 Smash Burger 340gSubstitutions: On",
        "name": "Tesco 4 Smash Burger 340gSubstitutions: On",
        "quantity": 1,
        "price": 3.5
      },
      {
        "ingredient": "Tesco Maris Piper Potatoes 2KgSubstitutions: On",
        "name": "Tesco Maris Piper Potatoes 2KgSubstitutions: On",
        "quantity": 1,
        "price": 1.8
      },
      {
        "ingredient": "Tesco Carrots 1KgSubstitutions: On",
        "name": "Tesco Carrots 1KgSubstitutions: On",
        "quantity": 1,
        "price": 0.69
      }
    ],
    "missingItems": [
      "Yamas Authentic Greek Feta Pdo 150GSubstitutions: On",
      "Tesco Chicken & Vegetable Soup 600gSubstitutions: On",
      "Tesco 4 Vegetable Spring Rolls 144gSubstitutions: On",
      "Tesco Green Seedless Grapes Pack 500GSubstitutions: On",
      "Gressingham Aromatic Half Duck 570GSubstitutions: On",
      "Tesco Prawn Toast 8 Pack 120gSubstitutions: On",
      "\u2020 Tesco Pure Apple Juice 1 LitreSubstitutions: On",
      "\u2020 Tesco Pure Orange Juice With Bits 1 LitreSubstitutions: On",
      "Patak's Indian Garlic & Coriander Mini Naan Breads 4 PackSubstitutions: On",
      "De Cecco Penne Rigate 500GSubstitutions: On",
      "De Cecco Conchiglie Rigate 500gSubstitutions: On",
      "Old El Paso Crunchy Taco Shells X12 156GSubstitutions: On",
      "Old El Paso Cheesy Baked Enchilada Kit 663GSubstitutions: On",
      "\u2020 Lenor In-Wash Scent Booster Gold Orchid 735gSubstitutions: On",
      "\u2020 Tesco Apple And Mango From Concentrate 1 LitreSubstitutions: On",
      "Hovis Best of Both Medium Bread 800gSubstitutions: On",
      "Loyd Grossman Flame Baked Pizza Bases 2 Pack 220GSubstitutions: On"
    ]
  },
  {
    "meal": {
      "id": "6gqRfq2F877Wq4j9",
      "content": "Chicken (frozen), sliced potatoes (frozen) and frozen veg",
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
        "ingredient": "Tesco Chicken & Vegetable Soup 600gSubstitutions: On",
        "name": "Tesco Chicken & Vegetable Soup 600gSubstitutions: On",
        "quantity": 1,
        "price": 1.5
      },
      {
        "ingredient": "Tesco 4 Vegetable Spring Rolls 144gSubstitutions: On",
        "name": "Tesco 4 Vegetable Spring Rolls 144gSubstitutions: On",
        "quantity": 1,
        "price": 1.8
      },
      {
        "ingredient": "Tesco Maris Piper Potatoes 2KgSubstitutions: On",
        "name": "Tesco Maris Piper Potatoes 2KgSubstitutions: On",
        "quantity": 1,
        "price": 1.8
      }
    ],
    "missingItems": [
      "Yamas Authentic Greek Feta Pdo 150GSubstitutions: On",
      "Tesco British Beef Medium Roasting Joint 1KGSubstitutions: On",
      "Tesco Green Seedless Grapes Pack 500GSubstitutions: On",
      "Gressingham Aromatic Half Duck 570GSubstitutions: On",
      "Tesco 4 Smash Burger 340gSubstitutions: On",
      "Tesco Prawn Toast 8 Pack 120gSubstitutions: On",
      "\u2020 Tesco Pure Apple Juice 1 LitreSubstitutions: On",
      "\u2020 Tesco Pure Orange Juice With Bits 1 LitreSubstitutions: On",
      "Patak's Indian Garlic & Coriander Mini Naan Breads 4 PackSubstitutions: On",
      "De Cecco Penne Rigate 500GSubstitutions: On",
      "De Cecco Conchiglie Rigate 500gSubstitutions: On",
      "Old El Paso Crunchy Taco Shells X12 156GSubstitutions: On",
      "Old El Paso Cheesy Baked Enchilada Kit 663GSubstitutions: On",
      "Tesco Carrots 1KgSubstitutions: On",
      "\u2020 Lenor In-Wash Scent Booster Gold Orchid 735gSubstitutions: On",
      "\u2020 Tesco Apple And Mango From Concentrate 1 LitreSubstitutions: On",
      "Hovis Best of Both Medium Bread 800gSubstitutions: On",
      "Loyd Grossman Flame Baked Pizza Bases 2 Pack 220GSubstitutions: On"
    ]
  },
  {
    "meal": {
      "id": "6gqRg2GhVJPvxxch",
      "content": "Steak, sliced potatoes (frozen), frozen veg",
      "date": "2026-06-15",
      "labels": [
        "adults"
      ],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "partial",
    "coverageScore": 50,
    "matchedItems": [
      {
        "ingredient": "Tesco 4 Vegetable Spring Rolls 144gSubstitutions: On",
        "name": "Tesco 4 Vegetable Spring Rolls 144gSubstitutions: On",
        "quantity": 1,
        "price": 1.8
      },
      {
        "ingredient": "Tesco Maris Piper Potatoes 2KgSubstitutions: On",
        "name": "Tesco Maris Piper Potatoes 2KgSubstitutions: On",
        "quantity": 1,
        "price": 1.8
      }
    ],
    "missingItems": [
      "Yamas Authentic Greek Feta Pdo 150GSubstitutions: On",
      "Tesco Chicken & Vegetable Soup 600gSubstitutions: On",
      "Tesco British Beef Medium Roasting Joint 1KGSubstitutions: On",
      "Tesco Green Seedless Grapes Pack 500GSubstitutions: On",
      "Gressingham Aromatic Half Duck 570GSubstitutions: On",
      "Tesco 4 Smash Burger 340gSubstitutions: On",
      "Tesco Prawn Toast 8 Pack 120gSubstitutions: On",
      "\u2020 Tesco Pure Apple Juice 1 LitreSubstitutions: On",
      "\u2020 Tesco Pure Orange Juice With Bits 1 LitreSubstitutions: On",
      "Patak's Indian Garlic & Coriander Mini Naan Breads 4 PackSubstitutions: On",
      "De Cecco Penne Rigate 500GSubstitutions: On",
      "De Cecco Conchiglie Rigate 500gSubstitutions: On",
      "Old El Paso Crunchy Taco Shells X12 156GSubstitutions: On",
      "Old El Paso Cheesy Baked Enchilada Kit 663GSubstitutions: On",
      "Tesco Carrots 1KgSubstitutions: On",
      "\u2020 Lenor In-Wash Scent Booster Gold Orchid 735gSubstitutions: On",
      "\u2020 Tesco Apple And Mango From Concentrate 1 LitreSubstitutions: On",
      "Hovis Best of Both Medium Bread 800gSubstitutions: On",
      "Loyd Grossman Flame Baked Pizza Bases 2 Pack 220GSubstitutions: On"
    ]
  },
  {
    "meal": {
      "id": "6gqRg4qVPF7WcWQ9",
      "content": "Duck pancakes, prawn toast, spring rolls",
      "date": "2026-06-16",
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
        "ingredient": "Tesco 4 Vegetable Spring Rolls 144gSubstitutions: On",
        "name": "Tesco 4 Vegetable Spring Rolls 144gSubstitutions: On",
        "quantity": 1,
        "price": 1.8
      },
      {
        "ingredient": "Tesco Green Seedless Grapes Pack 500GSubstitutions: On",
        "name": "Tesco Green Seedless Grapes Pack 500GSubstitutions: On",
        "quantity": 1,
        "price": 1.8
      },
      {
        "ingredient": "Gressingham Aromatic Half Duck 570GSubstitutions: On",
        "name": "Gressingham Aromatic Half Duck 570GSubstitutions: On",
        "quantity": 1,
        "price": 12.6
      },
      {
        "ingredient": "Tesco Prawn Toast 8 Pack 120gSubstitutions: On",
        "name": "Tesco Prawn Toast 8 Pack 120gSubstitutions: On",
        "quantity": 1,
        "price": 3.0
      },
      {
        "ingredient": "Loyd Grossman Flame Baked Pizza Bases 2 Pack 220GSubstitutions: On",
        "name": "Loyd Grossman Flame Baked Pizza Bases 2 Pack 220GSubstitutions: On",
        "quantity": 1,
        "price": 2.57
      }
    ],
    "missingItems": [
      "Yamas Authentic Greek Feta Pdo 150GSubstitutions: On",
      "Tesco Chicken & Vegetable Soup 600gSubstitutions: On",
      "Tesco British Beef Medium Roasting Joint 1KGSubstitutions: On",
      "Tesco 4 Smash Burger 340gSubstitutions: On",
      "\u2020 Tesco Pure Apple Juice 1 LitreSubstitutions: On",
      "\u2020 Tesco Pure Orange Juice With Bits 1 LitreSubstitutions: On",
      "Patak's Indian Garlic & Coriander Mini Naan Breads 4 PackSubstitutions: On",
      "Tesco Maris Piper Potatoes 2KgSubstitutions: On",
      "De Cecco Penne Rigate 500GSubstitutions: On",
      "De Cecco Conchiglie Rigate 500gSubstitutions: On",
      "Old El Paso Crunchy Taco Shells X12 156GSubstitutions: On",
      "Old El Paso Cheesy Baked Enchilada Kit 663GSubstitutions: On",
      "Tesco Carrots 1KgSubstitutions: On",
      "\u2020 Lenor In-Wash Scent Booster Gold Orchid 735gSubstitutions: On",
      "\u2020 Tesco Apple And Mango From Concentrate 1 LitreSubstitutions: On",
      "Hovis Best of Both Medium Bread 800gSubstitutions: On"
    ]
  }
];













































































































































































































































































































