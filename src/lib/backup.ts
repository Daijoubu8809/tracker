import { z } from 'zod';
import { db as defaultDb, getSettings, migrateSettings, SYNC_TABLES, type SyncTable, type TrackerDB } from './db';
import { migrateLift } from './workouts';
import type { Settings, Syncable } from './types';

export const BACKUP_APP = 'plate-tracker';
export const BACKUP_VERSION = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  settings: Settings;
  tables: Record<SyncTable, Syncable[]>;
}

export async function exportData(database: TrackerDB = defaultDb): Promise<Backup> {
  const tables = {} as Record<SyncTable, Syncable[]>;
  for (const t of SYNC_TABLES) tables[t] = (await database.table(t).toArray()) as Syncable[];
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: await getSettings(database),
    tables,
  };
}

const RowSchema = z.looseObject({ id: z.string().min(1), updatedAt: z.number() });
const BackupSchema = z.object({
  app: z.literal(BACKUP_APP, { error: 'This file isn’t a Plate Tracker backup.' }),
  version: z.number().int().max(BACKUP_VERSION, { error: 'This backup is from a newer version of the app. Update the app first.' }),
  exportedAt: z.string().optional(),
  settings: z.looseObject({ id: z.literal('main'), updatedAt: z.number() }).optional(),
  tables: z.record(z.string(), z.array(z.unknown())),
});

export interface MergeStats {
  added: number;
  updated: number;
  unchanged: number;
  invalid: number;
}

/** Merge rows by id: new ids are added; for existing ids the newer `updatedAt` wins. */
export function mergeRows<T extends Syncable>(existing: readonly T[], incoming: readonly T[]): { put: T[]; stats: MergeStats } {
  const cur = new Map(existing.map((r) => [r.id, r]));
  const put: T[] = [];
  const stats: MergeStats = { added: 0, updated: 0, unchanged: 0, invalid: 0 };
  const seen = new Set<string>();
  for (const row of incoming) {
    if (seen.has(row.id)) continue; // duplicate within the file
    seen.add(row.id);
    const mine = cur.get(row.id);
    if (!mine) {
      put.push(row);
      stats.added++;
    } else if (row.updatedAt > mine.updatedAt) {
      put.push(row);
      stats.updated++;
    } else {
      stats.unchanged++;
    }
  }
  return { put, stats };
}

export interface ImportResult {
  ok: boolean;
  error: string | null;
  stats: Record<string, MergeStats>;
  settingsUpdated: boolean;
}

export function summarize(r: ImportResult): string {
  let added = 0;
  let updated = 0;
  for (const s of Object.values(r.stats)) {
    added += s.added;
    updated += s.updated;
  }
  return `${added} added, ${updated} updated${r.settingsUpdated ? ', settings updated' : ''}. Nothing was duplicated.`;
}

export async function importData(text: string, database: TrackerDB = defaultDb): Promise<ImportResult> {
  const fail = (error: string): ImportResult => ({ ok: false, error, stats: {}, settingsUpdated: false });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('That file isn’t valid JSON. Pick the .json file the app exported.');
  }
  const parsed = BackupSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Unrecognized backup file.');
  const b = parsed.data;
  const stats: Record<string, MergeStats> = {};
  let settingsUpdated = false;
  await database.transaction('rw', [database.settings, ...SYNC_TABLES.map((t) => database.table(t))], async () => {
    for (const t of SYNC_TABLES) {
      const rows = b.tables[t] ?? [];
      const valid: Syncable[] = [];
      let invalid = 0;
      for (const r of rows) {
        const ok = RowSchema.safeParse(r);
        // Older backups: bring v1 lift rows up to the current shape.
        if (ok.success) valid.push((t === 'lifts' ? migrateLift(ok.data) : ok.data) as Syncable);
        else invalid++;
      }
      const existing = (await database.table(t).toArray()) as Syncable[];
      const { put, stats: s } = mergeRows(existing, valid);
      s.invalid = invalid;
      if (put.length) await database.table(t).bulkPut(put);
      stats[t] = s;
    }
    if (b.settings) {
      const mine = await database.settings.get('main');
      const incoming = migrateSettings(b.settings as unknown as Settings);
      if (!mine || incoming.updatedAt > mine.updatedAt) {
        await database.settings.put({
          ...incoming,
          lastBackupAt: Math.max(incoming.lastBackupAt ?? 0, mine?.lastBackupAt ?? 0) || null,
        });
        settingsUpdated = true;
      }
    }
  });
  return { ok: true, error: null, stats, settingsUpdated };
}

export const BACKUP_REMINDER_DAYS = 7;

/** Days since the last backup, or since data was first logged when there's never been one. */
export function daysSinceBackup(lastBackupAt: number | null, firstDataAt: number | null, now = Date.now()): number | null {
  const since = lastBackupAt ?? firstDataAt;
  if (since == null) return null;
  return Math.floor((now - since) / 86_400_000);
}
