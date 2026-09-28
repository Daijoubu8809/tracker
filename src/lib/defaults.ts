import type { PortionRefs, Settings } from './types';
import { inToCm, lbToKg } from './units';

export const DEFAULT_PORTION_REFS: PortionRefs = {
  plateFullCups: 3, // ½ plate ≈ 1.5 cups, ¼ plate ≈ ¾ cup
  plateFullMeatOz: 18, // ¼ plate ≈ 4.5 oz
  palmOz: 4,
  fistCups: 1,
  cuppedHandCups: 0.5,
  thumbTbsp: 1,
  scoopCups: 0.5,
  ladleCups: 0.75,
  bowlCups: 1.75,
  clamshellCups: 3.5,
};

export function defaultSettings(): Settings {
  return {
    id: 'main',
    updatedAt: 0,
    profile: {
      age: 19,
      sex: 'male',
      heightCm: Math.round(inToCm(70) * 10) / 10,
      weightKg: Math.round(lbToKg(165) * 10) / 10,
      bodyFatPct: null,
    },
    units: 'us',
    formula: 'mifflin',
    eastAsianAdjust: false,
    activity: 'very',
    goal: { mode: 'cut', kcal: 400 },
    phases: [],
    maintenanceSource: 'formula',
    proteinPerLb: 0.8,
    carbTargetG: null,
    fatTargetG: null,
    portionRefs: { ...DEFAULT_PORTION_REFS },
    exerciseMode: 'multiplier',
    theme: 'system',
    lastBackupAt: null,
    backupSnoozeUntil: null,
  };
}

export const GOAL_DEFAULT_KCAL = { cut: 400, maintain: 0, bulk: 300, custom: 2200 } as const;
