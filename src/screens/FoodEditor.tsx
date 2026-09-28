import { useState } from 'react';
import { NumField, SelectField, Sheet, TextField } from '../components/ui';
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
  const units = availableUnits(f, portionRefs);
  const basis = f.nominal ? 'per serving' : 'per 100 g';

  const save = async () => {
    const clean: Food = {
      ...f,
      name: f.name.trim(),
      gramsPerCup: pos(f.gramsPerCup),
      gramsPerPiece: pos(f.gramsPerPiece),
      gramsPerSlice: pos(f.gramsPerSlice),
      servingGrams: f.nominal ? 100 : pos(f.servingGrams),
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
      <div className="grid-2">
        <NumField label="Calories" value={f.kcal100} digits={0} unit="kcal" onChange={(v) => setF({ ...f, kcal100: v ?? 0 })} />
        <NumField label="Protein" value={f.protein100} unit="g" onChange={(v) => setF({ ...f, protein100: v ?? 0 })} />
        <NumField label="Carbs" value={f.carbs100} unit="g" onChange={(v) => setF({ ...f, carbs100: v ?? 0 })} />
        <NumField label="Fat" value={f.fat100} unit="g" onChange={(v) => setF({ ...f, fat100: v ?? 0 })} />
        <NumField label="Fiber (optional)" value={f.fiber100 ?? null} unit="g" onChange={(v) => setF({ ...f, fiber100: v ?? undefined })} />
        <NumField label="Sodium (optional)" value={f.sodium100 ?? null} digits={0} unit="mg" onChange={(v) => setF({ ...f, sodium100: v ?? undefined })} />
      </div>
      {f.nominal ? (
        <TextField label="Serving description" value={f.servingName ?? ''} onChange={(servingName) => setF({ ...f, servingName })} />
      ) : (
        <>
          <h3>Household portions (grams in one…)</h3>
          <div className="grid-2">
            <NumField label="Cup" value={f.gramsPerCup ?? null} digits={0} unit="g" onChange={(v) => setF({ ...f, gramsPerCup: v ?? undefined })} />
            <NumField label="Slice" value={f.gramsPerSlice ?? null} digits={0} unit="g" onChange={(v) => setF({ ...f, gramsPerSlice: v ?? undefined })} />
            <NumField label="Piece" value={f.gramsPerPiece ?? null} digits={1} unit="g" onChange={(v) => setF({ ...f, gramsPerPiece: v ?? undefined })} />
            <TextField label="Piece name" value={f.pieceName ?? ''} placeholder="e.g. cookie" onChange={(pieceName) => setF({ ...f, pieceName: pieceName || undefined })} />
            <NumField label="Serving" value={f.servingGrams ?? null} digits={0} unit="g" onChange={(v) => setF({ ...f, servingGrams: v ?? undefined })} />
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
        <NumField label="Uncertainty" value={f.uncertaintyPct} digits={0} unit="±%" onChange={(v) => setF({ ...f, uncertaintyPct: Math.min(100, Math.max(0, v ?? 0)) })} />
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
