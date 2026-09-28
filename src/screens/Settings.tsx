import { useState } from 'react';
import { Check, Icon, NumField, Segmented, SelectField, Sheet, TextField } from '../components/ui';
import { saveSettings } from '../lib/db';
import { GOAL_DEFAULT_KCAL } from '../lib/defaults';
import { ACTIVITY, FORMULA_LABEL, goalLabel } from '../lib/energy';
import { addDays, formatDateShort, todayISO } from '../lib/dates';
import { newId } from '../lib/id';
import type { ActivityLevel, BmrFormula, GoalMode, GoalSpec, Phase, Settings as SettingsT } from '../lib/types';
import { cmToIn, displayWeight, inToCm, inputWeightToKg, round, weightUnit } from '../lib/units';
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
      return 'Offset (optional, e.g. −250)';
    case 'custom':
      return 'Daily calories';
  }
}

export function GoalEditor({ goal, onChange }: { goal: GoalSpec; onChange: (g: GoalSpec) => void }) {
  return (
    <div className="stack">
      <Segmented
        label="Goal mode"
        options={GOAL_OPTIONS}
        value={goal.mode}
        onChange={(mode) => onChange({ mode, kcal: GOAL_DEFAULT_KCAL[mode] })}
      />
      <NumField label={goalKcalLabel(goal.mode)} value={goal.kcal} digits={0} unit="kcal" onChange={(v) => onChange({ ...goal, kcal: v ?? 0 })} />
    </div>
  );
}

export function Settings() {
  const s = useSettings();
  const { date } = useApp();
  const t = useTargets(date);
  const save = (patch: Partial<SettingsT>) => void saveSettings(patch);
  const saveProfile = (patch: Partial<SettingsT['profile']>) => save({ profile: { ...s.profile, ...patch } });
  const us = s.units === 'us';
  const totalIn = cmToIn(s.profile.heightCm);
  const ft = Math.floor(totalIn / 12);
  const inch = round(totalIn - ft * 12, 1);

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
          <NumField label="Age" value={s.profile.age} digits={0} unit="yr" onChange={(v) => v && saveProfile({ age: v })} />
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
        {us ? (
          <div className="grid-2">
            <NumField label="Height (feet)" value={ft} digits={0} unit="ft" onChange={(v) => v != null && saveProfile({ heightCm: inToCm(v * 12 + inch) })} />
            <NumField label="Height (inches)" value={inch} unit="in" onChange={(v) => v != null && saveProfile({ heightCm: inToCm(ft * 12 + v) })} />
          </div>
        ) : (
          <NumField label="Height" value={s.profile.heightCm} unit="cm" onChange={(v) => v && saveProfile({ heightCm: v })} />
        )}
        <div className="grid-2">
          <NumField
            label="Starting weight"
            value={displayWeight(s.profile.weightKg, s.units)}
            unit={weightUnit(s.units)}
            onChange={(v) => v && saveProfile({ weightKg: inputWeightToKg(v, s.units) })}
          />
          <NumField
            label="Body fat (optional)"
            value={s.profile.bodyFatPct}
            unit="%"
            onChange={(v) => saveProfile({ bodyFatPct: v && v > 0 && v < 70 ? v : null })}
          />
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
        <NumField
          label="Protein per lb of body weight"
          value={s.proteinPerLb}
          digits={2}
          unit="g/lb"
          onChange={(v) => v != null && v > 0 && save({ proteinPerLb: v })}
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

  const overlaps = (p: Phase) => settings.phases.some((q) => q.id !== p.id && p.startDate <= q.endDate && q.startDate <= p.endDate);

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
        <Sheet title="Phase" onClose={() => setEditing(null)}>
          <TextField label="Name" value={editing.name} onChange={(name) => setEditing({ ...editing, name })} />
          <div className="grid-2">
            <TextField label="Start" type="date" value={editing.startDate} onChange={(startDate) => setEditing({ ...editing, startDate })} />
            <TextField label="End (inclusive)" type="date" value={editing.endDate} onChange={(endDate) => setEditing({ ...editing, endDate })} />
          </div>
          <GoalEditor goal={editing.goal} onChange={(goal) => setEditing({ ...editing, goal })} />
          <NumField
            label="Goal weight (optional, for progress)"
            value={editing.targetWeightKg == null ? null : displayWeight(editing.targetWeightKg, settings.units)}
            unit={weightUnit(settings.units)}
            onChange={(v) => setEditing({ ...editing, targetWeightKg: v ? inputWeightToKg(v, settings.units) : null })}
          />
          {editing.endDate < editing.startDate ? <div className="banner warn">End date is before start date.</div> : null}
          {overlaps(editing) ? <div className="banner warn">This overlaps another phase; the earlier one wins on shared days.</div> : null}
          <div className="row">
            {settings.phases.some((p) => p.id === editing.id) ? (
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  savePhases(settings.phases.filter((p) => p.id !== editing.id));
                  setEditing(null);
                }}
              >
                Delete
              </button>
            ) : null}
            <button
              type="button"
              className="btn primary grow"
              disabled={editing.endDate < editing.startDate || !editing.name.trim()}
              onClick={() => {
                const rest = settings.phases.filter((p) => p.id !== editing.id);
                savePhases([...rest, editing].sort((a, b) => a.startDate.localeCompare(b.startDate)));
                setEditing(null);
              }}
            >
              Save phase
            </button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
