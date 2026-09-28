import { describe, expect, it } from 'vitest';
import { defaultSettings } from './defaults';
import { computeTargets } from './energy';
import { DEFAULT_CARB_TARGET, DEFAULT_FAT_TARGET, gramsToPct, legacyToRange, lowFatNote, macroTargets, pctToGrams, rangeStatus } from './macros';
import type { Settings } from './types';

describe('% ↔ grams', () => {
  it('fat: 20% of 2,652 kcal ÷ 9 = 58.9 g, 30% = 88.4 g', () => {
    expect(pctToGrams(20, 2652, 9)).toBeCloseTo(58.93, 2);
    expect(pctToGrams(30, 2652, 9)).toBeCloseTo(88.4, 2);
  });
  it('carbs: 50% of 2,000 kcal ÷ 4 = 250 g', () => {
    expect(pctToGrams(50, 2000, 4)).toBe(250);
    expect(gramsToPct(250, 2000, 4)).toBe(50);
  });
  it('round-trips', () => {
    for (const pct of [5, 20, 33.3, 60]) expect(gramsToPct(pctToGrams(pct, 2652, 9), 2652, 9)).toBeCloseTo(pct, 9);
  });
  it('0 kcal does not divide by zero', () => {
    expect(gramsToPct(50, 0, 4)).toBe(0);
  });
});

describe('default ranges', () => {
  it('2,652 kcal, 132 g protein → fat 59–88 g, carbs 310–420 g', () => {
    const m = macroTargets(2652, 132, DEFAULT_FAT_TARGET, DEFAULT_CARB_TARGET);
    expect(m.fat).toEqual({ min: 59, max: 88 });
    // (2652 − 132×4 − 73.67×9) ÷ 4 = 365.3 g, ±15%
    expect(m.carbs).toEqual({ min: 310, max: 420 });
    expect(m.proteinG).toBe(132);
    expect(m.calories).toBe(2652);
  });
  it('grams mode ignores calories', () => {
    const m = macroTargets(1800, 120, { mode: 'grams', min: 70, max: 50 }, { mode: 'grams', min: 200, max: 250 });
    expect(m.fat).toEqual({ min: 50, max: 70 }); // min/max swapped back into order
    expect(m.carbs).toEqual({ min: 200, max: 250 });
  });
  it('% mode for carbs', () => {
    expect(macroTargets(2000, 150, DEFAULT_FAT_TARGET, { mode: 'pct', min: 40, max: 50 }).carbs).toEqual({ min: 200, max: 250 });
  });
  it('auto carbs never go negative', () => {
    expect(macroTargets(800, 250, DEFAULT_FAT_TARGET, DEFAULT_CARB_TARGET).carbs).toEqual({ min: 0, max: 0 });
  });
});

describe('ranges follow the calorie target (phase switch)', () => {
  const profile = { age: 19, sex: 'male' as const, heightCm: 178, weightKg: 70, bodyFatPct: null };
  const s: Settings = {
    ...defaultSettings(),
    profile,
    phases: [
      { id: 'cut', name: 'Cut', startDate: '2026-09-01', endDate: '2026-10-23', goal: { mode: 'cut', kcal: 400 }, targetWeightKg: null },
      { id: 'm', name: 'Maintain', startDate: '2026-10-24', endDate: '2026-11-21', goal: { mode: 'maintain', kcal: 0 }, targetWeightKg: null },
    ],
  };
  const at = (date: string) => computeTargets({ settings: s, date, weightKg: 70, adaptiveMaintenance: null, exerciseKcal: 0 });
  it('recalculates fat and carbs when the phase changes', () => {
    const cut = at('2026-10-23');
    const maint = at('2026-10-24');
    expect(maint.calories - cut.calories).toBe(400);
    expect(cut.macros.fat).toEqual({ min: Math.round((cut.calories * 0.2) / 9), max: Math.round((cut.calories * 0.3) / 9) });
    expect(maint.macros.fat.max).toBeGreaterThan(cut.macros.fat.max);
    expect(maint.macros.carbs.min).toBeGreaterThan(cut.macros.carbs.min);
    // Protein doesn't depend on calories.
    expect(maint.macros.proteinG).toBe(cut.macros.proteinG);
  });
  it('fixed-gram targets stay put across phases', () => {
    const fixed = { ...s, fatTarget: { mode: 'grams' as const, min: 60, max: 80 } };
    const a = computeTargets({ settings: fixed, date: '2026-10-01', weightKg: 70, adaptiveMaintenance: null, exerciseKcal: 0 });
    const b = computeTargets({ settings: fixed, date: '2026-11-01', weightKg: 70, adaptiveMaintenance: null, exerciseKcal: 0 });
    expect(a.macros.fat).toEqual(b.macros.fat);
  });
});

describe('eaten vs range', () => {
  it('under the min', () => {
    expect(rangeStatus(3, 60, 88)).toEqual({ state: 'under', overBy: 0, fill: 3 / 88 });
    expect(rangeStatus(0, 0, 88).state).toBe('under');
  });
  it('in range (inclusive)', () => {
    expect(rangeStatus(60, 60, 88).state).toBe('in');
    expect(rangeStatus(88, 60, 88).state).toBe('in');
    expect(rangeStatus(88.4, 60, 88).state).toBe('in'); // rounding slack
  });
  it('over the max: bar capped, amount over reported', () => {
    expect(rangeStatus(100, 60, 88)).toEqual({ state: 'over', overBy: 12, fill: 1 });
  });
  it('calories: no min, eaten up to the target is in range', () => {
    expect(rangeStatus(1200, 0, 2652).state).toBe('in');
    expect(rangeStatus(2700, 0, 2652)).toMatchObject({ state: 'over', overBy: 48 });
  });
});

describe('legacy single targets', () => {
  it('become a ±10% grams range', () => {
    expect(legacyToRange(250, DEFAULT_CARB_TARGET)).toEqual({ mode: 'grams', min: 225, max: 275 });
    expect(legacyToRange(null, DEFAULT_FAT_TARGET)).toEqual(DEFAULT_FAT_TARGET);
  });
});

describe('low-fat note', () => {
  const evening = new Date(2026, 8, 28, 21, 30);
  const noon = new Date(2026, 8, 28, 12, 0);
  it('shows for a past day under the minimum', () => {
    expect(lowFatNote('2026-09-27', 5, 40, 60, noon)).toBe('Fat was low this day; aim for 60 g+ for hormones and recovery.');
  });
  it('shows for today only once the day is over (after 9 pm)', () => {
    expect(lowFatNote('2026-09-28', 5, 40, 60, noon)).toBeNull();
    expect(lowFatNote('2026-09-28', 5, 40, 60, evening)).toMatch(/^Fat was low today/);
  });
  it('stays quiet when at/above the minimum, nothing logged, no minimum, or a future day', () => {
    expect(lowFatNote('2026-09-27', 5, 60, 60, noon)).toBeNull();
    expect(lowFatNote('2026-09-27', 0, 0, 60, noon)).toBeNull();
    expect(lowFatNote('2026-09-27', 5, 10, 0, noon)).toBeNull();
    expect(lowFatNote('2026-09-29', 5, 10, 60, evening)).toBeNull();
  });
});
