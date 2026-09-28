import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { getSettings, TrackerDB } from './db';
import { importData } from './backup';
import { summarizeWeek } from './training';
import type { LiftEntry, WorkoutType } from './types';
import { DEFAULT_WORKOUT_TYPES, lastDuration, liftLabel, migrateLift, nextWorkout, overdueTypes } from './workouts';

const TYPES: WorkoutType[] = DEFAULT_WORKOUT_TYPES.map((t) => ({ ...t }));
const [TB, CS, AB] = TYPES;
let seq = 0;
const lift = (date: string, t: WorkoutType | { id: string | null; name: string }, durationMin = 60, updatedAt = ++seq): LiftEntry => ({
  id: `l${seq}`,
  date,
  typeId: t.id,
  typeName: t.name,
  durationMin,
  note: '',
  updatedAt,
});

describe('next in rotation', () => {
  it('empty history → first type', () => {
    expect(nextWorkout(TYPES, [])?.name).toBe('Triceps & Biceps');
  });
  it('follows the order and wraps around', () => {
    expect(nextWorkout(TYPES, [lift('2026-09-20', TB)])?.id).toBe(CS.id);
    expect(nextWorkout(TYPES, [lift('2026-09-20', TB), lift('2026-09-22', CS)])?.id).toBe(AB.id);
    expect(nextWorkout(TYPES, [lift('2026-09-22', CS), lift('2026-09-24', AB)])?.id).toBe(TB.id);
  });
  it('uses the workout date, not entry order (back-filled log)', () => {
    // Abs & Back done on the 24th, then a forgotten Triceps & Biceps from the 20th is entered afterwards.
    const lifts = [lift('2026-09-24', AB, 60, 1), lift('2026-09-20', TB, 60, 2)];
    expect(nextWorkout(TYPES, lifts)?.id).toBe(TB.id);
  });
  it('only counts lifts on or before the given day', () => {
    const lifts = [lift('2026-09-20', TB), lift('2026-09-25', CS)];
    expect(nextWorkout(TYPES, lifts, '2026-09-22')?.id).toBe(CS.id);
  });
  it('renamed type: matched by id, rotation unchanged', () => {
    const renamed = TYPES.map((t) => (t.id === TB.id ? { ...t, name: 'Arms' } : t));
    const lifts = [lift('2026-09-20', TB)]; // saved label is still "Triceps & Biceps"
    expect(nextWorkout(renamed, lifts)?.id).toBe(CS.id);
    expect(liftLabel(lifts[0], renamed)).toBe('Arms');
  });
  it('deleted type: skipped, falls back to the latest lift whose type still exists', () => {
    const without = TYPES.filter((t) => t.id !== AB.id);
    const lifts = [lift('2026-09-20', CS), lift('2026-09-22', AB)];
    expect(nextWorkout(without, lifts)?.id).toBe(TB.id); // after Chest & Shoulders, wraps to first
    expect(liftLabel(lifts[1], without)).toBe('Abs & Back'); // old log keeps its label
  });
  it('only legacy/unknown history → first type', () => {
    const legacy = migrateLift({ id: 'x', date: '2026-09-20', type: 'upper' as const, durationMin: 60, note: '', updatedAt: 1 });
    expect(nextWorkout(TYPES, [legacy])?.id).toBe(TB.id);
  });
  it('ignores deleted log entries', () => {
    expect(nextWorkout(TYPES, [lift('2026-09-20', TB), { ...lift('2026-09-22', CS), deleted: true }])?.id).toBe(CS.id);
  });
  it('no types → null', () => {
    expect(nextWorkout([], [lift('2026-09-20', TB)])).toBeNull();
  });
});

describe('durations and overdue', () => {
  it('remembers the last duration per type', () => {
    const lifts = [lift('2026-09-10', TB, 45), lift('2026-09-20', TB, 75), lift('2026-09-21', CS, 50)];
    expect(lastDuration(TB, lifts)).toBe(75);
    expect(lastDuration(AB, lifts)).toBeNull();
  });
  it('lists types not done in 7+ days (or never)', () => {
    const lifts = [lift('2026-09-27', TB), lift('2026-09-21', CS)];
    const o = overdueTypes(TYPES, lifts, '2026-09-28');
    expect(o.map((x) => [x.type.id, x.daysAgo])).toEqual([
      [CS.id, 7],
      [AB.id, null],
    ]);
  });
});

describe('weekly summary with custom types', () => {
  it('counts each lift type and averages pace', () => {
    const w = summarizeWeek(
      '2026-09-21',
      [],
      [
        { id: 'r1', date: '2026-09-22', distanceKm: 5, durationMin: 30, note: '', updatedAt: 0 },
        { id: 'r2', date: '2026-09-24', distanceKm: 5, durationMin: 25, note: '', updatedAt: 0 },
      ],
      [lift('2026-09-21', TB), lift('2026-09-23', CS), lift('2026-09-25', TB), migrateLift({ id: 'old', date: '2026-09-26', type: 'upper' as const, durationMin: 60, note: '', updatedAt: 0 })],
      TYPES,
    );
    expect(w.liftTypes).toEqual({ 'Triceps & Biceps': 2, 'Chest & Shoulders': 1, Upper: 1 });
    expect(w.avgPaceMinPerKm).toBe(5.5);
  });
});

describe('Dexie v1 → v2 migration keeps old data', () => {
  it('upgrades lifts and settings without losing logs', async () => {
    const name = 'migrate-test';
    // Create a v1 database exactly as the first release did.
    const v1 = new Dexie(name);
    v1.version(1).stores({
      settings: 'id',
      foods: 'id, name, updatedAt',
      entries: 'id, date, foodId, updatedAt',
      savedMeals: 'id, updatedAt',
      favorites: 'id',
      weights: 'id, date',
      waists: 'id, date',
      notes: 'id, date',
      steps: 'id, date',
      runs: 'id, date',
      lifts: 'id, date',
    });
    await v1.table('lifts').bulkPut([
      { id: 'a', date: '2026-09-01', type: 'upper', durationMin: 60, note: 'bench', updatedAt: 1 },
      { id: 'b', date: '2026-09-03', type: 'full', durationMin: 45, note: '', updatedAt: 1 },
    ]);
    await v1.table('entries').put({ id: 'e1', date: '2026-09-01', meal: 'lunch', name: 'Rice', kcal: 300, updatedAt: 1, createdAt: 1 });
    await v1.table('weights').put({ id: '2026-09-01', date: '2026-09-01', kg: 75, updatedAt: 1 });
    await v1.table('settings').put({ ...(await getSettingsV1()), fatTargetG: 70 });
    v1.close();

    const v2 = new TrackerDB(name);
    const lifts = await v2.lifts.orderBy('date').toArray();
    expect(lifts.map((l) => [l.id, l.typeId, l.typeName, l.type, l.note])).toEqual([
      ['a', null, 'Upper', 'upper', 'bench'],
      ['b', null, 'Full body', 'full', ''],
    ]);
    expect(await v2.entries.get('e1')).toMatchObject({ name: 'Rice', kcal: 300 });
    expect(await v2.weights.count()).toBe(1);
    const s = await getSettings(v2);
    expect(s.fatTarget).toEqual({ mode: 'grams', min: 63, max: 77 }); // old 70 g target kept (±10%)
    expect(s.carbTarget.mode).toBe('auto');
    expect(s.workoutTypes.map((t) => t.name)).toEqual(['Triceps & Biceps', 'Chest & Shoulders', 'Abs & Back']);
    // The new typeId index works.
    expect(await v2.lifts.where('typeId').equals('x').count()).toBe(0);
    // Old logs still display with their label.
    expect(lifts.map((l) => liftLabel(l, s.workoutTypes))).toEqual(['Upper', 'Full body']);
    v2.close();
  });

  it('importing an old backup upgrades its lifts', async () => {
    const d = new TrackerDB('import-old');
    const old = { app: 'plate-tracker', version: 1, tables: { lifts: [{ id: 'z', date: '2026-08-01', type: 'legs', durationMin: 50, note: '', updatedAt: 1 }] } };
    await importData(JSON.stringify(old), d);
    expect(await d.lifts.get('z')).toMatchObject({ typeId: null, typeName: 'Legs', type: 'legs' });
  });
});

/** A v1-shaped settings row (no fatTarget/carbTarget/workoutTypes). */
async function getSettingsV1() {
  const { defaultSettings } = await import('./defaults');
  const { fatTarget: _f, carbTarget: _c, workoutTypes: _w, ...v1 } = defaultSettings();
  return { ...v1, updatedAt: 1, carbTargetG: null, fatTargetG: null };
}
