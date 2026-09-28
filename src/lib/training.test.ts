import { describe, expect, it } from 'vitest';
import { dayExerciseKcal, liftKcal, runKcal, stepsKcal } from './energy';
import { pace, parseDuration, summarizeWeek } from './training';
import { formatPace } from './units';

describe('durations and pace', () => {
  it('parses minutes and clock times', () => {
    expect(parseDuration('45')).toBe(45);
    expect(parseDuration('28:30')).toBe(28.5);
    expect(parseDuration('1:02:30')).toBe(62.5);
    expect(parseDuration('7:75')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('0')).toBeNull();
  });
  it('computes pace', () => {
    expect(pace(3.1, 28.5)).toBeCloseTo(9.194, 3);
    expect(formatPace(pace(3.1, 28.5)!)).toBe('9:12');
    expect(formatPace(pace(5, 25)!)).toBe('5:00');
    expect(pace(0, 20)).toBeNull();
  });
});

describe('exercise burn (reference)', () => {
  it('uses simple per-kg estimates', () => {
    expect(runKcal(5, 70)).toBe(350);
    expect(liftKcal(60, 70)).toBe(280);
    expect(stepsKcal(10000, 70)).toBe(350);
  });
  it('only counts steps above a sedentary baseline', () => {
    expect(dayExerciseKcal({ steps: 4000, runs: [], lifts: [] }, 70)).toBe(0);
    expect(dayExerciseKcal({ steps: 10000, runs: [{ distanceKm: 5 }], lifts: [{ durationMin: 60 }] }, 70)).toBeCloseTo(210 + 350 + 280, 6);
  });
});

describe('weekly summary', () => {
  const base = { updatedAt: 0 };
  it('averages steps over entered days and totals runs/lifts', () => {
    const w = summarizeWeek(
      '2026-09-21',
      [
        { ...base, id: '2026-09-21', date: '2026-09-21', steps: 10000 },
        { ...base, id: '2026-09-22', date: '2026-09-22', steps: 6000 },
        { ...base, id: '2026-09-28', date: '2026-09-28', steps: 99999 }, // next week
      ],
      [
        { ...base, id: 'r1', date: '2026-09-23', distanceKm: 5, durationMin: 28, note: '' },
        { ...base, id: 'r2', date: '2026-09-27', distanceKm: 8, durationMin: 45, note: '' },
        { ...base, id: 'r3', date: '2026-09-24', distanceKm: 3, durationMin: 20, note: '', deleted: true },
      ],
      [
        { ...base, id: 'l1', date: '2026-09-21', typeId: 'p', typeName: 'Push', durationMin: 60, note: '' },
        { ...base, id: 'l2', date: '2026-09-23', typeId: 'q', typeName: 'Pull', durationMin: 55, note: '' },
        { ...base, id: 'l3', date: '2026-09-25', typeId: 'p', typeName: 'Push', durationMin: 50, note: '' },
      ],
    );
    expect(w.end).toBe('2026-09-27');
    expect(w.avgSteps).toBe(8000);
    expect(w.stepDays).toBe(2);
    expect(w.runCount).toBe(2);
    expect(w.runKm).toBe(13);
    expect(w.liftCount).toBe(3);
    expect(w.liftTypes).toEqual({ Push: 2, Pull: 1 });
  });
});
