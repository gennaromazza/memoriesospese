
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
import { getCollaboratorByToken, respondToAssignmentPublic } from '@/lib/collaboratori';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Calendar, MapPin, Euro, Check, X, Loader2, Clock, ChevronLeft, ChevronRight, User, Phone, Mail, Package, ClipboardList, ChevronDown, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { JobAcceptanceStatus, JobCollaboratoreAssignment, CollaboratorPayment, AssignedProduct } from '@shared/collaboratori-types';
import { convertFirestoreTimestamp } from '@/lib/firebase';

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

interface AssignmentWithJob extends JobCollaboratoreAssignment {
  job?: {
    id: string;
    nomeEvento?: string;
    eventDate?: any;
    eventLocation?: string;
  } | null;
  cliente?: {
    id: string;
    nome?: string;
    cognome?: string;
    email?: string;
    cellulare?: string;
  } | null;
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

  const totalCompensoPending = assignments
    .filter((a: JobCollaboratoreAssignment) => a.status === 'accepted')
    .reduce((sum: number, a: JobCollaboratoreAssignment) => sum + a.compenso, 0);

  const totalPagato = assignments
    .filter((a: JobCollaboratoreAssignment) => a.status === 'accepted')
    .reduce((sum: number, a: JobCollaboratoreAssignment) => {
      const pagatoAssignment = a.pagamenti?.reduce((s: number, p: CollaboratorPayment) => s + p.importo, 0) || 0;
      return sum + pagatoAssignment;
    }, 0);

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

                            {cliente && (
                              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                                <div className="text-xs font-medium text-muted-foreground uppercase">Cliente</div>
                                <div className="flex flex-wrap gap-3 text-sm">
                                  <div className="flex items-center gap-1">
                                    <User className="w-4 h-4 text-muted-foreground" />
                                    {cliente.nome} {cliente.cognome}
                                  </div>
                                  {cliente.email && (
                                    <a href={`mailto:${cliente.email}`} className="flex items-center gap-1 text-primary hover:underline">
                                      <Mail className="w-4 h-4" />
                                      {cliente.email}
                                    </a>
                                  )}
                                  {cliente.cellulare && (
                                    <a href={`tel:${cliente.cellulare}`} className="flex items-center gap-1 text-primary hover:underline">
                                      <Phone className="w-4 h-4" />
                                      {cliente.cellulare}
                                    </a>
                                  )}
                                </div>
                              </div>
                            )}

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
                        jobName: a.job?.title || a.job?.clientName || `Job #${a.jobId.slice(0, 8)}`,
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
