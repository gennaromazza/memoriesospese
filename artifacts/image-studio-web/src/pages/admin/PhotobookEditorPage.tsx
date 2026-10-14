/**
 * Editor fotolibro (admin) — route standalone /admin/photobooks/:id
 * Upload pagine JPEG, riordino/eliminazione pagine e gestione versioni.
 * La revisione avviene "a penna": il cliente disegna X colorate sulla pagina,
 * quindi non c'è più riconoscimento slot o matching automatico.
 */

import { useRef, useState } from 'react';
import { assignPageNumbers } from '@/lib/photobook-page-numbers';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import PhotobookMockup from '@/components/photobook/PhotobookMockup';
import MockupAdminFlow from '@/components/photobook/MockupAdminFlow';
import PhotobookConfirmDialog from '@/components/photobook/PhotobookConfirmDialog';
import {
  CopyFeedbackButton,
  PhotobookEmptyState,
  PhotobookErrorState,
  PhotobookLoadingState,
} from '@/components/photobook/PhotobookUiStates';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  getPhotobook,
  listPhotobookPages,
  listPhotobookGalleryPhotos,
  uploadPhotobookPage,
  deletePhotobookPage,
  createPhotobookVersion,
  updatePhotobook,
  photobookClientLink,
  notifyPhotobookVersion,
  publishPhotobookVersion,
  notifyPhotobookMockup,
  reconcilePhotobookMockupNotification,
} from '@/lib/photobooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Layers,
  Loader2,
  Trash2,
  Upload,
  CheckCircle2,
} from 'lucide-react';

export default function PhotobookEditorPage() {
  const { id = '' } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [deletePageTarget, setDeletePageTarget] = useState<{ id: string; pageNumber: number } | null>(null);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [currentVersionTarget, setCurrentVersionTarget] = useState<number | null>(null);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { data: book, isLoading: bookLoading, isError: bookError, refetch: refetchBook } = useQuery({
    queryKey: ['/api/photobooks', id],
    queryFn: () => getPhotobook(id),
    enabled: !!id,
  });

  const version = selectedVersion ?? book?.versions.filter(v => v.status === 'draft').at(-1)?.version ?? book?.currentVersion ?? 1;

  const { data: pages = [], isLoading: pagesLoading, isError: pagesError, refetch: refetchPages } = useQuery({
    queryKey: ['/api/photobooks', id, 'pages', version],
    queryFn: () => listPhotobookPages(id, version),
    enabled: !!book,
  });

  const { data: photos = [], isError: photosError, refetch: refetchPhotos } = useQuery({
    queryKey: ['/api/photobooks', id, 'gallery-photos'],
    queryFn: () => listPhotobookGalleryPhotos(id),
    enabled: !!book,
    staleTime: 5 * 60 * 1000,
  });

  const invalidatePages = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/photobooks', id, 'pages', version] });
    queryClient.invalidateQueries({ queryKey: ['/api/photobooks', id] });
    queryClient.invalidateQueries({ queryKey: ['/api/photobooks'] });
  };

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0 || !book) return;
    const list = Array.from(files).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (list.length === 0) {
      toast({ title: 'Nessuna immagine valida', description: 'Trascina file JPEG, PNG o WebP.', variant: 'destructive' });
      return;
    }
    try {
      // Numero di partenza dall'elenco pagine FRESCO dal server: lo stato
      // locale può essere vuoto/stale (query non ancora caricata o upload
      // ravvicinati) e produrrebbe numeri di pagina duplicati.
      setUploadProgress('Preparazione caricamento...');
      const freshPages = await listPhotobookPages(id, version);
      const plan = assignPageNumbers(list, freshPages.map((p) => p.pageNumber));
      for (let i = 0; i < plan.length; i++) {
        setUploadProgress(`Caricamento pagina ${plan[i].pageNumber} (${i + 1} di ${plan.length}: ${plan[i].file.name})...`);
        await uploadPhotobookPage({
          photobookId: id,
          version,
          pageNumber: plan[i].pageNumber,
          file: plan[i].file,
        });
        invalidatePages();
      }
      const appended = plan.filter((p) => p.appended).length;
      toast({
        title: 'Pagine caricate',
        description: `${list.length} pagine caricate${appended > 0 ? ` (${appended} messe in coda: numero nel nome assente o già occupato)` : ' secondo il numero nel nome del file'}. Se stai preparando una bozza, controllala e premi Pubblica versione quando è completa.`,
      });
    } catch (e: any) {
      toast({ title: 'Errore caricamento', description: e.message, variant: 'destructive' });
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const togglePageSelected = (pageId: string) =>
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(pageId)) next.add(pageId);
      return next;
    });

  const deleteSelectedPages = async () => {
    // Le eliminazioni vanno in sequenza: ognuna aggiorna il contatore pagine
    // del fotolibro in transazione.
    const ids = pages.filter((p) => selectedPageIds.has(p.id)).map((p) => p.id);
    setBulkDeleting(true);
    let deleted = 0;
    try {
      for (const pageId of ids) {
        await deletePhotobookPage(id, pageId);
        deleted++;
      }
      toast({ title: 'Pagine eliminate', description: `${deleted} pagine eliminate.` });
    } catch (e: any) {
      toast({
        title: 'Eliminazione interrotta',
        description: `${deleted} di ${ids.length} eliminate. ${e.message}`,
        variant: 'destructive',
      });
    } finally {
      setSelectedPageIds(new Set());
      setBulkDeleting(false);
      invalidatePages();
    }
  };

  const deletePageMutation = useMutation({
    mutationFn: (pageId: string) => deletePhotobookPage(id, pageId),
    onSuccess: () => {
      invalidatePages();
      toast({ title: 'Pagina eliminata' });
    },
    onError: (e: any) =>
      toast({ title: 'Errore eliminazione', description: e.message, variant: 'destructive' }),
  });

  const newVersionMutation = useMutation({
    mutationFn: () => createPhotobookVersion(id),
    onSuccess: (b) => {
      queryClient.invalidateQueries({ queryKey: ['/api/photobooks', id] });
      const created = Math.max(...b.versions.map(v => v.version));
      setSelectedVersion(created);
      toast({ title: `Bozza versione ${created} creata`, description: 'Il cliente continua a vedere la versione pubblicata finché non premi Pubblica versione.' });
    },
    onError: (e: any) =>
      toast({ title: 'Errore nuova versione', description: e.message, variant: 'destructive' }),
  });

  const setCurrentVersionMutation = useMutation({
    mutationFn: (v: number) => updatePhotobook(id, { currentVersion: v }),
    onSuccess: (b) => {
      queryClient.invalidateQueries({ queryKey: ['/api/photobooks', id] });
      toast({ title: `Il cliente ora vede la versione ${b.currentVersion}` });
    },
    onError: (e: any) =>
      toast({ title: 'Errore', description: e.message, variant: 'destructive' }),
  });

  const publishMutation = useMutation({
    mutationFn: () => publishPhotobookVersion(id, version, book!.currentVersion, pages.length),
    onSuccess: result => {
      toast({ title: 'Versione pubblicata', description: result.notified ? 'Email inviata al cliente con il suo solito link.' : result.skipped === 'no-client-email' ? 'Email cliente assente: avvisalo manualmente.' : 'Notifica già gestita. Il link apre la versione pubblicata.' });
    },
    onError: (error: Error) => toast({ title: 'Verifica pubblicazione / email', description: error.message, variant: 'destructive' }),
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ['/api/photobooks', id] }); queryClient.invalidateQueries({ queryKey: ['/api/photobooks'] }); },
  });

  if (bookLoading) {
    return <div className="min-h-screen bg-muted/30 px-4 py-16"><PhotobookLoadingState label="Caricamento fotolibro…" /></div>;
  }

  if (bookError || !book) {
    return (
      <div className="min-h-screen bg-muted/30 px-4 py-16">
        <PhotobookErrorState
          title="Fotolibro non disponibile"
          message="Controlla il link o riprova a caricare la scheda."
          onRetry={() => void refetchBook()}
        />
      </div>
    );
  }

  const busy =
    !!uploadProgress ||
    publishMutation.isPending ||
    newVersionMutation.isPending ||
    setCurrentVersionMutation.isPending ||
    deletePageMutation.isPending ||
    bulkDeleting;
  const canUpload =
    !busy && !book.locked && book.versions.find((v) => v.version === version)?.status !== 'published';

  const notificationKey = book?.mockupPath === 'client'
    ? `approved_v${book.currentVersion}`
    : Object.keys(book?.mockupNotifications || {}).filter(key => key.startsWith(`confirmed_v${book?.currentVersion}_r`)).sort((a, b) => Number(b.split('_r')[1]) - Number(a.split('_r')[1]))[0];
  const notification = notificationKey ? book?.mockupNotifications?.[notificationKey] : undefined;
  const waitingForPageApproval = notification?.state === 'waiting-approval' && book?.approval?.version !== book?.currentVersion;
  async function handleNotification(action: 'send' | 'delivered' | 'not-delivered') {
    if (!book || !notificationKey) return;
    setNotificationBusy(true);
    try {
      const result = action === 'send'
        ? await notifyPhotobookMockup(book.id, book.mockupPath === 'client' ? 'approved' : 'confirmed')
        : await reconcilePhotobookMockupNotification(book.id, notificationKey, action === 'delivered');
      toast({ title: result.state === 'sent' ? 'Invio registrato' : result.state === 'missing-email' ? 'Indirizzo cliente mancante' : result.state === 'not-delivered' ? 'Invio non avvenuto: puoi riprovare' : 'Esito email da verificare' });
      await refetchBook();
    } catch (error) { toast({ title: 'Verifica notifica', description: (error as Error).message, variant: 'destructive' }); await refetchBook(); }
    finally { setNotificationBusy(false); }
  }

  return (
    <div
      className="min-h-screen bg-muted/30"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        // Sempre preventDefault: altrimenti il browser apre l'immagine rilasciata
        e.preventDefault();
        if (canUpload) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setIsDragging(false);
        if (canUpload) void handleFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              sessionStorage.setItem('activeTab', 'photobooks');
              navigate('/admin/dashboard');
            }}
            data-testid="button-back-to-photobooks"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Fotolibri
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold truncate">{book.name}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {book.galleryName} {book.clientName ? `· ${book.clientName}` : ''} · {photos.length} foto in galleria
            </p>
            {photosError && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-destructive" role="alert">
                <span>Galleria non disponibile.</span>
                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => void refetchPhotos()}>
                  Riprova
                </Button>
              </div>
            )}
          </div>
           <CopyFeedbackButton
             text={photobookClientLink(book)}
             label="Copia link cliente"
             testId="button-copy-client-link"
           />
        </div>

        {/* Barra versioni + upload (accetta anche il trascinamento dei file) */}
        <PhotobookMockup key={`${id}-${version}`} photobookId={id} version={version} readOnly={book.currentVersion !== version} />
         <MockupAdminFlow
           photobookId={id}
           version={version}
           currentVersion={book.currentVersion}
           pagesApproved={book.approval?.version === book.currentVersion}
           mockupPath={book.mockupPath || 'studio'}
           pathBusy={busy}
           readOnly={book.currentVersion !== version || !!book.locked}
           onPathChange={async path => {
             try {
               await updatePhotobook(id, { mockupPath: path });
               await refetchBook();
               toast({ title: 'Percorso aggiornato', description: 'Nessuna email retroattiva inviata.' });
             } catch (error) { toast({ title: 'Percorso non aggiornato', description: (error as Error).message, variant: 'destructive' }); }
           }}
           emailStatus={waitingForPageApproval ? 'in attesa dell’approvazione delle pagine' : notification?.state === 'waiting-approval' ? 'approvazione completata: invio da verificare' : notification?.state === 'sent' || (notification && !notification.state) ? 'inviata' : notification?.state === 'missing-email' ? 'non inviata: manca l’indirizzo cliente' : notification?.state === 'not-delivered' ? 'non consegnata (verificata)' : notification?.state === 'pending' || notification?.state === 'uncertain' ? 'esito incerto: verifica la posta inviata' : 'non ancora prevista o inviata'}
           emailNote={notification?.state === 'missing-email' ? 'Completa l’email nella galleria o nel cliente del lavoro, poi usa “Verifica e invia”.' : notification?.state === 'uncertain' || notification?.state === 'pending' ? 'Controlla la posta inviata prima di indicare se è stata consegnata. Non viene ritentata automaticamente.' : undefined}
           emailActions={<>
             {(notification?.state === 'uncertain' || notification?.state === 'pending') && <><Button variant="outline" disabled={notificationBusy} onClick={() => void handleNotification('delivered')}>Verificata: consegnata</Button><Button variant="outline" disabled={notificationBusy} onClick={() => void handleNotification('not-delivered')}>Verificata: non consegnata</Button></>}
             {(['missing-email', 'not-delivered'].includes(notification?.state || '') || !notification || (notification?.state === 'waiting-approval' && !waitingForPageApproval && book.mockupPath !== 'client')) && (book.mockupPath === 'client' ? book.approval?.version === book.currentVersion : !!notificationKey && !waitingForPageApproval) && <Button variant="outline" disabled={notificationBusy} onClick={() => void handleNotification('send')}>Verifica e invia email mockup</Button>}
           </>}
         />
        <Card>
          <p className="px-4 pt-4 text-sm">1. Crea una nuova bozza. 2. Carica tutte le pagine e controllale. 3. Pubblica: solo allora il cliente vedrà la nuova versione e riceverà l’email.</p>
          <CardContent className="pt-4 flex items-center gap-3 flex-wrap">
             <div className="flex items-center gap-2">
               <label htmlFor="photobook-version" className="text-sm text-muted-foreground">Versione:</label>
              <Select
                value={String(version)}
                onValueChange={(v) => { if (!busy) { setSelectedVersion(Number(v)); setSelectedPageIds(new Set()); } }}
              >
                 <SelectTrigger id="photobook-version" aria-label="Versione da modificare" className="w-40" data-testid="select-version">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {book.versions.map((v) => (
                    <SelectItem key={v.version} value={String(v.version)}>
                      v{v.version} ({v.pageCount} pag.)
                      {v.status === 'draft' ? ' — bozza privata' : v.version === book.currentVersion ? ' — visibile al cliente' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {book.versions.find(v => v.version === version)?.status === 'draft' && <Button disabled={busy || publishMutation.isPending || !pages.length || book.locked} onClick={() => setPublishConfirmOpen(true)}>Pubblica versione e avvisa cliente</Button>}
            {version !== book.currentVersion && book.versions.find(v => v.version === version)?.status !== 'draft' && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || book.locked || setCurrentVersionMutation.isPending || publishMutation.isPending}
                onClick={() => setCurrentVersionTarget(version)}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Rendi visibile al cliente
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={busy || book.locked || newVersionMutation.isPending || publishMutation.isPending}
              onClick={() => newVersionMutation.mutate()}
              data-testid="button-new-version"
            >
              <Layers className="h-3.5 w-3.5 mr-1.5" />
              Nuova versione
            </Button>
            <div className="flex-1" />
            {version === book.currentVersion && version > 1 && <Button variant="outline" disabled={busy || book.locked} onClick={async () => {
              try { const result = await notifyPhotobookVersion(id, version); toast({ title: result.notified ? 'Email inviata' : result.alreadyNotified ? 'Cliente già avvisato' : 'Email cliente assente', description: result.skipped === 'no-client-email' ? 'Completa l’email del cliente nel lavoro o nella galleria, poi riprova.' : undefined }); }
              catch (error) { toast({ title: 'Verifica email', description: (error as Error).message, variant: 'destructive' }); }
            }}>Avvisa cliente / verifica invio</Button>}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
              data-testid="input-upload-pages"
            />
            <Button
              size="sm"
              disabled={!canUpload}
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-upload-pages"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
               Carica pagine
            </Button>
          </CardContent>
        </Card>

        {canUpload && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`w-full rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
              isDragging
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-muted-foreground/30 bg-background text-muted-foreground hover:border-primary/60 hover:text-foreground'
            }`}
            data-testid="dropzone-upload-pages"
          >
            <Upload className="h-6 w-6 mx-auto mb-2" />
            <span className="block text-sm font-medium">
              {isDragging ? 'Rilascia qui le immagini' : 'Trascina qui le immagini delle pagine, oppure clicca per sceglierle'}
            </span>
            <span className="block text-xs mt-1">
              JPEG, PNG o WebP · il numero nel nome del file (es. 7.jpg) diventa il numero di pagina
            </span>
          </button>
        )}

        {/* Progress upload */}
        {busy && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm">{uploadProgress}</p>
            </CardContent>
          </Card>
        )}

        {/* Griglia pagine */}
         {pagesLoading ? (
           <PhotobookLoadingState label="Caricamento pagine…" />
         ) : pagesError ? (
           <PhotobookErrorState title="Pagine non disponibili" message="Non riesco a leggere questa versione." onRetry={() => void refetchPages()} />
        ) : pages.length === 0 ? (
           <PhotobookEmptyState title="Nessuna pagina in questa versione" message="Carica le immagini delle pagine per preparare la revisione del cliente." />
        ) : (
          <>
          {!book.locked && book.versions.find((v) => v.version === version)?.status !== 'published' && (
            <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="bar-bulk-pages">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setSelectedPageIds(
                    selectedPageIds.size === pages.length ? new Set() : new Set(pages.map((p) => p.id)),
                  )
                }
                data-testid="button-select-all-pages"
              >
                {selectedPageIds.size === pages.length ? 'Deseleziona tutte' : 'Seleziona tutte'}
              </Button>
              {selectedPageIds.size > 0 && (
                <>
                  <span className="text-muted-foreground">{selectedPageIds.size} selezionate</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => setBulkDeleteOpen(true)}
                    data-testid="button-delete-selected-pages"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Elimina selezionate
                  </Button>
                </>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pages.map((page) => (
              <Card key={page.id} data-testid={`card-page-${page.pageNumber}`}>
                <CardContent className="pt-4 space-y-2">
                  <button
                    type="button"
                    onClick={() => setViewerIndex(pages.findIndex((p) => p.id === page.id))}
                    className="group relative block w-full rounded-md overflow-hidden border bg-muted cursor-zoom-in"
                    aria-label={`Ingrandisci pagina ${page.pageNumber}`}
                    data-testid={`button-view-page-${page.pageNumber}`}
                  >
                    <img
                      src={page.displayUrl || page.url}
                      alt={`Pagina ${page.pageNumber}`}
                      loading="lazy"
                      className="w-full h-auto"
                    />
                    <span className="absolute right-2 top-2 rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <Maximize2 className="h-4 w-4" />
                    </span>
                  </button>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                      <Checkbox
                        checked={selectedPageIds.has(page.id)}
                        onCheckedChange={() => togglePageSelected(page.id)}
                        disabled={busy || book.locked}
                        aria-label={`Seleziona pagina ${page.pageNumber}`}
                        data-testid={`checkbox-page-${page.pageNumber}`}
                      />
                      Pagina {page.pageNumber}
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                       aria-label={`Elimina pagina ${page.pageNumber}`}
                      disabled={deletePageMutation.isPending}
                      onClick={() => setDeletePageTarget({ id: page.id, pageNumber: page.pageNumber })}
                      data-testid={`button-delete-page-${page.pageNumber}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          </>
        )}
      </div>
      <Dialog open={viewerIndex !== null} onOpenChange={(open) => !open && setViewerIndex(null)}>
        <DialogContent
          className="max-w-[96vw] w-auto max-h-[96vh] p-3 gap-2"
          onKeyDown={(e) => {
            if (viewerIndex === null) return;
            if (e.key === 'ArrowRight') setViewerIndex(Math.min(pages.length - 1, viewerIndex + 1));
            if (e.key === 'ArrowLeft') setViewerIndex(Math.max(0, viewerIndex - 1));
          }}
        >
          {viewerIndex !== null && pages[viewerIndex] && (
            <>
              <DialogTitle className="text-sm">
                Pagina {pages[viewerIndex].pageNumber} di {pages.length}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Anteprima ingrandita della pagina. Usa le frecce per scorrere le pagine.
              </DialogDescription>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  disabled={viewerIndex === 0}
                  onClick={() => setViewerIndex(viewerIndex - 1)}
                  aria-label="Pagina precedente"
                  data-testid="button-viewer-prev"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <img
                  src={pages[viewerIndex].url}
                  alt={`Pagina ${pages[viewerIndex].pageNumber}`}
                  className="max-h-[82vh] max-w-[80vw] object-contain mx-auto"
                  data-testid="img-viewer-page"
                />
                <Button
                  size="icon"
                  variant="outline"
                  disabled={viewerIndex >= pages.length - 1}
                  onClick={() => setViewerIndex(viewerIndex + 1)}
                  aria-label="Pagina successiva"
                  data-testid="button-viewer-next"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <PhotobookConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Eliminare ${selectedPageIds.size} pagine?`}
        description="Le pagine selezionate verranno rimosse da questa versione del fotolibro. L’azione non si può annullare."
        confirmLabel="Elimina pagine"
        destructive
        onConfirm={() => {
          setBulkDeleteOpen(false);
          void deleteSelectedPages();
        }}
        pending={bulkDeleting}
      />
      <PhotobookConfirmDialog
        open={publishConfirmOpen}
        onOpenChange={setPublishConfirmOpen}
        title={`Pubblicare la versione ${version}?`}
        description={`La versione verrà mostrata al cliente con ${pages.length} pagine e partirà la notifica prevista.`}
        confirmLabel="Pubblica versione"
        onConfirm={() => {
          setPublishConfirmOpen(false);
          publishMutation.mutate();
        }}
        pending={publishMutation.isPending}
      />
      <PhotobookConfirmDialog
        open={currentVersionTarget !== null}
        onOpenChange={(open) => !open && setCurrentVersionTarget(null)}
        title="Rendere visibile questa versione?"
        description="Il cliente vedrà questa versione come quella attuale. La versione precedente resterà conservata."
        confirmLabel="Rendi visibile"
        onConfirm={() => {
          if (currentVersionTarget === null) return;
          const target = currentVersionTarget;
          setCurrentVersionTarget(null);
          setCurrentVersionMutation.mutate(target);
        }}
        pending={setCurrentVersionMutation.isPending}
      />
      <PhotobookConfirmDialog
        open={deletePageTarget !== null}
        onOpenChange={(open) => !open && setDeletePageTarget(null)}
        title={`Eliminare la pagina ${deletePageTarget?.pageNumber ?? ''}?`}
        description="La pagina verrà rimossa da questa versione del fotolibro. L’azione non si può annullare."
        confirmLabel="Elimina pagina"
        destructive
        onConfirm={() => {
          if (!deletePageTarget) return;
          const target = deletePageTarget;
          setDeletePageTarget(null);
          deletePageMutation.mutate(target.id);
        }}
        pending={deletePageMutation.isPending}
      />
    </div>
  );
}
