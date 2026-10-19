// Run with: node posttonal/test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
// forte.js is a plain browser script; run it in a sandbox and read the global it defines.
const sandbox = {};
vm.runInNewContext(readFileSync(new URL('./forte.js', import.meta.url), 'utf8'), sandbox);
const F = sandbox.Forte;
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

// Every prime in the table is its own Forte prime form, and all 4096 subsets land in the table.
for (const e of F.list) assert.equal(F.key(F.primeForm(e.prime)), e.key, e.name);
for (let m = 0; m < 4096; m++) {
  const s = [...Array(12).keys()].filter((i) => (m >> i) & 1);
  assert.ok(F.byPrime[F.key(F.primeForm(s))], s.join());
}
assert.equal(F.list.length, 224);

// The six sets where Forte and Rahn disagree.
const forte = { '5-20': '01378', '6-Z29': '013689', '6-31': '013589', '7-Z18': '0123589', '7-20': '0124789', '8-26': '0124579a' };
for (const [n, p] of Object.entries(forte)) assert.equal(F.byName[n].key, p, n);

// Spot checks against Forte's table (name, IC vector, Z, M, invariance vector, cycle).
const c = (n) => F.byName[n];
same(c('3-1').vector, [2, 1, 0, 0, 0, 0]);
same(c('3-1').invariance, [1, 1, 0, 0, 7, 7, 4, 4]);
same(c('4-6').invariance, [1, 1, 1, 1, 4, 4, 4, 4]);
same(c('6-35').invariance, [6, 6, 6, 6, 6, 6, 6, 6]);
same(c('6-30').invariance, [2, 0, 0, 2, 0, 2, 2, 0]);
same(c('8-28').invariance, [4, 4, 4, 4, 0, 0, 0, 0]);
assert.equal(c('4-Z15').zPartner.name, '4-Z29');
assert.equal(c('6-Z3').zPartner.name, '6-Z36');
assert.equal(c('6-Z3').complement.name, '6-Z36');
assert.equal(c('5-Z12').complement.name, '7-Z12');
assert.equal(c('3-1').mPartner.name, '3-9');
assert.equal(c('5-20').mPartner.name, '5-6');
assert.equal(c('6-Z29').mPartner.name, '6-Z42');
same(c('3-1').cycle, [1, 1, 10]);
same(c('5-20').cycle, [1, 2, 4, 1, 4]);

// Normal form and identification.
same(F.normalForm([7, 11, 2]), [7, 11, 2]);
same(F.normalForm([0, 4, 7, 11]), [11, 0, 4, 7]);
same(F.normalForm([0, 1, 6, 7]), [0, 1, 6, 7]);
const id = F.identify(F.parse('C E G'));
assert.equal(id.entry.name, '3-11');
same(id.ops, ['T7I']);
same(F.identify([0, 3, 7]).ops, ['T0']);

// Parsing.
same(F.parse('0 1 4 t'), [0, 1, 4, 10]);
same(F.parse('014e'), [0, 1, 4, 11]);
same(F.parse('Db F Ab'), [1, 5, 8]);
same(F.parse('c e g#'), [0, 4, 8]);
same(F.parse('abcdefg'), [0, 2, 4, 5, 7, 9, 11]);
same(F.parse('A B'), [9, 11]);
same(F.parse('DbFAb'), [1, 5, 8]);
same(F.parse('Bb D F'), [2, 5, 10]);
same(F.parse('eb g bb'), [3, 7, 10]);
same(F.parse('c#eg#'), [1, 4, 8]);
same(F.parse('t e 0'), [0, 10, 11]);
same(F.parse('0 1 a b'), [0, 1, 10, 11]);
assert.throws(() => F.parse('C H'));

// Shown work agrees with the direct computation for every subset.
for (let m = 1; m < 4096; m++) {
  const s = [...Array(12).keys()].filter((i) => (m >> i) & 1);
  const st = F.primeFormSteps(s);
  same(st.original.normal, F.normalForm(s));
  same(st.prime, F.primeForm(s));
}
const st = F.normalFormSteps([0, 1, 3, 7, 8]);
same(st.normal, [0, 1, 3, 7, 8]);
same(st.rounds.map((r) => r.j), [4, 1, 2]);
assert.throws(() => F.parse('0 13'));

same(F.relate([0, 1, 4], [5, 6, 9]), ['T5']);
same(F.relate([0, 1, 4], [0, 11, 8]), ['T0I']);
console.log('all post-tonal tests passed');
