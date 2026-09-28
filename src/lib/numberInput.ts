// Parsing and validation for typed numbers. Pure functions: no rounding, clamping or
// unit conversion happens here — what you type is exactly what gets validated.

export interface NumberRules {
  /** Inclusive range. */
  min?: number;
  max?: number;
  /** Whole numbers only (also switches the keypad to digits). */
  integer?: boolean;
  /** Empty is an error ("Enter a …") instead of meaning "no value". */
  required?: boolean;
  /** Used in messages: "Height should be 120–230 cm". */
  label?: string;
  unit?: string;
  /** Override the out-of-range message. */
  rangeMessage?: string;
  /** Custom parser (e.g. fractions like "1 1/2"); return null if the text isn't a valid amount. */
  parse?: (text: string) => number | null;
}

export interface ParsedNumber {
  /** Parsed value, or null for empty input (or on error). */
  value: number | null;
  /** Calm, human message when the input can't be used; null when fine. */
  error: string | null;
}

/** Plain decimal: "175", "5.", ".5", "0.25", "1,5" (comma decimal). */
const DECIMAL = /^(\d+([.,]\d*)?|[.,]\d+)$/;
const INTEGER = /^\d+$/;

function fmtBound(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function rangeText(rules: NumberRules): string {
  const unit = rules.unit ? ` ${rules.unit}` : '';
  if (rules.min != null && rules.max != null) return `${fmtBound(rules.min)}–${fmtBound(rules.max)}${unit}`;
  if (rules.min != null) return `at least ${fmtBound(rules.min)}${unit}`;
  if (rules.max != null) return `at most ${fmtBound(rules.max)}${unit}`;
  return '';
}

export function parseNumberInput(text: string, rules: NumberRules = {}): ParsedNumber {
  const t = text.trim();
  const label = rules.label ?? 'This';
  if (t === '') {
    return rules.required ? { value: null, error: `Enter ${rules.label ? rules.label.toLowerCase() : 'a number'}.` } : { value: null, error: null };
  }
  let n: number | null;
  if (rules.parse) n = rules.parse(t);
  else if (rules.integer) n = INTEGER.test(t) ? Number(t) : null;
  else n = DECIMAL.test(t) ? Number(t.replace(',', '.')) : null;
  if (n == null || !Number.isFinite(n)) {
    return { value: null, error: rules.integer ? `${label} should be a whole number.` : `${label} should be a number.` };
  }
  const outOfRange = (rules.min != null && n < rules.min) || (rules.max != null && n > rules.max);
  if (outOfRange) return { value: null, error: rules.rangeMessage ?? `${label} should be ${rangeText(rules)}.` };
  return { value: n, error: null };
}

/**
 * Show a stored number in a field without changing it: up to `digits` decimals,
 * trailing zeros trimmed. (Display only — the stored value keeps full precision.)
 */
export function formatNumberInput(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '';
  const f = 10 ** digits;
  return String(Math.round(v * f) / f);
}
