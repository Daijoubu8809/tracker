import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { formatNumberInput, parseNumberInput, type NumberRules } from '../lib/numberInput';

/**
 * A number field's editable state. The text is a free-form draft: any partial input
 * ("", "1", "17", "5.", ".5") is allowed while typing. Nothing is parsed, rounded,
 * clamped or converted until the value is committed (blur / Enter / Save).
 */
export interface NumberFieldState {
  text: string;
  setText: (t: string) => void;
  /** Error message to show (only after a commit attempt). */
  error: string | null;
  /** True when the text differs from what was last loaded/committed. */
  dirty: boolean;
  /** Validate the current text. Shows the message on failure. Returns the parsed result. */
  check: () => { ok: boolean; value: number | null };
  /** Replace the draft from a stored value (e.g. after an external change). */
  reset: (v: number | null) => void;
  rules: NumberRules;
  digits: number;
}

/** State for a NumberField inside a form that commits on Save. */
export function useNumberField(initial: number | null, rules: NumberRules = {}, digits = 2): NumberFieldState {
  const [text, setTextRaw] = useState(() => formatNumberInput(initial, digits));
  const [base, setBase] = useState(() => formatNumberInput(initial, digits));
  const [error, setError] = useState<string | null>(null);
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  const setText = useCallback((t: string) => {
    setTextRaw(t);
    setError(null); // editing clears the message; it comes back on the next commit attempt
  }, []);
  const check = useCallback(() => {
    const r = parseNumberInput(text, rulesRef.current);
    setError(r.error);
    return { ok: r.error == null, value: r.value };
  }, [text]);
  const reset = useCallback(
    (v: number | null) => {
      const t = formatNumberInput(v, digits);
      setTextRaw(t);
      setBase(t);
      setError(null);
    },
    [digits],
  );
  return { text, setText, error, dirty: text.trim() !== base.trim(), check, reset, rules, digits };
}

interface CommonProps {
  label: string;
  unit?: string;
  placeholder?: string;
  hideLabel?: boolean;
  id?: string;
  /** Extra hint under the field (shown when there's no error). */
  hint?: ReactNode;
  /** Called on blur after the field's own handling (e.g. to validate a pair of fields together). */
  onBlur?: () => void;
  /** External error to show (e.g. a combined ft/in range message). */
  errorOverride?: string | null;
}

type Props =
  | (CommonProps & {
      /** Form mode: the parent owns the state and commits on Save. */
      field: NumberFieldState;
      value?: never;
      onCommit?: never;
      rules?: never;
      digits?: never;
    })
  | (CommonProps & {
      /** Autosave mode: commits on blur or Enter when the text changed and is valid. */
      value: number | null;
      onCommit: (v: number | null) => void;
      rules?: NumberRules;
      digits?: number;
      field?: never;
    });

/**
 * The one numeric input used across the app.
 * - type="text" + inputMode (decimal/numeric), 16px font so iOS doesn't zoom
 * - free-form draft while typing; validate + commit only on blur / Enter / Save
 * - out-of-range input stays as typed with a calm inline message, and isn't saved
 */
export function NumberField(props: Props) {
  if (props.field) return <NumberFieldView {...props} field={props.field} />;
  return <AutoNumberField {...props} />;
}

function AutoNumberField(props: CommonProps & { value: number | null; onCommit: (v: number | null) => void; rules?: NumberRules; digits?: number }) {
  const { value, onCommit, rules = {}, digits = 2, onBlur, ...rest } = props;
  const field = useNumberField(value, rules, digits);
  const focused = useRef(false);
  const { reset, dirty, error } = field;
  // Follow external changes, but never while the user is typing or looking at a message.
  useEffect(() => {
    if (!focused.current && !error) reset(value);
  }, [value]);
  const commit = () => {
    if (!dirty) return;
    const r = field.check();
    if (r.ok) {
      onCommit(r.value);
      reset(r.value); // mark clean; display what was saved (same number, unrounded)
    }
  };
  return (
    <NumberFieldView
      {...rest}
      field={field}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        commit();
        onBlur?.();
      }}
      onEnter={commit}
    />
  );
}

function NumberFieldView({
  field,
  label,
  unit,
  placeholder,
  hideLabel = false,
  id,
  hint,
  onBlur,
  onFocus,
  onEnter,
  errorOverride,
}: CommonProps & { field: NumberFieldState; onFocus?: () => void; onEnter?: () => void }) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-msg`;
  const error = errorOverride ?? field.error;
  const integer = field.rules.integer && !field.rules.parse;
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (onEnter) onEnter();
      else field.check();
      e.currentTarget.blur();
    }
  };
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
          inputMode={integer ? 'numeric' : 'decimal'}
          pattern={integer ? '[0-9]*' : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder={placeholder}
          value={field.text}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          onChange={(e) => field.setText(e.target.value)}
          onFocus={onFocus}
          onBlur={() => {
            if (!onEnter) field.check(); // form mode: show the message as soon as you leave the field
            onBlur?.();
          }}
          onKeyDown={onKeyDown}
        />
        {unit ? <span className="unit">{unit}</span> : null}
      </div>
      {error ? (
        <span id={msgId} className="field-msg" role="status">
          {error}
        </span>
      ) : hint ? (
        <span id={msgId} className="small muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Validate several form fields at once (for a Save button). Returns their values if all are valid. */
export function checkAll(fields: readonly NumberFieldState[]): { ok: boolean; values: (number | null)[] } {
  const results = fields.map((f) => f.check());
  return { ok: results.every((r) => r.ok), values: results.map((r) => r.value) };
}
