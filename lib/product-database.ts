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
  }
};

/**
 * Find product info by name (fuzzy matching)
 */
export function findProductInfo(itemName: string): ProductInfo | null {
  const normalizedItem = itemName.toLowerCase().trim();
  
  // Direct match
  if (productDatabase[normalizedItem]) {
    return productDatabase[normalizedItem];
  }
  
  // Partial match - check if any key is contained in the item name
  for (const [key, product] of Object.entries(productDatabase)) {
    if (normalizedItem.includes(key) || key.includes(normalizedItem)) {
      return product;
    }
    // Word-based matching
    const itemWords = normalizedItem.split(/[\s,]+/);
    const keyWords = key.split(/[\s,]+/);
    if (itemWords.some(w => keyWords.some(kw => kw.includes(w) || w.includes(kw)))) {
      return product;
    }
  }
  
  return null;
}
