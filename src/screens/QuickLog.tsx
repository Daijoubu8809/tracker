import { useEffect, useMemo, useState } from 'react';
import { FoodPicker } from '../components/FoodPicker';
import { PortionPicker } from '../components/PortionPicker';
import { Icon, Sheet } from '../components/ui';
import { useFoodBoost, useFoods, useSettings } from '../hooks';
import { todayISO } from '../lib/dates';
import { MEAL_LABEL } from '../lib/log';
import { parseQuickText, withFood, type ParsedItem } from '../lib/parser';
import { roundRange, sumItems } from '../lib/portions';
import { useApp } from '../state';
import { useScanLabel } from '../components/ScanLabel';
import { newCustomFood, FoodEditor } from './FoodEditor';
import { useLogItems } from './Log';

const DRAFT_KEY = 'quicklog-draft';
export const ASK_CLAUDE_KEY = 'ask-claude-text';

function readDraft(): string {
  try {
    return sessionStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function QuickLog() {
  const foods = useFoods();
  const { portionRefs } = useSettings();
  const boost = useFoodBoost(todayISO());
  const { logMeal, go } = useApp();
  const { scanWithCamera } = useScanLabel();
  const logItems = useLogItems();
  const [text, setText] = useState(readDraft);
  /** User edits to parsed items, keyed by position + raw text. */
  const [overrides, setOverrides] = useState<Record<string, ParsedItem | null>>({});
  const [editing, setEditing] = useState<{ key: string; item: ParsedItem } | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, text);
    } catch {
      /* private mode: ignore */
    }
  }, [text]);

  const parsed = useMemo(() => parseQuickText(text, foods, portionRefs, boost), [text, foods, portionRefs, boost]);
  const rows = parsed
    .map((p, i) => {
      const key = `${i}:${p.raw}`;
      return { key, item: key in overrides ? overrides[key] : p };
    })
    .filter((r): r is { key: string; item: ParsedItem } => r.item !== null);
  const ready = rows.filter((r) => r.item.item);
  const unresolved = rows.length - ready.length;
  const totals = sumItems(ready.map((r) => r.item.item!));

  const setRow = (key: string, item: ParsedItem | null) => setOverrides((o) => ({ ...o, [key]: item }));

  const submit = async () => {
    await logItems(ready.map((r) => r.item.item!));
    setText('');
    setOverrides({});
  };

  const askClaude = (desc: string) => {
    try {
      sessionStorage.setItem(ASK_CLAUDE_KEY, desc);
    } catch {
      /* ignore */
    }
    go('log', 'ask');
  };

  return (
    <div className="stack">
      <label htmlFor="quick-text" className="small muted">
        Describe what you ate, separated by commas
      </label>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <textarea
          id="quick-text"
          className="input grow"
          autoFocus
          rows={3}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="half plate fried rice, palm of orange chicken, fist broccoli, 2 cookies"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
        <button type="button" className="icon-btn" aria-label="Scan a nutrition label" title="Scan a nutrition label" onClick={scanWithCamera}>
          <Icon name="camera" />
        </button>
      </div>
      {rows.length ? (
        <ul className="list" aria-label="Preview">
          {rows.map(({ key, item: p }) => (
            <li key={key}>
              {p.status === 'unmatched' ? (
                <UnmatchedRow
                  p={p}
                  onPick={(food) => setRow(key, withFood(p, food, portionRefs))}
                  onSearch={() => setEditing({ key, item: p })}
                  onCreate={() => setCreating(key)}
                  onAsk={() => askClaude(p.raw)}
                  onRemove={() => setRow(key, null)}
                />
              ) : (
                <div className="row">
                  <button type="button" className="list-item grow" onClick={() => setEditing({ key, item: p })}>
                    <div className="grow">
                      <div>
                        {p.food?.name} {p.status === 'check' ? <span className="badge warn">check</span> : null}
                      </div>
                      <div className="small muted">
                        {p.item?.portionText ?? '—'} · <i>“{p.raw}”</i>
                      </div>
                      {p.warning ? <div className="small" style={{ color: 'var(--warn)' }}>{p.warning}</div> : null}
                    </div>
                    <span className="kcal">{p.item ? p.item.kcal : '—'}</span>
                  </button>
                  <button type="button" className="icon-btn" style={{ border: 0 }} aria-label={`Remove ${p.food?.name}`} onClick={() => setRow(key, null)}>
                    <Icon name="close" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {rows.length ? (
        <>
          <div className="row between small muted num">
            <span>
              P {Math.round(totals.protein)} · C {Math.round(totals.carbs)} · F {Math.round(totals.fat)} g
            </span>
            <span>
              ≈ {Math.round(totals.kcal)} kcal (±{roundRange(totals.kcalRange)})
            </span>
          </div>
          <button type="button" className="btn primary big block" disabled={!ready.length || unresolved > 0} onClick={() => void submit()}>
            {unresolved > 0
              ? `Fix or remove ${unresolved} unmatched item${unresolved > 1 ? 's' : ''}`
              : `Log ${ready.length} item${ready.length > 1 ? 's' : ''} to ${MEAL_LABEL[logMeal]}`}
          </button>
        </>
      ) : (
        <p className="small muted">
          Portions: plate fractions (½ plate), palm, fist, handful, thumb, scoop, ladle, bowl, clamshell, slices, pieces, cups, oz, g.
          Sizes: small, big, heaping.
        </p>
      )}

      {editing ? (
        <EditParsed
          p={editing.item}
          onClose={() => setEditing(null)}
          onSave={(np) => {
            setRow(editing.key, np);
            setEditing(null);
          }}
        />
      ) : null}
      {creating ? (
        <FoodEditor
          food={{ ...newCustomFood(), name: rows.find((r) => r.key === creating)?.item.query ?? '' }}
          isNew
          onClose={() => setCreating(null)}
        />
      ) : null}
    </div>
  );
}

function UnmatchedRow({
  p,
  onPick,
  onSearch,
  onCreate,
  onAsk,
  onRemove,
}: {
  p: ParsedItem;
  onPick: (f: NonNullable<ParsedItem['food']>) => void;
  onSearch: () => void;
  onCreate: () => void;
  onAsk: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="stack" style={{ padding: '8px 0' }}>
      <div className="row between">
        <span>
          <span className="badge warn">no match</span> “{p.raw}”
        </span>
        <button type="button" className="icon-btn" style={{ border: 0 }} aria-label={`Remove “${p.raw}”`} onClick={onRemove}>
          <Icon name="close" />
        </button>
      </div>
      {p.suggestions.length ? (
        <div className="chips" aria-label="Suggestions">
          {p.suggestions.slice(0, 4).map((f) => (
            <button key={f.id} type="button" className="chip" onClick={() => onPick(f)}>
              {f.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="chips">
        <button type="button" className="chip" onClick={onSearch}>
          <Icon name="search" /> Search
        </button>
        <button type="button" className="chip" onClick={onCreate}>
          + Custom food
        </button>
        <button type="button" className="chip" onClick={onAsk}>
          Ask Claude
        </button>
      </div>
    </div>
  );
}

function EditParsed({ p, onClose, onSave }: { p: ParsedItem; onClose: () => void; onSave: (p: ParsedItem) => void }) {
  const { portionRefs } = useSettings();
  const [draft, setDraft] = useState<ParsedItem>(p);
  const [picking, setPicking] = useState(!p.food);
  if (picking || !draft.food || !draft.spec) {
    return (
      <Sheet title={`Food for “${p.raw}”`} onClose={onClose}>
        <FoodPicker
          autoFocus
          initialQuery={p.query}
          onPick={(f) => {
            setDraft(withFood(draft, f, portionRefs));
            setPicking(false);
          }}
        />
      </Sheet>
    );
  }
  return (
    <Sheet title={draft.food.name} onClose={onClose}>
      <div className="row between">
        <span className="small muted">From “{p.raw}”</span>
        <button type="button" className="btn small" onClick={() => setPicking(true)}>
          Change food
        </button>
      </div>
      <PortionPicker food={draft.food} refs={portionRefs} value={draft.spec} onChange={(spec) => setDraft(withFood(draft, draft.food!, portionRefs, spec))} />
      <button type="button" className="btn primary big block" disabled={!draft.item} onClick={() => onSave(draft)}>
        Done
      </button>
    </Sheet>
  );
}
