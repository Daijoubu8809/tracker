import { NumField } from '../components/ui';
import { useSettings } from '../hooks';
import { saveSettings } from '../lib/db';
import { DEFAULT_PORTION_REFS } from '../lib/defaults';
import { formatQty } from '../lib/portions';
import type { PortionRefs } from '../lib/types';

function cups(c: number): string {
  if (c < 0.2) return `${formatQty(c * 16)} tbsp`;
  return `${formatQty(c)} cup${c > 1 ? 's' : ''}`;
}

export function PortionGuide() {
  const { portionRefs: r } = useSettings();
  const rows: [string, string][] = [
    ['Full dinner plate (10–10.5″)', 'Pick ¼, ⅓, ½ or a full plate of a food'],
    ['½ plate of starch (rice, pasta, potatoes)', `≈ ${cups(r.plateFullCups / 2)} cooked`],
    ['¼ plate of starch', `≈ ${cups(r.plateFullCups / 4)} cooked`],
    ['¼ plate of meat/fish', `≈ ${formatQty(r.plateFullMeatOz / 4)} oz cooked`],
    ['Palm of meat/fish/tofu (palm-thick)', `≈ ${formatQty(r.palmOz)} oz cooked`],
    ['Fist', `≈ ${cups(r.fistCups)}`],
    ['Cupped hand', `≈ ${cups(r.cuppedHandCups)}`],
    ['Thumb (oil, butter, dressing, PB)', `≈ ${formatQty(r.thumbTbsp)} tbsp`],
    ['Dining hall serving scoop/spoon', `≈ ${cups(r.scoopCups)}`],
    ['Ladle (soup, sauce)', `≈ ${cups(r.ladleCups)} · salad-bar dressing ladle ≈ 2 tbsp`],
    ['Standard bowl, filled', `≈ ${cups(r.bowlCups)}`],
    ['To-go clamshell, full', `≈ ${cups(r.clamshellCups)} mixed food (½ allowed)`],
    ['Slice (pizza, bread, cake)', 'Weight set per food'],
    ['Piece / item (egg, cookie, nugget…)', 'Weight set per food'],
  ];
  return (
    <div className="stack">
      <table className="simple">
        <thead>
          <tr>
            <th scope="col">Portion</th>
            <th scope="col">Reference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a}>
              <td>{a}</td>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Size modifiers</h3>
      <p className="small">
        Every portion can be <b>Small ×0.75</b>, <b>Normal ×1</b>, <b>Large ×1.25</b> or <b>Heaping ×1.5</b>. In quick text, write words
        like “small”, “big”, “heaping” or “huge”.
      </p>
      <h3>Why totals show ±</h3>
      <p className="small">
        Eyeballed portions and dining-hall cooking (oil, butter, sauces) make every number an estimate. Each food has a typical error
        (about ±15% for plain rice, ±35% for fried or sauced dishes). Day totals combine these, assuming errors partly cancel out, e.g.
        “≈ 2,300 kcal (±200)”.
      </p>
      <p className="small muted">Your plates or hands different? Change the reference sizes in Settings → Portion sizes.</p>
    </div>
  );
}

const REF_FIELDS: { key: keyof PortionRefs; label: string; unit: string }[] = [
  { key: 'plateFullCups', label: 'Full plate of starch/veg', unit: 'cups' },
  { key: 'plateFullMeatOz', label: 'Full plate of meat', unit: 'oz' },
  { key: 'palmOz', label: 'Palm of meat', unit: 'oz' },
  { key: 'fistCups', label: 'Fist', unit: 'cups' },
  { key: 'cuppedHandCups', label: 'Cupped hand', unit: 'cups' },
  { key: 'thumbTbsp', label: 'Thumb', unit: 'tbsp' },
  { key: 'scoopCups', label: 'Serving scoop', unit: 'cups' },
  { key: 'ladleCups', label: 'Ladle', unit: 'cups' },
  { key: 'bowlCups', label: 'Bowl', unit: 'cups' },
  { key: 'clamshellCups', label: 'Clamshell (full)', unit: 'cups' },
];

export function PortionRefsEditor() {
  const { portionRefs } = useSettings();
  const set = (key: keyof PortionRefs, v: number | null) => {
    if (v == null || v <= 0) return;
    void saveSettings({ portionRefs: { ...portionRefs, [key]: v } });
  };
  return (
    <section className="card stack" aria-labelledby="portion-h">
      <h2 id="portion-h">Portion sizes</h2>
      <p className="small muted">Adjust if your dining hall’s plates, scoops or your hands are bigger or smaller.</p>
      <div className="grid-2">
        {REF_FIELDS.map((f) => (
          <NumField key={f.key} label={f.label} value={portionRefs[f.key]} digits={2} unit={f.unit} onChange={(v) => set(f.key, v)} />
        ))}
      </div>
      <button type="button" className="btn small" onClick={() => void saveSettings({ portionRefs: { ...DEFAULT_PORTION_REFS } })}>
        Reset to defaults
      </button>
    </section>
  );
}
