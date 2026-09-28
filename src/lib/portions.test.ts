import { describe, expect, it } from 'vitest';
import { SEED_FOODS } from '../data/seedFoods';
import { DEFAULT_PORTION_REFS as R } from './defaults';
import { availableUnits, describePortion, gramsPerUnit, itemFromFood, portionGrams, roundRange, sumItems } from './portions';
import type { Food } from './types';

const byId = (id: string): Food => {
  const f = SEED_FOODS.find((x) => x.id === `b:${id}`);
  if (!f) throw new Error(id);
  return f;
};
const rice = byId('rice-white');
const chicken = byId('chicken-breast');
const cookie = byId('cookie-cc');
const ranch = byId('ranch');

describe('portion references', () => {
  it('½ plate of starch ≈ 1.5 cups', () => {
    expect(portionGrams(rice, { unit: 'plate', qty: 0.5, size: 'normal' }, R)).toBeCloseTo(1.5 * 158, 6);
  });
  it('¼ plate of starch ≈ ¾ cup', () => {
    expect(portionGrams(rice, { unit: 'plate', qty: 0.25, size: 'normal' }, R)).toBeCloseTo(0.75 * 158, 6);
  });
  it('¼ plate of meat ≈ 4.5 oz', () => {
    expect(portionGrams(chicken, { unit: 'plate', qty: 0.25, size: 'normal' }, R)).toBeCloseTo(4.5 * 28.3495, 2);
  });
  it('palm ≈ 4 oz (113 g)', () => {
    expect(gramsPerUnit(chicken, 'palm', R)).toBeCloseTo(113.4, 1);
  });
  it('fist = 1 cup, cupped hand = ½ cup, scoop = ½ cup, ladle = ¾ cup', () => {
    expect(gramsPerUnit(rice, 'fist', R)).toBe(158);
    expect(gramsPerUnit(rice, 'cupped_hand', R)).toBe(79);
    expect(gramsPerUnit(rice, 'scoop', R)).toBe(79);
    expect(gramsPerUnit(rice, 'ladle', R)).toBeCloseTo(118.5, 6);
  });
  it('thumb = 1 tbsp', () => {
    const pb = byId('peanut-butter');
    expect(gramsPerUnit(pb, 'thumb', R)).toBeCloseTo(258 / 16, 6);
  });
  it('clamshell full ≈ 3.5 cups, half allowed', () => {
    const mixed = byId('mixed-plate');
    expect(portionGrams(mixed, { unit: 'clamshell', qty: 0.5, size: 'normal' }, R)).toBeCloseTo(1.75 * 180, 6);
  });
  it('size modifiers ×0.75 / ×1 / ×1.25 / ×1.5', () => {
    const base = portionGrams(rice, { unit: 'scoop', qty: 1, size: 'normal' }, R)!;
    expect(portionGrams(rice, { unit: 'scoop', qty: 1, size: 'small' }, R)).toBeCloseTo(base * 0.75, 6);
    expect(portionGrams(rice, { unit: 'scoop', qty: 1, size: 'large' }, R)).toBeCloseTo(base * 1.25, 6);
    expect(portionGrams(rice, { unit: 'scoop', qty: 1, size: 'heaping' }, R)).toBeCloseTo(base * 1.5, 6);
  });
  it('respects edited reference sizes', () => {
    const bigPlates = { ...R, plateFullCups: 4 };
    expect(portionGrams(rice, { unit: 'plate', qty: 0.5, size: 'normal' }, bigPlates)).toBeCloseTo(2 * 158, 6);
  });
  it('per-food override: salad-bar dressing ladle is ~1 oz, not ¾ cup', () => {
    expect(gramsPerUnit(ranch, 'ladle', R)).toBe(30);
  });
  it('pieces and slices use per-food weights', () => {
    expect(portionGrams(cookie, { unit: 'piece', qty: 2, size: 'normal' }, R)).toBe(80);
    const pizza = byId('pizza-cheese');
    expect(gramsPerUnit(pizza, 'slice', R)).toBe(107);
    expect(gramsPerUnit(pizza, 'fist', R)).toBeNull(); // no cup weight for pizza
    expect(gramsPerUnit(rice, 'slice', R)).toBeNull();
  });
  it('nominal (label-only) foods only support servings', () => {
    const label: Food = { ...rice, id: 'c:x', nominal: true, servingGrams: 100, servingName: '1 bar', gramsPerCup: undefined };
    expect(availableUnits(label, R)).toEqual(['serving']);
  });
});

describe('portion → calories', () => {
  it('½ plate white rice ≈ 308 kcal', () => {
    const item = itemFromFood(rice, { unit: 'plate', qty: 0.5, size: 'normal' }, R)!;
    // 1.5 cups × 158 g = 237 g × 1.30 kcal/g = 308
    expect(item.kcal).toBe(308);
    expect(item.portionText).toBe('½ plate');
  });
  it('palm of grilled chicken ≈ 187 kcal, 35 g protein', () => {
    const item = itemFromFood(chicken, { unit: 'palm', qty: 1, size: 'normal' }, R)!;
    expect(item.kcal).toBe(187);
    expect(item.protein).toBeCloseTo(35.2, 1);
  });
  it('2 cookies = 390 kcal', () => {
    const item = itemFromFood(cookie, { unit: 'piece', qty: 2, size: 'normal' }, R)!;
    expect(item.kcal).toBe(390);
    expect(item.portionText).toBe('2 cookies');
  });
  it('returns null when the portion does not apply', () => {
    expect(itemFromFood(rice, { unit: 'slice', qty: 1, size: 'normal' }, R)).toBeNull();
  });
});

describe('describePortion', () => {
  it('formats fractions and sizes', () => {
    expect(describePortion({ unit: 'plate', qty: 0.25, size: 'normal' })).toBe('¼ plate');
    expect(describePortion({ unit: 'plate', qty: 1 / 3, size: 'heaping' })).toBe('⅓ plate (heaping)');
    expect(describePortion({ unit: 'fist', qty: 2, size: 'normal' })).toBe('2 fists');
    expect(describePortion({ unit: 'piece', qty: 3, size: 'normal' }, { pieceName: 'link/patty' })).toBe('3 links/patties');
  });
});

describe('totals with uncertainty', () => {
  it('combines uncertainties as root-sum-square', () => {
    const t = sumItems([
      { kcal: 300, protein: 6, carbs: 60, fat: 1, uncertaintyPct: 15 },
      { kcal: 400, protein: 20, carbs: 30, fat: 20, uncertaintyPct: 35 },
    ]);
    expect(t.kcal).toBe(700);
    // sqrt(45² + 140²) = 147.05
    expect(t.kcalRange).toBeCloseTo(147.05, 1);
    expect(roundRange(t.kcalRange)).toBe(150);
  });
});

describe('seed database', () => {
  it('has ~150+ foods with unique ids and sane values', () => {
    expect(SEED_FOODS.length).toBeGreaterThanOrEqual(150);
    const ids = new Set(SEED_FOODS.map((f) => f.id));
    expect(ids.size).toBe(SEED_FOODS.length);
    for (const f of SEED_FOODS) {
      // Atwater check: macros should explain calories (skip low-kcal, fiber-heavy veg).
      const atwater = f.protein100 * 4 + f.carbs100 * 4 + f.fat100 * 9;
      if (f.kcal100 > 60) expect(Math.abs(atwater - f.kcal100) / f.kcal100, f.name).toBeLessThan(0.2);
      // Default portion must be usable.
      expect(gramsPerUnit(f, f.defaultUnit, R), `${f.name} default ${f.defaultUnit}`).not.toBeNull();
      expect(f.source.length).toBeGreaterThan(0);
    }
  });
});
