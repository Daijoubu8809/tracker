import { addDays, dateRange } from './dates';
import type { ISODate, LiftEntry, LiftType, RunEntry, StepsEntry } from './types';

/** "28", "28:30", "1:02:30" → minutes (null if invalid). */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) {
    const v = Number(t);
    return v > 0 ? v : null;
  }
  const parts = t.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return null;
  const min = parts.length === 3 ? nums[0] * 60 + nums[1] + nums[2] / 60 : nums[0] + nums[1] / 60;
  return min > 0 ? min : null;
}

/** Minutes per unit distance. */
export function pace(distance: number, minutes: number): number | null {
  return distance > 0 && minutes > 0 ? minutes / distance : null;
}

export interface WeekSummary {
  start: ISODate;
  end: ISODate;
  /** Average over days with a step count entered. */
  avgSteps: number | null;
  stepDays: number;
  runCount: number;
  runKm: number;
  runMinutes: number;
  liftCount: number;
  liftMinutes: number;
  liftTypes: Partial<Record<LiftType, number>>;
}

export function summarizeWeek(
  start: ISODate,
  steps: readonly StepsEntry[],
  runs: readonly RunEntry[],
  lifts: readonly LiftEntry[],
): WeekSummary {
  const end = addDays(start, 6);
  const inWeek = (d: ISODate) => d >= start && d <= end;
  const days = new Set(dateRange(start, end));
  const s = steps.filter((x) => !x.deleted && days.has(x.date) && x.steps > 0);
  const r = runs.filter((x) => !x.deleted && inWeek(x.date));
  const l = lifts.filter((x) => !x.deleted && inWeek(x.date));
  const liftTypes: Partial<Record<LiftType, number>> = {};
  for (const x of l) liftTypes[x.type] = (liftTypes[x.type] ?? 0) + 1;
  return {
    start,
    end,
    avgSteps: s.length ? s.reduce((a, x) => a + x.steps, 0) / s.length : null,
    stepDays: s.length,
    runCount: r.length,
    runKm: r.reduce((a, x) => a + x.distanceKm, 0),
    runMinutes: r.reduce((a, x) => a + x.durationMin, 0),
    liftCount: l.length,
    liftMinutes: l.reduce((a, x) => a + x.durationMin, 0),
    liftTypes,
  };
}
