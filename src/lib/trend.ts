import { addDays, daysBetween } from './dates';
import type { ISODate, Phase } from './types';
import { kgToLb } from './units';

export interface Point {
  date: ISODate;
  value: number;
}

export interface TrendPoint extends Point {
  trend: number;
}

/**
 * Exponentially smoothed trend (like a ~7-day moving average, but it handles
 * missing days). With a gap of d days, the new weigh-in gets weight 1-(1-α)^d.
 */
export function emaTrend(points: readonly Point[], alpha = 0.2): TrendPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const out: TrendPoint[] = [];
  let prev: TrendPoint | null = null;
  for (const p of sorted) {
    if (!prev) {
      prev = { ...p, trend: p.value };
    } else {
      const d = Math.max(1, daysBetween(prev.date, p.date));
      const a = 1 - (1 - alpha) ** d;
      prev = { ...p, trend: prev.trend + a * (p.value - prev.trend) };
    }
    out.push(prev);
  }
  return out;
}

/** Least-squares slope (units per day) of points against their date. */
export function slopePerDay(points: readonly Point[]): number | null {
  if (points.length < 2) return null;
  const x0 = points[0].date;
  const xs = points.map((p) => daysBetween(x0, p.date));
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  return sxx === 0 ? null : sxy / sxx;
}

/** Rate of change per week over the last `windowDays` ending at `end` (null if too little data). */
export function weeklyRate(points: readonly Point[], end: ISODate, windowDays = 14): number | null {
  const start = addDays(end, -(windowDays - 1));
  const w = points.filter((p) => p.date >= start && p.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  if (w.length < 3 || daysBetween(w[0].date, w[w.length - 1].date) < 6) return null;
  const s = slopePerDay(w);
  return s == null ? null : s * 7;
}

// ---------- Adaptive maintenance ----------

export const KCAL_PER_LB = 3500;
export const MIN_INTAKE_DAYS = 14;
export const MIN_WEIGH_INS = 7;
export const MIN_WEIGHT_SPAN_DAYS = 14;

export interface AdaptiveInput {
  /** Total logged kcal per day (days with nothing logged are absent). */
  intake: ReadonlyMap<ISODate, number>;
  /** Weigh-ins in kg. */
  weights: readonly Point[];
  /** Last complete day (usually yesterday). */
  end: ISODate;
  windowDays?: number;
}

export type AdaptiveResult =
  | {
      ok: true;
      maintenance: number;
      avgIntake: number;
      avg7Intake: number | null;
      intakeDays: number;
      weighIns: number;
      /** lb per week, from the fitted trend */
      lbPerWeek: number;
      windowStart: ISODate;
      windowEnd: ISODate;
      steps: string[];
    }
  | { ok: false; reason: string; intakeDays: number; weighIns: number };

/**
 * Estimate real maintenance from what you ate and how your weight moved:
 *   maintenance ≈ average intake − (weight change per day × 3,500 kcal/lb)
 * Uses up to `windowDays` (default 28) of data ending at `end`, needs ≥14 logged
 * days and ≥7 weigh-ins spanning ≥14 days. Weight change is the least-squares
 * trend through the weigh-ins, which smooths out day-to-day water swings.
 */
export function adaptiveMaintenance({ intake, weights, end, windowDays = 28 }: AdaptiveInput): AdaptiveResult {
  const start = addDays(end, -(windowDays - 1));
  const days = [...intake.entries()].filter(([d, k]) => d >= start && d <= end && k > 0);
  const w = weights.filter((p) => p.date >= start && p.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const base = { intakeDays: days.length, weighIns: w.length };
  if (days.length < MIN_INTAKE_DAYS) {
    return { ok: false, reason: `Needs ${MIN_INTAKE_DAYS} days of food logs in the last ${windowDays} (have ${days.length}).`, ...base };
  }
  const span = w.length ? daysBetween(w[0].date, w[w.length - 1].date) : 0;
  if (w.length < MIN_WEIGH_INS || span < MIN_WEIGHT_SPAN_DAYS - 1) {
    return {
      ok: false,
      reason: `Needs ${MIN_WEIGH_INS}+ weigh-ins spread over ${MIN_WEIGHT_SPAN_DAYS} days (have ${w.length} over ${span + (w.length ? 1 : 0)} days).`,
      ...base,
    };
  }
  const avgIntake = days.reduce((s, [, k]) => s + k, 0) / days.length;
  const start7 = addDays(end, -6);
  const last7 = days.filter(([d]) => d >= start7);
  const avg7Intake = last7.length >= 4 ? last7.reduce((s, [, k]) => s + k, 0) / last7.length : null;
  const kgPerDay = slopePerDay(w) ?? 0;
  const lbPerDay = kgToLb(kgPerDay);
  const surplus = lbPerDay * KCAL_PER_LB;
  const maintenance = avgIntake - surplus;
  const r = (n: number, d = 0) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString();
  return {
    ok: true,
    maintenance,
    avgIntake,
    avg7Intake,
    ...base,
    lbPerWeek: lbPerDay * 7,
    windowStart: start,
    windowEnd: end,
    steps: [
      `Average logged intake: ${r(avgIntake)} kcal/day over ${days.length} days${avg7Intake != null ? ` (last 7 days: ${r(avg7Intake)})` : ''}`,
      `Weight trend: ${lbPerDay >= 0 ? '+' : '−'}${r(Math.abs(lbPerDay * 7), 2)} lb/week (fit through ${w.length} weigh-ins)`,
      `Energy balance: ${r(lbPerDay, 3)} lb/day × 3,500 = ${surplus >= 0 ? '+' : '−'}${r(Math.abs(surplus))} kcal/day`,
      `Maintenance ≈ ${r(avgIntake)} ${surplus >= 0 ? '−' : '+'} ${r(Math.abs(surplus))} = ${r(maintenance)} kcal/day`,
    ],
  };
}

// ---------- Phase progress ----------

export interface PhaseProgress {
  /** Signed lb still to change (negative = need to lose). */
  toGoLb: number;
  reached: boolean;
  /** Projected date to reach the goal at the current rate (null if not trending that way). */
  eta: ISODate | null;
  onPace: boolean | null;
  text: string;
}

export function phaseProgress(phase: Phase, trendKg: number, kgPerWeek: number | null, today: ISODate): PhaseProgress | null {
  if (phase.targetWeightKg == null) return null;
  const toGoKg = phase.targetWeightKg - trendKg;
  const toGoLb = kgToLb(toGoKg);
  const absLb = Math.abs(toGoLb);
  if (absLb < 0.3) return { toGoLb, reached: true, eta: null, onPace: true, text: `${phase.name}: goal weight reached 🎯` };
  const dir = toGoKg < 0 ? 'to lose' : 'to gain';
  const head = `${phase.name}: ${absLb.toFixed(1)} lb ${dir}`;
  if (kgPerWeek == null) return { toGoLb, reached: false, eta: null, onPace: null, text: `${head} — log a few more weigh-ins to see your pace` };
  if (Math.sign(kgPerWeek) !== Math.sign(toGoKg) || Math.abs(kgPerWeek) < 0.01) {
    return { toGoLb, reached: false, eta: null, onPace: false, text: `${head} — the trend isn’t moving that way yet` };
  }
  const weeks = toGoKg / kgPerWeek;
  const eta = addDays(today, Math.ceil(weeks * 7));
  const onPace = eta <= phase.endDate;
  return {
    toGoLb,
    reached: false,
    eta,
    onPace,
    text: `${head}, ${onPace ? 'on pace' : 'behind pace'} — projected ${eta} (phase ends ${phase.endDate})`,
  };
}
