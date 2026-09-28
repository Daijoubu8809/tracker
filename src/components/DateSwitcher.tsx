import { addDays, formatDateLong, todayISO } from '../lib/dates';
import { useApp } from '../state';
import { Icon } from './ui';

export function DateSwitcher() {
  const { date, setDate } = useApp();
  const today = todayISO();
  return (
    <div className="date-switcher">
      <button type="button" className="icon-btn" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
        <Icon name="left" />
      </button>
      <div className="date-label">
        <span aria-hidden="true">{formatDateLong(date, today)}</span>
        <input
          type="date"
          aria-label={`Date: ${formatDateLong(date, today)}. Choose a date`}
          value={date}
          max={addDays(today, 7)}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </div>
      <button type="button" className="icon-btn" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
        <Icon name="right" />
      </button>
      {date !== today ? (
        <button type="button" className="btn small" onClick={() => setDate(today)}>
          Today
        </button>
      ) : null}
    </div>
  );
}
