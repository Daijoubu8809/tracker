import { useState } from 'react';
import { SelectField, Sheet, TextField } from '../components/ui';
import { checkAll, NumberField, useNumberField } from '../components/NumberField';
import { NutritionInputs, nutritionFrom, useNutritionFields } from '../components/NutritionFields';
import { parseNumberInput } from '../lib/numberInput';
import { useSettings } from '../hooks';
import { db } from '../lib/db';
import { newId } from '../lib/id';
import { availableUnits, UNIT_LABEL } from '../lib/portions';
import type { Food, FoodCategory, PortionUnit, StoredFood } from '../lib/types';
import { SEED_FOODS } from '../data/seedFoods';
import { useApp } from '../state';

const CATEGORIES: FoodCategory[] = [
  'starch',
  'protein',
  'vegetable',
  'fruit',
  'dairy',
  'fat',
  'mixed',
  'dessert',
  'drink',
  'breakfast',
  'snack',
  'condiment',
];

export function newCustomFood(): Food {
  return {
    id: `c:${newId()}`,
    name: '',
    aliases: [],
    category: 'mixed',
    kcal100: 0,
    protein100: 0,
    carbs100: 0,
    fat100: 0,
    defaultUnit: 'g',
    uncertaintyPct: 20,
    source: 'Custom',
  };
}

export async function saveFood(food: Food): Promise<void> {
  const builtin = SEED_FOODS.some((f) => f.id === food.id);
  const row: StoredFood = { ...food, builtin, updatedAt: Date.now(), deleted: false };
  await db.foods.put(row);
}

/** Positive number or undefined. */
const pos = (v: number | null | undefined) => (v != null && v > 0 ? v : undefined);

export function FoodEditor({ food, isNew = false, onClose }: { food: Food & { builtin?: boolean }; isNew?: boolean; onClose: () => void }) {
  const { portionRefs } = useSettings();
  const { toast } = useApp();
  const [f, setF] = useState<Food>(() => {
    const { builtin: _b, edited: _e, ...rest } = food as Food & { builtin?: boolean; edited?: boolean };
    return rest;
  });
  const isBuiltin = SEED_FOODS.some((s) => s.id === f.id);
  const basis = f.nominal ? 'per serving' : 'per 100 g';
  const nutrition = useNutritionFields({ kcal: food.kcal100, protein: food.protein100, carbs: food.carbs100, fat: food.fat100 }, food.nominal ? 5000 : 902);
  const fiber = useNumberField(food.fiber100 ?? null, { min: 0, max: 100, label: 'Fiber', unit: 'g' }, 1);
  const sodium = useNumberField(food.sodium100 ?? null, { min: 0, max: 50000, label: 'Sodium', unit: 'mg' }, 0);
  const cup = useNumberField(food.gramsPerCup ?? null, { min: 1, max: 2000, label: 'Cup weight', unit: 'g' }, 1);
  const slice = useNumberField(food.gramsPerSlice ?? null, { min: 1, max: 2000, label: 'Slice weight', unit: 'g' }, 1);
  const piece = useNumberField(food.gramsPerPiece ?? null, { min: 0.1, max: 2000, label: 'Piece weight', unit: 'g' }, 1);
  const serving = useNumberField(food.servingGrams ?? null, { min: 1, max: 5000, label: 'Serving weight', unit: 'g' }, 1);
  const uncertainty = useNumberField(food.uncertaintyPct, { integer: true, min: 0, max: 100, required: true, label: 'Uncertainty', unit: '%' }, 0);
  // Which portions the food will support, from the current drafts (display only).
  const draftNum = (t: string) => pos(parseNumberInput(t).value);
  const units = availableUnits(
    f.nominal
      ? f
      : { ...f, gramsPerCup: draftNum(cup.text), gramsPerSlice: draftNum(slice.text), gramsPerPiece: draftNum(piece.text), servingGrams: draftNum(serving.text) },
    portionRefs,
  );

  const save = async () => {
    const fields = [...nutrition.all, fiber, sodium, cup, slice, piece, serving, uncertainty];
    const r = checkAll(fields);
    if (!r.ok) return;
    const [, , , , fib, sod, c, sl, pc, sv, unc] = r.values;
    const n = nutritionFrom(r.values.slice(0, 4));
    const clean: Food = {
      ...f,
      name: f.name.trim(),
      kcal100: n.kcal,
      protein100: n.protein,
      carbs100: n.carbs,
      fat100: n.fat,
      fiber100: fib ?? undefined,
      sodium100: sod ?? undefined,
      gramsPerCup: pos(c),
      gramsPerPiece: pos(pc),
      gramsPerSlice: pos(sl),
      servingGrams: f.nominal ? 100 : pos(sv),
      uncertaintyPct: unc ?? 0,
      defaultUnit: units.includes(f.defaultUnit) ? f.defaultUnit : (units[0] ?? 'g'),
    };
    await saveFood(clean);
    toast(isNew ? `Saved “${clean.name}”` : 'Food updated');
    onClose();
  };

  const remove = async () => {
    const now = Date.now();
    const existing = await db.foods.get(f.id);
    if (existing) await db.foods.put({ ...existing, deleted: true, updatedAt: now });
    else await db.foods.put({ ...f, builtin: isBuiltin, deleted: true, updatedAt: now });
    toast(isBuiltin ? 'Food hidden' : 'Food deleted', {
      label: 'Undo',
      run: () => void db.foods.update(f.id, { deleted: false, updatedAt: Date.now() }),
    });
    onClose();
  };

  const reset = async () => {
    await db.foods.delete(f.id);
    toast('Reset to built-in values');
    onClose();
  };

  return (
    <Sheet title={isNew ? 'New custom food' : `Edit ${food.name}`} onClose={onClose}>
      <TextField label="Name" value={f.name} onChange={(name) => setF({ ...f, name })} />
      <TextField
        label="Other search words (comma-separated)"
        value={f.aliases.join(', ')}
        onChange={(v) => setF({ ...f, aliases: v.split(',').map((s) => s.trim()).filter(Boolean) })}
      />
      <SelectField<FoodCategory>
        label="Category"
        value={f.category}
        options={CATEGORIES.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))}
        onChange={(category) => setF({ ...f, category })}
      />
      <h3>Nutrition {basis}</h3>
      <NutritionInputs f={nutrition} />
      <div className="grid-2">
        <NumberField label="Fiber (optional)" unit="g" field={fiber} />
        <NumberField label="Sodium (optional)" unit="mg" field={sodium} />
      </div>
      {f.nominal ? (
        <TextField label="Serving description" value={f.servingName ?? ''} onChange={(servingName) => setF({ ...f, servingName })} />
      ) : (
        <>
          <h3>Household portions (grams in one…)</h3>
          <div className="grid-2">
            <NumberField label="Cup" unit="g" field={cup} />
            <NumberField label="Slice" unit="g" field={slice} />
            <NumberField label="Piece" unit="g" field={piece} />
            <TextField label="Piece name" value={f.pieceName ?? ''} placeholder="e.g. cookie" onChange={(pieceName) => setF({ ...f, pieceName: pieceName || undefined })} />
            <NumberField label="Serving" unit="g" field={serving} />
            <TextField label="Serving name" value={f.servingName ?? ''} placeholder="e.g. 1 bar" onChange={(servingName) => setF({ ...f, servingName: servingName || undefined })} />
          </div>
          <p className="small muted">Without a cup weight, volume portions (fist, scoop, plate…) aren’t offered for this food.</p>
        </>
      )}
      <div className="grid-2">
        <SelectField<PortionUnit>
          label="Default portion"
          value={units.includes(f.defaultUnit) ? f.defaultUnit : (units[0] ?? 'g')}
          options={units.map((u) => ({ value: u, label: UNIT_LABEL[u].one }))}
          onChange={(defaultUnit) => setF({ ...f, defaultUnit })}
        />
        <NumberField label="Uncertainty" unit="±%" field={uncertainty} />
      </div>
      <TextField label="Source / notes" value={f.source} onChange={(source) => setF({ ...f, source })} />
      <div className="row wrap">
        {!isNew ? (
          <button type="button" className="btn danger" onClick={() => void remove()}>
            {isBuiltin ? 'Hide' : 'Delete'}
          </button>
        ) : null}
        {isBuiltin ? (
          <button type="button" className="btn" onClick={() => void reset()}>
            Reset
          </button>
        ) : null}
        <button type="button" className="btn primary grow" disabled={!f.name.trim()} onClick={() => void save()}>
          Save
        </button>
      </div>
    </Sheet>
  );
}
