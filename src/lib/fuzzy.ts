// Small, dependency-free fuzzy matcher tuned for short food names.

const IRREGULAR: Record<string, string> = {
  fries: 'fry',
  potatoes: 'potato',
  tomatoes: 'tomato',
  leaves: 'leaf',
  loaves: 'loaf',
  knives: 'knife',
  halves: 'half',
  dishes: 'dish',
  sandwiches: 'sandwich',
  peaches: 'peach',
  radishes: 'radish',
  boxes: 'box',
  mangoes: 'mango',
  tacos: 'taco',
  burritos: 'burrito',
  nachos: 'nacho',
  greens: 'green',
  oats: 'oat',
  grits: 'grit',
};

// Words that end in "s" but aren't plurals.
const KEEP = new Set([
  'hummus',
  'couscous',
  'asparagus',
  'swiss',
  'bus',
  'glass',
  'citrus',
  'molasses',
  'brussels',
  'tso',
  'tsos',
  'is',
  'as',
  'plus',
  'gas',
  'less',
  'pancreas',
]);

export function singular(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 3 || KEEP.has(w)) return w;
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y'; // berries → berry
  if (/(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2); // lunches → lunch
  if (w.endsWith('ss') || w.endsWith('us')) return w;
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents (phở → pho)
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokens(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(' ').map(singular) : [];
}

/** Damerau-Levenshtein (optimal string alignment) distance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Similarity of two single tokens in [0, 1]. */
export function tokenSim(q: string, t: string): number {
  if (q === t) return 1;
  // Prefix typing ("broc" → "broccoli"), needs 3+ chars.
  if (q.length >= 3 && t.startsWith(q)) return 0.75 + 0.2 * (q.length / t.length);
  if (t.length >= 4 && q.startsWith(t)) return 0.8;
  const dist = editDistance(q, t);
  const maxLen = Math.max(q.length, t.length);
  // Allow 1 typo for 4+ letters, 2 for 7+, 3 for 11+.
  const allowed = maxLen >= 11 ? 3 : maxLen >= 7 ? 2 : maxLen >= 4 ? 1 : 0;
  if (dist <= allowed) return 0.92 - (0.12 * dist) / allowed;
  return Math.max(0, 1 - dist / maxLen) * 0.5;
}

/**
 * Score how well query tokens match a name's tokens (0..1).
 * Mostly rewards covering the query; lightly penalizes extra name words.
 */
export function phraseScore(q: string[], name: string[]): number {
  if (!q.length || !name.length) return 0;
  let cover = 0;
  for (const qt of q) {
    let best = 0;
    for (const nt of name) best = Math.max(best, tokenSim(qt, nt));
    cover += best;
  }
  cover /= q.length;
  let reverse = 0;
  for (const nt of name) {
    let best = 0;
    for (const qt of q) best = Math.max(best, tokenSim(qt, nt));
    reverse += best;
  }
  reverse /= name.length;
  // Whole-string exact match bonus.
  const exact = q.join(' ') === name.join(' ') ? 0.05 : 0;
  return Math.min(1, cover * 0.8 + reverse * 0.2 + exact);
}

export interface Named {
  name: string;
  aliases: string[];
}

export function bestNameScore(q: string[], item: Named): number {
  let best = phraseScore(q, tokens(item.name));
  for (const a of item.aliases) best = Math.max(best, phraseScore(q, tokens(a)));
  return best;
}
