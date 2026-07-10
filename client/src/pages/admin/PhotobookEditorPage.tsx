/**
 * Editor fotolibro (admin) — route standalone /admin/photobooks/:id
 * Upload pagine JPEG, riordino/eliminazione pagine e gestione versioni.
 * La revisione avviene "a penna": il cliente disegna X colorate sulla pagina,
 * quindi non c'è più riconoscimento slot o matching automatico.
 */

import { useRef, useState } from 'react';
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

  const version = selectedVersion ?? book?.currentVersion ?? 1;

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
        description: `${list.length} pagine caricate: il cliente può disegnare le X per le richieste.`,
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
      setSelectedVersion(b.currentVersion);
      toast({ title: `Versione ${b.currentVersion} creata` });
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

  const busy = !!uploadProgress;

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
        <Card>
          <CardContent className="pt-4 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Versione:</span>
              <Select
                value={String(version)}
                onValueChange={(v) => setSelectedVersion(Number(v))}
              >
                <SelectTrigger className="w-40" data-testid="select-version">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {book.versions.map((v) => (
                    <SelectItem key={v.version} value={String(v.version)}>
                      v{v.version} ({v.pageCount} pag.)
                      {v.version === book.currentVersion ? ' — visibile al cliente' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {version !== book.currentVersion && (
              <Button
                size="sm"
                variant="outline"
                disabled={setCurrentVersionMutation.isPending}
                onClick={() => setCurrentVersionMutation.mutate(version)}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Rendi visibile al cliente
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={newVersionMutation.isPending}
              onClick={() => newVersionMutation.mutate()}
              data-testid="button-new-version"
            >
              <Layers className="h-3.5 w-3.5 mr-1.5" />
              Nuova versione
            </Button>
            <div className="flex-1" />
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
              disabled={busy}
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
