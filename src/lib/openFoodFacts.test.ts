import { describe, expect, it } from 'vitest';
import { lookupBarcode, normalizeBarcode, productToLabel } from './openFoodFacts';

describe('Open Food Facts mapping', () => {
  it('normalizes typed barcodes', () => {
    expect(normalizeBarcode('0 49000 02890 4')).toBe('049000028904');
    expect(normalizeBarcode('123')).toBeNull();
  });
  it('prefers per-serving values', () => {
    const l = productToLabel({
      product_name: 'Crunchy Peanut Butter',
      brands: 'Jif, Smucker',
      serving_size: '2 tbsp (33 g)',
      serving_quantity: 33,
      nutriments: { 'energy-kcal_serving': 190, proteins_serving: 7, carbohydrates_serving: 8, fat_serving: 16 },
    });
    expect(l).toEqual({ name: 'Jif Crunchy Peanut Butter', servingText: '2 tbsp (33 g)', servingGrams: 33, calories: 190, protein: 7, carbs: 8, fat: 16 });
  });
  it('scales per-100 g values to the serving', () => {
    const l = productToLabel({ product_name: 'Oats', serving_quantity: '40', serving_size: '40 g', nutriments: { 'energy-kcal_100g': 375, proteins_100g: 13, carbohydrates_100g: 60, fat_100g: 7 } });
    expect(l).toMatchObject({ servingGrams: 40, calories: 150, protein: 5.2, carbs: 24, fat: 2.8 });
  });
  it('falls back to 100 g and converts kJ', () => {
    const l = productToLabel({ product_name: 'X', nutriments: { energy_100g: 1046 } });
    expect(l).toMatchObject({ servingText: '100 g', servingGrams: 100, calories: 250 });
  });
});

describe('lookupBarcode', () => {
  const fake = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it('handles found, missing, offline and no-calorie products', async () => {
    expect(await lookupBarcode('1', fake(200, { status: 1, product: { product_name: 'A', nutriments: { 'energy-kcal_100g': 100 } } }))).toMatchObject({ ok: true });
    expect(await lookupBarcode('1', fake(404, {}))).toMatchObject({ ok: false, error: expect.stringMatching(/isn’t in Open Food Facts/) });
    expect(await lookupBarcode('1', fake(200, { status: 0 }))).toMatchObject({ ok: false });
    expect(await lookupBarcode('1', fake(200, { status: 1, product: { product_name: 'A' } }))).toMatchObject({ ok: false, error: expect.stringMatching(/no calorie/) });
    const offline = (async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch;
    expect(await lookupBarcode('1', offline)).toMatchObject({ ok: false, error: expect.stringMatching(/No internet/) });
  });
});
