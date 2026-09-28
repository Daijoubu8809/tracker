import { useId, useState, type PointerEvent } from 'react';
import { daysBetween, formatDateShort } from '../lib/dates';

const W = 340;
const H = 180;
const PAD = { l: 36, r: 8, t: 8, b: 22 };

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

interface Frame {
  start: string;
  end: string;
  yMin: number;
  yMax: number;
  /** Horizontal padding inside the plot, so edge bars don't touch the axis. */
  inset?: number;
}

function fmtTick(t: number, digits: number): string {
  if (Math.abs(t) >= 1000) return `${(t / 1000).toFixed(t % 1000 ? 1 : 0)}k`;
  return t.toFixed(digits);
}

function scales(f: Frame) {
  const days = Math.max(1, daysBetween(f.start, f.end));
  const inset = f.inset ?? 0;
  const x = (d: string) => PAD.l + inset + (daysBetween(f.start, d) / days) * (W - PAD.l - PAD.r - 2 * inset);
  const y = (v: number) => PAD.t + (1 - (v - f.yMin) / (f.yMax - f.yMin || 1)) * (H - PAD.t - PAD.b);
  const dateAt = (px: number) => Math.round(((px - PAD.l - inset) / (W - PAD.l - PAD.r - 2 * inset)) * days);
  return { x, y, days, dateAt };
}

function Axes({ f, digits }: { f: Frame; digits: number }) {
  const { x, y } = scales(f);
  const ticks = niceTicks(f.yMin, f.yMax);
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
          <text x={PAD.l - 4} y={y(t) + 3} textAnchor="end">
            {fmtTick(t, digits)}
          </text>
        </g>
      ))}
      <text x={x(f.start)} y={H - 6} textAnchor="start">
        {formatDateShort(f.start)}
      </text>
      <text x={x(f.end)} y={H - 6} textAnchor="end">
        {formatDateShort(f.end)}
      </text>
    </g>
  );
}

/** Finds the nearest datum to the pointer; returns its index. */
function useHover<T extends { date: string }>(data: readonly T[], f: Frame) {
  const [idx, setIdx] = useState<number | null>(null);
  const { dateAt, x } = scales(f);
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (!data.length) return;
    const target = dateAt(px);
    let best = 0;
    let bestD = Infinity;
    data.forEach((d, i) => {
      const dd = Math.abs(daysBetween(f.start, d.date) - target);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    });
    setIdx(best);
  };
  return { idx, onMove, clear: () => setIdx(null), hoverX: idx != null && data[idx] ? x(data[idx].date) : null };
}

export interface TrendDatum {
  date: string;
  value: number;
  trend: number;
}

/** Raw measurements as dots plus a smoothed trend line. */
export function TrendChart({
  data,
  unit,
  digits = 1,
  label,
  goal,
}: {
  data: readonly TrendDatum[];
  unit: string;
  digits?: number;
  label: string;
  goal?: number | null;
}) {
  const titleId = useId();
  const f = trendFrame(data, goal);
  const hover = useHover(data, f);
  if (data.length === 0) return <p className="small muted">No entries yet.</p>;
  const { x, y } = scales(f);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(d.date).toFixed(1)},${y(d.trend).toFixed(1)}`).join('');
  const h = hover.idx != null ? data[hover.idx] : data[data.length - 1];
  return (
    <div className="chart">
      <div className="chart-tip" aria-live="polite">
        {formatDateShort(h.date)} · <b>{h.value.toFixed(digits)}</b> {unit} · trend {h.trend.toFixed(digits)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId} onPointerMove={hover.onMove} onPointerDown={hover.onMove} onPointerLeave={hover.clear}>
        <title id={titleId}>{label}</title>
        <Axes f={f} digits={f.yMax - f.yMin < 5 ? 1 : 0} />
        {goal != null ? (
          <line x1={PAD.l} x2={W - PAD.r} y1={y(goal)} y2={y(goal)} stroke="var(--text-2)" strokeDasharray="4 4" strokeWidth={1} />
        ) : null}
        {hover.hoverX != null ? <line x1={hover.hoverX} x2={hover.hoverX} y1={PAD.t} y2={H - PAD.b} stroke="var(--text-2)" strokeWidth={1} /> : null}
        {data.map((d) => (
          <circle key={d.date} cx={x(d.date)} cy={y(d.value)} r={3.5} fill="var(--series-1)" fillOpacity={0.5} />
        ))}
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover.idx != null ? <circle cx={x(h.date)} cy={y(h.trend)} r={4.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} /> : null}
      </svg>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--series-1)', opacity: 0.5 }} /> Entries
        </span>
        <span>
          <i style={{ background: 'var(--series-1)', borderRadius: 2, height: 3 }} /> Trend
        </span>
        {goal != null ? <span>- - Goal</span> : null}
      </div>
      <DataTable rows={data.map((d) => [formatDateShort(d.date), d.value.toFixed(digits), d.trend.toFixed(digits)])} head={['Date', unit, 'Trend']} />
    </div>
  );
}

function trendFrame(data: readonly TrendDatum[], goal: number | null | undefined): Frame {
  if (!data.length) return { start: '2000-01-01', end: '2000-01-02', yMin: 0, yMax: 1 };
  const vals = data.flatMap((d) => [d.value, d.trend]).concat(goal != null ? [goal] : []);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.1, 0.5);
  return { start: data[0].date, end: data[data.length - 1].date, yMin: lo - pad, yMax: hi + pad };
}

export interface IntakeDatum {
  date: string;
  kcal: number | null;
  target: number;
  avg7: number | null;
}

/** Daily intake bars, the target as a dashed reference, and the 7-day average line. */
export function IntakeChart({ data, label }: { data: readonly IntakeDatum[]; label: string }) {
  const titleId = useId();
  const f = frameFor(data);
  const hover = useHover(data, f);
  if (!data.length) return null;
  const { x, y, days } = scales(f);
  const bw = Math.max(2, (W - PAD.l - PAD.r - 2 * (f.inset ?? 0)) / (days + 1) - 2);
  const avgPts = data.filter((d) => d.avg7 != null);
  const avgPath = avgPts.map((d, i) => `${i ? 'L' : 'M'}${x(d.date).toFixed(1)},${y(d.avg7!).toFixed(1)}`).join('');
  const targetPath = data.map((d, i) => `${i ? 'L' : 'M'}${x(d.date).toFixed(1)},${y(d.target).toFixed(1)}`).join('');
  const h = hover.idx != null ? data[hover.idx] : data[data.length - 1];
  return (
    <div className="chart">
      <div className="chart-tip" aria-live="polite">
        {formatDateShort(h.date)} · <b>{h.kcal != null ? Math.round(h.kcal).toLocaleString() : 'not logged'}</b>
        {h.kcal != null ? ' kcal' : ''} · 7-day avg {h.avg7 != null ? Math.round(h.avg7).toLocaleString() : '—'} · target{' '}
        {Math.round(h.target).toLocaleString()}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId} onPointerMove={hover.onMove} onPointerDown={hover.onMove} onPointerLeave={hover.clear}>
        <title id={titleId}>{label}</title>
        <Axes f={f} digits={0} />
        {data.map((d, i) =>
          d.kcal != null ? (
            <rect
              key={d.date}
              x={x(d.date) - bw / 2}
              y={y(d.kcal)}
              width={bw}
              height={Math.max(0, y(f.yMin) - y(d.kcal))}
              rx={Math.min(4, bw / 2)}
              fill="var(--series-1)"
              fillOpacity={hover.idx == null || hover.idx === i ? 0.85 : 0.4}
            />
          ) : null,
        )}
        <path d={targetPath} fill="none" stroke="var(--text-2)" strokeWidth={1.5} strokeDasharray="5 4" />
        <path d={avgPath} fill="none" stroke="var(--series-2)" strokeWidth={2} strokeLinejoin="round" />
      </svg>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--series-1)', borderRadius: 2 }} /> Daily intake
        </span>
        <span>
          <i style={{ background: 'var(--series-2)', height: 3, borderRadius: 2 }} /> 7-day average
        </span>
        <span>- - Target</span>
      </div>
      <DataTable
        rows={data.map((d) => [
          formatDateShort(d.date),
          d.kcal != null ? String(Math.round(d.kcal)) : '—',
          d.avg7 != null ? String(Math.round(d.avg7)) : '—',
          String(Math.round(d.target)),
        ])}
        head={['Date', 'kcal', '7-day avg', 'Target']}
      />
    </div>
  );
}

function frameFor(data: readonly IntakeDatum[]): Frame {
  if (!data.length) return { start: '2000-01-01', end: '2000-01-02', yMin: 0, yMax: 1 };
  const vals = data.flatMap((d) => [d.kcal ?? 0, d.target, d.avg7 ?? 0]);
  const days = Math.max(1, daysBetween(data[0].date, data[data.length - 1].date));
  return { start: data[0].date, end: data[data.length - 1].date, yMin: 0, yMax: Math.max(...vals) * 1.1 || 1, inset: (W - PAD.l - PAD.r) / (days + 1) / 2 + 2 };
}

function DataTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <details>
      <summary className="small">Show data</summary>
      <table className="simple">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={i ? 'num' : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((r) => (
            <tr key={r[0]}>
              {r.map((c, i) => (
                <td key={i} className={i ? 'num' : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export interface BandDatum {
  date: string;
  avg7: number | null;
  min: number;
  max: number;
}

/** A 7-day average line against a shaded target band (min–max; a single line when min = max). */
export function BandChart({ data, label, unit }: { data: readonly BandDatum[]; label: string; unit: string }) {
  const titleId = useId();
  const f = bandFrame(data);
  const hover = useHover(data, f);
  if (!data.length) return null;
  const { x, y } = scales(f);
  const pts = data.filter((d) => d.avg7 != null);
  const line = pts.map((d, i) => `${i ? 'L' : 'M'}${x(d.date).toFixed(1)},${y(d.avg7!).toFixed(1)}`).join('');
  const top = data.map((d, i) => `${i ? 'L' : 'M'}${x(d.date).toFixed(1)},${y(d.max).toFixed(1)}`).join('');
  const bottom = [...data].reverse().map((d) => `L${x(d.date).toFixed(1)},${y(d.min).toFixed(1)}`).join('');
  const single = data.every((d) => d.min === d.max);
  const h = hover.idx != null ? data[hover.idx] : [...data].reverse().find((d) => d.avg7 != null) ?? data[data.length - 1];
  return (
    <div className="chart">
      <div className="chart-tip" aria-live="polite">
        <b>{label}</b> · {formatDateShort(h.date)} · 7-day avg <b>{h.avg7 != null ? Math.round(h.avg7) : '—'}</b> {unit} · target{' '}
        {single ? h.max : `${h.min}–${h.max}`} {unit}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId} onPointerMove={hover.onMove} onPointerDown={hover.onMove} onPointerLeave={hover.clear}>
        <title id={titleId}>{`${label}: 7-day average vs target`}</title>
        <Axes f={f} digits={0} />
        {single ? (
          <path d={top} fill="none" stroke="var(--text-2)" strokeWidth={1.5} strokeDasharray="5 4" />
        ) : (
          <path d={`${top}${bottom}Z`} fill="var(--text-2)" fillOpacity={0.14} stroke="none" />
        )}
        {hover.hoverX != null ? <line x1={hover.hoverX} x2={hover.hoverX} y1={PAD.t} y2={H - PAD.b} stroke="var(--text-2)" strokeWidth={1} /> : null}
        <path d={line} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--series-1)', height: 3, borderRadius: 2 }} /> 7-day average
        </span>
        <span>{single ? '- - Target' : '▒ Target range'}</span>
      </div>
    </div>
  );
}

function bandFrame(data: readonly BandDatum[]): Frame {
  if (!data.length) return { start: '2000-01-01', end: '2000-01-02', yMin: 0, yMax: 1 };
  const vals = data.flatMap((d) => [d.max, d.avg7 ?? 0]);
  return { start: data[0].date, end: data[data.length - 1].date, yMin: 0, yMax: Math.max(...vals) * 1.15 || 1 };
}
