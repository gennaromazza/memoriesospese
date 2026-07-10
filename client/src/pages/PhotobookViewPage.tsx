/**
 * Pagina cliente revisione fotolibro — /fotolibro/:token
 * Accessibile SOLO tramite link a token (invisibile agli ospiti della galleria).
 * Il cliente tocca una foto sulla pagina e sceglie: Sostituisci / Elimina /
 * Richiedi modifica (nota obbligatoria). Le scelte restano in bozza (annullabili)
 * finché non vengono inviate tutte insieme.
 */

import { useMemo, useState } from 'react';
import { useParams } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  getPhotobookByToken,
  getPhotobookGalleryPhotosByToken,
  submitPhotobookRequests,
  type PhotobookClientRequestDraft,
} from '@/lib/photobooks';
import type { PhotobookPage, PhotobookSlot, PhotobookGalleryPhoto } from '@shared/photobook-types';
import PhotobookPhotoPicker from '@/components/photobook/PhotobookPhotoPicker';
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
  BookImage,
  Loader2,
  MessageSquareText,
  Replace,
  Send,
  Trash2,
  Undo2,
  CheckCircle2,
} from 'lucide-react';

interface DraftEntry extends PhotobookClientRequestDraft {
  pageNumber: number;
}

const draftKey = (pageId: string, slotId: string) => `${pageId}::${slotId}`;

export default function PhotobookViewPage() {
  const { token = '' } = useParams<{ token: string }>();
  const { toast } = useToast();

  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Map<string, DraftEntry>>(new Map());
  const [activeSlot, setActiveSlot] = useState<{ page: PhotobookPage; slot: PhotobookSlot } | null>(null);
  const [noteMode, setNoteMode] = useState<'edit' | 'replace' | 'delete' | null>(null);
  const [note, setNote] = useState('');
  const [pendingReplacement, setPendingReplacement] = useState<PhotobookGalleryPhoto | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['/api/photobooks/by-token', token, selectedVersion],
    queryFn: () => getPhotobookByToken(token, selectedVersion ?? undefined),
    enabled: !!token,
  });

  const { data: photos = [] } = useQuery({
    queryKey: ['/api/photobooks/by-token', token, 'gallery-photos'],
    queryFn: () => getPhotobookGalleryPhotosByToken(token),
    enabled: !!data,
    staleTime: 5 * 60 * 1000,
  });

  const submitMutation = useMutation({
    mutationFn: (requests: PhotobookClientRequestDraft[]) => submitPhotobookRequests(token, requests),
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

  const sentBySlot = useMemo(() => {
    const map = new Map<string, { type: string; status: string }>();
    for (const r of data?.requests || []) {
      map.set(draftKey(r.pageId, r.slotId), { type: r.type, status: r.status });
    }
    return map;
  }, [data?.requests]);

  const isCurrentVersion = data ? data.version === data.photobook.currentVersion : true;

  const openSlot = (page: PhotobookPage, slot: PhotobookSlot) => {
    if (!isCurrentVersion) return;
    setActiveSlot({ page, slot });
    setNoteMode(null);
    setNote('');
    setPendingReplacement(null);
  };

  const saveDraft = (entry: Omit<DraftEntry, 'pageId' | 'slotId' | 'pageNumber'>) => {
    if (!activeSlot) return;
    const key = draftKey(activeSlot.page.id, activeSlot.slot.id);
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(key, {
        ...entry,
        pageId: activeSlot.page.id,
        slotId: activeSlot.slot.id,
        pageNumber: activeSlot.page.pageNumber,
      });
      return next;
    });
    setActiveSlot(null);
    setNoteMode(null);
    setNote('');
    setPendingReplacement(null);
  };

  const removeDraft = (key: string) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.delete(key);
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
  const activeDraft = activeSlot
    ? drafts.get(draftKey(activeSlot.page.id, activeSlot.slot.id)) || null
    : null;
  const activeSent = activeSlot
    ? sentBySlot.get(draftKey(activeSlot.page.id, activeSlot.slot.id)) || null
    : null;

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

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {!isCurrentVersion && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="py-3 text-sm text-amber-800">
              Stai guardando una versione precedente del fotolibro (solo lettura). Torna alla
              versione attuale per richiedere modifiche.
            </CardContent>
          </Card>
        )}

        <p className="text-sm text-muted-foreground">
          Tocca una foto per richiederne la sostituzione, l'eliminazione o una modifica. Le tue
          scelte restano in bozza finché non le invii tutte insieme.
        </p>

        {pages.map((page) => (
          <div key={page.id} className="space-y-1.5">
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">
              Pagina {page.pageNumber}
            </p>
            <div className="relative rounded-lg overflow-hidden border bg-white shadow-sm">
              <img src={page.url} alt={`Pagina ${page.pageNumber}`} loading="lazy" className="w-full h-auto block" />
              {page.slots.map((slot) => {
                const key = draftKey(page.id, slot.id);
                const draft = drafts.get(key);
                const sent = sentBySlot.get(key);
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => openSlot(page, slot)}
                    className={`absolute border-2 transition-colors ${
                      draft
                        ? 'border-orange-500 bg-orange-500/20'
                        : sent
                          ? 'border-sky-500 bg-sky-500/10'
                          : 'border-transparent hover:border-stone-400/80 hover:bg-white/10'
                    } ${!isCurrentVersion ? 'cursor-default' : 'cursor-pointer'}`}
                    style={{
                      left: `${slot.x * 100}%`,
                      top: `${slot.y * 100}%`,
                      width: `${slot.width * 100}%`,
                      height: `${slot.height * 100}%`,
                    }}
                    data-testid={`slot-client-${page.pageNumber}-${slot.id}`}
                  >
                    {draft && (
                      <span className="absolute top-1 left-1 bg-orange-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                        {draft.type === 'replace' ? 'Da sostituire' : draft.type === 'delete' ? 'Da eliminare' : 'Modifica richiesta'}
                      </span>
                    )}
                    {!draft && sent && (
                      <span className="absolute top-1 left-1 bg-sky-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Richiesta inviata
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </main>

      {/* Barra invio */}
      {drafts.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t shadow-lg">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <Badge variant="secondary" className="shrink-0">
              {drafts.size} {drafts.size === 1 ? 'modifica' : 'modifiche'} in bozza
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

      {/* Dialog azioni slot */}
      <Dialog open={!!activeSlot && !noteMode} onOpenChange={(o) => !o && setActiveSlot(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Pagina {activeSlot?.page.pageNumber}
              {activeSlot?.slot.photoName ? ` — ${activeSlot.slot.photoName}` : ''}
            </DialogTitle>
            <DialogDescription>Cosa vuoi fare con questa foto?</DialogDescription>
          </DialogHeader>
          {activeSent && (
            <p className="text-xs bg-sky-50 border border-sky-200 text-sky-800 rounded-md p-2">
              Hai già inviato una richiesta per questa foto. Una nuova richiesta si aggiungerà a
              quella precedente.
            </p>
          )}
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
            {activeDraft && (
              <Button
                variant="ghost"
                className="justify-start text-destructive hover:text-destructive"
                onClick={() => {
                  if (activeSlot) removeDraft(draftKey(activeSlot.page.id, activeSlot.slot.id));
                  setActiveSlot(null);
                }}
                data-testid="button-action-undo"
              >
                <Undo2 className="h-4 w-4 mr-2" />
                Annulla la modifica in bozza
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog nota (elimina / modifica / conferma sostituzione) */}
      <Dialog
        open={!!activeSlot && !!noteMode}
        onOpenChange={(o) => {
          if (!o) {
            setNoteMode(null);
            setPendingReplacement(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
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
                  ? 'La foto verrà rimossa dal fotolibro. Puoi aggiungere una nota (facoltativa).'
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

      {/* Picker foto sostitutiva */}
      <PhotobookPhotoPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        photos={photos}
        title="Scegli la foto sostitutiva"
        currentPhotoId={activeSlot?.slot.photoId}
        onSelect={(p) => {
          setPendingReplacement(p);
          setNoteMode('replace');
        }}
      />

      {/* Conferma invio */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invia le richieste al fotografo</DialogTitle>
            <DialogDescription>
              Controlla il riepilogo: dopo l'invio non potrai più annullarle da qui.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {Array.from(drafts.entries())
              .sort((a, b) => a[1].pageNumber - b[1].pageNumber)
              .map(([key, d]) => (
                <div key={key} className="flex items-center gap-2 text-sm border rounded-md p-2">
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
                    onClick={() => removeDraft(key)}
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
              onClick={() =>
                submitMutation.mutate(
                  Array.from(drafts.values()).map(({ pageNumber, ...rest }) => rest),
                )
              }
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
