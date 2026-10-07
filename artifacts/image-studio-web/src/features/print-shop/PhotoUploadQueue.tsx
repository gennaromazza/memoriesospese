import { useRef, useState } from 'react';
import { AlertTriangle, Check, Image as ImageIcon, ImagePlus, Loader2, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { acceptedJpegLabel } from './print-shop-files';
import type { LocalPrintPhoto } from './types';

interface PhotoUploadQueueProps {
  photos: LocalPrintPhoto[];
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
  onRetry: (localId: string) => void;
  onRemove: (localId: string) => void;
}

const statusCopy: Record<LocalPrintPhoto['status'], string> = {
  queued: 'In attesa',
  preparing: 'Preparazione sicura…',
  uploading: 'Caricamento…',
  finalizing: 'Controllo del file…',
  uploaded: 'Caricata',
  error: 'Da riprovare',
};

export function PhotoUploadQueue({
  photos,
  disabled = false,
  onFilesSelected,
  onRetry,
  onRemove,
}: PhotoUploadQueueProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [visiblePhotoCount, setVisiblePhotoCount] = useState(40);

  const passFiles = (list: FileList | null) => {
    if (!list?.length) return;
    onFilesSelected(Array.from(list));
    if (inputRef.current) inputRef.current.value = '';
  };

  const uploaded = photos.filter((photo) => photo.status === 'uploaded').length;
  const busy = photos.some((photo) => ['preparing', 'uploading', 'finalizing'].includes(photo.status));
  const visiblePhotos = photos.slice(0, visiblePhotoCount);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,.jpg,.jpeg"
        multiple
        className="sr-only"
        onChange={(event) => passFiles(event.target.files)}
        disabled={disabled}
        aria-label="Scegli fotografie JPG"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          passFiles(event.dataTransfer.files);
        }}
        className={`flex min-h-52 w-full flex-col items-center justify-center rounded-[2rem] border-2 border-dashed px-6 py-10 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          dragging ? 'border-terracotta bg-terracotta/5' : 'border-sage/35 bg-white hover:border-sage hover:bg-sage/5'
        }`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sage/15 text-dark-sage">
          <UploadCloud className="h-7 w-7" aria-hidden="true" />
        </span>
        <span className="mt-4 text-lg font-semibold text-blue-gray">Scegli le foto dal telefono o dal computer</span>
        <span className="mt-2 text-sm text-blue-gray/55">{acceptedJpegLabel()}</span>
        <span className="mt-4 rounded-full bg-blue-gray px-5 py-2 text-sm font-semibold text-white">Apri la galleria</span>
      </button>

      {photos.length > 0 && (
        <section className="mt-6" aria-labelledby="upload-queue-title" aria-busy={busy}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 id="upload-queue-title" className="font-semibold text-blue-gray">Le tue fotografie</h3>
              <p className="text-sm text-blue-gray/55">{uploaded} di {photos.length} caricate</p>
            </div>
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={disabled} className="rounded-full border-sage/30">
              <ImagePlus aria-hidden="true" />
              Aggiungi altre foto
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {visiblePhotos.map((photo) => (
              <article key={photo.localId} className="flex gap-3 rounded-2xl border border-sage/20 bg-white p-3 shadow-sm">
                {photo.previewUrl ? (
                  <img
                    src={photo.previewUrl}
                    alt=""
                    className="h-20 w-20 flex-none rounded-xl bg-off-white object-cover"
                  />
                ) : (
                  <span className="flex h-20 w-20 flex-none items-center justify-center rounded-xl bg-sage/10 text-dark-sage" aria-hidden="true">
                    <ImageIcon className="h-8 w-8" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-blue-gray" title={photo.fileName}>{photo.fileName}</p>
                      <p className="mt-0.5 text-xs text-blue-gray/45">
                        {photo.widthPx > 0 && photo.heightPx > 0 ? `${photo.widthPx}×${photo.heightPx} px · ` : ''}
                        {(photo.sizeBytes / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                    {photo.status === 'uploaded' ? (
                      <Check className="h-5 w-5 flex-none text-emerald-600" aria-label="Caricata" />
                    ) : photo.status === 'error' ? (
                      <AlertTriangle className="h-5 w-5 flex-none text-red-600" aria-label="Errore" />
                    ) : (
                      <Loader2 className="h-5 w-5 flex-none animate-spin text-dark-sage" aria-label="Caricamento" />
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={photo.progress} className="h-1.5 flex-1 bg-sage/10 [&>div]:bg-dark-sage" aria-label={`Progresso ${photo.progress}%`} />
                    <span className="w-10 text-right text-[11px] tabular-nums text-blue-gray/50">{photo.progress}%</span>
                  </div>
                  <p className={`mt-1 text-xs ${photo.status === 'error' ? 'text-red-700' : 'text-blue-gray/50'}`}>
                    {photo.error || statusCopy[photo.status]}
                  </p>

                  <div className="mt-2 flex gap-2">
                    {photo.status === 'error' && (
                      <button type="button" onClick={() => onRetry(photo.localId)} className="inline-flex items-center gap-1 text-xs font-semibold text-terracotta hover:underline">
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Riprova
                      </button>
                    )}
                    {!['preparing', 'uploading', 'finalizing'].includes(photo.status) && (
                      <button type="button" onClick={() => onRemove(photo.localId)} className="ml-auto inline-flex items-center gap-1 text-xs text-blue-gray/45 hover:text-red-700">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Rimuovi
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
          {visiblePhotoCount < photos.length && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setVisiblePhotoCount((count) => count + 40)}
              className="mt-4 w-full rounded-xl border-sage/25"
            >
              Mostra altre foto ({photos.length - visiblePhotoCount})
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
