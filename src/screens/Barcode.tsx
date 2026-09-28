import { useEffect, useRef, useState } from 'react';
import { Icon, Sheet } from '../components/ui';
import { lookupBarcode, normalizeBarcode } from '../lib/openFoodFacts';
import type { LabelPrefill } from './LabelEntry';

// Minimal typing for the native BarcodeDetector (Chrome/Android; not in Safari).
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

export function BarcodeButton({ onFound }: { onFound: (p: LabelPrefill) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn block" onClick={() => setOpen(true)}>
        <Icon name="camera" /> Scan barcode
      </button>
      {open ? (
        <ScannerSheet
          onClose={() => setOpen(false)}
          onFound={(p) => {
            onFound(p);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function ScannerSheet({ onClose, onFound }: { onClose: () => void; onFound: (p: LabelPrefill) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  const lookup = async (raw: string) => {
    const code = normalizeBarcode(raw);
    if (!code) {
      setError('A barcode is 8–14 digits.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await lookupBarcode(code);
    setBusy(false);
    if (r.ok) onFound(r.label);
    else {
      handled.current = false; // allow another scan
      setTyped(code);
      setError(r.error);
    }
  };

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let zxingStop: (() => void) | null = null;
    const video = videoRef.current;

    const found = (value: string) => {
      if (handled.current || stopped) return;
      handled.current = true;
      void lookup(value);
    };

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera needs the app to be opened over HTTPS. Type the barcode number below.');
        return;
      }
      const constraints: MediaStreamConstraints = { video: { facingMode: { ideal: 'environment' } }, audio: false };
      const Native = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      try {
        if (Native && video) {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stopped) return;
          video.srcObject = stream;
          await video.play();
          const detector = new Native({ formats: FORMATS });
          timer = window.setInterval(() => {
            if (video.readyState < 2) return;
            void detector
              .detect(video)
              .then((codes) => codes[0] && found(codes[0].rawValue))
              .catch(() => {});
          }, 300);
        } else if (video) {
          // iPhone Safari: no BarcodeDetector, so use ZXing (loaded only when needed).
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          if (stopped) return;
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints(constraints, video, (result) => {
            if (result) found(result.getText());
          });
          zxingStop = () => controls.stop();
          if (stopped) zxingStop();
        }
      } catch (e) {
        const name = e instanceof DOMException ? e.name : '';
        setCameraError(
          name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow it in Settings → Safari → Camera (or your browser settings), or type the number below.'
            : 'Couldn’t start the camera. Type the barcode number below.',
        );
      }
    })();

    return () => {
      stopped = true;
      window.clearInterval(timer);
      zxingStop?.();
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, []);

  return (
    <Sheet title="Scan barcode" onClose={onClose}>
      {cameraError ? (
        <div className="banner warn">{cameraError}</div>
      ) : (
        <>
          <video ref={videoRef} className="scanner" playsInline muted autoPlay aria-label="Camera preview" />
          <p className="small muted center">Point at the barcode and hold steady.</p>
        </>
      )}
      <div className="field">
        <label htmlFor="barcode-typed">Or type the barcode number</label>
        <div className="row">
          <input
            id="barcode-typed"
            className="input num grow"
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 0 49000 02890 4"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void lookup(typed)}
          />
          <button type="button" className="btn primary" disabled={busy || !typed.trim()} onClick={() => void lookup(typed)}>
            {busy ? 'Looking up…' : 'Look up'}
          </button>
        </div>
      </div>
      {busy ? <p className="small muted">Looking up in Open Food Facts…</p> : null}
      {error ? (
        <div className="banner warn" role="alert">
          {error}
        </div>
      ) : null}
      <p className="tiny muted">Product data from Open Food Facts (community database) — double-check against the package.</p>
    </Sheet>
  );
}
