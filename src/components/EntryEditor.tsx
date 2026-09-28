import { useState } from 'react';
import { useFoodMap, useSettings } from '../hooks';
import { deleteEntries, restoreEntries, updateEntry } from '../lib/log';
import { defaultSpec, itemFromFood } from '../lib/portions';
import type { FoodRecord } from '../lib/foods';
import type { LogEntry, PortionSpec } from '../lib/types';
import { useApp } from '../state';
import { FoodPicker } from './FoodPicker';
import { MealPicker } from './MealPicker';
import { PortionPicker } from './PortionPicker';
import { Sheet, TextField } from './ui';
import { checkAll, NumberField, useNumberField, type NumberFieldState } from './NumberField';
import { NutritionInputs, nutritionFrom, useNutritionFields, type NutritionFieldsState } from './NutritionFields';

export function EntryEditor({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const { portionRefs } = useSettings();
  const foods = useFoodMap();
  const { toast } = useApp();
  const [draft, setDraft] = useState<LogEntry>(entry);
  const [changingFood, setChangingFood] = useState(false);
  const food = draft.foodId ? foods.get(draft.foodId) : undefined;
  const structured = !!food && !!draft.portion;
  const nutrition = useNutritionFields(entry);
  const uncertainty = useNumberField(entry.uncertaintyPct, { integer: true, min: 0, max: 100, required: true, label: 'Uncertainty', unit: '%' }, 0);

  const setPortion = (f: FoodRecord, spec: PortionSpec) => {
    const item = itemFromFood(f, spec, portionRefs);
    if (item) setDraft({ ...draft, ...item });
  };

  const save = async () => {
    const { id: _id, ...rest } = draft;
    if (!structured) {
      const r = checkAll([...nutrition.all, uncertainty]);
      if (!r.ok) return;
      Object.assign(rest, nutritionFrom(r.values.slice(0, 4)), { uncertaintyPct: r.values[4] ?? 0 });
    }
    await updateEntry(entry.id, rest);
    onClose();
  };

  const remove = async () => {
    await deleteEntries([entry.id]);
    onClose();
    toast(`Deleted ${entry.name}`, { label: 'Undo', run: () => void restoreEntries([entry.id]) });
  };

  if (changingFood) {
    return (
      <Sheet title="Change food" onClose={() => setChangingFood(false)}>
        <FoodPicker
          autoFocus
          initialQuery={draft.name}
          onPick={(f) => {
            setChangingFood(false);
            setPortion(f, draft.portion && itemFromFood(f, draft.portion, portionRefs) ? draft.portion : defaultSpec(f, portionRefs));
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet title="Edit item" onClose={onClose}>
      {structured && food && draft.portion ? (
        <>
          <div className="row between">
            <b>{food.name}</b>
            <button type="button" className="btn small" onClick={() => setChangingFood(true)}>
              Change food
            </button>
          </div>
          <PortionPicker food={food} refs={portionRefs} value={draft.portion} onChange={(spec) => setPortion(food, spec)} />
        </>
      ) : (
        <ManualFields draft={draft} setDraft={setDraft} nutrition={nutrition} uncertainty={uncertainty} onChangeFood={() => setChangingFood(true)} />
      )}
      <MealPicker value={draft.meal} onChange={(meal) => setDraft({ ...draft, meal })} />
      <TextField label="Date" type="date" value={draft.date} onChange={(date) => date && setDraft({ ...draft, date })} />
      <div className="row">
        <button type="button" className="btn danger" onClick={() => void remove()}>
          Delete
        </button>
        <button type="button" className="btn primary grow" onClick={() => void save()}>
          Save
        </button>
      </div>
    </Sheet>
  );
}

function ManualFields({
  draft,
  setDraft,
  nutrition,
  uncertainty,
  onChangeFood,
}: {
  draft: LogEntry;
  setDraft: (e: LogEntry) => void;
  nutrition: NutritionFieldsState;
  uncertainty: NumberFieldState;
  onChangeFood: () => void;
}) {
  return (
    <div className="stack">
      <TextField label="Name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
      <TextField label="Portion" value={draft.portionText ?? ''} onChange={(portionText) => setDraft({ ...draft, portionText })} />
      <NutritionInputs f={nutrition} />
      <NumberField label="Uncertainty (±%)" unit="%" field={uncertainty} />
      <button type="button" className="btn small" onClick={onChangeFood}>
        Match to a food from the database instead
      </button>
    </div>
  );
}
