import { useState } from 'react';
import { DateSwitcher } from '../components/DateSwitcher';
import { FoodPicker } from '../components/FoodPicker';
import { MealPicker } from '../components/MealPicker';
import { PortionPicker } from '../components/PortionPicker';
import { Icon, Segmented, Sheet } from '../components/ui';
import { ScanLabelProvider, useScanLabel } from '../components/ScanLabel';
import { useSettings } from '../hooks';
import type { FoodRecord } from '../lib/foods';
import { addItems, deleteEntries, MEAL_LABEL } from '../lib/log';
import { defaultSpec, itemFromFood } from '../lib/portions';
import type { LoggedItem, PortionSpec } from '../lib/types';
import { useApp } from '../state';
import { QuickLog } from './QuickLog';
import { SavedMeals } from './SavedMeals';
import { LabelEntry } from './LabelEntry';
import { AskClaude, PasteFromClaude } from './ClaudeBridge';

export const LOG_TABS = [
  { value: 'quick', label: 'Quick text' },
  { value: 'search', label: 'Search' },
  { value: 'saved', label: 'Saved meals' },
  { value: 'label', label: 'Label' },
  { value: 'ask', label: 'Ask Claude' },
  { value: 'paste', label: 'Paste' },
] as const;
export type LogTab = (typeof LOG_TABS)[number]['value'];

/** Log items into the current date + meal and show an undo toast. */
export function useLogItems() {
  const { date, logMeal, toast } = useApp();
  return async (items: LoggedItem[], label?: string) => {
    if (!items.length) return;
    const ids = await addItems(date, logMeal, items);
    const kcal = items.reduce((s, i) => s + i.kcal, 0);
    toast(`${label ?? (items.length === 1 ? items[0].name : `${items.length} items`)} added to ${MEAL_LABEL[logMeal]} · ${Math.round(kcal)} kcal`, {
      label: 'Undo',
      run: () => void deleteEntries(ids),
    });
  };
}

export function Log() {
  return (
    <ScanLabelProvider>
      <LogScreen />
    </ScanLabelProvider>
  );
}

function LogScreen() {
  const { route, go, logMeal, setLogMeal } = useApp();
  const { scanWithCamera, scanFromLibrary } = useScanLabel();
  const tab: LogTab = LOG_TABS.some((t) => t.value === route.sub) ? (route.sub as LogTab) : 'quick';
  return (
    <div className="page">
      <div className="page-header">
        <h1>Log food</h1>
      </div>
      <DateSwitcher />
      <MealPicker value={logMeal} onChange={setLogMeal} />
      <div className="row">
        <button type="button" className="btn grow" onClick={scanWithCamera}>
          <Icon name="camera" /> Scan label
        </button>
        <button type="button" className="btn" onClick={scanFromLibrary}>
          From photos
        </button>
      </div>
      <Segmented label="Log method" options={LOG_TABS} value={tab} onChange={(t) => go('log', t)} />
      <section className="card">
        {tab === 'quick' ? <QuickLog /> : null}
        {tab === 'search' ? <TapToBuild /> : null}
        {tab === 'saved' ? <SavedMeals /> : null}
        {tab === 'label' ? <LabelEntry /> : null}
        {tab === 'ask' ? <AskClaude /> : null}
        {tab === 'paste' ? <PasteFromClaude /> : null}
      </section>
    </div>
  );
}

function TapToBuild() {
  const [food, setFood] = useState<FoodRecord | null>(null);
  return (
    <>
      <FoodPicker onPick={setFood} />
      {food ? <AddFoodSheet food={food} onClose={() => setFood(null)} /> : null}
    </>
  );
}

export function AddFoodSheet({ food, onClose, initial }: { food: FoodRecord; onClose: () => void; initial?: PortionSpec }) {
  const { portionRefs } = useSettings();
  const { logMeal } = useApp();
  const logItems = useLogItems();
  const [spec, setSpec] = useState<PortionSpec>(initial ?? defaultSpec(food, portionRefs));
  const item = itemFromFood(food, spec, portionRefs);
  return (
    <Sheet title={food.name} onClose={onClose}>
      <PortionPicker food={food} refs={portionRefs} value={spec} onChange={setSpec} />
      <button
        type="button"
        className="btn primary big block"
        disabled={!item}
        onClick={() => {
          if (!item) return;
          void logItems([item]);
          onClose();
        }}
      >
        Add to {MEAL_LABEL[logMeal]}
      </button>
    </Sheet>
  );
}
