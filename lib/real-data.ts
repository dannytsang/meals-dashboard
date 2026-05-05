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
        "name": "\u2020 Innocent Berry Set Go Juice 750Ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Innocent Plus Blue Bolt Guava & Lime Juice with Vitamins 750ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco 2 Skinless & Boneless Basa Fillets 250G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco 2 Skinless Smoked Basa Fillets 240G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Egg Noodles 300G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Stonebaked Classic Margherita Pizza 306g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Sweet Chilli Stir Fry Sauce 165g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Haagen-Dazs Ice Cream - Strawberries & Cream 460ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 FREE SAMPLE - Coca-Cola Zero Caffeine Zero Sugar 330ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Hayden's 4 Delicious Yum Yums",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Hovis Best of Both Medium Bread 800g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Large Gala Apples Loose Class 1 0.193KG",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Pringles Sour Cream & Onion Sharing Crisps 185g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Tesco Apple & Elderflower Sparkling Water 1 Litre",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Bananas Loose 0.167KG",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Chocolate Iced Ring Doughnuts 4 Pack",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Oranges Each",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Blueberries 150G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Actimel Immune Support Multifruit Yogurt Drink 12 x 100g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Activia Rhubarb Gut Health Yoghurt Multipack 4x115g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Bay Fishmongers Salmon 0.464KG",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Fire Pit 2 Minted Lamb Leg Steaks 250g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Noel Sliced Tapas Selection 120G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco British Whole Milk 568Ml, 1 Pint",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Firepit 6 Minted Lamb Kebabs 360g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Fresh Mashed Potato 800G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Garlic & Cheese Mushrooms 200g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Honey Roast Ham Slices 400g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Lamb Diced Leg 300G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Perfectly Ripe Plums 325G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Potato Slices 350G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Red Seedless Grapes 500G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Unsmoked Gammon Joint 750G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Chicago Town Deep Dish Pepperoni Pizzas 2 X 155G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Itsu Pork Gyozas 240G",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco 10 Prawn Kushiyaki Skewers 180g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco 8 Prawn Bao Buns 256g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Belazu Rosemary Snack Mix 120g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Belazu Truffle & Pecorino Nut Mix 135g",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 FREE SAMPLE - Coca-Cola Zero Caffeine Zero Sugar 330ml",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Tesco Apple And Mango From Concentrate 1 Litre",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Finest Pink Lady Apple 4 Pack",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "\u2020 Tesco Pure Orange Juice With Bits 1 Litre",
        "quantity": 1,
        "price": 0.0
    },
    {
        "name": "Tesco Seeded Large Burger Buns 4 Pack",
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
  "meals_covered": 4,
  "meals_total": 7,
  "unmatched_groceries": 10,
  "coverage_percentage": 57,
  "day_coverage": [
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
    },
    {
      "date": "2026-05-11",
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
        "ingredient": "\u2020 Dr Pepper Regular 500 M",
        "name": "\u2020 Dr Pepper Regular 500 M",
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
        "ingredient": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "name": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "quantity": null,
        "price": null
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
      },
      {
        "ingredient": "Tesco Sweet Chilli Stir Fry Sauce 165g",
        "name": "Tesco Sweet Chilli Stir Fry Sauce 165g",
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
        "ingredient": "\u2020 Pringles Sour Cream & Onion Sharing Crisps 185g",
        "name": "\u2020 Pringles Sour Cream & Onion Sharing Crisps 185g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Baking Potatoes 2kg",
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Fire Pit 2 Minted Lamb Leg Steaks 250g",
        "name": "Fire Pit 2 Minted Lamb Leg Steaks 250g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "name": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Firepit 6 Minted Lamb Kebabs 360g",
        "name": "Tesco Firepit 6 Minted Lamb Kebabs 360g",
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
        "ingredient": "Tesco Honey Roast Ham Slices 400g",
        "name": "Tesco Honey Roast Ham Slices 400g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Lamb Diced Leg 300G",
        "name": "Tesco Lamb Diced Leg 300G",
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
        "ingredient": "Chicago Town Deep Dish Pepperoni Pizzas 2 X 155G",
        "name": "Chicago Town Deep Dish Pepperoni Pizzas 2 X 155G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.0
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
        "ingredient": "\u2020 Dr Pepper Regular 500 M",
        "name": "\u2020 Dr Pepper Regular 500 M",
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
        "ingredient": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "name": "Tesco Fire Pit Hot Honey Pork Belly Slices 400G",
        "quantity": null,
        "price": null
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
      },
      {
        "ingredient": "Tesco Sweet Chilli Stir Fry Sauce 165g",
        "name": "Tesco Sweet Chilli Stir Fry Sauce 165g",
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
        "ingredient": "\u2020 Pringles Sour Cream & Onion Sharing Crisps 185g",
        "name": "\u2020 Pringles Sour Cream & Onion Sharing Crisps 185g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Baking Potatoes 2kg",
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Fire Pit 2 Minted Lamb Leg Steaks 250g",
        "name": "Fire Pit 2 Minted Lamb Leg Steaks 250g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "name": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Firepit 6 Minted Lamb Kebabs 360g",
        "name": "Tesco Firepit 6 Minted Lamb Kebabs 360g",
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
        "ingredient": "Tesco Honey Roast Ham Slices 400g",
        "name": "Tesco Honey Roast Ham Slices 400g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Lamb Diced Leg 300G",
        "name": "Tesco Lamb Diced Leg 300G",
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
        "ingredient": "Chicago Town Deep Dish Pepperoni Pizzas 2 X 155G",
        "name": "Chicago Town Deep Dish Pepperoni Pizzas 2 X 155G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.0
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
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Chicago Town Deep Dish Pepperoni Pizzas 2 X 155G",
        "name": "Chicago Town Deep Dish Pepperoni Pizzas 2 X 155G",
        "quantity": 1,
        "price": 0.0
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
      },
      {
        "ingredient": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Baking Potatoes 2kg",
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "name": "Tesco Fire Pit 10 Smash Beef Burger 850g",
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
        "ingredient": "Tesco Honey Roast Ham Slices 400g",
        "name": "Tesco Honey Roast Ham Slices 400g",
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
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.0
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
        "ingredient": "Tesco Beef Lasagne 1.5Kg",
        "name": "Tesco Beef Lasagne 1.5Kg",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "THE GYM KITCHEN FOOD TO FUEL CHICKEN CARBONARA PASTA 400G",
        "name": "THE GYM KITCHEN FOOD TO FUEL CHICKEN CARBONARA PASTA 400G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "De Cecco Spaghetti 500G",
        "name": "De Cecco Spaghetti 500G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Egg Noodles 300G",
        "name": "Tesco Egg Noodles 300G",
        "quantity": 1,
        "price": 0.0
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
        "ingredient": "Tesco Cheese & Bacon En Croute 410G",
        "name": "Tesco Cheese & Bacon En Croute 410G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco American Pancake Shaker Mix With Chocolate Chips 155G",
        "name": "Tesco American Pancake Shaker Mix With Chocolate Chips 155G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814g",
        "name": "La Famiglia Rana Spicy Pork & 'Nduja Fettuccine 814g",
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
        "ingredient": "Tesco Baking Potatoes 2kg",
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "name": "Tesco Fire Pit 10 Smash Beef Burger 850g",
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
        "ingredient": "Tesco Honey Roast Ham Slices 400g",
        "name": "Tesco Honey Roast Ham Slices 400g",
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
        "ingredient": "Tesco Unsmoked Gammon Joint 750G",
        "name": "Tesco Unsmoked Gammon Joint 750G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Itsu Pork Gyozas 240G",
        "name": "Itsu Pork Gyozas 240G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.0
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
        "ingredient": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "name": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "quantity": null,
        "price": null
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
      },
      {
        "ingredient": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Baking Potatoes 2kg",
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "name": "Tesco Fire Pit 10 Smash Beef Burger 850g",
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
        "ingredient": "Tesco Honey Roast Ham Slices 400g",
        "name": "Tesco Honey Roast Ham Slices 400g",
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
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.0
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
        "ingredient": "Tesco Beef Lasagne 1.5Kg",
        "name": "Tesco Beef Lasagne 1.5Kg",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "THE GYM KITCHEN FOOD TO FUEL CHICKEN CARBONARA PASTA 400G",
        "name": "THE GYM KITCHEN FOOD TO FUEL CHICKEN CARBONARA PASTA 400G",
        "quantity": null,
        "price": null
      },
      {
        "ingredient": "De Cecco Spaghetti 500G",
        "name": "De Cecco Spaghetti 500G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "name": "Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Egg Noodles 300G",
        "name": "Tesco Egg Noodles 300G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Fire Pit 2 Minted Lamb Leg Steaks 250g",
        "name": "Fire Pit 2 Minted Lamb Leg Steaks 250g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Firepit 6 Minted Lamb Kebabs 360g",
        "name": "Tesco Firepit 6 Minted Lamb Kebabs 360g",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Lamb Diced Leg 300G",
        "name": "Tesco Lamb Diced Leg 300G",
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
        "ingredient": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "name": "\u2020 Swizzels Drumsticks Squashies Original Bag 60G",
        "quantity": null,
        "price": null
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
      },
      {
        "ingredient": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "name": "Bannisters Farm 4 Cheese & Bacon Potato Skins 260G",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Baking Potatoes 2kg",
        "name": "Tesco Baking Potatoes 2kg",
        "quantity": 1,
        "price": 0.0
      },
      {
        "ingredient": "Tesco Fire Pit 10 Smash Beef Burger 850g",
        "name": "Tesco Fire Pit 10 Smash Beef Burger 850g",
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
        "ingredient": "Tesco Honey Roast Ham Slices 400g",
        "name": "Tesco Honey Roast Ham Slices 400g",
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
        "ingredient": "Tesco Baby Potatoes 1Kg",
        "name": "Tesco Baby Potatoes 1Kg",
        "quantity": 1,
        "price": 0.0
      }
    ],
    "missingItems": []
  }
];



































































































































































