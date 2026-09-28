import { useState } from 'react';
import { Check, TextField } from '../components/ui';
import { checkAll, NumberField, useNumberField } from '../components/NumberField';
import { NutritionInputs, nutritionFrom, useNutritionFields } from '../components/NutritionFields';
import { parseNumberInput } from '../lib/numberInput';
import { labelToFood, labelToItem, parseAmount, type LabelInput } from '../lib/label';
import { MEAL_LABEL } from '../lib/log';
import { useApp } from '../state';
import { saveFood } from './FoodEditor';
import { useLogItems } from './Log';
import { BarcodeButton } from './Barcode';

export interface LabelPrefill {
  name?: string;
  servingText?: string;
  servingGrams?: number | null;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export function LabelEntry() {
  const { logMeal, toast } = useApp();
  const logItems = useLogItems();
  const [name, setName] = useState('');
  const [servingText, setServingText] = useState('');
  const servingGrams = useNumberField(null, { min: 1, max: 5000, label: 'Serving weight', unit: 'g' }, 1);
  const nutrition = useNutritionFields(null, 5000);
  const perContainer = useNumberField(null, { min: 0.1, max: 500, label: 'Servings per container' }, 2);
  // Servings eaten: decimals ("1.5") or fractions ("1 1/2") — the chips cover ½, 1½ on phones.
  const eaten = useNumberField(1, { min: 0.01, max: 100, required: true, label: 'Servings', parse: (t) => parseAmount(t) ?? parseNumberInput(t).value }, 2);
  const [saveCustom, setSaveCustom] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);

  // Live preview from the drafts (display only; nothing is saved until you tap Log).
  const draftCal = parseNumberInput(nutrition.kcal.text).value;
  const draftEaten = parseAmount(eaten.text) ?? parseNumberInput(eaten.text).value;
  const draftPer = parseNumberInput(perContainer.text).value;

  const reset = () => {
    setName('');
    setServingText('');
    [servingGrams, perContainer, ...nutrition.all].forEach((x) => x.reset(null));
    eaten.reset(1);
  };

  const submit = async () => {
    const r = checkAll([servingGrams, perContainer, eaten, ...nutrition.all]);
    const nameOk = !!name.trim();
    setNameError(nameOk ? null : 'Enter a food name.');
    if (!r.ok || !nameOk) return;
    const [g, per, ate, ...macros] = r.values;
    const n = nutritionFrom(macros);
    const l: LabelInput = {
      name,
      servingText,
      servingGrams: g,
      servingsPerContainer: per,
      calories: n.kcal,
      protein: n.protein,
      carbs: n.carbs,
      fat: n.fat,
      servingsEaten: ate ?? 1,
    };
    let foodId: string | null = null;
    if (saveCustom) {
      const food = labelToFood(l);
      await saveFood(food);
      foodId = food.id;
    }
    await logItems([labelToItem(l, foodId)]);
    if (saveCustom) toast(`Saved “${l.name.trim()}” to your foods and logged it`);
    reset();
  };

  return (
    <div className="stack">
      <BarcodeButton
        onFound={(p) => {
          if (p.name) setName(p.name);
          if (p.servingText) setServingText(p.servingText);
          if (p.servingGrams != null) servingGrams.reset(p.servingGrams);
          if (p.calories != null) nutrition.kcal.reset(p.calories);
          if (p.protein != null) nutrition.protein.reset(p.protein);
          if (p.carbs != null) nutrition.carbs.reset(p.carbs);
          if (p.fat != null) nutrition.fat.reset(p.fat);
        }}
      />
      <TextField label="Food name" value={name} placeholder="e.g. Clif Bar, chocolate chip" onChange={setName} />
      {nameError && !name.trim() ? (
        <span className="field-msg" role="status">
          {nameError}
        </span>
      ) : null}
      <div className="grid-2">
        <TextField label="Serving size" value={servingText} placeholder="e.g. 1 bar" onChange={setServingText} />
        <NumberField label="Serving weight (optional)" unit="g" field={servingGrams} />
      </div>
      <p className="small muted">Numbers per serving, as printed on the label:</p>
      <NutritionInputs f={nutrition} macroLabels={['Protein', 'Total carbs', 'Total fat']} />
      <NumberField label="Servings per container (optional)" field={perContainer} />
      <NumberField label="Servings I ate" field={eaten} hint="Decimals or fractions, e.g. 1.5 or 1 1/2" />
      <div className="chips">
        {[
          ['0.5', '½'],
          ['1', '1'],
          ['1.5', '1½'],
          ['2', '2'],
        ].map(([v, label]) => (
          <button key={v} type="button" className="chip" aria-pressed={eaten.text.trim() === v} onClick={() => eaten.reset(Number(v))}>
            {label}
          </button>
        ))}
        {draftPer ? (
          <button type="button" className="chip" onClick={() => eaten.reset(draftPer)}>
            Whole container ({draftPer})
          </button>
        ) : null}
      </div>
      <Check label="Save as a custom food for next time" checked={saveCustom} onChange={setSaveCustom} />
      {draftCal != null && draftEaten != null ? (
        <div className="banner row between">
          <span>
            {Math.round(draftEaten * 100) / 100} × {servingText.trim() || 'serving'}
          </span>
          <b className="num">{Math.round(draftCal * draftEaten)} kcal</b>
        </div>
      ) : null}
      <button type="button" className="btn primary big block" onClick={() => void submit()}>
        Log to {MEAL_LABEL[logMeal]}
      </button>
    </div>
  );
}
