import { describe, expect, it } from 'vitest';
import { DEFAULT_PORTION_REFS as R } from './defaults';
import { mergeFoods } from './foods';
import { parseQuickText, splitItems } from './parser';

const foods = mergeFoods([]);
const parse = (t: string) => parseQuickText(t, foods, R);
const one = (t: string) => {
  const r = parse(t);
  expect(r, t).toHaveLength(1);
  return r[0];
};
const name = (t: string) => one(t).food?.name;

describe('splitting', () => {
  it('splits on commas, "and", newlines, semicolons, plus', () => {
    expect(splitItems('rice, chicken and broccoli; 2 cookies\nmilk + banana', foods)).toEqual([
      'rice',
      'chicken',
      'broccoli',
      '2 cookies',
      'milk',
      'banana',
    ]);
  });
  it('keeps food names containing "and"/"with"/"&" together', () => {
    expect(splitItems('mac and cheese and a coke', foods)).toEqual(['mac and cheese', 'a coke']);
    expect(splitItems('scoop of mac & cheese, beef and broccoli', foods)).toEqual(['scoop of mac and cheese', 'beef and broccoli']);
    expect(splitItems('pasta with marinara', foods)).toEqual(['pasta with marinara']);
    expect(splitItems('chicken with rice', foods)).toEqual(['chicken', 'rice']);
  });
  it('keeps "1 and a half" as a number', () => {
    expect(splitItems('1 and a half cups rice', foods)).toEqual(['1.5 cups rice']);
  });
  it('ignores empty pieces and stray punctuation', () => {
    expect(splitItems(' , ,rice,, !!', foods)).toEqual(['rice']);
  });
});

describe('the example from the spec', () => {
  it('half plate fried rice, palm of orange chicken, fist broccoli, 2 cookies', () => {
    const r = parse('half plate fried rice, palm of orange chicken, fist broccoli, 2 cookies');
    expect(r.map((x) => x.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(r.map((x) => x.food?.name)).toEqual(['Fried rice', 'Orange chicken', 'Broccoli, steamed', 'Chocolate chip cookie']);
    expect(r.map((x) => [x.spec?.unit, x.spec?.qty])).toEqual([
      ['plate', 0.5],
      ['palm', 1],
      ['fist', 1],
      ['piece', 2],
    ]);
    // 1.5 cups × 170 g = 255 g × 1.70 kcal/g = 433.5 kcal
    expect(r[0].item?.kcal).toBeCloseTo(433.5, -1);
    expect(r[3].item?.kcal).toBe(390);
  });
});

describe('quantities', () => {
  it.each([
    ['half a plate of rice', 0.5],
    ['½ plate rice', 0.5],
    ['1/2 plate rice', 0.5],
    ['quarter plate rice', 0.25],
    ['¼ plate rice', 0.25],
    ['a third of a plate of rice', 1 / 3],
    ['⅓ plate rice', 1 / 3],
    ['1.5 cups rice', 1.5],
    ['1 1/2 cups rice', 1.5],
    ['1½ cups rice', 1.5],
    ['one and a half cups rice', 1.5],
    ['three quarters cup rice', 0.75],
    ['two scoops rice', 2],
    ['a scoop of rice', 1],
    ['scoop rice', 1],
    ['full plate of rice', 1],
  ])('%s → %d', (text, qty) => {
    expect(one(text).spec?.qty).toBeCloseTo(qty, 6);
    expect(one(text).food?.name).toBe('White rice');
  });

  it('understands "a couple" and "a few"', () => {
    expect(one('a couple cookies').spec).toMatchObject({ unit: 'piece', qty: 2 });
    expect(one('a few nuggets').spec).toMatchObject({ unit: 'piece', qty: 3 });
    expect(one('a dozen nuggets').spec).toMatchObject({ unit: 'piece', qty: 12 });
  });
  it('handles x-multipliers', () => {
    expect(one('cookie x3').spec).toMatchObject({ unit: 'piece', qty: 3 });
    expect(one('2x hard boiled egg').spec).toMatchObject({ unit: 'piece', qty: 2 });
  });
  it('handles attached units', () => {
    expect(one('200g chicken breast').spec).toMatchObject({ unit: 'g', qty: 200 });
    expect(one('8oz steak').spec).toMatchObject({ unit: 'oz', qty: 8 });
    expect(one('steak 8 oz').spec).toMatchObject({ unit: 'oz', qty: 8 });
    expect(one('half lb ground beef').spec).toMatchObject({ unit: 'oz', qty: 8 });
    expect(one('16 fl oz milk').spec?.qty).toBeCloseTo(2, 6);
  });
});

describe('portions and sizes', () => {
  it.each([
    ['palm of salmon', 'palm'],
    ['fist of green beans', 'fist'],
    ['handful of almonds', 'cupped_hand'],
    ['cupped hand of grapes', 'cupped_hand'],
    ['thumb of peanut butter', 'thumb'],
    ['ladle of chili', 'ladle'],
    ['bowl of pho', 'bowl'],
    ['clamshell of pasta', 'clamshell'],
    ['to-go box of lo mein', 'clamshell'],
    ['2 slices pepperoni pizza', 'slice'],
    ['can of coke', 'serving'],
    ['glass of milk', 'cup'],
    ['2 tbsp ranch', 'tbsp'],
  ])('%s → %s', (text, unit) => {
    expect(one(text).status).toBe('ok');
    expect(one(text).spec?.unit).toBe(unit);
  });
  it.each([
    ['small scoop mac and cheese', 'small'],
    ['big bowl of pho', 'large'],
    ['large palm chicken', 'large'],
    ['heaping scoop of mashed potatoes', 'heaping'],
    ['huge plate of pasta', 'heaping'],
    ['regular scoop rice', 'normal'],
  ])('%s → %s', (text, size) => {
    expect(one(text).spec?.size).toBe(size);
  });
  it('½ clamshell of pasta', () => {
    expect(one('½ clamshell pasta').spec).toMatchObject({ unit: 'clamshell', qty: 0.5 });
  });
  it('salad-bar dressing ladle is small', () => {
    const r = one('ladle of ranch');
    expect(r.item?.kcal).toBe(129); // 30 g × 4.3
  });
  it('uses the food default portion when none is given', () => {
    expect(one('pizza').spec).toMatchObject({ unit: 'slice', qty: 1 });
    expect(one('banana').spec).toMatchObject({ unit: 'piece', qty: 1 });
    expect(one('coke').spec).toMatchObject({ unit: 'serving', qty: 1 });
  });
  it('falls back with a warning when the portion does not fit the food', () => {
    const r = one('fist of pizza');
    expect(r.food?.name).toBe('Cheese pizza');
    expect(r.spec?.unit).toBe('slice');
    expect(r.warning).toMatch(/doesn’t fit/);
  });
  it('keeps unit words that are part of a food name', () => {
    expect(one('burrito bowl').food?.name).toBe('Burrito bowl');
    expect(one('burrito bowl').spec?.unit).toBe('bowl');
    expect(one('bowl of pho').food?.name).toBe('Pho (beef)');
    expect(one('cup of rice').food?.name).toBe('White rice');
  });
});

describe('fuzzy matching', () => {
  it.each([
    ['brocoli', 'Broccoli, steamed'],
    ['chiken nugets', 'Chicken nuggets'],
    ['orange chiken', 'Orange chicken'],
    ['scrambled egs', 'Scrambled eggs'],
    ['cookies', 'Chocolate chip cookie'],
    ['fries', 'French fries'],
    ['potatoes', 'Roasted potatoes'],
    ['mashed potato', 'Mashed potatoes'],
    ['mac n cheese', 'Mac and cheese'],
    ['mac and chese', 'Mac and cheese'],
    ['strawberries', 'Strawberries'],
    ['dumplings', 'Dumplings, steamed'],
    ['diet coke', 'Diet soda'],
    ['pho', 'Pho (beef)'],
    ['phở', 'Pho (beef)'],
    ['general tsos', "General Tso's chicken"],
    ['grilled chicken', 'Grilled chicken breast'],
    ['chicken', 'Grilled chicken breast'],
    ['pepperoni pizza', 'Pepperoni pizza'],
    ['ramen', 'Ramen (restaurant, with broth)'],
    ['greek yogurt', 'Greek yogurt, plain nonfat'],
    ['pb', 'Peanut butter'],
    ['chickpeas', 'Chickpeas'],
    ['croutons', 'Croutons'],
    ['soft serve', 'Soft serve ice cream'],
    ['OJ', 'Orange juice'],
  ])('%s → %s', (text, expected) => {
    expect(name(text)).toBe(expected);
  });
});

describe('messy input', () => {
  it('handles capitals, extra spaces and trailing punctuation', () => {
    const r = parse('  Half Plate   FRIED rice ,Palm of Orange Chicken.  ');
    expect(r.map((x) => x.food?.name)).toEqual(['Fried rice', 'Orange chicken']);
  });
  it('handles a sentence-like description', () => {
    const r = parse('I had a big bowl of pho and 2 egg rolls, then a heaping scoop of mac & cheese');
    expect(r.map((x) => x.food?.name)).toEqual(['Pho (beef)', 'Egg roll', 'Mac and cheese']);
    expect(r[0].spec?.size).toBe('large');
    expect(r[1].spec).toMatchObject({ unit: 'piece', qty: 2 });
    expect(r[2].spec).toMatchObject({ unit: 'scoop', size: 'heaping' });
  });
  it('flags items it cannot match, with no crash', () => {
    const r = parse('rice, zxqv blorp, 2 cookies');
    expect(r.map((x) => x.status)).toEqual(['ok', 'unmatched', 'ok']);
    expect(r[1].item).toBeNull();
    expect(r[1].query).toBe('zxqv blorp');
  });
  it('flags a lone number or unit as unmatched', () => {
    expect(one('2').status).toBe('unmatched');
    expect(one('half plate').status).toBe('unmatched');
  });
  it('offers suggestions for near misses', () => {
    const r = one('chicken tikka');
    expect(r.food).not.toBeNull();
    expect(r.suggestions.length).toBeGreaterThan(0);
  });
  it('returns nothing for empty input', () => {
    expect(parse('')).toEqual([]);
    expect(parse('   ,  ')).toEqual([]);
  });
  it('never throws on odd input', () => {
    for (const t of ['////', '1/0 plate rice', '...', '½½½', 'and and and', '9999999 cookies', '🍕 pizza']) {
      expect(() => parse(t)).not.toThrow();
    }
  });
  it('prefers favorites/recents on ties via boost', () => {
    const brown = foods.find((f) => f.id === 'b:rice-brown')!;
    const r = parseQuickText('rice', foods, R, new Map([[brown.id, 0.04]]));
    // An exact alias ("rice" → white rice) still wins over a boosted partial match.
    expect(r[0].food?.name).toBe('White rice');
  });
});
