// Open Food Facts lookup (free, no key): https://world.openfoodfacts.org
import type { LabelPrefill } from '../screens/LabelEntry';

export function normalizeBarcode(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
}

type Nutriments = Record<string, number | string | undefined>;

interface OffProduct {
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Nutriments;
}

const numOf = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};

/** Map an Open Food Facts product to the label form (per serving if available, else per 100 g). */
export function productToLabel(p: OffProduct): LabelPrefill | null {
  const n = p.nutriments ?? {};
  const kcal = (suffix: string) => numOf(n[`energy-kcal${suffix}`]) ?? (numOf(n[`energy${suffix}`]) != null ? numOf(n[`energy${suffix}`])! / 4.184 : null);
  const brand = p.brands?.split(',')[0]?.trim();
  const name = [brand, p.product_name?.trim()].filter(Boolean).join(' ') || undefined;
  const servingGrams = numOf(p.serving_quantity);
  const perServing = kcal('_serving');
  if (perServing != null) {
    return {
      name,
      servingText: p.serving_size?.trim() || '1 serving',
      servingGrams: servingGrams && servingGrams > 0 ? servingGrams : null,
      calories: Math.round(perServing),
      protein: numOf(n.proteins_serving) ?? undefined,
      carbs: numOf(n.carbohydrates_serving) ?? undefined,
      fat: numOf(n.fat_serving) ?? undefined,
    };
  }
  const per100 = kcal('_100g');
  if (per100 == null) return name ? { name } : null;
  // Scale 100 g values to the serving when the serving weight is known.
  const f = servingGrams && servingGrams > 0 ? servingGrams / 100 : 1;
  const r = (v: number | null) => (v == null ? undefined : Math.round(v * f * 10) / 10);
  return {
    name,
    servingText: f === 1 ? '100 g' : p.serving_size?.trim() || `${servingGrams} g`,
    servingGrams: f === 1 ? 100 : servingGrams,
    calories: Math.round(per100 * f),
    protein: r(numOf(n.proteins_100g)),
    carbs: r(numOf(n.carbohydrates_100g)),
    fat: r(numOf(n.fat_100g)),
  };
}

export type LookupResult = { ok: true; label: LabelPrefill } | { ok: false; error: string };

export async function lookupBarcode(code: string, fetchImpl: typeof fetch = fetch): Promise<LookupResult> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,serving_size,serving_quantity,nutriments`;
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  } catch {
    return { ok: false, error: 'No internet connection — you can type the label numbers instead.' };
  }
  if (res.status === 404) return { ok: false, error: `Barcode ${code} isn’t in Open Food Facts. Type the label numbers instead.` };
  if (!res.ok) return { ok: false, error: `Open Food Facts didn’t respond (HTTP ${res.status}). Try again later.` };
  let body: { status?: number; product?: OffProduct };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, error: 'Open Food Facts sent an unreadable reply.' };
  }
  if (body.status === 0 || !body.product) return { ok: false, error: `Barcode ${code} isn’t in Open Food Facts. Type the label numbers instead.` };
  const label = productToLabel(body.product);
  if (!label || label.calories == null) return { ok: false, error: 'Found the product, but it has no calorie info. Type the label numbers instead.' };
  return { ok: true, label };
}
