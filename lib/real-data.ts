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
  "delivery_date": "2026-04-24",
  "delivery_sort": "",
  "order_number": "9021-8754-78",
  "order_total": 6.2,
  "items": [
    {
        "name": "Tesco British Whole Milk 1.13L, 2 Pints",
        "quantity": 1,
        "price": 1.2
    },
    {
        "name": "Wild Juicy Mango 0% Aluminium Deodorant Refill 40g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Wild Natural Deodorant Refill - Coconut & Vanilla 40g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Activia Rhubarb Gut Health Yoghurt Multipack 4x115g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco British Whole Milk 568Ml, 1 Pint",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Cheese and Garlic Flatbread 230g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Large Chicken Fillet Pack 1.6Kg",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Birds Eye Steamfresh Asian Style Rice 380g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Birds Eye Steamfresh Korean Style Noodles 350g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "McCain Home Chips Crinkle Cut 1.6kg",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Cadbury Dairy Milk Chocolate Bar 180g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Crosta & Mollica Parmesan & Poppyseed Torinesi 120G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Doritos Chilli Heatwave Tortilla Chips Multipack Crisps 5x30g",
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
        "name": "Jammie Dodgers Biscuits 140G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 McCoy's Classic Variety Multipack Crisps 6x25g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 McCoy's Flame Grilled Steak Multipack Crisps 6x25g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Polli Capers in Vinegar Capotes 190g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Ryvita Multiseed Thins 125G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Soft & Gentle Antiperspirant Deodorant Fresh Blossom Roll On 50Ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Tesco Apple & Elderflower Sparkling Water 1 Litre",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Pink & White Mini Marshmallows 100G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco White Iced Ring Doughnuts 4 Pack",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Innocent Super Smoothie Blue Spark, Guava & Pineapple 750ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "New Covent Garden Soup Co Chicken & Sweetcorn 560g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Aioli Dip 200G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Bacon Lettuce & Tom Sandwich",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Blackberries 250G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Blueberries 500G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Boneless Salmon Fillets 4 Pack 520g",
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
        "name": "Tesco Guacamole 163g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Party Salad 455G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Smoky Bacon Sarnie - Tangy Ketchup",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Strawberries 400G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Tzatziki Dip 200G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Cirio Double Concentrate Puree 4 Pack 70G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Doritos Mild Salsa Dip 300g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Dr Pepper Regular 500 M",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Graze Smoky Barbecue Crunch 100g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Hovis Best of Both Medium Bread 800g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Maoam Bloxx 4 Pack 88G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 McCoy's Flame Grilled Steak Multipack Crisps 6x25g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Pepsi Max Cherry No Sugar Cola Bottle 500ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco All Rounder Potatoes 2Kg",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Tesco Finest Crinkle Cut Roast Beef & Horseradish Flavour Hand Cooked Crisps 150g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Finest Sweet Easy Peelers 600g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Frosted Flakes Cereal 500G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Lightly Salted Tortilla Chips 200g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Thornbridge Jaipur Ipa 4X330ml Can",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Warburtons White Sandwich Bread Thins 6 Pack",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Actimel Immune Support Live Yoghurt Drink - Multifruit 8x100g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Activia Rhubarb Gut Health Yoghurt Multipack 4x115g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Flora Buttery Spread with Natural Ingredients 1KG",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Innocent Wonder Green Juice 750Ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "La Famiglia Rana Tuscan Ragu Pappardelle 814g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Old Amsterdam Mature Gouda Cheese 150g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Cheese and Garlic Flatbread 230g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Finest Smoked Vintage Red Fox 200g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Garlic Scottish Mussels 500G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Perfectly Ripe Plums 325G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Vintage Red Fox Cheese 200G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Yazoo Chocolate Milkshake 1 Litre Bottle",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Haagen-Dazs Ice Cream - Strawberries & Cream 460ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Corsodyl Intensive Gum Repair White & Polish Toothpaste 75ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "De Cecco Spaghetti 500G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Go Ahead Yogurt Breaks - Forest Fruit 4 x 35.5g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Hayden's 4 Delicious Yum Yums",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Lucozade Sport Drink Blue Force 4x500ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 McCoy's Classic Variety Multipack Crisps 6x25g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 McCoy's Flame Grilled Steak Multipack Crisps 6x25g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Snack Organisation Sweet Chilli Cracker 100G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Tesco Apple & Elderflower Sparkling Water 1 Litre",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Tiger Baton",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco White Iced Ring Doughnuts 4 Pack",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Activia Rhubarb & Mixed Fruit Low Fat Gut Health Yoghurt Multipack 8x115g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Blackberries 250G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Celery",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Cheddar Mash 450G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Cheese & Bacon En Croute 410G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Iceberg Lettuce 200G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Red Seedless Grapes 500G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Birds Eye Steamfresh Family Favourite Mix 540g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Haagen-Dazs Ice Cream - Strawberries & Cream 460ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Curly Fries 700G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "De Cecco Conchiglie Rigate 500g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Doritos Mild Salsa Dip 300g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Large Braeburn Apples Loose Class 1 0.189KG",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Propercorn Sweet & Salty Popcorn 6X14g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Radnor Splash Apple & Raspberry 3 X 250Ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Radnor Splash Orange & Passion Fruit 3X250ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco American Pancake Shaker Mix With Chocolate Chips 155G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Baby Plum Tomatoes 300G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Golden Syrup 680G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Pancake Shaker Traditional Mix 155G",
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
    "content": "Mash and cheese",
    "date": "2026-04-24",
    "labels": [],
    "section": "Planned",
    "meal_type": "lunch"
  },
  {
    "id": "",
    "content": "Tuscan Ragu pappardelle",
    "date": "2026-04-24",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "chicken / garlic bread and chips",
    "date": "2026-04-24",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Tony and Barbara cooking",
    "date": "2026-04-25",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Steak with peppercorn, salad, curly fries",
    "date": "2026-04-26",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Chicken omelette (Terina)",
    "date": "2026-04-27",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "Toastie",
    "date": "2026-04-27",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  },
  {
    "id": "",
    "content": "KFC",
    "date": "2026-04-28",
    "labels": [],
    "section": "Planned",
    "meal_type": "dinner"
  }
];




























































































































































// Transform and export
export const realReceipt = transformCachedOrder(realLatestOrder);

export const realMealsCheckSummary = {
  "order_total": 6.2,
  "delivery_date": "2026-04-24",
  "meals_covered": 4,
  "meals_total": 7,
  "unmatched_groceries": 0,
  "coverage_percentage": 57,
  "day_coverage": [
    {
      "date": "2026-04-24",
      "status": "delivery",
      "is_delivery_day": true
    },
    {
      "date": "2026-04-25",
      "status": "covered",
      "is_delivery_day": false
    },
    {
      "date": "2026-04-26",
      "status": "covered",
      "is_delivery_day": false
    },
    {
      "date": "2026-04-27",
      "status": "covered",
      "is_delivery_day": false
    },
    {
      "date": "2026-04-28",
      "status": "delivery",
      "is_delivery_day": true
    },
    {
      "date": "2026-04-29",
      "status": "gap",
      "is_delivery_day": false
    },
    {
      "date": "2026-04-30",
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
      "content": "Mash and cheese",
      "date": "2026-04-24",
      "labels": [],
      "section": "Planned",
      "meal_type": "lunch"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "McCain Home Chips Crinkle Cut 1.6kg",
        "name": "McCain Home Chips Crinkle Cut 1.6kg",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Doritos Chilli Heatwave Tortilla Chips Multipack Crisps 5x30g",
        "name": "Doritos Chilli Heatwave Tortilla Chips Multipack Crisps 5x30g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco All Rounder Potatoes 2Kg",
        "name": "Tesco All Rounder Potatoes 2Kg",
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
        "ingredient": "Tesco Lightly Salted Tortilla Chips 200g",
        "name": "Tesco Lightly Salted Tortilla Chips 200g",
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
        "ingredient": "Tesco Cheddar Mash 450G",
        "name": "Tesco Cheddar Mash 450G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco American Pancake Shaker Mix With Chocolate Chips 155G",
        "name": "Tesco American Pancake Shaker Mix With Chocolate Chips 155G",
        "quantity": 1,
        "price": 0.0
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Tuscan Ragu pappardelle",
      "date": "2026-04-24",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "La Famiglia Rana Tuscan Ragu Pappardelle 814g",
        "name": "La Famiglia Rana Tuscan Ragu Pappardelle 814g",
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
      "date": "2026-04-24",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Large Chicken Fillet Pack 1.6Kg",
        "name": "Tesco Large Chicken Fillet Pack 1.6Kg",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "McCain Home Chips Crinkle Cut 1.6kg",
        "name": "McCain Home Chips Crinkle Cut 1.6kg",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Doritos Chilli Heatwave Tortilla Chips Multipack Crisps 5x30g",
        "name": "Doritos Chilli Heatwave Tortilla Chips Multipack Crisps 5x30g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "New Covent Garden Soup Co Chicken & Sweetcorn 560g",
        "name": "New Covent Garden Soup Co Chicken & Sweetcorn 560g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "name": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco All Rounder Potatoes 2Kg",
        "name": "Tesco All Rounder Potatoes 2Kg",
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
        "ingredient": "Tesco Lightly Salted Tortilla Chips 200g",
        "name": "Tesco Lightly Salted Tortilla Chips 200g",
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
        "ingredient": "Tesco Cheddar Mash 450G",
        "name": "Tesco Cheddar Mash 450G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco American Pancake Shaker Mix With Chocolate Chips 155G",
        "name": "Tesco American Pancake Shaker Mix With Chocolate Chips 155G",
        "quantity": 1,
        "price": 0.0
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Tony and Barbara cooking",
      "date": "2026-04-25",
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
      "content": "Steak with peppercorn, salad, curly fries",
      "date": "2026-04-26",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "\u2020 McCoy's Flame Grilled Steak Multipack Crisps 6x25g",
        "name": "\u2020 McCoy's Flame Grilled Steak Multipack Crisps 6x25g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "\u2020 Dr Pepper Regular 500 M",
        "name": "\u2020 Dr Pepper Regular 500 M",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "\u2020 Tesco Finest Crinkle Cut Roast Beef & Horseradish Flavour Hand Cooked Crisps 150g",
        "name": "\u2020 Tesco Finest Crinkle Cut Roast Beef & Horseradish Flavour Hand Cooked Crisps 150g",
        "quantity": 1,
        "price": 0.0
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Chicken omelette (Terina)",
      "date": "2026-04-27",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Large Chicken Fillet Pack 1.6Kg",
        "name": "Tesco Large Chicken Fillet Pack 1.6Kg",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "New Covent Garden Soup Co Chicken & Sweetcorn 560g",
        "name": "New Covent Garden Soup Co Chicken & Sweetcorn 560g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "name": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "quantity": 1,
        "price": 0.0
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "Toastie",
      "date": "2026-04-27",
      "labels": [],
      "section": "Planned",
      "meal_type": "dinner"
    },
    "status": "covered",
    "coverageScore": 100,
    "matchedItems": [
      {
        "ingredient": "Tesco Cheese and Garlic Flatbread 230g",
        "name": "Tesco Cheese and Garlic Flatbread 230g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Hovis Best of Both Medium Bread 800g",
        "name": "Hovis Best of Both Medium Bread 800g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Warburtons White Sandwich Bread Thins 6 Pack",
        "name": "Warburtons White Sandwich Bread Thins 6 Pack",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Old Amsterdam Mature Gouda Cheese 150g",
        "name": "Old Amsterdam Mature Gouda Cheese 150g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Vintage Red Fox Cheese 200G",
        "name": "Vintage Red Fox Cheese 200G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Cheese & Bacon En Croute 410G",
        "name": "Tesco Cheese & Bacon En Croute 410G",
        "quantity": 1,
        "price": 0.0
      }
    ],
    "missingItems": []
  },
  {
    "meal": {
      "id": "",
      "content": "KFC",
      "date": "2026-04-28",
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
  }
];












































































































































