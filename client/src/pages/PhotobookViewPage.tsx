/**
 * Pagina cliente revisione fotolibro — /fotolibro/:token
 * Accessibile SOLO tramite link a token (invisibile agli ospiti della galleria).
 * Il cliente disegna una X a mano libera sulla foto da modificare: ogni X
 * riceve un colore automatico dalla palette e diventa una richiesta
 * (Sostituisci / Elimina / Modifica con nota obbligatoria). Le X restano in
 * bozza (annullabili) finché non vengono inviate tutte insieme; all'invio
 * viene caricato uno snapshot JPEG di ogni pagina con le X disegnate.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePhoneOrientation } from '@/hooks/use-phone-orientation';
import { useParams } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  getPhotobookByToken,
  getPhotobookGalleryPhotosByToken,
  submitPhotobookRequests,
  uploadPhotobookSnapshot,
  deletePhotobookRequestByToken,
  type PhotobookClientRequestDraft,
} from '@/lib/photobooks';
import {
  PHOTOBOOK_MARK_PALETTE,
  photobookMarkColorName,
  type PhotobookPage,
  type PhotobookMarkPoint,
  type PhotobookGalleryPhoto,
  type PhotobookChangeRequest,
} from '@shared/photobook-types';
import PhotobookPhotoPicker from '@/components/photobook/PhotobookPhotoPicker';
import PhotobookMarkCanvas, {
  generatePageSnapshot,
  hapticFeedback,
  type CanvasMark,
} from '@/components/photobook/PhotobookMarkCanvas';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  BookImage,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  MessageSquareText,
  Replace,
  Send,
  Smartphone,
  Trash2,
  Undo2,
  X as XIcon,
} from 'lucide-react';

interface DraftEntry extends PhotobookClientRequestDraft {
  id: string;
  pageNumber: number;
}

function newDraftId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `mark-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Altezza del viewport visibile (esclusa la tastiera su iOS, dove la tastiera
 * si sovrappone al layout invece di ridimensionarlo). Su Android il meta tag
 * interactive-widget=resizes-content fa già ridurre il viewport.
 */
function useVisualViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // Segnala solo quando la tastiera riduce davvero lo spazio (>120px)
      setHeight(window.innerHeight - vv.height > 120 ? Math.round(vv.height) : null);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return height;
}

export default function PhotobookViewPage() {
  const { token = '' } = useParams<{ token: string }>();
  const { toast } = useToast();

  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Map<string, DraftEntry>>(new Map());
  const [activeMark, setActiveMark] = useState<{
    page: PhotobookPage;
    strokes: PhotobookMarkPoint[][];
    color: string;
  } | null>(null);
  const [noteMode, setNoteMode] = useState<'edit' | 'replace' | 'delete' | null>(null);
  const [note, setNote] = useState('');
  const [pendingReplacement, setPendingReplacement] = useState<PhotobookGalleryPhoto | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const { isPhone: isTouchPhone, isPortrait } = usePhoneOrientation();
  const isPortraitPhone = isTouchPhone && isPortrait;
  const keyboardHeight = useVisualViewportHeight();
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sequenza su telefono: azione scelta in orizzontale → overlay "Ruota in
  // verticale" SENZA tastiera (autofocus bloccato + blur di sicurezza);
  // appena ruotato in verticale, focus sul campo nota → si apre la tastiera.
  useEffect(() => {
    if (!isTouchPhone || !noteMode) return;
    if (!isPortraitPhone) {
      // Overlay visibile: chiudi eventuale tastiera già aperta
      (document.activeElement as HTMLElement | null)?.blur?.();
      return;
    }
    const t = setTimeout(() => noteTextareaRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [isTouchPhone, isPortraitPhone, noteMode]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['/api/photobooks/by-token', token, selectedVersion],
    queryFn: () => getPhotobookByToken(token, selectedVersion ?? undefined),
    enabled: !!token,
  });

  const { data: galleryData } = useQuery({
    queryKey: ['/api/photobooks/by-token', token, 'gallery-photos'],
    queryFn: () => getPhotobookGalleryPhotosByToken(token),
    enabled: !!data,
    staleTime: 5 * 60 * 1000,
  });
  const photos = galleryData?.photos || [];
  const chapters = galleryData?.chapters || [];

  /** X già inviate, per pagina (visibili in sola lettura sul canvas). */
  const sentMarksByPage = useMemo(() => {
    const map = new Map<string, CanvasMark[]>();
    for (const r of data?.requests || []) {
      if (!r.markStrokes || !r.markColor) continue;
      if (!map.has(r.pageId)) map.set(r.pageId, []);
      map.get(r.pageId)!.push({ color: r.markColor, strokes: r.markStrokes });
    }
    return map;
  }, [data?.requests]);

  /** Richieste già inviate, per pagina (per la cancellazione da parte del cliente). */
  const sentRequestsByPage = useMemo(() => {
    const map = new Map<string, PhotobookChangeRequest[]>();
    for (const r of data?.requests || []) {
      if (!map.has(r.pageId)) map.set(r.pageId, []);
      map.get(r.pageId)!.push(r);
    }
    return map;
  }, [data?.requests]);

  const draftsByPage = useMemo(() => {
    const map = new Map<string, DraftEntry[]>();
    for (const d of drafts.values()) {
      if (!map.has(d.pageId)) map.set(d.pageId, []);
      map.get(d.pageId)!.push(d);
    }
    return map;
  }, [drafts]);

  /** Prossimo colore disponibile per una pagina (primo non usato, poi cicla). */
  const nextColorForPage = (pageId: string): string => {
    const used = new Set<string>();
    for (const m of sentMarksByPage.get(pageId) || []) used.add(m.color.toLowerCase());
    for (const d of draftsByPage.get(pageId) || []) used.add(d.markColor.toLowerCase());
    const free = PHOTOBOOK_MARK_PALETTE.find((c) => !used.has(c.hex.toLowerCase()));
    if (free) return free.hex;
    return PHOTOBOOK_MARK_PALETTE[used.size % PHOTOBOOK_MARK_PALETTE.length].hex;
  };

  const submitMutation = useMutation({
    mutationFn: async (entries: DraftEntry[]) => {
      // 1) Snapshot per pagina (obbligatorio: senza snapshot l'invio si blocca)
      const pageIds = Array.from(new Set(entries.map((d) => d.pageId)));
      const snapshotByPage = new Map<string, string>();
      setSubmitProgress({ done: 0, total: pageIds.length });
      for (const pageId of pageIds) {
        const page = data?.pages.find((p) => p.id === pageId);
        if (!page) {
          throw new Error('Pagina non trovata: ricarica la pagina e riprova.');
        }
        try {
          const marks: CanvasMark[] = [
            ...(sentMarksByPage.get(pageId) || []),
            ...entries
              .filter((d) => d.pageId === pageId)
              .map((d) => ({ color: d.markColor, strokes: d.markStrokes })),
          ];
          const blob = await generatePageSnapshot(page.displayUrl || page.url, marks);
          const url = await uploadPhotobookSnapshot(token, pageId, blob);
          snapshotByPage.set(pageId, url);
          setSubmitProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        } catch (e) {
          console.error('[fotolibro] Snapshot pagina non generato:', e);
          throw new Error(
            `Impossibile salvare l'immagine della pagina ${page.pageNumber} con le X. ` +
              'Controlla la connessione e riprova: nessuna richiesta è stata inviata.',
          );
        }
      }
      // 2) Invio richieste
      return submitPhotobookRequests(
        token,
        entries.map(({ id, pageNumber, ...rest }) => ({
          ...rest,
          snapshotUrl: snapshotByPage.get(rest.pageId)!,
        })),
      );
    },
    onSuccess: (r) => {
      hapticFeedback([30, 60, 30]);
      setDrafts(new Map());
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/photobooks/by-token', token] });
      toast({
        title: 'Richieste inviate',
        description: `${r.count} richieste di modifica inviate al fotografo. Grazie!`,
      });
    },
    onError: (e: any) =>
      toast({ title: 'Errore invio richieste', description: e.message, variant: 'destructive' }),
    onSettled: () => setSubmitProgress(null),
  });

  const isCurrentVersion = data ? data.version === data.photobook.currentVersion : true;
  const isLocked = !!data?.photobook.locked;
  const canEdit = isCurrentVersion && !isLocked;

  /** Cancellazione di una richiesta già inviata (solo fotolibro sbloccato). */
  const [deleteSentTarget, setDeleteSentTarget] = useState<PhotobookChangeRequest | null>(null);
  const deleteSentMutation = useMutation({
    mutationFn: async (request: PhotobookChangeRequest) => {
      // Rigenera lo snapshot della pagina senza la X cancellata, così le
      // richieste rimaste sulla pagina mostrano l'immagine aggiornata.
      let newSnapshotUrl: string | null = null;
      const page = data?.pages.find((p) => p.id === request.pageId);
      const remaining = (sentRequestsByPage.get(request.pageId) || []).filter(
        (r) => r.id !== request.id && r.markStrokes && r.markColor,
      );
      if (page && remaining.length > 0) {
        const marks: CanvasMark[] = remaining.map((r) => ({
          color: r.markColor!,
          strokes: r.markStrokes!,
        }));
        try {
          const blob = await generatePageSnapshot(page.displayUrl || page.url, marks);
          newSnapshotUrl = await uploadPhotobookSnapshot(token, page.id, blob);
        } catch (e) {
          // Snapshot best-effort: la cancellazione procede comunque
          console.error('[fotolibro] Snapshot post-cancellazione non generato:', e);
        }
      }
      await deletePhotobookRequestByToken(token, request.id, newSnapshotUrl);
    },
    onSuccess: () => {
      setDeleteSentTarget(null);
      queryClient.invalidateQueries({ queryKey: ['/api/photobooks/by-token', token] });
      toast({
        title: 'Richiesta cancellata',
        description: 'La X e la richiesta inviata sono state rimosse.',
      });
    },
    onError: (e: any) =>
      toast({ title: 'Errore cancellazione', description: e.message, variant: 'destructive' }),
  });

  // ---- Navigazione pagine + preload ------------------------------------
  const pagesList = useMemo(() => data?.pages || [], [data?.pages]);
  const pageElsRef = useRef(new Map<number, HTMLDivElement>()); // indice -> elemento
  const preloadedRef = useRef(new Set<string>());
  const [currentPageNumber, setCurrentPageNumber] = useState<number | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);

  // Modalità sfoglio su smartphone: una pagina alla volta.
  // Riparte dall'ultima pagina vista (salvata sul telefono).
  const [slideIdx, setSlideIdx] = useState(() => {
    const v = Number(localStorage.getItem(`pb_slide_${token}`));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  });
  const safeSlideIdx = Math.min(slideIdx, Math.max(0, pagesList.length - 1));
  useEffect(() => {
    if (isTouchPhone) localStorage.setItem(`pb_slide_${token}`, String(safeSlideIdx));
  }, [safeSlideIdx, isTouchPhone, token]);

  // Cliente sta disegnando (penna attiva o X non confermata): blocca la navigazione
  const [hasPendingDrawing, setHasPendingDrawing] = useState(false);
  // Rimbalzo visivo quando si prova ad andare oltre la prima/ultima pagina
  const [bounceDir, setBounceDir] = useState<'prev' | 'next' | null>(null);
  const bounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goToSlide = (idx: number) => {
    if (hasPendingDrawing) {
      toast({
        title: 'X in corso',
        description: 'Conferma o annulla la X che stai disegnando prima di cambiare pagina.',
      });
      return;
    }
    const next = Math.min(Math.max(0, idx), pagesList.length - 1);
    if (next === safeSlideIdx) {
      // Prima/ultima pagina: piccolo rimbalzo per dire che il libro è finito
      if (idx !== safeSlideIdx) {
        hapticFeedback();
        setBounceDir(idx < 0 ? 'prev' : 'next');
        if (bounceTimerRef.current) clearTimeout(bounceTimerRef.current);
        bounceTimerRef.current = setTimeout(() => setBounceDir(null), 220);
      }
      return;
    }
    hapticFeedback();
    setSlideIdx(next);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  useEffect(
    () => () => {
      if (bounceTimerRef.current) clearTimeout(bounceTimerRef.current);
    },
    [],
  );

  // Swipe orizzontale per sfogliare (disattivato mentre si disegna)
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const onSwipeStart = (e: React.TouchEvent) => {
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onSwipeEnd = (e: React.TouchEvent) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || hasPendingDrawing) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) {
      goToSlide(dx < 0 ? safeSlideIdx + 1 : safeSlideIdx - 1);
    }
  };

  // Controlli auto-nascosti: frecce e pillola svaniscono dopo 3s di inattività
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isTouchPhone) return;
    const show = () => {
      setControlsVisible(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    };
    show();
    window.addEventListener('pointerdown', show);
    return () => {
      window.removeEventListener('pointerdown', show);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [isTouchPhone, safeSlideIdx]);

  // Se cambiano le pagine (es. cambio versione), riallinea l'indice
  useEffect(() => {
    setSlideIdx((idx) => Math.min(idx, Math.max(0, pagesList.length - 1)));
  }, [pagesList.length]);

  // Preload in modalità sfoglio: pagina precedente + 3 successive
  useEffect(() => {
    if (!isTouchPhone || pagesList.length === 0) return;
    for (let i = safeSlideIdx - 1; i <= safeSlideIdx + 3; i++) {
      if (i < 0 || i >= pagesList.length) continue;
      const url = pagesList[i].displayUrl || pagesList[i].url;
      if (preloadedRef.current.has(url)) continue;
      preloadedRef.current.add(url);
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
    }
  }, [isTouchPhone, safeSlideIdx, pagesList]);

  // Preload delle 3 pagine successive quando una pagina entra in vista +
  // aggiornamento della pillola "Pagina X di N" (solo vista a lista)
  useEffect(() => {
    if (isTouchPhone) return;
    if (pagesList.length === 0) return;
    const els = pageElsRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          let idx = -1;
          for (const [i, el] of els) if (el === en.target) idx = i;
          if (idx < 0) continue;
          setCurrentPageNumber(pagesList[idx]?.pageNumber ?? null);
          for (let i = idx + 1; i <= idx + 3 && i < pagesList.length; i++) {
            const url = pagesList[i].displayUrl || pagesList[i].url;
            if (preloadedRef.current.has(url)) continue;
            preloadedRef.current.add(url);
            const img = new Image();
            img.decoding = 'async';
            img.src = url;
          }
        }
      },
      { rootMargin: '100px 0px', threshold: 0.15 },
    );
    for (const el of els.values()) io.observe(el);
    return () => io.disconnect();
  }, [pagesList, isTouchPhone]);

  const jumpToPage = (idx: number) => {
    setJumpOpen(false);
    if (isTouchPhone) {
      goToSlide(idx);
      return;
    }
    const el = pageElsRef.current.get(idx);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCurrentPageNumber(pagesList[idx]?.pageNumber ?? null);
    }
  };
  // -----------------------------------------------------------------------

  const onMarkComplete = (page: PhotobookPage, strokes: PhotobookMarkPoint[][]) => {
    if (!canEdit) return;
    setActiveMark({ page, strokes, color: nextColorForPage(page.id) });
    setNoteMode(null);
    setNote('');
    setPendingReplacement(null);
  };

  // Se l'admin manda in stampa mentre il cliente sta lavorando, chiudi
  // dialog aperti e scarta le bozze locali: la pagina diventa sola lettura.
  useEffect(() => {
    if (isLocked) {
      setDrafts(new Map());
      setActiveMark(null);
      setNoteMode(null);
      setNote('');
      setPendingReplacement(null);
      setPickerOpen(false);
      setConfirmOpen(false);
      setDeleteSentTarget(null);
    }
  }, [isLocked]);

  const saveDraft = (
    entry: Omit<DraftEntry, 'id' | 'pageId' | 'pageNumber' | 'markColor' | 'markStrokes'>,
  ) => {
    if (!activeMark) return;
    hapticFeedback();
    const id = newDraftId();
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(id, {
        ...entry,
        id,
        pageId: activeMark.page.id,
        pageNumber: activeMark.page.pageNumber,
        markColor: activeMark.color,
        markStrokes: activeMark.strokes,
      });
      return next;
    });
    setActiveMark(null);
    setNoteMode(null);
    setNote('');
    setPendingReplacement(null);
  };

  const removeDraft = (id: string) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center space-y-2">
            <BookImage className="h-10 w-10 mx-auto text-stone-400" />
            <h1 className="font-semibold text-lg">Fotolibro non trovato</h1>
            <p className="text-sm text-muted-foreground">
              Il link non è valido o è scaduto. Contatta il tuo fotografo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { photobook, pages } = data;

  return (
    <div className="min-h-screen bg-stone-50 pb-28">
      {/* Su smartphone in verticale il fotolibro non si vede: schermata "ruota il
          telefono". Sospesa mentre si scrive una nota o si cerca una foto: così
          il cliente può ruotare in verticale per digitare comodamente e poi
          tornare in orizzontale. */}
      {/* Mentre si scrive una nota in orizzontale: overlay a schermo intero che
          invita a ruotare in verticale. Montato con portal su document.body e
          z-[200] per stare SOPRA i dialog Radix (z-50); scompare appena si ruota. */}
      {isTouchPhone && !isPortraitPhone && (!!noteMode || pickerOpen) && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-stone-900/95 flex flex-col items-center justify-center gap-4 p-8 text-center"
          data-testid="overlay-rotate-portrait"
        >
          <Smartphone className="h-14 w-14 text-white animate-pulse" />
          <p className="text-white font-semibold text-xl">Ruota in verticale</p>
          <p className="text-stone-300 text-sm max-w-xs">
            {noteMode
              ? 'Per scrivere la nota è più comodo il telefono in verticale: la tastiera lascia spazio al testo. Quando hai finito, torna in orizzontale per vedere la pagina grande.'
              : 'Per cercare e scegliere la foto sostitutiva è più comodo il telefono in verticale. Quando hai finito, torna in orizzontale per vedere la pagina grande.'}
          </p>
        </div>,
        document.body,
      )}
      {isPortraitPhone && !noteMode && !pickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-stone-900/95 flex flex-col items-center justify-center gap-4 p-8 text-center"
          data-testid="overlay-rotate"
        >
          <Smartphone className="h-14 w-14 text-white rotate-90 animate-pulse" />
          <p className="text-white font-semibold text-xl">Ruota il telefono</p>
          <p className="text-stone-300 text-sm max-w-xs">
            Il fotolibro si sfoglia in orizzontale: ruota il telefono per vedere le pagine a
            schermo intero e disegnare le X con precisione.
          </p>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <BookImage className="h-5 w-5 text-stone-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold truncate" data-testid="text-photobook-name">{photobook.name}</h1>
            <p className="text-xs text-muted-foreground">
              Revisione fotolibro · {pages.length} pagine
            </p>
          </div>
          {photobook.versions.length > 1 && (
            <Select
              value={String(data.version)}
              onValueChange={(v) => setSelectedVersion(Number(v))}
            >
              <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-client-version">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {photobook.versions.map((v) => (
                  <SelectItem key={v.version} value={String(v.version)}>
                    Versione {v.version}
                    {v.version === photobook.currentVersion ? ' (attuale)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </header>

      <main
        className={`max-w-4xl mx-auto px-2 sm:px-4 space-y-4 sm:space-y-6 ${
          isTouchPhone ? 'py-1.5 pb-8' : 'py-4 sm:py-6'
        }`}
      >
        {isLocked && (
          <Card className="border-stone-300 bg-stone-100" data-testid="banner-locked">
            <CardContent className="py-4 flex items-start gap-3">
              <Lock className="h-5 w-5 text-stone-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-stone-800">Album mandato in stampa</p>
                <p className="text-sm text-stone-600">
                  Non è più possibile apportare modifiche. Puoi comunque sfogliare le pagine e
                  rivedere le richieste inviate.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!isCurrentVersion && !isLocked && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="py-3 text-sm text-amber-800">
              Stai guardando una versione precedente del fotolibro (solo lettura). Torna alla
              versione attuale per richiedere modifiche.
            </CardContent>
          </Card>
        )}

        {canEdit && !isTouchPhone && (
          <p className="text-sm text-muted-foreground px-1">
            Tocca <span className="font-medium text-foreground">"Segna una X"</span> su una pagina e
            disegna una X sulla foto che vuoi far modificare: ogni X prende un colore diverso e
            diventa una richiesta (sostituzione, eliminazione o modifica). Le tue richieste restano
            in bozza finché non le invii tutte insieme. Le richieste già inviate si possono
            cancellare finché l'album non va in stampa.
          </p>
        )}

        {/* Su smartphone: modalità sfoglio, una pagina alla volta */}
        {(isTouchPhone
          ? pages.slice(safeSlideIdx, safeSlideIdx + 1).map((p) => [p, safeSlideIdx] as const)
          : pages.map((p, i) => [p, i] as const)
        ).map(([page, pageIdx]) => {
          const pageDrafts = draftsByPage.get(page.id) || [];
          const pageSent = sentRequestsByPage.get(page.id) || [];
          const marks: CanvasMark[] = [
            ...(sentMarksByPage.get(page.id) || []),
            ...pageDrafts.map((d) => ({
              color: d.markColor,
              strokes: d.markStrokes,
              isDraft: true,
            })),
          ];
          return (
            <div
              key={page.id}
              ref={(el) => {
                if (el) pageElsRef.current.set(pageIdx, el);
                else pageElsRef.current.delete(pageIdx);
              }}
              className={`space-y-1.5 scroll-mt-20 ${
                isTouchPhone ? 'animate-in fade-in duration-200' : ''
              }`}
              onTouchStart={isTouchPhone ? onSwipeStart : undefined}
              onTouchEnd={isTouchPhone ? onSwipeEnd : undefined}
              // Le pagine fuori schermo non vengono renderizzate: scroll più
              // fluido su smartphone con molte pagine
              style={{
                contentVisibility: 'auto',
                containIntrinsicSize: '900px',
                transition: 'transform 150ms ease-out',
                transform: bounceDir
                  ? `translateX(${bounceDir === 'next' ? -10 : 10}px)`
                  : undefined,
              }}
            >
              <div className="flex items-center gap-2 flex-wrap px-1">
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                  Pagina {page.pageNumber}
                </p>
                {pageSent.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1 text-[10px] bg-stone-100 border border-stone-200 rounded-full pl-1.5 pr-1 py-0.5 text-stone-600"
                    data-testid={`chip-sent-${r.id}`}
                  >
                    {r.markColor && (
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: r.markColor }}
                      />
                    )}
                    {r.type === 'replace'
                      ? 'Sostituisci'
                      : r.type === 'delete'
                        ? 'Elimina'
                        : 'Modifica'}
                    {' · inviata'}
                    {canEdit && (
                      <button
                        type="button"
                        className="-my-2 -mr-1 ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-400 hover:text-destructive active:bg-stone-200"
                        title="Cancella questa richiesta inviata"
                        onClick={() => setDeleteSentTarget(r)}
                        data-testid={`button-delete-sent-${r.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                ))}
                {pageDrafts.map((d) => (
                  <span
                    key={d.id}
                    className="inline-flex items-center gap-1 text-[10px] bg-white border rounded-full pl-1.5 pr-1 py-0.5"
                    data-testid={`chip-draft-${d.id}`}
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: d.markColor }}
                    />
                    {d.type === 'replace'
                      ? 'Sostituisci'
                      : d.type === 'delete'
                        ? 'Elimina'
                        : 'Modifica'}
                    <button
                      type="button"
                      className="-my-2 -mr-1 ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-400 hover:text-destructive active:bg-stone-200"
                      title="Annulla questa richiesta"
                      onClick={() => removeDraft(d.id)}
                      data-testid={`button-remove-draft-${d.id}`}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <PhotobookMarkCanvas
                pageUrl={page.displayUrl || page.url}
                pageAlt={`Pagina ${page.pageNumber}`}
                marks={marks}
                nextColor={nextColorForPage(page.id)}
                drawingEnabled={canEdit}
                onMarkComplete={(strokes) => onMarkComplete(page, strokes)}
                onPendingChange={setHasPendingDrawing}
                fitViewport={isTouchPhone}
              />
            </div>
          );
        })}
      </main>

      {/* Navigazione sfoglio (solo smartphone, nascosta mentre si disegna una X):
          frecce sovrapposte ai lati e pillola compatta in basso, così la pagina
          usa quasi tutta l'altezza dello schermo */}
      {isTouchPhone && pages.length > 0 && !hasPendingDrawing && (
        <>
          <button
            type="button"
            onClick={() => goToSlide(safeSlideIdx - 1)}
            disabled={safeSlideIdx === 0}
            className={`fixed left-1.5 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center h-11 w-11 rounded-full bg-stone-900/60 text-white backdrop-blur-sm shadow-lg active:scale-95 transition-opacity duration-300 disabled:opacity-25 ${
              controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            aria-label="Pagina precedente"
            data-testid="button-slide-prev"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => goToSlide(safeSlideIdx + 1)}
            disabled={safeSlideIdx >= pages.length - 1}
            className={`fixed right-1.5 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center h-11 w-11 rounded-full bg-stone-900/60 text-white backdrop-blur-sm shadow-lg active:scale-95 transition-opacity duration-300 disabled:opacity-25 ${
              controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            aria-label="Pagina successiva"
            data-testid="button-slide-next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => setJumpOpen(true)}
            className={`fixed left-1/2 -translate-x-1/2 z-20 rounded-full bg-stone-900/60 text-white backdrop-blur-sm px-3 py-1 text-xs font-medium shadow-lg active:scale-95 transition-opacity duration-300 bottom-1.5 ${
              controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            data-testid="button-page-pill-slide"
          >
            Pagina {pages[safeSlideIdx]?.pageNumber} di {pages.length}
          </button>
        </>
      )}

      {/* Pillola "Pagina X di N" con salto rapido (vista a lista) */}
      {!isTouchPhone && pages.length > 1 && currentPageNumber !== null && (
        <button
          type="button"
          onClick={() => setJumpOpen(true)}
          className={`fixed left-3 z-20 flex items-center gap-1.5 bg-stone-900/80 text-white backdrop-blur-sm rounded-full px-3 py-1.5 text-xs font-medium shadow-lg active:scale-95 transition-transform ${
            canEdit && drafts.size > 0 ? 'bottom-20' : 'bottom-3'
          }`}
          data-testid="button-page-pill"
        >
          Pagina {currentPageNumber} di {pages.length}
        </button>
      )}

      {/* Dialog salto rapido alla pagina */}
      <Dialog open={jumpOpen} onOpenChange={setJumpOpen}>
        <DialogContent className="max-w-sm max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vai alla pagina</DialogTitle>
            <DialogDescription>Tocca un numero per saltare alla pagina.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-5 gap-2">
            {pages.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => jumpToPage(idx)}
                className={`h-10 rounded-md border text-sm font-medium active:scale-95 transition-transform ${
                  (isTouchPhone ? idx === safeSlideIdx : p.pageNumber === currentPageNumber)
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-700 hover:bg-stone-100'
                }`}
                data-testid={`button-jump-page-${p.pageNumber}`}
              >
                {p.pageNumber}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Bozze su smartphone: nessuna barra fissa (coprirebbe la pagina e in
          modalità disegno lo scroll è bloccato). Solo un bottone flottante che
          apre il riepilogo con invio e "Annulla tutte". */}
      {canEdit && drafts.size > 0 && isTouchPhone && !hasPendingDrawing && (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="fixed bottom-1.5 right-1.5 z-30 flex items-center gap-1.5 rounded-full bg-stone-900/85 text-white backdrop-blur-sm pl-3 pr-3.5 py-2 text-xs font-semibold shadow-lg active:scale-95"
          data-testid="button-drafts-fab"
        >
          <Send className="h-3.5 w-3.5" />
          {drafts.size === 1 ? '1 bozza' : `${drafts.size} bozze`} · Invia
        </button>
      )}

      {/* Barra invio (solo desktop/tablet; nascosta se l'album è andato in stampa) */}
      {canEdit && drafts.size > 0 && !isTouchPhone && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t shadow-lg">
          <div
            className={`max-w-4xl mx-auto px-3 sm:px-4 flex items-center gap-2 sm:gap-3 ${
              isTouchPhone ? 'py-1.5' : 'py-3'
            }`}
          >
            <Badge variant="secondary" className="shrink-0">
              {drafts.size} {drafts.size === 1 ? 'bozza' : 'bozze'}
            </Badge>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearAllOpen(true)}
              data-testid="button-clear-all-drafts"
            >
              <Undo2 className="h-3.5 w-3.5 mr-1.5" />
              Annulla tutte
            </Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)} data-testid="button-open-submit">
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Invia {drafts.size === 1 ? '1 richiesta' : `${drafts.size} richieste`}
            </Button>
          </div>
        </div>
      )}

      {/* Conferma "Annulla tutte" (evita cancellazioni accidentali su smartphone) */}
      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminare {drafts.size === 1 ? 'la bozza' : `tutte le ${drafts.size} bozze`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Le X e le richieste non ancora inviate verranno cancellate. Le richieste già
              inviate non saranno toccate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setDrafts(new Map());
                setClearAllOpen(false);
                setConfirmOpen(false);
              }}
              data-testid="button-confirm-clear-all"
            >
              Elimina bozze
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog azioni per la X appena disegnata */}
      <Dialog
        open={!!activeMark && !noteMode && !pickerOpen}
        onOpenChange={(o) => !o && setActiveMark(null)}
      >
        <DialogContent className="max-w-sm max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span
                className="inline-block w-3.5 h-3.5 rounded-full border shrink-0"
                style={{ backgroundColor: activeMark?.color }}
              />
              Pagina {activeMark?.page.pageNumber}
            </DialogTitle>
            <DialogDescription>
              Cosa vuoi richiedere per la foto segnata con la X? Se chiudi, la X viene annullata.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                setPickerOpen(true);
              }}
              data-testid="button-action-replace"
            >
              <Replace className="h-4 w-4 mr-2" />
              Sostituisci con un'altra foto
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => setNoteMode('delete')}
              data-testid="button-action-delete"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Elimina questa foto
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => setNoteMode('edit')}
              data-testid="button-action-edit"
            >
              <MessageSquareText className="h-4 w-4 mr-2" />
              Richiedi una modifica
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog nota (elimina / modifica / conferma sostituzione) */}
      <Dialog
        open={!!activeMark && !!noteMode}
        onOpenChange={(o) => {
          if (!o) {
            setNoteMode(null);

            setPendingReplacement(null);
          }
        }}
      >
        <DialogContent
          // Su smartphone il dialog è ancorato in alto: la tastiera copre la
          // metà bassa dello schermo, così il campo nota resta sempre visibile.
          // Con tastiera aperta il dialog si restringe all'altezza visibile
          // (visualViewport) e scorre al suo interno.
          // In orizzontale niente autofocus: c'è l'overlay "Ruota in verticale"
          // e la tastiera NON deve aprirsi; si aprirà dopo la rotazione.
          onOpenAutoFocus={(e) => {
            if (isTouchPhone && !isPortraitPhone) e.preventDefault();
          }}
          className={`max-w-sm overflow-y-auto ${
            isTouchPhone ? 'top-2 translate-y-0 max-h-[80dvh]' : 'max-h-[90dvh]'
          } ${isTouchPhone && keyboardHeight ? 'p-3 gap-2' : ''}`}
          style={
            isTouchPhone && keyboardHeight
              ? { maxHeight: `${keyboardHeight - 16}px` }
              : undefined
          }
        >
          <DialogHeader className={isTouchPhone && keyboardHeight ? 'space-y-0' : undefined}>
            <DialogTitle className={isTouchPhone && keyboardHeight ? 'text-base' : undefined}>
              {noteMode === 'edit'
                ? 'Richiedi una modifica'
                : noteMode === 'delete'
                  ? 'Elimina foto'
                  : 'Sostituisci foto'}
            </DialogTitle>
            <DialogDescription
              className={isTouchPhone && keyboardHeight ? 'hidden' : undefined}
            >
              {noteMode === 'edit'
                ? 'Descrivi la modifica che desideri (obbligatorio).'
                : noteMode === 'delete'
                  ? 'La foto segnata con la X verrà rimossa dal fotolibro. Puoi aggiungere una nota (facoltativa).'
                  : `Sostituzione con: ${pendingReplacement?.name || ''}. Puoi aggiungere una nota (facoltativa).`}
            </DialogDescription>
          </DialogHeader>
          {noteMode === 'replace' && pendingReplacement && !(isTouchPhone && keyboardHeight) && (
            <img
              src={pendingReplacement.thumbnailUrl || pendingReplacement.url}
              alt={pendingReplacement.name}
              className="w-24 h-24 rounded-md object-cover border mx-auto"
            />
          )}
          <Textarea
            ref={noteTextareaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              noteMode === 'edit'
                ? 'Es. Potete schiarire questa foto? / Vorrei un ritaglio diverso...'
                : 'Nota facoltativa...'
            }
            rows={isTouchPhone ? 2 : 3}
            className={isTouchPhone && keyboardHeight ? 'min-h-0' : undefined}
            data-testid="input-request-note"
          />
          <DialogFooter
            className={isTouchPhone && keyboardHeight ? 'flex-row justify-end gap-2 space-x-0' : undefined}
          >
            <Button
              variant="outline"
              size={isTouchPhone && keyboardHeight ? 'sm' : 'default'}
              onClick={() => { setNoteMode(null); setPendingReplacement(null); }}
            >
              Indietro
            </Button>
            <Button
              size={isTouchPhone && keyboardHeight ? 'sm' : 'default'}
              disabled={noteMode === 'edit' && !note.trim()}
              onClick={() => {
                if (noteMode === 'edit') {
                  saveDraft({ type: 'edit', note: note.trim() });
                } else if (noteMode === 'delete') {
                  saveDraft({ type: 'delete', note: note.trim() || undefined });
                } else if (noteMode === 'replace' && pendingReplacement) {
                  saveDraft({
                    type: 'replace',
                    replacementPhotoId: pendingReplacement.id,
                    replacementPhotoName: pendingReplacement.name,
                    replacementPhotoThumbnailUrl:
                      pendingReplacement.thumbnailUrl || pendingReplacement.url,
                    note: note.trim() || undefined,
                  });
                }
              }}
              data-testid="button-save-draft"
            >
              Aggiungi alla bozza
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conferma cancellazione richiesta già inviata */}
      <AlertDialog
        open={!!deleteSentTarget}
        onOpenChange={(o) => !o && !deleteSentMutation.isPending && setDeleteSentTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancellare questa richiesta?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteSentTarget && (
                <>
                  La richiesta {deleteSentTarget.markColor
                    ? `con la X ${photobookMarkColorName(deleteSentTarget.markColor)}`
                    : 'inviata'}{' '}
                  a pagina {deleteSentTarget.pageNumber} (
                  {deleteSentTarget.type === 'replace'
                    ? `sostituzione con ${deleteSentTarget.replacementPhotoName || 'altra foto'}`
                    : deleteSentTarget.type === 'delete'
                      ? 'eliminazione foto'
                      : 'modifica'}
                  ) verrà rimossa e il fotografo non la vedrà più.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSentMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteSentMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteSentTarget) deleteSentMutation.mutate(deleteSentTarget);
              }}
              data-testid="button-confirm-delete-sent"
            >
              {deleteSentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cancella richiesta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Picker foto sostitutiva */}
      <PhotobookPhotoPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        photos={photos}
        chapters={chapters}
        title="Scegli la foto sostitutiva"
        onSelect={(p) => {
          setPendingReplacement(p);
          setNoteMode('replace');
        }}
      />

      {/* Conferma invio */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!o && submitMutation.isPending) return;
          setConfirmOpen(o);
        }}
      >
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invia le richieste al fotografo</DialogTitle>
            <DialogDescription>
              Controlla il riepilogo: dopo l'invio potrai comunque cancellare le richieste
              finché il fotolibro non verrà mandato in stampa.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {Array.from(drafts.values())
              .sort((a, b) => a.pageNumber - b.pageNumber)
              .map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-sm border rounded-md p-2">
                  <span
                    className="inline-block w-3 h-3 rounded-full border shrink-0"
                    style={{ backgroundColor: d.markColor }}
                  />
                  <Badge variant="outline" className="shrink-0">Pag. {d.pageNumber}</Badge>
                  <span className="min-w-0 flex-1 truncate">
                    {d.type === 'replace'
                      ? `Sostituisci con ${d.replacementPhotoName}`
                      : d.type === 'delete'
                        ? 'Elimina foto'
                        : `Modifica: ${d.note}`}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0"
                    disabled={submitMutation.isPending}
                    onClick={() => removeDraft(d.id)}
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
          </div>
          {submitMutation.isPending && submitProgress && (
            <p className="text-sm text-stone-600" data-testid="text-submit-progress">
              Preparazione pagina {Math.min(submitProgress.done + 1, submitProgress.total)} di{' '}
              {submitProgress.total}…
            </p>
          )}
          <DialogFooter className="gap-2">
            {isTouchPhone && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={submitMutation.isPending}
                onClick={() => setClearAllOpen(true)}
                data-testid="button-clear-all-from-summary"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Annulla tutte
              </Button>
            )}
            <Button
              variant="outline"
              disabled={submitMutation.isPending}
              onClick={() => setConfirmOpen(false)}
            >
              Torna alla revisione
            </Button>
            <Button
              disabled={drafts.size === 0 || submitMutation.isPending}
              onClick={() => submitMutation.mutate(Array.from(drafts.values()))}
              data-testid="button-confirm-submit"
            >
              {submitMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Invia {drafts.size} {drafts.size === 1 ? 'richiesta' : 'richieste'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
