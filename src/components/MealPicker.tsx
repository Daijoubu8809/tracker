import { MEAL_LABEL } from '../lib/log';
import { MEALS, type Meal } from '../lib/types';
import { Segmented } from './ui';

export function MealPicker({ value, onChange }: { value: Meal; onChange: (m: Meal) => void }) {
  return <Segmented label="Meal" options={MEALS.map((m) => ({ value: m, label: MEAL_LABEL[m] }))} value={value} onChange={onChange} />;
}
