/**
 * Product Database for Tesco Items
 * Contains product information for items in the order
 */

export interface ProductInfo {
  name: string;
  description: string;
  storage: string;
  preparation: string;
  image: string;
  nutrition: string;
}

export const productDatabase: Record<string, ProductInfo> = {
  'activia rhubarb gut health yoghurt multipack': {
    name: 'Activia Rhubarb Gut Health Yoghurt Multipack 4x115g',
    description: 'Activia Rhubarb Gut Health Yoghurt Multipack with probiotic cultures. Delicious creamy yoghurt with a tangy rhubarb flavour.',
    storage: 'Keep refrigerated between +1°C and +6°C max. Consume within 5 days of opening.',
    preparation: 'Suitable for cold consumption. Do not freeze.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/9f9e2405-66e3-44cb-beeb-3289c45dec19/7890d7f5-5d13-4645-804d-b5ed1c7b3ca3.jpeg?h=960&w=960',
    nutrition: 'Per 100g: Energy 71kcal, Protein 3.2g, Carbohydrates 11.5g, Fat 1.5g'
  },
  'crosta & mollica salami napoli sourdough pizza': {
    name: 'Crosta & Mollica Salami Napoli Sourdough Pizza 413g',
    description: 'Stone baked sourdough pizza topped with salami Napoli, tomato sauce and mozzarella cheese.',
    storage: 'Keep refrigerated at 4°C or below. Suitable for home freezing. Defrost thoroughly before cooking.',
    preparation: 'Remove packaging. Preheat oven to 200°C/180°C fan. Cook for 12-15 minutes until cheese is bubbling.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/7a8b9c0d-1234-5678-abcd-ef0123456789/salami-pizza.jpg',
    nutrition: 'Per 100g: Energy 245kcal, Protein 10.5g, Carbohydrates 28g, Fat 10g'
  },
  'tesco blueberries': {
    name: 'Tesco Blueberries 150G',
    description: 'Fresh British blueberries, perfect for breakfast cereals, yoghurts or as a healthy snack.',
    storage: 'Refrigerate and consume within 5 days. Wash before use.',
    preparation: 'Ready to eat. Wash thoroughly before consuming.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/blueberries/blueberries.jpg',
    nutrition: 'Per 100g: Energy 44kcal, Protein 0.7g, Carbohydrates 9g, Fat 0.3g'
  },
  'tesco strawberries': {
    name: 'Tesco Strawberries 400G',
    description: 'Juicy fresh British strawberries, perfect for desserts or as a healthy snack.',
    storage: 'Refrigerate and consume within 3 days. Do not wash until ready to eat.',
    preparation: 'Ready to eat. Remove green tops and wash before consuming.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/strawberries/strawberries.jpg',
    nutrition: 'Per 100g: Energy 33kcal, Protein 0.7g, Carbohydrates 7g, Fat 0.3g'
  },
  'tesco bananas': {
    name: 'Tesco Bananas',
    description: 'Ripe and ready to eat bananas. A great source of potassium.',
    storage: 'Store at room temperature. Best consumed within a few days.',
    preparation: 'Ready to eat. Peel and enjoy.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/bananas/bananas.jpg',
    nutrition: 'Per 100g: Energy 89kcal, Protein 1.1g, Carbohydrates 23g, Fat 0.3g'
  },
  'tesco apples': {
    name: 'Tesco Apples',
    description: 'Crisp and juicy British apples. Perfect for snacking or baking.',
    storage: 'Refrigerate to keep fresher for longer.',
    preparation: 'Ready to eat. Wash before consuming.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/apples/apples.jpg',
    nutrition: 'Per 100g: Energy 47kcal, Protein 0.3g, Carbohydrates 12g, Fat 0.1g'
  },
  'birds eye steamfresh mushroom tagliatelle': {
    name: 'Birds Eye Steamfresh Mushroom Tagliatelle with a Creamy Sauce Meal for 1 400g',
    description: 'Steamfresh pasta with mushrooms in a creamy sauce. Ready in just 5 minutes.',
    storage: 'Keep frozen at -18°C or below. Do not refreeze once thawed.',
    preparation: 'Microwave 800W: 5 mins. Full power for 4 mins 30 secs, stir, then 30 secs. Stand for 1 min.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/steamfresh/steamfresh.jpg',
    nutrition: 'Per 100g: Energy 108kcal, Protein 4.3g, Carbohydrates 15g, Fat 3.5g'
  },
  'tesco medium free range eggs 12 pack': {
    name: 'Tesco Medium Free Range Eggs 12 Pack',
    description: 'Fresh free range eggs from British farms. Great for breakfast, baking or cooking.',
    storage: 'Store in a cool, dry place. Best before date shown on packaging.',
    preparation: 'Cook thoroughly before consumption. See packaging for cooking times.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/eggs/eggs.jpg',
    nutrition: 'Per 100g: Energy 143kcal, Protein 12.5g, Carbohydrates 0.7g, Fat 10g'
  },
  'tesco all rounder potatoes': {
    name: 'Tesco All Rounder Potatoes 2Kg',
    description: 'Versatile British potatoes, perfect for mash, roast, boil or bake.',
    storage: 'Store in a cool, dark place. Do not refrigerate.',
    preparation: 'Wash and peel as required. Boil for 15-20 mins, roast for 40-45 mins at 200°C.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/potatoes/potatoes.jpg',
    nutrition: 'Per 100g: Energy 77kcal, Protein 2g, Carbohydrates 17g, Fat 0.1g'
  },
  'tesco baking potatoes': {
    name: 'Tesco Baking Potatoes 2kg',
    description: 'Large potatoes perfect for baking. Fluffy inside with a crispy skin.',
    storage: 'Store in a cool, dark place. Do not refrigerate.',
    preparation: 'Wash and prick with a fork. Bake at 200°C for 1 hour 15 mins or until tender.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/potatoes/baking-potatoes.jpg',
    nutrition: 'Per 100g: Energy 77kcal, Protein 2g, Carbohydrates 17g, Fat 0.1g'
  },
  'tesco celery': {
    name: 'Tesco Celery',
    description: 'Fresh British celery, perfect for salads, soups and snacking.',
    storage: 'Refrigerate and consume within 5 days.',
    preparation: 'Wash thoroughly before use. Can be eaten raw or cooked.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/celery/celery.jpg',
    nutrition: 'Per 100g: Energy 16kcal, Protein 0.7g, Carbohydrates 3g, Fat 0.2g'
  },
  'tesco organic celery': {
    name: 'Tesco Organic Celery',
    description: 'Fresh organic celery, grown without synthetic pesticides. Perfect for salads, soups and snacking.',
    storage: 'Refrigerate and consume within 5 days.',
    preparation: 'Wash thoroughly before use. Can be eaten raw or cooked.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/celery/organic-celery.jpg',
    nutrition: 'Per 100g: Energy 16kcal, Protein 0.7g, Carbohydrates 3g, Fat 0.2g'
  },
  'tesco iceberg lettuce': {
    name: 'Tesco Iceberg Lettuce 200G',
    description: 'Crisp and refreshing iceberg lettuce, perfect for salads and burgers.',
    storage: 'Refrigerate and consume within 5 days.',
    preparation: 'Wash thoroughly. Cut into pieces or eat whole.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/lettuce/iceberg.jpg',
    nutrition: 'Per 100g: Energy 14kcal, Protein 0.9g, Carbohydrates 2.9g, Fat 0.1g'
  },
  'tesco red peppers': {
    name: 'Tesco Red Peppers Each',
    description: 'Sweet and crunchy red peppers, perfect for salads, stir-fries or roasting.',
    storage: 'Refrigerate and consume within 7 days.',
    preparation: 'Wash before use. Remove seeds and stem. Can be eaten raw or cooked.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/peppers/red-pepper.jpg',
    nutrition: 'Per 100g: Energy 31kcal, Protein 1g, Carbohydrates 6g, Fat 0.3g'
  },
  'tesco whole cucumber': {
    name: 'Tesco Whole Cucumber Each',
    description: 'Fresh and crispy cucumber, perfect for salads, sandwiches or as a healthy snack.',
    storage: 'Refrigerate and consume within 7 days.',
    preparation: 'Wash before use. Can be eaten with or without peeling.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/cucumber/cucumber.jpg',
    nutrition: 'Per 100g: Energy 12kcal, Protein 0.6g, Carbohydrates 2g, Fat 0.1g'
  },
  'tesco baby plum tomatoes': {
    name: 'Tesco Baby Plum Tomatoes 300G',
    description: 'Sweet and flavourful baby plum tomatoes, perfect for salads or cooking.',
    storage: 'Refrigerate and consume within 7 days.',
    preparation: 'Wash before use. Eat raw or cook.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/tomatoes/baby-plum.jpg',
    nutrition: 'Per 100g: Energy 18kcal, Protein 0.9g, Carbohydrates 3.9g, Fat 0.1g'
  },
  'tesco blackberries': {
    name: 'Tesco Blackberries 250G',
    description: 'Juicy British blackberries, perfect for desserts, smoothies or as a healthy snack.',
    storage: 'Refrigerate and consume within 3 days. Wash before use.',
    preparation: 'Ready to eat. Wash thoroughly.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/blackberries/blackberries.jpg',
    nutrition: 'Per 100g: Energy 25kcal, Protein 1.4g, Carbohydrates 5g, Fat 0.4g'
  },
  'tesco raspberries': {
    name: 'Tesco Raspberries 125G',
    description: 'Sweet and delicate British raspberries, perfect for desserts or as a healthy snack.',
    storage: 'Refrigerate and consume within 2 days. Wash before use.',
    preparation: 'Ready to eat. Wash gently before consuming.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/raspberries/raspberries.jpg',
    nutrition: 'Per 100g: Energy 33kcal, Protein 1.2g, Carbohydrates 12g, Fat 0.3g'
  },
  'tesco grapes': {
    name: 'Tesco Finest Seedless Grapes',
    description: 'Sweet and juicy seedless grapes, perfect for snacking or lunchboxes.',
    storage: 'Refrigerate and consume within 7 days.',
    preparation: 'Ready to eat. Wash before consuming.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/grapes/grapes.jpg',
    nutrition: 'Per 100g: Energy 67kcal, Protein 0.6g, Carbohydrates 17g, Fat 0.4g'
  },
  'jammie dodgers biscuits': {
    name: 'Jammie Dodgers Biscuits 140G',
    description: 'Classic British biscuits with jam filling. Beloved by children and adults alike.',
    storage: 'Store in a cool, dry place.',
    preparation: 'Ready to eat.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/jammie-dodgers/jammie-dodgers.jpg',
    nutrition: 'Per 100g: Energy 456kcal, Protein 4.5g, Carbohydrates 66g, Fat 19g'
  },
  'butterkist microwave popcorn': {
    name: 'Butterkist Microwave Popcorn Sweet & Salted 3X60g',
    description: 'Classic cinema-style popcorn, sweet and salted flavour. Ready in minutes.',
    storage: 'Store in a cool, dry place.',
    preparation: 'Microwave 800W: 2-3 mins. See packaging for full instructions.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/butterkist/butterkist.jpg',
    nutrition: 'Per 100g: Energy 531kcal, Protein 8g, Carbohydrates 56g, Fat 31g'
  },
  'de cecco conchiglie rigate': {
    name: 'De Cecco Conchiglie Rigate 500g',
    description: 'Quality Italian pasta shells, perfect for holding sauces.',
    storage: 'Store in a cool, dry place.',
    preparation: 'Cook in boiling salted water for 10-12 minutes.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/de-cecco/conchiglie.jpg',
    nutrition: 'Per 100g: Energy 357kcal, Protein 12g, Carbohydrates 72g, Fat 1.5g'
  },
  'aunt bessie maple thyme glazed carrots': {
    name: "Aunt Bessie's Maple & Thyme Glazed Carrots 500g",
    description: "Sweet and flavourful carrots with a maple and thyme glaze. Ready in minutes.",
    storage: "Keep frozen. Defrost thoroughly before cooking.",
    preparation: "Oven 200C: 25-30 mins. Microwave: 8-10 mins.",
    image: "https://digitalcontent.api.tesco.com/v2/media/ghs/aunt-bessie/carrots.jpg",
    nutrition: "Per 100g: Energy 86kcal, Protein 1.2g, Carbohydrates 14g, Fat 2.5g"
  },
  'tesco fire pit beef steaks': {
    name: 'Tesco Fire Pit 2 Salt & Pepper Beef Steaks 200G',
    description: 'Seasoned beef steaks, perfect for the BBQ or griddle pan.',
    storage: 'Keep refrigerated. Consume by the use-by date.',
    preparation: 'Grill or pan-fry to desired doneness. Rest before serving.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/tesco/fire-pit-steaks.jpg',
    nutrition: 'Per 100g: Energy 195kcal, Protein 21g, Carbohydrates 2g, Fat 12g'
  },
  'tesco gammon steak': {
    name: 'Tesco Gammon Steak With Cheese & Pineapple 345G',
    description: 'Smoky gammon steak topped with melted cheese and pineapple.',
    storage: 'Keep refrigerated. Consume by the use-by date.',
    preparation: 'Pan-fry or grill for 6-8 minutes each side. Serve hot.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/tesco/gammon-steak.jpg',
    nutrition: 'Per 100g: Energy 165kcal, Protein 18g, Carbohydrates 5g, Fat 8g'
  },
  'tesco pork loin joint': {
    name: 'Tesco Pork Loin Joint 1.900KG',
    description: 'Large pork loin joint, perfect for Sunday roast. Can be roasted with crackling.',
    storage: 'Keep refrigerated. Consume by the use-by date.',
    preparation: 'Roast at 180°C for 30 mins per 450g plus 30 mins. Rest before carving.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/tesco/pork-loin.jpg',
    nutrition: 'Per 100g: Energy 180kcal, Protein 21g, Carbohydrates 0g, Fat 10g'
  },
  'tesco pork stir fry': {
    name: 'Tesco Pork Stir Fry 500G',
    description: 'Sliced pork ready for stir-frying with vegetables.',
    storage: 'Keep refrigerated. Consume by the use-by date.',
    preparation: 'Stir-fry over high heat for 3-4 minutes. Cook thoroughly.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/tesco/pork-stir-fry.jpg',
    nutrition: 'Per 100g: Energy 130kcal, Protein 19g, Carbohydrates 1g, Fat 6g'
  },
  'tesco frozen broccoli': {
    name: 'Tesco Frozen Broccoli Florets 900G',
    description: 'Frozen broccoli florets, ready to cook from frozen.',
    storage: 'Keep frozen at -18°C or below.',
    preparation: 'Microwave: 8-10 mins. Boil: 6-8 mins. Steam: 8-10 mins.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/tesco/frozen-broccoli.jpg',
    nutrition: 'Per 100g: Energy 34kcal, Protein 2.8g, Carbohydrates 4g, Fat 0.4g'
  },
  'actimel immune support': {
    name: 'Actimel Immune Support Live Yoghurt Drink - Multifruit 8x100g',
    description: 'Probiotic yogurt drink with vitamin D to support immune function.',
    storage: 'Keep refrigerated between +1°C and +6°C.',
    preparation: 'Ready to drink. Shake well before consuming.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/actimel/actimel.jpg',
    nutrition: 'Per 100g: Energy 41kcal, Protein 1.6g, Carbohydrates 6.5g, Fat 0.8g'
  },
  'yoplait frubes': {
    name: 'Yoplait Frubes Yoghurt Tubes - Strawberry, Red Berry & Peach 9x37g',
    description: 'Fun yogurt tubes for kids. Perfect for lunchboxes.',
    storage: 'Keep refrigerated between +1°C and +6°C.',
    preparation: 'Ready to eat. Squeeze and enjoy.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/yoplait/frubes.jpg',
    nutrition: 'Per 100g: Energy 87kcal, Protein 3g, Carbohydrates 14g, Fat 2.3g'
  },
  'innocent wonder green juice': {
    name: 'Innocent Wonder Green Juice 750Ml',
    description: 'Refreshing green juice blend with apple, spinach, kale and ginger.',
    storage: 'Keep refrigerated. Consume within 5 days of opening.',
    preparation: 'Ready to drink. Shake well before consuming.',
    image: 'https://digitalcontent.api.tesco.com/v2/media/ghs/innocent/green-juice.jpg',
    nutrition: 'Per 100ml: Energy 28kcal, Protein 0.5g, Carbohydrates 6g, Fat 0g'
  }
};

/**
 * Find product info by name - ONLY exact substring matches
 * No word-based fallback to avoid wrong matches
 */
export function findProductInfo(itemName: string): ProductInfo | null {
  const normalizedItem = itemName.toLowerCase().trim();
  
  // 1. Direct exact key match
  if (productDatabase[normalizedItem]) {
    return productDatabase[normalizedItem];
  }
  
  // 2. Substring match: key must appear contiguously in item name
  // Sort keys by length (longest first) to prefer more specific matches
  const sortedKeys = Object.keys(productDatabase).sort((a, b) => b.length - a.length);
  
  for (const key of sortedKeys) {
    if (normalizedItem.includes(key)) {
      return productDatabase[key];
    }
  }
  
  // 3. No fallback matching - don't try word-based or partial matching
  // This prevents wrong products from being suggested
  return null;
}
