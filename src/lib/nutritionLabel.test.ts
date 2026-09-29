import { describe, expect, it } from 'vitest';
import { fitsRounding, parseNutritionLabel, scaleServings } from './nutritionLabel';
import { labelToItem } from './label';

const parse = parseNutritionLabel;

// ---------- Samples ----------
// 1–3 are verbatim Tesseract output from photos of rendered labels (rotated, blurred, uneven light).

const REAL_GRANOLA_PSM6 = `Oat & Honey  Granola Bar
Nutrition Facts
12 servings per container
Serving size                         1 bar (409)
Amount per serving
Calories         190
——
9% Daily Value*
Total Fat 79                                                       9%
Saturated Fat 19                                      5%
Trans Fat 0g
Cholesterol Omg                                                   0%
Sodium 160mg                                          7%
Total Carbohydrate 299                               11%
Dietary Fiber 29                                           7%
Total Sugars 119
Includes 10g Added Sugars                   20%
Protein 49
Vitamin D 2mcg 10%  Calcium 260mg 20%  Iron Bmg 45%
Potassium 240mg 6%
* The % Daily Value (DV) tells you how much a nutrient in a serving
of food contributes to a daily diet. 2,000 calories a day is used for
general nutrition advice`;

const REAL_YOGURT_PSM3 = `Nutrition Facts

4 servings per container
Serving size                   3/4 cup (1709)

Amount per serving

Calories                  150

——
9% Daily Value*

Total Fat 49                                                              5%
Saturated Fat 2.                                       13%
Trans Fat 0g

Cholesterol 1                                        5%

Sodium 65mg                                                 3%

Total Carbohydrate 1                           7%

Total Carbohydrate 189

iber <1

“DetaryFiber<lg

3

Total Sugars 179
Includes 9g Added Sugars                    18%

Protein 109

Vitamin D 2meg 10%  Calcium 260mg 20%   iron Bmg 45%
Potassium 240mg 6%

+ The % Daily Value (DV) tells you how much a nutrient in a serving
of food contributes to a daily diet. 2,000 calories a day is used for
general nutrition advice`;

// PSM 4 lost most rows on the same photo — a realistic "poor pass".
const REAL_GRANOLA_PSM4 = `Oat & Honey Granola Bar

Nutrition Facts

servings per container
1 bar (409)

190

Protein 49
0% - Calcium 260mg 20% - Iron 8Bmg 45%`;

const CLEAN = `Nutrition Facts
8 servings per container
Serving size 2/3 cup (55g)
Amount per serving
Calories 230
% Daily Value*
Total Fat 8g 10%
Saturated Fat 1g 5%
Trans Fat 0g
Cholesterol 0mg 0%
Sodium 160mg 7%
Total Carbohydrate 37g 13%
Dietary Fiber 4g 14%
Total Sugars 12g
Includes 10g Added Sugars 20%
Protein 3g`;

const NO_SPACES = `NutritionFacts
Servingsize1cup(228g)
Servings Per Container 2
Calories260
TotalFat13g20%
SaturatedFat5g25%
TransFat2g
Cholesterol30mg10%
Sodium660mg28%
TotalCarbohydrate31g10%
DietaryFiber0g0%
Sugars5g
Protein5g`;

const SPLIT_CALORIES = `Nutrition Facts
Serving size 1 can (355mL)
Amount per serving
Calories
140
% Daily Value*
Total Fat 0g 0%
Sodium 45mg 2%
Total Carbohydrate 39g 14%
Total Sugars 39g
Includes 39g Added Sugars 78%
Protein 0g`;

const DUAL_COLUMN = `Nutrition Facts
2 servings per container
Serving size 1 cup (140g)
                 Per serving   Per container
Calories            220            440
                  % DV*          % DV*
Total Fat          5g   6%      10g  13%
Saturated Fat      2g  10%       4g  20%
Trans Fat          0g             0g
Cholesterol       15mg  5%      30mg 10%
Sodium           240mg 10%     480mg 21%
Total Carb.       35g  13%      70g  25%
Dietary Fiber      6g  21%      12g  43%
Total Sugars       1g             2g
Incl. Added Sugars 0g   0%       0g   0%
Protein            9g            18g`;

const CHAR_SWAPS = `Nutrition Facts
Serving size 1 packet (43g)
Calor1es 16O
T0tal Fat 3g 4%
Saturated Fat O.5g 3%
Trans Fat Og
Cho1esterol Omg 0%
Sodium ll0mg 5%
Total Carbohydrate 27g 10%
Dietary Fiber 4g 14%
Total Sugars l2g
Protein SB`;

const LESS_THAN = `Nutrition Facts
Serving size 1 tbsp (15mL)
Calories 5
Total Fat 0g 0%
Sodium 890mg 39%
Total Carbohydrate <1g 0%
Total Sugars <1g
Protein <1g`;

const MISSING_UNITS = `Nutrition Facts
Serving size 1 slice (28g)
Calories 70
Total Fat 1 1%
Sodium 130 6%
Total Carbohydrate 13 5%
Dietary Fiber 1 4%
Protein 3`;

const LINEAR = `Nutrition Facts Serv. size: 1 bar (40g), Servings: 6, Amount per serving: Calories 190, Total Fat 7g (9% DV), Sat. Fat 1g (5% DV), Trans Fat 0g, Cholest. 0mg (0% DV), Sodium 160mg (7% DV), Total Carb. 29g (11% DV), Fiber 2g (7% DV), Total Sugars 11g (Incl. 10g Added Sugars, 20% DV), Protein 4g`;

const PERCENT_FIRST_GRAMS_LATER = `Nutrition Facts
Calories 250
Total Fat 12g 15%
Saturated Fat 3g 15%
Sodium 470mg 20%
Total Carbohydrate 31g 11%
Protein 5g 10%`;

const WRONG_MATH = `Nutrition Facts
Calories 120
Total Fat 25g 32%
Total Carbohydrate 20g 7%
Protein 5g`;

const G_AS_9_WITH_CALORIES = `Nutrition Facts
Calories 110
Total Fat 09
Total Carbohydrate 19
Protein 89`;

const HEADER_WITH_PRODUCT = `ACME FOODS
Chunky Peanut Butter
NET WT 16 OZ
Nutrition Facts
About 15 servings per container
Serving size 2 Tbsp (32g)
Calories 190
Total Fat 16g 21%
Total Carbohydrate 7g 3%
Protein 7g`;

// ---------- Tests ----------

describe('clean labels', () => {
  it('reads every field of a standard label', () => {
    const r = parse(CLEAN);
    expect(r.values).toEqual({
      calories: 230,
      totalFat: 8,
      satFat: 1,
      transFat: 0,
      cholesterol: 0,
      sodium: 160,
      totalCarb: 37,
      fiber: 4,
      totalSugars: 12,
      addedSugars: 10,
      protein: 3,
    });
    expect(r.servingSizeText).toBe('2/3 cup (55g)');
    expect(r.servingSizeG).toBe(55);
    expect(r.servingsPerContainer).toBe(8);
    expect(r.check).toEqual({});
    expect(r.calorieCheck).toEqual({ fromMacros: 232, stated: 230, ok: true });
    expect(r.usable).toBe(true);
    expect(r.found).toBe(11);
  });
  it('never mistakes % Daily Value for grams', () => {
    const r = parse(PERCENT_FIRST_GRAMS_LATER);
    expect(r.values).toMatchObject({ totalFat: 12, satFat: 3, sodium: 470, totalCarb: 31, protein: 5 });
  });
  it('finds a product name above the panel', () => {
    const r = parse(HEADER_WITH_PRODUCT);
    expect(r.productName).toBe('Chunky Peanut Butter');
    expect(r.servingsPerContainer).toBe(15);
    expect(r.servingSizeG).toBe(32);
  });
});

describe('real Tesseract output (photo of a label)', () => {
  it('granola, single-block pass: fixes every "g"→"9" misread using rounding + calorie math', () => {
    const r = parse(REAL_GRANOLA_PSM6);
    expect(r.values).toEqual({
      calories: 190,
      totalFat: 7,
      satFat: 1,
      transFat: 0,
      cholesterol: 0,
      sodium: 160,
      totalCarb: 29,
      fiber: 2,
      totalSugars: 11,
      addedSugars: 10,
      protein: 4,
    });
    expect(r.servingSizeG).toBe(40);
    expect(r.servingSizeText).toBe('1 bar (40g)');
    expect(r.servingsPerContainer).toBe(12);
    expect(r.productName).toBe('Oat & Honey Granola Bar');
    expect(r.calorieCheck?.ok).toBe(true);
    // Guessed "g"→"9" readings are flagged for a quick check, unless the calorie math confirms them:
    // 9×7 + 4×29 + 4×4 = 195 ≈ 190, so fat/carbs/protein are trusted; sat fat/fiber/sugars can't be verified.
    expect(r.check.totalFat).toBeUndefined();
    expect(r.check.protein).toBeUndefined();
    expect(r.check.satFat).toMatch(/Read “19” as 1 g/);
    expect(r.check.totalSugars).toMatch(/Read “119” as 11 g/);
  });

  it('yogurt, auto-layout pass: duplicate rows, "2." and "<lg" handled; doubtful fields flagged', () => {
    const r = parse(REAL_YOGURT_PSM3);
    expect(r.values).toMatchObject({ calories: 150, totalFat: 4, transFat: 0, sodium: 65, totalCarb: 18, fiber: 0.5, totalSugars: 17, addedSugars: 9, protein: 10 });
    expect(r.servingSizeG).toBe(170);
    expect(r.servingsPerContainer).toBe(4);
    expect(r.check.satFat).toMatch(/partly readable/);
    expect(r.check.cholesterol).toBeTruthy(); // "1" can't be right for cholesterol
    expect(r.calorieCheck?.ok).toBe(true);
  });

  it('merges a poor pass with a good one', () => {
    const r = parse([REAL_GRANOLA_PSM4, REAL_GRANOLA_PSM6]);
    expect(r.values).toMatchObject({ calories: 190, totalFat: 7, totalCarb: 29, protein: 4 });
  });

  it('a poor pass alone is not "usable" enough to trust', () => {
    const r = parse(REAL_GRANOLA_PSM4);
    expect(r.values.protein).toBe(4);
    expect(r.values.calories).toBeUndefined(); // "190" alone on a line has no keyword
    expect(r.usable).toBe(false);
  });
});

describe('layout variations', () => {
  it('no spaces at all ("TotalFat13g")', () => {
    const r = parse(NO_SPACES);
    expect(r.values).toMatchObject({ calories: 260, totalFat: 13, satFat: 5, transFat: 2, cholesterol: 30, sodium: 660, totalCarb: 31, fiber: 0, totalSugars: 5, protein: 5 });
    expect(r.servingSizeG).toBe(228);
    expect(r.servingsPerContainer).toBe(2);
  });
  it('"Calories" on one line, the number on the next', () => {
    const r = parse(SPLIT_CALORIES);
    expect(r.values.calories).toBe(140);
    expect(r.servingSizeMl).toBe(355);
    expect(r.values.addedSugars).toBe(39);
    expect(r.calorieCheck?.ok).toBe(true);
  });
  it('dual-column label: uses per-serving values', () => {
    const r = parse(DUAL_COLUMN);
    expect(r.values).toMatchObject({ calories: 220, totalFat: 5, satFat: 2, cholesterol: 15, sodium: 240, totalCarb: 35, fiber: 6, totalSugars: 1, protein: 9 });
    expect(r.servingsPerContainer).toBe(2);
  });
  it('linear (one-line) label', () => {
    const r = parse(LINEAR);
    expect(r.values).toMatchObject({ calories: 190, totalFat: 7, satFat: 1, transFat: 0, cholesterol: 0, sodium: 160, totalCarb: 29, fiber: 2, totalSugars: 11, addedSugars: 10, protein: 4 });
    expect(r.servingSizeG).toBe(40);
  });
});

describe('OCR character swaps', () => {
  it('O↔0, l/I↔1, S↔5, B↔8 in numbers and keywords', () => {
    const r = parse(CHAR_SWAPS);
    expect(r.values).toMatchObject({ calories: 160, totalFat: 3, satFat: 0.5, transFat: 0, cholesterol: 0, sodium: 110, totalCarb: 27, fiber: 4, totalSugars: 12, protein: 58 });
    // "SB" → 58 g protein makes the calories impossible, so it's flagged rather than trusted.
    expect(r.calorieCheck?.ok).toBe(false);
    expect(r.check.protein).toMatch(/Calories don’t add up/);
  });
  it('"g" read as "9" with no calories to check against: guessed and flagged', () => {
    const r = parse('Nutrition Facts\nTotal Fat 79\nTotal Carbohydrate 299\nProtein 49');
    expect(r.values).toMatchObject({ totalFat: 7, totalCarb: 29, protein: 4 });
    expect(r.check.totalFat).toMatch(/Read “79” as 7 g/);
  });
  it('"g" read as "9": picks the reading that fits the calorie math', () => {
    // 0g fat, 19 → 1g carbs? or 19 carbs?  89 → 8g protein.  110 kcal = 4·19 + 4·8 + 0 ≈ 108 ✓
    const r = parse(G_AS_9_WITH_CALORIES);
    expect(r.values).toMatchObject({ totalFat: 0, totalCarb: 19, protein: 8 });
    expect(r.calorieCheck?.ok).toBe(true);
  });
  it('"<1g" → 0.5 and "0g" → 0', () => {
    const r = parse(LESS_THAN);
    expect(r.values).toMatchObject({ calories: 5, totalFat: 0, sodium: 890, totalCarb: 0.5, totalSugars: 0.5, protein: 0.5 });
    expect(r.servingSizeMl).toBe(15);
  });
  it('missing units are read but flagged', () => {
    const r = parse(MISSING_UNITS);
    expect(r.values).toMatchObject({ calories: 70, totalFat: 1, sodium: 130, totalCarb: 13, fiber: 1, protein: 3 });
    expect(r.check.totalFat).toMatch(/No unit/);
    expect(r.check.protein).toMatch(/No unit/);
  });
});

describe('calorie-math sanity check', () => {
  it('flags values when 4P + 4C + 9F is off by more than 20%', () => {
    const r = parse(WRONG_MATH);
    // 9×25 + 4×20 + 4×5 = 325 vs 120
    expect(r.calorieCheck).toEqual({ fromMacros: 325, stated: 120, ok: false });
    for (const f of ['calories', 'totalFat', 'totalCarb', 'protein'] as const) expect(r.check[f]).toMatch(/≈ 325 kcal vs 120/);
  });
  it('passes within 20%', () => {
    expect(parse(CLEAN).calorieCheck?.ok).toBe(true);
  });
  it('flags missing core fields', () => {
    const r = parse('Nutrition Facts\nCalories 100\nProtein 5g');
    expect(r.check.totalFat).toMatch(/Not found/);
    expect(r.check.totalCarb).toMatch(/Not found/);
    expect(r.calorieCheck).toBeNull();
  });
});

describe('robustness', () => {
  it('never throws on garbage and reports nothing usable', () => {
    const junk = [
      '',
      '   ',
      '%%%%',
      '0000000000000',
      'Calories',
      'Protein Protein Protein',
      '🍕🍕🍕',
      'Nutrition Facts',
      'lorem ipsum dolor sit amet',
      'x'.repeat(50000),
      '(((((((',
      '<<<<<1g',
      'Total Fat 99999999999g',
    ];
    for (const j of junk) {
      let r!: ReturnType<typeof parse>;
      expect(() => (r = parse(j))).not.toThrow();
      expect(r.usable).toBe(false);
    }
    expect(() => parse(null as unknown as string)).not.toThrow();
    expect(() => parse([undefined, 42] as unknown as string[])).not.toThrow();
  });
  it('ignores footnotes about 2,000 calories', () => {
    const r = parse('* 2,000 calories a day is used for general nutrition advice.\nCalories 90\nProtein 2g');
    expect(r.values.calories).toBe(90);
  });
});

describe('FDA rounding rules', () => {
  it('knows which numbers can appear on a label', () => {
    expect(fitsRounding('calories', 190)).toBe(true);
    expect(fitsRounding('calories', 195)).toBe(false);
    expect(fitsRounding('calories', 45)).toBe(true);
    expect(fitsRounding('totalFat', 2.5)).toBe(true);
    expect(fitsRounding('totalFat', 7.5)).toBe(false);
    expect(fitsRounding('sodium', 65)).toBe(true);
    expect(fitsRounding('sodium', 165)).toBe(false);
    expect(fitsRounding('protein', 0.5)).toBe(true);
    expect(fitsRounding('protein', 4.5)).toBe(false);
  });
});

describe('servings eaten', () => {
  it('scales and rounds (kcal/mg whole, grams to 0.1)', () => {
    const v = { calories: 190, totalFat: 7, totalCarb: 29, protein: 4, sodium: 165, satFat: 0.5 };
    expect(scaleServings(v, 1.5)).toEqual({ calories: 285, totalFat: 10.5, totalCarb: 43.5, protein: 6, sodium: 248, satFat: 0.8 });
    expect(scaleServings(v, 1 / 3)).toEqual({ calories: 63, totalFat: 2.3, totalCarb: 9.7, protein: 1.3, sodium: 55, satFat: 0.2 });
    expect(scaleServings(v, 0)).toEqual({ calories: 0, totalFat: 0, totalCarb: 0, protein: 0, sodium: 0, satFat: 0 });
  });
  it('logged item uses the same multiplication', () => {
    const item = labelToItem(
      { name: 'Bar', servingText: '1 bar', servingGrams: 40, servingsPerContainer: 12, calories: 190, protein: 4, carbs: 29, fat: 7, servingsEaten: 0.5 },
      null,
    );
    expect(item).toMatchObject({ kcal: 95, protein: 2, carbs: 14.5, fat: 3.5, grams: 20, portionText: '0.5 × 1 bar' });
  });
});
