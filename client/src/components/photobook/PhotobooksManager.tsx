/**
 * Gestione fotolibri (tab admin "Fotolibri").
 * Lista, creazione (nome + galleria), copia link cliente, nuova versione,
 * apertura editor pagine, eliminazione.
 */

import { useEffect, useState } from 'react';
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
import {
  getShipment,
  sendShipment,
  tsToDate,
  daysUntilExpiry,
  formatFileSize,
} from '@/lib/labShipments';
import { getAllJobs } from '@/lib/jobs';
import JobPicker from '@/components/admin/JobPicker';
import {
  LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS,
  LAB_SHIPMENT_STATUS_LABELS,
  type Lab,
  type LabShipment,
} from '@shared/lab-types';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  Send,
  CheckCircle2,
  MessageSquareWarning,
  FileText,
} from 'lucide-react';
import PhotobookTutorial from '@/components/photobook/PhotobookTutorial';
import LabFileUploader from '@/components/jobs/operativo/LabFileUploader';
import type { Job } from '@shared/jobs-types';

function linkedClientIds(
  entity: { clientiIds?: string[]; clienteId?: string } | null | undefined,
): string[] {
  const ids = entity?.clientiIds?.length
    ? entity.clientiIds
    : entity?.clienteId
      ? [entity.clienteId]
      : [];
  return [...new Set(ids.filter(Boolean))];
}

function associationWarnings(gallery: Gallery | undefined, job: Job | undefined): string[] {
  if (!gallery || !job) return [];
  const warnings: string[] = [];
  if (gallery.jobId && gallery.jobId !== job.id) {
    warnings.push('La galleria è già collegata a un altro lavoro.');
  }
  const galleryClients = linkedClientIds(gallery);
  const jobClients = linkedClientIds(job);
  if (
    galleryClients.length > 0 &&
    jobClients.length > 0 &&
    !galleryClients.some((id) => jobClients.includes(id))
  ) {
    warnings.push('I clienti della galleria non coincidono con quelli del lavoro selezionato.');
  }
  return warnings;
}

export default function PhotobooksManager() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGalleryId, setNewGalleryId] = useState('');
  const [newJobId, setNewJobId] = useState('');
  const [associationMismatchConfirmed, setAssociationMismatchConfirmed] = useState(false);
  const [gallerySearch, setGallerySearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Photobook | null>(null);
  const [lockTarget, setLockTarget] = useState<Photobook | null>(null);

  // Dialog "Manda in Stampa": spedizione laboratorio facoltativa
  const [createShip, setCreateShip] = useState(true);
  const [shipLabId, setShipLabId] = useState('');
  const [shipDesc, setShipDesc] = useState('');
  const [shipExpiry, setShipExpiry] = useState(String(LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS));
  const [shipJobId, setShipJobId] = useState('');
  const [shipLabNote, setShipLabNote] = useState('');
  const [shipPhotoNotes, setShipPhotoNotes] = useState<
    Record<string, { selected: boolean; note: string }>
  >({});
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
    enabled: createOpen || !!lockTarget,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: () => createPhotobook({
      name: newName.trim(),
      galleryId: newGalleryId,
      jobId: newJobId,
      allowAssociationMismatch: associationMismatchConfirmed,
    }),
    onSuccess: (book) => {
      queryClient.invalidateQueries({ queryKey: ['/api/photobooks'] });
      setCreateOpen(false);
      setNewName('');
      setNewGalleryId('');
      setNewJobId('');
      setAssociationMismatchConfirmed(false);
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
      if (!createShip) {
        await updatePhotobook(book.id, { locked: true });
        return null;
      }
      return await createPhotobookLabShipment(book.id, {
        labId: shipLabId || undefined,
        descrizione: shipDesc.trim() || undefined,
        expiryDays: parseInt(shipExpiry, 10) || LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS,
        jobId: book.jobId ? undefined : shipJobId || undefined,
        labNote: shipLabNote.trim() || undefined,
        jobPhotoNotes: Object.entries(shipPhotoNotes)
          .filter(([, value]) => value.selected)
          .map(([sourceNoteId, value]) => ({ sourceNoteId, note: value.note.trim() })),
        lockPhotobook: true,
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
    setShipLabNote('');
    setShipPhotoNotes({});
    setTransferError(null);
    setLockTarget(book);
  };

  const { data: labs = [] } = useQuery<Lab[]>({
    queryKey: ['/api/labs', { attiviOnly: true }],
    queryFn: () => getAllLabs(true),
    enabled: !!lockTarget && createShip,
    staleTime: 5 * 60 * 1000,
  });

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ['/api/jobs', 'for-photobook-shipment'],
    queryFn: () => getAllJobs(),
    enabled: createOpen || (!!lockTarget && createShip),
    staleTime: 5 * 60 * 1000,
  });

  const selectedCreateGallery = galleries.find((gallery) => gallery.id === newGalleryId);
  const selectedCreateJob = jobs.find((job) => job.id === newJobId);
  const createAssociationWarnings = associationWarnings(selectedCreateGallery, selectedCreateJob);
  const selectedShipJobId = lockTarget?.jobId || shipJobId;
  const selectedShipJob = jobs.find((job) => job.id === selectedShipJobId);
  const selectedShipGallery = galleries.find((gallery) => gallery.id === lockTarget?.galleryId);
  const shipAssociationWarnings = associationWarnings(selectedShipGallery, selectedShipJob);

  useEffect(() => {
    if (
      createOpen &&
      !newJobId &&
      selectedCreateGallery?.jobId &&
      jobs.some((job) => job.id === selectedCreateGallery.jobId)
    ) {
      setNewJobId(selectedCreateGallery.jobId);
    }
  }, [createOpen, newJobId, selectedCreateGallery?.jobId, jobs]);

  useEffect(() => {
    if (!lockTarget || !selectedShipJob) return;
    setShipLabNote(selectedShipJob.note || '');
    setShipPhotoNotes(
      Object.fromEntries(
        (selectedShipJob.notePerFoto || []).map((note) => [
          note.id,
          { selected: false, note: note.nota || '' },
        ]),
      ),
    );
  }, [lockTarget?.id, selectedShipJob?.id]);

  const selectGalleryForPhotobook = (galleryId: string) => {
    setNewGalleryId(galleryId);
    const gallery = galleries.find((item) => item.id === galleryId);
    const linkedJobExists = gallery?.jobId && jobs.some((job) => job.id === gallery.jobId);
    setNewJobId(linkedJobExists ? gallery!.jobId! : '');
    setAssociationMismatchConfirmed(false);
  };

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
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nuovo Fotolibro</DialogTitle>
            <DialogDescription>
              Il fotolibro è collegato a un lavoro e usa una galleria come sorgente delle foto
              sostitutive.
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
              <Select value={newGalleryId} onValueChange={selectGalleryForPhotobook}>
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
            <div className="space-y-2">
              <Label>Lavoro associato</Label>
              <JobPicker
                jobs={jobs}
                value={newJobId}
                onChange={(jobId) => {
                  setNewJobId(jobId);
                  setAssociationMismatchConfirmed(false);
                }}
                loading={jobsLoading}
                allowNone={false}
                placeholder="Seleziona il lavoro"
                testId="select-photobook-job"
              />
              {selectedCreateGallery?.jobId && selectedCreateGallery.jobId === newJobId && (
                <p className="text-xs text-green-700 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  È il lavoro già associato alla galleria
                  {selectedCreateJob?.clientNames?.length
                    ? ` · ${selectedCreateJob.clientNames.join(', ')}`
                    : ''}.
                </p>
              )}
              {selectedCreateGallery?.jobId &&
                !jobs.some((job) => job.id === selectedCreateGallery.jobId) && (
                  <p className="text-xs text-amber-700 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    La galleria contiene un collegamento a un lavoro inesistente. Seleziona il
                    lavoro corretto e conferma la differenza.
                  </p>
                )}
              {createAssociationWarnings.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2 text-sm text-amber-900">
                  {createAssociationWarnings.map((warning) => (
                    <p key={warning} className="flex items-start gap-1.5">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      {warning}
                    </p>
                  ))}
                  <label className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      checked={associationMismatchConfirmed}
                      onCheckedChange={(checked) => setAssociationMismatchConfirmed(checked === true)}
                      data-testid="checkbox-confirm-photobook-association-mismatch"
                    />
                    <span>
                      Confermo di voler associare il fotolibro a questo lavoro senza modificare i
                      collegamenti originali della galleria.
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Annulla
            </Button>
            <Button
              disabled={
                !newName.trim() ||
                !newGalleryId ||
                !newJobId ||
                (createAssociationWarnings.length > 0 && !associationMismatchConfirmed) ||
                createMutation.isPending
              }
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                        <JobPicker
                          jobs={jobs}
                          value={shipJobId}
                          onChange={setShipJobId}
                          loading={jobsLoading}
                          allowNone={false}
                          placeholder="Seleziona il lavoro"
                          testId="select-shipment-job"
                        />
                      </div>
                    )}
                    {selectedShipJob && (
                      <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                        <p className="font-medium">Lavoro: {selectedShipJob.nomeEvento}</p>
                        <p className="text-muted-foreground">
                          {selectedShipJob.clientNames?.length
                            ? `Clienti: ${selectedShipJob.clientNames.join(', ')}`
                            : 'Clienti associati non disponibili'}
                        </p>
                        {shipAssociationWarnings.map((warning) => (
                          <p key={warning} className="text-amber-700 flex items-start gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            {warning}
                          </p>
                        ))}
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
                    {selectedShipJob && (
                      <div className="space-y-3 rounded-md border p-3">
                        <div>
                          <Label htmlFor="ship-lab-note">Note per il laboratorio</Label>
                          <p className="text-xs text-muted-foreground mt-1">
                            È una copia iniziale della nota del lavoro. Puoi modificarla liberamente:
                            la nota originale del job non verrà aggiornata.
                          </p>
                        </div>
                        <Textarea
                          id="ship-lab-note"
                          value={shipLabNote}
                          onChange={(event) => setShipLabNote(event.target.value)}
                          rows={5}
                          placeholder="Istruzioni, materiali, finiture o altre indicazioni per il laboratorio..."
                          data-testid="textarea-shipment-lab-note"
                        />

                        {(selectedShipJob.notePerFoto || []).length > 0 && (
                          <div className="space-y-2">
                            <p className="text-sm font-medium">
                              Note con foto del lavoro ({selectedShipJob.notePerFoto?.length})
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Seleziona solo quelle da copiare nella cartella Drive del laboratorio.
                              Anche il loro testo può essere modificato per questa spedizione.
                            </p>
                            {selectedShipJob.notePerFoto?.map((photoNote, index) => {
                              const draft = shipPhotoNotes[photoNote.id] || {
                                selected: false,
                                note: photoNote.nota || '',
                              };
                              return (
                                <div key={photoNote.id} className="rounded-md border p-2.5 space-y-2">
                                  <label className="flex items-start gap-2 cursor-pointer">
                                    <Checkbox
                                      checked={draft.selected}
                                      onCheckedChange={(checked) =>
                                        setShipPhotoNotes((current) => ({
                                          ...current,
                                          [photoNote.id]: {
                                            ...draft,
                                            selected: checked === true,
                                          },
                                        }))
                                      }
                                      data-testid={`checkbox-shipment-photo-note-${photoNote.id}`}
                                    />
                                    <span className="text-sm font-medium">
                                      Allega nota con foto {index + 1}
                                    </span>
                                  </label>
                                  <div className="flex gap-3">
                                    {photoNote.imageUrl && (
                                      <img
                                        src={photoNote.imageUrl}
                                        alt={`Allegato nota ${index + 1}`}
                                        className="h-20 w-20 rounded border object-cover shrink-0"
                                      />
                                    )}
                                    <Textarea
                                      value={draft.note}
                                      disabled={!draft.selected}
                                      onChange={(event) =>
                                        setShipPhotoNotes((current) => ({
                                          ...current,
                                          [photoNote.id]: {
                                            ...draft,
                                            note: event.target.value,
                                          },
                                        }))
                                      }
                                      rows={3}
                                      className="min-h-[80px]"
                                      data-testid={`textarea-shipment-photo-note-${photoNote.id}`}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
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
                    (createShip && (!selectedShipJobId || !selectedShipJob))
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
  const [supplementalUploading, setSupplementalUploading] = useState(false);
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

  const sendMutation = useMutation({
    mutationFn: () => sendShipment(shipmentId),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['/api/lab-shipments', shipmentId] });
      toast({
        title: 'Email inviata al laboratorio',
        description: `${updated.labNome ? `${updated.labNome} ha ricevuto` : 'Il laboratorio ha ricevuto'} il link Google Drive con i file di stampa.`,
      });
    },
    onError: (e: any) =>
      toast({ title: 'Errore invio email', description: e.message, variant: 'destructive' }),
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
  const pageFilesCount = (shipment.files || []).filter(
    (file) => file.kind === 'original' || file.name.startsWith('pagina-'),
  ).length;
  const noteAttachmentsCount = (shipment.files || []).filter(
    (file) => file.kind === 'note_attachment' || file.name.startsWith('nota-lavoro-'),
  ).length;
  const supplementalFiles = (shipment.files || []).filter(
    (file) => file.kind === 'supplemental',
  );
  const hasInstructionsManifest = (shipment.files || []).some(
    (file) => file.kind === 'manifest' || file.name === 'ISTRUZIONI-DI-STAMPA.txt',
  );
  const transfer = shipment.pageTransfer;
  const transferRunning = transfer?.status === 'running';
  const incomplete =
    !transferRunning && !shipment.deletedFromDrive && pageCount > 0 && pageFilesCount < pageCount;

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
        Pagine trasferite: {pageFilesCount}
        {pageCount > 0 ? `/${pageCount}` : ''}
        {noteAttachmentsCount > 0 ? ` · Allegati note: ${noteAttachmentsCount}` : ''}
        {supplementalFiles.length > 0 ? ` · File aggiuntivi: ${supplementalFiles.length}` : ''}
        {expiresDate && !shipment.deletedFromDrive
          ? ` · Scadenza: ${expiresDate.toLocaleDateString('it-IT')}${
              daysLeft !== null && daysLeft > 0 ? ` (${daysLeft} gg)` : ''
            }`
          : ''}
      </p>
      {shipment.labNote && (
        <div className="rounded border bg-background p-2 text-xs">
          <p className="font-medium mb-1">Note inviate al laboratorio</p>
          <p className="whitespace-pre-wrap text-muted-foreground">{shipment.labNote}</p>
        </div>
      )}
      <div className="rounded border bg-background p-3 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">Copertine e altri file per il fotolibro</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Aggiungi copertine, dorsi, loghi, PDF tecnici o altri materiali. Verranno caricati
              nella stessa cartella Drive delle pagine.
            </p>
          </div>
          {!expired && (
            <LabFileUploader
              shipmentId={shipmentId}
              kind="supplemental"
              label="Aggiungi file"
              disabled={transferRunning}
              onUploadingChange={setSupplementalUploading}
              onUploaded={() =>
                queryClient.invalidateQueries({ queryKey: ['/api/lab-shipments', shipmentId] })
              }
            />
          )}
        </div>
        {transferRunning && (
          <p className="text-xs text-muted-foreground">
            Attendi il completamento del trasferimento delle pagine prima di aggiungere altri file.
          </p>
        )}
        {supplementalFiles.length > 0 ? (
          <ul className="space-y-1">
            {supplementalFiles.map((file) => (
              <li
                key={file.driveFileId}
                className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2.5 py-2 text-xs"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{file.name}</span>
                </span>
                <span className="text-muted-foreground shrink-0">
                  {formatFileSize(file.size)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground italic">Nessun file aggiuntivo.</p>
        )}
        {hasInstructionsManifest && (
          <p className="text-xs text-green-700 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Il riepilogo delle note è disponibile su Drive come ISTRUZIONI-DI-STAMPA.txt.
          </p>
        )}
        {shipment.status === 'inviato' && supplementalFiles.length > 0 && (
          <p className="text-xs text-amber-700">
            Se hai aggiunto file dopo il primo invio, usa “Reinvia email al laboratorio”.
          </p>
        )}
      </div>
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
        {shipment.shareableLink &&
          !shipment.deletedFromDrive &&
          !transferRunning &&
          shipment.labId && (
            <Button
              size="sm"
              variant={shipment.status === 'inviato' ? 'outline' : 'default'}
              disabled={sendMutation.isPending || supplementalUploading}
              onClick={() => sendMutation.mutate()}
              data-testid="button-send-lab-email"
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1.5" />
              )}
              {shipment.status === 'inviato'
                ? 'Reinvia email al laboratorio'
                : 'Invia email al laboratorio'}
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
        {!incomplete && !expired && pageFilesCount > 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            Tutte le pagine trasferite
          </span>
        )}
      </div>
    </div>
  );
}
