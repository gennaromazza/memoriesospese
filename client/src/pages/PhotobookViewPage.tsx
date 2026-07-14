/**
 * Pagina cliente revisione fotolibro — /fotolibro/:token
 * Accessibile SOLO tramite link a token (invisibile agli ospiti della galleria).
 * Il cliente disegna una X a mano libera sulla foto da modificare: ogni X
 * riceve un colore automatico dalla palette e diventa una richiesta
 * (Sostituisci / Elimina / Modifica con nota obbligatoria). Le X restano in
 * bozza (annullabili) finché non vengono inviate tutte insieme; all'invio
 * viene caricato uno snapshot JPEG di ogni pagina con le X disegnate.
 */

import { useEffect, useMemo, useState } from 'react';
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

/** true su dispositivi touch con schermo piccolo tenuti in verticale. */
function usePortraitPhone(): boolean {
  const [isPortraitPhone, setIsPortraitPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait) and (pointer: coarse) and (max-width: 640px)');
    const update = () => setIsPortraitPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isPortraitPhone;
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
  const isPortraitPhone = usePortraitPhone();
  const [rotateHintDismissed, setRotateHintDismissed] = useState(
    () => sessionStorage.getItem('pb-rotate-hint-dismissed') === '1',
  );
  const dismissRotateHint = () => {
    setRotateHintDismissed(true);
    sessionStorage.setItem('pb-rotate-hint-dismissed', '1');
  };

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
          const blob = await generatePageSnapshot(page.url, marks);
          const url = await uploadPhotobookSnapshot(token, pageId, blob);
          snapshotByPage.set(pageId, url);
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
          const blob = await generatePageSnapshot(page.url, marks);
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

      <main className="max-w-4xl mx-auto px-2 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {isPortraitPhone && !rotateHintDismissed && (
          <div
            className="flex items-center gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900"
            data-testid="banner-rotate-hint"
          >
            <Smartphone className="h-4 w-4 shrink-0 rotate-90" />
            <span className="min-w-0 flex-1">
              Consiglio: ruota il telefono in orizzontale per vedere le pagine più grandi e
              disegnare le X con più precisione.
            </span>
            <button
              type="button"
              onClick={dismissRotateHint}
              className="shrink-0 text-sky-500 hover:text-sky-700"
              aria-label="Chiudi suggerimento"
              data-testid="button-dismiss-rotate-hint"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        )}

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

        {canEdit && (
          <p className="text-sm text-muted-foreground px-1">
            Tocca <span className="font-medium text-foreground">"Segna una X"</span> su una pagina e
            disegna una X sulla foto che vuoi far modificare: ogni X prende un colore diverso e
            diventa una richiesta (sostituzione, eliminazione o modifica). Le tue richieste restano
            in bozza finché non le invii tutte insieme. Le richieste già inviate si possono
            cancellare finché l'album non va in stampa.
          </p>
        )}

        {pages.map((page) => {
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
            <div key={page.id} className="space-y-1.5">
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
                        className="ml-0.5 text-stone-400 hover:text-destructive"
                        title="Cancella questa richiesta inviata"
                        onClick={() => setDeleteSentTarget(r)}
                        data-testid={`button-delete-sent-${r.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
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
                      className="ml-0.5 text-stone-400 hover:text-destructive"
                      title="Annulla questa richiesta"
                      onClick={() => removeDraft(d.id)}
                      data-testid={`button-remove-draft-${d.id}`}
                    >
                      <Undo2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <PhotobookMarkCanvas
                pageUrl={page.url}
                pageAlt={`Pagina ${page.pageNumber}`}
                marks={marks}
                nextColor={nextColorForPage(page.id)}
                drawingEnabled={canEdit}
                onMarkComplete={(strokes) => onMarkComplete(page, strokes)}
              />
            </div>
          );
        })}
      </main>

      {/* Barra invio (nascosta se l'album è andato in stampa) */}
      {canEdit && drafts.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t shadow-lg">
          <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3">
            <Badge variant="secondary" className="shrink-0">
              {drafts.size} {drafts.size === 1 ? 'bozza' : 'bozze'}
            </Badge>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => setDrafts(new Map())}>
              <Undo2 className="h-3.5 w-3.5 mr-1.5" />
              Annulla tutte
            </Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)} data-testid="button-open-submit">
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Invia richieste
            </Button>
          </div>
        </div>
      )}

      {/* Dialog azioni per la X appena disegnata */}
      <Dialog open={!!activeMark && !noteMode} onOpenChange={(o) => !o && setActiveMark(null)}>
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
        <DialogContent className="max-w-sm max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {noteMode === 'edit'
                ? 'Richiedi una modifica'
                : noteMode === 'delete'
                  ? 'Elimina foto'
                  : 'Sostituisci foto'}
            </DialogTitle>
            <DialogDescription>
              {noteMode === 'edit'
                ? 'Descrivi la modifica che desideri (obbligatorio).'
                : noteMode === 'delete'
                  ? 'La foto segnata con la X verrà rimossa dal fotolibro. Puoi aggiungere una nota (facoltativa).'
                  : `Sostituzione con: ${pendingReplacement?.name || ''}. Puoi aggiungere una nota (facoltativa).`}
            </DialogDescription>
          </DialogHeader>
          {noteMode === 'replace' && pendingReplacement && (
            <img
              src={pendingReplacement.thumbnailUrl || pendingReplacement.url}
              alt={pendingReplacement.name}
              className="w-24 h-24 rounded-md object-cover border mx-auto"
            />
          )}
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              noteMode === 'edit'
                ? 'Es. Potete schiarire questa foto? / Vorrei un ritaglio diverso...'
                : 'Nota facoltativa...'
            }
            rows={3}
            data-testid="input-request-note"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNoteMode(null); setPendingReplacement(null); }}>
              Indietro
            </Button>
            <Button
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
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invia le richieste al fotografo</DialogTitle>
            <DialogDescription>
              Controlla il riepilogo: dopo l'invio non potrai più annullarle da qui.
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
                    className="h-7 w-7 shrink-0"
                    onClick={() => removeDraft(d.id)}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
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
