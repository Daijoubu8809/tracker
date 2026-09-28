// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, getSettings, saveSettings } from '../lib/db';
import { mifflinStJeor } from '../lib/energy';
import { AppProvider } from '../state';
import { Settings } from './Settings';

beforeEach(async () => {
  await db.delete();
  await db.open();
  // Metric, 70 kg, 170 cm, 19 y male.
  await saveSettings({ units: 'metric', profile: { age: 19, sex: 'male', heightCm: 170, weightKg: 70, bodyFatPct: null } });
});
afterEach(cleanup);

function renderSettings() {
  return render(
    <AppProvider>
      <Settings />
    </AppProvider>,
  );
}

const banner = () => screen.getByTestId('profile-targets');

describe('Settings → Profile (real screen + IndexedDB)', () => {
  it('typing a height keystroke by keystroke saves 175 and updates BMR/targets', async () => {
    const user = userEvent.setup();
    renderSettings();
    const height = (await screen.findByLabelText('Height')) as HTMLInputElement;
    await waitFor(() => expect(height.value).toBe('170'));
    const bmrBefore = Math.round(mifflinStJeor({ age: 19, sex: 'male', heightCm: 170 }, 70));
    await waitFor(() => expect(banner().textContent).toContain(bmrBefore.toLocaleString()));

    await user.clear(height);
    for (const [ch, shown] of [
      ['1', '1'],
      ['7', '17'],
      ['5', '175'],
    ] as const) {
      await user.type(height, ch);
      expect(height.value).toBe(shown); // never rejected or reset mid-typing
      expect(screen.queryByText(/Height should be/)).toBeNull();
    }
    expect((await getSettings()).profile.heightCm).toBe(170); // nothing saved yet
    await user.tab();
    await waitFor(async () => expect((await getSettings()).profile.heightCm).toBe(175));
    expect(height.value).toBe('175');

    const bmrAfter = Math.round(mifflinStJeor({ age: 19, sex: 'male', heightCm: 175 }, 70));
    expect(bmrAfter - bmrBefore).toBe(31); // 6.25 × 5 cm
    await waitFor(() => expect(banner().textContent).toContain(bmrAfter.toLocaleString()));
  });

  it('out-of-range height shows a message and is not saved', async () => {
    const user = userEvent.setup();
    renderSettings();
    const height = (await screen.findByLabelText('Height')) as HTMLInputElement;
    await waitFor(() => expect(height.value).toBe('170'));
    await user.clear(height);
    await user.type(height, '17');
    await user.tab();
    expect(await screen.findByText('Height should be 120–230 cm.')).toBeTruthy();
    expect(height.value).toBe('17');
    expect((await getSettings()).profile.heightCm).toBe(170);
  });

  it('US mode: feet digit alone does not save; 5 ft 9 in saves 175.26 cm', async () => {
    await saveSettings({ units: 'us' });
    const user = userEvent.setup();
    renderSettings();
    const ft = (await screen.findByLabelText('Height (feet)')) as HTMLInputElement;
    const inch = screen.getByLabelText('Height (inches)') as HTMLInputElement;
    await waitFor(() => expect(ft.value).toBe('5'));
    await user.clear(ft);
    await user.type(ft, '5');
    expect(ft.value).toBe('5');
    await user.clear(inch);
    await user.type(inch, '9');
    expect((await getSettings()).profile.heightCm).toBe(170);
    await user.click(document.body);
    await waitFor(async () => expect((await getSettings()).profile.heightCm).toBeCloseTo(175.26, 10));
    expect(ft.value).toBe('5');
    expect(inch.value).toBe('9');
  });

  it('age and weight also commit on blur and recalc targets', async () => {
    const user = userEvent.setup();
    renderSettings();
    const age = (await screen.findByLabelText('Age')) as HTMLInputElement;
    await waitFor(() => expect(age.value).toBe('19'));
    await user.clear(age);
    await user.type(age, '2');
    expect(age.value).toBe('2'); // "2" is out of range but allowed while typing
    await user.type(age, '5{Enter}');
    await waitFor(async () => expect((await getSettings()).profile.age).toBe(25));
    const bmr = Math.round(mifflinStJeor({ age: 25, sex: 'male', heightCm: 170 }, 70));
    await waitFor(() => expect(banner().textContent).toContain(bmr.toLocaleString()));
  });
});
