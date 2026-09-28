import Dexie, { type EntityTable } from 'dexie';
import type {
  DayNote,
  Favorite,
  LiftEntry,
  LogEntry,
  RunEntry,
  SavedMeal,
  Settings,
  StepsEntry,
  StoredFood,
  WaistEntry,
  WeightEntry,
} from './types';
import { defaultSettings } from './defaults';
import { DEFAULT_CARB_TARGET, DEFAULT_FAT_TARGET, legacyToRange } from './macros';
import { DEFAULT_WORKOUT_TYPES, migrateLift } from './workouts';

/** Fill in fields added after v1 (idempotent; used by the Dexie upgrade, getSettings and backup import). */
export function migrateSettings<T extends Partial<Settings>>(s: T): T {
  return {
    ...s,
    fatTarget: s.fatTarget ?? legacyToRange(s.fatTargetG, DEFAULT_FAT_TARGET),
    carbTarget: s.carbTarget ?? legacyToRange(s.carbTargetG, DEFAULT_CARB_TARGET),
    workoutTypes: s.workoutTypes ?? DEFAULT_WORKOUT_TYPES.map((w) => ({ ...w })),
  };
}

export class TrackerDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>;
  foods!: EntityTable<StoredFood, 'id'>;
  entries!: EntityTable<LogEntry, 'id'>;
  savedMeals!: EntityTable<SavedMeal, 'id'>;
  favorites!: EntityTable<Favorite, 'id'>;
  weights!: EntityTable<WeightEntry, 'id'>;
  waists!: EntityTable<WaistEntry, 'id'>;
  notes!: EntityTable<DayNote, 'id'>;
  steps!: EntityTable<StepsEntry, 'id'>;
  runs!: EntityTable<RunEntry, 'id'>;
  lifts!: EntityTable<LiftEntry, 'id'>;

  constructor(name = 'plate-tracker') {
    super(name);
    this.version(1).stores({
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
    // v2: lifts get user-defined workout types (typeId + saved label) and settings get
    // carb/fat ranges + workout types. Nothing is deleted: old fields stay on the rows.
    this.version(2)
      .stores({ lifts: 'id, date, typeId' })
      .upgrade(async (tx) => {
        await tx
          .table('lifts')
          .toCollection()
          .modify((row: Partial<LiftEntry>) => {
            Object.assign(row, migrateLift(row));
          });
        await tx
          .table('settings')
          .toCollection()
          .modify((row: Partial<Settings>) => {
            Object.assign(row, migrateSettings(row));
          });
      });
  }
}

export const db = new TrackerDB();

export const SYNC_TABLES = [
  'foods',
  'entries',
  'savedMeals',
  'favorites',
  'weights',
  'waists',
  'notes',
  'steps',
  'runs',
  'lifts',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export async function getSettings(database: TrackerDB = db): Promise<Settings> {
  const s = await database.settings.get('main');
  // Merge with defaults so settings saved by older versions gain new fields.
  const d = defaultSettings();
  if (!s) return d;
  return { ...d, ...migrateSettings(s), profile: { ...d.profile, ...s.profile }, portionRefs: { ...d.portionRefs, ...s.portionRefs } };
}

export async function saveSettings(patch: Partial<Omit<Settings, 'id'>>, database: TrackerDB = db): Promise<void> {
  const cur = await getSettings(database);
  await database.settings.put({ ...cur, ...patch, id: 'main', updatedAt: Date.now() });
}

/** Soft delete (keeps a tombstone so backup merges don't bring it back). */
export async function softDelete(table: SyncTable, id: string, database: TrackerDB = db): Promise<void> {
  await database.table(table).update(id, { deleted: true, updatedAt: Date.now() });
}

export const live = <T extends { deleted?: boolean }>(rows: T[]): T[] => rows.filter((r) => !r.deleted);
