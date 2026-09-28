// "Ask Claude" bridge: a copyable prompt, and a tolerant importer for Claude's reply.
import { z } from 'zod';
import { newId } from './id';
import type { Food, LoggedItem, Meal } from './types';

export const SCHEMA_ID = 'foodlog.v1';

export const EXAMPLE_JSON = `{
  "schema": "foodlog.v1",
  "items": [
    {
      "name": "Trail mix",
      "portion_text": "about 1 cup",
      "calories": 690,
      "protein_g": 20,
      "carbs_g": 66,
      "fat_g": 44,
      "uncertainty_pct": 25,
      "save_as_custom_food": {
        "per": "1 cup",
        "grams": 150
      }
    }
  ],
  "meal": "snack",
  "notes": "Assumed a standard nut/raisin/M&M mix."
}`;

export function buildPrompt(description = ''): string {
  const what = description.trim()
    ? `Here's what I ate: "${description.trim()}". (I may also attach a photo.)`
    : "I'll attach a photo of a nutrition label or my plate, or describe what I ate.";
  return `Help me log food in my calorie tracker. ${what}

1. If portions aren't given, estimate them. I usually eat at a US college dining hall: plates are 10–10.5", a palm of meat ≈ 4 oz cooked, a fist ≈ 1 cup, a serving scoop ≈ ½ cup, a ladle ≈ ¾ cup, a to-go clamshell holds ≈ 3–4 cups. Explain your key assumptions in 1–3 short lines.
2. Then reply with exactly ONE \`\`\`json code block in this exact schema (no comments inside the JSON):

\`\`\`json
${EXAMPLE_JSON}
\`\`\`

Rules:
- One item per distinct food. All numbers are for the amount I actually ate (portion_text), not per 100 g.
- calories in kcal; protein_g, carbs_g, fat_g in grams. Numbers only, no units or ranges.
- uncertainty_pct = your honest ± estimate: ~5–10 for a nutrition label, 15–25 for simple foods with clear portions, 30–50 for mixed, fried or sauced dishes or unclear portions.
- save_as_custom_food is optional. Include it for packaged foods and things I might eat again. "per" must describe the same amount as portion_text (e.g. "1 bar", "1 cup", "1 serving (40 g)"), and "grams" is that amount's weight if you know or can reasonably estimate it (omit "grams" if unknown).
- For a nutrition label, assume I ate 1 serving unless I say otherwise; use the label's numbers exactly.
- "meal" is optional: one of "breakfast", "lunch", "dinner", "snack".`;
}

// ---------- Extraction ----------

export interface Extracted {
  json: string | null;
  error: string | null;
}

/** Pull the JSON out of Claude's reply, even with prose or several code blocks around it. */
export function extractJson(reply: string): Extracted {
  const text = reply.replace(/\r\n/g, '\n');
  if (!text.trim()) return { json: null, error: 'Nothing pasted yet.' };
  const blocks: string[] = [];
  const fence = /```[ \t]*([a-zA-Z0-9_-]*)[ \t]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text))) blocks.push(m[2]);
  // Prefer a fenced block that looks like ours, then any fenced block with an object.
  const ours = blocks.find((b) => b.includes(SCHEMA_ID)) ?? blocks.find((b) => /^[[{]/.test(b.trim()));
  if (ours) return { json: ours.trim(), error: null };
  // Unfenced (or unterminated fence): find the first balanced {...} that mentions items.
  const candidates = balancedObjects(text);
  const best = candidates.find((c) => c.includes('"items"') || c.includes(SCHEMA_ID)) ?? candidates[0];
  if (best) return { json: best, error: null };
  return {
    json: null,
    error: 'Couldn’t find a JSON block in what you pasted. Make sure you copied Claude’s whole reply, including the ```json … ``` part.',
  };
}

function balancedObjects(text: string): string[] {
  const out: string[] = [];
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          out.push(text.slice(start, i + 1));
          break;
        }
      }
    }
    if (out.length) break; // outermost first object is enough
  }
  return out;
}

/** Fix the usual copy/paste damage: smart quotes, trailing commas. */
function repairJson(s: string): string {
  return s
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/ /g, ' ')
    .replace(/,\s*([}\]])/g, '$1');
}

function jsonErrorMessage(err: unknown, src: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  const pos = msg.match(/position (\d+)/);
  if (pos) {
    const p = Number(pos[1]);
    const before = src.slice(0, p);
    const line = before.split('\n').length;
    const col = p - before.lastIndexOf('\n');
    const snippet = src.slice(Math.max(0, p - 20), p + 20).replace(/\n/g, ' ');
    return `The JSON is broken near line ${line}, column ${col}: “…${snippet}…”. Ask Claude to resend just the JSON block.`;
  }
  return `The JSON is broken (${msg}). Ask Claude to resend just the JSON block.`;
}

// ---------- Validation ----------

/** Accept numbers or numeric strings like "690" / "20g"; reject everything else. */
const num = (field: string) =>
  z.preprocess(
    (v) => {
      if (typeof v === 'string') {
        const m = v.trim().match(/^~?\s*(-?\d+(?:\.\d+)?)\s*(k?cal|kcal|g|%)?$/i);
        return m ? Number(m[1]) : v;
      }
      return v;
    },
    z
      .number({ error: (iss) => (iss.input === undefined ? `${field} is missing` : `${field} must be a number (got ${JSON.stringify(iss.input)})`) })
      .finite()
      .min(0, { error: `${field} can’t be negative` }),
  );

const optNum = (field: string) => z.union([num(field), z.null()]).optional();

const ItemSchema = z.object({
  name: z
    .string({ error: (iss) => (iss.input === undefined ? 'name is missing' : 'name must be text') })
    .trim()
    .min(1, { error: 'name is empty' }),
  portion_text: z.string().optional().nullable(),
  calories: num('calories').refine((v) => v < 10000, { error: 'calories looks too high (over 10,000)' }),
  protein_g: optNum('protein_g'),
  carbs_g: optNum('carbs_g'),
  fat_g: optNum('fat_g'),
  uncertainty_pct: optNum('uncertainty_pct'),
  save_as_custom_food: z
    .object({
      per: z.string({ error: 'save_as_custom_food.per must be text like "1 cup"' }).trim().min(1),
      grams: optNum('save_as_custom_food.grams'),
    })
    .optional()
    .nullable(),
});

const MEAL_ALIASES: Record<string, Meal> = {
  breakfast: 'breakfast',
  brunch: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  supper: 'dinner',
  snack: 'snack',
  snacks: 'snack',
  dessert: 'snack',
};

export interface ClaudeItem {
  name: string;
  portionText: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  uncertaintyPct: number;
  saveAs: { per: string; grams: number | null } | null;
  /** Fields that were missing and filled with 0 / defaults. */
  filled: string[];
}

export interface InvalidItem {
  index: number;
  name: string | null;
  problems: string[];
}

export interface ClaudeImport {
  items: ClaudeItem[];
  invalid: InvalidItem[];
  meal: Meal | null;
  notes: string | null;
  /** Fatal problems: nothing can be imported. */
  errors: string[];
  warnings: string[];
}

function formatPath(path: readonly PropertyKey[]): string {
  return path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`)).join('').replace(/^\./, '');
}

export function parseClaudeReply(reply: string): ClaudeImport {
  const result: ClaudeImport = { items: [], invalid: [], meal: null, notes: null, errors: [], warnings: [] };
  const { json, error } = extractJson(reply);
  if (!json) {
    result.errors.push(error ?? 'No JSON found.');
    return result;
  }
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    const repaired = repairJson(json);
    try {
      data = JSON.parse(repaired);
      result.warnings.push('Fixed small formatting problems in the JSON (smart quotes or trailing commas).');
    } catch (e2) {
      result.errors.push(jsonErrorMessage(e2, repaired));
      return result;
    }
  }
  if (Array.isArray(data)) {
    data = { schema: SCHEMA_ID, items: data };
    result.warnings.push('The JSON was a bare list of items; treated it as "items".');
  }
  if (typeof data !== 'object' || data === null) {
    result.errors.push('The JSON must be an object like { "schema": "foodlog.v1", "items": [ … ] }.');
    return result;
  }
  const obj = data as Record<string, unknown>;
  if (obj.schema === undefined) result.warnings.push('No "schema" field; assuming foodlog.v1.');
  else if (obj.schema !== SCHEMA_ID) {
    result.errors.push(`Unknown schema "${String(obj.schema)}" — expected "${SCHEMA_ID}".`);
    return result;
  }
  if (!Array.isArray(obj.items)) {
    result.errors.push(obj.items === undefined ? 'The JSON has no "items" list.' : '"items" must be a list [ … ].');
    return result;
  }
  if (obj.items.length === 0) {
    result.errors.push('"items" is empty — nothing to log.');
    return result;
  }
  if (typeof obj.meal === 'string') {
    const meal = MEAL_ALIASES[obj.meal.trim().toLowerCase()];
    if (meal) result.meal = meal;
    else result.warnings.push(`Ignored unknown meal "${obj.meal}".`);
  }
  if (typeof obj.notes === 'string' && obj.notes.trim()) result.notes = obj.notes.trim();

  obj.items.forEach((raw, index) => {
    const parsed = ItemSchema.safeParse(raw);
    if (!parsed.success) {
      const name = raw && typeof raw === 'object' && typeof (raw as { name?: unknown }).name === 'string' ? (raw as { name: string }).name : null;
      result.invalid.push({
        index,
        name,
        problems: parsed.error.issues.map((i) => {
          const p = formatPath(i.path);
          return p && !i.message.startsWith(p) ? `${p}: ${i.message}` : i.message;
        }),
      });
      return;
    }
    const d = parsed.data;
    const filled: string[] = [];
    const macro = (v: number | null | undefined, key: string) => {
      if (v == null) {
        filled.push(key);
        return 0;
      }
      return v;
    };
    result.items.push({
      name: d.name,
      portionText: d.portion_text?.trim() || '1 serving',
      calories: d.calories,
      protein: macro(d.protein_g, 'protein_g'),
      carbs: macro(d.carbs_g, 'carbs_g'),
      fat: macro(d.fat_g, 'fat_g'),
      uncertaintyPct: d.uncertainty_pct == null ? 25 : Math.min(100, d.uncertainty_pct),
      saveAs: d.save_as_custom_food ? { per: d.save_as_custom_food.per, grams: d.save_as_custom_food.grams && d.save_as_custom_food.grams > 0 ? d.save_as_custom_food.grams : null } : null,
      filled,
    });
    if (filled.length) result.warnings.push(`“${d.name}”: ${filled.join(', ')} missing — set to 0. Edit it below if you know it.`);
  });
  return result;
}

// ---------- Conversion ----------

export function claudeItemToLogged(item: ClaudeItem, multiplier = 1, foodId: string | null = null): LoggedItem {
  const m = multiplier;
  return {
    name: item.name,
    foodId,
    portion: null,
    portionText: m === 1 ? item.portionText : `${Math.round(m * 100) / 100} × ${item.portionText}`,
    grams: item.saveAs?.grams ? Math.round(item.saveAs.grams * m) : null,
    kcal: Math.round(item.calories * m),
    protein: Math.round(item.protein * m * 10) / 10,
    carbs: Math.round(item.carbs * m * 10) / 10,
    fat: Math.round(item.fat * m * 10) / 10,
    uncertaintyPct: item.uncertaintyPct,
    source: 'claude',
  };
}

/** Parse "1 cup", "2 slices", "1 bar" → a unit the food can reuse. */
function perUnit(per: string): { kind: 'cup' | 'slice' | 'piece' | null; count: number; noun: string } {
  const m = per.trim().toLowerCase().match(/^(?:about\s+)?(\d+(?:\.\d+)?|\d+\/\d+|a|an|one)?\s*([a-z][a-z -]*)/);
  if (!m) return { kind: null, count: 1, noun: per };
  const c = m[1];
  const count = !c || c === 'a' || c === 'an' || c === 'one' ? 1 : c.includes('/') ? Number(c.split('/')[0]) / Number(c.split('/')[1]) : Number(c);
  const noun = m[2].trim().split(/\s+/)[0].replace(/s$/, '');
  if (noun === 'cup') return { kind: 'cup', count, noun };
  if (noun === 'slice') return { kind: 'slice', count, noun };
  if (['serving', 'g', 'gram', 'oz', 'ounce', 'container', 'package', 'bag', 'bowl', 'plate'].includes(noun)) return { kind: null, count, noun };
  return { kind: 'piece', count, noun };
}

/** Build a custom food from a Claude item with save_as_custom_food. */
export function claudeItemToFood(item: ClaudeItem): Food | null {
  if (!item.saveAs) return null;
  const { per, grams } = item.saveAs;
  const base: Food = {
    id: `c:${newId()}`,
    name: item.name,
    aliases: [],
    category: 'mixed',
    kcal100: 0,
    protein100: 0,
    carbs100: 0,
    fat100: 0,
    defaultUnit: 'serving',
    uncertaintyPct: item.uncertaintyPct,
    source: `Claude estimate (${new Date().toISOString().slice(0, 10)})`,
  };
  const r1 = (n: number) => Math.round(n * 10) / 10;
  if (!grams) {
    // Unknown weight: store per serving.
    return {
      ...base,
      nominal: true,
      kcal100: item.calories,
      protein100: item.protein,
      carbs100: item.carbs,
      fat100: item.fat,
      servingGrams: 100,
      servingName: per,
    };
  }
  const f = 100 / grams;
  const food: Food = {
    ...base,
    kcal100: Math.round(item.calories * f),
    protein100: r1(item.protein * f),
    carbs100: r1(item.carbs * f),
    fat100: r1(item.fat * f),
    servingGrams: grams,
    servingName: per,
  };
  const u = perUnit(per);
  if (u.count > 0) {
    if (u.kind === 'cup') food.gramsPerCup = Math.round(grams / u.count);
    if (u.kind === 'slice') food.gramsPerSlice = Math.round(grams / u.count);
    if (u.kind === 'piece') {
      food.gramsPerPiece = Math.round((grams / u.count) * 10) / 10;
      food.pieceName = u.noun;
    }
  }
  return food;
}
