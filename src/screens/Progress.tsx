import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { BandChart, IntakeChart, TrendChart, type BandDatum } from '../components/Charts';
import { NumField, Segmented, Sheet, TextField } from '../components/ui';
import { useAdaptive, useEntriesRange, useSettings, useTargets, useWaists, useWeightKg, useWeights } from '../hooks';
import { db, live } from '../lib/db';
import { activePhase, computeTargets } from '../lib/energy';
import { addDays, dateRange, formatDateShort, todayISO } from '../lib/dates';
import { emaTrend, phaseProgress, weeklyRate } from '../lib/trend';
import type { ISODate } from '../lib/types';
import { displayLength, displayWeight, inputLengthToCm, kgToLb, lengthUnit, weightUnit } from '../lib/units';
import { QuickWeighIn } from './Body';
import { AdaptiveCard } from './AdaptiveCard';
import { WeeklySummary } from './Training';

type Range = '30' | '90' | 'all';

export function Progress() {
  const s = useSettings();
  const today = todayISO();
  const weights = useWeights();
  const waists = useWaists();
  const [range, setRange] = useState<Range>('90');
  const [weighing, setWeighing] = useState(false);
  const [waistOpen, setWaistOpen] = useState(false);
  const from = range === 'all' ? '0000-00-00' : addDays(today, -Number(range) + 1);

  // Trend is computed on all data, then clipped to the range, so the line doesn't restart.
  const wTrend = useMemo(() => emaTrend(weights), [weights]);
  const wData = wTrend
    .filter((p) => p.date >= from)
    .map((p) => ({ date: p.date, value: displayWeight(p.value, s.units), trend: displayWeight(p.trend, s.units) }));
  const waistTrend = useMemo(() => emaTrend(waists, 0.4), [waists]);
  const waistData = waistTrend
    .filter((p) => p.date >= from)
    .map((p) => ({ date: p.date, value: displayLength(p.value, s.units), trend: displayLength(p.trend, s.units) }));

  const kgPerWeek = weeklyRate(weights, today);
  const waistPerWeek = weeklyRate(waists, today, 28);
  const phase = activePhase(s.phases, today) ?? s.phases.find((p) => p.startDate > today) ?? null;
  const trendNow = wTrend.length ? wTrend[wTrend.length - 1].trend : null;
  const progress = phase && trendNow != null ? phaseProgress(phase, trendNow, kgPerWeek, today) : null;
  const goalDisplay = phase?.targetWeightKg != null ? displayWeight(phase.targetWeightKg, s.units) : null;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Progress</h1>
      </div>
      <Segmented
        label="Range"
        options={[
          { value: '30', label: '30 days' },
          { value: '90', label: '90 days' },
          { value: 'all', label: 'All' },
        ]}
        value={range}
        onChange={setRange}
      />

      <section className="card stack" aria-labelledby="weight-h">
        <div className="row between">
          <h2 id="weight-h">Weight</h2>
          <button type="button" className="btn small" onClick={() => setWeighing(true)}>
            + Weigh-in
          </button>
        </div>
        <div className="stat-row">
          <div className="stat">
            <span className="small muted">Trend</span>
            <b>{trendNow != null ? `${displayWeight(trendNow, s.units).toFixed(1)} ${weightUnit(s.units)}` : '—'}</b>
          </div>
          <div className="stat">
            <span className="small muted">Per week</span>
            <b>{kgPerWeek != null ? `${kgPerWeek > 0 ? '+' : ''}${(s.units === 'us' ? kgToLb(kgPerWeek) : kgPerWeek).toFixed(2)} ${weightUnit(s.units)}` : '—'}</b>
          </div>
          <div className="stat">
            <span className="small muted">Weigh-ins</span>
            <b>{weights.length}</b>
          </div>
        </div>
        {progress ? <div className={`banner ${progress.onPace === false ? 'warn' : ''}`}>{progress.text.replace(/\d{4}-\d{2}-\d{2}/g, (d) => formatDateShort(d))}</div> : null}
        <TrendChart data={wData} unit={weightUnit(s.units)} label="Weight: daily weigh-ins and smoothed trend" goal={goalDisplay} />
        <p className="tiny muted">The trend line smooths out day-to-day water swings; rate of change is fitted over the last 14 days.</p>
      </section>

      <section className="card stack" aria-labelledby="waist-h">
        <div className="row between">
          <h2 id="waist-h">Waist (at navel)</h2>
          <button type="button" className="btn small" onClick={() => setWaistOpen(true)}>
            + Waist
          </button>
        </div>
        {waists.length ? (
          <div className="stat-row">
            <div className="stat">
              <span className="small muted">Latest</span>
              <b>
                {displayLength(waists[waists.length - 1].value, s.units).toFixed(1)} {lengthUnit(s.units)}
              </b>
            </div>
            <div className="stat">
              <span className="small muted">Per week</span>
              <b>{waistPerWeek != null ? `${waistPerWeek > 0 ? '+' : ''}${displayLength(waistPerWeek, s.units).toFixed(2)}` : '—'}</b>
            </div>
            <div className="stat">
              <span className="small muted">Since first</span>
              <b>
                {(() => {
                  const d = displayLength(waists[waists.length - 1].value - waists[0].value, s.units);
                  return `${d > 0 ? '+' : ''}${d.toFixed(1)}`;
                })()}
              </b>
            </div>
          </div>
        ) : null}
        <TrendChart data={waistData} unit={lengthUnit(s.units)} label="Waist measurements and trend" />
        <p className="tiny muted">Measure weekly, same time of day, relaxed, tape level at the navel.</p>
      </section>

      <IntakeCard />
      <MacroTrendCard />
      <AdaptiveCard />
      <WeeklySummary />
      <NotesCard />

      {weighing ? <QuickWeighIn date={today} onClose={() => setWeighing(false)} /> : null}
      {waistOpen ? <WaistSheet onClose={() => setWaistOpen(false)} /> : null}
    </div>
  );
}

function IntakeCard() {
  const s = useSettings();
  const today = todayISO();
  const start = addDays(today, -27);
  const entries = useEntriesRange(start, today);
  const adaptive = useAdaptive();
  const t = useTargets(today);
  const weightKg = useWeightKg(today);
  const data = useMemo(() => {
    const byDay = new Map<ISODate, number>();
    for (const e of entries) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.kcal);
    const days = dateRange(start, today);
    return days.map((d, i) => {
      const window = days.slice(Math.max(0, i - 6), i + 1).filter((x) => byDay.has(x) && x !== today);
      const avg7 = window.length >= 3 ? window.reduce((sum, x) => sum + (byDay.get(x) ?? 0), 0) / window.length : null;
      const target = computeTargets({
        settings: s,
        date: d,
        weightKg,
        adaptiveMaintenance: adaptive.ok ? adaptive.maintenance : null,
        exerciseKcal: 0,
      }).calories;
      return { date: d, kcal: byDay.get(d) ?? null, target, avg7 };
    });
  }, [entries, s, adaptive, start, today, weightKg]);
  const last = [...data].reverse().find((d) => d.avg7 != null);
  return (
    <section className="card stack" aria-labelledby="intake-h">
      <h2 id="intake-h">Intake vs target (28 days)</h2>
      {last?.avg7 != null ? (
        <p className="small">
          7-day average: <b className="num">{Math.round(last.avg7).toLocaleString()} kcal</b> vs target{' '}
          <b className="num">{t.calories.toLocaleString()}</b>
        </p>
      ) : (
        <p className="small muted">Log at least 3 days to see a 7-day average. Today isn’t counted until it’s over.</p>
      )}
      <IntakeChart data={data} label="Daily calorie intake, 7-day average and target" />
    </section>
  );
}

function WaistSheet({ onClose }: { onClose: () => void }) {
  const { units } = useSettings();
  const [date, setDate] = useState(todayISO());
  const [v, setV] = useState<number | null>(null);
  return (
    <Sheet title="Waist measurement" onClose={onClose}>
      <TextField label="Date" type="date" value={date} onChange={(d) => d && setDate(d)} />
      <NumField label="Waist at navel" value={v} unit={lengthUnit(units)} onChange={setV} />
      <button
        type="button"
        className="btn primary big block"
        disabled={!v || v <= 0}
        onClick={() => {
          if (v) void db.waists.put({ id: date, date, cm: inputLengthToCm(v, units), updatedAt: Date.now() });
          onClose();
        }}
      >
        Save
      </button>
    </Sheet>
  );
}

function NotesCard() {
  const notes = useLiveQuery(async () => live(await db.notes.toArray()).filter((n) => n.text.trim()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10), [], []);
  if (!notes.length) return null;
  return (
    <section className="card stack" aria-labelledby="notes-h">
      <h2 id="notes-h">Recent notes</h2>
      <ul className="list">
        {notes.map((n) => (
          <li key={n.id} className="small" style={{ padding: '6px 0' }}>
            <b>{formatDateShort(n.date)}</b> — {n.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 7-day average protein, carbs and fat vs each day's targets (targets follow phases). */
function MacroTrendCard() {
  const s = useSettings();
  const today = todayISO();
  const start = addDays(today, -27);
  const entries = useEntriesRange(addDays(start, -6), today);
  const adaptive = useAdaptive();
  const weightKg = useWeightKg(today);
  const charts = useMemo(() => {
    const byDay = new Map<ISODate, { protein: number; carbs: number; fat: number }>();
    for (const e of entries) {
      const d = byDay.get(e.date) ?? { protein: 0, carbs: 0, fat: 0 };
      d.protein += e.protein;
      d.carbs += e.carbs;
      d.fat += e.fat;
      byDay.set(e.date, d);
    }
    const days = dateRange(start, today);
    const out: Record<'protein' | 'carbs' | 'fat', BandDatum[]> = { protein: [], carbs: [], fat: [] };
    for (const d of days) {
      const m = computeTargets({
        settings: s,
        date: d,
        weightKg,
        adaptiveMaintenance: adaptive.ok ? adaptive.maintenance : null,
        exerciseKcal: 0,
      }).macros;
      // Completed logged days in the 7 days ending here (today is still in progress).
      const window = dateRange(addDays(d, -6), d).filter((x) => x !== today && byDay.has(x));
      const avg = (k: 'protein' | 'carbs' | 'fat') =>
        window.length >= 3 ? window.reduce((sum, x) => sum + (byDay.get(x)?.[k] ?? 0), 0) / window.length : null;
      out.protein.push({ date: d, avg7: avg('protein'), min: m.proteinG, max: m.proteinG });
      out.carbs.push({ date: d, avg7: avg('carbs'), min: m.carbs.min, max: m.carbs.max });
      out.fat.push({ date: d, avg7: avg('fat'), min: m.fat.min, max: m.fat.max });
    }
    return out;
  }, [entries, s, adaptive, weightKg, start, today]);
  const hasData = charts.protein.some((d) => d.avg7 != null);
  return (
    <section className="card stack" aria-labelledby="macro-trend-h">
      <h2 id="macro-trend-h">Macros: 7-day average vs target</h2>
      {hasData ? (
        <>
          <BandChart data={charts.protein} label="Protein" unit="g" />
          <BandChart data={charts.carbs} label="Carbs" unit="g" />
          <BandChart data={charts.fat} label="Fat" unit="g" />
        </>
      ) : (
        <p className="small muted">Log at least 3 days to see 7-day averages.</p>
      )}
    </section>
  );
}
