import { useAdaptive, useSettings, useTargets } from '../hooks';
import { saveSettings } from '../lib/db';
import { todayISO } from '../lib/dates';
import { MIN_INTAKE_DAYS } from '../lib/trend';
import { ProgressBar } from '../components/ui';

/** Formula vs adaptive maintenance, side by side, with a one-tap switch. */
export function AdaptiveCard() {
  const s = useSettings();
  const t = useTargets(todayISO());
  const a = useAdaptive();
  const using = s.maintenanceSource;
  return (
    <section className="card stack" aria-labelledby="adaptive-h">
      <h2 id="adaptive-h">Adaptive maintenance</h2>
      <div className="grid-2">
        <button
          type="button"
          className={`stat ${using === 'formula' ? 'on' : ''}`}
          aria-pressed={using === 'formula'}
          style={{ border: using === 'formula' ? '2px solid var(--accent)' : '2px solid transparent', textAlign: 'left', cursor: 'pointer' }}
          onClick={() => void saveSettings({ maintenanceSource: 'formula' })}
        >
          <span className="small muted">Formula</span>
          <b className="num">{Math.round(t.formulaTdee).toLocaleString()} kcal</b>
          <span className="tiny muted">{using === 'formula' ? 'In use' : 'Tap to use'}</span>
        </button>
        <button
          type="button"
          className="stat"
          aria-pressed={using === 'adaptive'}
          disabled={!a.ok}
          style={{ border: using === 'adaptive' ? '2px solid var(--accent)' : '2px solid transparent', textAlign: 'left', cursor: a.ok ? 'pointer' : 'default' }}
          onClick={() => a.ok && void saveSettings({ maintenanceSource: 'adaptive' })}
        >
          <span className="small muted">From your data</span>
          <b className="num">{a.ok ? `${(Math.round(a.maintenance / 10) * 10).toLocaleString()} kcal` : 'Not yet'}</b>
          <span className="tiny muted">{!a.ok ? 'Needs more data' : using === 'adaptive' ? 'In use' : 'Tap to use'}</span>
        </button>
      </div>
      {a.ok ? (
        <details>
          <summary>How it’s calculated</summary>
          <ol className="small" style={{ paddingLeft: 20, margin: 0 }}>
            {a.steps.map((l) => (
              <li key={l} className="num">
                {l}
              </li>
            ))}
          </ol>
          <p className="small muted">
            Uses the last 28 days (≈3,500 kcal per lb). It’s only as good as your logging — days you skipped logging are left out, but
            partly logged days pull it down.
          </p>
        </details>
      ) : (
        <div className="stack">
          <p className="small muted">{a.reason}</p>
          <ProgressBar label="Days of food logs toward adaptive estimate" value={a.intakeDays} max={MIN_INTAKE_DAYS} />
        </div>
      )}
    </section>
  );
}
