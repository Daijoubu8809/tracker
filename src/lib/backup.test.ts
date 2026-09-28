import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { daysSinceBackup, exportData, importData, mergeRows } from './backup';
import { saveSettings, TrackerDB } from './db';
import type { LogEntry } from './types';

let n = 0;
const freshDb = () => new TrackerDB(`test-${++n}`);

const entry = (id: string, updatedAt: number, kcal = 100): LogEntry => ({
  id,
  updatedAt,
  date: '2026-09-28',
  meal: 'lunch',
  createdAt: 1,
  name: `Food ${id}`,
  foodId: null,
  portion: null,
  portionText: '1',
  grams: null,
  kcal,
  protein: 1,
  carbs: 1,
  fat: 1,
  uncertaintyPct: 10,
  source: 'manual',
});

describe('mergeRows', () => {
  it('adds new, updates newer, keeps newer local', () => {
    const { put, stats } = mergeRows([entry('a', 5), entry('b', 5)], [entry('a', 9, 200), entry('b', 1), entry('c', 1)]);
    expect(put.map((r) => r.id).sort()).toEqual(['a', 'c']);
    expect(stats).toEqual({ added: 1, updated: 1, unchanged: 1, invalid: 0 });
  });
  it('ignores duplicate ids inside a file', () => {
    expect(mergeRows([], [entry('a', 1), entry('a', 2)]).put).toHaveLength(1);
  });
});

describe('export / import round trip', () => {
  it('importing the same backup twice creates no duplicates', async () => {
    const a = freshDb();
    await a.entries.bulkPut([entry('x', 1), entry('y', 1)]);
    await a.weights.put({ id: '2026-09-28', date: '2026-09-28', kg: 75, updatedAt: 1 });
    await saveSettings({ proteinPerLb: 1 }, a);
    const backup = JSON.stringify(await exportData(a));

    const b = freshDb();
    const r1 = await importData(backup, b);
    expect(r1.ok).toBe(true);
    expect(r1.stats.entries.added).toBe(2);
    expect(r1.settingsUpdated).toBe(true);
    const r2 = await importData(backup, b);
    expect(r2.stats.entries).toEqual({ added: 0, updated: 0, unchanged: 2, invalid: 0 });
    expect(await b.entries.count()).toBe(2);
    expect(await b.weights.count()).toBe(1);
    expect((await b.settings.get('main'))?.proteinPerLb).toBe(1);
  });

  it('merges two devices and keeps deletions (tombstones)', async () => {
    const phone = freshDb();
    await phone.entries.bulkPut([entry('shared', 1), entry('phoneOnly', 1)]);
    const old = JSON.stringify(await exportData(phone));
    // Later the user deletes "shared" on the phone.
    await phone.entries.update('shared', { deleted: true, updatedAt: 5 });
    // Restoring the old backup must not bring it back.
    await importData(old, phone);
    expect((await phone.entries.get('shared'))?.deleted).toBe(true);

    const other = freshDb();
    await other.entries.put(entry('otherOnly', 1));
    await importData(JSON.stringify(await exportData(phone)), other);
    expect((await other.entries.toArray()).map((e) => e.id).sort()).toEqual(['otherOnly', 'phoneOnly', 'shared']);
  });

  it('rejects non-backup files with a clear error', async () => {
    const d = freshDb();
    expect((await importData('not json', d)).error).toMatch(/valid JSON/);
    expect((await importData('{"hello":1}', d)).error).toMatch(/isn’t a Plate Tracker backup/);
    expect((await importData('{"app":"plate-tracker","version":99,"tables":{}}', d)).error).toMatch(/newer version/);
  });

  it('skips malformed rows and counts them', async () => {
    const d = freshDb();
    const r = await importData(JSON.stringify({ app: 'plate-tracker', version: 1, tables: { entries: [entry('ok', 1), { nope: true }] } }), d);
    expect(r.stats.entries).toMatchObject({ added: 1, invalid: 1 });
  });
});

describe('backup reminder', () => {
  const day = 86_400_000;
  it('counts days since the last backup or first data', () => {
    expect(daysSinceBackup(null, null)).toBeNull();
    expect(daysSinceBackup(0, null, 8 * day)).toBe(8);
    expect(daysSinceBackup(null, 2 * day, 9 * day)).toBe(7);
  });
});
