import { useState } from 'react';
import { Check, Icon, Segmented, SelectField, Sheet, TextField } from '../components/ui';
import { checkAll, NumberField, useNumberField } from '../components/NumberField';
import { HeightField } from '../components/HeightField';
import type { NumberRules } from '../lib/numberInput';
import { saveSettings } from '../lib/db';
import { GOAL_DEFAULT_KCAL } from '../lib/defaults';
import { ACTIVITY, FORMULA_LABEL, goalLabel } from '../lib/energy';
import { addDays, formatDateShort, todayISO } from '../lib/dates';
import { newId } from '../lib/id';
import type { ActivityLevel, BmrFormula, GoalMode, GoalSpec, Phase, Settings as SettingsT } from '../lib/types';
import { displayWeight, inputWeightToKg, weightUnit } from '../lib/units';
import { useSettings, useTargets } from '../hooks';
import { useApp } from '../state';
import { PortionRefsEditor } from './PortionGuide';
import { BackupCard } from './Backup';
import { AdaptiveCard } from './AdaptiveCard';
import { MacroTargetsEditor, WorkoutTypesEditor } from './TargetsEditors';

const GOAL_OPTIONS: { value: GoalMode; label: string }[] = [
  { value: 'cut', label: 'Cut' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'bulk', label: 'Lean bulk' },
  { value: 'custom', label: 'Custom' },
];

function goalKcalLabel(mode: GoalMode): string {
  switch (mode) {
    case 'cut':
      return 'Deficit';
    case 'bulk':
      return 'Surplus';
    case 'maintain':
      return 'Offset (optional, e.g. 250)';
    case 'custom':
      return 'Daily calories';
  }
}

/** Allowed range for the goal's kcal number, per mode. */
export function goalKcalRules(mode: GoalMode): NumberRules {
  switch (mode) {
    case 'cut':
      return { integer: true, min: 0, max: 1500, required: true, label: 'Deficit', unit: 'kcal' };
    case 'bulk':
      return { integer: true, min: 0, max: 1500, required: true, label: 'Surplus', unit: 'kcal' };
    case 'maintain':
      return { integer: true, min: 0, max: 1000, label: 'Offset', unit: 'kcal' };
    case 'custom':
      return { integer: true, min: 1000, max: 6000, required: true, label: 'Daily calories', unit: 'kcal' };
  }
}

/** Maintain offsets can be negative, but iPhone number keypads have no minus key — so it's a toggle. */
function OffsetSign({ negative, onChange }: { negative: boolean; onChange: (negative: boolean) => void }) {
  return (
    <Segmented
      label="Offset direction"
      options={[
        { value: 'below', label: 'Below maintenance' },
        { value: 'above', label: 'Above maintenance' },
      ]}
      value={negative ? 'below' : 'above'}
      onChange={(v) => onChange(v === 'below')}
    />
  );
}

/** Default goal (autosaves each field on blur). */
export function GoalEditor({ goal, onChange }: { goal: GoalSpec; onChange: (g: GoalSpec) => void }) {
  const negative = goal.mode === 'maintain' && goal.kcal < 0;
  return (
    <div className="stack">
      <Segmented
        label="Goal mode"
        options={GOAL_OPTIONS}
        value={goal.mode}
        onChange={(mode) => onChange({ mode, kcal: GOAL_DEFAULT_KCAL[mode] })}
      />
      {goal.mode === 'maintain' ? <OffsetSign negative={negative} onChange={(neg) => onChange({ ...goal, kcal: neg ? -Math.abs(goal.kcal) : Math.abs(goal.kcal) })} /> : null}
      <NumberField
        key={goal.mode}
        label={goalKcalLabel(goal.mode)}
        value={Math.abs(goal.kcal)}
        digits={0}
        unit="kcal"
        rules={goalKcalRules(goal.mode)}
        onCommit={(v) => onChange({ ...goal, kcal: (negative ? -1 : 1) * (v ?? 0) })}
      />
    </div>
  );
}

export function Settings() {
  const s = useSettings();
  const { date } = useApp();
  const t = useTargets(date);
  const save = (patch: Partial<SettingsT>) => void saveSettings(patch);
  const saveProfile = (patch: Partial<SettingsT['profile']>) => save({ profile: { ...s.profile, ...patch } });

  return (
    <div className="page">
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <section className="card stack" aria-labelledby="profile-h">
        <h2 id="profile-h">Profile</h2>
        <Segmented
          label="Units"
          options={[
            { value: 'us', label: 'US (lb, in)' },
            { value: 'metric', label: 'Metric (kg, cm)' },
          ]}
          value={s.units}
          onChange={(units) => save({ units })}
        />
        <div className="grid-2">
          <NumberField
            label="Age"
            value={s.profile.age}
            digits={0}
            unit="yr"
            rules={{ integer: true, min: 13, max: 100, required: true, label: 'Age', unit: 'years' }}
            onCommit={(v) => v != null && saveProfile({ age: v })}
          />
          <SelectField
            label="Sex"
            value={s.profile.sex}
            options={[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
            ]}
            onChange={(sex) => saveProfile({ sex })}
          />
        </div>
        <HeightField cm={s.profile.heightCm} units={s.units} onCommit={(heightCm) => saveProfile({ heightCm })} />
        <div className="grid-2">
          <NumberField
            label="Starting weight"
            value={displayWeight(s.profile.weightKg, s.units)}
            digits={1}
            unit={weightUnit(s.units)}
            rules={s.units === 'us' ? { min: 66, max: 660, required: true, label: 'Weight', unit: 'lb' } : { min: 30, max: 300, required: true, label: 'Weight', unit: 'kg' }}
            onCommit={(v) => v != null && saveProfile({ weightKg: inputWeightToKg(v, s.units) })}
          />
          <NumberField
            label="Body fat (optional)"
            value={s.profile.bodyFatPct}
            digits={1}
            unit="%"
            rules={{ min: 3, max: 60, label: 'Body fat', unit: '%' }}
            onCommit={(v) => saveProfile({ bodyFatPct: v })}
          />
        </div>
        <div className="banner small num" aria-live="polite" data-testid="profile-targets">
          BMR <b>{Math.round(t.bmr.bmr).toLocaleString()}</b> · maintenance <b>{Math.round(t.maintenance).toLocaleString()}</b> · target{' '}
          <b>{t.calories.toLocaleString()} kcal</b> · protein <b>{t.macros.proteinG} g</b> · carbs <b>{t.macros.carbs.min}–{t.macros.carbs.max} g</b> ·
          fat <b>{t.macros.fat.min}–{t.macros.fat.max} g</b>
        </div>
        <p className="small muted">Once you log weigh-ins, your latest weight is used instead of the starting weight.</p>
      </section>

      <section className="card stack" aria-labelledby="bmr-h">
        <h2 id="bmr-h">Maintenance calories</h2>
        <SelectField<BmrFormula>
          label="BMR formula"
          value={s.formula}
          options={(Object.keys(FORMULA_LABEL) as BmrFormula[]).map((f) => ({
            value: f,
            label: FORMULA_LABEL[f] + (f === 'katch' ? ' (needs body fat %)' : f === 'mifflin' ? ' (default)' : ''),
          }))}
          onChange={(formula) => save({ formula })}
        />
        <Check
          label="East Asian adjustment (−5%)"
          checked={s.eastAsianAdjust}
          onChange={(eastAsianAdjust) => save({ eastAsianAdjust })}
          hint="Lowers Mifflin-St Jeor and Harris-Benedict results by 5%."
        />
        <SelectField<ActivityLevel>
          label="Activity level"
          value={s.activity}
          options={(Object.keys(ACTIVITY) as ActivityLevel[]).map((a) => ({
            value: a,
            label: `${ACTIVITY[a].label} ×${ACTIVITY[a].factor} — ${ACTIVITY[a].hint}`,
          }))}
          onChange={(activity) => save({ activity })}
        />
        <div className="banner">
          <div className="row between">
            <span>BMR</span>
            <b className="num">{Math.round(t.bmr.bmr)} kcal</b>
          </div>
          <div className="row between">
            <span>Formula maintenance</span>
            <b className="num">{Math.round(t.formulaTdee)} kcal</b>
          </div>
          <div className="row between">
            <span>Today’s target</span>
            <b className="num">{t.calories} kcal</b>
          </div>
        </div>
        <details>
          <summary>Show the math</summary>
          <ol className="small" style={{ paddingLeft: 20, margin: 0 }}>
            {t.steps.map((line, i) => (
              <li key={i} className="num">
                {line}
              </li>
            ))}
          </ol>
        </details>
      </section>

      <AdaptiveCard />

      <section className="card stack" aria-labelledby="goal-h">
        <h2 id="goal-h">Goal</h2>
        <p className="small muted">
          Default goal. A scheduled phase (below) overrides it on its dates. The calorie target is your daily max, shown on Today as
          “eaten / {t.calories.toLocaleString()}”.
        </p>
        <GoalEditor goal={s.goal} onChange={(goal) => save({ goal })} />
        {t.belowBmr ? (
          <div className="banner warn" role="alert">
            Your target ({t.calories} kcal) is below your BMR ({Math.round(t.bmr.bmr)} kcal). Going that low for long can cost
            muscle, energy, and focus. Consider a smaller deficit.
          </div>
        ) : null}
        <PhasesEditor settings={s} />
      </section>

      <section className="card stack" aria-labelledby="macro-h">
        <h2 id="macro-h">Goals: protein, carbs & fat</h2>
        <NumberField
          label="Protein per lb of body weight"
          value={s.proteinPerLb}
          digits={2}
          unit="g/lb"
          rules={{ min: 0.3, max: 1.5, required: true, label: 'Protein', unit: 'g/lb' }}
          onCommit={(v) => v != null && save({ proteinPerLb: v })}
        />
        <p className="small muted">Currently {t.proteinG} g/day (a single target).</p>
        <MacroTargetsEditor settings={s} calories={t.calories} fat={t.macros.fat} carbs={t.macros.carbs} />
      </section>

      <section className="card stack" aria-labelledby="training-h">
        <h2 id="training-h">Training</h2>
        <h3>Workout types</h3>
        <WorkoutTypesEditor types={s.workoutTypes} />
      </section>

      <section className="card stack" aria-labelledby="ex-h">
        <h2 id="ex-h">Exercise calories</h2>
        <Segmented
          label="Exercise model"
          options={[
            { value: 'multiplier', label: 'Activity multiplier' },
            { value: 'sedentary_plus_exercise', label: 'Sedentary + add exercise' },
          ]}
          value={s.exerciseMode}
          onChange={(exerciseMode) => save({ exerciseMode })}
        />
        <p className="small muted">
          {s.exerciseMode === 'multiplier'
            ? 'Your activity multiplier already covers training, so logged workouts don’t add calories (burn is shown for reference only).'
            : 'Maintenance uses the sedentary 1.2 multiplier, and the estimated burn from logged steps, runs and lifts is added to that day’s budget.'}
        </p>
      </section>

      <PortionRefsEditor />

      <section className="card stack" aria-labelledby="theme-h">
        <h2 id="theme-h">Appearance</h2>
        <Segmented
          label="Theme"
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={s.theme}
          onChange={(theme) => save({ theme })}
        />
      </section>

      <BackupCard />
      <p className="tiny muted center">All data is stored only on this device.</p>
    </div>
  );
}

function PhasesEditor({ settings }: { settings: SettingsT }) {
  const [editing, setEditing] = useState<Phase | null>(null);
  const phases = [...settings.phases].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const today = todayISO();
  const savePhases = (list: Phase[]) => void saveSettings({ phases: list });

  const addPhase = () => {
    const last = phases[phases.length - 1];
    const start = last && last.endDate >= today ? addDays(last.endDate, 1) : today;
    setEditing({
      id: newId(),
      name: phases.length ? 'Maintain' : 'Cut',
      startDate: start,
      endDate: addDays(start, 27),
      goal: phases.length ? { mode: 'maintain', kcal: 0 } : { mode: 'cut', kcal: 400 },
      targetWeightKg: null,
    });
  };


  return (
    <div className="stack">
      <div className="row between">
        <h3>Phases (optional)</h3>
        <button type="button" className="btn small" onClick={addPhase}>
          + Add phase
        </button>
      </div>
      {phases.length === 0 ? (
        <p className="small muted">E.g. “Cut until Oct 23, then Maintain −250 until Nov 21.” The target switches automatically on those dates.</p>
      ) : (
        <ul className="list">
          {phases.map((p) => (
            <li key={p.id}>
              <button type="button" className="list-item" onClick={() => setEditing(p)}>
                <div className="grow">
                  <div>
                    <b>{p.name}</b> {p.startDate <= today && today <= p.endDate ? <span className="badge accent">now</span> : null}
                  </div>
                  <div className="small muted">
                    {formatDateShort(p.startDate)} – {formatDateShort(p.endDate)} · {goalLabel(p.goal)}
                  </div>
                </div>
                <Icon name="edit" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <PhaseSheet
          phase={editing}
          settings={settings}
          isExisting={settings.phases.some((p) => p.id === editing.id)}
          onClose={() => setEditing(null)}
          onDelete={() => {
            savePhases(settings.phases.filter((p) => p.id !== editing.id));
            setEditing(null);
          }}
          onSave={(phase) => {
            const rest = settings.phases.filter((p) => p.id !== phase.id);
            savePhases([...rest, phase].sort((a, b) => a.startDate.localeCompare(b.startDate)));
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PhaseSheet({
  phase,
  settings,
  isExisting,
  onClose,
  onDelete,
  onSave,
}: {
  phase: Phase;
  settings: SettingsT;
  isExisting: boolean;
  onClose: () => void;
  onDelete: () => void;
  onSave: (p: Phase) => void;
}) {
  const [draft, setDraft] = useState(phase);
  const mode = draft.goal.mode;
  const [negative, setNegative] = useState(phase.goal.mode === 'maintain' && phase.goal.kcal < 0);
  const kcal = useNumberField(Math.abs(phase.goal.kcal), goalKcalRules(mode), 0);
  const us = settings.units === 'us';
  const weight = useNumberField(
    phase.targetWeightKg == null ? null : displayWeight(phase.targetWeightKg, settings.units),
    us ? { min: 66, max: 660, label: 'Goal weight', unit: 'lb' } : { min: 30, max: 300, label: 'Goal weight', unit: 'kg' },
    1,
  );
  const overlaps = settings.phases.some((q) => q.id !== draft.id && draft.startDate <= q.endDate && q.startDate <= draft.endDate);
  return (
    <Sheet title="Phase" onClose={onClose}>
      <TextField label="Name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
      <div className="grid-2">
        <TextField label="Start" type="date" value={draft.startDate} onChange={(startDate) => setDraft({ ...draft, startDate })} />
        <TextField label="End (inclusive)" type="date" value={draft.endDate} onChange={(endDate) => setDraft({ ...draft, endDate })} />
      </div>
      <Segmented
        label="Goal mode"
        options={GOAL_OPTIONS}
        value={mode}
        onChange={(m) => {
          setDraft({ ...draft, goal: { mode: m, kcal: GOAL_DEFAULT_KCAL[m] } });
          setNegative(false);
          kcal.reset(GOAL_DEFAULT_KCAL[m]);
        }}
      />
      {mode === 'maintain' ? <OffsetSign negative={negative} onChange={setNegative} /> : null}
      <NumberField label={goalKcalLabel(mode)} unit="kcal" field={kcal} />
      <NumberField label="Goal weight (optional, for progress)" unit={weightUnit(settings.units)} field={weight} />
      {draft.endDate < draft.startDate ? <div className="banner warn">End date is before start date.</div> : null}
      {overlaps ? <div className="banner warn">This overlaps another phase; the earlier one wins on shared days.</div> : null}
      <div className="row">
        {isExisting ? (
          <button type="button" className="btn danger" onClick={onDelete}>
            Delete
          </button>
        ) : null}
        <button
          type="button"
          className="btn primary grow"
          disabled={draft.endDate < draft.startDate || !draft.name.trim()}
          onClick={() => {
            const r = checkAll([kcal, weight]);
            if (!r.ok) return;
            const [k, w] = r.values;
            onSave({
              ...draft,
              name: draft.name.trim(),
              goal: { mode, kcal: (mode === 'maintain' && negative ? -1 : 1) * (k ?? 0) },
              // Only convert the weight if it was edited, so an untouched value never drifts.
              targetWeightKg: weight.dirty ? (w == null ? null : inputWeightToKg(w, settings.units)) : phase.targetWeightKg,
            });
          }}
        >
          Save phase
        </button>
      </div>
    </Sheet>
  );
}

