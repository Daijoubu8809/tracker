import type { Food, LoggedItem, Nutrition, PortionRefs, PortionSpec, PortionUnit, SizeMod } from './types';
import { G_PER_OZ } from './units';

export const SIZE_FACTOR: Record<SizeMod, number> = {
  small: 0.75,
  normal: 1,
  large: 1.25,
  heaping: 1.5,
};

export const SIZE_LABEL: Record<SizeMod, string> = {
  small: 'Small',
  normal: 'Normal',
  large: 'Large',
  heaping: 'Heaping',
};

export const SIZES: readonly SizeMod[] = ['small', 'normal', 'large', 'heaping'];

export const UNIT_LABEL: Record<PortionUnit, { one: string; many: string }> = {
  plate: { one: 'plate', many: 'plates' },
  palm: { one: 'palm', many: 'palms' },
  fist: { one: 'fist', many: 'fists' },
  cupped_hand: { one: 'cupped hand', many: 'cupped hands' },
  thumb: { one: 'thumb', many: 'thumbs' },
  scoop: { one: 'scoop', many: 'scoops' },
  ladle: { one: 'ladle', many: 'ladles' },
  bowl: { one: 'bowl', many: 'bowls' },
  clamshell: { one: 'clamshell', many: 'clamshells' },
  slice: { one: 'slice', many: 'slices' },
  piece: { one: 'piece', many: 'pieces' },
  serving: { one: 'serving', many: 'servings' },
  cup: { one: 'cup', many: 'cups' },
  tbsp: { one: 'tbsp', many: 'tbsp' },
  tsp: { one: 'tsp', many: 'tsp' },
  oz: { one: 'oz', many: 'oz' },
  g: { one: 'g', many: 'g' },
};

/** Order portions are offered in the tap-to-build picker. */
export const UNIT_ORDER: readonly PortionUnit[] = [
  'piece',
  'slice',
  'serving',
  'plate',
  'palm',
  'fist',
  'cupped_hand',
  'scoop',
  'ladle',
  'bowl',
  'clamshell',
  'thumb',
  'cup',
  'tbsp',
  'tsp',
  'oz',
  'g',
];

/** Protein foods are measured by weight on a plate (¼ plate ≈ 4–5 oz); everything else by volume. */
export function plateByWeight(food: Food): boolean {
  return food.category === 'protein';
}

/** Volume in cups for household volume units (null if the unit isn't volume-based). */
export function unitCups(unit: PortionUnit, refs: PortionRefs): number | null {
  switch (unit) {
    case 'fist':
      return refs.fistCups;
    case 'cupped_hand':
      return refs.cuppedHandCups;
    case 'thumb':
      return refs.thumbTbsp / 16;
    case 'scoop':
      return refs.scoopCups;
    case 'ladle':
      return refs.ladleCups;
    case 'bowl':
      return refs.bowlCups;
    case 'clamshell':
      return refs.clamshellCups;
    case 'cup':
      return 1;
    case 'tbsp':
      return 1 / 16;
    case 'tsp':
      return 1 / 48;
    default:
      return null;
  }
}

/**
 * Grams in ONE of `unit` for this food (before quantity and size modifier).
 * Returns null when the unit doesn't make sense for the food
 * (e.g. "slice" of rice, or any volume unit for a food with no cup weight).
 */
export function gramsPerUnit(food: Food, unit: PortionUnit, refs: PortionRefs): number | null {
  const override = food.gramsPer?.[unit];
  if (override && override > 0) return override;
  if (food.nominal) {
    return unit === 'serving' ? (food.servingGrams ?? 100) : null;
  }
  switch (unit) {
    case 'g':
      return 1;
    case 'oz':
      return G_PER_OZ;
    case 'palm':
      return refs.palmOz * G_PER_OZ;
    case 'plate':
      if (plateByWeight(food)) return refs.plateFullMeatOz * G_PER_OZ;
      return food.gramsPerCup ? refs.plateFullCups * food.gramsPerCup : null;
    case 'slice':
      return food.gramsPerSlice ?? null;
    case 'piece':
      return food.gramsPerPiece ?? null;
    case 'serving':
      return food.servingGrams ?? null;
    default: {
      const cups = unitCups(unit, refs);
      return cups != null && food.gramsPerCup ? cups * food.gramsPerCup : null;
    }
  }
}

export function availableUnits(food: Food, refs: PortionRefs): PortionUnit[] {
  return UNIT_ORDER.filter((u) => gramsPerUnit(food, u, refs) != null);
}

export function portionGrams(food: Food, spec: PortionSpec, refs: PortionRefs): number | null {
  const per = gramsPerUnit(food, spec.unit, refs);
  if (per == null) return null;
  return per * spec.qty * SIZE_FACTOR[spec.size];
}

export function nutritionForGrams(food: Food, grams: number): Nutrition {
  const f = grams / 100;
  const n: Nutrition = {
    kcal: food.kcal100 * f,
    protein: food.protein100 * f,
    carbs: food.carbs100 * f,
    fat: food.fat100 * f,
  };
  if (food.fiber100 != null) n.fiber = food.fiber100 * f;
  if (food.sodium100 != null) n.sodium = food.sodium100 * f;
  return n;
}

const FRACTIONS: [number, string][] = [
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
];

export function formatQty(q: number): string {
  const whole = Math.floor(q + 1e-9);
  const frac = q - whole;
  if (frac < 0.02) return String(whole);
  for (const [v, s] of FRACTIONS) {
    if (Math.abs(frac - v) < 0.02) return whole ? `${whole}${s}` : s;
  }
  return String(Math.round(q * 100) / 100);
}

/** "½ plate", "2 cookies", "1 palm (large)", "1 can". */
export function describePortion(spec: PortionSpec, food?: Pick<Food, 'pieceName' | 'servingName'>): string {
  const { unit, qty, size } = spec;
  let name: string;
  const plural = qty > 1;
  if (unit === 'piece' && food?.pieceName) {
    name = plural ? pluralize(food.pieceName) : food.pieceName;
  } else if (unit === 'serving' && food?.servingName) {
    name = food.servingName;
    return `${formatQty(qty)} × ${name}${size !== 'normal' ? ` (${SIZE_LABEL[size].toLowerCase()})` : ''}`;
  } else {
    name = plural ? UNIT_LABEL[unit].many : UNIT_LABEL[unit].one;
  }
  const g = unit === 'g' ? `${Math.round(qty)} g` : unit === 'oz' ? `${formatQty(qty)} oz` : `${formatQty(qty)} ${name}`;
  return size === 'normal' ? g : `${g} (${SIZE_LABEL[size].toLowerCase()})`;
}

function pluralize(w: string): string {
  if (w.includes('/')) return w.split('/').map(pluralize).join('/');
  if (/(s|x|ch|sh)$/.test(w)) return w + 'es';
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
  return w + 's';
}

/** The item that gets logged for `food` at `spec`. Returns null if the portion doesn't apply. */
export function itemFromFood(food: Food, spec: PortionSpec, refs: PortionRefs): LoggedItem | null {
  const grams = portionGrams(food, spec, refs);
  if (grams == null) return null;
  const n = nutritionForGrams(food, grams);
  return {
    name: food.name,
    foodId: food.id,
    portion: spec,
    portionText: describePortion(spec, food),
    grams: food.nominal ? null : grams,
    ...roundNutrition(n),
    uncertaintyPct: food.uncertaintyPct,
    source: 'food',
  };
}

export function roundNutrition(n: Nutrition): Nutrition {
  const out: Nutrition = {
    kcal: Math.round(n.kcal),
    protein: Math.round(n.protein * 10) / 10,
    carbs: Math.round(n.carbs * 10) / 10,
    fat: Math.round(n.fat * 10) / 10,
  };
  if (n.fiber != null) out.fiber = Math.round(n.fiber * 10) / 10;
  if (n.sodium != null) out.sodium = Math.round(n.sodium);
  return out;
}

export interface Totals extends Nutrition {
  /** ± kcal, combining item uncertainties as independent errors (root-sum-square). */
  kcalRange: number;
  count: number;
}

export function sumItems(items: readonly (Nutrition & { uncertaintyPct: number })[]): Totals {
  let kcal = 0,
    protein = 0,
    carbs = 0,
    fat = 0,
    fiber = 0,
    sodium = 0,
    varSum = 0;
  for (const i of items) {
    kcal += i.kcal;
    protein += i.protein;
    carbs += i.carbs;
    fat += i.fat;
    fiber += i.fiber ?? 0;
    sodium += i.sodium ?? 0;
    const err = (i.kcal * i.uncertaintyPct) / 100;
    varSum += err * err;
  }
  return { kcal, protein, carbs, fat, fiber, sodium, kcalRange: Math.sqrt(varSum), count: items.length };
}

/** Round a ± range to something honest-looking: nearest 10 (or 50 above 300). */
export function roundRange(r: number): number {
  if (r >= 300) return Math.round(r / 50) * 50;
  return Math.round(r / 10) * 10;
}

/** Default portion for a food when nothing is specified. */
export function defaultSpec(food: Food, refs: PortionRefs, qty = 1): PortionSpec {
  const units = availableUnits(food, refs);
  const unit = units.includes(food.defaultUnit) ? food.defaultUnit : (units[0] ?? 'g');
  return { unit, qty: unit === 'g' && qty === 1 ? 100 : qty, size: 'normal' };
}
