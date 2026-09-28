import { useState } from 'react';
import { Icon, Segmented } from '../components/ui';
import { NumberField } from '../components/NumberField';
import { saveSettings } from '../lib/db';
import { newId } from '../lib/id';
import { DEFAULT_CARB_TARGET, DEFAULT_FAT_TARGET, gramsToPct, type GramRange, type MacroMode, type MacroRangeSetting } from '../lib/macros';
import type { Settings, WorkoutType } from '../lib/types';

function MacroRangeEditor({
  label,
  kcalPerG,
  value,
  calories,
  current,
  allowAuto,
  onChange,
}: {
  label: string;
  kcalPerG: number;
  value: MacroRangeSetting;
  calories: number;
  current: GramRange;
  allowAuto: boolean;
  onChange: (v: MacroRangeSetting) => void;
}) {
  const modes: { value: MacroMode; label: string }[] = [
    ...(allowAuto ? [{ value: 'auto' as const, label: 'Auto' }] : []),
    { value: 'pct', label: '% of calories' },
    { value: 'grams', label: 'Grams' },
  ];
  const switchMode = (mode: MacroMode) => {
    // Keep today's range the same when switching units.
    if (mode === 'grams') onChange({ mode, min: current.min, max: current.max });
    else if (mode === 'pct')
      onChange({ mode, min: Math.round(gramsToPct(current.min, calories, kcalPerG)), max: Math.round(gramsToPct(current.max, calories, kcalPerG)) });
    else onChange({ mode: 'auto', min: 0, max: 0 });
  };
  const unit = value.mode === 'pct' ? '%' : 'g';
  const pctOf = (g: number) => Math.round(gramsToPct(g, calories, kcalPerG));
  return (
    <div className="stack">
      <h3>{label}</h3>
      <Segmented label={`${label} target type`} options={modes} value={value.mode} onChange={switchMode} />
      {value.mode === 'auto' ? (
        <p className="small muted">Whatever calories are left after protein and the middle of your fat range, shown as a ±15% range.</p>
      ) : (
        <div className="grid-2">
          <NumberField
            key={`${value.mode}-min`}
            label="Minimum"
            value={value.min}
            digits={1}
            unit={unit}
            rules={{
              min: 0,
              max: value.max,
              required: true,
              label: 'Minimum',
              rangeMessage: `Minimum should be 0–${value.max} ${unit} (not above the maximum).`,
            }}
            onCommit={(v) => v != null && onChange({ ...value, min: v })}
          />
          <NumberField
            key={`${value.mode}-max`}
            label="Maximum"
            value={value.max}
            digits={1}
            unit={unit}
            rules={{
              min: Math.max(value.min, 1),
              max: value.mode === 'pct' ? 100 : 1000,
              required: true,
              label: 'Maximum',
              rangeMessage: `Maximum should be ${value.min}–${value.mode === 'pct' ? 100 : 1000} ${unit} (not below the minimum).`,
            }}
            onCommit={(v) => v != null && onChange({ ...value, max: v })}
          />
        </div>
      )}
      <p className="small">
        At {calories.toLocaleString()} kcal:{' '}
        <b className="num">
          {current.min}–{current.max} g
        </b>{' '}
        <span className="muted num">
          ({pctOf(current.min)}–{pctOf(current.max)}% of calories)
        </span>
      </p>
      {value.mode !== 'grams' ? <p className="tiny muted">Recalculates automatically when your calorie target changes (e.g. a new phase).</p> : null}
    </div>
  );
}

export function MacroTargetsEditor({ settings, calories, fat, carbs }: { settings: Settings; calories: number; fat: GramRange; carbs: GramRange }) {
  return (
    <div className="stack">
      <MacroRangeEditor
        label="Fat"
        kcalPerG={9}
        value={settings.fatTarget}
        calories={calories}
        current={fat}
        allowAuto={false}
        onChange={(fatTarget) => void saveSettings({ fatTarget })}
      />
      <MacroRangeEditor
        label="Carbs"
        kcalPerG={4}
        value={settings.carbTarget}
        calories={calories}
        current={carbs}
        allowAuto
        onChange={(carbTarget) => void saveSettings({ carbTarget })}
      />
      <button
        type="button"
        className="btn small"
        onClick={() => void saveSettings({ fatTarget: { ...DEFAULT_FAT_TARGET }, carbTarget: { ...DEFAULT_CARB_TARGET } })}
      >
        Reset carbs & fat to defaults (fat 20–30%, carbs auto)
      </button>
    </div>
  );
}

/** Rename / add / delete / reorder workout types. The order is the rotation. */
export function WorkoutTypesEditor({ types }: { types: WorkoutType[] }) {
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const save = (workoutTypes: WorkoutType[]) => void saveSettings({ workoutTypes });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= types.length) return;
    const next = [...types];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
  return (
    <div className="stack">
      <p className="small muted">The order is your rotation: after the last one it starts again at the top.</p>
      <ol className="list" style={{ paddingLeft: 0 }}>
        {types.map((t, i) => (
          <li key={t.id} className="row workout-row" style={{ padding: '6px 0', gap: 4 }}>
            <RenameInput value={t.name} onCommit={(name) => save(types.map((x) => (x.id === t.id ? { ...x, name } : x)))} />
            <button type="button" className="icon-btn" aria-label={`Move ${t.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button type="button" className="icon-btn" aria-label={`Move ${t.name} down`} disabled={i === types.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
            {confirmDelete === t.id ? (
              <button
                type="button"
                className="btn small danger"
                onClick={() => {
                  save(types.filter((x) => x.id !== t.id));
                  setConfirmDelete(null);
                }}
              >
                Delete?
              </button>
            ) : (
              <button type="button" className="icon-btn" aria-label={`Delete ${t.name}`} onClick={() => setConfirmDelete(t.id)}>
                <Icon name="trash" />
              </button>
            )}
          </li>
        ))}
      </ol>
      {confirmDelete ? <p className="small muted">Deleting a type keeps all your past logs of it (they keep their name).</p> : null}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name) return;
          save([...types, { id: `wt-${newId()}`, name }]);
          setNewName('');
        }}
      >
        <label htmlFor="new-workout" className="sr-only">
          New workout type
        </label>
        <input id="new-workout" className="input grow" placeholder="Add a workout, e.g. Legs" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" className="btn" disabled={!newName.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}

function RenameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text != null && text.trim() && text.trim() !== value) onCommit(text.trim());
    setText(null);
  };
  return (
    <input
      className="input grow"
      aria-label={`Rename ${value}`}
      style={{ minWidth: 0, flex: '1 1 auto' }}
      value={text ?? value}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}
