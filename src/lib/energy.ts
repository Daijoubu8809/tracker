import type { ActivityLevel, BmrFormula, GoalSpec, ISODate, Phase, Profile, Settings } from './types';
import { kgToLb } from './units';

export const ACTIVITY: Record<ActivityLevel, { label: string; factor: number; hint: string }> = {
  sedentary: { label: 'Sedentary', factor: 1.2, hint: 'Desk/class, little walking' },
  light: { label: 'Light', factor: 1.375, hint: 'Light exercise 1–3 days/wk' },
  moderate: { label: 'Moderate', factor: 1.55, hint: 'Exercise 3–5 days/wk' },
  very: { label: 'Very active', factor: 1.725, hint: 'Hard exercise 6–7 days/wk' },
  extra: { label: 'Extra active', factor: 1.9, hint: 'Very hard training or physical job' },
};

export const FORMULA_LABEL: Record<BmrFormula, string> = {
  mifflin: 'Mifflin-St Jeor',
  harris: 'Harris-Benedict (revised)',
  katch: 'Katch-McArdle',
};

export const EAST_ASIAN_FACTOR = 0.95;

export function mifflinStJeor(p: Pick<Profile, 'sex' | 'age' | 'heightCm'>, weightKg: number): number {
  return 10 * weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}

/** Roza & Shizgal (1984) revision of Harris-Benedict. */
export function harrisBenedictRevised(p: Pick<Profile, 'sex' | 'age' | 'heightCm'>, weightKg: number): number {
  return p.sex === 'male'
    ? 88.362 + 13.397 * weightKg + 4.799 * p.heightCm - 5.677 * p.age
    : 447.593 + 9.247 * weightKg + 3.098 * p.heightCm - 4.33 * p.age;
}

export function katchMcArdle(weightKg: number, bodyFatPct: number): number {
  const lbm = weightKg * (1 - bodyFatPct / 100);
  return 370 + 21.6 * lbm;
}

export interface BmrResult {
  bmr: number;
  formula: BmrFormula;
  /** Human-readable steps that show where the number comes from. */
  steps: string[];
  /** Set when the chosen formula couldn't be used (e.g. Katch without body fat). */
  fellBackFrom: BmrFormula | null;
}

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();

export function computeBmr(
  profile: Profile,
  weightKg: number,
  formula: BmrFormula,
  eastAsianAdjust: boolean,
): BmrResult {
  const steps: string[] = [];
  let used = formula;
  let fellBackFrom: BmrFormula | null = null;
  if (formula === 'katch' && (profile.bodyFatPct == null || !(profile.bodyFatPct > 0))) {
    used = 'mifflin';
    fellBackFrom = 'katch';
    steps.push('Katch-McArdle needs body fat % — using Mifflin-St Jeor instead.');
  }
  const w = weightKg;
  const h = profile.heightCm;
  const a = profile.age;
  let bmr: number;
  if (used === 'mifflin') {
    bmr = mifflinStJeor(profile, w);
    steps.push(
      `Mifflin-St Jeor: 10 × ${f1(w)} kg + 6.25 × ${f1(h)} cm − 5 × ${a} ${profile.sex === 'male' ? '+ 5' : '− 161'} = ${Math.round(bmr)} kcal`,
    );
  } else if (used === 'harris') {
    bmr = harrisBenedictRevised(profile, w);
    steps.push(
      profile.sex === 'male'
        ? `Harris-Benedict: 88.362 + 13.397 × ${f1(w)} + 4.799 × ${f1(h)} − 5.677 × ${a} = ${Math.round(bmr)} kcal`
        : `Harris-Benedict: 447.593 + 9.247 × ${f1(w)} + 3.098 × ${f1(h)} − 4.330 × ${a} = ${Math.round(bmr)} kcal`,
    );
  } else {
    const bf = profile.bodyFatPct ?? 0;
    const lbm = w * (1 - bf / 100);
    bmr = katchMcArdle(w, bf);
    steps.push(`Lean mass: ${f1(w)} kg × (1 − ${bf}%) = ${f1(lbm)} kg`);
    steps.push(`Katch-McArdle: 370 + 21.6 × ${f1(lbm)} = ${Math.round(bmr)} kcal`);
  }
  if (eastAsianAdjust && used !== 'katch') {
    const adj = bmr * EAST_ASIAN_FACTOR;
    steps.push(`East Asian adjustment: ${Math.round(bmr)} × 0.95 = ${Math.round(adj)} kcal`);
    bmr = adj;
  }
  return { bmr, formula: used, steps, fellBackFrom };
}

export function tdeeFromBmr(bmr: number, activity: ActivityLevel): number {
  return bmr * ACTIVITY[activity].factor;
}

export function activePhase(phases: Phase[], date: ISODate): Phase | null {
  return phases.find((p) => p.startDate <= date && date <= p.endDate) ?? null;
}

export function goalLabel(g: GoalSpec): string {
  switch (g.mode) {
    case 'cut':
      return `Cut (−${g.kcal})`;
    case 'bulk':
      return `Lean bulk (+${g.kcal})`;
    case 'maintain':
      return g.kcal === 0 ? 'Maintain' : `Maintain (${g.kcal > 0 ? '+' : '−'}${Math.abs(g.kcal)})`;
    case 'custom':
      return `Custom (${g.kcal} kcal)`;
  }
}

export function applyGoal(maintenance: number, g: GoalSpec): number {
  switch (g.mode) {
    case 'cut':
      return maintenance - Math.abs(g.kcal);
    case 'bulk':
      return maintenance + Math.abs(g.kcal);
    case 'maintain':
      return maintenance + g.kcal;
    case 'custom':
      return g.kcal;
  }
}

export interface DailyTargets {
  bmr: BmrResult;
  formulaTdee: number;
  /** Maintenance actually used (formula or adaptive). */
  maintenance: number;
  maintenanceSource: 'formula' | 'adaptive';
  goal: GoalSpec;
  phase: Phase | null;
  /** Exercise calories added to the budget (only in sedentary+exercise mode). */
  exerciseAdded: number;
  calories: number;
  belowBmr: boolean;
  proteinG: number;
  carbsG: number | null;
  fatG: number | null;
  steps: string[];
}

export interface TargetInputs {
  settings: Settings;
  date: ISODate;
  /** Current body weight (trend if available). */
  weightKg: number;
  adaptiveMaintenance: number | null;
  /** Estimated exercise burn for the day (reference only unless mode = sedentary_plus_exercise). */
  exerciseKcal: number;
}

export function computeTargets(input: TargetInputs): DailyTargets {
  const { settings: s, date, weightKg, adaptiveMaintenance, exerciseKcal } = input;
  const bmr = computeBmr(s.profile, weightKg, s.formula, s.eastAsianAdjust);
  const addExercise = s.exerciseMode === 'sedentary_plus_exercise';
  const activity: ActivityLevel = addExercise ? 'sedentary' : s.activity;
  const formulaTdee = tdeeFromBmr(bmr.bmr, activity);
  const steps = [...bmr.steps];
  steps.push(
    `Maintenance (TDEE): ${Math.round(bmr.bmr)} × ${ACTIVITY[activity].factor} (${ACTIVITY[activity].label}${
      addExercise ? ', exercise added separately' : ''
    }) = ${Math.round(formulaTdee)} kcal`,
  );

  const useAdaptive = s.maintenanceSource === 'adaptive' && adaptiveMaintenance != null;
  const maintenance = useAdaptive ? adaptiveMaintenance : formulaTdee;
  if (useAdaptive) steps.push(`Using adaptive maintenance from your weight trend: ${Math.round(maintenance)} kcal`);

  const phase = activePhase(s.phases, date);
  const goal = phase ? phase.goal : s.goal;
  let calories = applyGoal(maintenance, goal);
  steps.push(
    `Goal${phase ? ` (phase “${phase.name}”)` : ''}: ${goalLabel(goal)} → ${Math.round(calories)} kcal`,
  );
  // Adaptive maintenance already reflects real activity, so never add exercise on top of it.
  const exerciseAdded = addExercise && !useAdaptive && goal.mode !== 'custom' ? Math.round(exerciseKcal) : 0;
  if (exerciseAdded > 0) {
    calories += exerciseAdded;
    steps.push(`+ logged exercise ≈ ${exerciseAdded} kcal → ${Math.round(calories)} kcal`);
  }
  const belowBmr = calories < bmr.bmr;
  const proteinG = kgToLb(weightKg) * s.proteinPerLb;
  steps.push(`Protein: ${s.proteinPerLb} g × ${Math.round(kgToLb(weightKg))} lb = ${Math.round(proteinG)} g`);
  return {
    bmr,
    formulaTdee,
    maintenance,
    maintenanceSource: useAdaptive ? 'adaptive' : 'formula',
    goal,
    phase,
    exerciseAdded,
    calories: Math.round(calories),
    belowBmr,
    proteinG: Math.round(proteinG),
    carbsG: s.carbTargetG,
    fatG: s.fatTargetG,
    steps,
  };
}

// ---------- Exercise burn estimates (reference only) ----------

/** ≈0.5 kcal per kg per 1000 steps (walking, net of resting). */
export function stepsKcal(steps: number, weightKg: number): number {
  return steps * 0.0005 * weightKg;
}

/** Running costs ≈1 kcal per kg per km regardless of pace. */
export function runKcal(distanceKm: number, weightKg: number): number {
  return distanceKm * weightKg * 1.0;
}

/** Resistance training ≈ 5 METs gross; net of resting ≈ 4 METs. */
export function liftKcal(durationMin: number, weightKg: number): number {
  return 4 * weightKg * (durationMin / 60);
}

/** Steps a sedentary day already includes (covered by the 1.2 multiplier). */
export const BASELINE_STEPS = 4000;

export function dayExerciseKcal(
  day: { steps: number | null; runs: { distanceKm: number }[]; lifts: { durationMin: number }[] },
  weightKg: number,
): number {
  const s = day.steps != null ? stepsKcal(Math.max(0, day.steps - BASELINE_STEPS), weightKg) : 0;
  const r = day.runs.reduce((sum, x) => sum + runKcal(x.distanceKm, weightKg), 0);
  const l = day.lifts.reduce((sum, x) => sum + liftKcal(x.durationMin, weightKg), 0);
  return s + r + l;
}
