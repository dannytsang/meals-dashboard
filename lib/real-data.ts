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
        "name": "\u2020 Dr Pepper Regular 500 M",
        "quantity": 2,
        "price": 2.83
    },
    {
        "name": "\u2020 Keep It Handy Assorted Plasters Pack 42pk",
        "quantity": 2,
        "price": 2.0
    },
    {
        "name": "\u2020 Kind Protein Caramel Nut 50g",
        "quantity": 1,
        "price": 1.08
    },
    {
        "name": "\u2020 Maoam Bloxx 4 Pack 88G",
        "quantity": 1,
        "price": 0.49
    },
    {
        "name": "\u2020 McCoy's Flame Grilled Steak Multipack Crisps 6x25g",
        "quantity": 3,
        "price": 5.25
    },
    {
        "name": "McVitie's Jaffa Cakes - Hot Honey Flavour 10 Pack",
        "quantity": 1,
        "price": 0.75
    },
    {
        "name": "Nescafe Dolce Gusto Kit Kat Cocoa Beverage Pods x16 256g",
        "quantity": 2,
        "price": 7.5
    },
    {
        "name": "\u2020 Pringles Salt & Vinegar Sharing Crisps 165g",
        "quantity": 1,
        "price": 1.75
    },
    {
        "name": "\u2020 Skinny Whip Double Chocolate Nougat Bars 5 x 20g",
        "quantity": 1,
        "price": 0.95
    },
    {
        "name": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
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
        "name": "Cadbury Dairy Milk &More Lotus Biscoff Chocolate Bar 195g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Cadbury Dairy Milk Chocolate Bar 180g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Chicken Bacon & Lettuce Sandwich",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Walkers Wotsits Cheese Multipack Crisps 6x16.5g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Walkers Quavers Cheese Multipack Crisps 6x16g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Charlie Bigham's Sweet & Sour Pork with Jasmine Rice 750g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Creamfields Mature Grated Cheddar 250g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "La Famiglia Rana Arrabbiata Fresh Sauce 200g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "La Famiglia Rana Caramelised Garlic & Pecorino Flatbread 183g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "La Famiglia Rana Spinach & Ricotta Ravioli 250g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Broccoli Loose 0.301KG",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Garlic Flatbread 225g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Iceberg Lettuce 200G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Bisto Favourite Gravy Granules 450g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Growers Harvest Apple Juice From Concentrate 6 X 200Ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Growers Harvest Orange Juice From Concentrate 6 X 200Ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Hayden's 4 Delicious Yum Yums",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Pringles Original Sharing Crisps 185g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Pringles Sour Cream & Onion Sharing Crisps 185g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Pringles Sour Cream & Onion Snacking Crisps 40G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Baby Plum Tomatoes 300G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Brown Onions 3 Pack",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco White Iced Ring Doughnuts 4 Pack",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Whole Large Cucumber",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Potato Slices 350G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Baby Potatoes With Herb Butter 400g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Raspberries 250G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Rosedene Farms Raspberries 125G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Activia Rhubarb Gut Health Yoghurt Multipack 4x115g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Beef Steaks with Peppercorn Sauce 320g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Blueberries 250G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco British Whole Milk 1.13L, 2 Pints",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Cheddar Mash 450G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Cherry Punnet Large 400G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Crackling Pork Loin Joint 637G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Finest Beef Dripping Roast Potatoes 800G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Fire Pit 6 Bbq Maple Pork Loin Steaks 600G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Fresh Mashed Potato 800G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Lightly Dusted Cod Fillets 255G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Tesco Pineapple Paradise Fruit Smoothie 750Ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Red Seedless Grapes 500G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Cadbury Dairy Milk &More Lotus Biscoff Chocolate Bar 195g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Go Ahead Strawberry Fruit Yogurt Breaks Snack Bars Multipack 4 x 35.5g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Gogo Squeez Fruit Snack Apple Mango 4X90g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Gogo Squeez Fruit Snack Apple Strawberry 4X90g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Nightingale Farms Cherry Tomatoes 250G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Tesco Finest Crinkle Cut Roast Beef & Horseradish Flavour Hand Cooked Crisps 150g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Hot Cross Buns 6 pack",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Pink Lady Apples 5 Pack",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Tesco Pure Orange Juice With Bits 1 Litre",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Soft White Hot Dog Rolls 6 Pack",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Sweet Easy Peelers 600g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Tuna Chunks In Brine 4 X 145G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Walkers Wotsits Cheese Multipack Crisps 12x16.5g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Pringles Sour Cream & Onion Sharing Crisps 185g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Pringles Sour Cream & Onion Sharing Crisps 165g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Activia Rhubarb Gut Health Yoghurt Multipack 4x115g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco White Wine Scottish Mussels 500G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Birds Eye Steamfresh Family Favourite Mix 540g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Go Ahead Strawberry Fruit Yogurt Breaks Snack Bars Multipack 4 x 35.5g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Go Ahead Yogurt Breaks - Forest Fruit 4 x 35.5g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Gogo Squeez Fruit Snack Apple Mango 4X90g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "H.W. Nevill's Part Baked White Baguette 2 Pack",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 HARIBO Sour Goldbears 175g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Hayden's 4 Delicious Yum Yums",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Keep It Handy Click Seal Snack Bags 50pk",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Pringles Original Sharing Crisps 185g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Swizzels Squashies Love Hearts 140g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Tesco Apple & Elderflower Sparkling Water 1 Litre",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco White Iced Ring Doughnuts 4 Pack",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Walkers Wotsits Cheese Multipack Crisps 12x16.5g",
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
    "content": "Mussels and part baked bread",
    "date": "2026-05-22",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "chicken / garlic bread and chips",
    "date": "2026-05-22",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Terina, Leo and Ashlee out",
    "date": "2026-05-23",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  }
];




























































































































































































































































// Transform and export
export const realReceipt = transformCachedOrder(realLatestOrder);

export const realMealsCheckSummary = {
  "order_total": 46.2,
  "delivery_date": "2026-05-22",
  "meals_covered": 1,
  "meals_total": 7,
  "unmatched_groceries": 0,
  "coverage_percentage": 14,
  "day_coverage": [
    {
      "date": "2026-05-22",
      "status": "delivery",
      "is_delivery_day": true
    },
    {
      "date": "2026-05-23",
      "status": "missing",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-24",
      "status": "gap",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-25",
      "status": "gap",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-26",
      "status": "gap",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-27",
      "status": "gap",
      "is_delivery_day": false
    },
    {
      "date": "2026-05-28",
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
      "content": "Mussels and part baked bread",
      "date": "2026-05-22",
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
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Potato Slices 350G",
        "name": "Tesco Potato Slices 350G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Baby Potatoes With Herb Butter 400g",
        "name": "Tesco Baby Potatoes With Herb Butter 400g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Cheddar Mash 450G",
        "name": "Tesco Cheddar Mash 450G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Finest Beef Dripping Roast Potatoes 800G",
        "name": "Tesco Finest Beef Dripping Roast Potatoes 800G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Fresh Mashed Potato 800G",
        "name": "Tesco Fresh Mashed Potato 800G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Lightly Dusted Cod Fillets 255G",
        "name": "Tesco Lightly Dusted Cod Fillets 255G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "\u2020 Tesco Finest Crinkle Cut Roast Beef & Horseradish Flavour Hand Cooked Crisps 150g",
        "name": "\u2020 Tesco Finest Crinkle Cut Roast Beef & Horseradish Flavour Hand Cooked Crisps 150g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Tuna Chunks In Brine 4 X 145G",
        "name": "Tesco Tuna Chunks In Brine 4 X 145G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "name": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco White Wine Scottish Mussels 500G",
        "name": "Tesco White Wine Scottish Mussels 500G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "H.W. Nevill's Part Baked White Baguette 2 Pack",
        "name": "H.W. Nevill's Part Baked White Baguette 2 Pack",
        "quantity": 1,
        "price": 0.0
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "chicken / garlic bread and chips",
      "date": "2026-05-22",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco The Chicken Club Sandwich",
        "name": "Tesco The Chicken Club Sandwich",
        "quantity": 1,
        "price": 1.45
      },
      {
        "ingredient": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "name": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "quantity": 1,
        "price": 0.53
      },
      {
        "ingredient": "Tesco Chicken Bacon & Lettuce Sandwich",
        "name": "Tesco Chicken Bacon & Lettuce Sandwich",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Potato Slices 350G",
        "name": "Tesco Potato Slices 350G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Baby Potatoes With Herb Butter 400g",
        "name": "Tesco Baby Potatoes With Herb Butter 400g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Cheddar Mash 450G",
        "name": "Tesco Cheddar Mash 450G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Finest Beef Dripping Roast Potatoes 800G",
        "name": "Tesco Finest Beef Dripping Roast Potatoes 800G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Fresh Mashed Potato 800G",
        "name": "Tesco Fresh Mashed Potato 800G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "\u2020 Tesco Finest Crinkle Cut Roast Beef & Horseradish Flavour Hand Cooked Crisps 150g",
        "name": "\u2020 Tesco Finest Crinkle Cut Roast Beef & Horseradish Flavour Hand Cooked Crisps 150g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "name": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "H.W. Nevill's Part Baked White Baguette 2 Pack",
        "name": "H.W. Nevill's Part Baked White Baguette 2 Pack",
        "quantity": 1,
        "price": 0.0
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Terina, Leo and Ashlee out",
      "date": "2026-05-23",
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












































































































































































































































