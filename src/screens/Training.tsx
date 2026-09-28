import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { DateSwitcher } from '../components/DateSwitcher';
import { Icon, NumField, Segmented, Sheet, TextField } from '../components/ui';
import { useDayExercise, useSettings, useWeightKg } from '../hooks';
import { db, live } from '../lib/db';
import { addDays, formatDateShort, todayISO, weekStart } from '../lib/dates';
import { liftKcal, runKcal } from '../lib/energy';
import { newId } from '../lib/id';
import { pace, parseDuration, summarizeWeek, type WeekSummary } from '../lib/training';
import { LIFT_TYPES, type LiftEntry, type LiftType, type RunEntry } from '../lib/types';
import { displayDistance, distanceUnit, formatDuration, formatNumber, formatPace, inputDistanceToKm } from '../lib/units';
import { useApp } from '../state';

const LIFT_LABEL: Record<LiftType, string> = { push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper', lower: 'Lower', full: 'Full body' };

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
            onClick={() => setLiftOpen({ id: newId(), date, type: 'push', durationMin: 60, note: '', updatedAt: 0 })}
          >
            + Lift
          </button>
        </div>
        {ex.lifts.length ? (
          <ul className="list">
            {ex.lifts.map((l) => (
              <li key={l.id}>
                <button type="button" className="list-item" onClick={() => setLiftOpen(l)}>
                  <div className="grow">
                    <div>
                      {LIFT_LABEL[l.type]} · {formatDuration(l.durationMin)}
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
  const isNew = lift.updatedAt === 0;
  const [draft, setDraft] = useState(lift);
  return (
    <Sheet title={isNew ? 'Log a lift' : 'Edit lift'} onClose={onClose}>
      <div className="chips" role="group" aria-label="Lift type">
        {LIFT_TYPES.map((t) => (
          <button key={t} type="button" className="chip" aria-pressed={draft.type === t} onClick={() => setDraft({ ...draft, type: t })}>
            {LIFT_LABEL[t]}
          </button>
        ))}
      </div>
      <NumField label="Duration" value={draft.durationMin} digits={0} unit="min" onChange={(v) => setDraft({ ...draft, durationMin: v ?? 0 })} />
      <div className="chips">
        {[30, 45, 60, 75, 90].map((m) => (
          <button key={m} type="button" className="chip" aria-pressed={draft.durationMin === m} onClick={() => setDraft({ ...draft, durationMin: m })}>
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
          disabled={draft.durationMin <= 0}
          onClick={() => {
            void db.lifts.put({ ...draft, note: draft.note.trim(), updatedAt: Date.now(), deleted: false });
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}

/** This week vs previous weeks: steps average, run mileage, number of lifts. */
export function WeeklySummary() {
  const { units } = useSettings();
  const { date } = useApp();
  const [weeksBack, setWeeksBack] = useState<'1' | '4'>('4');
  const thisWeek = weekStart(date > todayISO() ? todayISO() : date);
  const first = addDays(thisWeek, -7 * 3);
  const end = addDays(thisWeek, 6);
  const data = useLiveQuery(
    async () => {
      const [steps, runs, lifts] = await Promise.all([
        db.steps.where('date').between(first, end, true, true).toArray(),
        db.runs.where('date').between(first, end, true, true).toArray(),
        db.lifts.where('date').between(first, end, true, true).toArray(),
      ]);
      return { steps: live(steps), runs: live(runs), lifts: live(lifts) };
    },
    [first, end],
    { steps: [], runs: [], lifts: [] },
  );
  const weeks: WeekSummary[] = [0, 1, 2, 3].map((i) => summarizeWeek(addDays(thisWeek, -7 * i), data.steps, data.runs, data.lifts));
  const dist = distanceUnit(units);
  const cur = weeks[0];
  return (
    <section className="card stack" aria-labelledby="week-h">
      <h2 id="week-h">Weekly summary</h2>
      <Segmented
          label="Weeks shown"
          options={[
            { value: '1', label: 'This week' },
            { value: '4', label: '4 weeks' },
          ]}
          value={weeksBack}
          onChange={setWeeksBack}
        />
      {weeksBack === '1' ? (
        <>
          <p className="small muted">
            {formatDateShort(cur.start)} – {formatDateShort(cur.end)}
          </p>
          <div className="stat-row">
            <div className="stat">
              <span className="small muted">Avg steps</span>
              <b>{cur.avgSteps != null ? formatNumber(Math.round(cur.avgSteps)) : '—'}</b>
              <span className="tiny muted">{cur.stepDays} days entered</span>
            </div>
            <div className="stat">
              <span className="small muted">Running</span>
              <b>
                {displayDistance(cur.runKm, units).toFixed(1)} {dist}
              </b>
              <span className="tiny muted">{cur.runCount} runs</span>
            </div>
            <div className="stat">
              <span className="small muted">Lifts</span>
              <b>{cur.liftCount}</b>
              <span className="tiny muted">
                {Object.entries(cur.liftTypes)
                  .map(([t, n]) => `${LIFT_LABEL[t as LiftType]}${n > 1 ? ` ×${n}` : ''}`)
                  .join(', ') || '—'}
              </span>
            </div>
          </div>
        </>
      ) : (
        <table className="simple">
          <thead>
            <tr>
              <th scope="col">Week of</th>
              <th scope="col" className="num">
                Avg steps
              </th>
              <th scope="col" className="num">
                Run {dist}
              </th>
              <th scope="col" className="num">
                Lifts
              </th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.start}>
                <td>{formatDateShort(w.start)}</td>
                <td className="num">{w.avgSteps != null ? formatNumber(Math.round(w.avgSteps)) : '—'}</td>
                <td className="num">
                  {displayDistance(w.runKm, units).toFixed(1)} <span className="muted">({w.runCount})</span>
                </td>
                <td className="num">{w.liftCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
