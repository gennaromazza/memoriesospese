/**
 * Dialog "Scansiona documento" — carica/fotografa tessera sanitaria o CIE,
 * invia le foto al server per il riconoscimento OCR e mostra un'anteprima
 * dei dati estratti da confermare prima di compilare il form cliente.
 *
 * Le foto NON vengono salvate: servono solo per l'estrazione.
 */
import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { Camera, Loader2, ScanLine, AlertTriangle, CheckCircle2, X } from 'lucide-react';

export interface ScannedDocumentData {
  tipoDocumento: 'tessera_sanitaria' | 'cie' | 'sconosciuto';
  codiceFiscale?: string;
  nome?: string;
  cognome?: string;
  sesso?: 'M' | 'F';
  dataNascita?: string;
  luogoNascita?: string;
  numeroDocumento?: string;
  scadenza?: string;
}

interface ScanResult {
  extracted: ScannedDocumentData;
  warnings: string[];
}

interface DocumentScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (data: ScannedDocumentData) => void;
}

const MAX_DIMENSION = 1600;

/** Ridimensiona l'immagine lato client per contenere il payload. */
async function fileToResizedBase64(file: File): Promise<{ data: string; mimeType: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  return { data: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
}

export default function DocumentScanDialog({ open, onOpenChange, onApply }: DocumentScanDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFiles([]);
    setError(null);
    setResult(null);
    setScanning(false);
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleFilesSelected = (list: FileList | null) => {
    if (!list) return;
    const imgs = Array.from(list).filter((f) => f.type.startsWith('image/')).slice(0, 2);
    if (imgs.length === 0) {
      setError('Seleziona una foto del documento (JPG o PNG)');
      return;
    }
    setError(null);
    setResult(null);
    setFiles(imgs);
  };

  const handleScan = async () => {
    if (files.length === 0) return;
    setScanning(true);
    setError(null);
    setResult(null);
    try {
      const images = await Promise.all(files.map(fileToResizedBase64));
      const res = await apiRequest('POST', '/api/document-ocr/scan', { images });
      const body = await res.json();

      if (body.available === false) {
        setError('Il riconoscimento automatico non è configurato: inserisci i dati a mano');
        return;
      }
      if (body.error && !body.extracted) {
        setError(body.error);
        return;
      }
      setResult({
        extracted: body.extracted,
        warnings: body.crossCheck?.warnings || [],
      });
    } catch (e: any) {
      const msg = String(e?.message || '');
      setError(
        msg.includes('502')
          ? 'Il servizio di riconoscimento non risponde: riprova tra poco o inserisci i dati a mano'
          : 'Non sono riuscito a leggere il documento: riprova con una foto più nitida o inserisci i dati a mano'
      );
    } finally {
      setScanning(false);
    }
  };

  const rows: Array<[string, string | undefined]> = result
    ? [
        ['Codice fiscale', result.extracted.codiceFiscale],
        ['Cognome', result.extracted.cognome],
        ['Nome', result.extracted.nome],
        ['Data di nascita', result.extracted.dataNascita],
        ['Luogo di nascita', result.extracted.luogoNascita],
        ...(result.extracted.tipoDocumento === 'cie'
          ? ([
              ['Numero documento', result.extracted.numeroDocumento],
              ['Scadenza', result.extracted.scadenza],
            ] as Array<[string, string | undefined]>)
          : []),
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-document-scan">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            Scansiona documento
          </DialogTitle>
          <DialogDescription>
            Fotografa o carica la tessera sanitaria (fronte) oppure la carta d'identità
            (fronte e retro). La foto viene usata solo per leggere i dati e non viene salvata.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
            data-testid="input-document-photos"
          />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => inputRef.current?.click()}
            disabled={scanning}
            data-testid="button-choose-document-photo"
          >
            <Camera className="mr-2 h-4 w-4" />
            {files.length > 0 ? `${files.length} foto selezionat${files.length > 1 ? 'e' : 'a'} — cambia` : 'Scatta o scegli foto'}
          </Button>

          {files.length > 0 && !result && (
            <Button
              type="button"
              className="w-full"
              onClick={handleScan}
              disabled={scanning}
              data-testid="button-scan-document"
            >
              {scanning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Lettura in corso...
                </>
              ) : (
                'Leggi i dati dal documento'
              )}
            </Button>
          )}

          {error && (
            <div
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
              data-testid="text-scan-error"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="space-y-3" data-testid="document-scan-preview">
              <div className="rounded-md border p-3 text-sm">
                <div className="mb-2 flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Trovato ({result.extracted.tipoDocumento === 'cie' ? "carta d'identità" : result.extracted.tipoDocumento === 'tessera_sanitaria' ? 'tessera sanitaria' : 'documento'})
                </div>
                <dl className="space-y-1">
                  {rows.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className={`text-right font-medium ${value ? '' : 'text-muted-foreground italic'}`}>
                        {value || 'non letto'}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {result.warnings.length > 0 && (
                <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800" data-testid="document-scan-warnings">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                  <div className="pt-1 text-amber-700">Controlla i dati prima di applicarli.</div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} data-testid="button-cancel-scan">
            <X className="mr-2 h-4 w-4" />
            Annulla
          </Button>
          {result && (
            <Button
              type="button"
              onClick={() => {
                onApply(result.extracted);
                handleOpenChange(false);
              }}
              data-testid="button-apply-scan"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Compila i campi
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
