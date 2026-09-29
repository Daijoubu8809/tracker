// Parse OCR text of a US "Nutrition Facts" panel. Pure function, never throws.
//
// Real-world OCR mess this handles (seen in actual Tesseract output):
//  - "g" read as "9": "Total Fat 79" (7g), "Protein 49" (4g), "(409)" (40g)
//  - letter/digit swaps: O↔0, l/I/|↔1, S↔5, B↔8 ("Omg", "<lg", "Bmg")
//  - missing/extra spaces ("TotalFat8g"), "Calories" and its number on separate lines
//  - % Daily Value numbers next to grams (never taken as grams)
//  - dual-column labels (per serving | per container): the first amount is per serving
//  - "<1g" → 0.5, "0g" → 0
// Ambiguous readings are resolved with FDA rounding rules and the calorie math
// (4·protein + 4·carbs + 9·fat ≈ calories); anything still doubtful is flagged.

export type LabelField =
  | 'calories'
  | 'totalFat'
  | 'satFat'
  | 'transFat'
  | 'cholesterol'
  | 'sodium'
  | 'totalCarb'
  | 'fiber'
  | 'totalSugars'
  | 'addedSugars'
  | 'protein';

export const LABEL_FIELDS: readonly LabelField[] = [
  'calories',
  'totalFat',
  'satFat',
  'transFat',
  'cholesterol',
  'sodium',
  'totalCarb',
  'fiber',
  'totalSugars',
  'addedSugars',
  'protein',
];

export const FIELD_LABEL: Record<LabelField, string> = {
  calories: 'Calories',
  totalFat: 'Total fat',
  satFat: 'Saturated fat',
  transFat: 'Trans fat',
  cholesterol: 'Cholesterol',
  sodium: 'Sodium',
  totalCarb: 'Total carbohydrate',
  fiber: 'Dietary fiber',
  totalSugars: 'Total sugars',
  addedSugars: 'Added sugars',
  protein: 'Protein',
};

export const FIELD_UNIT: Record<LabelField, '' | 'g' | 'mg'> = {
  calories: '',
  totalFat: 'g',
  satFat: 'g',
  transFat: 'g',
  cholesterol: 'mg',
  sodium: 'mg',
  totalCarb: 'g',
  fiber: 'g',
  totalSugars: 'g',
  addedSugars: 'g',
  protein: 'g',
};

export type CheckKey = LabelField | 'servingSize' | 'servingsPerContainer';

export interface ParsedLabel {
  productName: string | null;
  servingSizeText: string | null;
  servingSizeG: number | null;
  servingSizeMl: number | null;
  servingsPerContainer: number | null;
  values: Partial<Record<LabelField, number>>;
  /** Fields to double-check, with a short reason ("Check this"). */
  check: Partial<Record<CheckKey, string>>;
  /** Result of the 4·P + 4·C + 9·F vs calories comparison (null if not enough data). */
  calorieCheck: { fromMacros: number; stated: number; ok: boolean } | null;
  /** How many of the 11 nutrient fields were found. */
  found: number;
  /** Enough to be worth reviewing (calories, or at least two of fat/carbs/protein). */
  usable: boolean;
}

// ---------- Fuzzy keywords ----------

/** OCR-confusable characters per letter. */
const CONFUSE: Record<string, string> = {
  o: 'o0',
  i: 'il1|!',
  l: 'li1|!',
  s: 's5$',
  b: 'b8',
  g: 'g9q',
  e: 'ec',
  a: 'a',
  r: 'rn',
  t: 't+',
};

function esc(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "total fat" → regex that tolerates confusions and missing/extra spaces between letters. */
function fuzzy(phrase: string): string {
  const out: string[] = [];
  for (const ch of phrase.toLowerCase()) {
    if (ch === ' ') {
      out.push('\\s*');
      continue;
    }
    const alts = CONFUSE[ch];
    out.push(alts ? `[${[...alts].map(esc).join('')}]` : esc(ch));
    out.push(' ?');
  }
  return out.join('');
}

interface KeywordDef {
  field: LabelField | 'servingSize' | 'servingsPerContainer';
  re: RegExp;
}

const K = (field: KeywordDef['field'], ...phrases: string[]): KeywordDef => ({
  field,
  re: new RegExp(phrases.map((p) => (p.startsWith('re:') ? p.slice(3) : fuzzy(p))).join('|'), 'gi'),
});

const KEYWORDS: KeywordDef[] = [
  K('servingSize', 'serving size', 're:serv\\.?\\s*size'),
  K('servingsPerContainer', 'servings per container', 'servings per package', 'servings per pack'),
  K('calories', 'calories', 'calorie', 're:kcal'),
  K('satFat', 'saturated fat', 're:sat\\.?\\s*fat'),
  K('transFat', 'trans fat'),
  K('totalFat', 'total fat'),
  K('cholesterol', 'cholesterol', 're:cholest\\.?'),
  K('sodium', 'sodium'),
  K('totalCarb', 'total carbohydrate', 'total carbohydrates', 'total carb', 're:total\\s*carbs?\\.?'),
  K('fiber', 'dietary fiber', 'fiber', 'fibre'),
  K('addedSugars', 'added sugars', 'added sugar'),
  K('totalSugars', 'total sugars', 'total sugar', 'sugars'),
  K('protein', 'protein'),
];

interface Hit {
  field: KeywordDef['field'];
  start: number;
  end: number;
}

/** All keyword hits, keeping the longest where they overlap ("Total Sugars" beats "Sugars"). */
function findHits(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const k of KEYWORDS) {
    k.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = k.re.exec(text))) {
      if (m[0].length === 0) {
        k.re.lastIndex++;
        continue;
      }
      hits.push({ field: k.field, start: m.index, end: m.index + m[0].length });
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const kept: Hit[] = [];
  for (const h of hits) {
    const overlap = kept.find((k) => h.start < k.end && k.start < h.end);
    if (!overlap) kept.push(h);
    else if (h.end - h.start > overlap.end - overlap.start) kept.splice(kept.indexOf(overlap), 1, h);
  }
  return kept.sort((a, b) => a.start - b.start);
}

// ---------- Amounts ----------

type Source = 'unit' | 'strip9' | 'nounit' | 'lt' | 'partial';

interface Reading {
  value: number;
  source: Source;
  raw: string;
}

const DIGITISH = '0-9OoIl|SB';
const AMOUNT_RE = new RegExp(
  `(<\\s*)?(?<![A-Za-z])([${DIGITISH}]{1,5}(?:[.,][${DIGITISH}]{1,3})?\\.?)\\s?(mcg|mg|m9|mq|rng|ng|g|q)?(?![A-Za-z])(\\s*(?:%|°\\/o|o\\/o))?`,
  'g',
);

function toDigits(s: string): string {
  return s.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
}

function toNumber(token: string): number | null {
  let t = toDigits(token).replace(/\.$/, '');
  // "1,200" is a thousands separator; "2,5" a decimal comma.
  t = /,\d{3}$/.test(t) ? t.replace(',', '') : t.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Candidate readings for the first amount in a segment (DV percentages skipped). */
function readAmounts(segment: string): Reading[] {
  AMOUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_RE.exec(segment))) {
    const [raw, lt, tok, unit, pct] = m;
    if (!tok) continue;
    if (pct) continue; // % Daily Value
    const hasRealDigit = /\d/.test(tok);
    if (!hasRealDigit) {
      // All-letter readings ("Og", "SB" for 58) only right after the keyword, never mid-text.
      const before = segment.slice(0, m.index).replace(/[\s:.]/g, '');
      if ((!unit && before !== '') || tok.length > 3) continue;
    }
    const n = toNumber(tok);
    if (n == null) continue;
    // "<1g" → 0.5; "<5mg" (cholesterol) → 2; other "<n" → half of n.
    if (lt) return [{ value: n <= 1 ? 0.5 : n === 5 ? 2 : n / 2, source: 'lt', raw: raw.trim() }];
    const partial = /\.$/.test(tok);
    if (unit) return [{ value: n, source: partial ? 'partial' : 'unit', raw: raw.trim() }];
    // No unit: a trailing 9 is very often a misread "g".
    const digits = toDigits(tok);
    const out: Reading[] = [];
    // "79" → 7g, "2.59" → 2.5g
    if (/^(\d+|\d+\.\d)9$/.test(digits.replace(',', '.'))) {
      out.push({ value: Number(digits.replace(',', '.').slice(0, -1)), source: 'strip9', raw: raw.trim() });
    }
    out.push({ value: n, source: partial ? 'partial' : 'nounit', raw: raw.trim() });
    return out;
  }
  return [];
}

// ---------- FDA rounding rules (21 CFR 101.9) ----------

export function fitsRounding(field: LabelField, v: number): boolean {
  if (v < 0) return false;
  const mult = (x: number, step: number) => Math.abs(x / step - Math.round(x / step)) < 1e-9;
  switch (field) {
    case 'calories':
      return v === 0 || (v <= 50 ? mult(v, 5) : mult(v, 10));
    case 'totalFat':
    case 'satFat':
    case 'transFat':
      return v === 0 || (v < 5 ? mult(v, 0.5) : mult(v, 1));
    case 'cholesterol':
      return v === 0 || mult(v, 5) || v === 2;
    case 'sodium':
      return v === 0 || (v <= 140 ? mult(v, 5) : mult(v, 10));
    default:
      return v === 0.5 || mult(v, 1); // carbs, fiber, sugars, protein: whole grams (or "<1g")
  }
}

const MAX: Record<LabelField, number> = {
  calories: 2000,
  totalFat: 120,
  satFat: 60,
  transFat: 20,
  cholesterol: 1500,
  sodium: 6000,
  totalCarb: 250,
  fiber: 60,
  totalSugars: 200,
  addedSugars: 200,
  protein: 120,
};

function score(field: LabelField, r: Reading): number {
  // Calories are printed without a unit, so a bare number is the normal case there.
  let s = field === 'calories' && r.source === 'nounit' ? 4 : { unit: 4, lt: 4, strip9: 3, nounit: 2, partial: 1 }[r.source];
  if (!fitsRounding(field, r.value)) s -= 2;
  if (r.value > MAX[field]) s -= 5;
  return s;
}

// ---------- Segments ----------

const NUMBERISH_LINE = /^[\s<\d.,OoIl|SBgm%()]*\d[\s<\d.,OoIl|SBgm%()]*$/;

function lineEnd(text: string, from: number): number {
  const i = text.indexOf('\n', from);
  return i === -1 ? text.length : i;
}

/** Text after a keyword to read its amount from: rest of the line (up to the next keyword). */
function segmentAfter(text: string, hit: Hit, next: Hit | undefined, allowNextLine: boolean): string {
  const eol = lineEnd(text, hit.end);
  let seg = text.slice(hit.end, next && next.start < eol ? next.start : eol);
  if (allowNextLine && !/\d/.test(toDigits(seg).replace(/%/g, ''))) {
    const nl = text.slice(eol + 1, lineEnd(text, eol + 1));
    if (NUMBERISH_LINE.test(nl) && (!next || next.start > eol + nl.length)) seg += ' ' + nl;
  }
  return seg;
}

function lineOf(text: string, pos: number): string {
  const s = text.lastIndexOf('\n', pos - 1) + 1;
  return text.slice(s, lineEnd(text, pos));
}

// ---------- Main ----------

function emptyResult(): ParsedLabel {
  return {
    productName: null,
    servingSizeText: null,
    servingSizeG: null,
    servingSizeMl: null,
    servingsPerContainer: null,
    values: {},
    check: {},
    calorieCheck: null,
    found: 0,
    usable: false,
  };
}

/**
 * Parse one or more OCR passes of the same label. Readings from all passes are pooled
 * and the most plausible one per field wins. Never throws.
 */
export function parseNutritionLabel(input: string | readonly string[]): ParsedLabel {
  try {
    return parseInner(typeof input === 'string' ? [input] : input);
  } catch {
    return emptyResult();
  }
}

function parseInner(passes: readonly string[]): ParsedLabel {
  const res = emptyResult();
  const readings: Partial<Record<LabelField, Reading[][]>> = {};
  const servingTexts: string[] = [];
  const perContainer: number[] = [];

  for (const rawText of passes) {
    if (typeof rawText !== 'string' || !rawText.trim()) continue;
    const text = rawText.replace(/\r/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\t/g, ' ').slice(0, 20000);
    const hits = findHits(text);

    // Product name: a wordy line before "Nutrition Facts".
    if (!res.productName) res.productName = productName(text);

    // "About 8 servings per container" (number before the keyword).
    for (const m of text.matchAll(/(?:about\s*)?([\dOoIlSB]{1,3}(?:[.,]\d)?)\s*servings?\s*per\s*(?:container|package|pack)/gi)) {
      const n = toNumber(m[1]);
      if (n != null && n > 0 && n < 200) perContainer.push(n);
    }
    // "Includes 10g Added Sugars" (amount before the keyword).
    for (const m of text.matchAll(new RegExp(`(?:${fuzzy('includes')}|${fuzzy('incl')}\\.?)\\s*([^\\n]{0,12}?)\\s*${fuzzy('added sugar')}`, 'gi'))) {
      const r = readAmounts(m[1]);
      if (r.length) (readings.addedSugars ??= []).push(r);
    }

    hits.forEach((hit, i) => {
      const next = hits[i + 1];
      const line = lineOf(text, hit.start);
      if (hit.field === 'servingSize') {
        const seg = segmentAfter(text, hit, next, true).replace(/^[\s:.-]+/, '').trim();
        if (seg) servingTexts.push(seg);
        return;
      }
      if (hit.field === 'servingsPerContainer') {
        const r = readAmounts(text.slice(hit.end, lineEnd(text, hit.end)).replace(/about/i, ''));
        const v = r.find((x) => x.source !== 'strip9') ?? r[0];
        if (v && v.value > 0 && v.value < 200) perContainer.push(v.value);
        return;
      }
      const field = hit.field;
      if (field === 'calories') {
        // Skip footnotes ("2,000 calories a day…") and old "Calories from Fat".
        if (/diet|a\s*day|2[,.]?000|per\s*gram|from\s*fat/i.test(line)) return;
      }
      if (field === 'addedSugars' && new RegExp(fuzzy('incl'), 'i').test(line.slice(0, hit.start - text.lastIndexOf('\n', hit.start - 1) - 1))) {
        return; // handled by the "Includes … Added Sugars" pattern above
      }
      const seg = segmentAfter(text, hit, next, true);
      const r = readAmounts(seg);
      if (r.length) (readings[field] ??= []).push(r);
    });
  }

  // Serving size text + grams/ml
  const ss = servingTexts.find((t) => /\d/.test(toDigits(t))) ?? servingTexts[0];
  if (ss) {
    const { text, g, ml, guessed } = parseServing(ss);
    res.servingSizeText = text;
    res.servingSizeG = g;
    res.servingSizeMl = ml;
    if (guessed) res.check.servingSize = `Read as “${ss.trim()}”`;
  }
  if (perContainer.length) res.servingsPerContainer = perContainer[0];

  // Best reading per field
  const options: Partial<Record<LabelField, Reading[]>> = {};
  for (const f of LABEL_FIELDS) {
    const groups = readings[f];
    if (!groups?.length) continue;
    // Drop impossible readings (e.g. a misread "10%" → "1096" g of fat).
    const all = groups.flat().filter((r) => r.value <= MAX[f]);
    if (!all.length) continue;
    const byValue = new Map<number, Reading>();
    for (const r of all) {
      const cur = byValue.get(r.value);
      if (!cur || score(f, r) > score(f, cur)) byValue.set(r.value, r);
    }
    options[f] = [...byValue.values()].sort((a, b) => score(f, b) - score(f, a));
  }
  const chosen: Partial<Record<LabelField, Reading>> = {};
  for (const f of LABEL_FIELDS) if (options[f]?.length) chosen[f] = options[f]![0];

  // Sub-amounts can't exceed their totals: use that to pick between readings.
  const within = (child: LabelField, parent: LabelField) => {
    const c = chosen[child];
    const p = chosen[parent];
    if (!c || !p || c.value <= p.value) return;
    const alt = options[child]!.find((r) => r.value <= p.value);
    if (alt) chosen[child] = alt;
  };
  within('satFat', 'totalFat');
  within('transFat', 'totalFat');
  within('fiber', 'totalCarb');
  within('totalSugars', 'totalCarb');
  within('addedSugars', 'totalSugars');

  // Calorie math: choose the combination of readings that best explains the calories.
  const macroFields = ['totalFat', 'totalCarb', 'protein'] as const;
  if (options.calories && macroFields.every((f) => options[f])) {
    let best: { err: number; sc: number; pick: Record<string, Reading> } | null = null;
    for (const cal of options.calories.slice(0, 3))
      for (const fat of options.totalFat!.slice(0, 3))
        for (const carb of options.totalCarb!.slice(0, 3))
          for (const prot of options.protein!.slice(0, 3)) {
            const est = 9 * fat.value + 4 * carb.value + 4 * prot.value;
            const err = Math.abs(est - cal.value) / Math.max(cal.value, 40);
            const sc = score('calories', cal) + score('totalFat', fat) + score('totalCarb', carb) + score('protein', prot);
            const bucket = err <= 0.2 ? 0 : 1;
            if (!best || bucket < (best.err <= 0.2 ? 0 : 1) || (bucket === (best.err <= 0.2 ? 0 : 1) && (sc > best.sc || (sc === best.sc && err < best.err)))) {
              best = { err, sc, pick: { calories: cal, totalFat: fat, totalCarb: carb, protein: prot } };
            }
          }
    if (best) Object.assign(chosen, best.pick);
  }

  // Values + confidence notes
  for (const f of LABEL_FIELDS) {
    const r = chosen[f];
    if (!r) continue;
    res.values[f] = r.value;
    const unit = FIELD_UNIT[f];
    const shown = `${r.value}${unit ? ' ' + unit : ''}`;
    if (r.source === 'strip9') res.check[f] = `Read “${r.raw}” as ${shown}`;
    else if (r.source === 'nounit' && f !== 'calories') res.check[f] = `No unit next to “${r.raw}”`;
    else if (r.source === 'partial') res.check[f] = `Only partly readable (“${r.raw}”)`;
    else if (!fitsRounding(f, r.value)) res.check[f] = `${shown} is unusual for a label`;
    else if (options[f]!.some((o) => o !== r && (o.source === 'unit' || o.source === 'lt') && o.value !== r.value)) {
      res.check[f] = 'Two different readings';
    }
  }

  // Sanity check with the chosen values
  const { calories: cal, totalFat: fat, totalCarb: carb, protein: prot } = res.values;
  if (cal != null && fat != null && carb != null && prot != null) {
    const fromMacros = Math.round(9 * fat + 4 * carb + 4 * prot);
    const ok = Math.abs(fromMacros - cal) <= Math.max(0.2 * cal, 15);
    res.calorieCheck = { fromMacros, stated: cal, ok };
    if (ok) {
      // The math confirms these four, so a guessed "g"→"9" reading there is no longer doubtful.
      for (const f of ['calories', 'totalFat', 'totalCarb', 'protein'] as const) {
        if (chosen[f]?.source === 'strip9') delete res.check[f];
      }
    } else {
      const why = `Calories don’t add up: 4×protein + 4×carbs + 9×fat ≈ ${fromMacros} kcal vs ${cal} on the label`;
      // Blame fields whose other readings would fix the math; otherwise flag all four.
      const suspects = (['calories', 'totalFat', 'totalCarb', 'protein'] as const).filter((f) =>
        (options[f] ?? []).some((o) => {
          if (o.value === res.values[f]) return false;
          const v = { ...res.values, [f]: o.value };
          const est = 9 * v.totalFat! + 4 * v.totalCarb! + 4 * v.protein!;
          return Math.abs(est - v.calories!) <= Math.max(0.2 * v.calories!, 15);
        }),
      );
      for (const f of suspects.length ? suspects : (['calories', 'totalFat', 'totalCarb', 'protein'] as const)) res.check[f] = why;
    }
  }

  for (const f of ['calories', 'totalFat', 'totalCarb', 'protein'] as const) {
    if (res.values[f] == null) res.check[f] = 'Not found — enter it from the label';
  }
  res.found = LABEL_FIELDS.filter((f) => res.values[f] != null).length;
  const macros = (['totalFat', 'totalCarb', 'protein'] as const).filter((f) => res.values[f] != null).length;
  res.usable = res.values.calories != null || macros >= 2;
  return res;
}

function parseServing(raw: string): { text: string; g: number | null; ml: number | null; guessed: boolean } {
  let text = raw.replace(/\s+/g, ' ').trim().slice(0, 60);
  let g: number | null = null;
  let ml: number | null = null;
  let guessed = false;
  const unitM = text.match(/\(?\s*([\dOoIlSB]{1,4}(?:[.,]\d)?)\s*(grams?|gr|g|ml|mL|ML)(?![A-Za-z])\s*\)?/);
  if (unitM) {
    const n = toNumber(unitM[1]);
    if (n != null) {
      if (/^m/i.test(unitM[2])) ml = n;
      else g = n;
    }
  } else {
    // "(409)" → "(40g)": a parenthesized number ending in 9 with no unit.
    const p = text.match(/\(\s*([\dOoIlSB]{2,5})\s*\)/);
    if (p) {
      const d = toDigits(p[1]);
      if (/9$/.test(d)) {
        g = Number(d.slice(0, -1));
        text = text.replace(p[0], `(${g}g)`);
        guessed = true;
      } else {
        g = Number(d);
        guessed = true;
      }
    }
  }
  return { text, g, ml, guessed };
}

function productName(text: string): string | null {
  const lines = text.split('\n').map((l) => l.trim());
  const nf = lines.findIndex((l) => new RegExp(fuzzy('nutrition'), 'i').test(l));
  if (nf <= 0) return null;
  const candidates = lines
    .slice(Math.max(0, nf - 4), nf)
    .filter((l) => l.length >= 3 && l.length <= 60)
    .filter((l) => (l.match(/[A-Za-z]/g)?.length ?? 0) / l.replace(/\s/g, '').length > 0.7)
    .filter((l) => !/facts|serving|calories/i.test(l));
  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.length - a.length)[0].replace(/\s{2,}/g, ' ');
}

/** Totals for a number of servings eaten, rounded for display/logging (kcal whole, grams 0.1). */
export function scaleServings(values: Partial<Record<LabelField, number>>, servings: number): Partial<Record<LabelField, number>> {
  const out: Partial<Record<LabelField, number>> = {};
  for (const f of LABEL_FIELDS) {
    const v = values[f];
    if (v == null) continue;
    out[f] = f === 'calories' || FIELD_UNIT[f] === 'mg' ? Math.round(v * servings) : Math.round(v * servings * 10) / 10;
  }
  return out;
}
