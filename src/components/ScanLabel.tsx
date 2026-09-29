import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { drawScaled, loadPhoto, normalizeCrop, prepCanvas, thumbnail, type CropRect } from '../lib/labelImage';
import { parseNutritionLabel, type ParsedLabel } from '../lib/nutritionLabel';
import { OcrCancelled, recognizePasses, type OcrProgress } from '../lib/ocr';
import { recordCropChoice, usuallySkipsCrop } from '../lib/scanPrefs';
import { LabelEntry } from '../screens/LabelEntry';
import { useApp } from '../state';
import { ProgressBar, Sheet } from './ui';

interface ScanApi {
  /** Open the rear camera (falls back to the photo picker where there's no camera). */
  scanWithCamera: () => void;
  /** Pick an existing photo from the library. */
  scanFromLibrary: () => void;
}

const ScanCtx = createContext<ScanApi | null>(null);

export function useScanLabel(): ScanApi {
  const v = useContext(ScanCtx);
  if (!v) throw new Error('useScanLabel outside ScanLabelProvider');
  return v;
}

/**
 * Hosts the hidden file inputs and the scan flow. Uses <input type=file capture> rather
 * than getUserMedia so it works in the iPhone Home Screen app and needs no permissions UI.
 */
export function ScanLabelProvider({ children }: { children: ReactNode }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState<{ id: number; file: File } | null>(null);
  const api = useMemo<ScanApi>(
    () => ({
      scanWithCamera: () => cameraRef.current?.click(),
      scanFromLibrary: () => libraryRef.current?.click(),
    }),
    [],
  );
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same photo again
    if (file) setScan({ id: Date.now(), file });
  };
  return (
    <ScanCtx.Provider value={api}>
      {children}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onPick} />
      <input ref={libraryRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onPick} />
      {scan ? <ScanFlow key={scan.id} file={scan.file} onClose={() => setScan(null)} onRetake={api.scanWithCamera} /> : null}
    </ScanCtx.Provider>
  );
}

type Step =
  | { kind: 'loading' }
  | { kind: 'crop'; preview: string }
  | { kind: 'reading'; progress: OcrProgress }
  | { kind: 'review'; parsed: ParsedLabel; thumb: string; cropped: boolean }
  | { kind: 'nothing'; thumb: string; cropped: boolean }
  | { kind: 'error'; message: string };

function ScanFlow({ file, onClose, onRetake }: { file: File; onClose: () => void; onRetake: () => void }) {
  const { go } = useApp();
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const photo = useRef<ImageBitmap | HTMLImageElement | null>(null);
  const abort = useRef<AbortController | null>(null);

  const run = useCallback(async (crop: CropRect | null) => {
    const img = photo.current;
    if (!img) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStep({ kind: 'reading', progress: { progress: 0, status: 'Preparing photo…' } });
    await new Promise((r) => setTimeout(r, 30)); // let the progress screen paint
    try {
      const base = drawScaled(img, crop);
      const thumb = thumbnail(img, crop);
      // Pass 1: grayscale + contrast + adaptive threshold. Pass 2 (plain grayscale) only if
      // pass 1 left gaps or its calorie math doesn't add up — thresholding can erase faint strokes.
      const texts = await recognizePasses(
        [() => prepCanvas(base, true), () => prepCanvas(base, false)],
        (progress) => !ctrl.signal.aborted && setStep({ kind: 'reading', progress }),
        ctrl.signal,
        (sofar) => {
          const r = parseNutritionLabel(sofar);
          return r.found < 9 || !r.calorieCheck?.ok;
        },
      );
      if (ctrl.signal.aborted) return;
      const parsed = parseNutritionLabel(texts);
      setStep(parsed.usable ? { kind: 'review', parsed, thumb, cropped: !!crop } : { kind: 'nothing', thumb, cropped: !!crop });
    } catch (e) {
      if (e instanceof OcrCancelled || ctrl.signal.aborted) return;
      setStep({
        kind: 'error',
        message: navigator.onLine
          ? 'The scanner couldn’t start on this device. You can still enter the label by hand.'
          : 'The scanner needs an internet connection the first time, to download its files (about 7 MB). After that it works offline.',
      });
    }
  }, []);

  // Decode the photo (with EXIF rotation), then crop step or straight to reading.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const img = await loadPhoto(file);
        if (!alive) return;
        photo.current = img;
        if (usuallySkipsCrop()) void run(null);
        else setStep({ kind: 'crop', preview: thumbnail(img, null, 1200) });
      } catch {
        if (alive) setStep({ kind: 'error', message: 'Couldn’t open that photo. Try taking it again.' });
      }
    })();
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, [file, run]);

  const close = () => {
    abort.current?.abort();
    onClose();
  };
  const manual = () => {
    close();
    go('log', 'label');
  };
  const retake = () => {
    close();
    onRetake();
  };
  const cropAgain = () => {
    const img = photo.current;
    if (img) setStep({ kind: 'crop', preview: thumbnail(img, null, 1200) });
  };

  return (
    <Sheet title="Scan label" onClose={close}>
      {step.kind === 'loading' ? <p className="muted">Opening photo…</p> : null}

      {step.kind === 'crop' ? (
        <CropStep
          preview={step.preview}
          onUse={(rect) => {
            recordCropChoice('crop');
            void run(rect);
          }}
          onSkip={() => {
            recordCropChoice('skip');
            void run(null);
          }}
        />
      ) : null}

      {step.kind === 'reading' ? (
        <div className="stack" aria-live="polite">
          <p>{step.progress.status}</p>
          <ProgressBar label="Scan progress" value={step.progress.progress * 100} max={100} />
          <p className="small muted">Everything happens on your phone — the photo never leaves it.</p>
          <button type="button" className="btn block" onClick={close}>
            Cancel
          </button>
        </div>
      ) : null}

      {step.kind === 'review' ? (
        <LabelEntry
          review={{
            parsed: step.parsed,
            thumb: step.thumb,
            onRetake: retake,
            onManual: manual,
            onCropRescan: cropAgain,
            onDone: close,
          }}
        />
      ) : null}

      {step.kind === 'nothing' ? (
        <div className="stack">
          <img className="scan-thumb" src={step.thumb} alt="Your label photo" />
          <div className="banner warn" role="status">
            <b>Couldn’t read a Nutrition Facts panel in this photo.</b>
          </div>
          <p className="small">Things that usually help:</p>
          <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
            <li>Better, even light — step out of shadows and avoid glare on shiny packaging.</li>
            <li>Hold the phone flat and straight over the label, not at an angle.</li>
            <li>Fill the frame with just the Nutrition Facts panel{step.cropped ? '' : ', or crop to it'}.</li>
            <li>Flatten crinkled bags; hold still until the photo is sharp.</li>
          </ul>
          <button type="button" className="btn primary block" onClick={retake}>
            Retake photo
          </button>
          {!step.cropped ? (
            <button type="button" className="btn block" onClick={cropAgain}>
              Crop to the panel and try again
            </button>
          ) : null}
          <button type="button" className="btn block" onClick={manual}>
            Enter manually
          </button>
        </div>
      ) : null}

      {step.kind === 'error' ? (
        <div className="stack">
          <div className="banner warn" role="status">
            {step.message}
          </div>
          <button type="button" className="btn primary block" onClick={manual}>
            Enter manually
          </button>
        </div>
      ) : null}
    </Sheet>
  );
}

/** Drag a box around the Nutrition Facts panel (or skip). */
function CropStep({ preview, onUse, onSkip }: { preview: string; onUse: (r: CropRect) => void; onSkip: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<CropRect | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const pos = (e: React.PointerEvent) => {
    const b = stage.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
  };
  const shown = rect ? normalizeCrop(rect) : null;
  return (
    <div className="stack">
      <p className="small">Drag a box around the Nutrition Facts panel for a better read — or skip.</p>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          ref={stage}
          className="crop-stage"
          style={{ display: 'inline-block' }}
          role="img"
          aria-label="Photo. Drag to select the Nutrition Facts panel."
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = pos(e);
            start.current = p;
            setRect({ x: p.x, y: p.y, w: 0, h: 0 });
          }}
          onPointerMove={(e) => {
            if (!start.current) return;
            const p = pos(e);
            setRect({ x: start.current.x, y: start.current.y, w: p.x - start.current.x, h: p.y - start.current.y });
          }}
          onPointerUp={() => {
            start.current = null;
          }}
        >
          <img src={preview} alt="" style={{ maxWidth: '100%', maxHeight: '55dvh', width: 'auto' }} />
          {shown ? (
            <div
              className="crop-box"
              style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%`, width: `${shown.w * 100}%`, height: `${shown.h * 100}%` }}
            />
          ) : null}
        </div>
      </div>
      <div className="grid-2">
        <button type="button" className="btn" onClick={onSkip}>
          Skip
        </button>
        <button type="button" className="btn primary" disabled={!shown} onClick={() => shown && onUse(shown)}>
          Use this crop
        </button>
      </div>
      <p className="tiny muted">If you usually skip this, it’ll be skipped automatically next time (you can still crop from the results).</p>
    </div>
  );
}
