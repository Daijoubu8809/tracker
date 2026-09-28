/**
 * Built-in food database.
 *
 * HOW TO ADD A FOOD: copy a line and edit it. Nutrition is per 100 g of the
 * food *as eaten* (cooked, prepared). Then give the grams in one cup / piece /
 * slice / serving where it makes sense, so household portions convert.
 *
 *   food(id, name, category, [kcal, protein, carbs, fat] per 100 g, {
 *     cup: grams in 1 cup, piece: grams in 1 piece, pieceName: 'cookie',
 *     slice: grams in 1 slice, serving: grams, servingName: '12 fl oz can',
 *     unit: default portion, unc: ± uncertainty %, aliases: ['search words'],
 *     per: { ladle: 30 } // per-food override of a household unit, in grams
 *     src: source (defaults below)
 *   })
 *
 * SOURCES
 *  - SR  = USDA FoodData Central, "SR Legacy" dataset (search the name at
 *          https://fdc.nal.usda.gov). Values are rounded.
 *  - FNDDS = USDA FoodData Central, "Survey (FNDDS)" dataset — mixed dishes as
 *          typically prepared in the US.
 *  - LABEL = Typical chain/brand nutrition label, converted to per 100 g.
 *  - EST = Estimate from a typical recipe (USDA ingredients); wider uncertainty.
 *
 * Dining-hall food varies a lot (oil, butter, sauce, portion). The `unc`
 * value is the typical ± error of an estimate for that food; totals show it.
 */
import type { Food, FoodCategory, PortionUnit } from '../lib/types';

const SR = 'USDA FoodData Central (SR Legacy)';
const FNDDS = 'USDA FoodData Central (FNDDS survey food)';
const LABEL = 'Typical brand/chain label';
const EST = 'Estimate from typical recipe (USDA ingredients)';

interface Opts {
  cup?: number;
  piece?: number;
  pieceName?: string;
  slice?: number;
  serving?: number;
  servingName?: string;
  unit?: PortionUnit;
  unc?: number;
  aliases?: string[];
  per?: Partial<Record<PortionUnit, number>>;
  fiber?: number;
  sodium?: number;
  src?: string;
}

const DEFAULT_UNC: Record<FoodCategory, number> = {
  starch: 15,
  protein: 20,
  vegetable: 25,
  fruit: 15,
  dairy: 10,
  fat: 20,
  mixed: 35,
  dessert: 30,
  drink: 10,
  breakfast: 25,
  snack: 15,
  condiment: 25,
};

function food(
  id: string,
  name: string,
  category: FoodCategory,
  [kcal, protein, carbs, fat]: [number, number, number, number],
  o: Opts = {},
): Food {
  const unit: PortionUnit =
    o.unit ?? (o.piece ? 'piece' : o.slice ? 'slice' : category === 'protein' ? 'palm' : o.serving ? 'serving' : 'cup');
  return {
    id: `b:${id}`,
    name,
    aliases: o.aliases ?? [],
    category,
    kcal100: kcal,
    protein100: protein,
    carbs100: carbs,
    fat100: fat,
    ...(o.fiber != null ? { fiber100: o.fiber } : {}),
    ...(o.sodium != null ? { sodium100: o.sodium } : {}),
    ...(o.cup ? { gramsPerCup: o.cup } : {}),
    ...(o.piece ? { gramsPerPiece: o.piece, pieceName: o.pieceName ?? 'piece' } : {}),
    ...(o.slice ? { gramsPerSlice: o.slice } : {}),
    ...(o.serving ? { servingGrams: o.serving, servingName: o.servingName ?? `serving (${o.serving} g)` } : {}),
    ...(o.per ? { gramsPer: o.per } : {}),
    defaultUnit: unit,
    uncertaintyPct: o.unc ?? DEFAULT_UNC[category],
    source: o.src ?? SR,
  };
}

// Salad-bar dressing ladles are small (≈1 oz / 2 tbsp), not soup ladles.
const DRESSING = { per: { ladle: 30 }, unit: 'thumb' as PortionUnit, cup: 240 };

export const SEED_FOODS: Food[] = [
  // ---------------- Starches: rice, pasta, bread, potatoes ----------------
  food('rice-white', 'White rice', 'starch', [130, 2.7, 28.2, 0.3], { cup: 158, unit: 'scoop', aliases: ['rice', 'steamed rice', 'jasmine rice', 'plain rice'] }),
  food('rice-brown', 'Brown rice', 'starch', [112, 2.3, 23.5, 0.8], { cup: 195, unit: 'scoop' }),
  food('rice-fried', 'Fried rice', 'starch', [170, 4.5, 26, 5.3], { cup: 170, unit: 'scoop', unc: 30, src: FNDDS, aliases: ['chinese fried rice', 'egg fried rice', 'chicken fried rice'] }),
  food('rice-cilantro', 'Cilantro-lime rice', 'starch', [150, 2.7, 28, 3], { cup: 158, unit: 'scoop', unc: 20, src: EST, aliases: ['burrito rice', 'mexican rice'] }),
  food('quinoa', 'Quinoa', 'starch', [120, 4.4, 21.3, 1.9], { cup: 185, unit: 'scoop' }),
  food('couscous', 'Couscous', 'starch', [112, 3.8, 23.2, 0.2], { cup: 157, unit: 'scoop' }),
  food('pasta-plain', 'Pasta, plain', 'starch', [158, 5.8, 30.9, 0.9], { cup: 140, unit: 'scoop', aliases: ['pasta', 'spaghetti', 'penne', 'plain pasta', 'noodles plain'] }),
  food('pasta-marinara', 'Pasta with marinara', 'mixed', [125, 4.5, 22, 2.3], { cup: 250, unit: 'scoop', unc: 25, src: FNDDS, aliases: ['spaghetti marinara', 'pasta red sauce', 'pasta with tomato sauce', 'marinara pasta'] }),
  food('pasta-meat-sauce', 'Pasta with meat sauce', 'mixed', [135, 7, 17, 4.3], { cup: 250, unit: 'scoop', unc: 30, src: FNDDS, aliases: ['spaghetti bolognese', 'bolognese', 'spaghetti with meat sauce'] }),
  food('pasta-alfredo', 'Pasta alfredo', 'mixed', [190, 6, 20, 9.5], { cup: 240, unit: 'scoop', unc: 35, src: FNDDS, aliases: ['fettuccine alfredo', 'alfredo'] }),
  food('pasta-pesto', 'Pesto pasta', 'mixed', [200, 6, 25, 8.5], { cup: 200, unit: 'scoop', unc: 35, src: EST }),
  food('mac-cheese', 'Mac and cheese', 'mixed', [165, 6.5, 17, 8], { cup: 200, unit: 'scoop', unc: 30, src: FNDDS, aliases: ['macaroni and cheese', 'mac n cheese', 'mac', 'mac & cheese'] }),
  food('lasagna', 'Lasagna (meat)', 'mixed', [150, 8.5, 13, 7], { cup: 250, slice: 250, unit: 'slice', unc: 30, src: FNDDS }),
  food('bread-white', 'White bread', 'starch', [266, 7.6, 49.4, 3.3], { slice: 28, aliases: ['bread', 'toast'] }),
  food('bread-wheat', 'Whole wheat bread', 'starch', [252, 12.4, 42.7, 3.5], { slice: 32, aliases: ['wheat bread', 'wheat toast'] }),
  food('bagel', 'Bagel, plain', 'starch', [257, 10, 50.5, 1.6], { piece: 105, pieceName: 'bagel', aliases: ['bagel'] }),
  food('english-muffin', 'English muffin', 'starch', [227, 8.9, 44.2, 1.7], { piece: 57, pieceName: 'muffin' }),
  food('roll', 'Dinner roll', 'starch', [310, 10.9, 52, 6.4], { piece: 28, pieceName: 'roll', aliases: ['bread roll', 'bun'] }),
  food('garlic-bread', 'Garlic bread', 'starch', [350, 8, 42, 16], { slice: 40, unc: 25, src: EST }),
  food('breadstick', 'Breadstick', 'starch', [290, 8.5, 48, 7], { piece: 50, pieceName: 'breadstick', unc: 25, src: LABEL }),
  food('tortilla-flour', 'Flour tortilla (8")', 'starch', [312, 8.3, 51.6, 8.1], { piece: 49, pieceName: 'tortilla', aliases: ['tortilla', 'wrap'] }),
  food('tortilla-flour-lg', 'Flour tortilla, burrito size (10–12")', 'starch', [312, 8.3, 51.6, 8.1], { piece: 72, pieceName: 'tortilla', aliases: ['large tortilla', 'burrito tortilla'] }),
  food('tortilla-corn', 'Corn tortilla', 'starch', [218, 5.7, 44.6, 2.9], { piece: 26, pieceName: 'tortilla' }),
  food('naan', 'Naan', 'starch', [290, 9, 50, 5.5], { piece: 90, pieceName: 'naan' }),
  food('cornbread', 'Cornbread', 'starch', [330, 7, 48, 12], { piece: 60, unc: 25, src: EST }),
  food('fries', 'French fries', 'starch', [312, 3.4, 41.4, 14.7], { cup: 58, serving: 117, servingName: 'medium order', unit: 'fist', unc: 30, aliases: ['fries', 'french fry'] }),
  food('sweet-potato-fries', 'Sweet potato fries', 'starch', [260, 2.5, 34, 13], { cup: 60, unit: 'fist', unc: 30, src: EST }),
  food('tater-tots', 'Tater tots', 'starch', [200, 2.5, 26, 9.5], { cup: 95, piece: 9, pieceName: 'tot', unit: 'fist', unc: 25 }),
  food('mashed-potatoes', 'Mashed potatoes', 'starch', [113, 2, 17, 4.2], { cup: 210, unit: 'scoop', unc: 25, aliases: ['mashed potato', 'mash'] }),
  food('roasted-potatoes', 'Roasted potatoes', 'starch', [140, 2.4, 21, 5.3], { cup: 150, unit: 'scoop', unc: 30, src: EST, aliases: ['potatoes', 'home fries', 'roast potatoes'] }),
  food('baked-potato', 'Baked potato (plain)', 'starch', [93, 2.5, 21.2, 0.1], { piece: 173, pieceName: 'potato', cup: 122 }),
  food('sweet-potato', 'Sweet potato, baked', 'starch', [90, 2, 20.7, 0.2], { piece: 150, pieceName: 'potato', cup: 200 }),
  food('hash-browns', 'Hash browns', 'breakfast', [230, 2.5, 28, 12], { cup: 150, piece: 56, pieceName: 'patty', unit: 'scoop', unc: 30, src: EST }),
  food('lo-mein', 'Lo mein', 'mixed', [150, 5.5, 20, 5], { cup: 190, unit: 'scoop', unc: 35, src: FNDDS, aliases: ['chow mein', 'noodles', 'stir fry noodles'] }),
  food('rice-noodles', 'Rice noodles', 'starch', [108, 1.8, 24, 0.2], { cup: 176, unit: 'scoop' }),
  food('pad-thai', 'Pad thai', 'mixed', [175, 7, 22, 7], { cup: 200, unit: 'scoop', unc: 35, src: FNDDS }),

  // ---------------- Proteins ----------------
  food('chicken-breast', 'Grilled chicken breast', 'protein', [165, 31, 0, 3.6], { cup: 140, unc: 15, aliases: ['chicken', 'grilled chicken', 'chicken breast', 'baked chicken'] }),
  food('chicken-thigh', 'Chicken thigh (no skin)', 'protein', [209, 26, 0, 10.9], { cup: 140, piece: 52, pieceName: 'thigh', unit: 'palm' }),
  food('chicken-rotisserie', 'Rotisserie chicken', 'protein', [190, 28, 0, 8], { cup: 140, unc: 20, src: FNDDS, aliases: ['roast chicken'] }),
  food('chicken-fried', 'Fried chicken (bone-in piece)', 'protein', [260, 25, 9, 14], { piece: 140, pieceName: 'piece', unc: 35, src: FNDDS, aliases: ['fried chicken'] }),
  food('chicken-tenders', 'Chicken tenders', 'protein', [270, 18, 16, 15], { piece: 45, pieceName: 'tender', unc: 30, src: FNDDS, aliases: ['chicken strips', 'chicken fingers', 'tender'] }),
  food('chicken-nuggets', 'Chicken nuggets', 'protein', [296, 15.3, 16, 18.8], { piece: 16, pieceName: 'nugget', unc: 25, aliases: ['nuggets', 'nugget'] }),
  food('wings', 'Buffalo wings', 'protein', [250, 23, 2, 17], { piece: 35, pieceName: 'wing', unc: 30, src: FNDDS, aliases: ['wings', 'chicken wings'] }),
  food('orange-chicken', 'Orange chicken', 'mixed', [300, 15, 31, 14], { cup: 140, unit: 'scoop', unc: 35, src: LABEL }),
  food('general-tso', "General Tso's chicken", 'mixed', [290, 14, 27, 14.5], { cup: 145, unit: 'scoop', unc: 35, src: FNDDS, aliases: ['general tsos', 'general chicken'] }),
  food('sesame-chicken', 'Sesame chicken', 'mixed', [290, 14, 28, 14], { cup: 145, unit: 'scoop', unc: 35, src: FNDDS }),
  food('sweet-sour-chicken', 'Sweet and sour chicken', 'mixed', [230, 10, 25, 10], { cup: 150, unit: 'scoop', unc: 35, src: FNDDS }),
  food('kung-pao', 'Kung pao chicken', 'mixed', [170, 12, 9, 10], { cup: 160, unit: 'scoop', unc: 35, src: FNDDS }),
  food('teriyaki-chicken', 'Teriyaki chicken', 'mixed', [160, 20, 8, 5], { cup: 140, unit: 'palm', unc: 30, src: FNDDS, aliases: ['chicken teriyaki'] }),
  food('chicken-stir-fry', 'Chicken stir-fry with vegetables', 'mixed', [110, 11, 6, 4.5], { cup: 190, unit: 'scoop', unc: 35, src: FNDDS, aliases: ['stir fry', 'chicken stir fry'] }),
  food('beef-broccoli', 'Beef and broccoli', 'mixed', [130, 11, 7, 6.5], { cup: 180, unit: 'scoop', unc: 35, src: FNDDS }),
  food('mongolian-beef', 'Mongolian beef', 'mixed', [220, 14, 15, 11], { cup: 150, unit: 'scoop', unc: 35, src: EST }),
  food('chicken-katsu', 'Chicken katsu', 'protein', [260, 20, 13, 14], { piece: 150, pieceName: 'cutlet', unc: 30, src: EST, aliases: ['katsu'] }),
  food('tikka-masala', 'Chicken tikka masala / curry', 'mixed', [150, 11, 6, 9], { cup: 240, unit: 'ladle', unc: 35, src: FNDDS, aliases: ['chicken curry', 'curry', 'butter chicken'] }),
  food('burger-patty', 'Burger patty (beef)', 'protein', [270, 26, 0, 18], { piece: 85, pieceName: 'patty', unc: 20, aliases: ['patty', 'beef patty', 'hamburger patty'] }),
  food('hamburger', 'Hamburger (with bun)', 'mixed', [250, 13.5, 24, 11], { piece: 180, pieceName: 'burger', unc: 25, src: FNDDS, aliases: ['burger'] }),
  food('cheeseburger', 'Cheeseburger (with bun)', 'mixed', [263, 14, 22, 13], { piece: 200, pieceName: 'burger', unc: 25, src: FNDDS }),
  food('ground-beef', 'Ground beef, cooked', 'protein', [250, 26, 0, 15.5], { cup: 120, aliases: ['beef', 'ground beef crumbles'] }),
  food('taco-meat', 'Taco meat (seasoned beef)', 'protein', [230, 20, 4, 15], { cup: 180, unit: 'scoop', unc: 25, src: EST, aliases: ['taco beef'] }),
  food('steak', 'Steak (sirloin)', 'protein', [210, 28, 0, 10.5], { cup: 140, aliases: ['sirloin', 'beef steak', 'carne asada', 'fajita steak'] }),
  food('meatballs', 'Meatballs', 'protein', [240, 16, 7, 16], { piece: 30, pieceName: 'meatball', unc: 25, src: FNDDS }),
  food('meatloaf', 'Meatloaf', 'protein', [200, 14, 8, 12], { slice: 115, unc: 25, src: FNDDS }),
  food('turkey-breast', 'Turkey breast, roasted', 'protein', [147, 30, 0, 2], { cup: 140, aliases: ['turkey', 'roast turkey'] }),
  food('turkey-deli', 'Deli turkey', 'protein', [100, 17, 3.5, 1.7], { slice: 28, aliases: ['sliced turkey', 'turkey slices'] }),
  food('ground-turkey', 'Ground turkey, cooked', 'protein', [203, 27.4, 0, 10.4], { cup: 120 }),
  food('pork-chop', 'Pork chop', 'protein', [215, 27, 0, 11], { piece: 145, pieceName: 'chop', unit: 'palm', aliases: ['pork', 'pork loin'] }),
  food('pulled-pork', 'Pulled pork (BBQ)', 'protein', [200, 16, 13, 9.5], { cup: 140, unit: 'scoop', unc: 30, src: FNDDS, aliases: ['bbq pork'] }),
  food('carnitas', 'Carnitas', 'protein', [230, 24, 1.5, 14], { cup: 140, unit: 'scoop', unc: 25, src: EST }),
  food('ham', 'Ham', 'protein', [145, 21, 1.5, 5.5], { slice: 28 }),
  food('bacon', 'Bacon', 'protein', [541, 37, 1.4, 42], { piece: 8, pieceName: 'strip', unc: 20, aliases: ['bacon strip'] }),
  food('sausage', 'Breakfast sausage', 'protein', [325, 18, 1.4, 27], { piece: 25, pieceName: 'link/patty', unc: 20, aliases: ['sausage link', 'sausage patty'] }),
  food('hot-dog', 'Hot dog (with bun)', 'mixed', [285, 9.7, 26, 15.3], { piece: 88, pieceName: 'hot dog', unc: 15, src: FNDDS, aliases: ['hotdog'] }),
  food('salmon', 'Salmon, baked', 'protein', [206, 22.1, 0, 12.4], { cup: 140, aliases: ['fish'] }),
  food('white-fish', 'White fish (tilapia/cod), baked', 'protein', [128, 26, 0, 2.7], { cup: 140, aliases: ['tilapia', 'cod', 'white fish'] }),
  food('fried-fish', 'Fried fish (breaded)', 'protein', [240, 15, 17, 12.5], { piece: 90, pieceName: 'fillet', unc: 30, src: FNDDS, aliases: ['fish sticks', 'fish and chips fish'] }),
  food('tuna', 'Tuna (canned in water)', 'protein', [116, 25.5, 0, 0.8], { cup: 154 }),
  food('tuna-salad', 'Tuna salad', 'mixed', [187, 16, 9.4, 9.3], { cup: 205, unit: 'scoop', unc: 25 }),
  food('shrimp', 'Shrimp, cooked', 'protein', [99, 24, 0.2, 0.3], { cup: 145, piece: 7, pieceName: 'shrimp', unit: 'palm', aliases: ['prawns'] }),
  food('shrimp-fried', 'Fried shrimp (breaded)', 'protein', [242, 21, 11.5, 12.3], { piece: 12, pieceName: 'shrimp', unc: 30, aliases: ['popcorn shrimp', 'tempura shrimp'] }),
  food('tofu', 'Tofu, firm', 'protein', [144, 17.3, 2.8, 8.7], { cup: 250, aliases: ['tofu'] }),
  food('tofu-fried', 'Fried/sauced tofu', 'protein', [200, 11, 10, 13], { cup: 150, unit: 'scoop', unc: 35, src: EST, aliases: ['general tso tofu', 'crispy tofu'] }),
  food('eggs-scrambled', 'Scrambled eggs', 'protein', [149, 10, 1.6, 11], { cup: 220, piece: 61, pieceName: 'egg', unit: 'scoop', unc: 20, aliases: ['scrambled egg', 'eggs'] }),
  food('egg-fried', 'Fried egg', 'protein', [196, 13.6, 0.8, 14.8], { piece: 46, pieceName: 'egg', unc: 20 }),
  food('egg-boiled', 'Hard-boiled egg', 'protein', [155, 12.6, 1.1, 10.6], { piece: 50, pieceName: 'egg', unc: 5, aliases: ['boiled egg', 'egg'] }),
  food('egg-whites', 'Egg whites, cooked', 'protein', [52, 11, 0.7, 0.2], { cup: 243, unit: 'scoop' }),
  food('omelet', 'Omelet (with cheese)', 'protein', [185, 12, 1.5, 14.5], { piece: 150, pieceName: 'omelet', unc: 25, src: FNDDS, aliases: ['omelette'] }),
  food('black-beans', 'Black beans', 'protein', [132, 8.9, 23.7, 0.5], { cup: 172, unit: 'scoop', aliases: ['beans'] }),
  food('pinto-beans', 'Pinto beans', 'protein', [143, 9, 26.2, 0.7], { cup: 171, unit: 'scoop' }),
  food('refried-beans', 'Refried beans', 'protein', [91, 5.4, 15.5, 1.2], { cup: 238, unit: 'scoop' }),
  food('chickpeas', 'Chickpeas', 'protein', [164, 8.9, 27.4, 2.6], { cup: 164, unit: 'cupped_hand', aliases: ['garbanzo beans', 'chick peas'] }),
  food('lentils', 'Lentils', 'protein', [116, 9, 20, 0.4], { cup: 198, unit: 'scoop' }),
  food('edamame', 'Edamame (shelled)', 'protein', [121, 11.9, 8.9, 5.2], { cup: 155, unit: 'cupped_hand' }),
  food('falafel', 'Falafel', 'protein', [333, 13.3, 31.8, 17.8], { piece: 17, pieceName: 'ball', unc: 25 }),
  food('hummus', 'Hummus', 'condiment', [166, 7.9, 14.3, 9.6], { cup: 246, unit: 'thumb' }),

  // ---------------- Pizza, sandwiches, Mexican ----------------
  food('pizza-cheese', 'Cheese pizza', 'mixed', [266, 11.4, 33.3, 9.7], { slice: 107, unc: 25, aliases: ['pizza', 'cheese pizza slice'] }),
  food('pizza-pepperoni', 'Pepperoni pizza', 'mixed', [290, 12.3, 32, 12.3], { slice: 110, unc: 25 }),
  food('pizza-veggie', 'Veggie pizza', 'mixed', [250, 10, 32, 9], { slice: 110, unc: 25 }),
  food('grilled-cheese', 'Grilled cheese sandwich', 'mixed', [320, 12, 29, 17.5], { piece: 120, pieceName: 'sandwich', unc: 25, src: FNDDS }),
  food('deli-sandwich', 'Deli sandwich (turkey/ham)', 'mixed', [200, 12, 22, 7], { piece: 230, pieceName: 'sandwich', unc: 30, src: FNDDS, aliases: ['sandwich', 'sub', 'turkey sandwich', 'ham sandwich'] }),
  food('chicken-sandwich', 'Fried chicken sandwich', 'mixed', [260, 14, 24, 12], { piece: 200, pieceName: 'sandwich', unc: 30, src: FNDDS }),
  food('pbj', 'PB&J sandwich', 'mixed', [360, 11, 45, 15.5], { piece: 95, pieceName: 'sandwich', unc: 20, src: FNDDS, aliases: ['peanut butter and jelly', 'pb and j', 'pbj'] }),
  food('chicken-wrap', 'Chicken wrap', 'mixed', [210, 13, 20, 8.5], { piece: 250, pieceName: 'wrap', unc: 30, src: FNDDS, aliases: ['wrap', 'chicken caesar wrap'] }),
  food('burrito', 'Burrito (chicken, rice, beans)', 'mixed', [195, 10, 22, 7.5], { piece: 350, pieceName: 'burrito', unc: 35, src: FNDDS, aliases: ['burrito'] }),
  food('burrito-bowl', 'Burrito bowl', 'mixed', [150, 9, 17, 5], { cup: 190, unit: 'bowl', unc: 35, src: EST, aliases: ['chipotle bowl'] }),
  food('breakfast-burrito', 'Breakfast burrito', 'breakfast', [215, 9, 20, 11], { piece: 220, pieceName: 'burrito', unc: 30, src: FNDDS }),
  food('taco', 'Taco (beef, hard shell)', 'mixed', [220, 10, 16, 12.5], { piece: 80, pieceName: 'taco', unc: 30, src: FNDDS, aliases: ['tacos'] }),
  food('quesadilla', 'Cheese quesadilla', 'mixed', [300, 13, 26, 16], { piece: 180, pieceName: 'quesadilla', slice: 45, unc: 30, src: FNDDS, aliases: ['quesadilla'] }),
  food('enchilada', 'Enchilada', 'mixed', [165, 8, 15, 8], { piece: 150, pieceName: 'enchilada', unc: 35, src: FNDDS }),
  food('nachos', 'Nachos with cheese', 'mixed', [306, 8, 32, 16.8], { cup: 60, unit: 'plate', unc: 35 }),
  food('tortilla-chips', 'Tortilla chips', 'snack', [489, 7, 64, 23], { cup: 26, piece: 2.8, pieceName: 'chip', unit: 'fist', aliases: ['chips and salsa', 'nacho chips'] }),
  food('salsa', 'Salsa / pico de gallo', 'condiment', [30, 1.5, 6.6, 0.2], { cup: 260, unit: 'scoop', unc: 20, aliases: ['pico', 'pico de gallo'] }),
  food('guacamole', 'Guacamole', 'fat', [155, 2, 8.6, 14.7], { cup: 230, unit: 'thumb', aliases: ['guac'] }),
  food('sour-cream', 'Sour cream', 'dairy', [198, 2.4, 4.6, 19.4], { cup: 230, unit: 'thumb' }),
  food('queso', 'Queso dip', 'dairy', [180, 5, 8, 14], { cup: 245, unit: 'thumb', unc: 30, src: EST }),
  food('fajita-veg', 'Fajita peppers and onions', 'vegetable', [70, 1.2, 8, 3.7], { cup: 150, unit: 'scoop', unc: 35, src: EST, aliases: ['fajita veggies', 'peppers and onions'] }),

  // ---------------- Salad bar & dressings ----------------
  food('greens', 'Salad greens', 'vegetable', [17, 1.2, 3.3, 0.3], { cup: 47, unit: 'bowl', aliases: ['lettuce', 'salad', 'romaine', 'mixed greens', 'side salad'] }),
  food('spinach-raw', 'Spinach, raw', 'vegetable', [23, 2.9, 3.6, 0.4], { cup: 30, unit: 'fist' }),
  food('tomatoes', 'Cherry tomatoes', 'vegetable', [18, 0.9, 3.9, 0.2], { cup: 149, piece: 17, pieceName: 'tomato', unit: 'cupped_hand', aliases: ['tomato', 'tomatoes'] }),
  food('cucumber', 'Cucumber', 'vegetable', [15, 0.7, 3.6, 0.1], { cup: 119, unit: 'cupped_hand', aliases: ['cucumbers'] }),
  food('carrots-raw', 'Carrots, raw', 'vegetable', [41, 0.9, 9.6, 0.2], { cup: 128, piece: 10, pieceName: 'baby carrot', unit: 'cupped_hand', aliases: ['baby carrots', 'shredded carrots'] }),
  food('corn', 'Corn', 'vegetable', [96, 3.4, 21, 1.5], { cup: 165, unit: 'scoop' }),
  food('olives', 'Olives', 'fat', [115, 0.8, 6, 10.7], { cup: 134, piece: 4, pieceName: 'olive', unit: 'thumb' }),
  food('croutons', 'Croutons', 'starch', [465, 10.8, 63.5, 18.3], { cup: 40, unit: 'cupped_hand' }),
  food('cheese-shredded', 'Shredded cheese (cheddar)', 'dairy', [403, 22.9, 3.1, 33.3], { cup: 113, unit: 'cupped_hand', aliases: ['cheese', 'cheddar', 'shredded cheese'] }),
  food('feta', 'Feta cheese', 'dairy', [264, 14.2, 4.1, 21.3], { cup: 150, unit: 'thumb' }),
  food('parmesan', 'Parmesan, grated', 'dairy', [420, 28, 13.9, 28], { cup: 100, unit: 'thumb', aliases: ['parm'] }),
  food('sunflower-seeds', 'Sunflower seeds', 'fat', [584, 20.8, 20, 51.5], { cup: 140, unit: 'thumb' }),
  food('ranch', 'Ranch dressing', 'condiment', [430, 1.3, 6, 44.5], { ...DRESSING, aliases: ['ranch'] }),
  food('caesar', 'Caesar dressing', 'condiment', [520, 2.2, 3.3, 56], { ...DRESSING }),
  food('italian', 'Italian dressing', 'condiment', [240, 0.4, 11, 21], { ...DRESSING }),
  food('balsamic', 'Balsamic vinaigrette', 'condiment', [290, 0.3, 14, 26], { ...DRESSING, aliases: ['vinaigrette', 'balsamic'] }),
  food('honey-mustard', 'Honey mustard dressing', 'condiment', [400, 1, 22, 34], { ...DRESSING }),
  food('blue-cheese', 'Blue cheese dressing', 'condiment', [480, 1.4, 4.8, 51], { ...DRESSING }),
  food('olive-oil', 'Olive oil', 'fat', [884, 0, 0, 100], { cup: 216, unit: 'thumb', unc: 15, aliases: ['oil'] }),
  food('caesar-salad', 'Chicken Caesar salad (dressed)', 'mixed', [150, 11, 5, 10], { cup: 100, unit: 'bowl', unc: 35, src: FNDDS }),

  // ---------------- Cooked vegetables ----------------
  food('broccoli', 'Broccoli, steamed', 'vegetable', [35, 2.4, 7.2, 0.4], { cup: 156, unit: 'fist', unc: 20, aliases: ['broccoli'] }),
  food('green-beans', 'Green beans', 'vegetable', [35, 1.9, 7.9, 0.3], { cup: 125, unit: 'fist' }),
  food('carrots-cooked', 'Carrots, cooked', 'vegetable', [35, 0.8, 8.2, 0.2], { cup: 156, unit: 'fist' }),
  food('mixed-veg', 'Mixed vegetables, steamed', 'vegetable', [65, 2.9, 13.1, 0.2], { cup: 182, unit: 'fist', aliases: ['veggies', 'vegetables', 'veg'] }),
  food('roasted-veg', 'Roasted vegetables (with oil)', 'vegetable', [80, 1.8, 8.5, 4.7], { cup: 150, unit: 'fist', unc: 35, src: EST, aliases: ['roasted veggies'] }),
  food('stir-fry-veg', 'Stir-fried vegetables', 'vegetable', [70, 2, 8, 3.5], { cup: 150, unit: 'fist', unc: 35, src: EST }),
  food('spinach-cooked', 'Spinach, cooked', 'vegetable', [23, 3, 3.8, 0.3], { cup: 180, unit: 'fist' }),
  food('brussels', 'Brussels sprouts, roasted', 'vegetable', [85, 3, 9, 4.5], { cup: 156, unit: 'fist', unc: 30, src: EST }),
  food('zucchini', 'Zucchini/squash, sautéed', 'vegetable', [40, 1.2, 3.5, 2.5], { cup: 180, unit: 'fist', unc: 30, src: EST, aliases: ['squash'] }),
  food('cauliflower', 'Cauliflower, roasted', 'vegetable', [75, 2, 6.5, 5], { cup: 125, unit: 'fist', unc: 30, src: EST }),
  food('coleslaw', 'Coleslaw', 'vegetable', [140, 1, 13, 9.5], { cup: 190, unit: 'scoop', unc: 30, src: FNDDS, aliases: ['slaw'] }),
  food('baked-beans', 'Baked beans', 'protein', [120, 5, 21, 1.5], { cup: 254, unit: 'scoop' }),

  // ---------------- Soups ----------------
  food('pho', 'Pho (beef)', 'mixed', [60, 4, 7.5, 1.3], { cup: 245, unit: 'bowl', unc: 30, src: FNDDS, aliases: ['pho', 'beef noodle soup'] }),
  food('ramen', 'Ramen (restaurant, with broth)', 'mixed', [100, 4.5, 12, 3.8], { cup: 245, unit: 'bowl', unc: 35, src: EST, aliases: ['ramen', 'tonkotsu'] }),
  food('instant-ramen', 'Instant ramen (prepared)', 'mixed', [70, 1.8, 9.5, 2.8], { cup: 245, serving: 540, servingName: '1 package, prepared', unit: 'serving', unc: 10, src: LABEL, aliases: ['cup noodles', 'maruchan', 'top ramen'] }),
  food('udon-soup', 'Udon noodle soup', 'mixed', [55, 2.5, 9.5, 0.6], { cup: 245, unit: 'bowl', unc: 30, src: EST, aliases: ['udon'] }),
  food('miso-soup', 'Miso soup', 'mixed', [25, 2, 3, 1], { cup: 240, unit: 'ladle', unc: 25, src: SR }),
  food('chicken-noodle-soup', 'Chicken noodle soup', 'mixed', [35, 2.5, 4, 1], { cup: 245, unit: 'ladle', unc: 25, src: FNDDS }),
  food('tomato-soup', 'Tomato soup', 'mixed', [50, 1, 8, 1.5], { cup: 245, unit: 'ladle', unc: 30, src: FNDDS }),
  food('chili', 'Chili (beef & beans)', 'mixed', [105, 8, 9.5, 4], { cup: 255, unit: 'ladle', unc: 25, src: FNDDS }),
  food('broccoli-cheddar-soup', 'Broccoli cheddar soup', 'mixed', [100, 3.8, 7, 7], { cup: 245, unit: 'ladle', unc: 30, src: LABEL }),
  food('clam-chowder', 'Clam chowder', 'mixed', [80, 3, 7, 4.5], { cup: 250, unit: 'ladle', unc: 30, src: FNDDS }),

  // ---------------- Asian dishes (more) ----------------
  food('dumplings-steamed', 'Dumplings, steamed', 'mixed', [210, 9, 22, 9], { piece: 25, pieceName: 'dumpling', unc: 30, src: FNDDS, aliases: ['dumplings', 'dumpling', 'bao'] }),
  food('potstickers', 'Potstickers (pan-fried dumplings)', 'mixed', [240, 9, 22, 12.5], { piece: 25, pieceName: 'potsticker', unc: 30, src: FNDDS, aliases: ['gyoza', 'fried dumplings'] }),
  food('egg-roll', 'Egg roll', 'mixed', [220, 7, 23, 11], { piece: 85, pieceName: 'egg roll', unc: 30, src: FNDDS, aliases: ['spring roll'] }),
  food('sushi-california', 'Sushi, California roll', 'mixed', [145, 4, 22, 4.3], { piece: 28, pieceName: 'piece', unc: 25, src: FNDDS, aliases: ['sushi', 'california roll'] }),
  food('sushi-spicy-tuna', 'Sushi, spicy tuna roll', 'mixed', [170, 7, 22, 6], { piece: 28, pieceName: 'piece', unc: 25, src: EST, aliases: ['spicy tuna'] }),

  // ---------------- Mixed / generic ----------------
  food('mixed-plate', 'Mixed plate (starch + meat + veg)', 'mixed', [150, 8, 17, 5.5], { cup: 180, unit: 'clamshell', unc: 40, src: EST, aliases: ['mixed plate', 'to go box', 'takeout box', 'combo plate', 'entree'] }),
  food('chicken-parm', 'Chicken parmesan', 'mixed', [200, 17, 11, 10], { piece: 200, pieceName: 'piece', unc: 30, src: FNDDS, aliases: ['chicken parm'] }),

  // ---------------- Breakfast ----------------
  food('oatmeal', 'Oatmeal (made with water)', 'breakfast', [71, 2.5, 12, 1.5], { cup: 234, unit: 'scoop', unc: 15, aliases: ['oats', 'porridge'] }),
  food('pancakes', 'Pancakes', 'breakfast', [227, 6.4, 28.3, 9.7], { piece: 38, pieceName: 'pancake', unc: 20, aliases: ['pancake'] }),
  food('waffle', 'Waffle (Belgian)', 'breakfast', [291, 7.9, 32.9, 14.1], { piece: 75, pieceName: 'waffle', unc: 25 }),
  food('french-toast', 'French toast', 'breakfast', [229, 7.7, 25, 11], { slice: 65, unc: 25 }),
  food('syrup', 'Pancake syrup', 'condiment', [260, 0, 67, 0], { cup: 315, unit: 'thumb', unc: 20, aliases: ['maple syrup', 'syrup'] }),
  food('biscuit', 'Biscuit', 'breakfast', [365, 6.2, 46, 17], { piece: 60, pieceName: 'biscuit', unc: 20 }),
  food('gravy', 'Sausage gravy', 'condiment', [120, 3, 8, 8.5], { cup: 240, unit: 'ladle', unc: 30, src: FNDDS, aliases: ['gravy', 'country gravy'] }),
  food('egg-sandwich', 'Egg & cheese breakfast sandwich', 'breakfast', [260, 11, 21, 15], { piece: 140, pieceName: 'sandwich', unc: 25, src: FNDDS, aliases: ['breakfast sandwich'] }),
  food('muffin', 'Muffin (blueberry, large)', 'breakfast', [380, 5, 53, 17], { piece: 113, pieceName: 'muffin', unc: 25, aliases: ['muffin', 'blueberry muffin'] }),
  food('donut', 'Glazed donut', 'dessert', [420, 5.7, 49, 23], { piece: 60, pieceName: 'donut', unc: 15, aliases: ['doughnut'] }),
  food('croissant', 'Croissant', 'breakfast', [406, 8.2, 45.8, 21], { piece: 57, pieceName: 'croissant', unc: 20 }),
  food('cinnamon-roll', 'Cinnamon roll', 'dessert', [370, 6, 53, 15], { piece: 100, pieceName: 'roll', unc: 25 }),
  food('pop-tart', 'Toaster pastry (Pop-Tart)', 'breakfast', [400, 4, 70, 11], { piece: 50, pieceName: 'pastry', unc: 10, src: LABEL, aliases: ['poptart'] }),
  food('cereal-cheerios', 'Cheerios-type cereal', 'breakfast', [370, 12, 73, 6.7], { cup: 28, unit: 'bowl', unc: 15, src: LABEL, aliases: ['cheerios', 'cereal'] }),
  food('cereal-sweet', 'Sweetened cereal (Froot Loops, Lucky Charms…)', 'breakfast', [390, 6, 85, 4], { cup: 36, unit: 'bowl', unc: 15, src: LABEL, aliases: ['froot loops', 'lucky charms', 'cinnamon toast crunch', 'frosted flakes'] }),
  food('cereal-cornflakes', 'Corn flakes', 'breakfast', [357, 7.5, 84, 0.4], { cup: 28, unit: 'bowl', unc: 15 }),
  food('granola', 'Granola', 'breakfast', [470, 10, 64, 20], { cup: 110, unit: 'cupped_hand', unc: 20 }),

  // ---------------- Dairy ----------------
  food('milk-whole', 'Milk, whole', 'dairy', [61, 3.2, 4.8, 3.3], { cup: 244, aliases: ['milk', 'whole milk'] }),
  food('milk-2', 'Milk, 2%', 'dairy', [50, 3.3, 4.8, 2], { cup: 244, aliases: ['2 percent milk', 'reduced fat milk'] }),
  food('milk-skim', 'Milk, skim', 'dairy', [34, 3.4, 5, 0.1], { cup: 245, aliases: ['nonfat milk', 'fat free milk'] }),
  food('milk-chocolate', 'Chocolate milk', 'dairy', [65, 3.3, 10.4, 1], { cup: 250 }),
  food('milk-oat', 'Oat milk', 'dairy', [50, 1.25, 6.7, 2.1], { cup: 240, src: LABEL }),
  food('milk-almond', 'Almond milk, unsweetened', 'dairy', [15, 0.6, 0.3, 1.2], { cup: 240 }),
  food('yogurt-greek-plain', 'Greek yogurt, plain nonfat', 'dairy', [59, 10.2, 3.6, 0.4], { cup: 245, serving: 170, servingName: 'container (6 oz)', unit: 'scoop', aliases: ['greek yogurt', 'yogurt'] }),
  food('yogurt-greek-flavored', 'Greek yogurt, flavored', 'dairy', [80, 7.5, 11, 1], { cup: 245, serving: 150, servingName: 'cup (5.3 oz)', unit: 'serving', src: LABEL }),
  food('yogurt-fruit', 'Yogurt, fruit (regular)', 'dairy', [99, 4, 19, 1.1], { cup: 245, serving: 170, servingName: 'container (6 oz)', unit: 'serving' }),
  food('cottage-cheese', 'Cottage cheese', 'dairy', [98, 11, 3.4, 4.3], { cup: 226, unit: 'scoop' }),
  food('string-cheese', 'String cheese', 'dairy', [254, 24, 2.8, 16], { piece: 28, pieceName: 'stick' }),
  food('cheese-american', 'American cheese', 'dairy', [330, 18, 7, 26], { slice: 21, aliases: ['cheese slice'] }),
  food('cream-cheese', 'Cream cheese', 'dairy', [342, 6, 4.1, 34], { cup: 232, unit: 'thumb' }),
  food('butter', 'Butter', 'fat', [717, 0.9, 0.1, 81], { cup: 227, piece: 5, pieceName: 'pat', unit: 'thumb', unc: 15 }),
  food('protein-shake', 'Protein shake (ready-to-drink)', 'drink', [49, 9.2, 1.5, 0.9], { cup: 245, serving: 325, servingName: '11 fl oz bottle', unit: 'serving', unc: 5, src: LABEL, aliases: ['protein drink', 'premier protein', 'fairlife'] }),
  food('whey', 'Whey protein powder', 'protein', [400, 78, 10, 5], { serving: 31, servingName: 'scoop (31 g)', unit: 'serving', per: { scoop: 31 }, unc: 5, src: LABEL, aliases: ['protein powder', 'whey', 'protein scoop'] }),

  // ---------------- Fruit ----------------
  food('apple', 'Apple', 'fruit', [52, 0.3, 13.8, 0.2], { piece: 182, pieceName: 'apple', cup: 125 }),
  food('banana', 'Banana', 'fruit', [89, 1.1, 22.8, 0.3], { piece: 118, pieceName: 'banana', cup: 150 }),
  food('orange', 'Orange', 'fruit', [47, 0.9, 11.8, 0.1], { piece: 131, pieceName: 'orange', cup: 180, aliases: ['clementine'] }),
  food('pear', 'Pear', 'fruit', [57, 0.4, 15.2, 0.1], { piece: 178, pieceName: 'pear', cup: 140 }),
  food('grapes', 'Grapes', 'fruit', [69, 0.7, 18, 0.2], { cup: 151, piece: 5, pieceName: 'grape', unit: 'cupped_hand' }),
  food('strawberries', 'Strawberries', 'fruit', [32, 0.7, 7.7, 0.3], { cup: 152, piece: 12, pieceName: 'berry', unit: 'cupped_hand' }),
  food('blueberries', 'Blueberries', 'fruit', [57, 0.7, 14.5, 0.3], { cup: 148, unit: 'cupped_hand' }),
  food('melon', 'Melon (cantaloupe/honeydew)', 'fruit', [34, 0.8, 8.2, 0.2], { cup: 160, aliases: ['cantaloupe', 'honeydew'] }),
  food('watermelon', 'Watermelon', 'fruit', [30, 0.6, 7.6, 0.2], { cup: 152 }),
  food('pineapple', 'Pineapple', 'fruit', [50, 0.5, 13.1, 0.1], { cup: 165 }),
  food('fruit-salad', 'Fruit cup / fruit salad', 'fruit', [50, 0.6, 12.5, 0.2], { cup: 160, unit: 'scoop', src: EST, aliases: ['fruit', 'fruit cup', 'mixed fruit'] }),
  food('raisins', 'Raisins', 'fruit', [299, 3.1, 79, 0.5], { cup: 145, unit: 'thumb' }),

  // ---------------- Snacks & spreads ----------------
  food('peanut-butter', 'Peanut butter', 'fat', [588, 25, 20, 50], { cup: 258, unit: 'thumb', unc: 20, aliases: ['pb', 'peanut butter'] }),
  food('jelly', 'Jelly / jam', 'condiment', [278, 0.4, 69, 0.1], { cup: 320, unit: 'thumb', aliases: ['jam'] }),
  food('honey', 'Honey', 'condiment', [304, 0.3, 82, 0], { cup: 339, unit: 'thumb' }),
  food('trail-mix', 'Trail mix', 'snack', [462, 13.8, 44.9, 29.4], { cup: 150, unit: 'cupped_hand', unc: 25 }),
  food('almonds', 'Almonds', 'snack', [579, 21, 21.6, 49.9], { cup: 143, piece: 1.2, pieceName: 'almond', unit: 'cupped_hand', aliases: ['nuts'] }),
  food('granola-bar', 'Granola bar (chewy)', 'snack', [420, 7, 65, 15], { piece: 24, pieceName: 'bar', unc: 10, src: LABEL }),
  food('protein-bar', 'Protein bar', 'snack', [350, 33, 38, 11], { piece: 60, pieceName: 'bar', unc: 10, src: LABEL }),
  food('chips', 'Potato chips', 'snack', [536, 7, 53, 35], { cup: 20, serving: 28, servingName: '1 oz bag', unit: 'serving', aliases: ['chips', 'crisps', 'lays'] }),
  food('pretzels', 'Pretzels', 'snack', [380, 10, 80, 2.8], { cup: 45, unit: 'cupped_hand' }),
  food('popcorn', 'Popcorn (buttered)', 'snack', [500, 9, 57, 28], { cup: 11, unit: 'bowl', unc: 30 }),

  // ---------------- Desserts ----------------
  food('cookie-cc', 'Chocolate chip cookie', 'dessert', [488, 4.9, 64, 24], { piece: 40, pieceName: 'cookie', unc: 30, aliases: ['cookie', 'cookies', 'choc chip cookie'] }),
  food('cookie-sugar', 'Sugar cookie', 'dessert', [480, 5, 65, 22], { piece: 35, pieceName: 'cookie', unc: 30 }),
  food('brownie', 'Brownie', 'dessert', [420, 5, 62, 18], { piece: 60, pieceName: 'brownie', unc: 30 }),
  food('cake', 'Cake with frosting', 'dessert', [367, 4.1, 55, 16.4], { slice: 95, unc: 30, aliases: ['chocolate cake', 'birthday cake', 'sheet cake'] }),
  food('cheesecake', 'Cheesecake', 'dessert', [321, 5.5, 25.5, 22.5], { slice: 100, unc: 25 }),
  food('pie', 'Fruit pie (apple)', 'dessert', [237, 1.9, 34, 11], { slice: 125, unc: 25, aliases: ['apple pie', 'pie'] }),
  food('cupcake', 'Cupcake', 'dessert', [380, 3.5, 58, 16], { piece: 70, pieceName: 'cupcake', unc: 25 }),
  food('soft-serve', 'Soft serve ice cream', 'dessert', [185, 4.5, 26, 7], { cup: 140, unit: 'cup', unc: 30, src: FNDDS, aliases: ['soft serve', 'froyo machine', 'ice cream machine'] }),
  food('ice-cream', 'Ice cream (scooped)', 'dessert', [207, 3.5, 23.6, 11], { cup: 132, unit: 'scoop', aliases: ['ice cream'] }),
  food('frozen-yogurt', 'Frozen yogurt', 'dessert', [159, 4, 24, 5.6], { cup: 144, unit: 'cup', aliases: ['froyo'] }),
  food('pudding', 'Pudding', 'dessert', [130, 2.8, 22, 3.5], { cup: 260, unit: 'scoop' }),
  food('rice-krispie', 'Rice crispy treat', 'dessert', [410, 3.4, 81, 9], { piece: 40, pieceName: 'bar', unc: 25, aliases: ['rice krispie treat'] }),
  food('candy-bar', 'Chocolate candy bar', 'dessert', [535, 7.7, 59, 29.7], { piece: 43, pieceName: 'bar', unc: 10, aliases: ['chocolate', 'candy bar'] }),

  // ---------------- Drinks ----------------
  food('soda', 'Soda (regular)', 'drink', [38, 0, 10.5, 0], { cup: 248, serving: 370, servingName: '12 fl oz can', unit: 'serving', unc: 5, src: LABEL, aliases: ['coke', 'pepsi', 'sprite', 'pop', 'cola', 'soft drink'] }),
  food('soda-diet', 'Diet soda', 'drink', [0, 0, 0, 0], { cup: 248, serving: 370, servingName: '12 fl oz can', unit: 'serving', unc: 5, src: LABEL, aliases: ['diet coke', 'coke zero', 'zero sugar soda'] }),
  food('oj', 'Orange juice', 'drink', [45, 0.7, 10.4, 0.2], { cup: 248, aliases: ['oj', 'juice'] }),
  food('apple-juice', 'Apple juice', 'drink', [46, 0.1, 11.3, 0.1], { cup: 248 }),
  food('lemonade', 'Lemonade', 'drink', [40, 0, 10.4, 0], { cup: 248, src: FNDDS }),
  food('sweet-tea', 'Sweet tea', 'drink', [33, 0, 8.5, 0], { cup: 240, src: FNDDS, aliases: ['iced tea'] }),
  food('sports-drink', 'Sports drink (Gatorade)', 'drink', [26, 0, 6.4, 0], { cup: 240, serving: 591, servingName: '20 fl oz bottle', unit: 'serving', unc: 5, src: LABEL, aliases: ['gatorade', 'powerade'] }),
  food('energy-drink', 'Energy drink', 'drink', [45, 0, 11, 0], { cup: 240, serving: 473, servingName: '16 fl oz can', unit: 'serving', unc: 5, src: LABEL, aliases: ['monster', 'red bull', 'celsius'] }),
  food('coffee', 'Coffee, black', 'drink', [1, 0.1, 0, 0], { cup: 237, unc: 5, aliases: ['coffee', 'black coffee', 'americano', 'cold brew'] }),
  food('latte', 'Latte (2% milk, 16 oz)', 'drink', [40, 2.7, 4, 1.5], { cup: 240, serving: 473, servingName: '16 oz (grande)', unit: 'serving', unc: 15, src: LABEL, aliases: ['latte', 'cappuccino', 'iced latte'] }),
  food('mocha', 'Mocha (16 oz, whipped cream)', 'drink', [78, 2.9, 9.3, 3.2], { cup: 240, serving: 473, servingName: '16 oz (grande)', unit: 'serving', unc: 20, src: LABEL }),
  food('frappuccino', 'Blended coffee drink (frappé)', 'drink', [80, 1.1, 11.6, 3.3], { cup: 240, serving: 473, servingName: '16 oz (grande)', unit: 'serving', unc: 20, src: LABEL, aliases: ['frappuccino', 'frappe'] }),
  food('hot-chocolate', 'Hot chocolate', 'drink', [77, 3, 11, 2.3], { cup: 250, src: FNDDS, aliases: ['hot cocoa'] }),
  food('smoothie', 'Fruit smoothie', 'drink', [60, 0.8, 14, 0.3], { cup: 245, serving: 473, servingName: '16 oz', unc: 30, src: FNDDS }),
  food('boba', 'Bubble tea (milk tea with pearls)', 'drink', [75, 0.5, 15, 1.5], { cup: 240, serving: 500, servingName: '16 oz with pearls', unit: 'serving', unc: 35, src: EST, aliases: ['boba', 'milk tea', 'bubble tea'] }),
];
