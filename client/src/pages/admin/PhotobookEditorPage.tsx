/**
 * Editor fotolibro (admin) — route standalone /admin/photobooks/:id
 * Upload pagine JPEG, riordino/eliminazione pagine e gestione versioni.
 * La revisione avviene "a penna": il cliente disegna X colorate sulla pagina,
 * quindi non c'è più riconoscimento slot o matching automatico.
 */

import { useRef, useState } from 'react';
import PhotobookMockup from '@/components/photobook/PhotobookMockup';
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
  Copy,
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

  const { data: book, isLoading: bookLoading } = useQuery({
    queryKey: ['/api/photobooks', id],
    queryFn: () => getPhotobook(id),
    enabled: !!id,
  });

  const version = selectedVersion ?? book?.versions.filter(v => v.status === 'draft').at(-1)?.version ?? book?.currentVersion ?? 1;

  const { data: pages = [], isLoading: pagesLoading } = useQuery({
    queryKey: ['/api/photobooks', id, 'pages', version],
    queryFn: () => listPhotobookPages(id, version),
    enabled: !!book,
  });

  const { data: photos = [] } = useQuery({
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

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !book) return;
    const list = Array.from(files).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    try {
      // Numero di partenza dall'elenco pagine FRESCO dal server: lo stato
      // locale può essere vuoto/stale (query non ancora caricata o upload
      // ravvicinati) e produrrebbe numeri di pagina duplicati.
      setUploadProgress('Preparazione caricamento...');
      const freshPages = await listPhotobookPages(id, version);
      let nextNumber = freshPages.reduce((m, p) => Math.max(m, p.pageNumber), 0) + 1;
      for (let i = 0; i < list.length; i++) {
        setUploadProgress(`Caricamento pagina ${i + 1} di ${list.length} (${list[i].name})...`);
        await uploadPhotobookPage({
          photobookId: id,
          version,
          pageNumber: nextNumber++,
          file: list[i],
        });
        invalidatePages();
      }
      toast({
        title: 'Pagine caricate',
        description: `${list.length} pagine caricate. Se stai preparando una bozza, controllala e premi Pubblica versione quando è completa.`,
      });
    } catch (e: any) {
      toast({ title: 'Errore caricamento', description: e.message, variant: 'destructive' });
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
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

  if (bookLoading || !book) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        {bookLoading ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : (
          <p className="text-muted-foreground">Fotolibro non trovato</p>
        )}
      </div>
    );
  }

  const busy = !!uploadProgress || publishMutation.isPending;

  return (
    <div className="min-h-screen bg-muted/30">
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
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(photobookClientLink(book));
              toast({ title: 'Link copiato', description: 'Invia questo link al cliente.' });
            }}
            data-testid="button-copy-client-link"
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Link Cliente
          </Button>
        </div>

        {/* Barra versioni + upload */}
        <PhotobookMockup key={`${id}-${version}`} photobookId={id} version={version} readOnly={book.currentVersion !== version} />
        <Card>
          <p className="px-4 pt-4 text-sm">1. Crea una nuova bozza. 2. Carica tutte le pagine e controllale. 3. Pubblica: solo allora il cliente vedrà la nuova versione e riceverà l’email.</p>
          <CardContent className="pt-4 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Versione:</span>
              <Select
                value={String(version)}
                onValueChange={(v) => { if (!busy) setSelectedVersion(Number(v)); }}
              >
                <SelectTrigger className="w-40" data-testid="select-version">
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
            {book.versions.find(v => v.version === version)?.status === 'draft' && <Button disabled={busy || publishMutation.isPending || !pages.length || book.locked} onClick={() => { if (window.confirm(`Pubblicare la versione ${version} con ${pages.length} pagine e avvisare il cliente?`)) publishMutation.mutate(); }}>Pubblica versione e avvisa cliente</Button>}
            {version !== book.currentVersion && book.versions.find(v => v.version === version)?.status !== 'draft' && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || book.locked || setCurrentVersionMutation.isPending || publishMutation.isPending}
                onClick={() => setCurrentVersionMutation.mutate(version)}
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
              disabled={busy || book.locked || book.versions.find(v => v.version === version)?.status === 'published'}
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-upload-pages"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Carica pagine JPEG
            </Button>
          </CardContent>
        </Card>

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
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : pages.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nessuna pagina in questa versione. Carica i JPEG delle pagine del fotolibro.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pages.map((page) => (
              <Card key={page.id} data-testid={`card-page-${page.pageNumber}`}>
                <CardContent className="pt-4 space-y-2">
                  <div className="w-full rounded-md overflow-hidden border bg-muted">
                    <img
                      src={page.url}
                      alt={`Pagina ${page.pageNumber}`}
                      loading="lazy"
                      className="w-full h-auto"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">Pagina {page.pageNumber}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      title="Elimina pagina"
                      disabled={deletePageMutation.isPending}
                      onClick={() => {
                        if (confirm(`Eliminare la pagina ${page.pageNumber}?`)) {
                          deletePageMutation.mutate(page.id);
                        }
                      }}
                      data-testid={`button-delete-page-${page.pageNumber}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
