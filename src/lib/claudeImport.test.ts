import { describe, expect, it } from 'vitest';
import { DEFAULT_PORTION_REFS as R } from './defaults';
import { buildPrompt, claudeItemToFood, claudeItemToLogged, EXAMPLE_JSON, extractJson, parseClaudeReply } from './claudeImport';
import { itemFromFood } from './portions';
import { labelToFood, labelToItem, parseAmount } from './label';

const wrap = (json: string) => `Here's my estimate. I assumed a standard mix.\n\n\`\`\`json\n${json}\n\`\`\`\n\nLet me know if you want changes!`;

describe('prompt', () => {
  it('contains the schema, the example, and the description', () => {
    const p = buildPrompt('a big apple and about a cup of trail mix');
    expect(p).toContain('"schema": "foodlog.v1"');
    expect(p).toContain('save_as_custom_food');
    expect(p).toContain('a big apple and about a cup of trail mix');
    // The embedded example must itself import cleanly.
    expect(parseClaudeReply(p).errors).toEqual([]);
  });
});

describe('valid replies', () => {
  it('imports the example from the spec', () => {
    const r = parseClaudeReply(wrap(EXAMPLE_JSON));
    expect(r.errors).toEqual([]);
    expect(r.invalid).toEqual([]);
    expect(r.meal).toBe('snack');
    expect(r.notes).toMatch(/standard/);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ name: 'Trail mix', calories: 690, protein: 20, carbs: 66, fat: 44, uncertaintyPct: 25 });
    expect(r.items[0].saveAs).toEqual({ per: '1 cup', grams: 150 });
  });
  it('handles several items, no meal, no custom food', () => {
    const json = JSON.stringify({
      schema: 'foodlog.v1',
      items: [
        { name: 'Apple', portion_text: '1 large', calories: 116, protein_g: 0.6, carbs_g: 31, fat_g: 0.4, uncertainty_pct: 15 },
        { name: 'Trail mix', portion_text: '1 cup', calories: 690, protein_g: 20, carbs_g: 66, fat_g: 44 },
      ],
    });
    const r = parseClaudeReply(wrap(json));
    expect(r.items.map((i) => i.name)).toEqual(['Apple', 'Trail mix']);
    expect(r.meal).toBeNull();
    expect(r.items[1].uncertaintyPct).toBe(25); // default
  });
  it('accepts numeric strings like "690" and "20g"', () => {
    const r = parseClaudeReply(wrap('{"schema":"foodlog.v1","items":[{"name":"X","calories":"690","protein_g":"20g","carbs_g":66,"fat_g":44}]}'));
    expect(r.items[0]).toMatchObject({ calories: 690, protein: 20 });
  });
  it('normalizes meal names', () => {
    expect(parseClaudeReply(wrap('{"schema":"foodlog.v1","items":[{"name":"X","calories":1,"protein_g":0,"carbs_g":0,"fat_g":0}],"meal":"Supper"}')).meal).toBe('dinner');
  });
});

describe('extra text around the code block', () => {
  it('finds a ```json block among prose', () => {
    expect(extractJson(wrap('{"a":1}')).json).toBe('{"a":1}');
  });
  it('picks our block when there are several code blocks', () => {
    const reply = "```\nsome other code\n```\nand the log:\n```json\n" + EXAMPLE_JSON + '\n```';
    expect(parseClaudeReply(reply).items).toHaveLength(1);
  });
  it('works with an unlabeled fence', () => {
    expect(parseClaudeReply('Sure:\n```\n' + EXAMPLE_JSON + '\n```').items).toHaveLength(1);
  });
  it('works with no fence at all', () => {
    expect(parseClaudeReply('Here you go: ' + EXAMPLE_JSON + ' Enjoy.').items).toHaveLength(1);
  });
  it('works with an unterminated fence (reply cut off after the JSON)', () => {
    expect(parseClaudeReply('```json\n' + EXAMPLE_JSON).items).toHaveLength(1);
  });
  it('handles braces inside strings', () => {
    const json = '{"schema":"foodlog.v1","items":[{"name":"Cake {slice}","calories":350,"protein_g":4,"carbs_g":50,"fat_g":15}],"notes":"has } brace"}';
    expect(parseClaudeReply('Text ' + json + ' more text').items[0].name).toBe('Cake {slice}');
  });
  it('repairs smart quotes and trailing commas', () => {
    const bad = '{“schema”: “foodlog.v1”, “items”: [{“name”: “Apple”, “calories”: 95, “protein_g”: 0, “carbs_g”: 25, “fat_g”: 0,},],}';
    const r = parseClaudeReply(wrap(bad));
    expect(r.errors).toEqual([]);
    expect(r.items[0].name).toBe('Apple');
    expect(r.warnings.join(' ')).toMatch(/Fixed/);
  });
});

describe('invalid replies (clear errors, never crash, never silently drop)', () => {
  it('empty input', () => {
    expect(parseClaudeReply('   ').errors[0]).toMatch(/Nothing pasted/);
  });
  it('no JSON at all', () => {
    expect(parseClaudeReply('I think that was about 500 calories.').errors[0]).toMatch(/Couldn’t find a JSON block/);
  });
  it('broken JSON reports where', () => {
    const r = parseClaudeReply(wrap('{"schema":"foodlog.v1","items":[{"name":"Apple" "calories":95}]}'));
    expect(r.errors[0]).toMatch(/broken near line 1, column/);
  });
  it('wrong schema', () => {
    expect(parseClaudeReply(wrap('{"schema":"other.v2","items":[]}')).errors[0]).toMatch(/Unknown schema/);
  });
  it('missing items', () => {
    expect(parseClaudeReply(wrap('{"schema":"foodlog.v1"}')).errors[0]).toMatch(/no "items"/);
  });
  it('items not a list', () => {
    expect(parseClaudeReply(wrap('{"schema":"foodlog.v1","items":{"name":"x"}}')).errors[0]).toMatch(/must be a list/);
  });
  it('empty items', () => {
    expect(parseClaudeReply(wrap('{"schema":"foodlog.v1","items":[]}')).errors[0]).toMatch(/empty/);
  });
  it('missing calories / name are reported per item and the item is kept in `invalid`', () => {
    const json = JSON.stringify({
      schema: 'foodlog.v1',
      items: [
        { name: 'Good', calories: 100, protein_g: 1, carbs_g: 2, fat_g: 3 },
        { name: 'No calories', protein_g: 1 },
        { calories: 50 },
        { name: 'Bad number', calories: 'lots' },
        { name: 'Negative', calories: -5 },
      ],
    });
    const r = parseClaudeReply(wrap(json));
    expect(r.errors).toEqual([]);
    expect(r.items.map((i) => i.name)).toEqual(['Good']);
    expect(r.invalid.map((i) => i.index)).toEqual([1, 2, 3, 4]);
    expect(r.invalid[0].problems.join()).toMatch(/calories is missing/);
    expect(r.invalid[1].problems.join()).toMatch(/name is missing/);
    expect(r.invalid[2].problems.join()).toMatch(/calories must be a number \(got "lots"\)/);
    expect(r.invalid[3].problems.join()).toMatch(/can’t be negative/);
    expect(r.items.length + r.invalid.length).toBe(5); // nothing dropped
  });
  it('missing macros are filled with 0 and warned about', () => {
    const r = parseClaudeReply(wrap('{"schema":"foodlog.v1","items":[{"name":"Mystery","calories":300}]}'));
    expect(r.items[0]).toMatchObject({ protein: 0, carbs: 0, fat: 0, filled: ['protein_g', 'carbs_g', 'fat_g'] });
    expect(r.warnings.join()).toMatch(/missing — set to 0/);
  });
  it('missing schema is a warning, not an error', () => {
    const r = parseClaudeReply(wrap('{"items":[{"name":"A","calories":1,"protein_g":0,"carbs_g":0,"fat_g":0}]}'));
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toMatch(/No "schema"/);
  });
  it('a JSON array or scalar', () => {
    expect(parseClaudeReply(wrap('[{"name":"A","calories":1}]')).items).toHaveLength(1);
    expect(parseClaudeReply(wrap('42')).errors.length).toBeGreaterThan(0);
  });
  it('never throws on junk', () => {
    for (const junk of ['```json\n```', '{', '}{', '```json\nnull\n```', '{"items":[null, 1, "x", []]}', 'x'.repeat(10000)]) {
      expect(() => parseClaudeReply(junk)).not.toThrow();
    }
    expect(parseClaudeReply('{"items":[null, 1, "x", []]}').invalid).toHaveLength(4);
  });
});

describe('conversion', () => {
  const r = parseClaudeReply(wrap(EXAMPLE_JSON));
  const item = r.items[0];
  it('logs the item with scaling', () => {
    expect(claudeItemToLogged(item)).toMatchObject({ name: 'Trail mix', kcal: 690, protein: 20, source: 'claude', uncertaintyPct: 25 });
    expect(claudeItemToLogged(item, 0.5)).toMatchObject({ kcal: 345, fat: 22, portionText: '0.5 × about 1 cup' });
  });
  it('saves a custom food per 100 g with a cup weight', () => {
    const food = claudeItemToFood(item)!;
    expect(food.kcal100).toBe(460);
    expect(food.gramsPerCup).toBe(150);
    expect(food.servingName).toBe('1 cup');
    // Logging 1 cup of the new food reproduces Claude's numbers.
    expect(itemFromFood(food, { unit: 'cup', qty: 1, size: 'normal' }, R)?.kcal).toBe(690);
    expect(itemFromFood(food, { unit: 'fist', qty: 1, size: 'normal' }, R)?.kcal).toBe(690);
  });
  it('piece-style units become pieces', () => {
    const food = claudeItemToFood({ ...item, saveAs: { per: '2 bars', grams: 80 } })!;
    expect(food.gramsPerPiece).toBe(40);
    expect(food.pieceName).toBe('bar');
  });
  it('without grams it saves a per-serving food', () => {
    const food = claudeItemToFood({ ...item, saveAs: { per: '1 bowl', grams: null } })!;
    expect(food.nominal).toBe(true);
    expect(itemFromFood(food, { unit: 'serving', qty: 2, size: 'normal' }, R)?.kcal).toBe(1380);
  });
});

describe('nutrition label entry', () => {
  it('parses fractional servings', () => {
    expect(parseAmount('1')).toBe(1);
    expect(parseAmount('1.5')).toBe(1.5);
    expect(parseAmount('1/2')).toBe(0.5);
    expect(parseAmount('1 1/2')).toBe(1.5);
    expect(parseAmount('½')).toBe(0.5);
    expect(parseAmount('1½')).toBe(1.5);
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1 2')).toBeNull();
  });
  const label = {
    name: 'Clif Bar',
    servingText: '1 bar',
    servingGrams: 68,
    servingsPerContainer: 1,
    calories: 250,
    protein: 10,
    carbs: 45,
    fat: 5,
    servingsEaten: 1.5,
  };
  it('scales by servings eaten', () => {
    expect(labelToItem(label, null)).toMatchObject({ kcal: 375, protein: 15, carbs: 67.5, fat: 7.5, grams: 102, portionText: '1.5 × 1 bar' });
  });
  it('saves per-gram foods when grams are known', () => {
    const f = labelToFood(label);
    expect(f.kcal100).toBe(368);
    expect(itemFromFood(f, { unit: 'serving', qty: 1, size: 'normal' }, R)?.kcal).toBe(250);
  });
  it('saves per-serving foods when grams are unknown', () => {
    const f = labelToFood({ ...label, servingGrams: null });
    expect(f.nominal).toBe(true);
    expect(itemFromFood(f, { unit: 'serving', qty: 0.5, size: 'normal' }, R)?.kcal).toBe(125);
  });
});
