import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';
import { db, getSettings, live } from './lib/db';
import { defaultSettings } from './lib/defaults';
import { computeTargets, dayExerciseKcal, type DailyTargets } from './lib/energy';
import type { ISODate, LiftEntry, LogEntry, RunEntry, Settings, WeightEntry } from './lib/types';
import { mergeFoods, type FoodRecord } from './lib/foods';
import { addDays, todayISO } from './lib/dates';
import { adaptiveMaintenance, emaTrend, type AdaptiveResult, type Point } from './lib/trend';

const DEFAULTS = defaultSettings();

export function useSettings(): Settings {
  return useLiveQuery(() => getSettings(), [], DEFAULTS);
}

const NO_POINTS: Point[] = [];

/** All weigh-ins (kg), oldest first. */
export function useWeights(): Point[] {
  return useLiveQuery(
    async () => live(await db.weights.toArray()).map((w) => ({ date: w.date, value: w.kg })).sort((a, b) => a.date.localeCompare(b.date)),
    [],
    NO_POINTS,
  );
}

/** All waist entries (cm), oldest first. */
export function useWaists(): Point[] {
  return useLiveQuery(
    async () => live(await db.waists.toArray()).map((w) => ({ date: w.date, value: w.cm })).sort((a, b) => a.date.localeCompare(b.date)),
    [],
    NO_POINTS,
  );
}

/** Current body weight: smoothed trend up to `date`, else the profile weight. */
export function useWeightKg(date: ISODate): number {
  const settings = useSettings();
  const weights = useWeights();
  return useMemo(() => {
    const upTo = weights.filter((w) => w.date <= date);
    const t = emaTrend(upTo);
    return t.length ? t[t.length - 1].trend : settings.profile.weightKg;
  }, [weights, date, settings.profile.weightKg]);
}

/** Adaptive maintenance from the last 28 complete days (ending yesterday). */
export function useAdaptive(): AdaptiveResult {
  const today = todayISO();
  const end = addDays(today, -1);
  const entries = useEntriesRange(addDays(end, -27), end);
  const weights = useWeights();
  return useMemo(() => {
    const intake = new Map<ISODate, number>();
    for (const e of entries) intake.set(e.date, (intake.get(e.date) ?? 0) + e.kcal);
    return adaptiveMaintenance({ intake, weights, end });
  }, [entries, weights, end]);
}

export function useTargets(date: ISODate): DailyTargets {
  const settings = useSettings();
  const weightKg = useWeightKg(date);
  const exercise = useDayExercise(date);
  const adaptive = useAdaptive();
  return computeTargets({
    settings,
    date,
    weightKg,
    adaptiveMaintenance: adaptive.ok ? adaptive.maintenance : null,
    exerciseKcal: exercise.kcal,
  });
}

export interface DayExercise {
  steps: number | null;
  runs: RunEntry[];
  lifts: LiftEntry[];
  /** Estimated burn above a sedentary baseline (reference only by default). */
  kcal: number;
}

export function useDayExercise(date: ISODate): DayExercise {
  const weightKg = useWeightKg(date);
  const data = useLiveQuery(
    async () => {
      const [steps, runs, lifts] = await Promise.all([
        db.steps.get(date),
        db.runs.where('date').equals(date).toArray(),
        db.lifts.where('date').equals(date).toArray(),
      ]);
      return { steps: steps && !steps.deleted ? steps.steps : null, runs: live(runs), lifts: live(lifts) };
    },
    [date],
    { steps: null, runs: [], lifts: [] },
  );
  return { ...data, kcal: dayExerciseKcal(data, weightKg) };
}

export function useWeighIn(date: ISODate): WeightEntry | null {
  return useLiveQuery(async () => {
    const w = await db.weights.get(date);
    return w && !w.deleted ? w : null;
  }, [date]) ?? null;
}

export function useThemeEffect(): void {
  const { theme } = useSettings();
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

// ---------- Foods & log ----------


export function useFoods(): FoodRecord[] {
  return useLiveQuery(async () => mergeFoods(await db.foods.toArray()), [], EMPTY_FOODS);
}
const EMPTY_FOODS: FoodRecord[] = mergeFoods([]);

export function useFoodMap(): Map<string, FoodRecord> {
  const foods = useFoods();
  return useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
}

export function useEntries(date: ISODate): LogEntry[] {
  return useLiveQuery(
    async () => live(await db.entries.where('date').equals(date).toArray()).sort((a, b) => a.createdAt - b.createdAt),
    [date],
    [],
  );
}

export function useEntriesRange(start: ISODate, end: ISODate): LogEntry[] {
  return useLiveQuery(async () => live(await db.entries.where('date').between(start, end, true, true).toArray()), [start, end], []);
}

export function useFavoriteIds(): Set<string> {
  const favs = useLiveQuery(async () => live(await db.favorites.toArray()).map((f) => f.id), [], []);
  return useMemo(() => new Set(favs), [favs]);
}

/** Food ids logged in the last 30 days, most recent first. */
export function useRecentFoodIds(today: ISODate, limit = 15): string[] {
  return useLiveQuery(
    async () => {
      const rows = live(await db.entries.where('date').between(addDays(today, -30), today, true, true).toArray());
      rows.sort((a, b) => b.createdAt - a.createdAt);
      const out: string[] = [];
      for (const r of rows) {
        if (r.foodId && !out.includes(r.foodId)) out.push(r.foodId);
        if (out.length >= limit) break;
      }
      return out;
    },
    [today, limit],
    [],
  );
}

/** Small ranking boost for favorites and recents, used by search and the text parser. */
export function useFoodBoost(today: ISODate): Map<string, number> {
  const favs = useFavoriteIds();
  const recents = useRecentFoodIds(today, 30);
  return useMemo(() => {
    const m = new Map<string, number>();
    recents.forEach((id, i) => m.set(id, 0.03 - i * 0.0005));
    favs.forEach((id) => m.set(id, (m.get(id) ?? 0) + 0.02));
    return m;
  }, [favs, recents]);
}

const NO_LIFTS: LiftEntry[] = [];

/** All (non-deleted) lifts, for rotation/overdue logic. */
export function useLifts(): LiftEntry[] {
  return useLiveQuery(async () => live(await db.lifts.toArray()), [], NO_LIFTS);
}
