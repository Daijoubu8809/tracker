// Guard: every numeric input in the app must go through NumberField.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

const sources = files(SRC).map((p) => ({ path: p.replace(SRC + '/', ''), text: readFileSync(p, 'utf8') }));

describe('numeric inputs', () => {
  it('no type="number" inputs anywhere', () => {
    const offenders = sources.filter((f) => /type=["']number["']|type:\s*['"]number['"]/.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('inputMode decimal/numeric only appears inside NumberField (plus the barcode ID field)', () => {
    const offenders: string[] = [];
    for (const f of sources) {
      if (f.path === 'components/NumberField.tsx') continue;
      const lines = f.text.split('\n');
      lines.forEach((line, i) => {
        if (!/inputMode=/.test(line)) return;
        const around = lines.slice(Math.max(0, i - 4), i + 1).join('\n');
        if (/data-code-input=/.test(around)) return; // explicitly not a quantity
        offenders.push(`${f.path}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the old per-keystroke NumField is gone', () => {
    expect(sources.filter((f) => /\bNumField\b/.test(f.text)).map((f) => f.path)).toEqual([]);
  });

  it('NumberField is used by every screen with numeric input', () => {
    const expected = [
      'screens/Settings.tsx',
      'components/HeightField.tsx',
      'screens/Body.tsx',
      'screens/Progress.tsx',
      'screens/Training.tsx',
      'components/EntryEditor.tsx',
      'components/NutritionFields.tsx',
      'screens/FoodEditor.tsx',
      'screens/LabelEntry.tsx',
      'screens/ClaudeBridge.tsx',
      'screens/PortionGuide.tsx',
      'screens/TargetsEditors.tsx',
    ];
    for (const p of expected) {
      const f = sources.find((s) => s.path === p);
      expect(f, p).toBeTruthy();
      expect(/<NumberField\b/.test(f!.text), p).toBe(true);
    }
  });

  it('text inputs use 16px so iOS Safari does not zoom', () => {
    const css = readFileSync(join(SRC, 'styles.css'), 'utf8');
    expect(css).toMatch(/\.input,[\s\S]*?font-size:\s*16px/);
  });
});
