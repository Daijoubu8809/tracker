// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseNumberInput } from '../lib/numberInput';
import { cmToFtIn, ftInToCm } from '../lib/height';
import type { UnitSystem } from '../lib/types';
import { HeightField } from './HeightField';
import { checkAll, NumberField, useNumberField } from './NumberField';

afterEach(cleanup);

describe('parseNumberInput', () => {
  it('accepts partial and odd-but-valid input', () => {
    expect(parseNumberInput('5.').value).toBe(5);
    expect(parseNumberInput('.5').value).toBe(0.5);
    expect(parseNumberInput('1,5').value).toBe(1.5);
    expect(parseNumberInput('').value).toBeNull();
  });
  it('never rounds or clamps', () => {
    expect(parseNumberInput('175.256', { min: 120, max: 230 }).value).toBe(175.256);
    expect(parseNumberInput('300', { min: 120, max: 230, label: 'Height', unit: 'cm' })).toEqual({
      value: null,
      error: 'Height should be 120–230 cm.',
    });
  });
  it('rejects junk with a calm message', () => {
    expect(parseNumberInput('abc', { label: 'Steps', integer: true }).error).toBe('Steps should be a whole number.');
    expect(parseNumberInput('1.2.3').error).toMatch(/should be a number/);
  });
});

describe('NumberField (autosave mode)', () => {
  it('typing "1" → "17" → "175" never rejects a keystroke and saves 175 once, on blur', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <NumberField label="Height" unit="cm" value={180} onCommit={onCommit} rules={{ min: 120, max: 230, label: 'Height', unit: 'cm' }} />,
    );
    const input = screen.getByLabelText('Height') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.inputMode).toBe('decimal');
    await user.clear(input);
    await user.type(input, '1');
    expect(input.value).toBe('1'); // below the range, but allowed while typing
    expect(screen.queryByRole('status')).toBeNull();
    await user.type(input, '7');
    expect(input.value).toBe('17');
    await user.type(input, '5');
    expect(input.value).toBe('175');
    expect(onCommit).not.toHaveBeenCalled(); // nothing saved per keystroke
    await user.tab();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(175);
  });

  it('commits on Enter', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<NumberField label="Age" value={19} onCommit={onCommit} rules={{ integer: true, min: 13, max: 100 }} />);
    const input = screen.getByLabelText('Age');
    await user.clear(input);
    await user.type(input, '20{Enter}');
    expect(onCommit).toHaveBeenCalledWith(20);
  });

  it('allows "5." and ".5" as drafts', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<NumberField label="Weight" value={null} onCommit={onCommit} />);
    const input = screen.getByLabelText('Weight') as HTMLInputElement;
    await user.type(input, '5.');
    expect(input.value).toBe('5.');
    await user.clear(input);
    await user.type(input, '.5');
    expect(input.value).toBe('.5');
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith(0.5);
  });

  it('out-of-range input keeps what was typed, shows a message, and is not saved', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<NumberField label="Height" value={175} onCommit={onCommit} rules={{ min: 120, max: 230, label: 'Height', unit: 'cm' }} />);
    const input = screen.getByLabelText('Height') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '17');
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('17'); // not silently changed
    expect(screen.getByRole('status').textContent).toBe('Height should be 120–230 cm.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    // Fixing it clears the message and saves.
    await user.type(input, '8');
    expect(screen.queryByRole('status')).toBeNull();
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith(178);
  });

  it('a stale value arriving while typing does not reset the draft (the iPhone bug)', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [v, setV] = useState<number | null>(170);
      return (
        <>
          <NumberField label="Height" value={v} onCommit={setV} />
          <button type="button" onClick={() => setV(1)}>
            echo
          </button>
        </>
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText('Height') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '17');
    // Simulate an async DB echo landing mid-typing without blurring the field.
    act(() => screen.getByText('echo').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(input.value).toBe('17');
  });

  it('follows external changes when not focused', () => {
    const { rerender } = render(<NumberField label="Steps" value={100} onCommit={() => {}} />);
    rerender(<NumberField label="Steps" value={9500} onCommit={() => {}} />);
    expect((screen.getByLabelText('Steps') as HTMLInputElement).value).toBe('9500');
  });

  it('does not save when the text is unchanged (no drift from display formatting)', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<NumberField label="Weight" value={74.84274105} digits={1} onCommit={onCommit} />);
    await user.click(screen.getByLabelText('Weight'));
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('uses the numeric keypad for integers and 16px-friendly text inputs everywhere', () => {
    render(<NumberField label="Steps" value={1} onCommit={() => {}} rules={{ integer: true }} />);
    const input = screen.getByLabelText('Steps') as HTMLInputElement;
    expect(input.inputMode).toBe('numeric');
    expect(input.className).toContain('input'); // .input sets font-size: 16px
  });
});

describe('NumberField (form mode, commit on Save)', () => {
  function Form({ onSave }: { onSave: (v: number) => void }) {
    const dist = useNumberField(null, { min: 0.01, max: 100, required: true, label: 'Distance', unit: 'mi' });
    return (
      <>
        <NumberField label="Distance" unit="mi" field={dist} />
        <button
          type="button"
          onClick={() => {
            const r = checkAll([dist]);
            if (r.ok) onSave(r.values[0]!);
          }}
        >
          Save
        </button>
      </>
    );
  }
  it('validates on Save and only saves valid input', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Form onSave={onSave} />);
    await user.click(screen.getByText('Save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Enter distance.');
    await user.type(screen.getByLabelText('Distance'), '3.1');
    await user.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith(3.1);
  });
});

describe('HeightField', () => {
  function Harness({ initialCm, initialUnits = 'metric' }: { initialCm: number; initialUnits?: UnitSystem }) {
    const [cm, setCm] = useState(initialCm);
    const [units, setUnits] = useState<UnitSystem>(initialUnits);
    return (
      <>
        <HeightField cm={cm} units={units} onCommit={setCm} />
        <button type="button" onClick={() => setUnits((u) => (u === 'us' ? 'metric' : 'us'))}>
          toggle
        </button>
        <output data-testid="cm">{cm}</output>
      </>
    );
  }

  it('ft/in ↔ cm switching is stable across 10 toggles (175 cm stays 175)', async () => {
    const user = userEvent.setup();
    render(<Harness initialCm={175} />);
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      await user.click(screen.getByText('toggle'));
      if (i % 2 === 0) {
        seen.add(`${(screen.getByLabelText('Height (feet)') as HTMLInputElement).value}/${(screen.getByLabelText('Height (inches)') as HTMLInputElement).value}`);
      } else {
        seen.add((screen.getByLabelText('Height') as HTMLInputElement).value);
      }
      expect(screen.getByTestId('cm').textContent).toBe('175');
    }
    expect([...seen].sort()).toEqual(['175', '5/8.9']);
  });

  it('entering 5 ft 9 in stores 175.26 cm exactly and shows 5 / 9 after 10 toggles', async () => {
    const user = userEvent.setup();
    render(<Harness initialCm={170} initialUnits="us" />);
    const ft = screen.getByLabelText('Height (feet)');
    const inch = screen.getByLabelText('Height (inches)');
    await user.clear(ft);
    await user.type(ft, '5');
    await user.clear(inch);
    await user.type(inch, '9');
    await user.click(screen.getByTestId('cm')); // tap outside → commit
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(Number(screen.getByTestId('cm').textContent)).toBeCloseTo(175.26, 10);
    for (let i = 0; i < 10; i++) await user.click(screen.getByText('toggle'));
    expect(Number(screen.getByTestId('cm').textContent)).toBeCloseTo(175.26, 10);
    expect((screen.getByLabelText('Height (feet)') as HTMLInputElement).value).toBe('5');
    expect((screen.getByLabelText('Height (inches)') as HTMLInputElement).value).toBe('9');
  });

  it('typing the feet digit does not touch inches or save mid-edit', async () => {
    const user = userEvent.setup();
    render(<Harness initialCm={175.26} initialUnits="us" />);
    const ft = screen.getByLabelText('Height (feet)') as HTMLInputElement;
    const inch = screen.getByLabelText('Height (inches)') as HTMLInputElement;
    await user.clear(ft);
    await user.type(ft, '6');
    expect(inch.value).toBe('9');
    expect(Number(screen.getByTestId('cm').textContent)).toBeCloseTo(175.26, 10);
    await user.click(inch); // moving ft → in is not a commit
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(Number(screen.getByTestId('cm').textContent)).toBeCloseTo(175.26, 10);
    await user.clear(inch);
    await user.type(inch, '9.5');
    await user.click(screen.getByTestId('cm'));
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(Number(screen.getByTestId('cm').textContent)).toBeCloseTo(ftInToCm(6, 9.5), 10);
  });

  it('out-of-range feet/inches shows a calm message and keeps the old height', async () => {
    const user = userEvent.setup();
    render(<Harness initialCm={175} initialUnits="us" />);
    const ft = screen.getByLabelText('Height (feet)');
    await user.clear(ft);
    await user.type(ft, '3');
    await user.click(screen.getByTestId('cm'));
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(screen.getByText('Height should be 4′0″–7′6″.')).toBeTruthy();
    expect(screen.getByTestId('cm').textContent).toBe('175');
    expect((ft as HTMLInputElement).value).toBe('3');
  });

  it('metric: out-of-range cm is not saved', async () => {
    const user = userEvent.setup();
    render(<Harness initialCm={175} />);
    const input = screen.getByLabelText('Height');
    await user.clear(input);
    await user.type(input, '1750');
    await user.tab();
    expect(screen.getByText('Height should be 120–230 cm.')).toBeTruthy();
    expect(screen.getByTestId('cm').textContent).toBe('175');
  });

  it('cmToFtIn has no float fuzz', () => {
    expect(cmToFtIn(175.26)).toEqual({ ft: 5, inch: 9 });
    expect(cmToFtIn(ftInToCm(5, 11.5))).toEqual({ ft: 5, inch: 11.5 });
    expect(cmToFtIn(182.88)).toEqual({ ft: 6, inch: 0 });
  });
});
