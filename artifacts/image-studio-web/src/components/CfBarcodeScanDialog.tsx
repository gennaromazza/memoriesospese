import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Upload, Loader2, AlertCircle } from 'lucide-react';
import { isValidCodiceFiscale } from '@shared/fiscal-validation';

/**
 * Dialog che legge il codice fiscale dal codice a barre (Code 39) sul fronte
 * della tessera sanitaria. Gratuito e completamente client-side:
 * - usa l'API nativa BarcodeDetector quando disponibile;
 * - altrimenti ricorre a @zxing/browser (caricata lazy solo quando serve);
 * - ripiego con upload/scatto foto se la fotocamera live non funziona.
 */

interface CfBarcodeScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (cf: string) => void;
}

/** Estrae un CF valido (16 caratteri, checksum ok) dal testo del barcode. */
function extractCf(rawText: string): string | null {
  const compact = rawText.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Il barcode della tessera sanitaria contiene esattamente il CF,
  // ma tolleriamo eventuali prefissi/suffissi cercando una finestra valida.
  if (compact.length < 16) return null;
  for (let i = 0; i + 16 <= compact.length; i++) {
    const candidate = compact.slice(i, i + 16);
    if (isValidCodiceFiscale(candidate)) return candidate;
  }
  return null;
}

type NativeDetector = {
  detect: (source: CanvasImageSource | Blob | ImageData) => Promise<Array<{ rawValue: string }>>;
};

async function createNativeDetector(): Promise<NativeDetector | null> {
  const BD = (window as any).BarcodeDetector;
  if (!BD) return null;
  try {
    const supported: string[] = await BD.getSupportedFormats?.() ?? [];
    if (!supported.includes('code_39')) return null;
    return new BD({ formats: ['code_39'] });
  } catch {
    return null;
  }
}

// Lettore ZXing condiviso (istanziato solo se serve)
async function createZxingReader() {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_39]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints);
}

export default function CfBarcodeScanDialog({ open, onOpenChange, onDetected }: CfBarcodeScanDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFound = useCallback((cf: string) => {
    stopRef.current?.();
    stopRef.current = null;
    onDetected(cf);
    onOpenChange(false);
  }, [onDetected, onOpenChange]);

  // Avvia la fotocamera + loop di scansione quando il dialog si apre
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCameraError(null);
    setUploadError(null);
    setStarting(true);

    (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch {
        if (!cancelled) {
          setCameraError('Fotocamera non disponibile. Puoi caricare una foto del fronte della tessera.');
          setStarting(false);
        }
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      try { await video.play(); } catch { /* autoplay bloccato: l'utente vede comunque il ripiego upload */ }
      setStarting(false);

      const stopStream = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (video.srcObject) video.srcObject = null;
      };

      const native = await createNativeDetector();
      if (cancelled) { stopStream(); return; }

      if (native) {
        let running = true;
        stopRef.current = () => { running = false; stopStream(); };
        const tick = async () => {
          if (running && video.readyState >= 2) {
            try {
              const codes = await native.detect(video);
              for (const c of codes) {
                const cf = extractCf(c.rawValue || '');
                if (cf) { handleFound(cf); return; }
              }
            } catch { /* frame non decodificabile: riprova */ }
          }
          if (running) setTimeout(tick, 250);
        };
        void tick();
      } else {
        // Fallback ZXing: decodifica continua dal <video>
        try {
          const reader = await createZxingReader();
          if (cancelled) { stopStream(); return; }
          const controls = await reader.decodeFromVideoElement(video, (result) => {
            if (result) {
              const cf = extractCf(result.getText());
              if (cf) handleFound(cf);
            }
          });
          stopRef.current = () => { controls.stop(); stopStream(); };
        } catch {
          if (!cancelled) {
            setCameraError('Scanner non disponibile su questo browser. Carica una foto della tessera.');
          }
          stopStream();
        }
      }
    })();

    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
      // Ferma anche uno stream avviato ma senza stopRef ancora registrato
      const video = videoRef.current;
      const s = video?.srcObject as MediaStream | null;
      if (s) { s.getTracks().forEach((t) => t.stop()); if (video) video.srcObject = null; }
    };
  }, [open, handleFound]);

  // Ripiego: decodifica da foto caricata/scattata
  const handleFile = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('img'));
          img.src = url;
        });

        // Prima il detector nativo, poi ZXing
        const native = await createNativeDetector();
        if (native) {
          try {
            const codes = await native.detect(img);
            for (const c of codes) {
              const cf = extractCf(c.rawValue || '');
              if (cf) { handleFound(cf); return; }
            }
          } catch { /* passa a ZXing */ }
        }
        const reader = await createZxingReader();
        try {
          const result = await reader.decodeFromImageElement(img);
          const cf = extractCf(result.getText());
          if (cf) { handleFound(cf); return; }
        } catch { /* nessun barcode trovato */ }
        setUploadError('Nessun codice a barre leggibile nella foto. Inquadra bene il fronte della tessera, con il codice a barre nitido e ben illuminato.');
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      setUploadError('Impossibile leggere la foto. Riprova con un\'altra immagine.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-cf-barcode-scan">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Scansiona tessera sanitaria
          </DialogTitle>
          <DialogDescription>
            Inquadra il codice a barre sul fronte della tessera sanitaria: il codice fiscale verrà letto e inserito automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!cameraError && (
            <div className="relative overflow-hidden rounded-md bg-black aspect-[4/3]">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
                data-testid="video-cf-barcode"
              />
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center text-white">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
              {/* Guida visiva: fascia orizzontale dove posizionare il barcode */}
              <div className="pointer-events-none absolute inset-x-6 top-1/2 h-16 -translate-y-1/2 rounded border-2 border-white/70" />
            </div>
          )}

          {cameraError && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="text-cf-scan-camera-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {cameraError}
            </p>
          )}

          {uploadError && (
            <p className="flex items-start gap-2 text-sm text-destructive" data-testid="text-cf-scan-upload-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {uploadError}
            </p>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
            data-testid="input-cf-scan-file"
          />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-cf-scan-upload"
          >
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Carica una foto della tessera
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
