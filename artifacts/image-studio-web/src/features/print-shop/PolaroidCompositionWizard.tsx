import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Minus, Plus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { POLAROID_FRAME } from '@shared/print-shop-catalog';
import type { LocalPrintPhoto, PrintComposition, PrintGroupAssignmentDraft } from './types';
import {
  clampComposition,
  DEFAULT_POLAROID_COMPOSITION,
  movePolaroidComposition,
  polaroidCropStyle,
} from './polaroid-crop';

interface Props {
  open: boolean;
  assignments: PrintGroupAssignmentDraft[];
  photos: LocalPrintPhoto[];
  startIndex: number;
  onClose: () => void;
  onConfirm: (photoId: string, composition: PrintComposition) => void;
}

export function PolaroidCompositionWizard({ open, assignments, photos, startIndex, onClose, onConfirm }: Props) {
  const [index, setIndex] = useState(startIndex);
  const current = assignments[index];
  const photo = photos.find((item) => item.localId === current?.localPhotoId);
  const [draft, setDraft] = useState<PrintComposition>(current?.composition ?? DEFAULT_POLAROID_COMPOSITION);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);

  useEffect(() => {
    if (open) setIndex(Math.min(startIndex, Math.max(0, assignments.length - 1)));
  }, [open, startIndex, assignments.length]);
  useEffect(() => {
    setDraft(current?.composition ?? DEFAULT_POLAROID_COMPOSITION);
    pointers.current.clear();
    pinchDistance.current = null;
  }, [current?.localPhotoId, current?.composition]);

  const setZoom = (zoom: number) => setDraft((value) => clampComposition({ ...value, zoom }));
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || !photo) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance.current && pinchDistance.current > 0) {
        setDraft((value) => clampComposition({ ...value, zoom: value.zoom * distance / pinchDistance.current! }));
      }
      pinchDistance.current = distance;
    } else {
      const bounds = event.currentTarget.getBoundingClientRect();
      setDraft((value) => movePolaroidComposition(
        photo, value, event.clientX - previous.x, event.clientY - previous.y, bounds.width, bounds.height,
      ));
    }
  };
  const releasePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    pinchDistance.current = null;
  };
  const confirm = () => {
    if (!current) return;
    onConfirm(current.localPhotoId, clampComposition(draft));
    if (index === assignments.length - 1) onClose();
    else setIndex((value) => value + 1);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#f7f6f2] p-0 text-blue-gray sm:h-[min(95dvh,950px)] sm:max-h-[950px] sm:w-[min(95vw,540px)] sm:rounded-[2rem] [&>button:last-child]:hidden">
        <header className="flex-none border-b border-sage/15 bg-white px-4 pb-4 pt-[max(env(safe-area-inset-top),16px)] sm:px-7 sm:pt-6">
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={onClose} className="h-11 rounded-full px-2 text-blue-gray" aria-label="Esci dall'inquadratura">
              <X className="h-5 w-5" aria-hidden="true" /> Esci
            </Button>
            <span className="rounded-full bg-terracotta/10 px-3 py-1.5 text-xs font-bold tracking-wide text-terracotta">
              FOTO {Math.min(index + 1, assignments.length)} DI {assignments.length}
            </span>
          </div>
          <DialogTitle className="mt-3 font-serif text-2xl leading-tight text-blue-gray sm:text-3xl">Inquadra la tua Polaroid</DialogTitle>
          <DialogDescription className="mt-1 text-sm leading-snug text-blue-gray/65">
            Sposta la foto con un dito. Pizzica per ingrandire, poi premi OK.
          </DialogDescription>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-sage/20" role="progressbar" aria-label="Foto da inquadrare" aria-valuemin={0} aria-valuemax={assignments.length} aria-valuenow={Math.min(index + 1, assignments.length)}>
            <div className="h-full rounded-full bg-terracotta transition-all" style={{ width: `${(index + 1) / Math.max(1, assignments.length) * 100}%` }} />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-3 sm:px-8">
          {photo ? (
            <>
              <p className="mb-3 max-w-full truncate text-center text-xs font-medium text-blue-gray/60">{photo.fileName}</p>
              <div className="relative flex-none select-none overflow-hidden rounded-[3px] bg-white shadow-[0_18px_55px_rgba(31,48,52,0.2)]"
                style={{ width: 'min(76vw, 330px, 32dvh)', aspectRatio: `${POLAROID_FRAME.widthMm} / ${POLAROID_FRAME.heightMm}` }}
                aria-label={`Anteprima della Polaroid: ${photo.fileName}`}>
                <div className="absolute touch-none overflow-hidden bg-sage/15"
                  style={{
                    left: `${POLAROID_FRAME.xMm / POLAROID_FRAME.widthMm * 100}%`,
                    top: `${POLAROID_FRAME.yMm / POLAROID_FRAME.heightMm * 100}%`,
                    width: `${POLAROID_FRAME.imageWidthMm / POLAROID_FRAME.widthMm * 100}%`,
                    height: `${POLAROID_FRAME.imageHeightMm / POLAROID_FRAME.heightMm * 100}%`,
                  }}
                  onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={releasePointer} onPointerCancel={releasePointer}
                  onWheel={(event) => { event.preventDefault(); setZoom(draft.zoom + (event.deltaY < 0 ? 0.1 : -0.1)); }}>
                  {photo.previewUrl && <img src={photo.previewUrl} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={polaroidCropStyle(photo, draft)} />}
                </div>
              </div>
              <div className="mt-5 flex w-full max-w-[330px] items-center gap-3">
                <Button type="button" variant="outline" size="icon" className="h-11 w-11 flex-none rounded-full" onClick={() => setZoom(draft.zoom - 0.15)} aria-label="Riduci zoom"><Minus className="h-5 w-5" /></Button>
                <input aria-label="Zoom inquadratura" type="range" min={1} max={4} step={0.01} value={draft.zoom}
                  onChange={(event) => setZoom(Number(event.target.value))} className="h-11 min-w-0 flex-1 accent-terracotta" />
                <Button type="button" variant="outline" size="icon" className="h-11 w-11 flex-none rounded-full" onClick={() => setZoom(draft.zoom + 0.15)} aria-label="Aumenta zoom"><Plus className="h-5 w-5" /></Button>
              </div>
              <p className="mt-1 text-xs text-blue-gray/55">La cornice mostra esattamente dove verrà stampata la foto.</p>
            </>
          ) : <p role="alert" className="text-sm text-red-700">Questa foto non è più disponibile. Esci e aggiornala nella selezione.</p>}
        </div>

        <footer className="flex-none border-t border-sage/15 bg-white px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 sm:px-7">
          <div className="mx-auto flex max-w-[480px] items-center gap-3">
            <Button type="button" variant="outline" className="h-12 rounded-full px-4" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Indietro
            </Button>
            <Button type="button" disabled={!photo} className="h-12 flex-1 rounded-full bg-terracotta text-white hover:bg-terracotta/90" onClick={confirm}>
              <Check className="h-5 w-5" aria-hidden="true" /> {index === assignments.length - 1 ? 'OK, ho finito' : 'OK, prossima foto'}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}