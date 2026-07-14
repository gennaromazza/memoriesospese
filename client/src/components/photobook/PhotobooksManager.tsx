/**
 * Gestione fotolibri (tab admin "Fotolibri").
 * Lista, creazione (nome + galleria), copia link cliente, nuova versione,
 * apertura editor pagine, eliminazione.
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import {
  listPhotobooks,
  createPhotobook,
  createPhotobookVersion,
  deletePhotobook,
  updatePhotobook,
  photobookClientLink,
  type Photobook,
} from '@/lib/photobooks';
import { GalleryService, type Gallery } from '@/lib/galleries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BookImage, Copy, Layers, Lock, Unlock, Pencil, Plus, Trash2, Loader2 } from 'lucide-react';
import PhotobookTutorial from '@/components/photobook/PhotobookTutorial';

export default function PhotobooksManager() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGalleryId, setNewGalleryId] = useState('');
  const [gallerySearch, setGallerySearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Photobook | null>(null);
  const [lockTarget, setLockTarget] = useState<Photobook | null>(null);

  const { data: books = [], isLoading } = useQuery({
    queryKey: ['/api/photobooks'],
    queryFn: listPhotobooks,
  });

  const { data: galleries = [] } = useQuery<Gallery[]>({
    queryKey: ['admin-galleries-for-photobooks'],
    queryFn: () => GalleryService.getAllGalleriesForAdmin(),
    enabled: createOpen,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: () => createPhotobook({ name: newName.trim(), galleryId: newGalleryId }),
    onSuccess: (book) => {
      queryClient.invalidateQueries({ queryKey: ['/api/photobooks'] });
      setCreateOpen(false);
      setNewName('');
      setNewGalleryId('');
      toast({ title: 'Fotolibro creato', description: 'Ora carica le pagine JPEG nell\u2019editor.' });
      navigate(`/admin/photobooks/${book.id}`);
    },
    onError: (e: any) =>
      toast({ title: 'Errore creazione fotolibro', description: e.message, variant: 'destructive' }),
  });

  const versionMutation = useMutation({
    mutationFn: (id: string) => createPhotobookVersion(id),
    onSuccess: (book) => {
      queryClient.invalidateQueries({ queryKey: ['/api/photobooks'] });
      toast({
        title: `Versione ${book.currentVersion} creata`,
        description: 'Carica le nuove pagine nell\u2019editor.',
      });
      navigate(`/admin/photobooks/${book.id}`);
    },
    onError: (e: any) =>
      toast({ title: 'Errore nuova versione', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePhotobook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/photobooks'] });
      setDeleteTarget(null);
      toast({ title: 'Fotolibro eliminato' });
    },
    onError: (e: any) =>
      toast({ title: 'Errore eliminazione', description: e.message, variant: 'destructive' }),
  });

  const lockMutation = useMutation({
    mutationFn: ({ id, locked }: { id: string; locked: boolean }) =>
      updatePhotobook(id, { locked }),
    onSuccess: (book) => {
      queryClient.invalidateQueries({ queryKey: ['/api/photobooks'] });
      setLockTarget(null);
      toast(
        book.locked
          ? {
              title: 'Album mandato in stampa',
              description:
                'Il cliente ora vede il fotolibro in sola lettura e non può più inviare o cancellare richieste.',
            }
          : {
              title: 'Modifiche riaperte',
              description: 'Il cliente può di nuovo inviare e cancellare richieste.',
            },
      );
    },
    onError: (e: any) =>
      toast({ title: 'Errore aggiornamento blocco', description: e.message, variant: 'destructive' }),
  });

  const copyLink = (book: Photobook) => {
    navigator.clipboard.writeText(photobookClientLink(book));
    toast({ title: 'Link copiato', description: 'Invia questo link al cliente per la revisione.' });
  };

  const filteredGalleries = galleries.filter((g) =>
    g.name.toLowerCase().includes(gallerySearch.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Carica le pagine JPEG del fotolibro e invia al cliente il link di revisione: il cliente
          disegna una X sulle foto da modificare.
        </p>
        <div className="flex items-center gap-2">
          <PhotobookTutorial />
          <Button onClick={() => setCreateOpen(true)} data-testid="button-create-photobook">
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Fotolibro
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : books.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookImage className="h-10 w-10 mx-auto mb-3 opacity-40" />
            Nessun fotolibro ancora creato.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {books.map((book) => {
            const currentVer = book.versions.find((v) => v.version === book.currentVersion);
            return (
              <Card key={book.id} data-testid={`card-photobook-${book.id}`}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{book.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {book.galleryName || book.galleryId}
                        {book.clientName ? ` · ${book.clientName}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="secondary">v{book.currentVersion}</Badge>
                      {book.locked && (
                        <Badge
                          className="bg-stone-700 text-white hover:bg-stone-700"
                          data-testid={`badge-locked-${book.id}`}
                        >
                          <Lock className="h-3 w-3 mr-1" />
                          In stampa
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {currentVer?.pageCount ?? 0} pagine · {book.versions.length}{' '}
                    {book.versions.length === 1 ? 'versione' : 'versioni'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => navigate(`/admin/photobooks/${book.id}`)}
                      data-testid={`button-edit-photobook-${book.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Apri Editor
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => copyLink(book)}>
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Link Cliente
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={versionMutation.isPending}
                      onClick={() => versionMutation.mutate(book.id)}
                    >
                      <Layers className="h-3.5 w-3.5 mr-1.5" />
                      Nuova Versione
                    </Button>
                    {book.locked ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={lockMutation.isPending}
                        onClick={() => lockMutation.mutate({ id: book.id, locked: false })}
                        data-testid={`button-unlock-${book.id}`}
                      >
                        <Unlock className="h-3.5 w-3.5 mr-1.5" />
                        Sblocca
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={lockMutation.isPending}
                        onClick={() => setLockTarget(book)}
                        data-testid={`button-lock-${book.id}`}
                      >
                        <Lock className="h-3.5 w-3.5 mr-1.5" />
                        Manda in Stampa
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(book)}
                      data-testid={`button-delete-photobook-${book.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog creazione */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo Fotolibro</DialogTitle>
            <DialogDescription>
              Il fotolibro è collegato a una galleria: il cliente sceglierà le eventuali foto
              sostitutive tra quelle della galleria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pb-name">Nome fotolibro</Label>
              <Input
                id="pb-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Es. Fotolibro Matrimonio Anna e Marco"
                data-testid="input-photobook-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Galleria</Label>
              <Input
                value={gallerySearch}
                onChange={(e) => setGallerySearch(e.target.value)}
                placeholder="Cerca galleria..."
                className="mb-1"
              />
              <Select value={newGalleryId} onValueChange={setNewGalleryId}>
                <SelectTrigger data-testid="select-photobook-gallery">
                  <SelectValue placeholder="Seleziona la galleria" />
                </SelectTrigger>
                <SelectContent>
                  {filteredGalleries.slice(0, 100).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} ({g.photoCount} foto)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Annulla
            </Button>
            <Button
              disabled={!newName.trim() || !newGalleryId || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              data-testid="button-confirm-create-photobook"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crea Fotolibro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conferma "manda in stampa" */}
      <AlertDialog open={!!lockTarget} onOpenChange={(o) => !o && setLockTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mandare l'album in stampa?</AlertDialogTitle>
            <AlertDialogDescription>
              Il cliente di "{lockTarget?.name}" vedrà l'avviso "Album mandato in stampa" e non
              potrà più disegnare X, inviare richieste o cancellare quelle già inviate. Potrai
              sbloccare le modifiche in qualsiasi momento da qui.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={lockMutation.isPending}
              onClick={() => lockTarget && lockMutation.mutate({ id: lockTarget.id, locked: true })}
              data-testid="button-confirm-lock"
            >
              Manda in Stampa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conferma eliminazione */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il fotolibro?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno eliminate tutte le versioni, le pagine caricate e le richieste di modifica
              di "{deleteTarget?.name}". Le foto della galleria NON vengono toccate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
