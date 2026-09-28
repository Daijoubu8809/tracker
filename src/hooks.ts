import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { db, getSettings, live } from './lib/db';
import { defaultSettings } from './lib/defaults';
import { computeTargets, type DailyTargets } from './lib/energy';
import type { ISODate, Settings } from './lib/types';

const DEFAULTS = defaultSettings();

export function useSettings(): Settings {
  return useLiveQuery(() => getSettings(), [], DEFAULTS);
}

/** Current body weight: latest weigh-in on/before `date`, else the profile weight. */
export function useWeightKg(date: ISODate): number {
  const settings = useSettings();
  const w = useLiveQuery(async () => {
    const rows = live(await db.weights.where('date').belowOrEqual(date).toArray());
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return rows.length ? rows[rows.length - 1].kg : null;
  }, [date]);
  return w ?? settings.profile.weightKg;
}

export function useTargets(date: ISODate): DailyTargets {
  const settings = useSettings();
  const weightKg = useWeightKg(date);
  return computeTargets({ settings, date, weightKg, adaptiveMaintenance: null, exerciseKcal: 0 });
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
