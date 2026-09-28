import { describe, expect, it } from 'vitest';
import {
  activePhase,
  applyGoal,
  computeBmr,
  computeTargets,
  harrisBenedictRevised,
  katchMcArdle,
  mifflinStJeor,
  tdeeFromBmr,
} from './energy';
import { defaultSettings } from './defaults';
import type { Profile, Settings } from './types';

const male: Profile = { age: 19, sex: 'male', heightCm: 178, weightKg: 70, bodyFatPct: 15 };
const female: Profile = { age: 19, sex: 'female', heightCm: 165, weightKg: 60, bodyFatPct: null };

describe('BMR formulas (hand-calculated)', () => {
  it('Mifflin-St Jeor male: 10×70 + 6.25×178 − 5×19 + 5 = 1722.5', () => {
    expect(mifflinStJeor(male, 70)).toBeCloseTo(1722.5, 6);
  });
  it('Mifflin-St Jeor female: 10×60 + 6.25×165 − 5×19 − 161 = 1375.25', () => {
    expect(mifflinStJeor(female, 60)).toBeCloseTo(1375.25, 6);
  });
  it('Harris-Benedict revised male: 88.362 + 937.79 + 854.222 − 107.863 = 1772.511', () => {
    expect(harrisBenedictRevised(male, 70)).toBeCloseTo(1772.511, 3);
  });
  it('Harris-Benedict revised female: 447.593 + 554.82 + 511.17 − 82.27 = 1431.313', () => {
    expect(harrisBenedictRevised(female, 60)).toBeCloseTo(1431.313, 3);
  });
  it('Katch-McArdle: LBM 59.5 kg → 370 + 21.6×59.5 = 1655.2', () => {
    expect(katchMcArdle(70, 15)).toBeCloseTo(1655.2, 6);
  });
});

describe('computeBmr', () => {
  it('applies the 5% East Asian adjustment to Mifflin', () => {
    expect(computeBmr(male, 70, 'mifflin', true).bmr).toBeCloseTo(1722.5 * 0.95, 6);
  });
  it('applies the 5% East Asian adjustment to Harris-Benedict', () => {
    expect(computeBmr(male, 70, 'harris', true).bmr).toBeCloseTo(1772.511 * 0.95, 3);
  });
  it('does not adjust Katch-McArdle', () => {
    expect(computeBmr(male, 70, 'katch', true).bmr).toBeCloseTo(1655.2, 6);
  });
  it('falls back to Mifflin when Katch has no body fat', () => {
    const r = computeBmr(female, 60, 'katch', false);
    expect(r.formula).toBe('mifflin');
    expect(r.fellBackFrom).toBe('katch');
    expect(r.bmr).toBeCloseTo(1375.25, 6);
  });
  it('explains the math', () => {
    const r = computeBmr(male, 70, 'mifflin', false);
    expect(r.steps[0]).toContain('= 1723 kcal');
  });
});

describe('TDEE and goals', () => {
  it('very active multiplier: 1722.5 × 1.725 = 2971.3', () => {
    expect(tdeeFromBmr(1722.5, 'very')).toBeCloseTo(2971.3125, 4);
  });
  it('applies goals', () => {
    expect(applyGoal(2800, { mode: 'cut', kcal: 400 })).toBe(2400);
    expect(applyGoal(2800, { mode: 'bulk', kcal: 300 })).toBe(3100);
    expect(applyGoal(2800, { mode: 'maintain', kcal: -250 })).toBe(2550);
    expect(applyGoal(2800, { mode: 'custom', kcal: 2000 })).toBe(2000);
  });
});

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), profile: male, ...patch };
}

describe('computeTargets', () => {
  it('default: Mifflin, very active, cut 400', () => {
    const t = computeTargets({ settings: settings(), date: '2026-10-01', weightKg: 70, adaptiveMaintenance: null, exerciseKcal: 300 });
    expect(Math.round(t.formulaTdee)).toBe(2971);
    expect(t.calories).toBe(2571);
    expect(t.exerciseAdded).toBe(0); // no double counting by default
    expect(t.belowBmr).toBe(false);
    // 0.8 g × 154.3 lb = 123 g
    expect(t.proteinG).toBe(123);
  });

  it('switches goals by phase date', () => {
    const s = settings({
      phases: [
        { id: 'a', name: 'Cut', startDate: '2026-09-01', endDate: '2026-10-23', goal: { mode: 'cut', kcal: 400 }, targetWeightKg: null },
        { id: 'b', name: 'Maintain', startDate: '2026-10-24', endDate: '2026-11-21', goal: { mode: 'maintain', kcal: -250 }, targetWeightKg: null },
      ],
    });
    expect(activePhase(s.phases, '2026-10-23')?.id).toBe('a');
    expect(activePhase(s.phases, '2026-10-24')?.id).toBe('b');
    const t = computeTargets({ settings: s, date: '2026-10-30', weightKg: 70, adaptiveMaintenance: null, exerciseKcal: 0 });
    expect(t.calories).toBe(2971 - 250);
    const after = computeTargets({ settings: s, date: '2026-12-01', weightKg: 70, adaptiveMaintenance: null, exerciseKcal: 0 });
    expect(after.phase).toBeNull();
    expect(after.calories).toBe(2571);
  });

  it('uses adaptive maintenance when selected and available', () => {
    const s = settings({ maintenanceSource: 'adaptive' });
    const t = computeTargets({ settings: s, date: '2026-10-01', weightKg: 70, adaptiveMaintenance: 2600, exerciseKcal: 0 });
    expect(t.maintenanceSource).toBe('adaptive');
    expect(t.calories).toBe(2200);
    const noData = computeTargets({ settings: s, date: '2026-10-01', weightKg: 70, adaptiveMaintenance: null, exerciseKcal: 0 });
    expect(noData.maintenanceSource).toBe('formula');
  });

  it('sedentary + exercise mode adds exercise to a 1.2 base', () => {
    const s = settings({ exerciseMode: 'sedentary_plus_exercise' });
    const t = computeTargets({ settings: s, date: '2026-10-01', weightKg: 70, adaptiveMaintenance: null, exerciseKcal: 500 });
    expect(Math.round(t.formulaTdee)).toBe(Math.round(1722.5 * 1.2));
    expect(t.calories).toBe(Math.round(1722.5 * 1.2 - 400 + 500));
  });

  it('flags a target below BMR', () => {
    const s = settings({ goal: { mode: 'custom', kcal: 1500 } });
    const t = computeTargets({ settings: s, date: '2026-10-01', weightKg: 70, adaptiveMaintenance: null, exerciseKcal: 0 });
    expect(t.belowBmr).toBe(true);
  });
});
