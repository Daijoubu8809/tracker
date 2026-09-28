import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Sheet, TextField } from '../components/ui';
import { db, live } from '../lib/db';
import { addDays, formatDateLong } from '../lib/dates';
import { newId } from '../lib/id';
import { addItems, deleteEntries, entriesFor, MEAL_LABEL, restoreEntries, toItem } from '../lib/log';
import { sumItems } from '../lib/portions';
import type { ISODate, LogEntry, Meal, SavedMeal } from '../lib/types';
import { useApp } from '../state';
import { useLogItems } from './Log';

function useSavedMeals(): SavedMeal[] {
  return useLiveQuery(async () => live(await db.savedMeals.toArray()).sort((a, b) => a.name.localeCompare(b.name)), [], []);
}

export async function saveMealTemplate(name: string, meal: Meal | null, entries: readonly LogEntry[]): Promise<void> {
  await db.savedMeals.put({ id: newId(), name, meal, items: entries.map(toItem), updatedAt: Date.now() });
}

export function SavedMeals() {
  const meals = useSavedMeals();
  const logItems = useLogItems();
  const [editing, setEditing] = useState<SavedMeal | null>(null);
  if (!meals.length) {
    return (
      <p className="muted small">
        No saved meals yet. On the Today screen, tap <b>⋯</b> next to a meal and choose “Save as meal” — e.g. “My usual breakfast”.
      </p>
    );
  }
  return (
    <>
      <ul className="list">
        {meals.map((m) => {
          const t = sumItems(m.items);
          return (
            <li key={m.id} className="row">
              <button type="button" className="list-item grow" onClick={() => void logItems(m.items, m.name)}>
                <div className="grow">
                  <div>{m.name}</div>
                  <div className="small muted">{m.items.map((i) => i.name).join(', ')}</div>
                </div>
                <span className="kcal">{Math.round(t.kcal)}</span>
              </button>
              <button type="button" className="btn small ghost" onClick={() => setEditing(m)}>
                Edit
              </button>
            </li>
          );
        })}
      </ul>
      <p className="tiny muted">Tap a meal to log it in one go.</p>
      {editing ? <EditSavedMeal meal={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function EditSavedMeal({ meal, onClose }: { meal: SavedMeal; onClose: () => void }) {
  const [name, setName] = useState(meal.name);
  const [items, setItems] = useState(meal.items);
  return (
    <Sheet title="Edit saved meal" onClose={onClose}>
      <TextField label="Name" value={name} onChange={setName} />
      <ul className="list">
        {items.map((it, i) => (
          <li key={i} className="row">
            <div className="grow" style={{ padding: '8px 0' }}>
              <div>{it.name}</div>
              <div className="small muted">
                {it.portionText} · {it.kcal} kcal
              </div>
            </div>
            <button type="button" className="btn small danger" onClick={() => setItems(items.filter((_, j) => j !== i))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            void db.savedMeals.update(meal.id, { deleted: true, updatedAt: Date.now() });
            onClose();
          }}
        >
          Delete
        </button>
        <button
          type="button"
          className="btn primary grow"
          disabled={!name.trim() || !items.length}
          onClick={() => {
            void db.savedMeals.update(meal.id, { name: name.trim(), items, updatedAt: Date.now() });
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}

/** Copy one meal's items from another day. Returns the new entry ids (empty if nothing to copy). */
export async function copyMeal(from: ISODate, to: ISODate, meal: Meal): Promise<string[]> {
  const src = await entriesFor(from, meal);
  if (!src.length) return [];
  return addItems(to, meal, src.map(toItem));
}

/** Per-meal actions on the Today screen: copy yesterday's, save as template, clear. */
export function MealActions({ meal, date, entries }: { meal: Meal; date: ISODate; entries: LogEntry[] }) {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const yesterday = addDays(date, -1);

  const copyFrom = async (from: ISODate) => {
    const ids = await copyMeal(from, date, meal);
    if (!ids.length) {
      toast(`Nothing logged for ${MEAL_LABEL[meal].toLowerCase()} ${formatDateLong(from).toLowerCase()}`);
      return;
    }
    toast(`Copied ${ids.length} item${ids.length > 1 ? 's' : ''}`, { label: 'Undo', run: () => void deleteEntries(ids) });
    setOpen(false);
  };

  return (
    <>
      <button type="button" className="icon-btn" aria-label={`${MEAL_LABEL[meal]} options`} onClick={() => setOpen(true)}>
        ⋯
      </button>
      {open ? (
        <Sheet title={MEAL_LABEL[meal]} onClose={() => setOpen(false)}>
          <button type="button" className="btn block" onClick={() => void copyFrom(yesterday)}>
            Copy {formatDateLong(yesterday).toLowerCase()}’s {MEAL_LABEL[meal].toLowerCase()}
          </button>
          {naming == null ? (
            <button type="button" className="btn block" disabled={!entries.length} onClick={() => setNaming(`My usual ${MEAL_LABEL[meal].toLowerCase()}`)}>
              Save as meal…
            </button>
          ) : (
            <div className="stack">
              <TextField label="Meal name" value={naming} onChange={setNaming} />
              <button
                type="button"
                className="btn primary block"
                disabled={!naming.trim()}
                onClick={() => {
                  void saveMealTemplate(naming.trim(), meal, entries).then(() => toast(`Saved “${naming.trim()}”`));
                  setNaming(null);
                  setOpen(false);
                }}
              >
                Save meal
              </button>
            </div>
          )}
          <button
            type="button"
            className="btn danger block"
            disabled={!entries.length}
            onClick={() => {
              const ids = entries.map((e) => e.id);
              void deleteEntries(ids);
              toast(`Cleared ${MEAL_LABEL[meal].toLowerCase()}`, { label: 'Undo', run: () => void restoreEntries(ids) });
              setOpen(false);
            }}
          >
            Clear {MEAL_LABEL[meal].toLowerCase()}
          </button>
        </Sheet>
      ) : null}
    </>
  );
}
