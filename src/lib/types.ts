// Core data model. Every stored row has a string `id` and an `updatedAt`
// timestamp (ms) so backups can be merged without creating duplicates:
// same id → keep the newer row. Deletions are soft (`deleted: true`) so an
// old backup can't resurrect something you removed.

export type ISODate = string; // 'YYYY-MM-DD' in local time

export interface Syncable {
  id: string;
  updatedAt: number;
  deleted?: boolean;
}

// ---------- Settings ----------

export type Sex = 'male' | 'female';
export type UnitSystem = 'us' | 'metric';
export type BmrFormula = 'mifflin' | 'harris' | 'katch';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very' | 'extra';
export type GoalMode = 'cut' | 'maintain' | 'bulk' | 'custom';
export type ThemePref = 'system' | 'light' | 'dark';
/** How workouts interact with the calorie budget. */
export type ExerciseMode = 'multiplier' | 'sedentary_plus_exercise';

export interface Profile {
  age: number;
  sex: Sex;
  heightCm: number;
  /** Used when there are no weigh-ins yet. */
  weightKg: number;
  bodyFatPct: number | null;
}

/**
 * A goal. `kcal` means:
 *  - cut: deficit below maintenance (positive number, e.g. 400)
 *  - maintain: offset from maintenance (usually 0, may be e.g. -250)
 *  - bulk: surplus above maintenance (e.g. 300)
 *  - custom: fixed daily calories
 */
export interface GoalSpec {
  mode: GoalMode;
  kcal: number;
}

export interface Phase {
  id: string;
  name: string;
  startDate: ISODate;
  endDate: ISODate; // inclusive
  goal: GoalSpec;
  /** Optional goal weight for progress/pace display. */
  targetWeightKg: number | null;
}

export interface PortionRefs {
  /** Cups of a starch/veg/other food on a full 10–10.5" plate. ½ plate = half of this. */
  plateFullCups: number;
  /** Ounces of meat/fish on a full plate. ¼ plate = a quarter of this. */
  plateFullMeatOz: number;
  palmOz: number;
  fistCups: number;
  cuppedHandCups: number;
  thumbTbsp: number;
  scoopCups: number;
  ladleCups: number;
  bowlCups: number;
  clamshellCups: number;
}

export interface Settings {
  id: 'main';
  updatedAt: number;
  profile: Profile;
  units: UnitSystem;
  formula: BmrFormula;
  eastAsianAdjust: boolean;
  activity: ActivityLevel;
  goal: GoalSpec;
  phases: Phase[];
  maintenanceSource: 'formula' | 'adaptive';
  proteinPerLb: number;
  carbTargetG: number | null;
  fatTargetG: number | null;
  portionRefs: PortionRefs;
  exerciseMode: ExerciseMode;
  theme: ThemePref;
  lastBackupAt: number | null;
  /** 'Remind me later' snooze for the backup reminder. */
  backupSnoozeUntil: number | null;
}

// ---------- Foods ----------

export type FoodCategory =
  | 'starch'
  | 'protein'
  | 'vegetable'
  | 'fruit'
  | 'dairy'
  | 'fat'
  | 'mixed'
  | 'dessert'
  | 'drink'
  | 'breakfast'
  | 'snack'
  | 'condiment';

export type PortionUnit =
  | 'plate'
  | 'palm'
  | 'fist'
  | 'cupped_hand'
  | 'thumb'
  | 'scoop'
  | 'ladle'
  | 'bowl'
  | 'clamshell'
  | 'slice'
  | 'piece'
  | 'serving'
  | 'cup'
  | 'tbsp'
  | 'tsp'
  | 'oz'
  | 'g';

export type SizeMod = 'small' | 'normal' | 'large' | 'heaping';

export interface PortionSpec {
  unit: PortionUnit;
  /** Count or fraction of the unit, e.g. 0.5 for "half a plate". */
  qty: number;
  size: SizeMod;
}

export interface Food {
  id: string;
  name: string;
  /** Extra search words, e.g. "rice" for white rice, "mac n cheese". */
  aliases: string[];
  category: FoodCategory;
  /** Nutrition per 100 g (or per 100 "nominal grams" when `nominal` is true). */
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  fiber100?: number;
  /** mg per 100 g */
  sodium100?: number;
  gramsPerCup?: number;
  gramsPerPiece?: number;
  /** e.g. "cookie", "nugget", "egg" */
  pieceName?: string;
  gramsPerSlice?: number;
  servingGrams?: number;
  /** e.g. "12 fl oz can", "1 bar (40 g)" */
  servingName?: string;
  /**
   * Per-food overrides: grams in ONE of a household unit, e.g. a salad-bar
   * dressing ladle (≈2 tbsp) or a protein-powder scoop (≈31 g).
   */
  gramsPer?: Partial<Record<PortionUnit, number>>;
  /** Portion used when none is typed. */
  defaultUnit: PortionUnit;
  /** Typical estimate error in % (±). */
  uncertaintyPct: number;
  /**
   * True for label foods where the gram weight is unknown: nutrition is then
   * stored per serving (as if 1 serving = 100 g) and only "serving" portions apply.
   */
  nominal?: boolean;
  source: string;
}

/** A custom food or an edit to a built-in food, stored in IndexedDB. */
export interface StoredFood extends Food, Syncable {
  builtin: boolean;
}

// ---------- Log ----------

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export interface Nutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sodium?: number;
}

export type EntrySource = 'food' | 'claude' | 'label' | 'manual';

/** What gets logged (a snapshot, so later edits to a food don't rewrite history). */
export interface LoggedItem extends Nutrition {
  name: string;
  foodId: string | null;
  portion: PortionSpec | null;
  /** Free-text portion when there's no structured portion (e.g. from Claude). */
  portionText: string | null;
  grams: number | null;
  uncertaintyPct: number;
  source: EntrySource;
}

export interface LogEntry extends LoggedItem, Syncable {
  date: ISODate;
  meal: Meal;
  createdAt: number;
}

export interface SavedMeal extends Syncable {
  name: string;
  items: LoggedItem[];
  meal: Meal | null;
}

/** id === foodId */
export type Favorite = Syncable;

// ---------- Body ----------

/** id === date: one weigh-in per day. */
export interface WeightEntry extends Syncable {
  date: ISODate;
  kg: number;
}

/** id === date */
export interface WaistEntry extends Syncable {
  date: ISODate;
  cm: number;
}

/** id === date */
export interface DayNote extends Syncable {
  date: ISODate;
  text: string;
}

// ---------- Training ----------

/** id === date */
export interface StepsEntry extends Syncable {
  date: ISODate;
  steps: number;
}

export interface RunEntry extends Syncable {
  date: ISODate;
  distanceKm: number;
  durationMin: number;
  note: string;
}

export type LiftType = 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full';
export const LIFT_TYPES: readonly LiftType[] = ['push', 'pull', 'legs', 'upper', 'lower', 'full'];

export interface LiftEntry extends Syncable {
  date: ISODate;
  type: LiftType;
  durationMin: number;
  note: string;
}
