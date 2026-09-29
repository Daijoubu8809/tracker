// Remembers whether you usually skip the crop step when scanning a label (per device).

const KEY = 'plate.scan.cropChoices';
type Choice = 'crop' | 'skip';

function read(): Choice[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is Choice => x === 'crop' || x === 'skip') : [];
  } catch {
    return [];
  }
}

export function recordCropChoice(c: Choice): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...read(), c].slice(-5)));
  } catch {
    /* private mode: just don't remember */
  }
}

/** True when at least 2 of your last 3 scans skipped cropping. */
export function usuallySkipsCrop(choices: Choice[] = read()): boolean {
  const last = choices.slice(-3);
  return last.length >= 2 && last.filter((c) => c === 'skip').length >= 2;
}
