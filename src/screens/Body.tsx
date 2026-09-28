import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { NumField, Sheet } from '../components/ui';
import { useSettings, useWeighIn, useWeightKg } from '../hooks';
import { db } from '../lib/db';
import { formatDateLong } from '../lib/dates';
import type { ISODate } from '../lib/types';
import { displayWeight, inputWeightToKg, weightUnit } from '../lib/units';

export async function saveWeight(date: ISODate, kg: number | null): Promise<void> {
  if (kg == null) {
    const cur = await db.weights.get(date);
    if (cur) await db.weights.put({ ...cur, deleted: true, updatedAt: Date.now() });
    return;
  }
  await db.weights.put({ id: date, date, kg, updatedAt: Date.now() });
}

export function QuickWeighIn({ date, onClose }: { date: ISODate; onClose: () => void }) {
  const { units } = useSettings();
  const existing = useWeighIn(date);
  const current = useWeightKg(date);
  const [value, setValue] = useState<number | null>(null);
  const shown = value ?? (existing ? displayWeight(existing.kg, units) : null);
  return (
    <Sheet title={`Weigh-in · ${formatDateLong(date)}`} onClose={onClose}>
      <p className="small muted">Best: morning, after the bathroom, before eating or drinking.</p>
      <NumField
        label="Weight"
        value={shown}
        unit={weightUnit(units)}
        placeholder={displayWeight(current, units).toFixed(1)}
        onChange={setValue}
      />
      <div className="row">
        {existing ? (
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              void saveWeight(date, null);
              onClose();
            }}
          >
            Delete
          </button>
        ) : null}
        <button
          type="button"
          className="btn primary grow"
          disabled={shown == null || shown <= 0}
          onClick={() => {
            if (shown != null) void saveWeight(date, inputWeightToKg(shown, units));
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}

/** Optional free-text note for a day ("high sodium dinner", "slept badly"). */
export function DayNoteField({ date }: { date: ISODate }) {
  const note = useLiveQuery(async () => (await db.notes.get(date)) ?? null, [date]);
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (note && !note.deleted ? note.text : '');
  useEffect(() => setText(null), [date]);
  const save = () => {
    if (text == null) return;
    void db.notes.put({ id: date, date, text: text.trim(), updatedAt: Date.now() });
  };
  return (
    <div className="field">
      <label htmlFor={`note-${date}`}>Note for the day (optional)</label>
      <textarea
        id={`note-${date}`}
        className="input"
        rows={2}
        style={{ minHeight: 60 }}
        placeholder="e.g. high sodium dinner, slept badly"
        value={shown}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
      />
    </div>
  );
}
