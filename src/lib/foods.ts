import { SEED_FOODS } from '../data/seedFoods';
import { bestNameScore, tokens } from './fuzzy';
import type { Food, StoredFood } from './types';

export interface FoodRecord extends Food {
  builtin: boolean;
  /** Built-in food that has been edited locally. */
  edited: boolean;
}

/** Built-in foods overlaid with local edits/hides, plus custom foods. */
export function mergeFoods(stored: readonly StoredFood[], seed: readonly Food[] = SEED_FOODS): FoodRecord[] {
  const byId = new Map(stored.map((s) => [s.id, s]));
  const out: FoodRecord[] = [];
  for (const f of seed) {
    const s = byId.get(f.id);
    if (s?.deleted) continue;
    out.push(s ? { ...stripSync(s), builtin: true, edited: true } : { ...f, builtin: true, edited: false });
  }
  const seedIds = new Set(seed.map((f) => f.id));
  for (const s of stored) {
    if (seedIds.has(s.id) || s.deleted) continue;
    out.push({ ...stripSync(s), builtin: false, edited: false });
  }
  return out;
}

function stripSync(s: StoredFood): Food {
  const { updatedAt: _u, deleted: _d, builtin: _b, ...food } = s;
  return food;
}

export interface FoodMatch {
  food: FoodRecord;
  score: number;
}

/**
 * Rank foods for a query. `boost` adds a small bonus (e.g. favorites/recents)
 * that only breaks near-ties; it never makes a bad match look good.
 */
export function searchFoods(query: string, foods: readonly FoodRecord[], boost: ReadonlyMap<string, number> = new Map(), limit = 20): FoodMatch[] {
  const q = tokens(query);
  if (!q.length) return [];
  const scored: FoodMatch[] = [];
  for (const food of foods) {
    const base = bestNameScore(q, food);
    if (base < 0.45) continue;
    const bonus = Math.min(0.04, boost.get(food.id) ?? 0) + (food.builtin ? 0 : 0.01);
    // Not capped at 1, so the bonus can break ties between two exact matches.
    scored.push({ food, score: base + bonus });
  }
  scored.sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length);
  return scored.slice(0, limit);
}
