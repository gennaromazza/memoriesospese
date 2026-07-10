/**
 * Editor slot di una pagina fotolibro (admin).
 * - Sposta/ridimensiona gli slot trascinandoli sull'anteprima della pagina
 * - Aggiungi/elimina slot manualmente
 * - Associa manualmente una foto della galleria a uno slot (correzione match)
 */

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PhotobookPhotoPicker from './PhotobookPhotoPicker';
import type { PhotobookPage, PhotobookSlot, PhotobookGalleryPhoto } from '@shared/photobook-types';
import { ImagePlus, Link2, Plus, Trash2, Unlink, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: PhotobookPage;
  photos: PhotobookGalleryPhoto[];
  saving: boolean;
  onSave: (slots: PhotobookSlot[]) => void;
}

type DragMode = { type: 'move' | 'resize'; slotId: string; startX: number; startY: number; orig: PhotobookSlot };

function newSlotId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `slot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function PhotobookSlotEditor({ open, onOpenChange, page, photos, saving, onSave }: Props) {
  const [slots, setSlots] = useState<PhotobookSlot[]>(page.slots);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode | null>(null);

  useEffect(() => {
    setSlots(page.slots);
    setSelectedId(null);
    setDirty(false);
  }, [page.id, page.updatedAt]);

  const selected = slots.find((s) => s.id === selectedId) || null;

  const updateSlot = (id: string, patch: Partial<PhotobookSlot>) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setDirty(true);
  };

  const onPointerDown = (e: React.PointerEvent, slot: PhotobookSlot, type: 'move' | 'resize') => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(slot.id);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { type, slotId: slot.id, startX: e.clientX, startY: e.clientY, orig: { ...slot } };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;
    if (drag.type === 'move') {
      updateSlot(drag.slotId, {
        x: Math.min(1 - drag.orig.width, Math.max(0, drag.orig.x + dx)),
        y: Math.min(1 - drag.orig.height, Math.max(0, drag.orig.y + dy)),
      });
    } else {
      updateSlot(drag.slotId, {
        width: Math.min(1 - drag.orig.x, Math.max(0.02, drag.orig.width + dx)),
        height: Math.min(1 - drag.orig.y, Math.max(0.02, drag.orig.height + dy)),
      });
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const addSlot = () => {
    const slot: PhotobookSlot = {
      id: newSlotId(),
      x: 0.35,
      y: 0.35,
      width: 0.3,
      height: 0.3,
      rotation: 0,
      photoId: null,
      photoName: null,
      photoThumbnailUrl: null,
      confidence: null,
      matchStatus: 'none',
    };
    setSlots((prev) => [...prev, slot]);
    setSelectedId(slot.id);
    setDirty(true);
  };

  const removeSlot = (id: string) => {
    setSlots((prev) => prev.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
    setDirty(true);
  };

  const assignPhoto = (photo: PhotobookGalleryPhoto) => {
    if (!selectedId) return;
    updateSlot(selectedId, {
      photoId: photo.id,
      photoName: photo.name,
      photoThumbnailUrl: photo.thumbnailUrl || photo.url,
      confidence: 100,
      matchStatus: 'manual',
    });
  };

  const unassignPhoto = () => {
    if (!selectedId) return;
    updateSlot(selectedId, {
      photoId: null,
      photoName: null,
      photoThumbnailUrl: null,
      confidence: null,
      matchStatus: 'none',
    });
  };

  const confidenceColor = (s: PhotobookSlot) => {
    if (s.matchStatus === 'manual') return 'border-blue-500 bg-blue-500/15';
    if (!s.photoId) return 'border-red-500 bg-red-500/15';
    if ((s.confidence ?? 0) >= 75) return 'border-emerald-500 bg-emerald-500/10';
    return 'border-amber-500 bg-amber-500/15';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pagina {page.pageNumber} — Editor Slot</DialogTitle>
          <DialogDescription>
            Trascina gli slot per spostarli, usa l'angolo in basso a destra per ridimensionarli.
            Clicca uno slot per associare manualmente una foto.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          {/* Anteprima pagina con overlay slot */}
          <div
            ref={containerRef}
            className="relative select-none touch-none rounded-md overflow-hidden border bg-muted"
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onClick={() => setSelectedId(null)}
          >
            <img src={page.url} alt={`Pagina ${page.pageNumber}`} className="w-full h-auto block" draggable={false} />
            {slots.map((s, idx) => (
              <div
                key={s.id}
                className={`absolute border-2 cursor-move ${confidenceColor(s)} ${
                  selectedId === s.id ? 'ring-2 ring-primary z-10' : ''
                }`}
                style={{
                  left: `${s.x * 100}%`,
                  top: `${s.y * 100}%`,
                  width: `${s.width * 100}%`,
                  height: `${s.height * 100}%`,
                }}
                onPointerDown={(e) => onPointerDown(e, s, 'move')}
                onClick={(e) => e.stopPropagation()}
                data-testid={`slot-editor-box-${idx}`}
              >
                <span className="absolute top-0 left-0 bg-black/70 text-white text-[10px] px-1 rounded-br">
                  {idx + 1}
                  {s.photoId
                    ? s.matchStatus === 'manual'
                      ? ' · manuale'
                      : ` · ${s.confidence ?? '?'}%`
                    : ' · nessuna foto'}
                </span>
                <span
                  className="absolute bottom-0 right-0 w-4 h-4 bg-primary/80 cursor-nwse-resize"
                  onPointerDown={(e) => onPointerDown(e, s, 'resize')}
                />
              </div>
            ))}
          </div>

          {/* Pannello laterale */}
          <div className="space-y-3">
            <Button variant="outline" size="sm" className="w-full" onClick={addSlot} data-testid="button-add-slot">
              <Plus className="h-4 w-4 mr-2" />
              Aggiungi slot
            </Button>

            {selected ? (
              <div className="border rounded-md p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Slot {slots.findIndex((s) => s.id === selected.id) + 1}
                  </span>
                  <Badge variant={selected.photoId ? 'secondary' : 'destructive'}>
                    {selected.matchStatus === 'manual'
                      ? 'Manuale'
                      : selected.photoId
                        ? `Auto ${selected.confidence ?? '?'}%`
                        : 'Non riconosciuta'}
                  </Badge>
                </div>

                {selected.photoId ? (
                  <div className="flex items-center gap-2">
                    {selected.photoThumbnailUrl && (
                      <img
                        src={selected.photoThumbnailUrl}
                        alt={selected.photoName || ''}
                        className="w-14 h-14 rounded object-cover border"
                      />
                    )}
                    <p className="text-xs text-muted-foreground break-all">{selected.photoName}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Nessuna foto associata a questo slot.
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} data-testid="button-assign-photo">
                    <Link2 className="h-3.5 w-3.5 mr-1.5" />
                    {selected.photoId ? 'Cambia foto' : 'Associa foto'}
                  </Button>
                  {selected.photoId && (
                    <Button size="sm" variant="outline" onClick={unassignPhoto}>
                      <Unlink className="h-3.5 w-3.5 mr-1.5" />
                      Rimuovi associazione
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeSlot(selected.id)}
                    data-testid="button-remove-slot"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Elimina slot
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground border rounded-md p-3">
                Seleziona uno slot sull'anteprima per modificarlo.
              </p>
            )}

            <div className="text-xs text-muted-foreground space-y-1">
              <p><span className="inline-block w-3 h-3 bg-emerald-500/40 border border-emerald-500 mr-1 align-middle" /> match affidabile (≥75%)</p>
              <p><span className="inline-block w-3 h-3 bg-amber-500/40 border border-amber-500 mr-1 align-middle" /> match incerto</p>
              <p><span className="inline-block w-3 h-3 bg-blue-500/40 border border-blue-500 mr-1 align-middle" /> associazione manuale</p>
              <p><span className="inline-block w-3 h-3 bg-red-500/40 border border-red-500 mr-1 align-middle" /> nessuna foto</p>
            </div>

            <Button
              className="w-full"
              disabled={!dirty || saving}
              onClick={() => onSave(slots)}
              data-testid="button-save-slots"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ImagePlus className="h-4 w-4 mr-2" />}
              Salva modifiche
            </Button>
          </div>
        </div>

        <PhotobookPhotoPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          photos={photos}
          title="Associa foto allo slot"
          currentPhotoId={selected?.photoId}
          onSelect={assignPhoto}
        />
      </DialogContent>
    </Dialog>
  );
}
