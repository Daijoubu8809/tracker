import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { DateSwitcher } from '../components/DateSwitcher';
import { Icon, NumField, Segmented, Sheet, TextField } from '../components/ui';
import { useDayExercise, useLifts, useSettings, useWeightKg } from '../hooks';
import { db, live } from '../lib/db';
import { addDays, formatDateShort, todayISO, weekStart } from '../lib/dates';
import { liftKcal, runKcal } from '../lib/energy';
import { newId } from '../lib/id';
import { pace, parseDuration, summarizeWeek, type WeekSummary } from '../lib/training';
import type { LiftEntry, RunEntry, WorkoutType } from '../lib/types';
import { lastDuration, liftLabel, nextWorkout, overdueTypes } from '../lib/workouts';
import { displayDistance, distanceUnit, formatDuration, formatNumber, formatPace, inputDistanceToKm } from '../lib/units';
import { useApp } from '../state';

export function Training() {
  const { date, toast } = useApp();
  const s = useSettings();
  const ex = useDayExercise(date);
  const weightKg = useWeightKg(date);
  const [steps, setSteps] = useState<number | null>(null);
  const [runOpen, setRunOpen] = useState<RunEntry | null>(null);
  const [liftOpen, setLiftOpen] = useState<LiftEntry | null>(null);
  useEffect(() => setSteps(null), [date]);
  const shownSteps = steps ?? ex.steps;
  const lifts = useLifts();
  const next = nextWorkout(s.workoutTypes, lifts, date);
  const dist = distanceUnit(s.units);

  const saveSteps = () => {
    if (steps == null) return;
    void db.steps.put({ id: date, date, steps: Math.round(steps), updatedAt: Date.now(), deleted: steps <= 0 });
    toast('Steps saved');
    setSteps(null);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Training</h1>
      </div>
      <DateSwitcher />

      <section className="card stack" aria-labelledby="steps-h">
        <h2 id="steps-h">Steps</h2>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="grow">
            <NumField label="Steps today" value={shownSteps} digits={0} placeholder="e.g. 9500" onChange={setSteps} />
          </div>
          <button type="button" className="btn primary" disabled={steps == null} onClick={saveSteps}>
            Save
          </button>
        </div>
      </section>

      <section className="card stack" aria-labelledby="runs-h">
        <div className="row between">
          <h2 id="runs-h">Runs</h2>
          <button
            type="button"
            className="btn small"
            onClick={() => setRunOpen({ id: newId(), date, distanceKm: 0, durationMin: 0, note: '', updatedAt: 0 })}
          >
            + Run
          </button>
        </div>
        {ex.runs.length ? (
          <ul className="list">
            {ex.runs.map((r) => {
              const d = displayDistance(r.distanceKm, s.units);
              const p = pace(d, r.durationMin);
              return (
                <li key={r.id}>
                  <button type="button" className="list-item" onClick={() => setRunOpen(r)}>
                    <div className="grow">
                      <div className="num">
                        {d.toFixed(2)} {dist} · {formatDuration(r.durationMin)}
                      </div>
                      <div className="small muted num">
                        {p ? `${formatPace(p)} /${dist}` : ''}
                        {r.note ? ` · ${r.note}` : ''}
                      </div>
                    </div>
                    <span className="small muted num">≈{Math.round(runKcal(r.distanceKm, weightKg))} kcal</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="small muted">No runs this day.</p>
        )}
      </section>

      <section className="card stack" aria-labelledby="lifts-h">
        <div className="row between">
          <h2 id="lifts-h">Lifts</h2>
          <button
            type="button"
            className="btn small"
            onClick={() =>
              setLiftOpen({
                id: newId(),
                date,
                typeId: next?.id ?? null,
                typeName: next?.name ?? 'Lift',
                durationMin: (next && lastDuration(next, lifts)) ?? 60,
                note: '',
                updatedAt: 0,
              })
            }
          >
            + Lift
          </button>
        </div>
        {next ? (
          <p className="small" style={{ margin: 0 }}>
            Next up: <b>{next.name}</b>
          </p>
        ) : null}
        {ex.lifts.length ? (
          <ul className="list">
            {ex.lifts.map((l) => (
              <li key={l.id}>
                <button type="button" className="list-item" onClick={() => setLiftOpen(l)}>
                  <div className="grow">
                    <div>
                      {liftLabel(l, s.workoutTypes)} · {formatDuration(l.durationMin)}
                    </div>
                    {l.note ? <div className="small muted">{l.note}</div> : null}
                  </div>
                  <span className="small muted num">≈{Math.round(liftKcal(l.durationMin, weightKg))} kcal</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">No lifts this day.</p>
        )}
      </section>

      <div className="banner small">
        Estimated exercise burn this day: <b className="num">≈{Math.round(ex.kcal)} kcal</b>
        {s.exerciseMode === 'multiplier'
          ? ' — for reference only. Your activity multiplier already counts training, so it isn’t added to your food budget (change in Settings).'
          : ' — added to your food budget (sedentary + exercise mode). Steps count above a 4,000-step baseline.'}
      </div>

      <WeeklySummary />

      {runOpen ? <RunSheet run={runOpen} onClose={() => setRunOpen(null)} /> : null}
      {liftOpen ? <LiftSheet lift={liftOpen} onClose={() => setLiftOpen(null)} /> : null}
    </div>
  );
}

function RunSheet({ run, onClose }: { run: RunEntry; onClose: () => void }) {
  const { units } = useSettings();
  const isNew = run.updatedAt === 0;
  const [distance, setDistance] = useState<number | null>(isNew ? null : Math.round(displayDistance(run.distanceKm, units) * 100) / 100);
  const [time, setTime] = useState(isNew ? '' : fmtClock(run.durationMin));
  const [note, setNote] = useState(run.note);
  const minutes = parseDuration(time);
  const p = distance && minutes ? pace(distance, minutes) : null;
  const dist = distanceUnit(units);
  return (
    <Sheet title={isNew ? 'Log a run' : 'Edit run'} onClose={onClose}>
      <div className="grid-2">
        <NumField label="Distance" value={distance} digits={2} unit={dist} onChange={setDistance} />
        <div className="field">
          <label htmlFor="run-time">Time (min or h:mm:ss)</label>
          <input id="run-time" className="input num" inputMode="numeric" placeholder="28:30" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <div className="banner row between">
        <span>Pace</span>
        <b className="num">{p ? `${formatPace(p)} /${dist}` : '—'}</b>
      </div>
      <TextField label="Note (optional)" value={note} onChange={setNote} />
      <div className="row">
        {!isNew ? (
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              void db.runs.update(run.id, { deleted: true, updatedAt: Date.now() });
              onClose();
            }}
          >
            <Icon name="trash" /> Delete
          </button>
        ) : null}
        <button
          type="button"
          className="btn primary grow"
          disabled={!distance || !minutes}
          onClick={() => {
            if (!distance || !minutes) return;
            void db.runs.put({ ...run, distanceKm: inputDistanceToKm(distance, units), durationMin: minutes, note: note.trim(), updatedAt: Date.now(), deleted: false });
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}

function fmtClock(min: number): string {
  const total = Math.round(min * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function LiftSheet({ lift, onClose }: { lift: LiftEntry; onClose: () => void }) {
  const { workoutTypes } = useSettings();
  const lifts = useLifts();
  const isNew = lift.updatedAt === 0;
  const [draft, setDraft] = useState(lift);
  const [durationTouched, setDurationTouched] = useState(!isNew);
  // An old log whose type was deleted (or a v1 type like "Upper") stays selectable so saving keeps its label.
  const orphan = !workoutTypes.some((t) => t.id === draft.typeId) ? { id: draft.typeId ?? '__orphan', name: draft.typeName } : null;
  const pick = (t: WorkoutType) => {
    const remembered = lastDuration(t, lifts);
    setDraft({
      ...draft,
      typeId: t.id,
      typeName: t.name,
      durationMin: !durationTouched && remembered ? remembered : draft.durationMin,
    });
  };
  const current = workoutTypes.find((t) => t.id === draft.typeId);
  return (
    <Sheet title={isNew ? 'Log a lift' : 'Edit lift'} onClose={onClose}>
      <div className="chips" role="group" aria-label="Workout">
        {workoutTypes.map((t) => (
          <button key={t.id} type="button" className="chip" aria-pressed={draft.typeId === t.id} onClick={() => pick(t)}>
            {t.name}
          </button>
        ))}
        {orphan && !isNew ? (
          <button type="button" className="chip" aria-pressed>
            {orphan.name} (old)
          </button>
        ) : null}
      </div>
      {!workoutTypes.length ? <p className="small muted">Add workout types in Settings → Training.</p> : null}
      <NumField
        label="Duration"
        value={draft.durationMin}
        digits={0}
        unit="min"
        onChange={(v) => {
          setDurationTouched(true);
          setDraft({ ...draft, durationMin: v ?? 0 });
        }}
      />
      <div className="chips">
        {[30, 45, 60, 75, 90].map((m) => (
          <button
            key={m}
            type="button"
            className="chip"
            aria-pressed={draft.durationMin === m}
            onClick={() => {
              setDurationTouched(true);
              setDraft({ ...draft, durationMin: m });
            }}
          >
            {m} min
          </button>
        ))}
      </div>
      <TextField label="Note (optional)" value={draft.note} placeholder="e.g. bench PR, felt tired" onChange={(note) => setDraft({ ...draft, note })} />
      <div className="row">
        {!isNew ? (
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              void db.lifts.update(lift.id, { deleted: true, updatedAt: Date.now() });
              onClose();
            }}
          >
            <Icon name="trash" /> Delete
          </button>
        ) : null}
        <button
          type="button"
          className="btn primary grow"
          disabled={draft.durationMin <= 0 || (!current && !orphan)}
          onClick={() => {
            void db.lifts.put({
              ...draft,
              typeName: current?.name ?? draft.typeName,
              note: draft.note.trim(),
              updatedAt: Date.now(),
              deleted: false,
            });
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}

/** This week: runs (count, distance, pace), each lift type, overdue types; plus a 4-week table. */
export function WeeklySummary() {
  const { units, workoutTypes } = useSettings();
  const { date } = useApp();
  const lifts = useLifts();
  const [view, setView] = useState<'1' | '4'>('1');
  const today = todayISO();
  const ref = date > today ? today : date;
  const thisWeek = weekStart(ref);
  const first = addDays(thisWeek, -7 * 3);
  const end = addDays(thisWeek, 6);
  const data = useLiveQuery(
    async () => {
      const [steps, runs] = await Promise.all([
        db.steps.where('date').between(first, end, true, true).toArray(),
        db.runs.where('date').between(first, end, true, true).toArray(),
      ]);
      return { steps: live(steps), runs: live(runs) };
    },
    [first, end],
    { steps: [], runs: [] },
  );
  const weeks: WeekSummary[] = [0, 1, 2, 3].map((i) => summarizeWeek(addDays(thisWeek, -7 * i), data.steps, data.runs, lifts, workoutTypes));
  const dist = distanceUnit(units);
  const cur = weeks[0];
  const overdue = lifts.length ? overdueTypes(workoutTypes, lifts, ref) : [];
  const paceText = (w: WeekSummary) => {
    if (w.avgPaceMinPerKm == null) return '—';
    const perUnit = units === 'us' ? w.avgPaceMinPerKm * 1.609344 : w.avgPaceMinPerKm;
    return `${formatPace(perUnit)} /${dist}`;
  };
  return (
    <section className="card stack" aria-labelledby="week-h">
      <h2 id="week-h">Weekly summary</h2>
      <Segmented
        label="Weeks shown"
        options={[
          { value: '1', label: 'This week' },
          { value: '4', label: '4 weeks' },
        ]}
        value={view}
        onChange={setView}
      />
      {view === '1' ? (
        <>
          <p className="small muted">
            {formatDateShort(cur.start)} – {formatDateShort(cur.end)}
          </p>
          <div className="stat-row">
            <div className="stat">
              <span className="small muted">Runs</span>
              <b>{cur.runCount}</b>
              <span className="tiny muted num">
                {displayDistance(cur.runKm, units).toFixed(1)} {dist}
              </span>
            </div>
            <div className="stat">
              <span className="small muted">Avg pace</span>
              <b className="num">{paceText(cur)}</b>
            </div>
            <div className="stat">
              <span className="small muted">Avg steps</span>
              <b>{cur.avgSteps != null ? formatNumber(Math.round(cur.avgSteps)) : '—'}</b>
              <span className="tiny muted">{cur.stepDays} days</span>
            </div>
          </div>
          <h3>Lifts this week ({cur.liftCount})</h3>
          <ul className="list">
            {workoutTypes.map((t) => (
              <li key={t.id} className="row between" style={{ padding: '6px 0' }}>
                <span>{t.name}</span>
                <b className="num">{cur.liftTypes[t.name] ?? 0}</b>
              </li>
            ))}
            {Object.entries(cur.liftTypes)
              .filter(([name]) => !workoutTypes.some((t) => t.name === name))
              .map(([name, n]) => (
                <li key={name} className="row between small muted" style={{ padding: '6px 0' }}>
                  <span>{name}</span>
                  <b className="num">{n}</b>
                </li>
              ))}
          </ul>
          {overdue.length ? (
            <p className="small" style={{ margin: 0 }}>
              <b>Not done in 7+ days:</b>{' '}
              {overdue.map((o) => `${o.type.name} (${o.daysAgo == null ? 'not logged yet' : `${o.daysAgo} days`})`).join(', ')}
            </p>
          ) : lifts.length ? (
            <p className="small muted" style={{ margin: 0 }}>
              Every workout type done within the last week.
            </p>
          ) : null}
        </>
      ) : (
        <table className="simple">
          <thead>
            <tr>
              <th scope="col">Week of</th>
              <th scope="col" className="num">
                Runs ({dist})
              </th>
              <th scope="col" className="num">
                Lifts
              </th>
              <th scope="col" className="num">
                Avg steps
              </th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.start}>
                <td>{formatDateShort(w.start)}</td>
                <td className="num">
                  {w.runCount} <span className="muted">({displayDistance(w.runKm, units).toFixed(1)})</span>
                </td>
                <td className="num">{w.liftCount}</td>
                <td className="num">{w.avgSteps != null ? formatNumber(Math.round(w.avgSteps)) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
