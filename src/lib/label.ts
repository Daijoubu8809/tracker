import { newId } from './id';
import type { Food, LoggedItem } from './types';

/** "1", "1.5", "1/2", "1 1/2", "½", "1½" → number (null if not a positive amount). */
export function parseAmount(text: string): number | null {
  const t = text
    .trim()
    .replace(/(\d)([½¼¾⅓⅔])/g, '$1 $2')
    .replace(/½/g, '1/2')
    .replace(/¼/g, '1/4')
    .replace(/¾/g, '3/4')
    .replace(/⅓/g, '1/3')
    .replace(/⅔/g, '2/3')
    .replace(',', '.');
  const m = t.match(/^(?:(\d+(?:\.\d+)?)\s+)?(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?$/);
  if (!m) return null;
  const whole = m[1] ? Number(m[1]) : 0;
  const n = m[3] ? Number(m[2]) / Number(m[3]) : Number(m[2]);
  if (m[1] && !m[3]) return null; // "1 2" is not an amount
  const v = whole + n;
  return Number.isFinite(v) && v > 0 ? v : null;
}

export interface LabelInput {
  name: string;
  servingText: string;
  servingGrams: number | null;
  servingsPerContainer: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Optional extras from the label (per serving). */
  fiber?: number | null;
  sodiumMg?: number | null;
  servingsEaten: number;
}

export function labelToFood(l: LabelInput, id = `c:${newId()}`): Food {
  const servingName = l.servingText.trim() || (l.servingGrams ? `1 serving (${l.servingGrams} g)` : '1 serving');
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const common = {
    id,
    name: l.name.trim(),
    aliases: [],
    category: 'snack' as const,
    defaultUnit: 'serving' as const,
    uncertaintyPct: 10,
    source: 'Nutrition label',
    servingName,
  };
  if (l.servingGrams && l.servingGrams > 0) {
    const f = 100 / l.servingGrams;
    return {
      ...common,
      kcal100: Math.round(l.calories * f),
      protein100: r1(l.protein * f),
      carbs100: r1(l.carbs * f),
      fat100: r1(l.fat * f),
      ...(l.fiber != null ? { fiber100: r1(l.fiber * f) } : {}),
      ...(l.sodiumMg != null ? { sodium100: Math.round(l.sodiumMg * f) } : {}),
      servingGrams: l.servingGrams,
    };
  }
  return {
    ...common,
    nominal: true,
    kcal100: l.calories,
    protein100: l.protein,
    carbs100: l.carbs,
    fat100: l.fat,
    ...(l.fiber != null ? { fiber100: l.fiber } : {}),
    ...(l.sodiumMg != null ? { sodium100: l.sodiumMg } : {}),
    servingGrams: 100,
  };
}

export function labelToItem(l: LabelInput, foodId: string | null): LoggedItem {
  const s = l.servingsEaten;
  const serving = l.servingText.trim() || 'serving';
  return {
    name: l.name.trim(),
    foodId,
    portion: foodId ? { unit: 'serving', qty: s, size: 'normal' } : null,
    portionText: `${Math.round(s * 100) / 100} × ${serving}`,
    grams: l.servingGrams ? Math.round(l.servingGrams * s) : null,
    kcal: Math.round(l.calories * s),
    protein: Math.round(l.protein * s * 10) / 10,
    carbs: Math.round(l.carbs * s * 10) / 10,
    fat: Math.round(l.fat * s * 10) / 10,
    ...(l.fiber != null ? { fiber: Math.round(l.fiber * s * 10) / 10 } : {}),
    ...(l.sodiumMg != null ? { sodium: Math.round(l.sodiumMg * s) } : {}),
    uncertaintyPct: 10,
    source: 'label',
  };
}
