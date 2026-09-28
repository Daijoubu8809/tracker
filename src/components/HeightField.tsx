import { useEffect, useRef, useState } from 'react';
import { cmToFtIn, ftInToCm, HEIGHT_MAX_CM, HEIGHT_MIN_CM, validateFtIn } from '../lib/height';
import type { UnitSystem } from '../lib/types';
import { NumberField, useNumberField } from './NumberField';

/**
 * Height, stored canonically in cm (full precision).
 * - Metric: one cm field.
 * - US: separate ft and in fields (inches may be decimal, e.g. 9.5).
 * Switching units only changes how the stored cm is displayed; nothing is written
 * back unless you edit, so repeated toggles can't drift (175 stays 175).
 */
export function HeightField({ cm, units, onCommit }: { cm: number; units: UnitSystem; onCommit: (cm: number) => void }) {
  if (units === 'metric') {
    return (
      <NumberField
        label="Height"
        unit="cm"
        value={cm}
        digits={2}
        rules={{ min: HEIGHT_MIN_CM, max: HEIGHT_MAX_CM, required: true, label: 'Height', unit: 'cm' }}
        onCommit={(v) => v != null && onCommit(v)}
      />
    );
  }
  return <FeetInchesField cm={cm} onCommit={onCommit} />;
}

function FeetInchesField({ cm, onCommit }: { cm: number; onCommit: (cm: number) => void }) {
  const split = cmToFtIn(cm);
  const ft = useNumberField(split.ft, { integer: true, min: 0, max: 8, label: 'Feet' }, 0);
  const inch = useNumberField(split.inch, { min: 0, max: 11.99, label: 'Inches', rangeMessage: 'Inches should be 0–11.9.' }, 2);
  const [pairError, setPairError] = useState<string | null>(null);
  const focused = useRef(0);

  // Follow external changes to the stored height when not editing.
  useEffect(() => {
    if (focused.current > 0) return;
    const s = cmToFtIn(cm);
    ft.reset(s.ft);
    inch.reset(s.inch);
    setPairError(null);
  }, [cm]);

  const commit = () => {
    // Wait until focus has left both fields (moving ft → in isn't a commit).
    setTimeout(() => {
      if (focused.current > 0) return;
      if (!ft.dirty && !inch.dirty) return;
      const a = ft.check();
      const b = inch.check();
      if (!a.ok || !b.ok) return;
      const err = validateFtIn(a.value, b.value);
      setPairError(err);
      if (err || a.value == null) return;
      const next = ftInToCm(a.value, b.value ?? 0);
      onCommit(next);
      ft.reset(a.value);
      inch.reset(b.value ?? 0);
    }, 0);
  };

  const track = {
    onFocusCapture: () => {
      focused.current++;
    },
    onBlurCapture: () => {
      focused.current = Math.max(0, focused.current - 1);
      commit();
    },
    onKeyDownCapture: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') (e.target as HTMLElement).blur();
    },
  };

  return (
    <div className="stack" style={{ gap: 4 }} {...track}>
      <div className="grid-2">
        <NumberField label="Height (feet)" unit="ft" field={ft} />
        <NumberField label="Height (inches)" unit="in" field={inch} />
      </div>
      {pairError ? (
        <span className="field-msg" role="status">
          {pairError}
        </span>
      ) : null}
    </div>
  );
}
