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
  updateShipment,
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
  Eye,
  Download,
  ChevronDown,
  ChevronRight,
  Filter,
  Printer,
  Search,
  X,
} from 'lucide-react';
import PhotobookTutorial from '@/components/photobook/PhotobookTutorial';
import { MockupStatusLine } from '@/components/photobook/MockupAdminFlow';
import './PhotobooksManager.css';
import LabFileUploader from '@/components/jobs/operativo/LabFileUploader';
import LabSendFeedback from '@/components/jobs/operativo/LabSendFeedback';
import type { Job } from '@shared/jobs-types';
import {
  photobookJobHasLinkedGalleries,
  selectPhotobookGalleryForJob,
} from '@shared/photobook-job-gallery';

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

export interface PhotobooksManagerProps {
  loadGalleries?: () => Promise<Gallery[]>;
  loadJobs?: () => Promise<Job[]>;
}

export default function PhotobooksManager({
  loadGalleries = () => GalleryService.getAllGalleriesForAdmin(),
  loadJobs = () => getAllJobs(),
}: PhotobooksManagerProps = {}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'linked' | 'standalone'>('linked');
  // The print queue must remain discoverable after navigation and refresh.
  const [showArchived, setShowArchived] = useState(false);
  const [expandedShipmentBookIds, setExpandedShipmentBookIds] = useState<Set<string>>(() => new Set());
  const [newName, setNewName] = useState('');
  const [newGalleryId, setNewGalleryId] = useState('');
  const [newJobId, setNewJobId] = useState('');
  const [associationMismatchConfirmed, setAssociationMismatchConfirmed] = useState(false);
  const [gallerySearch, setGallerySearch] = useState('');
  const [bookSearch, setBookSearch] = useState('');
  const [bookFilter, setBookFilter] = useState<'all' | 'attention' | 'approved'>('all');
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
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get('photobook');
    if (!target || !books.some(book => book.id === target)) return;
    const element = document.getElementById(`photobook-materials-${target}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element?.focus({ preventScroll: true });
  }, [books]);

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
    queryFn: loadGalleries,
    enabled: (createOpen && createMode === 'linked') || Boolean(lockTarget?.galleryId),
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: () => createPhotobook({
      name: newName.trim(),
      ...(createMode === 'linked' ? { galleryId: newGalleryId, jobId: newJobId } : {}),
      // Il percorso si sceglie dopo, nel passo 3 del mockup: si parte sempre da "lo prepara lo studio".
      mockupPath: 'studio',
      allowAssociationMismatch: associationMismatchConfirmed,
    }),
    onSuccess: (book) => {
      queryClient.invalidateQueries({ queryKey: ['/api/photobooks'] });
      setCreateOpen(false);
      setNewName('');
      setNewGalleryId('');
      setNewJobId('');
      setCreateMode('linked');
      setAssociationMismatchConfirmed(false);
      toast({ title: 'Fotolibro creato', description: 'Ora carica le pagine JPEG nell\u2019editor.' });
      navigate(`/admin/photobooks/${book.id}`);
    },
    onError: (e: any) =>
      toast({ title: 'Errore creazione fotolibro', description: e.message, variant: 'destructive' }),
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
      // Il fotolibro bloccato passa nell'archivio: aprilo subito, altrimenti
      // l'utente può pensare che sia sparito prima di poter inviare l'email.
      setShowArchived(true);
      if (result) {
        queryClient.invalidateQueries({ queryKey: ['/api/lab-shipments', result.shipment.id] });
        toast({
          title: 'Fotolibro preparato per la stampa',
          description: `Trasferimento di ${result.totalPages} pagine su Google Drive avviato. L'email al laboratorio non è ancora stata inviata: apri il riquadro “Spedizione laboratorio” e premi “Invia email al laboratorio” quando il trasferimento è completo.`,
        });
        setLockTarget(null);
      } else {
        toast({
          title: 'Fotolibro bloccato per la stampa',
          description:
            'Il cliente ora vede il fotolibro in sola lettura. Il fotolibro è nell’archivio; non è stata creata né inviata una spedizione al laboratorio.',
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
    queryFn: loadJobs,
    enabled:
      (createOpen && createMode === 'linked') ||
      Boolean(lockTarget && createShip && (lockTarget.jobId || lockTarget.galleryId)),
    staleTime: 5 * 60 * 1000,
  });

  const selectedCreateGallery = galleries.find((gallery) => gallery.id === newGalleryId);
  const selectedCreateJob = jobs.find((job) => job.id === newJobId);
  const selectedCreateGalleryBelongsToJob = Boolean(
    selectedCreateGallery &&
      selectedCreateJob?.galleryIds?.includes(selectedCreateGallery.id),
  );
  const createAssociationWarnings = associationWarnings(selectedCreateGallery, selectedCreateJob);
  const selectedShipJobId = lockTarget?.jobId || shipJobId;
  const selectedShipJob = jobs.find((job) => job.id === selectedShipJobId);
  const selectedShipGallery = galleries.find((gallery) => gallery.id === lockTarget?.galleryId);
  const shipmentNeedsJobSelection = Boolean(lockTarget?.galleryId && !lockTarget?.jobId);
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
    if (!createOpen || !newJobId) return;
    const selectedJob = jobs.find((job) => job.id === newJobId);
    if (!selectedJob || !photobookJobHasLinkedGalleries(selectedJob)) {
      return;
    }

    const nextGalleryId = selectPhotobookGalleryForJob(selectedJob, galleries, newGalleryId);
    if (nextGalleryId && nextGalleryId !== newGalleryId) {
      setNewGalleryId(nextGalleryId);
      setAssociationMismatchConfirmed(false);
    }
  }, [createOpen, galleries, jobs, newGalleryId, newJobId]);

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

  const selectJobForPhotobook = (jobId: string) => {
    setNewJobId(jobId);
    setAssociationMismatchConfirmed(false);

    const job = jobs.find((item) => item.id === jobId);
    if (!job) return;

    setNewGalleryId(selectPhotobookGalleryForJob(job, galleries, newGalleryId));
  };

  const copyLink = (book: Photobook) => {
    navigator.clipboard.writeText(photobookClientLink(book));
    toast({ title: 'Link copiato', description: 'Invia questo link al cliente per la revisione.' });
  };

  const filteredGalleries = galleries.filter((g) =>
    g.name.toLowerCase().includes(gallerySearch.trim().toLowerCase()),
  );

  const activeBooks = books.filter((b) => !b.locked);
  const archivedBooks = books.filter((b) => b.locked);
  const isStandaloneBook = (book: Photobook) => !book.jobId && !book.galleryId;
  const activeLinkedBooks = activeBooks.filter((book) => !isStandaloneBook(book));
  const activeStandaloneBooks = activeBooks.filter(isStandaloneBook);
  const archivedLinkedBooks = archivedBooks.filter((book) => !isStandaloneBook(book));
  const archivedStandaloneBooks = archivedBooks.filter(isStandaloneBook);
  const searchTerm = bookSearch.trim().toLocaleLowerCase();
  const matchesBookFilter = (book: Photobook) => {
    const matchesSearch = !searchTerm || [
      book.name,
      book.clientName || '',
      book.galleryName || '',
      book.galleryId || '',
      book.jobId || '',
    ].some((value) => value.toLocaleLowerCase().includes(searchTerm));
    const pending = pendingByBook.get(book.id) || 0;
    const approved = book.approval?.version === book.currentVersion;
    const matchesStatus =
      bookFilter === 'all' ||
      (bookFilter === 'attention' && pending > 0) ||
      (bookFilter === 'approved' && approved);
    return matchesSearch && matchesStatus;
  };
  const visibleLinkedBooks = activeLinkedBooks.filter(matchesBookFilter);
  const visibleStandaloneBooks = activeStandaloneBooks.filter(matchesBookFilter);
  const approvedCount = activeBooks.filter((book) => book.approval?.version === book.currentVersion).length;

  const renderBook = (book: Photobook) => {
            const sourceLabel =
              book.galleryName ||
              book.galleryId ||
              (book.jobId ? 'Senza galleria · lavoro collegato' : 'Fotolibro autonomo');
            const currentVer = book.versions.find((v) => v.version === book.currentVersion);
            return (
              <Card key={book.id} id={`photobook-materials-${book.id}`} tabIndex={-1} className="pb-book-card focus:ring-2 focus:ring-primary focus:outline-none" data-testid={`card-photobook-${book.id}`}>
                <CardContent className="pb-book-card-content">
                  <div className="pb-book-cover" aria-hidden="true">
                    <span>{book.name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toLocaleUpperCase() || 'FB'}</span>
                    <small>{currentVer?.pageCount ?? 0} pag.</small>
                  </div>
                  <div className="pb-book-main">
                  <div className="pb-book-heading flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{book.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {sourceLabel}
                        {book.clientName ? ` · ${book.clientName}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="secondary">v{book.currentVersion}</Badge>
                      {(pendingByBook.get(book.id) || 0) > 0 && (
                        <button
                          type="button"
                          className="pb-status-chip pb-status-pending"
                          onClick={goToChanges}
                          data-testid={`badge-pending-changes-${book.id}`}
                        >
                          <MessageSquareWarning className="h-3 w-3 mr-1" />
                          {pendingByBook.get(book.id)}{' '}
                          {pendingByBook.get(book.id) === 1 ? 'modifica' : 'modifiche'}
                        </button>
                      )}
                      {book.approval?.version === book.currentVersion && (
                        <Badge
                          className="pb-status-chip pb-status-approved"
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
                          className="pb-status-chip pb-status-locked"
                          data-testid={`badge-locked-${book.id}`}
                        >
                          <Lock className="h-3 w-3 mr-1" />
                          Modifiche bloccate
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="pb-book-meta">
                    {currentVer?.pageCount ?? 0} pagine · {book.versions.length}{' '}
                    {book.versions.length === 1 ? 'versione' : 'versioni'}
                  </p>
                  <MockupStatusLine
                    photobookId={book.id}
                    version={book.currentVersion}
                    readOnly={!!book.locked}
                    onAssign={() => navigate(`/admin/photobooks/${book.id}?mockupTab=offer`)}
                  />
                  <div className="pb-book-actions">
                    <Button
                      size="sm"
                      className="h-8"
                      onClick={() => navigate(`/admin/photobooks/${book.id}`)}
                      data-testid={`button-edit-photobook-${book.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Apri editor
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => copyLink(book)}>
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copia link cliente
                    </Button>
                    {!book.locked && book.approval?.version === book.currentVersion && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={resetApprovalMutation.isPending}
                        onClick={() => resetApprovalMutation.mutate(book.id)}
                        data-testid={`button-reset-approval-${book.id}`}
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Annulla approvazione
                      </Button>
                    )}
                    {book.locked ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
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
                        className="h-8"
                        disabled={lockMutation.isPending}
                        onClick={() => openLockDialog(book)}
                        data-testid={`button-lock-${book.id}`}
                      >
                        <Lock className="h-3.5 w-3.5 mr-1.5" />
                        Manda in stampa
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(book)}
                      aria-label={`Elimina ${book.name}`}
                      data-testid={`button-delete-photobook-${book.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {book.labShipmentId && (
                    <PhotobookShipmentInfo
                      shipmentId={book.labShipmentId}
                      book={book}
                      expanded={expandedShipmentBookIds.has(book.id)}
                      onExpandedChange={(expanded) => setExpandedShipmentBookIds(current => {
                        const next = new Set(current);
                        if (expanded) next.add(book.id);
                        else next.delete(book.id);
                        return next;
                      })}
                    />
                  )}
                  {book.locked && !book.labShipmentId && (
                    <div className="rounded border p-3 text-sm space-y-2">
                      <p>Modifiche bloccate. Nessuna spedizione preparata e nessuna email inviata.</p>
                      <Button size="sm" variant="outline" onClick={() => openLockDialog(book)}>Prepara spedizione laboratorio</Button>
                    </div>
                  )}
                  </div>
                </CardContent>
              </Card>
            );
  };

  return (
    <div className="photobooks-dashboard">
      <header className="pb-page-heading">
        <div>
          <p className="pb-eyebrow">GESTIONE · {activeBooks.length} {activeBooks.length === 1 ? 'ALBUM ATTIVO' : 'ALBUM ATTIVI'}</p>
          <h1>Fotolibri</h1>
          <p>Una vista ordinata di revisioni, approvazioni e stampa.</p>
        </div>
        <div className="pb-heading-actions">
          <PhotobookTutorial />
          <Button onClick={() => { setCreateMode('linked'); setCreateOpen(true); }} data-testid="button-create-photobook">
            <Plus className="h-4 w-4 mr-2" />
            Nuovo fotolibro
          </Button>
        </div>
      </header>

      <section className="pb-overview" aria-label="Riepilogo fotolibri">
        <div className="pb-overview-intro">
          <span className="pb-overview-icon"><BookImage className="h-5 w-5" /></span>
          <div><strong>Riepilogo della lavorazione</strong><p>Album attivi, richieste in attesa e approvazioni.</p></div>
        </div>
        <div className="pb-overview-stat"><span>ALBUM ATTIVI</span><strong>{activeBooks.length.toString().padStart(2, '0')}</strong></div>
        <div className="pb-overview-stat"><span>RICHIESTE APERTE</span><strong className={totalPending ? 'is-warm' : ''}>{totalPending.toString().padStart(2, '0')}</strong></div>
        <div className="pb-overview-stat"><span>APPROVATI</span><strong>{approvedCount.toString().padStart(2, '0')}</strong></div>
      </section>

      {totalPending > 0 && (
        <button
          type="button"
          onClick={goToChanges}
          className="pb-pending-banner"
          data-testid="banner-pending-changes"
        >
          <span className="pb-pending-icon"><MessageSquareWarning className="h-5 w-5" /></span>
          <span className="pb-pending-copy">
            <strong>
              {totalPending} {totalPending === 1 ? 'richiesta di modifica' : 'richieste di modifica'}
            </strong>
            <small>In attesa dai clienti — apri la coda revisioni.</small>
          </span>
          <span className="pb-pending-link">Apri richieste <ExternalLink className="h-4 w-4" /></span>
        </button>
      )}

      <div className="pb-list-toolbar">
        <div className="pb-toolbar-title"><span>ALBUM ATTIVI</span><i aria-hidden="true" /></div>
        <div className="pb-toolbar-controls">
          <label className="pb-search">
            <Search className="h-4 w-4" aria-hidden="true" />
            <Input
              value={bookSearch}
              onChange={(event) => setBookSearch(event.target.value)}
              placeholder="Cerca album, cliente o galleria"
              aria-label="Cerca fotolibri"
            />
            {bookSearch && <button type="button" onClick={() => setBookSearch('')} aria-label="Cancella ricerca"><X className="h-4 w-4" /></button>}
          </label>
          <div className="pb-filter">
            <Filter className="h-4 w-4" aria-hidden="true" />
            <Select value={bookFilter} onValueChange={(value) => setBookFilter(value as typeof bookFilter)}>
              <SelectTrigger aria-label="Filtra fotolibri"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="attention">Con modifiche richieste</SelectItem>
                <SelectItem value="approved">Approvati</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12" role="status" aria-label="Caricamento fotolibri">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : books.length === 0 ? (
        <div className="pb-empty"><BookImage className="h-8 w-8" /><strong>Nessun fotolibro ancora creato.</strong><span>Usa “Nuovo fotolibro” per iniziare.</span></div>
      ) : (
        <div className="pb-page-content">
          {activeBooks.length > 0 ? (
            <div className="pb-active-sections">
              <section className="pb-book-section" data-testid="section-linked-photobooks">
                <div className="pb-section-heading">
                  <div><h2>Collegati a un lavoro</h2><p>Album associati a una galleria o a un incarico dello studio.</p></div>
                  <span>{visibleLinkedBooks.length.toString().padStart(2, '0')}</span>
                </div>
                <div className="pb-book-list">
                  {visibleLinkedBooks.length ? visibleLinkedBooks.map(renderBook) : <div className="pb-section-empty">Nessun fotolibro corrisponde ai filtri.</div>}
                </div>
              </section>
              <section className="pb-book-section" data-testid="section-standalone-photobooks">
                <div className="pb-section-heading">
                  <div><h2>Autonomi</h2><p>Album indipendenti, con pagine caricate direttamente nell’editor.</p></div>
                  <span>{visibleStandaloneBooks.length.toString().padStart(2, '0')}</span>
                </div>
                <div className="pb-book-list">
                  {visibleStandaloneBooks.length ? visibleStandaloneBooks.map(renderBook) : <div className="pb-section-empty">Nessun fotolibro corrisponde ai filtri.</div>}
                </div>
              </section>
            </div>
          ) : (
            <div className="pb-empty"><BookImage className="h-8 w-8" /><strong>Nessun album attivo.</strong><span>Gli album bloccati restano nella coda di stampa.</span></div>
          )}
          {archivedBooks.length > 0 && (
            <section className="pb-print-queue" data-testid="section-archived-photobooks">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="pb-queue-toggle"
                aria-expanded={showArchived}
                data-testid="button-toggle-archived"
              >
                {showArchived ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="pb-queue-icon"><Printer className="h-4 w-4" /></span>
                <span className="pb-queue-title"><strong>Coda di stampa</strong><small>Album con modifiche bloccate</small></span>
                <span className="pb-queue-count">{archivedBooks.length}</span>
              </button>
              {showArchived && (
                <div className="pb-queue-content">
                  <p className="pb-queue-note">
                    Il blocco impedisce al cliente di modificare l’album, ma non conferma che
                    l’email sia stata inviata. Se non risulta ancora inviata, controlla lo stato
                    e completa l’invio dal riquadro “Spedizione laboratorio”.
                  </p>
                  {archivedLinkedBooks.length > 0 && (
                    <section className="pb-archived-group" data-testid="section-archived-linked-photobooks">
                      <h4>Collegati</h4>
                      <div className="pb-book-list">
                        {archivedLinkedBooks.map(renderBook)}
                      </div>
                    </section>
                  )}
                  {archivedStandaloneBooks.length > 0 && (
                    <section className="pb-archived-group" data-testid="section-archived-standalone-photobooks">
                      <h4>Autonomi</h4>
                      <div className="pb-book-list">
                        {archivedStandaloneBooks.map(renderBook)}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Dialog creazione */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nuovo Fotolibro</DialogTitle>
            <DialogDescription>
              Scegli se collegarlo a un lavoro e a una galleria oppure gestirlo come fotolibro autonomo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo di fotolibro">
              <Button
                type="button"
                variant={createMode === 'linked' ? 'default' : 'outline'}
                onClick={() => setCreateMode('linked')}
                data-testid="button-photobook-mode-linked"
              >
                Collegato
              </Button>
              <Button
                type="button"
                variant={createMode === 'standalone' ? 'default' : 'outline'}
                onClick={() => {
                  setCreateMode('standalone');
                  setNewGalleryId('');
                  setNewJobId('');
                  setAssociationMismatchConfirmed(false);
                }}
                data-testid="button-photobook-mode-standalone"
              >
                Autonomo
              </Button>
            </div>
            {createMode === 'standalone' && (
              <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                Non serve un lavoro né una galleria. Carica le pagine già impaginate nell’editor;
                senza galleria non sarà disponibile la selezione di foto sostitutive.
              </p>
            )}
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
            {createMode === 'linked' && <div className="space-y-2">
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
            </div>}
            {createMode === 'linked' && <div className="space-y-2">
              <Label>Lavoro associato</Label>
              <JobPicker
                jobs={jobs}
                value={newJobId}
                onChange={selectJobForPhotobook}
                loading={jobsLoading}
                allowNone={false}
                placeholder="Seleziona il lavoro"
                testId="select-photobook-job"
              />
              {selectedCreateJob && !photobookJobHasLinkedGalleries(selectedCreateJob) && (
                <p className="text-xs text-amber-700 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Questo lavoro non ha ancora gallerie associate: seleziona manualmente la galleria
                  da usare per il fotolibro.
                </p>
              )}
              {selectedCreateGalleryBelongsToJob && (
                <p className="text-xs text-green-700 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Galleria associata automaticamente a questo lavoro
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
            </div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Annulla
            </Button>
            <Button
              disabled={
                !newName.trim() ||
                (createMode === 'linked' && (!newGalleryId || !newJobId)) ||
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
                    {shipmentNeedsJobSelection && (
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
                    {!lockTarget?.jobId && !lockTarget?.galleryId && (
                      <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                        Fotolibro autonomo: la spedizione non sarà collegata a un lavoro e non includerà
                        note o foto provenienti da un job.
                      </p>
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
                    {(selectedShipJob || !lockTarget?.jobId) && (
                      <div className="space-y-3 rounded-md border p-3">
                        <div>
                          <Label htmlFor="ship-lab-note">Note per il laboratorio</Label>
                          <p className="text-xs text-muted-foreground mt-1">
                            {selectedShipJob
                              ? 'È una copia iniziale della nota del lavoro. Puoi modificarla liberamente: la nota originale non verrà aggiornata.'
                              : 'Aggiungi istruzioni per questa spedizione; saranno salvate solo sulla consegna al laboratorio.'}
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

                        {(selectedShipJob?.notePerFoto || []).length > 0 && (
                          <div className="space-y-2">
                            <p className="text-sm font-medium">
                              Note con foto del lavoro ({selectedShipJob?.notePerFoto?.length})
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Seleziona solo quelle da copiare nella cartella Drive del laboratorio.
                              Anche il loro testo può essere modificato per questa spedizione.
                            </p>
                            {selectedShipJob?.notePerFoto?.map((photoNote, index) => {
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
                    (createShip &&
                      shipmentNeedsJobSelection &&
                      (!selectedShipJobId || !selectedShipJob))
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
                    : 'Manda in stampa'}
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
function PhotobookShipmentInfo({
  shipmentId,
  book,
  expanded,
  onExpandedChange,
}: {
  shipmentId: string;
  book: Photobook;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const { toast } = useToast();
  const [supplementalUploading, setSupplementalUploading] = useState(false);
  const [archivedPageBusyId, setArchivedPageBusyId] = useState<string | null>(null);
  const { data: shipment, isLoading, isError, error, refetch } = useQuery<LabShipment>({
    queryKey: ['/api/lab-shipments', shipmentId],
    queryFn: () => getShipment(shipmentId),
    staleTime: 0,
    refetchOnMount: 'always',
    // Trasferimento in background in corso: polla l'avanzamento ogni 2.5s
    refetchInterval: (query) =>
      query.state.data?.pageTransfer?.status === 'running' || query.state.data?.mockupTransfer?.status === 'uploading' || query.state.data?.mockupDispatching ? 2500 : false,
  });
  const { data: availableLabs = [], isError: labsError, refetch: reloadLabs } = useQuery<Lab[]>({
    queryKey: ['photobook-shipment-labs'],
    queryFn: () => getAllLabs(true),
    staleTime: 60 * 1000,
  });
  const labMutation = useMutation({
    mutationFn: (labId: string) => updateShipment(shipmentId, { labId }),
    onSuccess: updated => {
      queryClient.setQueryData(['/api/lab-shipments', shipmentId], updated);
      void refetch();
    },
    onError: (e: Error) => toast({ title: 'Laboratorio non aggiornato', description: e.message, variant: 'destructive' }),
  });
  const resolveMutation = useMutation({
    mutationFn: async (delivered: boolean) => {
      const { apiRequest } = await import('@/lib/queryClient');
      const response = await apiRequest('POST', `/api/lab-shipments/${shipmentId}/resolve-photobook-send`, { delivered });
      if (!response.ok) throw new Error('Impossibile registrare la verifica. Riprova.');
      return await response.json() as LabShipment;
    },
    onSuccess: updated => {
      queryClient.setQueryData(['/api/lab-shipments', shipmentId], updated);
      void refetch();
    },
    onError: (e: Error) => toast({ title: 'Verifica non salvata', description: e.message, variant: 'destructive' }),
  });
  const archiveObsoleteMutation = useMutation({
    mutationFn: async ({ confirmSentShipment, recoverAbandoned }: { confirmSentShipment: boolean; recoverAbandoned: boolean }) => {
      const { apiRequest } = await import('@/lib/queryClient');
      const response = await apiRequest('POST', `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`, {
        confirm: true,
        confirmSentShipment,
        recoverAbandoned,
      });
      return await response.json() as LabShipment;
    },
    onSuccess: updated => {
      queryClient.setQueryData(['/api/lab-shipments', shipmentId], updated);
      void refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/photobooks'] });
      toast({
        title: 'Pagine obsolete archiviate',
        description: 'Sono state spostate in una cartella privata; le pagine correnti e gli allegati restano nella spedizione.',
      });
    },
    onError: (e: Error) => {
      void refetch();
      toast({ title: 'Archiviazione non completata', description: e.message, variant: 'destructive' });
    },
  });
  const accessArchivedPage = async (file: NonNullable<LabShipment['archivedPhotobookPages']>[number], action: 'open' | 'download') => {
    const popup = action === 'open' ? window.open('about:blank', '_blank') : null;
    if (popup) popup.opener = null;
    setArchivedPageBusyId(file.driveFileId);
    try {
      const { apiRequest } = await import('@/lib/queryClient');
      const url = `/api/lab-shipments/${encodeURIComponent(shipmentId)}/archived-pages/${encodeURIComponent(file.driveFileId)}${action === 'download' ? '?download=true' : ''}`;
      const response = await apiRequest('GET', url);
      const objectUrl = URL.createObjectURL(await response.blob());
      if (action === 'open' && popup) {
        popup.location.href = objectUrl;
      } else {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      popup?.close();
      toast({
        title: action === 'open' ? 'Originale non disponibile' : 'Download non riuscito',
        description: error instanceof Error ? error.message : 'Riprova tra poco.',
        variant: 'destructive',
      });
    } finally {
      setArchivedPageBusyId(null);
    }
  };

  const retryMutation = useMutation({
    mutationFn: (recoverAbandoned: boolean = false) => createPhotobookLabShipment(book.id, { recoverAbandoned }),
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
      queryClient.setQueryData(['/api/lab-shipments', shipmentId], updated);
      queryClient.invalidateQueries({ queryKey: ['/api/lab-shipments', shipmentId] });
      queryClient.invalidateQueries({ queryKey: ['/api/lab-shipments/job'] });
      queryClient.invalidateQueries({ queryKey: ['recent-lab-shipments'] });
      toast({
        title: 'Email inviata al laboratorio',
        description: `Email inviata${updated.labNome ? ` a ${updated.labNome}` : ''} con il link Google Drive ai file di stampa.`,
      });
    },
    onError: (e: any) => {
      void refetch();
      toast({ title: 'Errore invio email', description: e.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Caricamento spedizione…
      </div>
    );
  }
  if (isError || !shipment) return (
    <div role="alert" className="mt-3 rounded border border-destructive p-3 text-sm space-y-2">
      <p>Impossibile caricare la spedizione laboratorio. Il fotolibro resta disponibile.</p>
      <p>{error instanceof Error ? error.message : 'Spedizione non disponibile.'}</p>
      <Button size="sm" variant="outline" onClick={() => void refetch()}>Riprova caricamento spedizione</Button>
    </div>
  );

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
  const transferAbandoned = shipment.photobookRecovery?.pageTransferAbandoned === true;
  const cleanup = shipment.photobookPageCleanup;
  const obsoletePages = shipment.obsoletePhotobookPages || [];
  const missingPages = shipment.missingPhotobookPages || [];
  const cleanupAbandoned = shipment.photobookRecovery?.pageCleanupAbandoned === true;
  const cleanupNeedsAttention = cleanup?.status === 'running' || cleanup?.status === 'needs_review'
    || (cleanup?.status === 'completed' && cleanup.instructionsUpdated === false);
  const shipmentAlreadySent = !!shipment.sentAt || ['inviato', 'in_stampa', 'ricevuto'].includes(shipment.status);
  const dispatchAbandoned = shipment.photobookRecovery?.dispatchAbandoned === true;
  const incomplete =
    !transferRunning && !shipment.deletedFromDrive &&
    (pageCount < 1 || pageFilesCount < pageCount ||
      (shipment.photobookVersion !== undefined && shipment.photobookVersion !== book.currentVersion) ||
      obsoletePages.length > 0 || missingPages.length > 0 ||
      shipment.drivePageVerification?.status === 'failed' ||
      !!transfer?.instructionsError ||
      (!!transfer && (transfer.status !== 'completed' || !!transfer.failed?.length)));
  const selectedLabValid = availableLabs.some(lab => lab.id === shipment.labId && !!lab.email?.trim());
  const shipmentSummaryStatus = expired
    ? 'File scaduti'
    : dispatchAbandoned
      ? 'Email da verificare'
      : shipment.mockupDispatching || transferRunning
        ? 'Preparazione in corso'
        : shipmentAlreadySent
          ? 'Email inviata'
          : incomplete
            ? 'File da completare'
            : 'Pronta per invio';

  return (
    <details
      className="pb-shipment-details"
      data-testid="photobook-shipment-details"
      open={expanded}
      onToggle={(event) => onExpandedChange(event.currentTarget.open)}
    >
      <summary className="pb-shipment-summary">
        <span className="pb-shipment-summary-main">
          <Truck className="h-4 w-4 shrink-0" />
          <span className="pb-shipment-summary-copy">
            <span className="pb-shipment-summary-title">Spedizione laboratorio</span>
            <span className="pb-shipment-summary-meta">
              {pageFilesCount}/{pageCount} pagine
              {shipment.labNome ? ` · ${shipment.labNome}` : ''}
              {supplementalFiles.length ? ` · ${supplementalFiles.length} file aggiuntivi` : ''}
            </span>
          </span>
        </span>
        <span className="pb-shipment-summary-status">{shipmentSummaryStatus}</span>
        <span className="pb-shipment-summary-toggle">
          Gestisci
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </span>
      </summary>
      <div className="pb-shipment-panel-body">
      <div className="pb-shipment-panel-content">
      <div className="font-medium flex flex-wrap items-center gap-1.5">
        <span>Spedizione laboratorio</span>
        <Badge variant="secondary">
          {LAB_SHIPMENT_STATUS_LABELS[shipment.status] || shipment.status}
        </Badge>
        {expired && (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {shipment.deletedFromDrive ? 'File eliminati da Drive' : 'File scaduti'}
          </Badge>
        )}
      </div>
      <p className="text-xs" role="status">
        {dispatchAbandoned ? 'Invio interrotto o con esito incerto: verifica manuale necessaria.'
          : shipment.mockupDispatching ? 'Invio email in corso o verifica del blocco in attesa: nessun nuovo invio consentito.'
          : cleanup?.status === 'running' && !cleanupAbandoned ? 'Archiviazione delle pagine obsolete in corso.'
          : cleanupAbandoned ? 'Archiviazione interrotta: verifica la cartella privata e recupera l’operazione.'
          : cleanup?.status === 'needs_review' || (cleanup?.status === 'completed' && cleanup.instructionsUpdated === false)
            ? 'Archiviazione interrotta: puoi riprenderla senza inviare email.'
          : transferAbandoned ? 'Trasferimento interrotto: è disponibile il recupero manuale.'
          : shipmentAlreadySent ? 'Email al laboratorio inviata.'
          : transferRunning ? transfer?.phase === 'verifying'
            ? 'Verifica di tutte le pagine effettivamente presenti su Drive · email non inviata.'
            : transfer?.phase === 'instructions'
              ? 'Pagine verificate · aggiornamento delle istruzioni per il laboratorio.'
              : `Verifica e trasferimento${transfer?.currentPageNumber ? ` · pagina ${transfer.currentPageNumber}` : ''} · email non inviata.`
          : incomplete ? 'Trasferimento incompleto · invio email bloccato.'
          : 'Spedizione pronta · email non ancora inviata.'}
      </p>
      {dispatchAbandoned && (
        <div className="rounded border border-amber-400 p-2 space-y-2">
          <p>Verifica la posta inviata o contatta il laboratorio prima di procedere, per evitare doppioni.</p>
          <Button size="sm" variant="outline" disabled={resolveMutation.isPending} onClick={() => {
            if (window.confirm('Hai verificato che il laboratorio ha ricevuto l’email?')) resolveMutation.mutate(true);
          }}>Ho verificato: email ricevuta</Button>
          <Button size="sm" variant="outline" disabled={resolveMutation.isPending} onClick={() => {
            if (window.confirm('Hai verificato che l’email NON è stata inviata? Il nuovo tentativo potrebbe duplicarla se la verifica è errata.')) resolveMutation.mutate(false);
          }}>Ho verificato: email non inviata</Button>
        </div>
      )}
      {labsError ? <p role="alert">Impossibile verificare il laboratorio. <button className="underline" onClick={() => void reloadLabs()}>Riprova</button></p> : (
        <label className="block text-xs">
          Laboratorio destinatario
          <select className="block w-full rounded border p-2 mt-1" value={shipment.labId || ''}
            disabled={labMutation.isPending || !!shipment.mockupDispatching || !!shipment.mockupSnapshot}
            onChange={event => { if (event.target.value) labMutation.mutate(event.target.value); }}>
            <option value="">Seleziona un laboratorio</option>
            {!selectedLabValid && shipment.labId && <option value={shipment.labId}>Laboratorio non disponibile: scegline un altro</option>}
            {availableLabs.filter(lab => !!lab.email?.trim()).map(lab => <option key={lab.id} value={lab.id}>{lab.nome}</option>)}
          </select>
          {!selectedLabValid && <span className="text-destructive">Seleziona un laboratorio attivo con email valida prima di inviare.</span>}
          {!selectedLabValid && shipment.mockupSnapshot && <span className="block">Il laboratorio è vincolato al mockup confermato: ripristina i suoi dati in Anagrafica laboratori, oppure correggi il modello dall’editor del fotolibro.</span>}
        </label>
      )}
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
      {(obsoletePages.length > 0 || cleanupNeedsAttention || cleanupAbandoned) && (
        <div role="alert" className="rounded border border-amber-500 bg-amber-50 p-3 space-y-2">
          <p className="font-medium text-amber-950">
            {obsoletePages.length === 1
              ? 'La cartella contiene un originale di pagina superato.'
              : `La cartella contiene ${obsoletePages.length} originali di pagina superati.`}
            {' '}L’invio email è bloccato finché non vengono sistemati.
          </p>
          <ul className="list-disc pl-5 text-xs text-amber-950">
            {obsoletePages.map(file => (
              <li key={file.driveFileId}>
                {file.pageNumber ? `Pagina ${file.pageNumber}: ` : ''}{file.name}
              </li>
            ))}
          </ul>
          {shipmentAlreadySent && (
            <p className="text-xs text-amber-950">
              Questa spedizione è già stata inviata. L’archiviazione cambierà i file visibili nella cartella condivisa e richiede la tua autorizzazione esplicita.
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={archiveObsoleteMutation.isPending || transferRunning || !!shipment.mockupDispatching}
            onClick={() => {
              const sentConsent = shipmentAlreadySent;
              const message = obsoletePages.length === 0
                ? 'Riprendere la sistemazione interrotta? Nessun file verrà cancellato e non verrà inviata alcuna email.'
                : sentConsent
                ? `La spedizione è già stata inviata. Confermi di spostare ${obsoletePages.length} originale/i obsoleto/i dalla cartella condivisa a una cartella privata di archivio? Non verrà inviata alcuna email.`
                : `Confermi di spostare ${obsoletePages.length} originale/i obsoleto/i fuori dalla cartella del laboratorio? Le pagine correnti e gli allegati resteranno. Non verrà inviata alcuna email.`;
              if (window.confirm(message)) {
                archiveObsoleteMutation.mutate({
                  confirmSentShipment: sentConsent,
                  recoverAbandoned: cleanupAbandoned,
                });
              }
            }}
            data-testid={`button-archive-obsolete-pages-${book.id}`}
          >
            {archiveObsoleteMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5 mr-1.5" />
            )}
            {cleanupAbandoned || cleanupNeedsAttention ? 'Riprendi archiviazione interrotta'
              : obsoletePages.length ? 'Archivia pagine obsolete' : 'Completa sistemazione'}
          </Button>
        </div>
      )}
      {cleanup?.status === 'running' && !cleanupAbandoned && (
        <p className="text-xs text-muted-foreground" role="status">Spostamento delle pagine obsolete nella cartella privata…</p>
      )}
      {cleanup?.status === 'needs_review' && (
        <p className="text-xs text-destructive" role="alert">
          {cleanup.error || 'L’archiviazione non è stata completata.'} I file non sono stati cancellati; puoi ripetere l’azione.
        </p>
      )}
      {(shipment.archivedPhotobookPages || []).length > 0 && (
        <section className="rounded border bg-background p-3 space-y-2" aria-label="Originali archiviati">
          <div>
            <p className="font-medium">Originali archiviati</p>
            <p className="text-xs text-muted-foreground">
              Accesso riservato agli amministratori. Il laboratorio non può aprire questi file.
            </p>
          </div>
          <ul className="space-y-2">
            {[...(shipment.archivedPhotobookPages || [])]
              .sort((a, b) => (tsToDate(b.archivedAt)?.getTime() || 0) - (tsToDate(a.archivedAt)?.getTime() || 0))
              .map(file => {
                const archivedAt = tsToDate(file.archivedAt);
                const busy = archivedPageBusyId === file.driveFileId;
                return (
                  <li
                    key={file.driveFileId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/50 px-2.5 py-2 text-xs"
                    data-testid={`archived-photobook-page-${file.driveFileId}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className="text-muted-foreground">
                        {file.sourcePageNumber ? `Pagina ${file.sourcePageNumber} · ` : ''}
                        Archiviato il {archivedAt ? archivedAt.toLocaleString('it-IT') : 'data non disponibile'}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void accessArchivedPage(file, 'open')}
                        aria-label={`Apri ${file.name}`}
                        data-testid={`button-open-archived-page-${file.driveFileId}`}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                        <span className="ml-1">Apri</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void accessArchivedPage(file, 'download')}
                        aria-label={`Scarica ${file.name}`}
                        data-testid={`button-download-archived-page-${file.driveFileId}`}
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span className="ml-1">Scarica</span>
                      </Button>
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      )}
      <div className="rounded border bg-background p-3 space-y-2">
        <div className="space-y-3">
          <div>
            <p className="font-medium">File originali per la stampa</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Il mockup confermato e le sue anteprime leggere vengono allegati automaticamente come riferimento.
              Dopo aver confermato il mockup, carica qui le foto originali ad alta risoluzione necessarie per copertina o retro.
              I file vengono trasferiti senza compressione nella cartella Drive del laboratorio. Puoi aggiungere anche PDF tecnici.
            </p>
          </div>
          {!expired && (
            <LabFileUploader
              shipmentId={shipmentId}
              kind="supplemental"
              label="Carica originali e file stampa"
              disabled={transferRunning || sendMutation.isPending || shipment.mockupDispatching
                || ['uploading', 'needs_review'].includes(shipment.mockupTransfer?.status || '')}
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
      </div>
      <LabSendFeedback shipment={shipment} pending={sendMutation.isPending} error={sendMutation.error} />
      {transfer?.instructionsError && <p role="alert" className="text-xs text-destructive">{transfer.instructionsError} Riprendi la preparazione: le pagine già verificate non saranno ricopiate.</p>}
      {shipment.drivePageVerification?.status === 'failed' && (
        <p role="alert" className="text-xs text-destructive">{shipment.drivePageVerification.error} L’email al laboratorio resta bloccata.</p>
      )}
      {transferRunning && !transferAbandoned && transfer && (
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
      {transferAbandoned && (
        <div role="alert" className="rounded border border-amber-400 p-2 space-y-2">
          <p>Il trasferimento non riceve più aggiornamenti. Puoi recuperarlo senza inviare email al laboratorio.</p>
          <Button size="sm" variant="outline" disabled={retryMutation.isPending || !!shipment.mockupDispatching}
            onClick={() => {
              if (window.confirm('Recuperare il trasferimento interrotto? Verranno copiate solo le pagine mancanti. Il server controllerà di nuovo che il trasferimento non sia attivo.')) retryMutation.mutate(true);
            }}>Recupera trasferimento interrotto</Button>
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
      <div className="pb-shipment-actions flex flex-wrap items-center gap-2 pt-1">
        {shipment.shareableLink && !shipment.deletedFromDrive && (
          <Button size="sm" variant="outline" asChild>
            <a href={shipment.shareableLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Apri cartella Drive
            </a>
          </Button>
        )}
        {shipment.shareableLink && !shipment.deletedFromDrive && (
          <span className="text-xs text-muted-foreground">Su Drive: ordina per Nome, crescente (A → Z), per vedere le pagine nell’ordine del fotolibro.</span>
        )}
        {shipment.shareableLink &&
          !shipment.deletedFromDrive &&
          !transferRunning &&
          shipment.labId && (
            <Button
              size="sm"
              variant={shipment.sentAt ? 'outline' : 'default'}
              disabled={sendMutation.isPending || supplementalUploading || expired || incomplete || !selectedLabValid || shipment.mockupDispatching || obsoletePages.length > 0 || cleanupNeedsAttention
                || ['uploading', 'needs_review'].includes(shipment.mockupTransfer?.status || '')}
              onClick={() => sendMutation.mutate()}
              data-testid="button-send-lab-email"
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1.5" />
              )}
              {sendMutation.isPending ? 'Invio email in corso…' : shipment.sentAt
                ? 'Reinvia email al laboratorio'
                : 'Invia email al laboratorio'}
            </Button>
          )}
        {incomplete && obsoletePages.length === 0 && !cleanupNeedsAttention && (
          <Button
            size="sm"
            variant="outline"
            disabled={retryMutation.isPending || !!shipment.mockupDispatching}
            onClick={() => retryMutation.mutate(false)}
            data-testid={`button-retry-shipment-${book.id}`}
          >
            {retryMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            {transfer?.instructionsError ? 'Aggiorna istruzioni di stampa' : 'Riprova pagine mancanti'}
          </Button>
        )}
        {!incomplete && !transferRunning && !expired && pageFilesCount > 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            Tutte le pagine trasferite
          </span>
        )}
      </div>
      </div>
      </div>
    </details>
  );
}
