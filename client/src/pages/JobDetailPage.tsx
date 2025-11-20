import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useQueries, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Loader2, MoreVertical, Edit, Trash2, FileText, Download, Calendar as CalendarIcon, Send, CheckCircle, Activity, Eye, CalendarPlus, Mail, MessageCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Job, CostoLavoro } from '@shared/jobs-types';
import { Cliente } from '@shared/clienti-types';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { getJob, deleteJob, updateJob, getJobTimeline } from '@/lib/jobs';
import type { JobTimelineEvent } from '@shared/jobs-types';
import { nanoid } from 'nanoid';
import { Timestamp } from 'firebase/firestore';
import { getClienteById } from '@/lib/clienti';
import { getJobTypeBySlug } from '@/lib/job-types';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import ClienteJobCard from '@/components/jobs/ClienteJobCard';
import ModuliJobSection from '@/components/jobs/ModuliJobSection';
import CostiLavoroTable from '@/components/jobs/CostiLavoroTable';
import QuoteBuilder from '@/components/quotes/QuoteBuilder';
import PaymentScheduleSection from '@/components/jobs/PaymentScheduleSection';
import EditJobModal from '@/components/jobs/EditJobModal';
import EditClienteModal from '@/components/jobs/EditClienteModal';
import { updateCliente } from '@/lib/clienti';
import QuoteManagementPanel from '@/components/quotes/QuoteManagementPanel';
import JobNotesSection from '@/components/jobs/JobNotesSection';
import { db } from '@/lib/firebase';
import { collection, getDocs, query as fbQuery, where, orderBy as fbOrderBy } from 'firebase/firestore';
import type { Quote } from '@shared/quotes-types';
import { apiRequest } from '@/lib/queryClient';
import { ClientAutocomplete } from '@/components/clienti/ClientAutocomplete';
import { JobCollaboratoriSection } from '@/components/jobs/JobCollaboratoriSection';
import FinancialSummaryCard from '@/components/jobs/FinancialSummaryCard';
import { useJobFinancials } from '@/hooks/useJobFinancials';
import JobCompletedToggle from '@/components/jobs/JobCompletedToggle';
import { ConsultationTemplate } from '@shared/consultation-types';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [, navigate] = useLocation();
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const [quoteBuilderOpen, setQuoteBuilderOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null);

  // Calendar event modal state
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDescription, setNewEventDescription] = useState('');
  const [newEventStartDate, setNewEventStartDate] = useState('');
  const [newEventStartTime, setNewEventStartTime] = useState('');
  const [newEventLocation, setNewEventLocation] = useState('');
  const [selectedClienteForEvent, setSelectedClienteForEvent] = useState<Cliente | null>(null);
  const [sendNotification, setSendNotification] = useState(true);
  const [isAllDay, setIsAllDay] = useState(false);
  const [durationPreset, setDurationPreset] = useState<'30min' | '1h' | '2h' | '3h' | 'custom'>('1h');
  const [customDurationHours, setCustomDurationHours] = useState('1');

  // Consultation & Booking state
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showConsultationDialog, setShowConsultationDialog] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [sendingConsultation, setSendingConsultation] = useState(false);

  const { data: job, isLoading } = useQuery<Job | null>({
    queryKey: ['jobs', jobId],
    queryFn: () => getJob(jobId!),
    enabled: !!jobId
  });

  // Fetch timeline events for activity section
  const { data: timelineEvents = [] } = useQuery<JobTimelineEvent[]>({
    queryKey: ['timeline', jobId],
    queryFn: () => getJobTimeline(jobId!),
    enabled: !!jobId
  });

  const clientiQueries = useQueries({
    queries: (job?.clientiIds || []).map(clienteId => ({
      queryKey: ['clienti', clienteId],
      queryFn: () => getClienteById(clienteId),
      enabled: !!job
    }))
  });

  const clienti = clientiQueries
    .filter(q => q.data)
    .map(q => q.data as Cliente);
  const clientiLoading = clientiQueries.some(q => q.isLoading);

  const { data: jobType } = useQuery({
    queryKey: ['jobType', job?.jobType],
    queryFn: () => getJobTypeBySlug(job!.jobType),
    enabled: !!job
  });

  // Calculate job financials in real-time from payment schedules
  const jobFinancials = useJobFinancials(job);

  // Fetch preventivi associati al job
  const { data: quotes, isLoading: quotesLoading } = useQuery({
    queryKey: ['quotes', jobId], // Aligned with QuoteManagementPanel mutations
    queryFn: async () => {
      if (!jobId) return [];
      const quotesRef = collection(db, 'quotes');
      // Remove orderBy to avoid composite index requirement
      const q = fbQuery(quotesRef, where('jobId', '==', jobId));
      const snapshot = await getDocs(q);

      // Normalize Timestamps and sort client-side
      const normalizedQuotes = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Normalize Firestore Timestamps to Date objects (CALL .toDate())
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
          sentAt: data.sentAt?.toDate ? data.sentAt.toDate() : data.sentAt,
          viewedAt: data.viewedAt?.toDate ? data.viewedAt.toDate() : data.viewedAt,
          expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate() : data.expiresAt,
          signature: data.signature ? {
            ...data.signature,
            signedAt: data.signature.signedAt?.toDate ? data.signature.signedAt.toDate() : data.signature.signedAt
          } : undefined
        } as Quote;
      });

      // Sort by createdAt descending (most recent first) - client-side
      return normalizedQuotes.sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
        const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
        return dateB - dateA;
      });
    },
    enabled: !!jobId
  });

  // Fetch consultation templates per questo jobType
  const { data: consultationTemplates = [], isLoading: loadingTemplates } = useQuery<ConsultationTemplate[]>({
    queryKey: [`/api/consultations/templates/by-job-type/${job?.jobType}`],
    enabled: showTemplateSelector && !!job?.jobType,
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'firmato': return 'default';
      case 'inviato': return 'secondary';
      case 'bozza': return 'outline';
      case 'rifiutato': return 'destructive';
      case 'annullato': return 'destructive';
      default: return 'secondary';
    }
  };

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      await deleteJob(jobId!, user.uid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast({
        title: 'Lavoro eliminato',
        description: 'Il lavoro è stato eliminato definitivamente'
      });
      navigate('/admin/jobs');
    },
    onError: (error) => {
      toast({
        title: 'Errore',
        description: error instanceof Error ? error.message : 'Impossibile eliminare il lavoro',
        variant: 'destructive'
      });
    }
  });

  const handleDelete = () => {
    if (!window.confirm(`Sei sicuro di voler eliminare "${job?.nomeEvento}"?`)) {
      return;
    }
    if (!window.confirm('⚠️ ATTENZIONE: Questa operazione è IRREVERSIBILE. Tutti i dati collegati (timeline, pagamenti) saranno eliminati. Confermi?')) {
      return;
    }
    deleteMutation.mutate();
  };

  // Costi handlers
  const handleAddCosto = async (costo: Omit<CostoLavoro, 'id'>) => {
    if (!job || !user) return;

    try {
      const newCosto: CostoLavoro = {
        id: nanoid(),
        descrizione: costo.descrizione,
        importo: costo.importo,
        tipo: costo.tipo,
        data: Timestamp.now(),  // Use Firestore Timestamp instead of mock object
        note: costo.note,
        createdBy: user.uid
      };

      const updatedCosti = [...(job.costi || []), newCosto];
      await updateJob(jobId!, { costi: updatedCosti }, user.uid);

      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      toast({
        title: 'Costo aggiunto',
        description: 'Il costo è stato inserito correttamente'
      });
    } catch (error) {
      toast({
        title: 'Errore',
        description: error instanceof Error ? error.message : 'Impossibile aggiungere il costo',
        variant: 'destructive'
      });
    }
  };

  const handleUpdateCosto = async (id: string, updates: Partial<CostoLavoro>) => {
    if (!job || !user) return;

    try {
      // Sanitize updates: omit 'data' field (creation date should not be modified)
      // and ensure valid Firestore types
      const { data, ...safeUpdates } = updates;

      const updatedCosti = (job.costi || []).map(c =>
        c.id === id ? { ...c, ...safeUpdates } : c
      );
      await updateJob(jobId!, { costi: updatedCosti }, user.uid);

      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      toast({
        title: 'Costo aggiornato',
        description: 'Le modifiche sono state salvate'
      });
    } catch (error) {
      toast({
        title: 'Errore',
        description: error instanceof Error ? error.message : 'Impossibile aggiornare il costo',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteCosto = async (id: string) => {
    if (!job || !user) return;

    try {
      const updatedCosti = (job.costi || []).filter(c => c.id !== id);
      await updateJob(jobId!, { costi: updatedCosti }, user.uid);

      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      toast({
        title: 'Costo eliminato',
        description: 'Il costo è stato rimosso'
      });
    } catch (error) {
      toast({
        title: 'Errore',
        description: error instanceof Error ? error.message : 'Impossibile eliminare il costo',
        variant: 'destructive'
      });
    }
  };

  // Calendar event creation mutation
  const createEventMutation = useMutation({
    mutationFn: async (eventData: {
      title: string;
      description?: string;
      start: string;
      end: string;
      location?: string;
      clienteId?: string;
      notifyCliente: boolean;
      isAllDay?: boolean;
    }) => {
      const response = await apiRequest('POST', '/api/calendar/create-event', eventData);
      return response.json();
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/events'], exact: false });

      // Salva evento timeline nel job
      try {
        await apiRequest('POST', `/api/jobs/${jobId}/timeline-events`, {
          tipo: 'appuntamento_creato',
          descrizione: `Appuntamento creato: ${variables.title}`,
          metadata: {
            calendarEventId: data.eventId,
            clienteId: variables.clienteId,
            eventTitle: variables.title,
            eventDate: variables.start
          }
        });
        queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
        queryClient.invalidateQueries({ queryKey: ['timeline', jobId] }); // FIX: Refresh Attività Recenti
      } catch (error) {
        console.error('Errore salvataggio timeline:', error);
      }

      toast({
        title: 'Evento creato',
        description: 'L\'appuntamento è stato aggiunto al calendario',
      });
      handleCloseCalendarDialog();
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message || 'Impossibile creare l\'evento',
        variant: 'destructive',
      });
    },
  });

  const handleRequestCreateAppointment = (job: Job) => {
    // Pre-popola cliente dal job
    if (clienti.length > 0) {
      setSelectedClienteForEvent(clienti[0]);
    }
    setNewEventTitle(`Appuntamento - ${job.nomeEvento}`);
    setShowCalendarDialog(true);
  };

  const handleCloseCalendarDialog = () => {
    setShowCalendarDialog(false);
    setNewEventTitle('');
    setNewEventDescription('');
    setNewEventStartDate('');
    setNewEventStartTime('');
    setNewEventLocation('');
    setSelectedClienteForEvent(null);
    setSendNotification(true);
    setIsAllDay(false);
    setDurationPreset('1h');
  };

  const handleCreateEvent = () => {
    if (!newEventTitle.trim() || !newEventStartDate) {
      toast({
        title: 'Campi obbligatori',
        description: 'Compila titolo e data inizio',
        variant: 'destructive',
      });
      return;
    }

    if (!isAllDay && !newEventStartTime) {
      toast({
        title: 'Ora richiesta',
        description: 'Specifica ora inizio o seleziona "Tutto il giorno"',
        variant: 'destructive',
      });
      return;
    }

    if (isAllDay) {
      createEventMutation.mutate({
        title: newEventTitle,
        description: newEventDescription || undefined,
        start: newEventStartDate,
        end: newEventStartDate,
        location: newEventLocation || undefined,
        clienteId: selectedClienteForEvent?.id,
        notifyCliente: sendNotification,
        isAllDay: true,
      });
    } else {
      const startDate = new Date(`${newEventStartDate}T${newEventStartTime}:00`);

      let durationMinutes: number;

      if (durationPreset === 'custom') {
        const customHours = parseFloat(customDurationHours);
        if (isNaN(customHours) || customHours <= 0) {
          toast({
            title: 'Durata non valida',
            description: 'Inserisci una durata valida (es. 1.5)',
            variant: 'destructive',
          });
          return;
        }
        durationMinutes = customHours * 60;
      } else {
        const durationMap = {
          '30min': 30,
          '1h': 60,
          '2h': 120,
          '3h': 180,
        };
        durationMinutes = durationMap[durationPreset];
      }

      const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

      createEventMutation.mutate({
        title: newEventTitle,
        description: newEventDescription || undefined,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        location: newEventLocation || undefined,
        clienteId: selectedClienteForEvent?.id,
        notifyCliente: sendNotification,
        isAllDay: false,
      });
    }
  };

  // Fix: Invalidate timeline cache when events are added
  const invalidateTimeline = () => {
    queryClient.invalidateQueries({ queryKey: ['timeline', jobId] });
  };

  // Update cliente mutation
  const updateClienteMutation = useMutation({
    mutationFn: async (updates: Partial<Cliente>) => {
      if (!editingCliente) throw new Error('Nessun cliente selezionato');
      await updateCliente(editingCliente.id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clienti'] });
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      toast({
        title: 'Cliente aggiornato',
        description: 'Le modifiche sono state salvate correttamente'
      });
      setEditingCliente(null);
    },
    onError: (error) => {
      toast({
        title: 'Errore',
        description: error instanceof Error ? error.message : 'Impossibile aggiornare il cliente',
        variant: 'destructive'
      });
    }
  });

  // Consultation handlers
  const handleOpenTemplateSelector = () => {
    setShowTemplateSelector(true);
    setSelectedTemplateId(null);
  };

  const handleSelectTemplate = () => {
    if (!selectedTemplateId) {
      toast({
        title: 'Selezione mancante',
        description: 'Seleziona un template consulenza',
        variant: 'destructive',
      });
      return;
    }
    setShowTemplateSelector(false);
    setShowConsultationDialog(true);
  };

  const handleSendConsultation = async (channel: 'email' | 'whatsapp') => {
    if (!selectedTemplateId) {
      toast({
        title: 'Errore',
        description: 'Template consulenza non selezionato',
        variant: 'destructive',
      });
      return;
    }

    setSendingConsultation(true);
    try {
      const response = await apiRequest(`/api/consultations/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job!.id,
          templateId: selectedTemplateId,
          channel,
        }),
      });

      if (channel === 'whatsapp') {
        window.open(response.whatsappUrl, '_blank');
      }

      toast({
        title: '✅ Consulenza inviata!',
        description: channel === 'email' ? 'Email inviata al cliente' : 'Apri WhatsApp per inviare',
      });

      setShowConsultationDialog(false);
      setSelectedTemplateId(null);
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['timeline', jobId] });
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: error.message || 'Impossibile inviare consulenza',
        variant: 'destructive',
      });
    } finally {
      setSendingConsultation(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Lavoro non trovato</p>
        <Button onClick={() => navigate('/admin/dashboard')} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Torna alla Dashboard
        </Button>
      </div>
    );
  }

  const eventDateFormatted = job.eventDate ? 
    format(job.eventDate.toDate(), 'dd MMMM yyyy', { locale: it }) : 
    'Data non disponibile';

  const timeInfo = !job.allDay && job.startTime ? 
    `${job.startTime}${job.endTime ? ` - ${job.endTime}` : ''}` : 
    'Tutto il giorno';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate('/admin/dashboard')}
                data-testid="button-back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {job.nomeEvento}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {eventDateFormatted} • {timeInfo}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" data-testid="badge-job-type">
                {job.jobType}
              </Badge>
              <Badge data-testid="badge-status">
                {job.status}
              </Badge>

              {/* Primary Actions */}
              {(job.status === 'lead' || job.status === 'preventivo_inviato') && (
                <Button 
                  onClick={() => setQuoteBuilderOpen(true)}
                  data-testid="action-generate-quote"
                  className="hidden sm:flex"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Genera Preventivo
                </Button>
              )}
              
              <Button 
                onClick={() => setEditModalOpen(true)}
                variant="outline"
                data-testid="action-edit"
                className="hidden sm:flex"
              >
                <Edit className="h-4 w-4 mr-2" />
                Modifica
              </Button>

              {/* Secondary Actions Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-actions">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {/* Destructive action */}
                  <DropdownMenuItem
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="text-destructive focus:text-destructive"
                    data-testid="action-delete"
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    <span>Elimina Lavoro</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Job Completed Toggle + Quick Actions - Horizontal section below header */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-2">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <JobCompletedToggle 
                jobId={job.id} 
                currentJob={job}
                className="flex-shrink-0"
              />
              
              {/* Quick Action Buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenTemplateSelector}
                  data-testid="button-send-consultation"
                  className="text-xs sm:text-sm"
                >
                  <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Appuntamento Consulenza</span>
                  <span className="sm:hidden">Consulenza</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRequestCreateAppointment}
                  data-testid="button-request-appointment-header"
                  className="text-xs sm:text-sm"
                >
                  <CalendarPlus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Richiedi Appuntamento</span>
                  <span className="sm:hidden">Appuntamento</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 lg:pb-8">
        {/* Financial Summary */}
        <FinancialSummaryCard
          totalePreventivato={jobFinancials.totalePreventivato}
          totalePagato={jobFinancials.totalePagato}
          saldoResiduo={jobFinancials.saldoResiduo}
          totaleCosti={jobFinancials.totaleCosti}
          className="mb-6"
        />

        {/* Main Content - Full Width Layout */}
        <div className="space-y-6">
            {/* Clienti Section */}
            <Card>
              <CardHeader>
                <CardTitle>Clienti ({job.clientiIds.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {clientiLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {clienti.map(cliente => (
                      <ClienteJobCard 
                        key={cliente.id} 
                        cliente={cliente}
                        onEdit={() => setEditingCliente(cliente)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Preventivi e Ordini */}
            <Card>
              <CardHeader>
                <CardTitle>Preventivi e Ordini</CardTitle>
              </CardHeader>
              <CardContent>
                <ModuliJobSection 
                  jobId={job.id}
                  clienteId={job.clientiIds[0]}
                  onCreateModulo={() => setQuoteBuilderOpen(true)}
                  isAdmin={true}
                />
              </CardContent>
            </Card>

            {/* Quote Builder Modal */}
            {job.clientiIds.length > 0 && quoteBuilderOpen && jobType && (
              <QuoteBuilder
                open={quoteBuilderOpen}
                onClose={() => setQuoteBuilderOpen(false)}
                jobId={job.id}
                jobType={jobType}
                jobTypeSlug={job.jobType}
                clienteId={job.clientiIds[0]}
              />
            )}

            {/* Pagamenti */}
            <Card>
              <CardHeader>
                <CardTitle>Pagamenti e Scadenze</CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentScheduleSection 
                  jobId={job.id}
                  eventDate={job.eventDate ? job.eventDate.toDate() : null}
                  isAdmin={true}
                />
              </CardContent>
            </Card>

            {/* Stato Preventivi */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Stato Preventivi ({quotes?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {quotesLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                    Caricamento preventivi...
                  </div>
                ) : !quotes || quotes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nessun preventivo associato a questo lavoro
                  </div>
                ) : (
                  <div className="space-y-3">
                    {quotes.map((quote) => (
                      <div key={quote.id} className="border rounded-lg">
                        {/* Quote Header - Clickable */}
                        <button
                          onClick={() => setExpandedQuoteId(expandedQuoteId === quote.id ? null : quote.id)}
                          className="w-full text-left p-4 hover:bg-accent/50 transition-colors rounded-t-lg"
                          data-testid={`button-toggle-quote-${quote.id}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {quote.jobInfo?.nomeEvento || `Preventivo #${quote.id.slice(0, 8)}`}
                                </span>
                                <Badge variant={getStatusBadgeVariant(quote.status)}>
                                  {quote.status}
                                </Badge>
                                {quote.type === 'variabile' && (
                                  <Badge variant="outline">Variabile</Badge>
                                )}
                              </div>
                              {quote.clientiInfo && quote.clientiInfo.length > 0 && (
                                <p className="text-sm text-muted-foreground">
                                  Cliente: {quote.clientiInfo.map(c => `${c.nome} ${c.cognome}`).join(', ')}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {quote.createdAt && format(
                                  quote.createdAt instanceof Date ? quote.createdAt : new Date(quote.createdAt as any), 
                                  'PPP', 
                                  { locale: it }
                                )}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">
                                €{(quote.totaleSelezionato || quote.totalAfterDiscount || 0).toFixed(2)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {expandedQuoteId === quote.id ? 'Chiudi ▲' : 'Gestisci ▼'}
                              </p>
                            </div>
                          </div>
                        </button>

                        {/* Quote Management Panel - Expandable */}
                        {expandedQuoteId === quote.id && (
                          <div className="border-t p-4 bg-muted/20" data-testid={`panel-quote-management-${quote.id}`}>
                            <QuoteManagementPanel quote={quote} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Note e Personalizzazioni */}
            <JobNotesSection job={job} />

            {/* Collaboratori */}
            <JobCollaboratoriSection jobId={job.id} />

            {/* Costi */}
            <Card>
              <CardHeader>
                <CardTitle>Costi Lavoro</CardTitle>
              </CardHeader>
              <CardContent>
                <CostiLavoroTable
                  costi={job.costi || []}
                  totalePreventivato={jobFinancials.totalePreventivato}
                  onAddCosto={handleAddCosto}
                  onUpdateCosto={handleUpdateCosto}
                  onDeleteCosto={handleDeleteCosto}
                  isAdmin={true}
                />
              </CardContent>
            </Card>

            {/* Attività Recenti */}
            {timelineEvents.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Attività Recenti
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {timelineEvents.slice(0, 10).map((event) => {
                      const eventDate = event.data?.toDate ? event.data.toDate() : new Date(event.data as any);
                      const Icon = event.tipo === 'consulenza_inviata' || event.tipo === 'quote_sent' 
                        ? Send 
                        : event.tipo === 'appuntamento_creato' || event.tipo === 'calendar_event'
                        ? CalendarIcon
                        : CheckCircle;
                      
                      return (
                        <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                          <div className="flex-shrink-0 mt-0.5">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {event.descrizione}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(eventDate, 'dd MMMM yyyy • HH:mm', { locale: it })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
        </div>
      </div>

      {/* Edit Job Modal */}
      {editModalOpen && (
        <EditJobModal
          open={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          job={job}
        />
      )}

      {/* Edit Cliente Modal */}
      {editingCliente && (
        <EditClienteModal
          open={!!editingCliente}
          onOpenChange={(open) => !open && setEditingCliente(null)}
          cliente={editingCliente}
          onSave={updateClienteMutation.mutateAsync}
          isPending={updateClienteMutation.isPending}
        />
      )}

      {/* Create Calendar Event Modal */}
      <Dialog open={showCalendarDialog} onOpenChange={setShowCalendarDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuovo Evento</DialogTitle>
            <DialogDescription>
              Crea un nuovo evento nel calendario
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titolo *</Label>
              <Input
                id="title"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="Es. Consulenza con cliente"
                data-testid="input-event-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                value={newEventDescription}
                onChange={(e) => setNewEventDescription(e.target.value)}
                placeholder="Dettagli dell'evento..."
                rows={3}
                data-testid="textarea-event-description"
              />
            </div>

            <div className="flex items-center space-x-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <Checkbox
                id="all-day"
                checked={isAllDay}
                onCheckedChange={(checked) => setIsAllDay(checked as boolean)}
                data-testid="checkbox-all-day"
              />
              <Label 
                htmlFor="all-day" 
                className="text-sm font-normal cursor-pointer"
              >
                Evento di tutta la giornata
              </Label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">Data Inizio *</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={newEventStartDate}
                  onChange={(e) => setNewEventStartDate(e.target.value)}
                  data-testid="input-start-date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="start-time">Ora Inizio {!isAllDay && '*'}</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={newEventStartTime}
                  onChange={(e) => setNewEventStartTime(e.target.value)}
                  disabled={isAllDay}
                  data-testid="input-start-time"
                />
              </div>
            </div>

            {!isAllDay && (
              <div className="space-y-2">
                <Label htmlFor="duration">Durata</Label>
                <div className="flex gap-2">
                  <Select 
                    value={durationPreset} 
                    onValueChange={(val) => setDurationPreset(val as any)}
                  >
                    <SelectTrigger className="w-full" data-testid="select-duration">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30min">30 minuti</SelectItem>
                      <SelectItem value="1h">1 ora</SelectItem>
                      <SelectItem value="2h">2 ore</SelectItem>
                      <SelectItem value="3h">3 ore</SelectItem>
                      <SelectItem value="custom">Personalizzata</SelectItem>
                    </SelectContent>
                  </Select>

                  {durationPreset === 'custom' && (
                    <Input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={customDurationHours}
                      onChange={(e) => setCustomDurationHours(e.target.value)}
                      placeholder="Ore"
                      className="w-24"
                      data-testid="input-custom-duration"
                    />
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="location">Luogo</Label>
              <Input
                id="location"
                value={newEventLocation}
                onChange={(e) => setNewEventLocation(e.target.value)}
                placeholder="Es. Studio, Online, etc"
                data-testid="input-location"
              />
            </div>

            <div className="space-y-2">
              <Label>Cliente</Label>
              <ClientAutocomplete
                value={selectedClienteForEvent?.id}
                onSelect={setSelectedClienteForEvent}
                placeholder="Cerca cliente (opzionale)"
              />
            </div>

            <div className="flex items-center space-x-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <Checkbox
                id="notify"
                checked={sendNotification}
                onCheckedChange={(checked) => setSendNotification(checked as boolean)}
                data-testid="checkbox-notify"
              />
              <Label 
                htmlFor="notify" 
                className="text-sm font-normal cursor-pointer"
              >
                Invia notifica al cliente
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={handleCloseCalendarDialog}
              disabled={createEventMutation.isPending}
            >
              Annulla
            </Button>
            <Button
              onClick={handleCreateEvent}
              disabled={createEventMutation.isPending}
              data-testid="button-create-event"
            >
              {createEventMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Crea Evento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 1: Selezione template consulenza */}
      <Dialog open={showTemplateSelector} onOpenChange={setShowTemplateSelector}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Seleziona Tipo Consulenza</DialogTitle>
            <DialogDescription>
              Scegli quale consulenza inviare al cliente per {job.nomeEvento}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingTemplates ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">Caricamento template...</div>
              </div>
            ) : consultationTemplates.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">
                  Nessun template consulenza disponibile per {job.jobType}
                </div>
              </div>
            ) : (
              <RadioGroup value={selectedTemplateId || ''} onValueChange={setSelectedTemplateId}>
                <div className="space-y-3">
                  {consultationTemplates.map((template) => (
                    <div
                      key={template.id}
                      className={cn(
                        "flex items-start space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-colors",
                        selectedTemplateId === template.id
                          ? "border-primary bg-primary/5"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      )}
                      onClick={() => setSelectedTemplateId(template.id)}
                    >
                      <RadioGroupItem value={template.id} id={template.id} />
                      <Label htmlFor={template.id} className="flex-1 cursor-pointer">
                        <div className="font-medium text-sm">{template.nome}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {template.descrizione}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {template.durataMinuti} minuti
                          </span>
                        </div>
                      </Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowTemplateSelector(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={handleSelectTemplate}
              disabled={!selectedTemplateId || loadingTemplates}
              data-testid="button-confirm-template"
            >
              Continua
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 2: Scelta canale invio consulenza */}
      <Dialog open={showConsultationDialog} onOpenChange={setShowConsultationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invia Richiesta Consulenza</DialogTitle>
            <DialogDescription>
              Scegli come inviare la richiesta di appuntamento al cliente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4"
              onClick={() => handleSendConsultation('email')}
              disabled={sendingConsultation}
              data-testid="button-send-email"
            >
              <Mail className="h-5 w-5 mr-3" />
              <div className="text-left">
                <p className="font-medium">Invia via Email</p>
                <p className="text-xs text-muted-foreground">
                  Il cliente riceverà un'email con il link per prenotare
                </p>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4"
              onClick={() => handleSendConsultation('whatsapp')}
              disabled={sendingConsultation}
              data-testid="button-send-whatsapp"
            >
              <MessageCircle className="h-5 w-5 mr-3" />
              <div className="text-left">
                <p className="font-medium">Invia via WhatsApp</p>
                <p className="text-xs text-muted-foreground">
                  Apri WhatsApp con messaggio pre-compilato
                </p>
              </div>
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowConsultationDialog(false)}
              disabled={sendingConsultation}
            >
              Annulla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile Sticky Actions Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 flex gap-2 lg:hidden z-50 shadow-lg">
        <Button 
          className="flex-1"
          onClick={() => setEditModalOpen(true)}
          variant="outline"
          data-testid="mobile-action-edit"
        >
          <Edit className="h-4 w-4 mr-2" />
          Modifica
        </Button>
        {(job.status === 'lead' || job.status === 'preventivo_inviato') && (
          <Button 
            className="flex-1"
            onClick={() => setQuoteBuilderOpen(true)}
            data-testid="mobile-action-quote"
          >
            <FileText className="h-4 w-4 mr-2" />
            Preventivo
          </Button>
        )}
      </div>
    </div>
  );
}