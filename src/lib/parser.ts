// Local quick-text parser: "half plate fried rice, palm of orange chicken, fist broccoli, 2 cookies"
// → a list of items with a matched food and a portion. No network needed.

import { normalize as normalizeName } from './fuzzy';
import { searchFoods, type FoodRecord } from './foods';
import { defaultSpec, describePortion, gramsPerUnit, itemFromFood } from './portions';
import type { LoggedItem, PortionRefs, PortionSpec, PortionUnit, SizeMod } from './types';

export type ParseStatus = 'ok' | 'check' | 'unmatched';

export interface ParsedItem {
  /** The text this item came from. */
  raw: string;
  /** Leftover words used to find the food. */
  query: string;
  status: ParseStatus;
  food: FoodRecord | null;
  spec: PortionSpec | null;
  item: LoggedItem | null;
  score: number;
  suggestions: FoodRecord[];
  warning: string | null;
}

// ---------- Vocabulary ----------

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2',
  '¼': '1/4',
  '¾': '3/4',
  '⅓': '1/3',
  '⅔': '2/3',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  single: 1,
  two: 2,
  pair: 2,
  couple: 2,
  double: 2,
  three: 3,
  few: 3,
  several: 3,
  triple: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  dozen: 12,
};

const FRACTION_WORDS: Record<string, number> = {
  half: 0.5,
  halves: 0.5,
  halfs: 0.5,
  quarter: 0.25,
  quarters: 0.25,
  third: 1 / 3,
  thirds: 1 / 3,
};

const SIZE_WORDS: Record<string, SizeMod> = {
  small: 'small',
  smaller: 'small',
  little: 'small',
  mini: 'small',
  light: 'small',
  modest: 'small',
  normal: 'normal',
  regular: 'normal',
  medium: 'normal',
  standard: 'normal',
  average: 'normal',
  large: 'large',
  big: 'large',
  bigger: 'large',
  generous: 'large',
  hearty: 'large',
  heaping: 'heaping',
  heaped: 'heaping',
  heapin: 'heaping',
  overflowing: 'heaping',
  loaded: 'heaping',
  piled: 'heaping',
  huge: 'heaping',
  massive: 'heaping',
  giant: 'heaping',
};

/** Unit word → [unit, multiplier]. */
const UNIT_WORDS: Record<string, [PortionUnit, number]> = {
  plate: ['plate', 1],
  plates: ['plate', 1],
  plateful: ['plate', 1],
  platefuls: ['plate', 1],
  palm: ['palm', 1],
  palms: ['palm', 1],
  palmful: ['palm', 1],
  fist: ['fist', 1],
  fists: ['fist', 1],
  fistful: ['fist', 1],
  handful: ['cupped_hand', 1],
  handfuls: ['cupped_hand', 1],
  hand: ['cupped_hand', 1],
  hands: ['cupped_hand', 1],
  thumb: ['thumb', 1],
  thumbs: ['thumb', 1],
  scoop: ['scoop', 1],
  scoops: ['scoop', 1],
  spoon: ['scoop', 1],
  spoons: ['scoop', 1],
  spoonful: ['scoop', 1],
  spoonfuls: ['scoop', 1],
  ladle: ['ladle', 1],
  ladles: ['ladle', 1],
  ladleful: ['ladle', 1],
  bowl: ['bowl', 1],
  bowls: ['bowl', 1],
  bowlful: ['bowl', 1],
  clamshell: ['clamshell', 1],
  clamshells: ['clamshell', 1],
  clam: ['clamshell', 1],
  togo: ['clamshell', 1],
  box: ['clamshell', 1],
  slice: ['slice', 1],
  slices: ['slice', 1],
  piece: ['piece', 1],
  pieces: ['piece', 1],
  pc: ['piece', 1],
  pcs: ['piece', 1],
  serving: ['serving', 1],
  servings: ['serving', 1],
  can: ['serving', 1],
  cans: ['serving', 1],
  bottle: ['serving', 1],
  bottles: ['serving', 1],
  packet: ['serving', 1],
  packets: ['serving', 1],
  pack: ['serving', 1],
  package: ['serving', 1],
  cup: ['cup', 1],
  cups: ['cup', 1],
  c: ['cup', 1],
  glass: ['cup', 1],
  glasses: ['cup', 1],
  mug: ['cup', 1.5],
  mugs: ['cup', 1.5],
  tbsp: ['tbsp', 1],
  tbs: ['tbsp', 1],
  tbl: ['tbsp', 1],
  tablespoon: ['tbsp', 1],
  tablespoons: ['tbsp', 1],
  tsp: ['tsp', 1],
  teaspoon: ['tsp', 1],
  teaspoons: ['tsp', 1],
  oz: ['oz', 1],
  ounce: ['oz', 1],
  ounces: ['oz', 1],
  g: ['g', 1],
  gram: ['g', 1],
  grams: ['g', 1],
  gr: ['g', 1],
  lb: ['oz', 16],
  lbs: ['oz', 16],
  pound: ['oz', 16],
  pounds: ['oz', 16],
};

/** Two-word unit phrases, joined before tokenizing. */
const UNIT_PHRASES: [RegExp, string][] = [
  [/\bcupped hands?\b/g, 'handful'],
  [/\bto[ -]?go (box|container|clamshell)(es|s)?\b/g, 'clamshell'],
  [/\btake[ -]?out (box|container)(es|s)?\b/g, 'clamshell'],
  [/\bserving spoons?\b/g, 'scoop'],
  [/\bfl oz\b/g, 'floz'],
];

const STOPWORDS = new Set(['of', 'the', 'some', 'my', 'about', 'around', 'approx', 'approximately', 'roughly', 'like', 'ish', 'full', 'whole', 'had', 'ate', 'i', 'just', 'x', 'more', 'also', 'plus', 'extra']);

// ---------- Text helpers ----------

function prep(text: string): string {
  let t = text.toLowerCase();
  // "1½" → "1 1/2", "½" → "1/2"
  t = t.replace(/(\d)([½¼¾⅓⅔⅛⅜⅝⅞])/g, '$1 $2');
  t = t.replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, (m) => ` ${UNICODE_FRACTIONS[m]} `);
  t = t.replace(/&/g, ' and ');
  t = t.replace(/[’']/g, '');
  t = t.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  // "1 and a half" / "one and a half" → "1.5"
  t = t.replace(/\b(\d+|one|two|three|four)\s+and\s+a\s+half\b/g, (_m, n: string) => String((NUMBER_WORDS[n] ?? Number(n)) + 0.5));
  // "a half" / "half a" keep; "cookie x2" / "2x cookie" → "2 cookie"
  t = t.replace(/\bx\s?(\d+)\b/g, ' $1 ').replace(/\b(\d+)\s?x\b/g, ' $1 ');
  for (const [re, rep] of UNIT_PHRASES) t = t.replace(re, rep);
  return t;
}

/** Food-name phrases containing "and"/"with" that must not be split (mac and cheese, pasta with marinara). */
function protectedPhrases(foods: readonly FoodRecord[]): string[] {
  const out = new Set<string>();
  for (const f of foods) {
    for (const n of [f.name, ...f.aliases]) {
      const norm = normalizeName(n);
      if (/\b(and|with|n)\b/.test(norm)) out.add(norm);
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}

const phraseCache = new WeakMap<readonly FoodRecord[], string[]>();

export function splitItems(text: string, foods: readonly FoodRecord[]): string[] {
  let phrases = phraseCache.get(foods);
  if (!phrases) {
    phrases = protectedPhrases(foods);
    phraseCache.set(foods, phrases);
  }
  let t = prep(text);
  // Collapse punctuation to spaces, keeping "." and "/" only inside numbers (1.5, 1/2).
  t = t.replace(/[\n;|+]/g, ',');
  t = t.replace(/[^a-z0-9,\s./]/g, ' ');
  t = t.replace(/(?<!\d)[./]|[./](?!\d)/g, ' ');
  t = ' ' + t.replace(/,/g, ' , ').replace(/\s+/g, ' ') + ' ';
  for (const p of phrases) {
    t = t.split(` ${p} `).join(` ${p.replace(/ /g, '_')} `);
  }
  const out: string[] = [];
  for (const chunk of t.split(',')) {
    const parts = chunk
      .split(/\b(and|with|then|also)\b/)
      .map((s) => s.replace(/_/g, ' ').trim());
    // parts alternates [text, sep, text, sep, ...]. Re-join "x and y" when that is a
    // better food match than the parts (catches typos like "mac and chese").
    let cur = parts[0] ?? '';
    for (let i = 1; i < parts.length; i += 2) {
      const sep = parts[i];
      const next = parts[i + 1] ?? '';
      const joined = `${cur} ${sep} ${next}`;
      if (cur && next && joinsIntoFood(joined, foods)) {
        cur = joined;
      } else {
        out.push(cur);
        cur = next;
      }
    }
    out.push(cur);
  }
  return out.map((s) => s.trim()).filter((s) => s.length > 0 && /[a-z0-9]/.test(s));
}

function joinsIntoFood(joined: string, foods: readonly FoodRecord[]): boolean {
  const q = extract(joined).words.join(' ');
  const top = searchFoods(q, foods, new Map(), 1)[0];
  if (!top || top.score < 0.9) return false;
  return [top.food.name, ...top.food.aliases].some((n) => /\b(and|with|n)\b/.test(normalizeName(n)));
}

function parseNumber(tok: string): number | null {
  if (/^\d+(\.\d+)?$/.test(tok)) return Number(tok);
  if (/^\.\d+$/.test(tok)) return Number(tok);
  const m = tok.match(/^(\d+)\/(\d+)$/);
  if (m && Number(m[2]) > 0) return Number(m[1]) / Number(m[2]);
  return null;
}

interface Extracted {
  qty: number | null;
  size: SizeMod;
  unit: PortionUnit | null;
  unitWord: string | null;
  unitIndex: number;
  words: string[];
}

function extract(segment: string): Extracted {
  const raw = segment.split(/\s+/).filter(Boolean);
  const toks: string[] = [];
  // Split attached units: "200g" → "200 g", "8oz" → "8 oz", "1.5c" → "1.5 c"
  for (const tok of raw) {
    const m = tok.match(/^(\d+(?:\.\d+)?|\d+\/\d+)(g|gr|grams?|oz|lbs?|c|cups?|tbsp|tsp|pcs?)$/);
    if (m) toks.push(m[1], m[2]);
    else toks.push(tok);
  }

  let num: number | null = null;
  let frac: number | null = null;
  let wordNum: number | null = null;
  let size: SizeMod = 'normal';
  let unit: PortionUnit | null = null;
  let unitWord: string | null = null;
  let unitMult = 1;
  let unitIndex = -1;
  const words: string[] = [];

  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    const n = parseNumber(tok);
    if (n != null) {
      if (num == null) num = n;
      else if (Number.isInteger(num) && n < 1 && /\//.test(tok)) num += n; // "1 1/2"
      continue;
    }
    if (tok in FRACTION_WORDS) {
      frac = (frac ?? 1) * FRACTION_WORDS[tok];
      continue;
    }
    if (tok in NUMBER_WORDS) {
      // "a"/"an" only mean 1 when nothing else gives the amount.
      if (tok === 'a' || tok === 'an') {
        wordNum ??= 1;
      } else if (wordNum == null || wordNum === 1) {
        wordNum = NUMBER_WORDS[tok];
      }
      continue;
    }
    if (tok in SIZE_WORDS) {
      size = SIZE_WORDS[tok];
      continue;
    }
    if (tok === 'floz') {
      if (unit == null) {
        unit = 'cup';
        unitMult = 1 / 8;
        unitWord = 'fl oz';
        unitIndex = words.length;
      }
      continue;
    }
    if (tok in UNIT_WORDS && unit == null) {
      [unit, unitMult] = UNIT_WORDS[tok];
      unitWord = tok;
      unitIndex = words.length;
      continue;
    }
    if (STOPWORDS.has(tok)) continue;
    words.push(tok);
  }

  let qty: number | null = null;
  const base = num ?? (wordNum != null && wordNum !== 1 ? wordNum : null);
  if (base != null && frac != null) qty = base * frac; // "3 quarters", "two thirds"
  else if (frac != null) qty = frac;
  else if (base != null) qty = base;
  else if (wordNum != null) qty = 1;
  if (qty != null) qty *= unitMult;
  else if (unitMult !== 1) qty = unitMult;
  return { qty, size, unit, unitWord, unitIndex, words };
}

/** Pick the portion for a matched food. */
function resolveSpec(food: FoodRecord, ex: Extracted, refs: PortionRefs): { spec: PortionSpec; warning: string | null } {
  const qty = ex.qty ?? 1;
  if (ex.unit) {
    if (gramsPerUnit(food, ex.unit, refs) != null) return { spec: { unit: ex.unit, qty, size: ex.size }, warning: null };
    const fallback = defaultSpec(food, refs, qty);
    fallback.size = ex.size;
    return {
      spec: fallback,
      warning: `“${ex.unitWord}” doesn’t fit ${food.name}; using ${describePortion(fallback, food)}.`,
    };
  }
  // Just a count ("2 cookies", "3 slices" handled above): prefer pieces, then slices, then servings.
  if (ex.qty != null) {
    for (const u of ['piece', 'slice', 'serving'] as const) {
      if (gramsPerUnit(food, u, refs) != null) return { spec: { unit: u, qty, size: ex.size }, warning: null };
    }
  }
  const spec = defaultSpec(food, refs, qty);
  spec.size = ex.size;
  return { spec, warning: null };
}

export const MATCH_OK = 0.8;
export const MATCH_CHECK = 0.62;

export function parseSegment(
  segment: string,
  foods: readonly FoodRecord[],
  refs: PortionRefs,
  boost: ReadonlyMap<string, number> = new Map(),
): ParsedItem {
  const ex = extract(segment);
  const query = ex.words.join(' ');
  let matches = query ? searchFoods(query, foods, boost, 6) : [];
  let usedEx = ex;

  // The unit word may be part of the food name ("burrito bowl", "fruit cup", "hot dog bun").
  if (ex.unitWord && ex.unit) {
    const withUnit = [...ex.words];
    withUnit.splice(ex.unitIndex, 0, ex.unitWord);
    const alt = searchFoods(withUnit.join(' '), foods, boost, 6);
    const best = matches[0]?.score ?? 0;
    const altBest = alt[0]?.score ?? 0;
    if (altBest >= 0.95 && altBest >= best && normalizeName(alt[0].food.name + ' ' + alt[0].food.aliases.join(' ')).includes(ex.unitWord)) {
      matches = alt;
      usedEx = { ...ex, unit: null, unitWord: null, words: withUnit };
    }
  }

  const top = matches[0];
  const suggestions = matches.slice(0, 5).map((m) => m.food);
  if (!top || top.score < MATCH_CHECK) {
    return {
      raw: segment,
      query: usedEx.words.join(' '),
      status: 'unmatched',
      food: null,
      spec: null,
      item: null,
      score: top?.score ?? 0,
      suggestions,
      warning: null,
    };
  }
  const { spec, warning } = resolveSpec(top.food, usedEx, refs);
  const item = itemFromFood(top.food, spec, refs);
  return {
    raw: segment,
    query: usedEx.words.join(' '),
    status: top.score >= MATCH_OK && item ? 'ok' : 'check',
    food: top.food,
    spec,
    item,
    score: top.score,
    suggestions: suggestions.filter((f) => f.id !== top.food.id),
    warning,
  };
}

export function parseQuickText(
  text: string,
  foods: readonly FoodRecord[],
  refs: PortionRefs,
  boost: ReadonlyMap<string, number> = new Map(),
): ParsedItem[] {
  return splitItems(text, foods).map((seg) => parseSegment(seg, foods, refs, boost));
}

/** Rebuild an item after the user changes its food or portion in the preview. */
export function withFood(p: ParsedItem, food: FoodRecord, refs: PortionRefs, spec?: PortionSpec): ParsedItem {
  const nextSpec = spec ?? (p.spec && gramsPerUnit(food, p.spec.unit, refs) != null ? p.spec : defaultSpec(food, refs, p.spec?.qty ?? 1));
  const item = itemFromFood(food, nextSpec, refs);
  return { ...p, food, spec: nextSpec, item, status: item ? 'ok' : 'check', warning: null };
}
