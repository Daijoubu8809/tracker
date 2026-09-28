import { useMemo, useState } from 'react';
import { searchFoods, type FoodRecord } from '../lib/foods';
import { toggleFavorite } from '../lib/log';
import { defaultSpec, describePortion, itemFromFood } from '../lib/portions';
import { useFavoriteIds, useFoodBoost, useFoodMap, useFoods, useRecentFoodIds, useSettings } from '../hooks';
import { todayISO } from '../lib/dates';
import type { PortionRefs } from '../lib/types';
import { Icon } from './ui';

export function FoodRow({
  food,
  onPick,
  favorite,
  portionRefs,
}: {
  food: FoodRecord;
  onPick: (f: FoodRecord) => void;
  favorite: boolean;
  portionRefs: PortionRefs;
}) {
  const spec = defaultSpec(food, portionRefs);
  const item = itemFromFood(food, spec, portionRefs);
  return (
    <div className="row">
      <button type="button" className="list-item grow" onClick={() => onPick(food)}>
        <div className="grow">
          <div>
            {food.name} {!food.builtin ? <span className="badge accent">custom</span> : null}
          </div>
          <div className="small muted">{describePortion(spec, food)}</div>
        </div>
        <span className="kcal">{item ? item.kcal : '—'}</span>
      </button>
      <button
        type="button"
        className="icon-btn"
        style={{ border: 0, color: favorite ? 'var(--carbs)' : 'var(--text-2)' }}
        aria-label={favorite ? `Remove ${food.name} from favorites` : `Add ${food.name} to favorites`}
        aria-pressed={favorite}
        onClick={() => void toggleFavorite(food.id)}
      >
        <Icon name="star" filled={favorite} />
      </button>
    </div>
  );
}

export function FoodPicker({
  onPick,
  autoFocus = false,
  initialQuery = '',
  placeholder = 'Search foods (e.g. orange chicken)',
}: {
  onPick: (f: FoodRecord) => void;
  autoFocus?: boolean;
  initialQuery?: string;
  placeholder?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const foods = useFoods();
  const { portionRefs } = useSettings();
  const foodMap = useFoodMap();
  const favs = useFavoriteIds();
  const today = todayISO();
  const recents = useRecentFoodIds(today);
  const boost = useFoodBoost(today);
  const results = useMemo(() => (q.trim() ? searchFoods(q, foods, boost, 30).map((m) => m.food) : []), [q, foods, boost]);
  const favFoods = [...favs].map((id) => foodMap.get(id)).filter((f): f is FoodRecord => !!f);
  const recentFoods = recents.map((id) => foodMap.get(id)).filter((f): f is FoodRecord => !!f && !favs.has(f.id));

  const section = (title: string, list: FoodRecord[]) =>
    list.length ? (
      <div>
        <h3 className="small muted" style={{ margin: '8px 0 2px' }}>
          {title}
        </h3>
        <ul className="list">
          {list.map((f) => (
            <li key={f.id}>
              <FoodRow food={f} onPick={onPick} favorite={favs.has(f.id)} portionRefs={portionRefs} />
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="stack">
      <label className="sr-only" htmlFor="food-search">
        Search foods
      </label>
      <input
        id="food-search"
        className="input"
        type="search"
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        enterKeyHint="search"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {q.trim() ? (
        results.length ? (
          section('Results', results)
        ) : (
          <p className="muted small">No match for “{q}”. Try another word, or create a custom food.</p>
        )
      ) : (
        <>
          {section('Favorites', favFoods)}
          {section('Recent', recentFoods)}
          {!favFoods.length && !recentFoods.length ? <p className="muted small">Type to search {foods.length} foods. Tap ☆ to favorite.</p> : null}
        </>
      )}
    </div>
  );
}
