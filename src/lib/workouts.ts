// Workout types, rotation ("next up") and overdue logic.
import { daysBetween } from './dates';
import type { ISODate, LegacyLiftType, LiftEntry, WorkoutType } from './types';

export const DEFAULT_WORKOUT_TYPES: readonly WorkoutType[] = [
  { id: 'wt-triceps-biceps', name: 'Triceps & Biceps' },
  { id: 'wt-chest-shoulders', name: 'Chest & Shoulders' },
  { id: 'wt-abs-back', name: 'Abs & Back' },
];

export const LEGACY_LIFT_LABEL: Record<LegacyLiftType, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  upper: 'Upper',
  lower: 'Lower',
  full: 'Full body',
};

/** Bring a v1 lift row (with only `type`) up to date. Leaves everything else untouched. */
export function migrateLift<T extends Partial<LiftEntry>>(row: T): T & Pick<LiftEntry, 'typeId' | 'typeName'> {
  const typeName =
    typeof row.typeName === 'string' && row.typeName
      ? row.typeName
      : row.type && row.type in LEGACY_LIFT_LABEL
        ? LEGACY_LIFT_LABEL[row.type]
        : 'Lift';
  return { ...row, typeId: row.typeId ?? null, typeName };
}

/** Display label for a lift: its saved label (or the current name if the type was renamed). */
export function liftLabel(l: Pick<LiftEntry, 'typeId' | 'typeName' | 'type'>, types: readonly WorkoutType[] = []): string {
  const current = l.typeId ? types.find((t) => t.id === l.typeId) : undefined;
  if (current) return current.name;
  if (l.typeName) return l.typeName;
  return l.type ? LEGACY_LIFT_LABEL[l.type] : 'Lift';
}

const norm = (s: string) => s.trim().toLowerCase();

/** The current workout type a logged lift belongs to (by id, else by name), or null. */
export function matchType(l: Pick<LiftEntry, 'typeId' | 'typeName' | 'type'>, types: readonly WorkoutType[]): WorkoutType | null {
  if (l.typeId) {
    const byId = types.find((t) => t.id === l.typeId);
    if (byId) return byId;
  }
  const name = norm(liftLabel(l));
  return types.find((t) => norm(t.name) === name) ?? null;
}

/** Newest first by workout date (not by when it was entered), then by last edit. */
export function newestFirst<T extends Pick<LiftEntry, 'date' | 'updatedAt'>>(lifts: readonly T[]): T[] {
  return [...lifts].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
}

/**
 * Next workout in the rotation: the one after the most recent lift whose type
 * still exists. Deleted/legacy types are skipped. Empty history → first type.
 */
export function nextWorkout(types: readonly WorkoutType[], lifts: readonly LiftEntry[], onOrBefore?: ISODate): WorkoutType | null {
  if (!types.length) return null;
  const history = newestFirst(lifts.filter((l) => !l.deleted && (!onOrBefore || l.date <= onOrBefore)));
  for (const l of history) {
    const t = matchType(l, types);
    if (t) {
      const i = types.findIndex((x) => x.id === t.id);
      return types[(i + 1) % types.length];
    }
  }
  return types[0];
}

/** Duration of the most recent lift of this type (to preselect), or null. */
export function lastDuration(type: WorkoutType, lifts: readonly LiftEntry[]): number | null {
  const l = newestFirst(lifts.filter((x) => !x.deleted)).find((x) => matchType(x, [type]));
  return l ? l.durationMin : null;
}

export interface OverdueInfo {
  type: WorkoutType;
  lastDate: ISODate | null;
  daysAgo: number | null;
}

/** Workout types not done in `days`+ days (or never), as of `today`. */
export function overdueTypes(types: readonly WorkoutType[], lifts: readonly LiftEntry[], today: ISODate, days = 7): OverdueInfo[] {
  const history = newestFirst(lifts.filter((l) => !l.deleted && l.date <= today));
  const out: OverdueInfo[] = [];
  for (const t of types) {
    const last = history.find((l) => matchType(l, [t]));
    const daysAgo = last ? daysBetween(last.date, today) : null;
    if (daysAgo == null || daysAgo >= days) out.push({ type: t, lastDate: last?.date ?? null, daysAgo });
  }
  return out;
}
