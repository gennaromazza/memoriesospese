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
  createPhotobookLabShipment,
  listPhotobookChangeRequests,
  type Photobook,
  type PhotobookLabTransferResult,
} from '@/lib/photobooks';
import { GalleryService, type Gallery } from '@/lib/galleries';
import { getAllLabs } from '@/lib/labs';
import { getShipment, tsToDate, daysUntilExpiry } from '@/lib/labShipments';
import { getAllJobs } from '@/lib/jobs';
import {
  LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS,
  LAB_SHIPMENT_STATUS_LABELS,
  type Lab,
  type LabShipment,
} from '@shared/lab-types';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  BookImage,
  Copy,
  Layers,
  Lock,
  Unlock,
  Pencil,
  Plus,
  Trash2,
  Loader2,
  Truck,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  MessageSquareWarning,
} from 'lucide-react';
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

  // Dialog "Manda in Stampa": spedizione laboratorio facoltativa
  const [createShip, setCreateShip] = useState(true);
  const [shipLabId, setShipLabId] = useState('');
  const [shipDesc, setShipDesc] = useState('');
  const [shipExpiry, setShipExpiry] = useState(String(LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS));
  const [shipJobId, setShipJobId] = useState('');
  const [transferError, setTransferError] = useState<string | null>(null);

  const { data: books = [], isLoading } = useQuery({
    queryKey: ['/api/photobooks'],
    queryFn: listPhotobooks,
  });

  // Richieste di modifica pendenti: badge sui fotolibri + banner riepilogo
  const { data: changeRequests = [] } = useQuery({
    queryKey: ['/api/photobooks/requests'],
    queryFn: listPhotobookChangeRequests,
    staleTime: 0,
    refetchOnMount: 'always' as const,
  });
  const pendingByBook = new Map<string, number>();
  for (const r of changeRequests) {
    if (r.status === 'pending') {
      pendingByBook.set(r.photobookId, (pendingByBook.get(r.photobookId) || 0) + 1);
    }
  }
  const totalPending = Array.from(pendingByBook.values()).reduce((a, b) => a + b, 0);
  const goToChanges = () => {
    sessionStorage.setItem('activeTab', 'photobook-changes');
    navigate('/admin?tab=photobook-changes');
  };

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

  const unlockMutation = useMutation({
    mutationFn: (id: string) => updatePhotobook(id, { locked: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/photobooks'] });
      toast({
        title: 'Modifiche riaperte',
        description: 'Il cliente può di nuovo inviare e cancellare richieste.',
      });
    },
    onError: (e: any) =>
      toast({ title: 'Errore aggiornamento blocco', description: e.message, variant: 'destructive' }),
  });

  // Annullamento approvazione cliente: riapre la revisione per il cliente
  const resetApprovalMutation = useMutation({
    mutationFn: (id: string) => updatePhotobook(id, { approval: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/photobooks'] });
      toast({
        title: 'Approvazione annullata',
        description: 'Il cliente può di nuovo inviare richieste di modifica.',
      });
    },
    onError: (e: any) =>
      toast({ title: 'Errore annullamento approvazione', description: e.message, variant: 'destructive' }),
  });

  // Blocco + eventuale creazione spedizione con trasferimento pagine su Drive
  const lockMutation = useMutation({
    mutationFn: async (book: Photobook) => {
      await updatePhotobook(book.id, { locked: true });
      if (!createShip) return null;
      return await createPhotobookLabShipment(book.id, {
        labId: shipLabId || undefined,
        descrizione: shipDesc.trim() || undefined,
        expiryDays: parseInt(shipExpiry, 10) || LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS,
        jobId: book.jobId ? undefined : shipJobId || undefined,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/photobooks'] });
      if (result) {
        queryClient.invalidateQueries({ queryKey: ['/api/lab-shipments', result.shipment.id] });
        toast({
          title: 'Album mandato in stampa',
          description: `Trasferimento di ${result.totalPages} pagine su Google Drive avviato: segui l'avanzamento nella scheda del fotolibro.`,
        });
        setLockTarget(null);
      } else {
        toast({
          title: 'Album mandato in stampa',
          description:
            'Il cliente ora vede il fotolibro in sola lettura e non può più inviare o cancellare richieste.',
        });
        setLockTarget(null);
      }
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/photobooks'] });
      setTransferError(e.message);
    },
  });

  const openLockDialog = (book: Photobook) => {
    setCreateShip(true);
    setShipLabId('');
    setShipDesc(`Fotolibro "${book.name}" v${book.currentVersion}`);
    setShipExpiry(String(LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS));
    setShipJobId('');
    setTransferError(null);
    setLockTarget(book);
  };

  const { data: labs = [] } = useQuery<Lab[]>({
    queryKey: ['/api/labs', { attiviOnly: true }],
    queryFn: () => getAllLabs(true),
    enabled: !!lockTarget && createShip,
    staleTime: 5 * 60 * 1000,
  });

  // Solo per il caso anomalo di galleria orfana senza lavoro collegato
  const { data: jobs = [] } = useQuery({
    queryKey: ['/api/jobs', 'for-photobook-shipment'],
    queryFn: () => getAllJobs(),
    enabled: !!lockTarget && createShip && !lockTarget.jobId,
    staleTime: 5 * 60 * 1000,
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

      {totalPending > 0 && (
        <button
          type="button"
          onClick={goToChanges}
          className="w-full flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100 transition-colors"
          data-testid="banner-pending-changes"
        >
          <MessageSquareWarning className="h-5 w-5 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-900">
            <span className="font-semibold">
              {totalPending} {totalPending === 1 ? 'richiesta di modifica' : 'richieste di modifica'}
            </span>{' '}
            in attesa dai clienti — clicca per aprire "Modifiche Fotolibro"
          </span>
        </button>
      )}

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
                      {(pendingByBook.get(book.id) || 0) > 0 && (
                        <Badge
                          className="bg-amber-500 text-white hover:bg-amber-600 cursor-pointer"
                          onClick={goToChanges}
                          data-testid={`badge-pending-changes-${book.id}`}
                        >
                          <MessageSquareWarning className="h-3 w-3 mr-1" />
                          {pendingByBook.get(book.id)}{' '}
                          {pendingByBook.get(book.id) === 1 ? 'modifica' : 'modifiche'}
                        </Badge>
                      )}
                      {book.approval?.version === book.currentVersion && (
                        <Badge
                          className="bg-green-600 text-white hover:bg-green-600"
                          title={
                            book.approval?.note
                              ? `Nota del cliente: ${book.approval.note}`
                              : undefined
                          }
                          data-testid={`badge-approved-${book.id}`}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Approvato
                        </Badge>
                      )}
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
                    {!book.locked && book.approval?.version === book.currentVersion && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resetApprovalMutation.isPending}
                        onClick={() => resetApprovalMutation.mutate(book.id)}
                        data-testid={`button-reset-approval-${book.id}`}
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Annulla Approvazione
                      </Button>
                    )}
                    {book.locked ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={unlockMutation.isPending}
                        onClick={() => unlockMutation.mutate(book.id)}
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
                        onClick={() => openLockDialog(book)}
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
                  {book.labShipmentId && (
                    <PhotobookShipmentInfo
                      shipmentId={book.labShipmentId}
                      book={book}
                    />
                  )}
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

      {/* Dialog "manda in stampa" con spedizione laboratorio facoltativa */}
      <Dialog
        open={!!lockTarget}
        onOpenChange={(o) => {
          if (!o && !lockMutation.isPending) setLockTarget(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mandare l'album in stampa?</DialogTitle>
            <DialogDescription>
              Il cliente di "{lockTarget?.name}" vedrà l'avviso "Album mandato in stampa" e non
              potrà più disegnare X, inviare richieste o cancellare quelle già inviate. Potrai
              sbloccare le modifiche in qualsiasi momento da qui.
            </DialogDescription>
          </DialogHeader>

          <>
              <div className="space-y-4">
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={createShip}
                    onCheckedChange={(c) => setCreateShip(c === true)}
                    className="mt-0.5"
                    data-testid="checkbox-create-shipment"
                  />
                  <span className="text-sm">
                    <span className="font-medium flex items-center gap-1.5">
                      <Truck className="h-4 w-4" />
                      Crea spedizione laboratorio
                    </span>
                    <span className="text-muted-foreground">
                      Trasferisce le pagine originali della versione corrente (v
                      {lockTarget?.currentVersion}) su Google Drive, senza ricompressione.
                    </span>
                  </span>
                </label>

                {createShip && (
                  <div className="space-y-3 pl-6">
                    {!lockTarget?.jobId && (
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5 text-amber-600">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Lavoro da collegare (galleria senza lavoro)
                        </Label>
                        <Select value={shipJobId} onValueChange={setShipJobId}>
                          <SelectTrigger data-testid="select-shipment-job">
                            <SelectValue placeholder="Seleziona il lavoro" />
                          </SelectTrigger>
                          <SelectContent>
                            {jobs.map((j: any) => (
                              <SelectItem key={j.id} value={j.id}>
                                {j.nomeEvento || j.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label>Laboratorio (facoltativo)</Label>
                      <Select value={shipLabId} onValueChange={setShipLabId}>
                        <SelectTrigger data-testid="select-shipment-lab">
                          <SelectValue placeholder="Nessun laboratorio" />
                        </SelectTrigger>
                        <SelectContent>
                          {labs.map((lab) => (
                            <SelectItem key={lab.id} value={lab.id}>
                              {lab.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ship-desc">Descrizione</Label>
                      <Input
                        id="ship-desc"
                        value={shipDesc}
                        onChange={(e) => setShipDesc(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ship-expiry">Scadenza file su Drive (giorni)</Label>
                      <Input
                        id="ship-expiry"
                        type="number"
                        min={1}
                        value={shipExpiry}
                        onChange={(e) => setShipExpiry(e.target.value)}
                        className="w-32"
                      />
                    </div>
                  </div>
                )}

                {transferError && (
                  <p className="text-sm text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {transferError}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={lockMutation.isPending}
                  onClick={() => setLockTarget(null)}
                >
                  Annulla
                </Button>
                <Button
                  disabled={
                    lockMutation.isPending ||
                    (createShip && !lockTarget?.jobId && !shipJobId)
                  }
                  onClick={() => {
                    setTransferError(null);
                    lockTarget && lockMutation.mutate(lockTarget);
                  }}
                  data-testid="button-confirm-lock"
                >
                  {lockMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {lockMutation.isPending && createShip
                    ? 'Avvio trasferimento…'
                    : 'Manda in Stampa'}
                </Button>
              </DialogFooter>
            </>
        </DialogContent>
      </Dialog>

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

/**
 * Riquadro spedizione laboratorio collegata a un fotolibro mandato in stampa:
 * laboratorio, stato, scadenza file, link Drive e retry per pagine mancanti.
 */
function PhotobookShipmentInfo({ shipmentId, book }: { shipmentId: string; book: Photobook }) {
  const { toast } = useToast();
  const { data: shipment, isLoading } = useQuery<LabShipment>({
    queryKey: ['/api/lab-shipments', shipmentId],
    queryFn: () => getShipment(shipmentId),
    staleTime: 60 * 1000,
    // Trasferimento in background in corso: polla l'avanzamento ogni 2.5s
    refetchInterval: (data) =>
      data?.pageTransfer?.status === 'running' ? 2500 : false,
  });

  const retryMutation = useMutation({
    mutationFn: () => createPhotobookLabShipment(book.id, {}),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/lab-shipments', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/photobooks'] });
      toast({
        title: result.alreadyRunning ? 'Trasferimento già in corso' : 'Trasferimento riavviato',
        description: `Verranno trasferite solo le pagine mancanti (${result.totalPages} totali).`,
      });
    },
    onError: (e: any) =>
      toast({ title: 'Errore trasferimento', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) {
    return (
      <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Caricamento spedizione…
      </div>
    );
  }
  if (!shipment) return null;

  const expiresDate = tsToDate(shipment.expiresAt);
  const daysLeft = daysUntilExpiry(shipment.expiresAt);
  const expired = shipment.deletedFromDrive || (daysLeft !== null && daysLeft <= 0);
  const currentVersionEntry = book.versions.find((v) => v.version === book.currentVersion);
  const pageCount = currentVersionEntry?.pageCount || 0;
  const filesCount = shipment.files?.length || 0;
  const transfer = shipment.pageTransfer;
  const transferRunning = transfer?.status === 'running';
  const incomplete =
    !transferRunning && !shipment.deletedFromDrive && pageCount > 0 && filesCount < pageCount;

  return (
    <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm space-y-1.5">
      <p className="font-medium flex items-center gap-1.5">
        <Truck className="h-4 w-4" />
        Spedizione laboratorio
        <Badge variant="secondary" className="ml-1">
          {LAB_SHIPMENT_STATUS_LABELS[shipment.status] || shipment.status}
        </Badge>
        {expired && (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {shipment.deletedFromDrive ? 'File eliminati da Drive' : 'File scaduti'}
          </Badge>
        )}
      </p>
      <p className="text-muted-foreground">
        {shipment.labNome ? `Laboratorio: ${shipment.labNome} · ` : ''}
        File trasferiti: {filesCount}
        {pageCount > 0 ? `/${pageCount}` : ''}
        {expiresDate && !shipment.deletedFromDrive
          ? ` · Scadenza: ${expiresDate.toLocaleDateString('it-IT')}${
              daysLeft !== null && daysLeft > 0 ? ` (${daysLeft} gg)` : ''
            }`
          : ''}
      </p>
      {transferRunning && transfer && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Trasferimento in corso: {transfer.transferred + transfer.skipped}/{transfer.total}{' '}
            pagine su Google Drive…
          </p>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${transfer.total > 0 ? Math.round(((transfer.transferred + transfer.skipped) / transfer.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}
      {!transferRunning && transfer && (transfer.status === 'partial' || transfer.status === 'failed') && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {transfer.status === 'failed'
            ? `Trasferimento interrotto: ${transfer.error || 'errore imprevisto'}.`
            : `${transfer.failed?.length || 0} pagine non trasferite (es. ${transfer.failed?.[0] ? `pagina ${transfer.failed[0].pageNumber}: ${transfer.failed[0].error}` : ''}).`}{' '}
          Riprova: verranno copiate solo le pagine mancanti, senza duplicati.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {shipment.shareableLink && !shipment.deletedFromDrive && (
          <Button size="sm" variant="outline" asChild>
            <a href={shipment.shareableLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Apri cartella Drive
            </a>
          </Button>
        )}
        {incomplete && (
          <Button
            size="sm"
            variant="outline"
            disabled={retryMutation.isPending}
            onClick={() => retryMutation.mutate()}
            data-testid={`button-retry-shipment-${book.id}`}
          >
            {retryMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Riprova pagine mancanti
          </Button>
        )}
        {!incomplete && !expired && filesCount > 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            Tutte le pagine trasferite
          </span>
        )}
      </div>
    </div>
  );
}
