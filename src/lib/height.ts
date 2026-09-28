import { CM_PER_IN } from './units';

export const HEIGHT_MIN_CM = 120;
export const HEIGHT_MAX_CM = 230;
/** 4'0" – 7'6" */
export const HEIGHT_MIN_IN = 48;
export const HEIGHT_MAX_IN = 90;

/**
 * Split stored cm into feet + inches for display. Tiny float error is removed first
 * (175.26 cm → 68.99999… in) so 5'9" never shows as 5'8.99".
 */
export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalIn = Math.round((cm / CM_PER_IN) * 1e6) / 1e6;
  const ft = Math.floor(totalIn / 12);
  return { ft, inch: Math.round((totalIn - ft * 12) * 1e6) / 1e6 };
}

/** Feet + inches → cm, full precision (5'9" → 175.26). */
export function ftInToCm(ft: number, inch: number): number {
  return (ft * 12 + inch) * CM_PER_IN;
}

export function validateFtIn(ft: number | null, inch: number | null): string | null {
  if (ft == null) return 'Enter your height in feet and inches.';
  const total = ft * 12 + (inch ?? 0);
  if (total < HEIGHT_MIN_IN || total > HEIGHT_MAX_IN) return 'Height should be 4′0″–7′6″.';
  return null;
}
