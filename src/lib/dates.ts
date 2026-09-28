import type { ISODate, Meal } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** Parse 'YYYY-MM-DD' as a local-noon Date (noon avoids DST edge cases). */
export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Monday of the week containing `s`. */
export function weekStart(s: ISODate): ISODate {
  const d = parseISODate(s);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  return addDays(s, -dow);
}

export function formatDateShort(s: ISODate): string {
  return parseISODate(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDateLong(s: ISODate, today: ISODate = todayISO()): string {
  if (s === today) return 'Today';
  if (s === addDays(today, -1)) return 'Yesterday';
  if (s === addDays(today, 1)) return 'Tomorrow';
  return parseISODate(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Pick a meal from the time of day. */
export function mealForTime(d: Date = new Date()): Meal {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 4 && h < 10.5) return 'breakfast';
  if (h >= 10.5 && h < 15) return 'lunch';
  if (h >= 16.5 && h < 21.5) return 'dinner';
  return 'snack';
}
