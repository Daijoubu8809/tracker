// On-device OCR with Tesseract.js. Everything is self-hosted under <base>/tesseract/
// (worker script, WASM core, English data) — no CDN, no API keys. The library is
// lazy-loaded on first scan; the service worker caches the files for offline use.
// Recognition runs inside Tesseract's Web Worker, so the UI stays responsive.

import type { Worker as TesseractWorker } from 'tesseract.js';

export interface OcrProgress {
  /** 0–1 overall */
  progress: number;
  /** Plain status text, e.g. "Reading label… 60%" */
  status: string;
}

const BASE = `${import.meta.env.BASE_URL}tesseract/`;
const READY_KEY = 'plate.scan.downloaded';

function downloadedBefore(): boolean {
  try {
    return localStorage.getItem(READY_KEY) === '1';
  } catch {
    return false;
  }
}

let workerPromise: Promise<TesseractWorker> | null = null;
let progressSink: ((p: { status: string; progress: number }) => void) | null = null;

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM, PSM } = await import('tesseract.js');
      const worker = await createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: `${BASE}worker.min.js`,
        corePath: BASE, // picks the SIMD / relaxed-SIMD / plain LSTM build for this device
        langPath: `${BASE}lang`,
        gzip: true,
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => progressSink?.(m),
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK, // most reliable for label panels in testing
        preserve_interword_spaces: '1',
      });
      return worker;
    })();
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

export class OcrCancelled extends Error {
  constructor() {
    super('Scan cancelled');
  }
}

/** Stop any running scan and free the worker (the next scan starts a fresh one from cache). */
export async function cancelOcr(): Promise<void> {
  const p = workerPromise;
  workerPromise = null;
  progressSink = null;
  if (p) {
    try {
      await (await p).terminate();
    } catch {
      /* already gone */
    }
  }
}

/**
 * Recognize text in one or more images (passes). `onProgress` gets overall progress
 * across loading (first time only) and all passes. Rejects with OcrCancelled if `signal` aborts.
 */
export async function recognizePasses(
  images: readonly (HTMLCanvasElement | (() => HTMLCanvasElement))[],
  onProgress: (p: OcrProgress) => void,
  signal: AbortSignal,
  shouldContinue: (textsSoFar: string[]) => boolean = () => true,
): Promise<string[]> {
  if (signal.aborted) throw new OcrCancelled();
  const onAbort = () => void cancelOcr();
  signal.addEventListener('abort', onAbort, { once: true });
  let pass = 0;
  let loaded = !!workerPromise;
  const LOAD_SHARE = loaded ? 0 : 0.3;
  // Only the very first scan downloads the engine (~7 MB); after that it starts from the offline cache.
  const loadText = downloadedBefore() ? 'Starting the scanner…' : 'Downloading the scanner (first time only, about 7 MB)…';
  progressSink = (m) => {
    if (m.status === 'recognizing text') {
      const per = (1 - LOAD_SHARE) / images.length;
      const p = LOAD_SHARE + per * (pass + m.progress);
      onProgress({ progress: p, status: `Reading label… ${Math.round(p * 100)}%` });
    } else if (!loaded) {
      const p = LOAD_SHARE * Math.min(1, m.progress ?? 0);
      onProgress({ progress: p, status: `${loadText} ${Math.round(p * 100)}%` });
    }
  };
  try {
    onProgress({ progress: 0, status: loaded ? 'Reading label… 0%' : `${loadText} 0%` });
    const worker = await getWorker();
    loaded = true;
    try {
      localStorage.setItem(READY_KEY, '1');
    } catch {
      /* ignore */
    }
    const texts: string[] = [];
    for (pass = 0; pass < images.length; pass++) {
      if (signal.aborted) throw new OcrCancelled();
      if (pass > 0 && !shouldContinue(texts)) break;
      const img = images[pass];
      const canvas = typeof img === 'function' ? img() : img;
      const { data } = await worker.recognize(canvas);
      texts.push(data.text ?? '');
    }
    onProgress({ progress: 1, status: 'Reading label… 100%' });
    return texts;
  } catch (e) {
    if (signal.aborted) throw new OcrCancelled();
    throw e;
  } finally {
    signal.removeEventListener('abort', onAbort);
    progressSink = null;
  }
}
