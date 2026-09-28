import { NumberField, useNumberField, type NumberFieldState } from './NumberField';

export interface NutritionValues {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface NutritionFieldsState {
  kcal: NumberFieldState;
  protein: NumberFieldState;
  carbs: NumberFieldState;
  fat: NumberFieldState;
  all: NumberFieldState[];
}

/** Calories + macros as form fields (validated on Save). Empty macros count as 0; calories are required. */
export function useNutritionFields(initial: Partial<NutritionValues> | null, maxKcal = 10000): NutritionFieldsState {
  const kcal = useNumberField(initial?.kcal ?? null, { min: 0, max: maxKcal, required: true, label: 'Calories', unit: 'kcal' }, 0);
  const protein = useNumberField(initial?.protein ?? null, { min: 0, max: 1000, label: 'Protein', unit: 'g' }, 1);
  const carbs = useNumberField(initial?.carbs ?? null, { min: 0, max: 1000, label: 'Carbs', unit: 'g' }, 1);
  const fat = useNumberField(initial?.fat ?? null, { min: 0, max: 1000, label: 'Fat', unit: 'g' }, 1);
  return { kcal, protein, carbs, fat, all: [kcal, protein, carbs, fat] };
}

export function NutritionInputs({ f, kcalLabel = 'Calories', macroLabels }: { f: NutritionFieldsState; kcalLabel?: string; macroLabels?: [string, string, string] }) {
  const [p, c, fa] = macroLabels ?? ['Protein', 'Carbs', 'Fat'];
  return (
    <div className="grid-2">
      <NumberField label={kcalLabel} unit="kcal" field={f.kcal} />
      <NumberField label={p} unit="g" field={f.protein} />
      <NumberField label={c} unit="g" field={f.carbs} />
      <NumberField label={fa} unit="g" field={f.fat} />
    </div>
  );
}

/** Values after a successful checkAll (empty macros → 0). */
export function nutritionFrom(values: (number | null)[]): NutritionValues {
  const [kcal, protein, carbs, fat] = values;
  return { kcal: kcal ?? 0, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 };
}
