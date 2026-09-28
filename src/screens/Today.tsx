import { useState } from 'react';
import { DateSwitcher } from '../components/DateSwitcher';
import { EntryEditor } from '../components/EntryEditor';
import { Icon } from '../components/ui';
import { MacroTile, RangeBar } from '../components/MacroBar';
import { nextWorkout } from '../lib/workouts';
import { lowFatNote } from '../lib/macros';
import { useDayExercise, useEntries, useEntriesRange, useLifts, useSettings, useTargets, useWeighIn } from '../hooks';
import { addDays, daysBetween, todayISO } from '../lib/dates';
import { MEAL_LABEL } from '../lib/log';
import { roundRange, sumItems } from '../lib/portions';
import { MEALS, type LogEntry, type Meal } from '../lib/types';
import { displayWeight, formatNumber, weightUnit } from '../lib/units';
import { useApp } from '../state';
import { BackupReminder } from './Backup';
import { copyMeal, MealActions } from './SavedMeals';
import { deleteEntries } from '../lib/log';
import { DayNoteField, QuickWeighIn } from './Body';

export function Today() {
  const { date, go, setLogMeal, toast } = useApp();
  const settings = useSettings();
  const t = useTargets(date);
  const entries = useEntries(date);
  const totals = sumItems(entries);
  const range = roundRange(totals.kcalRange);
  const remaining = t.calories - totals.kcal;
  const exercise = useDayExercise(date);
  const weighIn = useWeighIn(date);
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [weighing, setWeighing] = useState(false);
  const lowStreak = useLowIntakeStreak(date, t.bmr.bmr);
  const m = t.macros;
  const lifts = useLifts();
  const next = nextWorkout(settings.workoutTypes, lifts, date);
  const fatNote = lowFatNote(date, entries.length, totals.fat, m.fat.min);

  const byMeal = new Map<Meal, LogEntry[]>(MEALS.map((m) => [m, []]));
  for (const e of entries) byMeal.get(e.meal)?.push(e);

  const logInto = (meal: Meal, tab: 'quick' | 'search' = 'quick') => {
    setLogMeal(meal);
    go('log', tab);
  };

  return (
    <div className="page">
      <DateSwitcher />
      <BackupReminder />

      <section className="card stack" aria-label="Calories">
        <div className="row between">
          <div>
            <div className="big-number">{formatNumber(Math.abs(Math.round(remaining)))}</div>
            <div className="muted small">{remaining >= 0 ? 'kcal remaining' : 'kcal past target'}</div>
          </div>
          <div className="right">
            <div className="num">
              <b>≈ {formatNumber(Math.round(totals.kcal))}</b> / {formatNumber(t.calories)} kcal
            </div>
            <div className="muted small num">±{range} estimate</div>
          </div>
        </div>
        <RangeBar label="Calories" eaten={totals.kcal} min={0} max={t.calories} unit="kcal" />
        <div className="row between small muted">
          <span>
            {t.phase ? (
              <>
                <b className="accent-text">{t.phase.name}</b> · day {daysBetween(t.phase.startDate, date) + 1} of{' '}
                {daysBetween(t.phase.startDate, t.phase.endDate) + 1}
              </>
            ) : (
              <>Goal: {t.goal.mode === 'bulk' ? 'Lean bulk' : t.goal.mode[0].toUpperCase() + t.goal.mode.slice(1)}</>
            )}
          </span>
          <span>{t.maintenanceSource === 'adaptive' ? 'Adaptive maintenance' : 'Formula maintenance'}</span>
        </div>
        {t.belowBmr ? (
          <div className="banner warn small">
            This target is below your BMR ({Math.round(t.bmr.bmr)} kcal). You can adjust your goal in Settings.
          </div>
        ) : null}
        {lowStreak >= 3 ? (
          <div className="banner warn small" role="note">
            Your logged intake has been under your BMR for {lowStreak} days in a row. That can happen (missed logs, busy days), but if
            it’s real, your body will probably appreciate a bit more food — especially protein and carbs around training.
          </div>
        ) : null}
      </section>

      <section className="card stack" aria-label="Macros">
        <div className="stack" style={{ gap: 12 }}>
          <MacroTile label="Protein" eaten={totals.protein} min={m.proteinG} max={null} />
          <MacroTile label="Carbs" eaten={totals.carbs} min={m.carbs.min} max={m.carbs.max} />
          <MacroTile label="Fat" eaten={totals.fat} min={m.fat.min} max={m.fat.max} />
        </div>
        {fatNote ? (
          <p className="small muted" role="note" style={{ margin: 0 }}>
            {fatNote}
          </p>
        ) : null}
      </section>

      <section className="stat-row" aria-label="Day summary">
        <button type="button" className="stat" style={{ border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => go('training')}>
          <span className="small muted">Steps</span>
          <b>{exercise.steps != null ? formatNumber(exercise.steps) : '—'}</b>
        </button>
        <button type="button" className="stat" style={{ border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => setWeighing(true)}>
          <span className="small muted">Weigh-in</span>
          <b>{weighIn ? `${displayWeight(weighIn.kg, settings.units).toFixed(1)} ${weightUnit(settings.units)}` : 'Not yet'}</b>
        </button>
        <button type="button" className="stat" style={{ border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => go('training')}>
          <span className="small muted">Exercise</span>
          <b>{exercise.kcal > 0 ? `≈${Math.round(exercise.kcal)}` : '—'}</b>
          <span className="tiny muted">{t.exerciseAdded ? 'added to budget' : 'kcal, info only'}</span>
          {next ? <span className="tiny">Next up: {next.name}</span> : null}
        </button>
      </section>

      {MEALS.map((meal) => {
        const items = byMeal.get(meal) ?? [];
        const mt = sumItems(items);
        return (
          <section key={meal} className="card" aria-label={MEAL_LABEL[meal]}>
            <div className="row between">
              <h2>
                {MEAL_LABEL[meal]} {items.length ? <span className="muted small num">≈{Math.round(mt.kcal)} kcal</span> : null}
              </h2>
              <div className="row">
                <MealActions meal={meal} date={date} entries={items} />
                <button type="button" className="icon-btn" aria-label={`Add to ${MEAL_LABEL[meal]}`} onClick={() => logInto(meal)}>
                  <Icon name="log" />
                </button>
              </div>
            </div>
            {items.length ? (
              <ul className="list">
                {items.map((e) => (
                  <li key={e.id}>
                    <button type="button" className="list-item" onClick={() => setEditing(e)}>
                      <div className="grow">
                        <div>{e.name}</div>
                        <div className="small muted">
                          {e.portionText ?? ''} {e.source === 'claude' ? <span className="badge">Claude</span> : null}
                        </div>
                      </div>
                      <span className="kcal">{Math.round(e.kcal)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="row between">
                <span className="small muted">Nothing logged.</span>
                <button
                  type="button"
                  className="chip"
                  onClick={() =>
                    void copyMeal(addDays(date, -1), date, meal).then((ids) =>
                      ids.length
                        ? toast(`Copied yesterday’s ${MEAL_LABEL[meal].toLowerCase()}`, { label: 'Undo', run: () => void deleteEntries(ids) })
                        : toast(`Nothing logged for ${MEAL_LABEL[meal].toLowerCase()} yesterday`),
                    )
                  }
                >
                  <Icon name="copy" /> Copy yesterday’s
                </button>
              </div>
            )}
          </section>
        );
      })}

      <section className="card">
        <DayNoteField date={date} />
      </section>

      <div className="fab-wrap">
        <button type="button" className="btn primary big" onClick={() => go('log', 'quick')}>
          <Icon name="log" /> Log food
        </button>
      </div>

      {editing ? <EntryEditor entry={editing} onClose={() => setEditing(null)} /> : null}
      {weighing ? <QuickWeighIn date={date} onClose={() => setWeighing(false)} /> : null}
    </div>
  );
}

/** Number of consecutive logged days before `date` whose intake was under BMR. */
function useLowIntakeStreak(date: string, bmr: number): number {
  const start = addDays(date, -14);
  const end = addDays(date, -1);
  const rows = useEntriesRange(start, end);
  if (date > todayISO()) return 0;
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.kcal);
  let streak = 0;
  for (let d = end; d >= start; d = addDays(d, -1)) {
    const kcal = byDay.get(d);
    if (kcal == null || kcal >= bmr) break;
    streak++;
  }
  return streak;
}

