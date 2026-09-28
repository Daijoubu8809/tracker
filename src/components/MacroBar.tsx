import { rangeStatus } from '../lib/macros';
import { formatNumber } from '../lib/units';

const STATE_TEXT = { under: 'below range', in: 'in range', over: 'past range' } as const;

/**
 * Eaten vs a target range. Neutral below the min, accent within, amber past the max
 * (bar capped, with a small "+12 g over"). Wording stays neutral on purpose.
 */
export function RangeBar({ eaten, min, max, label, unit }: { eaten: number; min: number; max: number; label: string; unit: string }) {
  const st = rangeStatus(eaten, min, max);
  return (
    <div
      className="bar"
      role="meter"
      aria-label={`${label}: ${Math.round(eaten)} ${unit}, ${STATE_TEXT[st.state]}`}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(Math.min(eaten, max))}
    >
      <div className={`state-${st.state}`} style={{ width: `${st.fill * 100}%` }} />
    </div>
  );
}

function fmt(n: number) {
  return formatNumber(Math.round(n));
}

/** "eaten / target" tile with a range bar. Pass min === max for a single target (protein). */
export function MacroTile({ label, eaten, min, max, unit = 'g' }: { label: string; eaten: number; min: number; max: number | null; unit?: string }) {
  // Single target (no max): "in" once reached, never "over".
  const hi = max ?? min;
  const st = max == null ? { ...rangeStatus(Math.min(eaten, min), min, min), overBy: 0 } : rangeStatus(eaten, min, hi);
  const target = max == null || min === max ? fmt(hi) : `${fmt(min)}–${fmt(hi)}`;
  return (
    <div className="macro-tile">
      <span>{label}</span>
      <b className="right">
        {fmt(eaten)} <span className="small muted">/ {target} {unit}</span>
      </b>
      <div
        className="bar"
        role="meter"
        aria-label={`${label}: ${fmt(eaten)} of ${target} ${unit}, ${STATE_TEXT[st.state]}`}
        aria-valuemin={0}
        aria-valuemax={Math.round(hi)}
        aria-valuenow={Math.round(Math.min(eaten, hi))}
      >
        <div className={`state-${st.state}`} style={{ width: `${(max == null ? Math.min(1, hi > 0 ? eaten / hi : 0) : st.fill) * 100}%` }} />
      </div>
      {st.state === 'over' ? <span className="tiny muted over-note">+{fmt(st.overBy)} {unit} over</span> : null}
    </div>
  );
}
