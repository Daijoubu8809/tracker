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
  return { ...d, ...s, profile: { ...d.profile, ...s.profile }, portionRefs: { ...d.portionRefs, ...s.portionRefs } };
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
