// Post-tonal set theory engine using Forte's method (The Structure of Atonal Music, 1973).
// Normal order: smallest span first-to-last; ties broken by first-to-second, then first-to-third, ...
// ("packed to the left"). This differs from Rahn's method for 5-20, 6-Z29, 6-31, 7-Z18, 7-20, 8-26.
(function (root) {
  'use strict';

  // Prime forms in Forte-number order, transcribed from Forte's Appendix 1 table (a = 10, b = 11).
  const TABLE = {
    0: '-',
    1: '0',
    2: '01 02 03 04 05 06',
    3: '012 013 014 015 016 024 025 026 027 036 037 048',
    4: '0123 0124 0134 0125 0126 0127 0145 0156 0167 0235 0135 0236 0136 0237 0146 0157 0347 0147 0148 0158 0246 0247 0257 0248 0268 0358 0258 0369 0137',
    5: '01234 01235 01245 01236 01237 01256 01267 02346 01246 01346 02347 01356 01248 01257 01268 01347 01348 01457 01367 01378 01458 01478 02357 01357 02358 02458 01358 02368 01368 01468 01369 01469 02468 02469 02479 01247 03458 01258',
    6: '012345 012346 012356 012456 012367 012567 012678 023457 012357 013457 012457 012467 013467 013458 012458 014568 012478 012578 013478 014589 023468 012468 023568 013468 013568 013578 013469 013569 013689 013679 013589 024579 023579 013579 02468a 012347 012348 012378 023458 012358 012368 012369 012568 012569 023469 012469 012479 012579 013479 014679',
    7: '0123456 0123457 0123458 0123467 0123567 0123478 0123678 0234568 0123468 0123469 0134568 0123479 0124568 0123578 0124678 0123569 0124569 0123589 0123679 0124789 0124589 0125689 0234579 0123579 0234679 0134579 0124579 0135679 0124679 0124689 0134679 0134689 012468a 013468a 013568a 0123568 0134578 0124578',
    8: '01234567 01234568 01234569 01234578 01234678 01235678 01234589 01234789 01236789 02345679 01234579 01345679 01234679 01245679 01234689 01235789 01345689 01235689 01245689 01245789 0123468a 0123568a 0123578a 0124568a 0124678a 0124579a 0124578a 0134679a 01235679',
    9: '012345678 012345679 012345689 012345789 012346789 01234568a 01234578a 01234678a 01235678a 01234679a 01235679a 01245689a',
    10: '0123456789 012345678a 012345679a 012345689a 012345789a 012346789a',
    11: '0123456789a',
    12: '0123456789ab',
  };

  const mod12 = (x) => ((x % 12) + 12) % 12;
  const key = (pcs) => pcs.map((x) => x.toString(16)).join('') || '-';
  const fromKey = (k) => (k === '-' ? [] : [...k].map((c) => parseInt(c, 16)));
  const uniqSorted = (pcs) => [...new Set(pcs.map(mod12))].sort((a, b) => a - b);
  const zeroed = (ord) => ord.map((x) => mod12(x - ord[0]));
  const sameSet = (a, b) => key(uniqSorted(a)) === key(uniqSorted(b));

  // Indices to compare, in Forte's order: last, then 2nd, 3rd, ...
  function forteOrder(n) {
    const order = [n - 1];
    for (let j = 1; j < n - 1; j++) order.push(j);
    return order;
  }

  // -1 if a is better packed than b, 1 if worse, 0 if tied (a, b are orderings of equal length).
  function compare(a, b) {
    for (const j of forteOrder(a.length)) {
      const da = mod12(a[j] - a[0]), db = mod12(b[j] - b[0]);
      if (da !== db) return da < db ? -1 : 1;
    }
    return 0;
  }

  function normalForm(pcs) {
    const s = uniqSorted(pcs);
    let best = s;
    for (let i = 1; i < s.length; i++) {
      const r = [...s.slice(i), ...s.slice(0, i)];
      if (compare(r, best) < 0) best = r;
    }
    return best;
  }

  function primeForm(pcs) {
    const s = uniqSorted(pcs);
    if (!s.length) return [];
    const a = zeroed(normalForm(s));
    const b = zeroed(normalForm(s.map((x) => -x)));
    return compare(a, b) <= 0 ? a : b;
  }

  const transpose = (pcs, n) => pcs.map((x) => mod12(x + n));
  const invert = (pcs, n = 0) => pcs.map((x) => mod12(n - x));
  const multiply = (pcs, m) => pcs.map((x) => mod12(x * m));
  const complement = (pcs) => {
    const s = new Set(pcs.map(mod12));
    return [...Array(12).keys()].filter((x) => !s.has(x));
  };

  function intervalVector(pcs) {
    const s = uniqSorted(pcs), v = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < s.length; i++)
      for (let j = i + 1; j < s.length; j++) {
        const d = s[j] - s[i];
        v[Math.min(d, 12 - d) - 1]++;
      }
    return v;
  }

  // Build the catalog: prime key -> entry.
  const byPrime = {}, byName = {}, list = [];
  for (const [card, row] of Object.entries(TABLE)) {
    row.split(' ').forEach((k, i) => {
      const e = { card: +card, ordinal: i + 1, prime: fromKey(k), key: k };
      e.vector = intervalVector(e.prime);
      byPrime[k] = e;
      list.push(e);
    });
  }
  for (const e of list) {
    const vk = e.vector.join('');
    e.zPartner = list.find((o) => o !== e && o.card === e.card && o.vector.join('') === vk) || null;
    e.name = `${e.card}-${e.zPartner ? 'Z' : ''}${e.ordinal}`;
    byName[e.name] = e;
    byName[`${e.card}-${e.ordinal}`] = e;
  }
  for (const e of list) {
    e.complement = byPrime[key(primeForm(complement(e.prime)))];
    e.mPartner = byPrime[key(primeForm(multiply(e.prime, 5)))];
    // Forte's invariance vector: how many Tn, TnI, TnM, TnMI map the set onto itself (A-D)
    // or into its complement (E-H).
    const comp = complement(e.prime);
    const maps = [(n) => transpose(e.prime, n), (n) => invert(e.prime, n),
      (n) => transpose(multiply(e.prime, 5), n), (n) => transpose(multiply(e.prime, 7), n)];
    const into = (a, b) => a.every((x) => b.includes(x));
    e.invariance = [
      ...maps.map((f) => [...Array(12).keys()].filter((n) => sameSet(f(n), e.prime)).length),
      ...maps.map((f) => (e.card ? [...Array(12).keys()].filter((n) => into(f(n), comp)).length : 0)),
    ];
    // Interval succession around the normal order (Forte's "cycle" column).
    e.cycle = e.prime.length ? e.prime.map((x, i, a) => mod12((a[i + 1] ?? a[0] + 12) - x) || 12) : [];
  }

  function identify(pcs) {
    const s = uniqSorted(pcs);
    const entry = byPrime[key(primeForm(s))];
    // Every Tn / TnI that maps the prime form onto this set.
    const ops = [];
    for (let n = 0; n < 12; n++) {
      if (sameSet(transpose(entry.prime, n), s)) ops.push(`T${n}`);
    }
    for (let n = 0; n < 12; n++) {
      if (sameSet(invert(entry.prime, n), s)) ops.push(`T${n}I`);
    }
    return { pcs: s, normal: normalForm(s), entry, ops };
  }

  // Operations that map set a onto set b.
  function relate(a, b) {
    const ops = [];
    for (let n = 0; n < 12; n++) if (sameSet(transpose(a, n), b)) ops.push(`T${n}`);
    for (let n = 0; n < 12; n++) if (sameSet(invert(a, n), b)) ops.push(`T${n}I`);
    return ops;
  }

  const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const noteValue = (letter, accidentals) => {
    let v = NOTE[letter.toLowerCase()];
    for (const ch of accidentals) v += ch === '#' || ch === '♯' ? 1 : -1;
    return mod12(v);
  };

  // Reads what the user typed, keeping each item's spelling: [{ label, pc }].
  // Anything with a digit is numbers ("0 1 4 6", "014t"; t/a = 10, e/b = 11).
  // Otherwise letters are note names ("abcdefg", "C E G#", "Db F Ab", "DbFAb").
  // In a run-on string a lowercase b is a flat only right after a capital letter (Ab, Bb).
  function parseTokens(text) {
    const raw = text.trim();
    if (!raw) return [];
    if (/\d/.test(raw) || /^[\s,;tTeE]+$/.test(raw)) {
      const t = raw.toLowerCase();
      const tokens = /[\s,;]/.test(t) ? t.split(/[\s,;]+/).filter(Boolean) : [...t];
      return tokens.map((tok) => {
        if (tok === 't' || tok === 'a') return { label: tok.toUpperCase(), pc: 10 };
        if (tok === 'e' || tok === 'b') return { label: tok.toUpperCase(), pc: 11 };
        if (/^\d+$/.test(tok) && +tok < 12) return { label: tok, pc: +tok };
        throw new Error(`Can't read "${tok}". Use 0–11 (t/e for 10/11), or note names like C E G#.`);
      });
    }
    if (/[\s,;]/.test(raw)) {
      return raw.split(/[\s,;]+/).filter(Boolean).map((tok) => {
        const m = tok.match(/^([a-gA-G])([#♯b♭]*)$/);
        if (!m) throw new Error(`Can't read "${tok}" as a note. Try C, F#, Bb or E♭.`);
        return { label: m[1].toUpperCase() + m[2], pc: noteValue(m[1], m[2]) };
      });
    }
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (!/[a-gA-G]/.test(ch)) throw new Error(`Can't read "${ch}" as a note. Try letters like abcdefg, C#, or Bb.`);
      let acc = '';
      while (i + 1 < raw.length && (/[#♯♭]/.test(raw[i + 1]) || (raw[i + 1] === 'b' && /[A-G]/.test(ch) && !acc.includes('#')))) acc += raw[++i];
      out.push({ label: ch.toUpperCase() + acc, pc: noteValue(ch, acc) });
    }
    return out;
  }
  const parse = (text) => uniqSorted(parseTokens(text).map((t) => t.pc));

  const containsAll = (big, small) => small.every((x) => big.includes(x));

  // The Tn and TnI operations that map this exact set onto itself.
  function symmetries(pcs) {
    const s = uniqSorted(pcs), tn = [], tni = [];
    for (let n = 0; n < 12; n++) {
      if (sameSet(transpose(s, n), s)) tn.push(n);
      if (sameSet(invert(s, n), s)) tni.push(n);
    }
    return { tn, tni };
  }

  // All 24 forms of the set: [{ op, n, inverted, pcs }].
  function forms(pcs) {
    const s = uniqSorted(pcs), out = [];
    for (let n = 0; n < 12; n++) out.push({ op: `T${n}`, n, inverted: false, pcs: uniqSorted(transpose(s, n)) });
    for (let n = 0; n < 12; n++) out.push({ op: `T${n}I`, n, inverted: true, pcs: uniqSorted(invert(s, n)) });
    return out;
  }

  // Set classes of every literal subset (cardinality 2 to n-1), with how many times each occurs.
  function subsetClasses(pcs) {
    const s = uniqSorted(pcs), counts = new Map();
    for (let m = 1; m < (1 << s.length) - 1; m++) {
      const sub = s.filter((_, i) => (m >> i) & 1);
      if (sub.length < 2) continue;
      const e = byPrime[key(primeForm(sub))];
      counts.set(e, (counts.get(e) || 0) + 1);
    }
    return [...counts].map(([entry, count]) => ({ entry, count }))
      .sort((a, b) => a.entry.card - b.entry.card || a.entry.ordinal - b.entry.ordinal);
  }

  // Set classes (larger, up to 11 notes) that contain some Tn or TnI form of this set.
  function supersetClasses(pcs) {
    const s = uniqSorted(pcs), fs = forms(s);
    return list.filter((e) => e.card > s.length && e.card < 12 && fs.some((f) => containsAll(e.prime, f.pcs)));
  }

  // Can some Tn or TnI form of `small` be found inside `big`? Returns the first such operation.
  function abstractInclusion(small, big) {
    const f = forms(small).find((x) => containsAll(big, x.pcs));
    return f ? f.op : null;
  }

  // 12-tone style matrix: row i is the P form that starts on the inversion of row[i] around row[0].
  function matrix(row) {
    const r = row.map(mod12);
    return r.map((x) => r.map((y) => mod12(y + r[0] - x)));
  }

  // ---- Spelled transposition ----
  const LETTERS = 'CDEFGAB';
  const NATURAL = [0, 2, 4, 5, 7, 9, 11];
  const DEFAULT_SPELLING = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  // Spellings preferred for a transposition's first note when two spellings are equally clean.
  const PREFERRED_START = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  // "Eb" -> { letter: 2, acc: -1 }. Number tokens get a default spelling.
  function spellingOf(token) {
    const label = /^[A-Ga-g]/.test(token.label) ? token.label : DEFAULT_SPELLING[token.pc];
    let acc = 0;
    for (const ch of label.slice(1)) acc += ch === '#' || ch === '♯' ? 1 : -1;
    return { letter: LETTERS.indexOf(label[0].toUpperCase()), acc };
  }
  // Accidental needed to make `letter` sound as pitch class `pc`, in the range -5..6.
  const accFor = (letter, pc) => { const d = mod12(pc - NATURAL[letter]); return d > 6 ? d - 12 : d; };
  const noteName = ({ letter, acc }) => LETTERS[letter] + (acc > 0 ? '♯'.repeat(acc) : '♭'.repeat(-acc));
  const asciiName = ({ letter, acc }) => LETTERS[letter] + (acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc));

  // All 12 transpositions of an ordered list of notes (repeats allowed), spelled by moving every
  // letter name by the same number of steps. For each one the app picks whichever spelling of
  // the first note gives the fewest accidentals. T0 keeps the user's own spelling.
  function spelledTranspositions(tokens) {
    if (!tokens.length) return [];
    const src = tokens.map((t) => ({ ...spellingOf(t), pc: mod12(t.pc) }));
    const first = src[0];
    const out = [];
    for (let n = 0; n < 12; n++) {
      const target = mod12(first.pc + n);
      const starts = n === 0 ? [first.letter]
        : [...Array(7).keys()].filter((l) => Math.abs(accFor(l, target)) <= 1);
      let best = null;
      for (const startLetter of starts) {
        const shift = startLetter - first.letter;
        const notes = src.map((x) => {
          const letter = (((x.letter + shift) % 7) + 7) % 7;
          return { letter, acc: accFor(letter, x.pc + n), pc: mod12(x.pc + n) };
        });
        const score = notes.reduce((t, x) => t + (x.acc === 0 ? 0 : Math.abs(x.acc) === 1 ? 1 : 4), 0)
          + (asciiName(notes[0]) === PREFERRED_START[target] ? 0 : 0.5);
        if (!best || score < best.score) best = { score, notes, shift: ((shift % 7) + 7) % 7 };
      }
      out.push({ n, notes: best.notes, letterSteps: best.shift, names: best.notes.map(noteName), pcs: best.notes.map((x) => x.pc) });
    }
    return out;
  }

  // Interval name for transposing up n semitones across `steps` letter names.
  function intervalName(n, steps) {
    const names = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', '', 'P5', 'm6', 'M6', 'm7', 'M7'];
    if (n === 6) return steps === 3 ? 'A4' : 'd5';
    return names[n];
  }

  root.Forte = {
    TABLE, list, byPrime, byName, mod12, normalForm, primeForm, intervalVector,
    transpose, invert, multiply, complement, identify, relate, parse, parseTokens, key,
    symmetries, forms, subsetClasses, supersetClasses, abstractInclusion, matrix,
    spelledTranspositions, intervalName,
  };
  if (typeof module !== 'undefined') module.exports = root.Forte;
})(typeof globalThis !== 'undefined' ? globalThis : this);
