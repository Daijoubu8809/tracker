import { describe, expect, it } from 'vitest';
import { adaptiveThreshold, fitWithin, normalizeCrop, prepPixels, stretchContrast, toGray } from './labelImage';

describe('label image prep', () => {
  it('downscales to 1600px on the long edge, never upscales', () => {
    expect(fitWithin(4032, 3024)).toEqual({ w: 1600, h: 1200, scale: 1600 / 4032 });
    expect(fitWithin(3024, 4032).h).toBe(1600);
    expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600, scale: 1 });
  });
  it('grayscale uses luminance weights', () => {
    const g = toGray(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]), 4, 1);
    expect([...g]).toEqual([76, 150, 29, 255]); // 0.299·255, 0.587·255 (rounded), 0.114·255
  });
  it('stretches a dim image to full range', () => {
    const dim = new Uint8ClampedArray(100).map((_, i) => 60 + (i % 40));
    const s = stretchContrast(dim);
    expect(Math.min(...s)).toBe(0);
    expect(Math.max(...s)).toBeGreaterThanOrEqual(250);
  });
  it('adaptive threshold keeps dark text readable under a shadow gradient', () => {
    // 64×16 image: brightness falls from 240 (left) to 90 (right, in shadow); a dark
    // "stroke" 40 levels below the local background runs across the middle rows.
    const w = 64;
    const h = 16;
    const g = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const bg = 240 - (150 * x) / (w - 1);
        g[y * w + x] = y >= 7 && y <= 8 ? bg - 60 : bg;
      }
    const bw = adaptiveThreshold(g, w, h, 0.15, 1 / 4);
    // Text is black everywhere — including the shadowed right side …
    for (const x of [2, 32, 60]) expect(bw[7 * w + x]).toBe(0);
    // … and background is white everywhere, even where it's darker than the left-side text.
    for (const x of [2, 32, 60]) expect(bw[2 * w + x]).toBe(255);
  });
  it('prepPixels returns opaque black/white RGBA', () => {
    const rgba = new Uint8ClampedArray(8 * 8 * 4).map((_, i) => (i % 4 === 3 ? 255 : i % 7 === 0 ? 20 : 220));
    const out = prepPixels(rgba, 8, 8);
    expect(out.length).toBe(rgba.length);
    for (let i = 0; i < out.length; i += 4) {
      expect([0, 255]).toContain(out[i]);
      expect(out[i + 3]).toBe(255);
    }
  });
  it('normalizes crops drawn in any direction and rejects tiny ones', () => {
    expect(normalizeCrop({ x: 0.8, y: 0.9, w: -0.6, h: -0.7 })).toEqual({ x: expect.closeTo(0.2, 9), y: expect.closeTo(0.2, 9), w: 0.6, h: 0.7 });
    expect(normalizeCrop({ x: -0.2, y: 0.1, w: 0.5, h: 0.5 })).toEqual({ x: 0, y: 0.1, w: 0.3, h: 0.5 });
    expect(normalizeCrop({ x: 0.5, y: 0.5, w: 0.01, h: 0.3 })).toBeNull();
  });
});

describe('crop preference', async () => {
  const { usuallySkipsCrop } = await import('./scanPrefs');
  it('skips automatically once you usually skip', () => {
    expect(usuallySkipsCrop([])).toBe(false);
    expect(usuallySkipsCrop(['skip'])).toBe(false);
    expect(usuallySkipsCrop(['skip', 'skip'])).toBe(true);
    expect(usuallySkipsCrop(['skip', 'skip', 'crop', 'crop'])).toBe(false);
    expect(usuallySkipsCrop(['crop', 'skip', 'crop', 'skip', 'skip'])).toBe(true);
  });
});
