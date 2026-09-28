import { useState } from 'react';
import { DateSwitcher } from '../components/DateSwitcher';
import { EntryEditor } from '../components/EntryEditor';
import { Icon, ProgressBar } from '../components/ui';
import { useDayExercise, useEntries, useEntriesRange, useSettings, useTargets, useWeighIn } from '../hooks';
import { addDays, daysBetween, todayISO } from '../lib/dates';
import { MEAL_LABEL } from '../lib/log';
import { roundRange, sumItems } from '../lib/portions';
import { MEALS, type LogEntry, type Meal } from '../lib/types';
import { displayWeight, formatNumber, weightUnit } from '../lib/units';
import { useApp } from '../state';
import { BackupReminder } from './Backup';
import { MealActions } from './SavedMeals';
import { QuickWeighIn } from './Body';

export function Today() {
  const { date, go, setLogMeal } = useApp();
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
            <div className="muted small">{remaining >= 0 ? 'kcal remaining' : 'kcal over target'}</div>
          </div>
          <div className="right">
            <div className="num">
              <b>≈ {formatNumber(Math.round(totals.kcal))}</b> <span className="muted small">(±{range})</span>
            </div>
            <div className="muted small num">of {formatNumber(t.calories)} target</div>
          </div>
        </div>
        <ProgressBar label="Calories eaten vs target" value={totals.kcal} max={t.calories} />
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

      <section className="card stack" aria-label="Protein and macros">
        <div className="row between">
          <b>Protein</b>
          <span className="num">
            {Math.round(totals.protein)} / {t.proteinG} g
          </span>
        </div>
        <ProgressBar label="Protein vs target" value={totals.protein} max={t.proteinG} color="var(--protein)" />
        <div className="macro-grid">
          <div className="macro">
            <b style={{ color: 'var(--protein)' }}>{Math.round(totals.protein)} g</b>
            <span className="small muted">Protein</span>
          </div>
          <div className="macro">
            <b style={{ color: 'var(--carbs)' }}>
              {Math.round(totals.carbs)}
              {t.carbsG ? `/${t.carbsG}` : ''} g
            </b>
            <span className="small muted">Carbs</span>
          </div>
          <div className="macro">
            <b style={{ color: 'var(--fat)' }}>
              {Math.round(totals.fat)}
              {t.fatG ? `/${t.fatG}` : ''} g
            </b>
            <span className="small muted">Fat</span>
          </div>
        </div>
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
              <p className="small muted">Nothing logged.</p>
            )}
          </section>
        );
      })}

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
