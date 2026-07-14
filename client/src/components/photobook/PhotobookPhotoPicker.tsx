/**
 * Dialog di selezione foto dalla galleria (pagina cliente fotolibro).
 * Pensato per gallerie grandi (700+ foto): ricerca per nome, filtro per
 * capitolo e impaginazione a pagine da 60 foto (leggero anche con 500+ foto:
 * viene renderizzata solo la pagina corrente). Ogni miniatura mostra uno
 * skeleton di caricamento finché l'immagine non è pronta.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PhotobookGalleryPhoto, PhotobookGalleryChapter } from '@shared/photobook-types';

const PAGE_SIZE = 60;
const ALL_CHAPTERS = '__all__';
const NO_CHAPTER = '__none__';

/** Miniatura con skeleton: pulse grigio finché l'immagine non è caricata. */
function PickerThumb({ photo }: { photo: PhotobookGalleryPhoto }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="absolute inset-0 bg-stone-200">
      {!loaded && <div className="absolute inset-0 animate-pulse bg-stone-300/70" />}
      <img
        src={photo.thumbnailUrl || photo.url}
        alt={photo.name}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-200 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: PhotobookGalleryPhoto[];
  /** Capitoli della galleria (se presenti, appare il filtro per capitolo) */
  chapters?: PhotobookGalleryChapter[];
  title?: string;
  onSelect: (photo: PhotobookGalleryPhoto) => void;
  /** Id foto da evidenziare come attuale */
  currentPhotoId?: string | null;
}

export default function PhotobookPhotoPicker({
  open,
  onOpenChange,
  photos,
  chapters = [],
  title = 'Scegli una foto',
  onSelect,
  currentPhotoId,
}: Props) {
  const [search, setSearch] = useState('');
  const [chapterFilter, setChapterFilter] = useState<string>(ALL_CHAPTERS);
  const [page, setPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Smartphone touch in orizzontale: mostriamo il suggerimento di ruotare
  const [isLandscapePhone, setIsLandscapePhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(
      '(orientation: landscape) and (pointer: coarse) and (max-width: 932px)',
    );
    const update = () => setIsLandscapePhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Reset dei filtri a ogni apertura
  useEffect(() => {
    if (open) {
      setSearch('');
      setChapterFilter(ALL_CHAPTERS);
      setPage(1);
    }
  }, [open]);

  const chapterIds = useMemo(() => new Set(chapters.map((c) => c.id)), [chapters]);
  const hasUnassigned = useMemo(
    () => chapters.length > 0 && photos.some((p) => !p.chapterId || !chapterIds.has(p.chapterId)),
    [photos, chapters.length, chapterIds],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return photos.filter((p) => {
      if (chapterFilter === NO_CHAPTER) {
        if (p.chapterId && chapterIds.has(p.chapterId)) return false;
      } else if (chapterFilter !== ALL_CHAPTERS) {
        if (p.chapterId !== chapterFilter) return false;
      }
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [photos, search, chapterFilter, chapterIds]);

  // Torna a pagina 1 + scroll in cima quando cambiano i filtri
  useEffect(() => {
    setPage(1);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [search, chapterFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const goToPage = (p: number) => {
    setPage(Math.min(Math.max(1, p), totalPages));
    scrollRef.current?.scrollTo({ top: 0 });
  };

  // Numeri di pagina da mostrare (finestra di 5 attorno alla pagina corrente)
  const pageNumbers = useMemo(() => {
    const windowSize = 5;
    let start = Math.max(1, safePage - Math.floor(windowSize / 2));
    const end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [safePage, totalPages]);

  // Tastiera smartphone: quando riduce lo spazio visibile (>120px), il dialog
  // si restringe all'altezza del visualViewport e si ancora in alto, così la
  // ricerca e i risultati restano visibili sopra la tastiera.
  const [kbHeight, setKbHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setKbHeight(window.innerHeight - vv.height > 120 ? Math.round(vv.height) : null);
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setKbHeight(null);
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-w-3xl h-[85vh] max-h-[85vh] flex flex-col ${
          kbHeight ? 'top-2 translate-y-0' : ''
        }`}
        style={
          kbHeight
            ? { height: `${kbHeight - 16}px`, maxHeight: `${kbHeight - 16}px` }
            : undefined
        }
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {isLandscapePhone && !kbHeight && (
            <p className="text-xs text-stone-500">
              Suggerimento: ruota il telefono in verticale per cercare e scegliere più
              comodamente.
            </p>
          )}
          <DialogDescription data-testid="text-picker-count">
            {filtered.length === photos.length
              ? `${photos.length} foto disponibili nella galleria`
              : `${filtered.length} di ${photos.length} foto`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca per nome file..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-photo-search"
            />
          </div>
          {chapters.length > 0 && (
            <Select value={chapterFilter} onValueChange={setChapterFilter}>
              <SelectTrigger className="sm:w-56" data-testid="select-photo-chapter">
                <SelectValue placeholder="Tutti i capitoli" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CHAPTERS}>Tutti i capitoli</SelectItem>
                {chapters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.titolo}
                  </SelectItem>
                ))}
                {hasUnassigned && (
                  <SelectItem value={NO_CHAPTER}>Senza capitolo</SelectItem>
                )}
              </SelectContent>
            </Select>
          )}
        </div>
        {/* min-h-0 è indispensabile: senza, il figlio flex non si restringe,
            lo scroll non parte e l'infinite-scroll non carica le altre foto */}
        <div ref={scrollRef} className="overflow-y-auto flex-1 min-h-0 mt-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nessuna foto trovata
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {visible.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelect(p);
                      onOpenChange(false);
                    }}
                    className={`group relative aspect-square rounded-md overflow-hidden border-2 transition-colors ${
                      currentPhotoId === p.id
                        ? 'border-primary ring-2 ring-primary/40'
                        : 'border-transparent hover:border-primary/60'
                    }`}
                    data-testid={`button-pick-photo-${p.id}`}
                  >
                    <PickerThumb photo={p} />
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                      {p.name}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 pt-2 border-t shrink-0">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              disabled={safePage === 1}
              onClick={() => goToPage(safePage - 1)}
              aria-label="Pagina precedente"
              data-testid="button-picker-prev"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {pageNumbers[0] > 1 && (
              <span className="px-1 text-xs text-muted-foreground">…</span>
            )}
            {pageNumbers.map((n) => (
              <Button
                key={n}
                variant={n === safePage ? 'default' : 'ghost'}
                size="icon"
                className="h-9 w-9 text-xs"
                onClick={() => goToPage(n)}
                data-testid={`button-picker-page-${n}`}
              >
                {n}
              </Button>
            ))}
            {pageNumbers[pageNumbers.length - 1] < totalPages && (
              <span className="px-1 text-xs text-muted-foreground">…</span>
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              disabled={safePage === totalPages}
              onClick={() => goToPage(safePage + 1)}
              aria-label="Pagina successiva"
              data-testid="button-picker-next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
