import { useState } from 'react';
import { Check, NumField, TextField } from '../components/ui';
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

const EMPTY = {
  name: '',
  servingText: '',
  servingGrams: null as number | null,
  servingsPerContainer: null as number | null,
  calories: null as number | null,
  protein: null as number | null,
  carbs: null as number | null,
  fat: null as number | null,
};

export function LabelEntry() {
  const { logMeal, toast } = useApp();
  const logItems = useLogItems();
  const [f, setF] = useState(EMPTY);
  const [eatenText, setEatenText] = useState('1');
  const [saveCustom, setSaveCustom] = useState(true);
  const eaten = parseAmount(eatenText);
  const valid = f.name.trim() && f.calories != null && eaten != null;

  const input = (): LabelInput => ({
    name: f.name,
    servingText: f.servingText,
    servingGrams: f.servingGrams,
    servingsPerContainer: f.servingsPerContainer,
    calories: f.calories ?? 0,
    protein: f.protein ?? 0,
    carbs: f.carbs ?? 0,
    fat: f.fat ?? 0,
    servingsEaten: eaten ?? 1,
  });

  const submit = async () => {
    if (!valid) return;
    const l = input();
    let foodId: string | null = null;
    if (saveCustom) {
      const food = labelToFood(l);
      await saveFood(food);
      foodId = food.id;
    }
    await logItems([labelToItem(l, foodId)]);
    if (saveCustom) toast(`Saved “${l.name.trim()}” to your foods and logged it`);
    setF(EMPTY);
    setEatenText('1');
  };

  const preview = valid ? labelToItem(input(), null) : null;

  return (
    <div className="stack">
      <BarcodeButton
        onFound={(p) =>
          setF({
            ...f,
            name: p.name ?? f.name,
            servingText: p.servingText ?? f.servingText,
            servingGrams: p.servingGrams ?? f.servingGrams,
            calories: p.calories ?? f.calories,
            protein: p.protein ?? f.protein,
            carbs: p.carbs ?? f.carbs,
            fat: p.fat ?? f.fat,
          })
        }
      />
      <TextField label="Food name" value={f.name} placeholder="e.g. Clif Bar, chocolate chip" onChange={(name) => setF({ ...f, name })} />
      <div className="grid-2">
        <TextField label="Serving size" value={f.servingText} placeholder="e.g. 1 bar" onChange={(servingText) => setF({ ...f, servingText })} />
        <NumField label="Serving weight (optional)" value={f.servingGrams} digits={0} unit="g" onChange={(servingGrams) => setF({ ...f, servingGrams })} />
      </div>
      <p className="small muted">Numbers per serving, as printed on the label:</p>
      <div className="grid-2">
        <NumField label="Calories" value={f.calories} digits={0} unit="kcal" onChange={(calories) => setF({ ...f, calories })} />
        <NumField label="Protein" value={f.protein} unit="g" onChange={(protein) => setF({ ...f, protein })} />
        <NumField label="Total carbs" value={f.carbs} unit="g" onChange={(carbs) => setF({ ...f, carbs })} />
        <NumField label="Total fat" value={f.fat} unit="g" onChange={(fat) => setF({ ...f, fat })} />
      </div>
      <NumField label="Servings per container (optional)" value={f.servingsPerContainer} onChange={(servingsPerContainer) => setF({ ...f, servingsPerContainer })} />
      <div className="field">
        <label htmlFor="servings-eaten">Servings I ate (fractions OK: ½, 1 1/2)</label>
        <input id="servings-eaten" className="input num" inputMode="decimal" value={eatenText} onChange={(e) => setEatenText(e.target.value)} />
        {eaten == null ? <span className="small" style={{ color: 'var(--danger)' }}>Enter an amount like 1, 1.5 or 1/2.</span> : null}
      </div>
      <div className="chips">
        {['1/2', '1', '1 1/2', '2'].map((v) => (
          <button key={v} type="button" className="chip" aria-pressed={eatenText === v} onClick={() => setEatenText(v)}>
            {v.replace('1/2', '½').replace('1 ½', '1½')}
          </button>
        ))}
        {f.servingsPerContainer ? (
          <button type="button" className="chip" onClick={() => setEatenText(String(f.servingsPerContainer))}>
            Whole container ({f.servingsPerContainer})
          </button>
        ) : null}
      </div>
      <Check label="Save as a custom food for next time" checked={saveCustom} onChange={setSaveCustom} />
      {preview ? (
        <div className="banner row between">
          <span>{preview.portionText}</span>
          <b className="num">{preview.kcal} kcal</b>
        </div>
      ) : null}
      <button type="button" className="btn primary big block" disabled={!valid} onClick={() => void submit()}>
        Log to {MEAL_LABEL[logMeal]}
      </button>
    </div>
  );
}
