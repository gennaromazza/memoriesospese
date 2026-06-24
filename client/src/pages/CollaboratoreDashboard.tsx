
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCollaboratorByToken, respondToAssignmentPublic } from '@/lib/collaboratori';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Calendar, MapPin, Euro, Check, X, Loader2, Clock, ChevronLeft, ChevronRight, User, Phone, Mail, Package, ClipboardList, ChevronDown, ExternalLink, MessageCircle, Info, FileText, Users, Film, FolderCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { JobAcceptanceStatus, JobCollaboratoreAssignment, CollaboratorPayment, AssignedProduct, MontaggioStatus, ConsegnaFileStatus } from '@shared/collaboratori-types';
import { MONTAGGIO_STATUS_LABELS, CONSEGNA_FILE_STATUS_LABELS } from '@shared/collaboratori-types';
import { convertFirestoreTimestamp } from '@/lib/firebase';
import { formatPhoneForWhatsApp } from '@shared/phone-utils';

const STATUS_LABELS = {
  pending: { label: '⏳ In Attesa', variant: 'secondary' as const },
  accepted: { label: '✅ Accettato', variant: 'default' as const },
  declined: { label: '❌ Rifiutato', variant: 'destructive' as const },
};

const RUOLI_LABELS: Record<string, string> = {
  fotografo_secondario: '📷 Fotografo Secondario',
  videomaker: '🎥 Videomaker',
  assistente: '🤝 Assistente',
  photo_editor: '🎨 Photo Editor',
  album_designer: '📚 Album Designer',
  altro: '👤 Altro',
};

const MONTAGGIO_BADGE_CLASS: Record<MontaggioStatus, string> = {
  non_richiesto: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  richiesto: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  in_lavorazione: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  consegnato: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
};

const CONSEGNA_FILE_BADGE_CLASS: Record<ConsegnaFileStatus, string> = {
  in_attesa: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  consegnati: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  archiviati: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
};

interface ClienteInfo {
  id: string;
  nome?: string;
  cognome?: string;
  email?: string;
  cellulare?: string;
  whatsapp?: string;
  indirizzo?: string;
  citta?: string;
  isPrimary?: boolean;
}

interface AssignmentWithJob extends JobCollaboratoreAssignment {
  job?: {
    id: string;
    nomeEvento?: string;
    eventDate?: any;
    eventLocation?: string;
    jobType?: string;
    stato?: string;
    note?: string;
    jobDataValues?: Record<string, any>;
    locationRicevimento?: string;
    oraRicevimento?: string;
    oraCerimonia?: string;
    locationCerimonia?: string;
  } | null;
  cliente?: ClienteInfo | null;
  clienti?: ClienteInfo[];
  prodottiAssegnati?: AssignedProduct[];
  mansioniAssegnate?: string[];
}

export default function CollaboratoreDashboard() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<JobAcceptanceStatus | 'all'>('all');
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState('');
  const [processingAssignmentId, setProcessingAssignmentId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'lavori' | 'montaggi'>('lavori');
  const itemsPerPage = 10;

  const { data, isLoading, error } = useQuery({
    queryKey: ['collaborator-dashboard', token],
    queryFn: () => getCollaboratorByToken(token!),
    enabled: !!token,
  });

  const acceptMutation = useMutation({
    mutationFn: (assignmentId: string) => respondToAssignmentPublic(assignmentId, 'accept'),
    onMutate: (assignmentId) => {
      setProcessingAssignmentId(assignmentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborator-dashboard', token] });
      toast({ title: '✅ Lavoro accettato con successo!' });
      setProcessingAssignmentId(null);
    },
    onError: () => {
      toast({ title: '❌ Errore durante l\'accettazione', variant: 'destructive' });
      setProcessingAssignmentId(null);
    }
  });

  const declineMutation = useMutation({
    mutationFn: ({ assignmentId, note }: { assignmentId: string; note: string }) => 
      respondToAssignmentPublic(assignmentId, 'decline', note),
    onMutate: ({ assignmentId }) => {
      setProcessingAssignmentId(assignmentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborator-dashboard', token] });
      toast({ title: 'Lavoro rifiutato' });
      setDeclineDialogOpen(false);
      setDeclineNote('');
      setSelectedAssignmentId(null);
      setProcessingAssignmentId(null);
    },
    onError: () => {
      toast({ title: '❌ Errore durante il rifiuto', variant: 'destructive' });
      setProcessingAssignmentId(null);
    }
  });

  const handleDecline = (assignmentId: string) => {
    setSelectedAssignmentId(assignmentId);
    setDeclineDialogOpen(true);
  };

  const confirmDecline = () => {
    if (selectedAssignmentId) {
      declineMutation.mutate({ assignmentId: selectedAssignmentId, note: declineNote });
    }
  };

  const getJobDate = (job: AssignmentWithJob['job']): Date | null => {
    if (!job?.eventDate) return null;
    return convertFirestoreTimestamp(job.eventDate);
  };

  const getGoogleMapsLink = (location: string | undefined) => {
    if (!location) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Caricamento...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-destructive">
              ❌ Link non valido o scaduto
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { collaboratore, assignments } = data;

  const getEventDate = (assignment: AssignmentWithJob): Date | null => {
    const job = (assignment as AssignmentWithJob).job;
    if (!job?.eventDate) return null;
    return convertFirestoreTimestamp(job.eventDate);
  };

  const sortedAndFilteredAssignments = (statusFilter === 'all'
    ? assignments
    : assignments.filter((a: JobCollaboratoreAssignment) => a.status === statusFilter)
  ).sort((a: AssignmentWithJob, b: AssignmentWithJob) => {
    const dateA = getEventDate(a);
    const dateB = getEventDate(b);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA.getTime() - dateB.getTime();
  });

  const totalPages = Math.ceil(sortedAndFilteredAssignments.length / itemsPerPage);
  const paginatedAssignments = sortedAndFilteredAssignments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const filteredAssignments = sortedAndFilteredAssignments;

  // Data di assegnazione del montaggio: priorità a montaggioRichiestoAt,
  // fallback al primo aggiornamento di stato registrato.
  const getMontaggioAssignedDate = (a: AssignmentWithJob): Date | null => {
    if (a.montaggioRichiestoAt) return convertFirestoreTimestamp(a.montaggioRichiestoAt);
    if (Array.isArray(a.montaggioUpdates) && a.montaggioUpdates.length > 0) {
      return convertFirestoreTimestamp(a.montaggioUpdates[0].data);
    }
    return null;
  };

  // Montaggi "chiamati in produzione": montaggio richiesto (qualsiasi stato != non_richiesto),
  // ordinati per data di assegnazione crescente (i più vecchi da fare prima).
  const sortedMontaggi = (assignments as AssignmentWithJob[])
    .filter((a) => a.montaggioStatus && a.montaggioStatus !== 'non_richiesto')
    .sort((a, b) => {
      const dateA = getMontaggioAssignedDate(a);
      const dateB = getMontaggioAssignedDate(b);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA.getTime() - dateB.getTime();
    });

  // Helper per verificare se un assignment è accettato (case-insensitive)
  const isAccepted = (status: string | undefined) => {
    if (!status) return false;
    const normalized = status.toLowerCase();
    return normalized === 'accepted' || normalized === 'accettato';
  };

  // Guadagni: solo lavori accettati
  const totalCompensoPending = assignments
    .filter((a: JobCollaboratoreAssignment) => isAccepted(a.status))
    .reduce((sum: number, a: JobCollaboratoreAssignment) => sum + (a.compenso || 0), 0);

  // Pagamenti: da TUTTI i lavori (l'admin potrebbe pagare prima dell'accettazione)
  const totalPagato = assignments
    .reduce((sum: number, a: JobCollaboratoreAssignment) => {
      const pagatoAssignment = a.pagamenti?.reduce((s: number, p: CollaboratorPayment) => s + p.importo, 0) || 0;
      return sum + pagatoAssignment;
    }, 0);

  // Da ricevere: guadagni accettati - pagamenti ricevuti
  const totalResiduo = totalCompensoPending - totalPagato;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              👤 Dashboard Collaboratore
            </CardTitle>
            <p className="text-muted-foreground">
              {collaboratore.cognome} {collaboratore.nome} • {collaboratore.email}
            </p>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>📊 Riepilogo Finanziario</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <div className="text-sm text-muted-foreground">Guadagni Totali (Accettati)</div>
                <div className="text-2xl font-bold">€{totalCompensoPending.toFixed(2)}</div>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <div className="text-sm text-muted-foreground">Pagamenti Ricevuti</div>
                <div className="text-2xl font-bold text-green-600">€{totalPagato.toFixed(2)}</div>
              </div>
              <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                <div className="text-sm text-muted-foreground">Da Ricevere</div>
                <div className="text-2xl font-bold text-orange-600">€{totalResiduo.toFixed(2)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs
          value={sortedMontaggi.length === 0 ? 'lavori' : activeTab}
          onValueChange={(v) => setActiveTab(v as 'lavori' | 'montaggi')}
          className="w-full"
        >
          {sortedMontaggi.length > 0 && (
            <TabsList className="mb-4" data-testid="tabs-dashboard">
              <TabsTrigger value="lavori" data-testid="tab-lavori">📋 Lavori Assegnati</TabsTrigger>
              <TabsTrigger value="montaggi" data-testid="tab-montaggi">🎬 Montaggi ({sortedMontaggi.length})</TabsTrigger>
            </TabsList>
          )}
          <TabsContent value="lavori" className="mt-0">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>📋 Lavori Assegnati ({filteredAssignments.length})</CardTitle>
              <div className="flex gap-2" data-testid="filters-status">
                <Button
                  size="sm"
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
                  data-testid="filter-all"
                >
                  Tutti
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === 'pending' ? 'default' : 'outline'}
                  onClick={() => { setStatusFilter('pending'); setCurrentPage(1); }}
                  data-testid="filter-pending"
                >
                  In Attesa
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === 'accepted' ? 'default' : 'outline'}
                  onClick={() => { setStatusFilter('accepted'); setCurrentPage(1); }}
                  data-testid="filter-accepted"
                >
                  Accettati
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === 'declined' ? 'default' : 'outline'}
                  onClick={() => { setStatusFilter('declined'); setCurrentPage(1); }}
                  data-testid="filter-declined"
                >
                  Rifiutati
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredAssignments.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Nessun lavoro trovato con questo filtro
              </p>
            ) : (
              <>
              <div className="space-y-4">
                {paginatedAssignments.map((assignment: AssignmentWithJob) => {
                  const pagatoAssignment =
                    assignment.pagamenti?.reduce((sum: number, p: CollaboratorPayment) => sum + p.importo, 0) || 0;
                  const residuoAssignment = assignment.compenso - pagatoAssignment;
                  const job = assignment.job;
                  const cliente = assignment.cliente;
                  const eventDate = job?.eventDate ? convertFirestoreTimestamp(job.eventDate) : null;
                  const mapsLink = getGoogleMapsLink(job?.eventLocation);

                  return (
                    <Card key={assignment.id} className="border" data-testid={`card-assignment-${assignment.id}`}>
                      <CardContent className="p-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-lg">
                                {job?.nomeEvento || `Job #${assignment.jobId.slice(0, 8)}`}
                              </h3>
                              <Badge variant={STATUS_LABELS[assignment.status].variant}>
                                {STATUS_LABELS[assignment.status].label}
                              </Badge>
                              <Badge variant="outline">{RUOLI_LABELS[assignment.ruoloInJob] || assignment.ruoloInJob}</Badge>
                              {assignment.ruoloInJob === 'videomaker' && assignment.montaggioStatus && assignment.montaggioStatus !== 'non_richiesto' && (
                                <Badge variant="secondary" data-testid={`badge-montaggio-${assignment.id}`}>
                                  🎬 {MONTAGGIO_STATUS_LABELS[assignment.montaggioStatus]}
                                </Badge>
                              )}
                              {assignment.consegnaFileStatus && assignment.consegnaFileStatus !== 'in_attesa' && (
                                <Badge
                                  className={CONSEGNA_FILE_BADGE_CLASS[assignment.consegnaFileStatus]}
                                  data-testid={`badge-consegna-file-${assignment.id}`}
                                >
                                  📁 {CONSEGNA_FILE_STATUS_LABELS[assignment.consegnaFileStatus]}
                                </Badge>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                              {eventDate && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Calendar className="w-4 h-4" />
                                  {format(eventDate, 'dd MMMM yyyy', { locale: it })}
                                </div>
                              )}
                              {job?.eventLocation && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <MapPin className="w-4 h-4" />
                                  <span className="truncate max-w-[150px]">{job.eventLocation}</span>
                                  {mapsLink && (
                                    <a 
                                      href={mapsLink} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline"
                                      data-testid={`link-maps-${assignment.id}`}
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                <Euro className="w-4 h-4 text-muted-foreground" />
                                <span className="font-semibold">€{assignment.compenso.toFixed(2)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-green-600">+€{pagatoAssignment.toFixed(2)}</span>
                                {residuoAssignment > 0 && (
                                  <span className="text-orange-600">(residuo: €{residuoAssignment.toFixed(2)})</span>
                                )}
                              </div>
                            </div>

                            {((assignment.prodottiAssegnati && assignment.prodottiAssegnati.length > 0) || 
                              (assignment.mansioniAssegnate && assignment.mansioniAssegnate.length > 0)) && (
                              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 space-y-2">
                                {assignment.prodottiAssegnati && assignment.prodottiAssegnati.length > 0 && (
                                  <div>
                                    <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Prodotti da gestire</div>
                                    <div className="flex flex-wrap gap-2">
                                      {assignment.prodottiAssegnati.map((p, idx) => (
                                        <Badge key={idx} variant="secondary" className="gap-1">
                                          <Package className="w-3 h-3" />
                                          {p.label}
                                          {p.qty && p.qty > 1 && ` (x${p.qty})`}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {assignment.mansioniAssegnate && assignment.mansioniAssegnate.length > 0 && (
                                  <div>
                                    <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Mansioni</div>
                                    <div className="flex flex-wrap gap-2">
                                      {assignment.mansioniAssegnate.map((m, idx) => (
                                        <Badge key={idx} variant="outline" className="gap-1">
                                          <ClipboardList className="w-3 h-3" />
                                          {m}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Stato consegna/archiviazione file (sola lettura) */}
                            {assignment.consegnaFileStatus && assignment.consegnaFileStatus !== 'in_attesa' && (
                              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <FolderCheck className="w-4 h-4 text-primary" />
                                  Stato file
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                  {assignment.fileConsegnatiAt && (
                                    <span>
                                      File consegnati il{' '}
                                      <span className="font-medium text-foreground">
                                        {format(convertFirestoreTimestamp(assignment.fileConsegnatiAt) || new Date(), 'dd/MM/yyyy', { locale: it })}
                                      </span>
                                    </span>
                                  )}
                                  {assignment.consegnaFileStatus === 'archiviati' && assignment.fileArchiviatiAt && (
                                    <span>
                                      File archiviati il{' '}
                                      <span className="font-medium text-foreground">
                                        {format(convertFirestoreTimestamp(assignment.fileArchiviatiAt) || new Date(), 'dd/MM/yyyy', { locale: it })}
                                      </span>
                                    </span>
                                  )}
                                </div>
                                {Array.isArray(assignment.consegnaFileUpdates) && assignment.consegnaFileUpdates.length > 0 && (
                                  <Collapsible>
                                    <CollapsibleTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full justify-between text-muted-foreground hover:text-foreground"
                                        data-testid={`button-consegna-file-history-${assignment.id}`}
                                      >
                                        <span className="flex items-center gap-2">
                                          <Info className="w-4 h-4" />
                                          Storico stato file
                                        </span>
                                        <ChevronDown className="w-4 h-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                      </Button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="pt-2 space-y-2">
                                      {[...assignment.consegnaFileUpdates].reverse().map((u, idx) => {
                                        const d = convertFirestoreTimestamp(u.data);
                                        return (
                                          <div key={idx} className="border-l-2 border-primary/30 pl-3 py-1 text-sm">
                                            <div className="font-medium">{CONSEGNA_FILE_STATUS_LABELS[u.status]}</div>
                                            {d && (
                                              <div className="text-xs text-muted-foreground">
                                                {format(d, 'dd/MM/yyyy HH:mm', { locale: it })}
                                              </div>
                                            )}
                                            {u.note && <div className="text-muted-foreground mt-1">{u.note}</div>}
                                          </div>
                                        );
                                      })}
                                    </CollapsibleContent>
                                  </Collapsible>
                                )}
                              </div>
                            )}

                            {/* Sezione espandibile con tutti i dettagli */}
                            <Collapsible>
                              <CollapsibleTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="w-full justify-between text-muted-foreground hover:text-foreground"
                                  data-testid={`button-expand-details-${assignment.id}`}
                                >
                                  <span className="flex items-center gap-2">
                                    <Info className="w-4 h-4" />
                                    Mostra tutti i dettagli evento
                                  </span>
                                  <ChevronDown className="w-4 h-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="pt-3 space-y-4">
                                {/* Sezione Clienti */}
                                {assignment.clienti && assignment.clienti.length > 0 && (
                                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                                    <div className="flex items-center gap-2 text-sm font-medium">
                                      <Users className="w-4 h-4 text-primary" />
                                      Clienti ({assignment.clienti.length})
                                    </div>
                                    <div className="space-y-3">
                                      {assignment.clienti.map((c, idx) => (
                                        <div key={c.id || idx} className="bg-background rounded-lg p-3 border">
                                          <div className="flex flex-wrap items-center gap-2 mb-2">
                                            <span className="font-semibold text-base">
                                              {c.nome} {c.cognome}
                                            </span>
                                            {c.isPrimary && (
                                              <Badge variant="outline" className="text-xs">Principale</Badge>
                                            )}
                                          </div>
                                          <div className="flex flex-wrap gap-3 text-sm">
                                            {c.cellulare && (
                                              <a 
                                                href={`tel:${c.cellulare}`} 
                                                className="flex items-center gap-1 text-primary hover:underline"
                                                data-testid={`link-phone-${c.id}`}
                                              >
                                                <Phone className="w-4 h-4" />
                                                {c.cellulare}
                                              </a>
                                            )}
                                            {c.whatsapp && (
                                              <a 
                                                href={`https://wa.me/${formatPhoneForWhatsApp(c.whatsapp)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-green-600 hover:underline"
                                                data-testid={`link-whatsapp-${c.id}`}
                                              >
                                                <MessageCircle className="w-4 h-4" />
                                                WhatsApp
                                              </a>
                                            )}
                                            {c.email && (
                                              <a 
                                                href={`mailto:${c.email}`} 
                                                className="flex items-center gap-1 text-primary hover:underline"
                                                data-testid={`link-email-${c.id}`}
                                              >
                                                <Mail className="w-4 h-4" />
                                                {c.email}
                                              </a>
                                            )}
                                          </div>
                                          {/* Indirizzo cliente */}
                                          {(c.indirizzo || c.citta) && (
                                            <div className="mt-2 pt-2 border-t text-sm text-muted-foreground">
                                              <div className="flex items-start gap-2">
                                                <MapPin className="w-4 h-4 mt-0.5" />
                                                <div>
                                                  <span>{[c.indirizzo, c.citta].filter(Boolean).join(', ')}</span>
                                                  <a 
                                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.indirizzo, c.citta].filter(Boolean).join(', '))}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ml-2 text-primary hover:underline text-xs"
                                                  >
                                                    Maps
                                                  </a>
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Sezione Dettagli Evento */}
                                {job && (
                                  <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-4 space-y-3">
                                    <div className="flex items-center gap-2 text-sm font-medium">
                                      <FileText className="w-4 h-4 text-amber-600" />
                                      Dettagli Evento
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                      {/* Orario e Location Cerimonia */}
                                      {(job.oraCerimonia || job.locationCerimonia || job.jobDataValues?.oraCerimonia || job.jobDataValues?.locationCerimonia) && (
                                        <div className="bg-background rounded-lg p-3 border">
                                          <div className="text-xs font-medium text-muted-foreground uppercase mb-2">Cerimonia</div>
                                          {(job.oraCerimonia || job.jobDataValues?.oraCerimonia) && (
                                            <div className="flex items-center gap-2 mb-1">
                                              <Clock className="w-4 h-4 text-muted-foreground" />
                                              <span className="font-medium">{job.oraCerimonia || job.jobDataValues?.oraCerimonia}</span>
                                            </div>
                                          )}
                                          {(job.locationCerimonia || job.jobDataValues?.locationCerimonia) && (
                                            <div className="flex items-start gap-2">
                                              <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                                              <div>
                                                <span>{job.locationCerimonia || job.jobDataValues?.locationCerimonia}</span>
                                                <a 
                                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.locationCerimonia || job.jobDataValues?.locationCerimonia || '')}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="ml-2 text-primary hover:underline text-xs"
                                                >
                                                  Maps
                                                </a>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Orario e Location Ricevimento */}
                                      {(job.oraRicevimento || job.locationRicevimento || job.jobDataValues?.oraRicevimento || job.jobDataValues?.locationRicevimento) && (
                                        <div className="bg-background rounded-lg p-3 border">
                                          <div className="text-xs font-medium text-muted-foreground uppercase mb-2">Ricevimento</div>
                                          {(job.oraRicevimento || job.jobDataValues?.oraRicevimento) && (
                                            <div className="flex items-center gap-2 mb-1">
                                              <Clock className="w-4 h-4 text-muted-foreground" />
                                              <span className="font-medium">{job.oraRicevimento || job.jobDataValues?.oraRicevimento}</span>
                                            </div>
                                          )}
                                          {(job.locationRicevimento || job.jobDataValues?.locationRicevimento) && (
                                            <div className="flex items-start gap-2">
                                              <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                                              <div>
                                                <span>{job.locationRicevimento || job.jobDataValues?.locationRicevimento}</span>
                                                <a 
                                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.locationRicevimento || job.jobDataValues?.locationRicevimento || '')}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="ml-2 text-primary hover:underline text-xs"
                                                >
                                                  Maps
                                                </a>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    {/* Altri dati evento (jobDataValues) */}
                                    {job.jobDataValues && Object.keys(job.jobDataValues).length > 0 && (
                                      <div className="pt-2">
                                        <div className="text-xs font-medium text-muted-foreground uppercase mb-2">Altri Dati Evento</div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                          {Object.entries(job.jobDataValues)
                                            .filter(([key]) => !['oraCerimonia', 'locationCerimonia', 'oraRicevimento', 'locationRicevimento'].includes(key))
                                            .map(([key, value]) => (
                                              value && (
                                                <div key={key} className="flex justify-between bg-background rounded p-2 border">
                                                  <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                                                  <span className="font-medium text-right">{String(value)}</span>
                                                </div>
                                              )
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Note - renderizza HTML per supportare <br> e altri tag */}
                                    {job.note && (
                                      <div className="pt-2">
                                        <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Note</div>
                                        <div 
                                          className="bg-background rounded-lg p-3 border text-sm"
                                          dangerouslySetInnerHTML={{ __html: job.note }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}
                              </CollapsibleContent>
                            </Collapsible>
                          </div>

                          {assignment.status === 'pending' && (
                            <div className="flex gap-2 md:flex-col">
                              <Button
                                size="sm"
                                variant="default"
                                className="bg-green-600 hover:bg-green-700 flex-1"
                                onClick={() => acceptMutation.mutate(assignment.id)}
                                disabled={processingAssignmentId !== null}
                                data-testid={`button-accept-${assignment.id}`}
                              >
                                {processingAssignmentId === assignment.id && acceptMutation.isPending ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <Check className="w-4 h-4 mr-1" />
                                    Accetta
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="flex-1"
                                onClick={() => handleDecline(assignment.id)}
                                disabled={processingAssignmentId !== null}
                                data-testid={`button-decline-${assignment.id}`}
                              >
                                <X className="w-4 h-4 mr-1" />
                                Rifiuta
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Pagina {currentPage} di {totalPages} ({filteredAssignments.length} lavori)
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Precedente
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      data-testid="button-next-page"
                    >
                      Successiva
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
              </>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          {sortedMontaggi.length > 0 && (
            <TabsContent value="montaggi" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Film className="w-5 h-5" />
                    Montaggi in Produzione ({sortedMontaggi.length})
                  </CardTitle>
                  <CardDescription>
                    Montaggi video richiesti, in ordine di data di assegnazione (i più vecchi prima).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {sortedMontaggi.map((m: AssignmentWithJob) => {
                      const eventDate = m.job?.eventDate ? convertFirestoreTimestamp(m.job.eventDate) : null;
                      const assignedDate = getMontaggioAssignedDate(m);
                      const status = m.montaggioStatus as MontaggioStatus;
                      const updates = Array.isArray(m.montaggioUpdates) ? m.montaggioUpdates : [];
                      const lastNote = [...updates].reverse().find((u) => u.note)?.note;
                      return (
                        <Card key={m.id} className="border" data-testid={`card-montaggio-${m.id}`}>
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-lg">
                                {m.job?.nomeEvento || `Job #${m.jobId.slice(0, 8)}`}
                              </h3>
                              <Badge
                                className={MONTAGGIO_BADGE_CLASS[status]}
                                data-testid={`badge-montaggio-status-${m.id}`}
                              >
                                🎬 {MONTAGGIO_STATUS_LABELS[status]}
                              </Badge>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Calendar className="w-4 h-4" />
                                <span className="font-medium">Data evento:</span>
                                <span>{eventDate ? format(eventDate, 'dd MMMM yyyy', { locale: it }) : 'Da confermare'}</span>
                              </div>
                              {assignedDate && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Clock className="w-4 h-4" />
                                  <span className="font-medium">Assegnato il:</span>
                                  <span>{format(assignedDate, 'dd MMMM yyyy', { locale: it })}</span>
                                </div>
                              )}
                            </div>

                            {lastNote && (
                              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                                <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Note</div>
                                <p>{lastNote}</p>
                              </div>
                            )}

                            {updates.length > 0 && (
                              <Collapsible>
                                <CollapsibleTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-between text-muted-foreground hover:text-foreground"
                                    data-testid={`button-montaggio-history-${m.id}`}
                                  >
                                    <span className="flex items-center gap-2">
                                      <Info className="w-4 h-4" />
                                      Storico stato montaggio
                                    </span>
                                    <ChevronDown className="w-4 h-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="pt-2 space-y-2">
                                  {[...updates].reverse().map((u, idx) => {
                                    const d = convertFirestoreTimestamp(u.data);
                                    return (
                                      <div key={idx} className="border-l-2 border-primary/30 pl-3 py-1 text-sm">
                                        <div className="font-medium">{MONTAGGIO_STATUS_LABELS[u.status]}</div>
                                        {d && (
                                          <div className="text-xs text-muted-foreground">
                                            {format(d, 'dd/MM/yyyy HH:mm', { locale: it })}
                                          </div>
                                        )}
                                        {u.note && <div className="text-muted-foreground mt-1">{u.note}</div>}
                                      </div>
                                    );
                                  })}
                                </CollapsibleContent>
                              </Collapsible>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        {filteredAssignments.filter((a: JobCollaboratoreAssignment) => a.pagamenti && a.pagamenti.length > 0).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>💰 Storico Pagamenti Ricevuti</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Metodo</TableHead>
                    <TableHead>Importo</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssignments
                    .filter((a: JobCollaboratoreAssignment) => a.pagamenti && a.pagamenti.length > 0)
                    .flatMap((a: AssignmentWithJob) =>
                      (a.pagamenti || []).map((pag: CollaboratorPayment) => ({
                        ...pag,
                        jobId: a.jobId,
                        jobName: a.job?.nomeEvento || `Job #${a.jobId.slice(0, 8)}`,
                      }))
                    )
                    .sort((a: CollaboratorPayment & { jobId: string; jobName: string }, b: CollaboratorPayment & { jobId: string; jobName: string }) => (convertFirestoreTimestamp(b.data)?.getTime() || 0) - (convertFirestoreTimestamp(a.data)?.getTime() || 0))
                    .map((pag: CollaboratorPayment & { jobId: string; jobName: string }) => (
                      <TableRow key={pag.id}>
                        <TableCell>
                          {format(convertFirestoreTimestamp(pag.data) || new Date(), 'dd/MM/yyyy', { locale: it })}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{pag.jobName}</TableCell>
                        <TableCell>
                          <Badge variant={pag.tipo === 'acconto' ? 'secondary' : 'default'}>
                            {pag.tipo === 'acconto' ? 'Acconto' : 'Saldo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="capitalize">{pag.metodo}</TableCell>
                        <TableCell className="font-semibold">€{pag.importo.toFixed(2)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{pag.note || '-'}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        
        <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Conferma Rifiuto</DialogTitle>
              <DialogDescription>
                Stai rifiutando questo lavoro. Puoi indicare un motivo (opzionale).
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Textarea
                placeholder="Motivo del rifiuto (opzionale)..."
                value={declineNote}
                onChange={(e) => setDeclineNote(e.target.value)}
                rows={3}
                data-testid="textarea-decline-note"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeclineDialogOpen(false);
                  setDeclineNote('');
                  setSelectedAssignmentId(null);
                }}
              >
                Annulla
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDecline}
                disabled={declineMutation.isPending}
                data-testid="button-confirm-decline"
              >
                {declineMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <X className="w-4 h-4 mr-2" />
                )}
                Conferma Rifiuto
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
