import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { adaptiveMaintenance, emaTrend, phaseProgress, slopePerDay, weeklyRate, type Point } from './trend';
import { lbToKg } from './units';
import type { Phase } from './types';

const START = '2026-09-01';

describe('emaTrend', () => {
  it('starts at the first value and moves toward new ones', () => {
    const t = emaTrend([
      { date: '2026-09-01', value: 100 },
      { date: '2026-09-02', value: 110 },
    ]);
    expect(t[0].trend).toBe(100);
    expect(t[1].trend).toBeCloseTo(102, 6); // 100 + 0.2 × 10
  });
  it('gives a gap of several days more weight', () => {
    const t = emaTrend([
      { date: '2026-09-01', value: 100 },
      { date: '2026-09-04', value: 110 },
    ]);
    expect(t[1].trend).toBeCloseTo(100 + (1 - 0.8 ** 3) * 10, 6);
  });
  it('sorts input and smooths noise', () => {
    const pts: Point[] = [];
    for (let i = 0; i < 30; i++) pts.push({ date: addDays(START, i), value: 170 + (i % 2 ? 1.5 : -1.5) });
    const t = emaTrend(pts.reverse());
    expect(t[0].date).toBe(START);
    expect(Math.abs(t[29].trend - 170)).toBeLessThan(0.4);
  });
});

describe('slopes and rates', () => {
  it('fits a straight line', () => {
    const pts = [0, 1, 2, 3].map((i) => ({ date: addDays(START, i * 2), value: 80 - 0.1 * i * 2 }));
    expect(slopePerDay(pts)).toBeCloseTo(-0.1, 9);
  });
  it('weekly rate over the last 14 days', () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ date: addDays(START, i), value: 170 - i / 7 }));
    expect(weeklyRate(pts, addDays(START, 19))).toBeCloseTo(-1, 6);
  });
  it('needs enough data', () => {
    expect(weeklyRate([{ date: START, value: 1 }], START)).toBeNull();
  });
});

function scenario(opts: { days: number; intake: number; lbPerWeek: number; startLb?: number; noise?: boolean; weighEvery?: number }) {
  const intake = new Map<string, number>();
  const weights: Point[] = [];
  const startLb = opts.startLb ?? 170;
  for (let i = 0; i < opts.days; i++) {
    const d = addDays(START, i);
    intake.set(d, opts.intake);
    if (i % (opts.weighEvery ?? 1) === 0) {
      const noise = opts.noise ? [0.8, -0.6, 0.3, -0.9, 0.5, -0.2, 0.1][i % 7] : 0;
      weights.push({ date: d, value: lbToKg(startLb + (opts.lbPerWeek / 7) * i + noise) });
    }
  }
  return { intake, weights, end: addDays(START, opts.days - 1) };
}

describe('adaptive maintenance', () => {
  it('stable weight → maintenance equals intake', () => {
    const r = adaptiveMaintenance(scenario({ days: 21, intake: 2800, lbPerWeek: 0 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.maintenance).toBeCloseTo(2800, 6);
  });
  it('losing 1 lb/week on 2,300 kcal → maintenance ≈ 2,800 (hand calc: 2300 + 3500/7)', () => {
    const r = adaptiveMaintenance(scenario({ days: 28, intake: 2300, lbPerWeek: -1 }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.maintenance).toBeCloseTo(2800, 3);
      expect(r.lbPerWeek).toBeCloseTo(-1, 6);
      expect(r.steps.join('\n')).toMatch(/Maintenance ≈ 2,300 \+ 500 = 2,800/);
    }
  });
  it('gaining 0.5 lb/week on 3,000 kcal → maintenance ≈ 2,750', () => {
    const r = adaptiveMaintenance(scenario({ days: 28, intake: 3000, lbPerWeek: 0.5 }));
    if (!r.ok) throw new Error(r.reason);
    expect(r.maintenance).toBeCloseTo(2750, 3);
  });
  it('is robust to daily water-weight noise', () => {
    const r = adaptiveMaintenance(scenario({ days: 28, intake: 2300, lbPerWeek: -1, noise: true }));
    if (!r.ok) throw new Error(r.reason);
    expect(Math.abs(r.maintenance - 2800)).toBeLessThan(150);
  });
  it('works with weigh-ins every other day', () => {
    const r = adaptiveMaintenance(scenario({ days: 28, intake: 2300, lbPerWeek: -1, weighEvery: 2 }));
    if (!r.ok) throw new Error(r.reason);
    expect(r.maintenance).toBeCloseTo(2800, 3);
  });
  it('only uses the last 28 days', () => {
    const s = scenario({ days: 60, intake: 2300, lbPerWeek: -1 });
    // Early days at a very different intake shouldn't matter.
    for (let i = 0; i < 30; i++) s.intake.set(addDays(START, i), 4000);
    const r = adaptiveMaintenance(s);
    if (!r.ok) throw new Error(r.reason);
    expect(r.maintenance).toBeCloseTo(2800, 3);
    expect(r.avg7Intake).toBe(2300);
  });
  it('needs 14 days of intake', () => {
    const r = adaptiveMaintenance(scenario({ days: 13, intake: 2300, lbPerWeek: -1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/14 days of food logs/);
  });
  it('needs weigh-ins spread over 14 days', () => {
    const s = scenario({ days: 20, intake: 2300, lbPerWeek: -1 });
    const r = adaptiveMaintenance({ ...s, weights: s.weights.slice(-7) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/weigh-ins/);
  });
  it('ignores unlogged days rather than counting them as 0 kcal', () => {
    const s = scenario({ days: 28, intake: 2300, lbPerWeek: -1 });
    for (let i = 0; i < 28; i += 4) s.intake.delete(addDays(START, i));
    const r = adaptiveMaintenance(s);
    if (!r.ok) throw new Error(r.reason);
    expect(r.avgIntake).toBe(2300);
  });
});

describe('phase progress', () => {
  const phase: Phase = { id: 'p', name: 'Cut', startDate: '2026-09-01', endDate: '2026-10-23', goal: { mode: 'cut', kcal: 400 }, targetWeightKg: lbToKg(165) };
  it('lb to go and on pace', () => {
    const p = phaseProgress(phase, lbToKg(168.4), lbToKg(-1), '2026-09-28')!;
    expect(p.toGoLb).toBeCloseTo(-3.4, 6);
    expect(p.eta).toBe('2026-10-22'); // 3.4 weeks → 24 days
    expect(p.onPace).toBe(true);
    expect(p.text).toMatch(/^Cut: 3.4 lb to lose, on pace/);
  });
  it('behind pace', () => {
    const p = phaseProgress(phase, lbToKg(170), lbToKg(-0.5), '2026-09-28')!;
    expect(p.onPace).toBe(false);
  });
  it('wrong direction', () => {
    expect(phaseProgress(phase, lbToKg(170), lbToKg(0.3), '2026-09-28')!.text).toMatch(/isn’t moving/);
  });
  it('reached', () => {
    expect(phaseProgress(phase, lbToKg(165.1), lbToKg(-1), '2026-09-28')!.reached).toBe(true);
  });
  it('no target → null', () => {
    expect(phaseProgress({ ...phase, targetWeightKg: null }, 70, -0.5, '2026-09-28')).toBeNull();
  });
});
