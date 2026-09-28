import { availableUnits, describePortion, formatQty, itemFromFood, portionGrams, SIZE_LABEL, SIZES, UNIT_LABEL } from '../lib/portions';
import type { Food, PortionRefs, PortionSpec, PortionUnit } from '../lib/types';
import { round } from '../lib/units';

const PLATE_FRACTIONS: [number, string][] = [
  [0.25, '¼ plate'],
  [1 / 3, '⅓ plate'],
  [0.5, '½ plate'],
  [1, 'Full plate'],
];

const QTY_STEP: Partial<Record<PortionUnit, number>> = { g: 10, oz: 1, clamshell: 0.5 };

/** Big-button portion chooser: plate fractions, household units, size modifier, quantity. */
export function PortionPicker({
  food,
  refs,
  value,
  onChange,
}: {
  food: Food;
  refs: PortionRefs;
  value: PortionSpec;
  onChange: (s: PortionSpec) => void;
}) {
  const units = availableUnits(food, refs).filter((u) => u !== 'plate');
  const hasPlate = availableUnits(food, refs).includes('plate');
  const item = itemFromFood(food, value, refs);
  const grams = portionGrams(food, value, refs);
  const step = QTY_STEP[value.unit] ?? (value.qty < 1 ? 0.25 : 0.5);
  const unitName = (u: PortionUnit) =>
    u === 'piece' && food.pieceName ? food.pieceName : u === 'serving' && food.servingName ? food.servingName : UNIT_LABEL[u].one;

  return (
    <div className="stack">
      {hasPlate ? (
        <div className="stack">
          <span className="small muted">Plate (10–10.5″)</span>
          <div className="chips">
            {PLATE_FRACTIONS.map(([q, label]) => (
              <button
                key={label}
                type="button"
                className="chip"
                aria-pressed={value.unit === 'plate' && Math.abs(value.qty - q) < 0.01}
                onClick={() => onChange({ ...value, unit: 'plate', qty: q })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="stack">
        <span className="small muted">Portion</span>
        <div className="chips">
          {units.map((u) => (
            <button
              key={u}
              type="button"
              className="chip"
              aria-pressed={value.unit === u}
              onClick={() => onChange({ ...value, unit: u, qty: u === 'g' ? 100 : value.unit === 'plate' || value.unit === 'g' ? 1 : value.qty })}
            >
              {unitName(u)}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <span className="small muted grow">Amount</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Less"
          onClick={() => onChange({ ...value, qty: Math.max(step, round(value.qty - step, 3)) })}
        >
          −
        </button>
        <b className="num" style={{ minWidth: 72, textAlign: 'center' }} aria-live="polite">
          {value.unit === 'g' ? `${Math.round(value.qty)} g` : formatQty(value.qty)}
        </b>
        <button type="button" className="icon-btn" aria-label="More" onClick={() => onChange({ ...value, qty: round(value.qty + step, 3) })}>
          +
        </button>
      </div>
      <div className="stack">
        <span className="small muted">Size</span>
        <div className="chips">
          {SIZES.map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={value.size === s} onClick={() => onChange({ ...value, size: s })}>
              {SIZE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="banner row between">
        <span>
          {describePortion(value, food)}
          {grams != null && !food.nominal ? <span className="muted small"> · ≈{Math.round(grams)} g</span> : null}
        </span>
        <b className="num">{item ? `${item.kcal} kcal` : '—'}</b>
      </div>
      {item ? (
        <div className="small muted num">
          P {Math.round(item.protein)} g · C {Math.round(item.carbs)} g · F {Math.round(item.fat)} g · ±{food.uncertaintyPct}%
        </div>
      ) : null}
    </div>
  );
}
