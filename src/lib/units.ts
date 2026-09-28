import type { UnitSystem } from './types';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
export const KM_PER_MI = 1.609344;
export const G_PER_OZ = 28.349523125;

export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const inToCm = (inch: number) => inch * CM_PER_IN;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const miToKm = (mi: number) => mi * KM_PER_MI;
export const kmToMi = (km: number) => km / KM_PER_MI;

export const round = (n: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export function weightUnit(u: UnitSystem) {
  return u === 'us' ? 'lb' : 'kg';
}
export function lengthUnit(u: UnitSystem) {
  return u === 'us' ? 'in' : 'cm';
}
export function distanceUnit(u: UnitSystem) {
  return u === 'us' ? 'mi' : 'km';
}

/** kg → display number in the user's units. */
export const displayWeight = (kg: number, u: UnitSystem) => (u === 'us' ? kgToLb(kg) : kg);
export const inputWeightToKg = (v: number, u: UnitSystem) => (u === 'us' ? lbToKg(v) : v);
export const displayLength = (cm: number, u: UnitSystem) => (u === 'us' ? cmToIn(cm) : cm);
export const inputLengthToCm = (v: number, u: UnitSystem) => (u === 'us' ? inToCm(v) : v);
export const displayDistance = (km: number, u: UnitSystem) => (u === 'us' ? kmToMi(km) : km);
export const inputDistanceToKm = (v: number, u: UnitSystem) => (u === 'us' ? miToKm(v) : v);

export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 5'10" style height. */
export function formatFeetInches(cm: number): string {
  const totalIn = Math.round(cmToIn(cm));
  return `${Math.floor(totalIn / 12)}′${totalIn % 12}″`;
}

/** Minutes → "m:ss" */
export function formatPace(minPerUnit: number): string {
  if (!Number.isFinite(minPerUnit) || minPerUnit <= 0) return '–';
  let m = Math.floor(minPerUnit);
  let s = Math.round((minPerUnit - m) * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}
