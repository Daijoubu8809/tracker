// Image prep for label OCR. The pixel functions are pure (testable without a browser);
// the canvas/file helpers at the bottom run in the browser.

export const MAX_EDGE = 1600;

/** Scale (w, h) down so the long edge is at most `max` (never upscales). */
export function fitWithin(w: number, h: number, max = MAX_EDGE): { w: number; h: number; scale: number } {
  const long = Math.max(w, h);
  const scale = long > max ? max / long : 1;
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)), scale };
}

/** RGBA → 8-bit luminance (Rec. 601 weights). */
export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    out[p] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return out;
}

/** Stretch contrast so the 1st–99th percentile spans 0–255 (handles dim or washed-out photos). */
export function stretchContrast(gray: Uint8ClampedArray): Uint8ClampedArray {
  const hist = new Uint32Array(256);
  for (const v of gray) hist[v]++;
  const n = gray.length;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < n * 0.01; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < n * 0.01; hi--);
  if (hi - lo < 10) return gray.slice();
  const out = new Uint8ClampedArray(n);
  const k = 255 / (hi - lo);
  for (let i = 0; i < n; i++) out[i] = (gray[i] - lo) * k;
  return out;
}

/**
 * Bradley–Roth adaptive threshold: a pixel is black if it's `t` darker than the mean of
 * its neighbourhood. Copes with shadows and uneven dining-hall lighting far better than
 * a single global threshold. Uses an integral image, so it's O(pixels).
 */
export function adaptiveThreshold(gray: Uint8ClampedArray, w: number, h: number, t = 0.15, windowFrac = 1 / 16): Uint8ClampedArray {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const half = Math.max(4, Math.round((Math.max(w, h) * windowFrac) / 2));
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w - 1, x + half);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (w + 1) + x1 + 1] - integral[y0 * (w + 1) + x1 + 1] - integral[(y1 + 1) * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      out[y * w + x] = gray[y * w + x] * count <= sum * (1 - t) ? 0 : 255;
    }
  }
  return out;
}

/**
 * Prep raw RGBA pixels for OCR: grayscale → contrast stretch → (optionally) adaptive threshold.
 * The threshold is the default; plain grayscale is used as a second OCR pass because on some
 * photos binarizing erases thin, faint strokes.
 */
export function prepPixels(rgba: Uint8ClampedArray, w: number, h: number, threshold = true): Uint8ClampedArray {
  const gray = stretchContrast(toGray(rgba, w, h));
  const bw = threshold ? adaptiveThreshold(gray, w, h) : gray;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let p = 0, i = 0; p < bw.length; p++, i += 4) {
    out[i] = out[i + 1] = out[i + 2] = bw[p];
    out[i + 3] = 255;
  }
  return out;
}

export interface CropRect {
  /** Fractions of the image (0–1), so they survive resizing. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Clamp a crop to the image and a sensible minimum size. */
export function normalizeCrop(c: CropRect): CropRect | null {
  const x0 = Math.max(0, Math.min(c.x, c.x + c.w));
  const y0 = Math.max(0, Math.min(c.y, c.y + c.h));
  const x1 = Math.min(1, Math.max(c.x, c.x + c.w));
  const y1 = Math.min(1, Math.max(c.y, c.y + c.h));
  if (x1 - x0 < 0.05 || y1 - y0 < 0.05) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---------- Browser helpers ----------

/**
 * Decode a photo with its EXIF rotation applied (iPhone photos are often stored sideways
 * with an orientation tag). createImageBitmap honours it explicitly; <img> honours it by
 * default in current Safari/Chrome.
 */
export async function loadPhoto(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall back to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function dims(src: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  return 'naturalWidth' in src ? { w: src.naturalWidth, h: src.naturalHeight } : { w: src.width, h: src.height };
}

/** Draw (optionally cropped) and downscaled to ≤1600px; returns the canvas with original colours. */
export function drawScaled(src: ImageBitmap | HTMLImageElement, crop: CropRect | null, max = MAX_EDGE): HTMLCanvasElement {
  const { w: iw, h: ih } = dims(src);
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const sx = c.x * iw;
  const sy = c.y * ih;
  const sw = c.w * iw;
  const sh = c.h * ih;
  const { w, h } = fitWithin(sw, sh, max);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  return canvas;
}

/** Grayscale + contrast (+ adaptive threshold unless `threshold` is false), on a copy. */
export function prepCanvas(source: HTMLCanvasElement, threshold = true): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  img.data.set(prepPixels(img.data, canvas.width, canvas.height, threshold));
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Small JPEG preview (for the review screen's thumbnail). */
export function thumbnail(src: ImageBitmap | HTMLImageElement, crop: CropRect | null, max = 480): string {
  return drawScaled(src, crop, max).toDataURL('image/jpeg', 0.8);
}
