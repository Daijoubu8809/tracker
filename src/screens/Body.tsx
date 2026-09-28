import { useState } from 'react';
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
