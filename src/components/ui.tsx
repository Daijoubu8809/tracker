import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

// ---------- Icons (inline SVG, stroke = currentColor) ----------

const paths: Record<string, ReactNode> = {
  today: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12V4a8 8 0 0 1 6.9 12" />
    </>
  ),
  log: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  progress: (
    <>
      <path d="M4 19V5M4 19h16" />
      <path d="M7 15l4-4 3 3 5-6" />
    </>
  ),
  training: (
    <>
      <path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" />
    </>
  ),
  foods: (
    <>
      <path d="M4 11h16a8 8 0 0 1-16 0z" />
      <path d="M9 7c0-2 2-2 2-4M13 7c0-2 2-2 2-4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  left: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V4H4v12h4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  check: <path d="M5 12l5 5 9-10" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01" />
    </>
  ),
};

export function Icon({ name, filled = false, title }: { name: keyof typeof paths | string; filled?: boolean; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {paths[name]}
    </svg>
  );
}

// ---------- Sheet (bottom modal) ----------

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref}>
        <div className="sheet-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- Segmented control ----------

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Number field ----------

function fmt(v: number | null, digits: number): string {
  if (v == null || !Number.isFinite(v)) return '';
  const f = 10 ** digits;
  return String(Math.round(v * f) / f);
}

/**
 * Text input with a decimal keypad. Keeps its own string while typing so
 * "1." or "" don't get clobbered; reports parsed numbers (or null when empty).
 */
export function NumField({
  label,
  value,
  onChange,
  unit,
  digits = 1,
  placeholder,
  min,
  id,
  hideLabel = false,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: string;
  digits?: number;
  placeholder?: string;
  min?: number;
  id?: string;
  hideLabel?: boolean;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [text, setText] = useState(fmt(value, digits));
  const lastValue = useRef(value);
  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      const parsed = text.trim() === '' ? null : Number(text.replace(',', '.'));
      if (parsed !== value) setText(fmt(value, digits));
    }
  }, [value, digits, text]);
  return (
    <div className="field">
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </label>
      <div className="input-with-unit">
        <input
          id={inputId}
          className="input num"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            const trimmed = t.trim().replace(',', '.');
            if (trimmed === '') {
              lastValue.current = null;
              onChange(null);
              return;
            }
            const n = Number(trimmed);
            if (Number.isFinite(n) && (min == null || n >= min)) {
              lastValue.current = n;
              onChange(n);
            }
          }}
        />
        {unit ? <span className="unit">{unit}</span> : null}
      </div>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div>
      <div className="check">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <label htmlFor={id}>{label}</label>
      </div>
      {hint ? <p className="small muted" style={{ marginTop: -6, marginLeft: 32 }}>{hint}</p> : null}
    </div>
  );
}

export function ProgressBar({ value, max, color, label }: { value: number; max: number; color?: string; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(value)}>
      <div style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
