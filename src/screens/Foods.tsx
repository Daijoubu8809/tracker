import { useMemo, useState } from 'react';
import { FoodRow } from '../components/FoodPicker';
import { Icon, Segmented, Sheet } from '../components/ui';
import { useFavoriteIds, useFoods, useSettings } from '../hooks';
import { searchFoods, type FoodRecord } from '../lib/foods';
import { toggleFavorite } from '../lib/log';
import { availableUnits, describePortion, gramsPerUnit } from '../lib/portions';
import type { PortionUnit } from '../lib/types';
import { useApp } from '../state';
import { AddFoodSheet } from './Log';
import { PortionGuide } from './PortionGuide';
import { FoodEditor, newCustomFood } from './FoodEditor';

type View = 'all' | 'favorites' | 'custom' | 'guide';

export function Foods() {
  const { route, go } = useApp();
  const view: View = (['all', 'favorites', 'custom', 'guide'] as const).find((v) => v === route.sub) ?? 'all';
  const foods = useFoods();
  const favs = useFavoriteIds();
  const { portionRefs } = useSettings();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<FoodRecord | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    let base = foods;
    if (view === 'favorites') base = foods.filter((f) => favs.has(f.id));
    if (view === 'custom') base = foods.filter((f) => !f.builtin || f.edited);
    if (q.trim()) return searchFoods(q, base, new Map(), 100).map((m) => m.food);
    return [...base].sort((a, b) => a.name.localeCompare(b.name));
  }, [foods, favs, view, q]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Foods</h1>
        <button type="button" className="btn small" onClick={() => setCreating(true)}>
          + Custom food
        </button>
      </div>
      <Segmented
        label="Food list"
        options={[
          { value: 'all', label: `All (${foods.length})` },
          { value: 'favorites', label: 'Favorites' },
          { value: 'custom', label: 'Custom' },
          { value: 'guide', label: 'Portion guide' },
        ]}
        value={view}
        onChange={(v) => go('foods', v)}
      />
      {view === 'guide' ? (
        <section className="card">
          <PortionGuide />
        </section>
      ) : (
        <section className="card stack">
          <label className="sr-only" htmlFor="foods-search">
            Search foods
          </label>
          <input
            id="foods-search"
            className="input"
            type="search"
            placeholder="Search"
            value={q}
            autoComplete="off"
            onChange={(e) => setQ(e.target.value)}
          />
          {list.length ? (
            <ul className="list">
              {list.map((f) => (
                <li key={f.id}>
                  <FoodRow food={f} onPick={setOpen} favorite={favs.has(f.id)} portionRefs={portionRefs} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">
              {view === 'favorites' ? 'No favorites yet — tap ☆ on any food.' : view === 'custom' ? 'No custom foods yet.' : 'No foods found.'}
            </p>
          )}
        </section>
      )}
      {open ? <FoodDetail food={open} onClose={() => setOpen(null)} /> : null}
      {creating ? <FoodEditor food={newCustomFood()} isNew onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function FoodDetail({ food, onClose }: { food: FoodRecord; onClose: () => void }) {
  const { portionRefs } = useSettings();
  const favs = useFavoriteIds();
  const [mode, setMode] = useState<'view' | 'log' | 'edit'>('view');
  if (mode === 'log') return <AddFoodSheet food={food} onClose={onClose} />;
  if (mode === 'edit') return <FoodEditor food={food} onClose={onClose} />;
  const units = availableUnits(food, portionRefs);
  const fav = favs.has(food.id);
  return (
    <Sheet title={food.name} onClose={onClose}>
      <div className="row wrap">
        {food.builtin ? <span className="badge">built-in{food.edited ? ' (edited)' : ''}</span> : <span className="badge accent">custom</span>}
        <span className="badge">±{food.uncertaintyPct}%</span>
        <span className="badge">{food.category}</span>
      </div>
      <table className="simple">
        <caption className="small muted" style={{ textAlign: 'left' }}>
          {food.nominal ? `Per serving (${food.servingName ?? 'serving'})` : 'Per 100 g'}
        </caption>
        <tbody>
          <tr>
            <th scope="row">Calories</th>
            <td className="num">{food.kcal100} kcal</td>
          </tr>
          <tr>
            <th scope="row">Protein</th>
            <td className="num">{food.protein100} g</td>
          </tr>
          <tr>
            <th scope="row">Carbs</th>
            <td className="num">{food.carbs100} g</td>
          </tr>
          <tr>
            <th scope="row">Fat</th>
            <td className="num">{food.fat100} g</td>
          </tr>
          {food.fiber100 != null ? (
            <tr>
              <th scope="row">Fiber</th>
              <td className="num">{food.fiber100} g</td>
            </tr>
          ) : null}
          {food.sodium100 != null ? (
            <tr>
              <th scope="row">Sodium</th>
              <td className="num">{food.sodium100} mg</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <details>
        <summary>Portions</summary>
        <table className="simple">
          <tbody>
            {units.map((u: PortionUnit) => {
              const g = gramsPerUnit(food, u, portionRefs) ?? 0;
              return (
                <tr key={u}>
                  <td>{describePortion({ unit: u, qty: u === 'g' ? 100 : 1, size: 'normal' }, food)}</td>
                  <td className="num">{food.nominal ? '' : `${Math.round(u === 'g' ? 100 : g)} g`}</td>
                  <td className="num">{Math.round((food.kcal100 * (u === 'g' ? 100 : g)) / 100)} kcal</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
      <p className="tiny muted">Source: {food.source}</p>
      <div className="row">
        <button type="button" className="icon-btn" aria-pressed={fav} aria-label={fav ? 'Unfavorite' : 'Favorite'} onClick={() => void toggleFavorite(food.id)}>
          <Icon name="star" filled={fav} />
        </button>
        <button type="button" className="btn" onClick={() => setMode('edit')}>
          <Icon name="edit" /> Edit
        </button>
        <button type="button" className="btn primary grow" onClick={() => setMode('log')}>
          Log this
        </button>
      </div>
    </Sheet>
  );
}
