import { db, live } from './db';
import { newId } from './id';
import type { ISODate, LogEntry, LoggedItem, Meal } from './types';

export async function addItems(date: ISODate, meal: Meal, items: readonly LoggedItem[]): Promise<string[]> {
  const now = Date.now();
  const rows: LogEntry[] = items.map((item, i) => ({
    ...item,
    id: newId(),
    date,
    meal,
    createdAt: now + i,
    updatedAt: now + i,
  }));
  await db.entries.bulkPut(rows);
  return rows.map((r) => r.id);
}

export async function updateEntry(id: string, patch: Partial<Omit<LogEntry, 'id'>>): Promise<void> {
  await db.entries.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteEntries(ids: readonly string[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.entries, async () => {
    for (const id of ids) await db.entries.update(id, { deleted: true, updatedAt: now });
  });
}

export async function restoreEntries(ids: readonly string[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.entries, async () => {
    for (const id of ids) await db.entries.update(id, { deleted: false, updatedAt: now });
  });
}

export async function toggleFavorite(foodId: string): Promise<boolean> {
  const cur = await db.favorites.get(foodId);
  const on = !cur || !!cur.deleted;
  await db.favorites.put({ id: foodId, updatedAt: Date.now(), deleted: !on });
  return on;
}

export async function entriesFor(date: ISODate, meal?: Meal): Promise<LogEntry[]> {
  const rows = live(await db.entries.where('date').equals(date).toArray());
  return (meal ? rows.filter((r) => r.meal === meal) : rows).sort((a, b) => a.createdAt - b.createdAt);
}

/** Strip storage fields so an entry can be re-logged or saved in a template. */
export function toItem(e: LogEntry): LoggedItem {
  return {
    name: e.name,
    foodId: e.foodId,
    portion: e.portion,
    portionText: e.portionText,
    grams: e.grams,
    kcal: e.kcal,
    protein: e.protein,
    carbs: e.carbs,
    fat: e.fat,
    ...(e.fiber != null ? { fiber: e.fiber } : {}),
    ...(e.sodium != null ? { sodium: e.sodium } : {}),
    uncertaintyPct: e.uncertaintyPct,
    source: e.source,
  };
}

export const MEAL_LABEL: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};
