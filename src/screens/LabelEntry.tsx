import { useState } from 'react';
import { Check, TextField } from '../components/ui';
import { checkAll, NumberField, useNumberField } from '../components/NumberField';
import { NutritionInputs, nutritionFrom, useNutritionFields } from '../components/NutritionFields';
import { parseNumberInput } from '../lib/numberInput';
import { labelToFood, labelToItem, parseAmount, type LabelInput } from '../lib/label';
import { MEAL_LABEL } from '../lib/log';
import { FIELD_LABEL, FIELD_UNIT, type ParsedLabel } from '../lib/nutritionLabel';
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

/** A scanned label to review before logging. */
export interface LabelReview {
  parsed: ParsedLabel;
  /** Small JPEG data URL of the photo, to compare against. */
  thumb: string;
  onRetake: () => void;
  onManual: () => void;
  onCropRescan?: () => void;
  onDone: () => void;
}

const draftNum = (t: string) => parseNumberInput(t).value;

export function LabelEntry({ review }: { review?: LabelReview } = {}) {
  const { logMeal, toast } = useApp();
  const logItems = useLogItems();
  const p = review?.parsed;
  const v = p?.values ?? {};
  const [name, setName] = useState(p?.productName ?? '');
  const [servingText, setServingText] = useState(p?.servingSizeText ?? '');
  const servingGrams = useNumberField(p?.servingSizeG ?? null, { min: 1, max: 5000, label: 'Serving weight', unit: 'g' }, 1);
  const nutrition = useNutritionFields(p ? { kcal: v.calories, protein: v.protein, carbs: v.totalCarb, fat: v.totalFat } : null, 5000);
  const fiber = useNumberField(v.fiber ?? null, { min: 0, max: 100, label: 'Fiber', unit: 'g' }, 1);
  const sodium = useNumberField(v.sodium ?? null, { min: 0, max: 10000, label: 'Sodium', unit: 'mg' }, 0);
  const perContainer = useNumberField(p?.servingsPerContainer ?? null, { min: 0.1, max: 500, label: 'Servings per container' }, 2);
  // Servings eaten: decimals ("1.5") or fractions ("1 1/2") — the chips cover ½, 1½ on phones.
  const eaten = useNumberField(1, { min: 0.01, max: 100, required: true, label: 'Servings', parse: (t) => parseAmount(t) ?? parseNumberInput(t).value }, 2);
  const [saveCustom, setSaveCustom] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);

  // Live totals from the drafts (display only; nothing is saved until you tap a Log button).
  const draftEaten = parseAmount(eaten.text) ?? draftNum(eaten.text);
  const draftPer = draftNum(perContainer.text);
  const per = { kcal: draftNum(nutrition.kcal.text), p: draftNum(nutrition.protein.text), c: draftNum(nutrition.carbs.text), f: draftNum(nutrition.fat.text) };
  const times = (x: number | null, digits = 1) => (x == null || draftEaten == null ? '—' : String(Math.round(x * draftEaten * 10 ** digits) / 10 ** digits));

  const reset = () => {
    setName('');
    setServingText('');
    [servingGrams, perContainer, fiber, sodium, ...nutrition.all].forEach((x) => x.reset(null));
    eaten.reset(1);
  };

  /** Validate and log. `save` = also save as a custom food (needs a name). */
  const submit = async (save: boolean) => {
    const r = checkAll([servingGrams, perContainer, eaten, fiber, sodium, ...nutrition.all]);
    const nameOk = !!name.trim() || (!!review && !save);
    setNameError(nameOk ? null : save ? 'Enter a name to save it as a food.' : 'Enter a food name.');
    if (!r.ok || !nameOk) return;
    const [g, perC, ate, fib, sod, ...macros] = r.values;
    const n = nutritionFrom(macros);
    const l: LabelInput = {
      name: name.trim() || 'Scanned food',
      servingText,
      servingGrams: g,
      servingsPerContainer: perC,
      calories: n.kcal,
      protein: n.protein,
      carbs: n.carbs,
      fat: n.fat,
      fiber: fib,
      sodiumMg: sod,
      servingsEaten: ate ?? 1,
    };
    let foodId: string | null = null;
    if (save) {
      const food = labelToFood(l);
      await saveFood(food);
      foodId = food.id;
    }
    await logItems([labelToItem(l, foodId)]);
    if (save) toast(`Saved “${l.name}” to your foods and logged it`);
    if (review) review.onDone();
    else reset();
  };

  const attention = p?.check ?? {};
  const extras = p
    ? (['satFat', 'transFat', 'cholesterol', 'totalSugars', 'addedSugars'] as const).filter((f) => v[f] != null)
    : [];

  return (
    <div className="stack">
      {review ? (
        <>
          <img className="scan-thumb" src={review.thumb} alt="Your label photo" />
          <p className="small muted" style={{ margin: 0 }}>
            Compare with the photo. Values marked <b style={{ color: 'var(--warn)' }}>Check this</b> were hard to read. Nothing is logged until you tap a
            Log button.
          </p>
          {p?.calorieCheck && !p.calorieCheck.ok ? (
            <div className="banner warn small" role="note">
              The numbers don’t quite add up (4×protein + 4×carbs + 9×fat ≈ {p.calorieCheck.fromMacros} kcal vs {p.calorieCheck.stated} on the label). One of the
              highlighted values is probably misread.
            </div>
          ) : null}
        </>
      ) : (
        <BarcodeButton
          onFound={(pf) => {
            if (pf.name) setName(pf.name);
            if (pf.servingText) setServingText(pf.servingText);
            if (pf.servingGrams != null) servingGrams.reset(pf.servingGrams);
            if (pf.calories != null) nutrition.kcal.reset(pf.calories);
            if (pf.protein != null) nutrition.protein.reset(pf.protein);
            if (pf.carbs != null) nutrition.carbs.reset(pf.carbs);
            if (pf.fat != null) nutrition.fat.reset(pf.fat);
          }}
        />
      )}
      <TextField label="Food name" value={name} placeholder="e.g. Clif Bar, chocolate chip" onChange={setName} />
      {nameError && !name.trim() ? (
        <span className="field-msg" role="status">
          {nameError}
        </span>
      ) : null}
      <div className="grid-2">
        <TextField label="Serving size" value={servingText} placeholder="e.g. 1 bar" onChange={setServingText} />
        <NumberField label="Serving weight (optional)" unit="g" field={servingGrams} attention={attention.servingSize} />
      </div>
      <p className="small muted">Numbers per serving, as printed on the label:</p>
      <NutritionInputs
        f={nutrition}
        macroLabels={['Protein', 'Total carbs', 'Total fat']}
        attention={{ kcal: attention.calories, protein: attention.protein, carbs: attention.totalCarb, fat: attention.totalFat }}
      />
      <div className="grid-2">
        <NumberField label="Fiber (optional)" unit="g" field={fiber} attention={v.fiber != null ? attention.fiber : null} />
        <NumberField label="Sodium (optional)" unit="mg" field={sodium} attention={v.sodium != null ? attention.sodium : null} />
      </div>
      {extras.length ? (
        <details>
          <summary className="small">Also on the label</summary>
          <table className="simple">
            <tbody>
              {extras.map((f) => (
                <tr key={f}>
                  <td>{FIELD_LABEL[f]}</td>
                  <td className="num">
                    {v[f]} {FIELD_UNIT[f]} {attention[f] ? <span className="badge warn">check</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
      <NumberField label="Servings per container (optional)" field={perContainer} />
      <NumberField label="Servings eaten" field={eaten} hint="Decimals or fractions, e.g. 1.5 or 1 1/2" />
      <div className="chips">
        {[
          ['0.5', '½'],
          ['1', '1'],
          ['1.5', '1½'],
          ['2', '2'],
        ].map(([val, label]) => (
          <button key={val} type="button" className="chip" aria-pressed={eaten.text.trim() === val} onClick={() => eaten.reset(Number(val))}>
            {label}
          </button>
        ))}
        {draftPer ? (
          <button type="button" className="chip" onClick={() => eaten.reset(draftPer)}>
            Whole container ({draftPer})
          </button>
        ) : null}
      </div>
      {per.kcal != null && draftEaten != null ? (
        <div className="banner" aria-live="polite">
          <div className="row between">
            <span>
              {Math.round(draftEaten * 100) / 100} × {servingText.trim() || 'serving'}
            </span>
            <b className="num">{times(per.kcal, 0)} kcal</b>
          </div>
          <div className="small muted num">
            Protein {times(per.p)} g · Carbs {times(per.c)} g · Fat {times(per.f)} g
          </div>
        </div>
      ) : null}
      {review ? (
        <div className="stack">
          <button type="button" className="btn primary big block" onClick={() => void submit(false)}>
            Log it
          </button>
          <button type="button" className="btn block" onClick={() => void submit(true)}>
            Log + save as custom food
          </button>
          <div className="grid-2">
            <button type="button" className="btn" onClick={review.onRetake}>
              Retake
            </button>
            <button type="button" className="btn" onClick={review.onManual}>
              Enter manually
            </button>
          </div>
          {review.onCropRescan ? (
            <button type="button" className="btn small ghost" onClick={review.onCropRescan}>
              Crop the photo and scan again
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <Check label="Save as a custom food for next time" checked={saveCustom} onChange={setSaveCustom} />
          <button type="button" className="btn primary big block" onClick={() => void submit(saveCustom)}>
            Log to {MEAL_LABEL[logMeal]}
          </button>
        </>
      )}
    </div>
  );
}
