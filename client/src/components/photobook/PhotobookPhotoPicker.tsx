/**
 * Dialog di selezione foto dalla galleria (pagina cliente fotolibro).
 * Pensato per gallerie grandi (700+ foto): ricerca per nome, filtro per
 * capitolo e rendering progressivo (batch da 60 con sentinella infinite-scroll).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import type { PhotobookGalleryPhoto, PhotobookGalleryChapter } from '@shared/photobook-types';

const BATCH_SIZE = 60;
const ALL_CHAPTERS = '__all__';
const NO_CHAPTER = '__none__';

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
  const [visibleLimit, setVisibleLimit] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
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
      setVisibleLimit(BATCH_SIZE);
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

  // Reset finestra di rendering + scroll in cima quando cambiano i filtri
  useEffect(() => {
    setVisibleLimit(BATCH_SIZE);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [search, chapterFilter]);

  const visible = filtered.slice(0, visibleLimit);
  const hasMore = filtered.length > visibleLimit;

  // Infinite scroll: la sentinella carica il batch successivo.
  // Ri-armato a ogni variazione di visibleLimit/hasMore (l'observer va
  // ricreato o si blocca dopo il primo incremento).
  useEffect(() => {
    if (!open || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleLimit((prev) => prev + BATCH_SIZE);
        }
      },
      { root: scrollRef.current, rootMargin: '300px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, hasMore, visibleLimit]);

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
                    <img
                      src={p.thumbnailUrl || p.url}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                      {p.name}
                    </span>
                  </button>
                ))}
              </div>
              {hasMore && (
                <div
                  ref={sentinelRef}
                  className="py-4 text-center text-xs text-muted-foreground"
                  data-testid="sentinel-load-more"
                >
                  Caricamento altre foto...
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
