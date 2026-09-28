import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Sheet } from '../components/ui';
import { checkAll, NumberField, useNumberField } from '../components/NumberField';
import { useSettings, useWeighIn, useWeightKg } from '../hooks';
import { db } from '../lib/db';
import { formatDateLong } from '../lib/dates';
import type { ISODate, UnitSystem } from '../lib/types';
import { displayWeight, inputWeightToKg, weightRules, weightUnit } from '../lib/units';

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
  return (
    <Sheet title={`Weigh-in · ${formatDateLong(date)}`} onClose={onClose}>
      <p className="small muted">Best: morning, after the bathroom, before eating or drinking.</p>
      {/* Keyed so the form starts from the stored weigh-in once it has loaded. */}
      <WeighInForm key={existing?.id ?? 'new'} date={date} existingKg={existing?.kg ?? null} currentKg={current} units={units} onClose={onClose} />
    </Sheet>
  );
}

function WeighInForm({
  date,
  existingKg,
  currentKg,
  units,
  onClose,
}: {
  date: ISODate;
  existingKg: number | null;
  currentKg: number;
  units: UnitSystem;
  onClose: () => void;
}) {
  const weight = useNumberField(existingKg == null ? null : displayWeight(existingKg, units), { ...weightRules(units), required: true }, 1);
  return (
    <>
      <NumberField label="Weight" unit={weightUnit(units)} placeholder={displayWeight(currentKg, units).toFixed(1)} field={weight} />
      <div className="row">
        {existingKg != null ? (
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
          onClick={() => {
            const r = checkAll([weight]);
            if (!r.ok || r.values[0] == null) return;
            // Unchanged text → keep the stored kg exactly (no lb↔kg round-trip).
            if (weight.dirty || existingKg == null) void saveWeight(date, inputWeightToKg(r.values[0], units));
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </>
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
