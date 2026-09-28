import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from '../components/ui';
import { NumberField } from '../components/NumberField';
import { buildPrompt, claudeItemToFood, claudeItemToLogged, parseClaudeReply, type ClaudeItem } from '../lib/claudeImport';
import { MEAL_LABEL } from '../lib/log';
import { roundRange, sumItems } from '../lib/portions';
import { useApp } from '../state';
import { saveFood } from './FoodEditor';
import { useLogItems } from './Log';
import { ASK_CLAUDE_KEY } from './QuickLog';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older Safari / non-secure contexts.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function AskClaude() {
  const { go, toast } = useApp();
  const [desc, setDesc] = useState(() => {
    try {
      const v = sessionStorage.getItem(ASK_CLAUDE_KEY) ?? '';
      sessionStorage.removeItem(ASK_CLAUDE_KEY);
      return v;
    } catch {
      return '';
    }
  });
  const [copied, setCopied] = useState<boolean | null>(null);
  const prompt = buildPrompt(desc);
  return (
    <div className="stack">
      <p className="small">
        Use the Claude app as your scanner: it reads a <b>nutrition label photo</b>, a <b>photo of your plate</b>, or a description, and
        replies with numbers this app can import.
      </p>
      <div className="field">
        <label htmlFor="ask-desc">Description (optional — or just attach a photo in Claude)</label>
        <textarea
          id="ask-desc"
          className="input"
          rows={2}
          placeholder="a big apple and about a cup of trail mix"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
      </div>
      <button
        type="button"
        className="btn primary big block"
        onClick={() =>
          void copyText(prompt).then((ok) => {
            setCopied(ok);
            if (ok) toast('Prompt copied — paste it into Claude');
          })
        }
      >
        Copy prompt for Claude
      </button>
      {copied === false ? (
        <div className="stack">
          <p className="small banner warn">Couldn’t copy automatically. Select all the text below and copy it.</p>
          <textarea className="input" rows={8} readOnly value={prompt} onFocus={(e) => e.target.select()} aria-label="Prompt text" />
        </div>
      ) : null}
      <ol className="small" style={{ paddingLeft: 20, margin: 0 }}>
        <li>Tap <b>Copy prompt</b>.</li>
        <li>
          Open the Claude app (or{' '}
          <a href="https://claude.ai/new" target="_blank" rel="noreferrer">
            claude.ai
          </a>
          ), paste, and attach a photo if you have one.
        </li>
        <li>When Claude replies, copy its <b>whole reply</b> (long-press → Copy).</li>
        <li>
          Come back and use the <b>Paste</b> tab.
        </li>
      </ol>
      <button type="button" className="btn block" onClick={() => go('log', 'paste')}>
        Go to Paste from Claude →
      </button>
      <details>
        <summary>See the prompt</summary>
        <pre className="code">{prompt}</pre>
      </details>
    </div>
  );
}

interface Draft {
  item: ClaudeItem;
  include: boolean;
  multiplier: number;
  save: boolean;
}

export function PasteFromClaude() {
  const { logMeal, setLogMeal, toast } = useApp();
  const logItems = useLogItems();
  const [reply, setReply] = useState('');
  const result = useMemo(() => (reply.trim() ? parseClaudeReply(reply) : null), [reply]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const lastMeal = useRef<string | null>(null);

  useEffect(() => {
    setDrafts(result ? result.items.map((item) => ({ item, include: true, multiplier: 1, save: !!item.saveAs })) : []);
    if (result?.meal && lastMeal.current !== reply) {
      lastMeal.current = reply;
      setLogMeal(result.meal);
    }
  }, [result, reply, setLogMeal]);

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setReply(t);
    } catch {
      toast('Clipboard access blocked — long-press the box and choose Paste');
    }
  };

  const chosen = drafts.filter((d) => d.include);
  const logged = chosen.map((d) => claudeItemToLogged(d.item, d.multiplier));
  const totals = sumItems(logged);

  const submit = async () => {
    const items = [];
    let saved = 0;
    for (const d of chosen) {
      let foodId: string | null = null;
      if (d.save) {
        const food = claudeItemToFood(d.item);
        if (food) {
          await saveFood(food);
          foodId = food.id;
          saved++;
        }
      }
      items.push(claudeItemToLogged(d.item, d.multiplier, foodId));
    }
    await logItems(items);
    if (saved) toast(`Logged ${items.length} item${items.length > 1 ? 's' : ''}, saved ${saved} new food${saved > 1 ? 's' : ''}`);
    setReply('');
  };

  const update = (i: number, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const updateItem = (i: number, patch: Partial<ClaudeItem>) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, item: { ...d.item, ...patch } } : d)));

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="claude-reply">Paste Claude’s whole reply</label>
        <textarea
          id="claude-reply"
          className="input"
          rows={5}
          placeholder="Paste here — text around the JSON is fine."
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
      </div>
      <div className="row">
        <button type="button" className="btn small" onClick={() => void pasteFromClipboard()}>
          Paste from clipboard
        </button>
        {reply ? (
          <button type="button" className="btn small ghost" onClick={() => setReply('')}>
            Clear
          </button>
        ) : null}
      </div>

      {result?.errors.length ? (
        <div className="banner danger" role="alert">
          {result.errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      ) : null}
      {result?.invalid.length ? (
        <div className="banner warn" role="alert">
          <p>
            <b>
              {result.invalid.length} item{result.invalid.length > 1 ? 's' : ''} couldn’t be read and won’t be logged:
            </b>
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {result.invalid.map((inv) => (
              <li key={inv.index}>
                Item {inv.index + 1}
                {inv.name ? ` (“${inv.name}”)` : ''}: {inv.problems.join('; ')}
              </li>
            ))}
          </ul>
          <p className="small">Add them by hand in the Label tab, or ask Claude to fix its JSON and paste again.</p>
        </div>
      ) : null}
      {result?.warnings.length ? (
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      {result?.notes ? (
        <p className="small">
          <b>Claude’s notes:</b> {result.notes}
        </p>
      ) : null}

      {drafts.map((d, i) => (
        <div key={i} className="card stack" style={{ boxShadow: 'none', opacity: d.include ? 1 : 0.6 }}>
          <div className="row between">
            <Check label={d.item.name} checked={d.include} onChange={(include) => update(i, { include })} />
            <b className="num">{Math.round(d.item.calories * d.multiplier)} kcal</b>
          </div>
          <div className="small muted">
            {d.item.portionText} · ±{d.item.uncertaintyPct}%
          </div>
          {d.include ? (
            <>
              <div className="chips" role="group" aria-label="Amount">
                {[0.5, 1, 1.5, 2].map((m) => (
                  <button key={m} type="button" className="chip" aria-pressed={d.multiplier === m} onClick={() => update(i, { multiplier: m })}>
                    {m === 0.5 ? '½×' : m === 1.5 ? '1½×' : `${m}×`}
                  </button>
                ))}
              </div>
              <details>
                <summary>Edit numbers</summary>
                <div className="grid-2">
                  <NumberField
                    label="Calories"
                    unit="kcal"
                    value={d.item.calories}
                    digits={0}
                    rules={{ min: 0, max: 10000, required: true, label: 'Calories', unit: 'kcal' }}
                    onCommit={(v) => v != null && updateItem(i, { calories: v })}
                  />
                  <NumberField label="Protein" unit="g" value={d.item.protein} digits={1} rules={{ min: 0, max: 1000, label: 'Protein', unit: 'g' }} onCommit={(v) => updateItem(i, { protein: v ?? 0 })} />
                  <NumberField label="Carbs" unit="g" value={d.item.carbs} digits={1} rules={{ min: 0, max: 1000, label: 'Carbs', unit: 'g' }} onCommit={(v) => updateItem(i, { carbs: v ?? 0 })} />
                  <NumberField label="Fat" unit="g" value={d.item.fat} digits={1} rules={{ min: 0, max: 1000, label: 'Fat', unit: 'g' }} onCommit={(v) => updateItem(i, { fat: v ?? 0 })} />
                </div>
              </details>
              {d.item.saveAs ? (
                <Check
                  label={`Save to my foods (per ${d.item.saveAs.per}${d.item.saveAs.grams ? `, ${d.item.saveAs.grams} g` : ''})`}
                  checked={d.save}
                  onChange={(save) => update(i, { save })}
                />
              ) : null}
            </>
          ) : null}
        </div>
      ))}

      {drafts.length ? (
        <>
          <div className="row between small muted num">
            <span>
              P {Math.round(totals.protein)} · C {Math.round(totals.carbs)} · F {Math.round(totals.fat)} g
            </span>
            <span>
              ≈ {Math.round(totals.kcal)} kcal (±{roundRange(totals.kcalRange)})
            </span>
          </div>
          <button type="button" className="btn primary big block" disabled={!chosen.length} onClick={() => void submit()}>
            Log {chosen.length} item{chosen.length === 1 ? '' : 's'} to {MEAL_LABEL[logMeal]}
          </button>
        </>
      ) : null}
    </div>
  );
}
