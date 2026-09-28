// Carb/fat target ranges and eaten-vs-target states.
import { todayISO } from './dates';

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/**
 * How a macro range is set:
 *  - 'pct':   min/max are % of the day's calories (recalculated when calories change)
 *  - 'grams': min/max are fixed grams
 *  - 'auto':  (carbs only) calories left after protein and the fat midpoint, ±15%
 */
export type MacroMode = 'auto' | 'pct' | 'grams';

export interface MacroRangeSetting {
  mode: MacroMode;
  min: number;
  max: number;
}

export const DEFAULT_FAT_TARGET: MacroRangeSetting = { mode: 'pct', min: 20, max: 30 };
export const DEFAULT_CARB_TARGET: MacroRangeSetting = { mode: 'auto', min: 0, max: 0 };
export const AUTO_CARB_SPREAD = 0.15;

export function pctToGrams(pct: number, kcal: number, kcalPerG: number): number {
  return (kcal * pct) / 100 / kcalPerG;
}

export function gramsToPct(grams: number, kcal: number, kcalPerG: number): number {
  return kcal > 0 ? ((grams * kcalPerG) / kcal) * 100 : 0;
}

export interface GramRange {
  min: number;
  max: number;
}

function rangeFrom(setting: MacroRangeSetting, kcal: number, kcalPerG: number): GramRange {
  const lo = Math.min(setting.min, setting.max);
  const hi = Math.max(setting.min, setting.max);
  if (setting.mode === 'grams') return { min: lo, max: hi };
  return { min: pctToGrams(lo, kcal, kcalPerG), max: pctToGrams(hi, kcal, kcalPerG) };
}

export interface MacroTargets {
  /** Calorie ceiling for the day (the target). */
  calories: number;
  proteinG: number;
  fat: GramRange;
  carbs: GramRange;
}

/** Turn settings into gram ranges for a given calorie target. Rounded to whole grams. */
export function macroTargets(
  calories: number,
  proteinG: number,
  fatSetting: MacroRangeSetting,
  carbSetting: MacroRangeSetting,
): MacroTargets {
  const fat = rangeFrom(fatSetting.mode === 'auto' ? DEFAULT_FAT_TARGET : fatSetting, calories, KCAL_PER_G.fat);
  let carbs: GramRange;
  if (carbSetting.mode === 'auto') {
    const fatMid = (fat.min + fat.max) / 2;
    const left = Math.max(0, calories - proteinG * KCAL_PER_G.protein - fatMid * KCAL_PER_G.fat);
    const center = left / KCAL_PER_G.carbs;
    carbs = { min: center * (1 - AUTO_CARB_SPREAD), max: center * (1 + AUTO_CARB_SPREAD) };
  } else {
    carbs = rangeFrom(carbSetting, calories, KCAL_PER_G.carbs);
  }
  const r = (g: GramRange): GramRange => ({ min: Math.round(g.min), max: Math.round(g.max) });
  return { calories: Math.round(calories), proteinG: Math.round(proteinG), fat: r(fat), carbs: r(carbs) };
}

export type RangeState = 'under' | 'in' | 'over';

export interface RangeStatus {
  state: RangeState;
  /** Amount past the max (0 unless over). */
  overBy: number;
  /** Bar fill 0..1, relative to the max, capped at 1. */
  fill: number;
}

/** Where `eaten` sits relative to [min, max]. With no min (0), anything up to max counts as in range once > 0. */
export function rangeStatus(eaten: number, min: number, max: number): RangeStatus {
  const fill = max > 0 ? Math.min(1, Math.max(0, eaten / max)) : 0;
  if (max > 0 && eaten > max + 0.5) return { state: 'over', overBy: eaten - max, fill: 1 };
  if (eaten >= min && eaten > 0) return { state: 'in', overBy: 0, fill };
  return { state: 'under', overBy: 0, fill };
}

/** Legacy single-number targets (before ranges) → a ±10% grams range. */
export function legacyToRange(grams: number | null | undefined, fallback: MacroRangeSetting): MacroRangeSetting {
  if (grams == null || !(grams > 0)) return { ...fallback };
  return { mode: 'grams', min: Math.round(grams * 0.9), max: Math.round(grams * 1.1) };
}

/**
 * Gentle fat-minimum note: only once the day is over (past days, or today after 9 pm),
 * only for days with something logged, and only if a minimum is set.
 */
export function lowFatNote(date: string, loggedCount: number, fatEaten: number, fatMin: number, now: Date = new Date()): string | null {
  if (!(fatMin > 0) || loggedCount === 0 || fatEaten >= fatMin) return null;
  const today = todayISO(now);
  if (date > today) return null;
  const dayOver = date < today || now.getHours() >= 21;
  if (!dayOver) return null;
  return `Fat was low ${date === today ? 'today' : 'this day'}; aim for ${Math.round(fatMin)} g+ for hormones and recovery.`;
}
