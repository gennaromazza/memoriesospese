import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useLocation, Link } from 'wouter';
import { useQuery, useQueries, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Loader2, MoreVertical, Edit, Trash2, FileText, Download, Calendar as CalendarIcon, Send, CheckCircle, Activity, Eye, CalendarPlus, Mail, MessageCircle, Clock, UserPlus, CalendarRange, Image, FolderOpen, EyeOff, HelpCircle, Star, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { TimeInput } from '@/components/ui/time-input';
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
import { format, startOfDay, endOfDay, addDays, eachDayOfInterval, parseISO } from 'date-fns';
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
import InfoFormJobSection from '@/components/jobs/InfoFormJobSection';
import CostiLavoroTable from '@/components/jobs/CostiLavoroTable';
import QuoteBuilder from '@/components/quotes/QuoteBuilder';
import PaymentScheduleSection from '@/components/jobs/PaymentScheduleSection';
import GeneraPagamentiModal from '@/components/jobs/GeneraPagamentiModal';
import { calculateQuoteTotalForPayments } from '@/lib/quotes';
import EditJobModal from '@/components/jobs/EditJobModal';
import EditClienteModal from '@/components/jobs/EditClienteModal';
import { updateCliente } from '@/lib/clienti';
import QuoteManagementPanel from '@/components/quotes/QuoteManagementPanel';
import SendQuoteEmailButton from '@/components/quotes/SendQuoteEmailButton';
import QuoteEmailStatusBadge from '@/components/quotes/QuoteEmailStatusBadge';
import JobNotesSection from '@/components/jobs/JobNotesSection';
import ShareGalleryButton from '@/components/ShareGalleryButton';
import { db, convertFirestoreTimestamp } from '@/lib/firebase';
import { collection, getDocs, query as fbQuery, where, orderBy as fbOrderBy, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import type { Quote } from '@shared/quotes-types';
import { apiRequest } from '@/lib/queryClient';
import { ClientAutocomplete } from '@/components/clienti/ClientAutocomplete';
import { AssegnaClienteDialog } from '@/components/clienti/AssegnaClienteDialog';
import { JobCollaboratoriSection } from '@/components/jobs/JobCollaboratoriSection';
import FinancialSummaryCard from '@/components/jobs/FinancialSummaryCard';
import { useJobFinancials } from '@/hooks/useJobFinancials';
import JobCompletedToggle from '@/components/jobs/JobCompletedToggle';
import { ConsultationTemplate } from '@shared/consultation-types';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [location, navigate] = useLocation();
  const { user } = useFirebaseAuth();
  const { toast } = useToast();

  // Ref for deep-link scroll to moduli section
  const moduliSectionRef = useRef<HTMLDivElement>(null);

  // Handle ?tab=moduli deeplink — scroll to moduli section
  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    if (params.get('tab') === 'moduli' && moduliSectionRef.current) {
      setTimeout(() => {
        moduliSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 400);
    }
  }, [location]);

  // State for modals
  const [quoteBuilderOpen, setQuoteBuilderOpen] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null);
  const [generaPagamentiQuoteId, setGeneraPagamentiQuoteId] = useState<string | null>(null);

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

  // Gallerie collegate al job
  const [linkedGalleries, setLinkedGalleries] = useState<Array<{
    id: string; name: string; code: string; date?: string; photoCount?: number; jobType?: string; active?: boolean;
  }>>([]);

  const loadLinkedGalleries = () => {
    if (!jobId) return;
    const q = fbQuery(collection(db, 'galleries'), where('jobId', '==', jobId));
    getDocs(q).then(snap => {
      setLinkedGalleries(snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || '',
        code: d.data().code || '',
        date: d.data().date,
        photoCount: d.data().photoCount || 0,
        jobType: d.data().jobType,
        active: d.data().active ?? true,
      })));
    }).catch(console.error);
  };

  useEffect(() => { loadLinkedGalleries(); }, [jobId]);

  const toggleLinkedGalleryStatus = async (g: { id: string; name: string; active?: boolean }) => {
    try {
      const newActive = !g.active;
      await updateDoc(doc(db, 'galleries', g.id), { active: newActive });
      setLinkedGalleries(prev => prev.map(gl => gl.id === g.id ? { ...gl, active: newActive } : gl));
      toast({ title: newActive ? 'Galleria attivata' : 'Galleria disattivata', description: `"${g.name}" ${newActive ? 'è ora visibile ai clienti' : 'è stata nascosta ai clienti'}.` });
    } catch {
      toast({ title: 'Errore', description: 'Impossibile modificare lo stato della galleria.', variant: 'destructive' });
    }
  };

  const deleteLinkedGallery = async (g: { id: string; name: string }) => {
    if (!window.confirm(`Eliminare la galleria "${g.name}"? L'operazione non può essere annullata.`)) return;
    try {
      await deleteDoc(doc(db, 'galleries', g.id));
      setLinkedGalleries(prev => prev.filter(gl => gl.id !== g.id));
      toast({ title: 'Galleria eliminata', description: `"${g.name}" è stata eliminata.` });
    } catch {
      toast({ title: 'Errore', description: 'Impossibile eliminare la galleria.', variant: 'destructive' });
    }
  };

  // Consultation & Booking state
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showConsultationDialog, setShowConsultationDialog] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [sendingConsultation, setSendingConsultation] = useState(false);
  const [consultationDateRange, setConsultationDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({ from: undefined, to: undefined });

  // --- Anteprima Google Calendar nel dialog consulenze ---
  // Finestra per recuperare gli impegni reali e marcare i giorni occupati.
  // Base di 90gg, estesa dinamicamente se il range selezionato va oltre (evita "falsi liberi").
  const calendarWindowStart = useMemo(() => startOfDay(new Date()), []);
  const calendarWindowEnd = useMemo(() => {
    const base = addDays(startOfDay(new Date()), 90);
    const rangeEnd = consultationDateRange.to ?? consultationDateRange.from;
    if (rangeEnd && endOfDay(rangeEnd) > base) return endOfDay(rangeEnd);
    return base;
  }, [consultationDateRange]);

  type ConsultationCalendarEvent = {
    id: string;
    title: string;
    start: string;
    end: string;
    type: 'google' | 'consulenza' | 'job';
    entityStatus?: string;
  };

  const {
    data: consultationCalendarData,
    isLoading: loadingConsultationCalendar,
    isError: consultationCalendarError,
  } = useQuery<{ events: ConsultationCalendarEvent[]; warnings: string[] }>({
    queryKey: ['consultation-calendar-events', calendarWindowStart.toISOString(), calendarWindowEnd.toISOString()],
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        `/api/calendar/events?startDate=${encodeURIComponent(calendarWindowStart.toISOString())}&endDate=${encodeURIComponent(calendarWindowEnd.toISOString())}`,
      );
      return res.json();
    },
    enabled: showConsultationDialog,
    staleTime: 60 * 1000,
  });

  const consultationCalendarEvents = consultationCalendarData?.events ?? [];

  // Set di giorni (yyyy-MM-dd) che contengono almeno un impegno reale
  const busyDaySet = useMemo(() => {
    const set = new Set<string>();
    for (const ev of consultationCalendarEvents) {
      if (!ev.start) continue;
      const d = new Date(ev.start);
      if (!isNaN(d.getTime())) set.add(format(d, 'yyyy-MM-dd'));
    }
    return set;
  }, [consultationCalendarEvents]);

  // Impegni reali che cadono nel range selezionato
  const consultationEventsInRange = useMemo(() => {
    const from = consultationDateRange.from;
    if (!from) return [] as ConsultationCalendarEvent[];
    const to = consultationDateRange.to ?? from;
    const start = startOfDay(from);
    const end = endOfDay(to);
    return consultationCalendarEvents
      .filter((ev) => {
        const d = new Date(ev.start);
        return !isNaN(d.getTime()) && d >= start && d <= end;
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [consultationCalendarEvents, consultationDateRange]);

  // Giorni del range selezionato (per anteprima slot)
  const consultationRangeDays = useMemo(() => {
    const from = consultationDateRange.from;
    if (!from) return [] as Date[];
    const to = consultationDateRange.to ?? from;
    return eachDayOfInterval({ start: startOfDay(from), end: startOfDay(to) });
  }, [consultationDateRange]);

  // Anteprima degli slot che vedrebbe il cliente (primi 3 giorni del range)
  const { data: consultationSlotPreview = [], isLoading: loadingConsultationSlotPreview } = useQuery<
    { date: string; count: number; labels: string[]; message?: string }[]
  >({
    queryKey: [
      'consultation-slot-preview',
      selectedTemplateId,
      consultationDateRange.from?.toISOString(),
      consultationDateRange.to?.toISOString(),
    ],
    queryFn: async () => {
      const days = consultationRangeDays.slice(0, 3);
      const settled = await Promise.allSettled(
        days.map(async (day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const res = await apiRequest('POST', '/api/consultations/v2/available-slots', {
            date: dateStr,
            templateId: selectedTemplateId,
          });
          const data = await res.json();
          const available = (data.slots || []).filter((s: any) => s.available);
          return {
            date: dateStr,
            count: available.length,
            labels: available.slice(0, 4).map((s: any) => s.label),
            message: data.message,
          };
        }),
      );
      return settled.map((r, i) =>
        r.status === 'fulfilled'
          ? r.value
          : { date: format(days[i], 'yyyy-MM-dd'), count: 0, labels: [], message: 'Errore nel calcolo' },
      );
    },
    enabled: showConsultationDialog && !!selectedTemplateId && consultationRangeDays.length > 0,
    staleTime: 60 * 1000,
  });

  // Add cliente state
  const [showAddClienteDialog, setShowAddClienteDialog] = useState(false);

  // Helper: gestione esclusiva dei dialog (solo uno aperto alla volta)
  // Invece di chiudere tutti e poi aprire, chiudiamo solo gli ALTRI per evitare race condition React batch
  const openQuoteBuilder = useCallback((quoteId: string | null = null) => {
    // Chiudi altri dialog ma non quote builder
    setShowCalendarDialog(false);
    setShowTemplateSelector(false);
    setShowConsultationDialog(false);
    setShowAddClienteDialog(false);
    // Apri quote builder
    setEditingQuoteId(quoteId);
    setQuoteBuilderOpen(true);
  }, []);

  const openCalendarDialog = useCallback(() => {
    setQuoteBuilderOpen(false);
    setShowTemplateSelector(false);
    setShowConsultationDialog(false);
    setShowAddClienteDialog(false);
    setShowCalendarDialog(true);
  }, []);

  const openTemplateSelector = useCallback(() => {
    setQuoteBuilderOpen(false);
    setShowCalendarDialog(false);
    setShowConsultationDialog(false);
    setShowAddClienteDialog(false);
    setShowTemplateSelector(true);
  }, []);

  const openConsultationDialog = useCallback(() => {
    setQuoteBuilderOpen(false);
    setShowCalendarDialog(false);
    setShowTemplateSelector(false);
    setShowAddClienteDialog(false);
    setShowConsultationDialog(true);
  }, []);

  const openAddClienteDialog = useCallback(() => {
    setQuoteBuilderOpen(false);
    setShowCalendarDialog(false);
    setShowTemplateSelector(false);
    setShowConsultationDialog(false);
    setShowAddClienteDialog(true);
  }, []);

  // Sync URL param to state for deep-linking support
  useEffect(() => {
    const urlParams = new URLSearchParams(location.split('?')[1]);
    const editQuoteParam = urlParams.get('editQuote');
    if (editQuoteParam) {
      openQuoteBuilder(editQuoteParam);
    }
  }, [location, openQuoteBuilder]);

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

  // Merge clientiIds con il legacy clienteId (evitando duplicati)
  const allClienteIds = job
    ? [...new Set([...(job.clientiIds || []), ...(job.clienteId ? [job.clienteId] : [])])]
    : [];

  const clientiQueries = useQueries({
    queries: allClienteIds.map(clienteId => ({
      queryKey: ['clienti', clienteId],
      queryFn: () => getClienteById(clienteId),
      enabled: !!job
    }))
  });

  const clienti = clientiQueries
    .filter(q => q.data)
    .map(q => q.data as Cliente);
  const clientiLoading = clientiQueries.some(q => q.isLoading);

  // Stato email recensione per il cliente principale (per badge in timeline)
  const primoClienteEmail = clienti[0]?.email;
  const { data: reviewStatus } = useQuery<{
    found: boolean;
    firstSentAt?: string | null;
    lastSentAt?: string | null;
    sentCount?: number;
    clicked?: boolean;
    clickedAt?: string | null;
  }>({
    queryKey: ['review-status', primoClienteEmail],
    queryFn: async () => {
      console.log('[ReviewStatus] Querying for email:', primoClienteEmail);
      const res = await apiRequest('GET', `/api/email/review-status?email=${encodeURIComponent(primoClienteEmail!)}`);
      const data = await res.json();
      console.log('[ReviewStatus] Result:', data);
      return data;
    },
    enabled: !!primoClienteEmail,
    staleTime: 5 * 60_000,
  });

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

  const handleRequestCreateAppointment = () => {
    if (!job) return;
    // Pre-popola cliente dal job
    if (clienti.length > 0) {
      setSelectedClienteForEvent(clienti[0]);
    }
    setNewEventTitle(`Appuntamento - ${job.nomeEvento}`);
    openCalendarDialog();
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
        description: error instanceof Error ? error.message : 'Errore durante l\'aggiornamento',
        variant: 'destructive'
      });
    }
  });
  
  // Mutation per salvare orario/note appuntamento di un cliente
  const saveAppuntamentoMutation = useMutation({
    mutationFn: async ({ clienteId, orario, note }: { clienteId: string; orario: string; note: string }) => {
      if (!job || !user) throw new Error('Job o utente non disponibile');
      const existing = job.appuntamentiClienti || [];
      const updated = existing.filter(a => a.clienteId !== clienteId);
      if (orario) {
        updated.push({
          clienteId,
          orarioAppuntamento: orario,
          ...(note ? { noteAppuntamento: note } : {})
        });
      }
      await updateJob(jobId!, { appuntamentiClienti: updated.length > 0 ? updated : undefined }, user.uid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      toast({ title: 'Orario salvato', description: 'Appuntamento aggiornato correttamente' });
    },
    onError: (error) => {
      toast({
        title: 'Errore',
        description: error instanceof Error ? error.message : 'Impossibile salvare l\'orario',
        variant: 'destructive'
      });
    }
  });

  // Mutation per aggiungere cliente al job
  const addClienteToJobMutation = useMutation({
    mutationFn: async (clienteId: string) => {
      if (!job || !user) throw new Error('Job o utente non disponibile');
      const updatedClientiIds = [...(job.clientiIds || []), clienteId];
      await updateJob(jobId!, { clientiIds: updatedClientiIds }, user.uid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['clienti'] });
      toast({
        title: 'Cliente aggiunto',
        description: 'Il cliente è stato associato al lavoro'
      });
      setShowAddClienteDialog(false);
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
    openTemplateSelector();
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
    openConsultationDialog();
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
      const response = await apiRequest('POST', `/api/jobs/${job!.id}/send-consultation-request`, {
        templateId: selectedTemplateId,
        channel,
        dateFrom: consultationDateRange.from ? format(consultationDateRange.from, 'yyyy-MM-dd') : undefined,
        dateTo: consultationDateRange.to ? format(consultationDateRange.to, 'yyyy-MM-dd') : undefined,
      });
      const data = await response.json();

      if (channel === 'whatsapp' && data.whatsappLink) {
        window.open(data.whatsappLink, '_blank');
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

  const eventDateObj = convertFirestoreTimestamp(job.eventDate);
  const eventDateFormatted = job.dataNonDefinita 
    ? 'Da definire' 
    : eventDateObj 
      ? format(eventDateObj, 'dd MMMM yyyy', { locale: it }) 
      : 'Data non disponibile';

  const timeInfo = job.dataNonDefinita 
    ? 'In trattativa' 
    : !job.allDay && job.startTime 
      ? `${job.startTime}${job.endTime ? ` - ${job.endTime}` : ''}` 
      : 'Tutto il giorno';

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
                  {job.eventLocation && ` • ${job.eventLocation}`}
                  {job.rituLocation && ` • ${job.rituLocation}`}
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
                  onClick={() => openQuoteBuilder(null)}
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


        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 lg:pb-8">
        {/* Quick Actions Bar */}
        <div className="mb-6 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between bg-gradient-to-r from-blue-gray/5 to-sage/5 p-4 rounded-lg border border-sage/20">
          <JobCompletedToggle 
            jobId={job.id} 
            currentJob={job}
            className="flex-shrink-0"
          />

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenTemplateSelector}
              data-testid="button-send-consultation"
              className="bg-white hover:bg-sage/10 border-sage/30"
            >
              <Eye className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline"> Appuntamento Consulenza</span>
              <span className="sm:hidden">Consulenza</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRequestCreateAppointment}
              data-testid="button-request-appointment-header"
              className="bg-white hover:bg-sage/10 border-sage/30"
            >
              <CalendarPlus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Richiedi Appuntamento</span>
              <span className="sm:hidden">Appuntamento</span>
            </Button>
          </div>
        </div>

        {/* Financial Summary - Enhanced */}
        <FinancialSummaryCard
          totalePreventivato={jobFinancials.totalePreventivato}
          totalePagato={jobFinancials.totalePagato}
          saldoResiduo={jobFinancials.saldoResiduo}
          totaleCosti={jobFinancials.totaleCosti}
          className="mb-6 shadow-md"
        />

        {/* Main Content - Modern Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column - Primary Info */}
            <div className="lg:col-span-7 space-y-6">
              {/* Clienti Section */}
              <Card className="shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="bg-gradient-to-r from-blue-gray/5 to-transparent">
                  <CardTitle className="flex items-center gap-2">
                    <span>Clienti</span>
                    <Badge variant="outline" className="ml-auto">{job.clientiIds?.length || 0}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {clientiLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {clienti.map(cliente => {
                        const appuntamento = job.appuntamentiClienti?.find(
                          app => app.clienteId === cliente.id
                        );
                        return (
                          <ClienteJobCard 
                            key={cliente.id} 
                            cliente={cliente}
                            appuntamento={appuntamento}
                            onEdit={() => setEditingCliente(cliente)}
                            onAppuntamentoSave={(clienteId, orario, note) =>
                              saveAppuntamentoMutation.mutateAsync({ clienteId, orario, note })
                            }
                          />
                        );
                      })}
                      
                      {/* Pulsante per aggiungere secondo cliente */}
                      {(job.clientiIds?.length || 0) < 2 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAddClienteDialog()}
                          className="w-full mt-3 border-dashed border-sage/50 hover:border-sage hover:bg-sage/5"
                          data-testid="button-add-second-cliente"
                        >
                          <UserPlus className="h-4 w-4 mr-2" />
                          Aggiungi secondo cliente
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Preventivi e Ordini */}
              <Card className="shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="bg-gradient-to-r from-sage/5 to-transparent">
                  <CardTitle>Preventivi e Ordini</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <ModuliJobSection 
                    jobId={job.id}
                    clienteId={job.clientiIds?.[0] || ''}
                    onCreateModulo={() => openQuoteBuilder(null)}
                    onEditQuote={(quoteId) => openQuoteBuilder(quoteId)}
                    isAdmin={true}
                  />
                </CardContent>
              </Card>

              {/* Pagamenti */}
              <Card className="shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="bg-gradient-to-r from-green-50 to-transparent dark:from-green-950/20">
                  <CardTitle>Pagamenti e Scadenze</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <PaymentScheduleSection 
                    jobId={job.id}
                    eventDate={eventDateObj}
                    isAdmin={true}
                    legacyFinancials={job.financials}
                    jobSource={job.jobSource}
                    clientEmail={clienti[0]?.email}
                    clientName={clienti[0] ? `${clienti[0].nome} ${clienti[0].cognome}` : undefined}
                    eventName={job.nomeEvento}
                    onGeneratePayments={!quotesLoading ? () => {
                      const signedQuote = quotes?.find(q => q.status === 'firmato');
                      if (signedQuote) {
                        setGeneraPagamentiQuoteId(signedQuote.id);
                      } else {
                        toast({
                          title: 'Nessun preventivo firmato',
                          description: 'Per generare un piano pagamenti è necessario avere almeno un preventivo firmato.',
                          variant: 'destructive',
                        });
                      }
                    } : undefined}
                  />
                </CardContent>
              </Card>

              {/* Note Interne (dalla creazione del lavoro) */}
              {job.noteInterne && (
                <Card className="shadow-sm hover:shadow-md transition-shadow border-amber-200/50">
                  <CardHeader className="bg-gradient-to-r from-amber-50 to-transparent dark:from-amber-950/20 pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="h-5 w-5 text-amber-600" />
                      Note Interne
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {job.noteInterne}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Note e Personalizzazioni */}
              <JobNotesSection job={job} />

              {/* Gallerie Associate */}
              <Card className="shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-transparent dark:from-blue-950/20">
                  <CardTitle className="flex items-center gap-2">
                    <Image className="h-5 w-5 text-blue-600" />
                    Gallerie Associate
                    <Badge variant="outline" className="ml-auto">{linkedGalleries.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {linkedGalleries.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <Image className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nessuna galleria collegata a questo lavoro.</p>
                      <p className="text-xs mt-1">Collega una galleria dalla sezione "Gestione Gallerie" → Modifica → Tipo Evento & Lavoro.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {linkedGalleries.map(g => (
                        <div key={g.id} className="rounded-lg border border-blue-100 bg-blue-50/50 hover:shadow-sm transition-shadow overflow-hidden">
                          {/* Info riga */}
                          <div className="flex items-center gap-3 p-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">{g.name}</p>
                                {g.active === false && (
                                  <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-600">Disattivata</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <code className="text-[10px] bg-white px-1.5 py-0.5 rounded border text-gray-500">{g.code}</code>
                                {g.date && <span className="text-xs text-muted-foreground">{g.date}</span>}
                                {g.jobType && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded border bg-terracotta/10 text-terracotta border-terracotta/20 font-medium">{g.jobType}</span>
                                )}
                                <span className="text-xs text-muted-foreground">{g.photoCount} foto</span>
                              </div>
                            </div>
                          </div>
                          {/* Quick actions */}
                          <div className="border-t border-blue-100 bg-white/60 px-3 py-2 flex items-center gap-1.5 flex-wrap">
                            {/* Visualizza pubblica */}
                            <Link to={`/gallery/${g.code}`}>
                              <Button variant="outline" size="icon" className="h-8 w-8 bg-green-50 hover:bg-green-100 border-green-200" title="Visualizza galleria (bypass admin)">
                                <Eye className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                            </Link>
                            {/* Condividi */}
                            <ShareGalleryButton
                              galleryId={g.id}
                              galleryCode={g.code}
                              galleryName={g.name}
                              clientPhone={clienti[0]?.whatsapp || clienti[0]?.cellulare1}
                              clientName={clienti[0] ? `${clienti[0].nome} ${clienti[0].cognome}`.trim() : undefined}
                            />
                            {/* Gestisci */}
                            <Link to={`/admin/gallery/${g.id}/manage`}>
                              <Button variant="outline" size="icon" className="h-8 w-8 bg-blue-50 hover:bg-blue-100 border-blue-200" title="Gestisci galleria">
                                <FolderOpen className="h-3.5 w-3.5 text-blue-600" />
                              </Button>
                            </Link>
                            {/* Attiva/Disattiva */}
                            <Button
                              variant={g.active !== false ? "destructive" : "default"}
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => toggleLinkedGalleryStatus(g)}
                              title={g.active !== false ? 'Disattiva galleria' : 'Attiva galleria'}
                            >
                              {g.active !== false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </Button>
                            {/* Questionario */}
                            <Link to={`/admin/galleries/${g.id}/questionnaire`}>
                              <Button variant="outline" size="icon" className="h-8 w-8 bg-purple-50 hover:bg-purple-100 border-purple-200" title="Gestisci questionario">
                                <HelpCircle className="h-3.5 w-3.5 text-purple-600" />
                              </Button>
                            </Link>
                            {/* Elimina */}
                            <Button
                              variant="destructive"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => deleteLinkedGallery(g)}
                              title="Elimina galleria"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Secondary Info */}
            <div className="lg:col-span-5 space-y-6">
            {/* Stato Preventivi */}
              <Card className="shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="bg-gradient-to-r from-terracotta/5 to-transparent">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Stato Preventivi
                    <Badge variant="outline" className="ml-auto">{quotes?.length || 0}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
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
                                {quote.createdAt && (() => {
                                  try {
                                    let dateToFormat: Date;
                                    if (quote.createdAt instanceof Date) {
                                      dateToFormat = quote.createdAt;
                                    } else if ((quote.createdAt as any)?.toDate) {
                                      dateToFormat = (quote.createdAt as any).toDate();
                                    } else if ((quote.createdAt as any)?._seconds) {
                                      dateToFormat = new Date((quote.createdAt as any)._seconds * 1000);
                                    } else {
                                      dateToFormat = new Date(quote.createdAt as any);
                                    }
                                    if (isNaN(dateToFormat.getTime())) return '';
                                    return format(dateToFormat, 'PPP', { locale: it });
                                  } catch {
                                    return '';
                                  }
                                })()}
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

                        {/* Email Status Badge */}
                        <div className="border-t px-4 py-3 bg-muted/10 flex items-center justify-between">
                          <QuoteEmailStatusBadge quote={quote} />
                          <SendQuoteEmailButton 
                            quote={quote}
                            onEmailSent={() => queryClient.invalidateQueries({ queryKey: ['jobs', jobId] })}
                          />
                        </div>

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

              {/* Collaboratori */}
              <JobCollaboratoriSection jobId={job.id} />

              {/* Costi */}
              <Card className="shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="bg-gradient-to-r from-orange-50 to-transparent dark:from-orange-950/20">
                  <CardTitle>Costi Lavoro</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
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
                <Card className="shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="bg-gradient-to-r from-purple-50 to-transparent dark:from-purple-950/20">
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Attività Recenti
                      <Badge variant="outline" className="ml-auto">{timelineEvents.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                  <div className="space-y-3">
                    {timelineEvents.slice(0, 10).map((event) => {
                      // Handle various date formats: Firestore Timestamp, Date, ISO string
                      let eventDate: Date;
                      try {
                        if (event.data?.toDate) {
                          eventDate = event.data.toDate();
                        } else if (event.data instanceof Date) {
                          eventDate = event.data;
                        } else if (typeof event.data === 'string') {
                          eventDate = new Date(event.data);
                        } else if ((event.data as any)?.seconds !== undefined) {
                          // Firestore Timestamp serialized format (seconds or _seconds)
                          eventDate = new Date((event.data as any).seconds * 1000);
                        } else if ((event.data as any)?._seconds !== undefined) {
                          eventDate = new Date((event.data as any)._seconds * 1000);
                        } else {
                          eventDate = new Date();
                        }
                        // Validate date
                        if (isNaN(eventDate.getTime())) {
                          eventDate = new Date();
                        }
                      } catch {
                        eventDate = new Date();
                      }
                      const tipoEvento = event.tipo as string;
                      const Icon = tipoEvento === 'email_recensione_inviata'
                        ? Star
                        : tipoEvento === 'consulenza_inviata' || tipoEvento === 'quote_sent' || tipoEvento === 'preventivo_inviato'
                        ? Send
                        : tipoEvento === 'appuntamento_creato' || tipoEvento === 'calendar_event'
                        ? CalendarIcon
                        : CheckCircle;

                      // Badge recensione: mostrato sull'evento status_change→consegnato
                      const isConsegnatoEvent = tipoEvento === 'status_change' &&
                        (event.descrizione || '').toLowerCase().includes('consegnato');

                      return (
                        <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                          <div className="flex-shrink-0 mt-0.5">
                            <Icon className={`h-4 w-4 ${tipoEvento === 'email_recensione_inviata' ? 'text-yellow-500' : 'text-primary'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {event.descrizione}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(eventDate, 'dd MMMM yyyy • HH:mm', { locale: it })}
                            </p>
                            {isConsegnatoEvent && reviewStatus?.found && (
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                <span className="inline-flex items-center gap-1 text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-full px-2 py-0.5">
                                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                  Email recensione inviata
                                  {reviewStatus.sentCount && reviewStatus.sentCount > 1
                                    ? ` (×${reviewStatus.sentCount})`
                                    : ''}
                                </span>
                                {reviewStatus.clicked && (
                                  <span className="inline-flex items-center gap-1 text-xs bg-green-50 border border-green-200 text-green-700 rounded-full px-2 py-0.5">
                                    <CheckCircle className="h-3 w-3" />
                                    Link cliccato
                                  </span>
                                )}
                              </div>
                            )}
                            {isConsegnatoEvent && reviewStatus && !reviewStatus.found && (
                              <span className="inline-flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                                <Star className="h-3 w-3" />
                                Email recensione non inviata
                              </span>
                            )}
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

        {/* Moduli Informativi - Full Width */}
        <div ref={moduliSectionRef} className="scroll-mt-4 mt-6">
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="bg-gradient-to-r from-[#6b7f6b]/5 to-transparent">
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-[#6b7f6b]" />
                Moduli Informativi
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <InfoFormJobSection
                jobId={job.id}
                jobName={job.nomeEvento}
                hideTitle
                clienti={clienti.map(c => ({
                  id: c.id,
                  nome: c.nome,
                  cognome: c.cognome,
                  email: c.email,
                  whatsapp: c.whatsapp,
                  cellulare1: c.cellulare1,
                }))}
              />
            </CardContent>
          </Card>
        </div>

        {/* Quote Builder Modal */}
        {(job.clientiIds?.length || 0) > 0 && quoteBuilderOpen && jobType && (
          <QuoteBuilder
            open={quoteBuilderOpen}
            onClose={() => {
              setQuoteBuilderOpen(false);
              setEditingQuoteId(null);
              // Clean URL if it has editQuote param
              const urlParams = new URLSearchParams(location.split('?')[1]);
              if (urlParams.has('editQuote')) {
                navigate(`/admin/jobs/${jobId}`);
              }
            }}
            jobId={job.id}
            jobType={jobType}
            jobTypeSlug={job.jobType}
            clienteId={job.clientiIds?.[0] || ''}
            editQuoteId={editingQuoteId || undefined}
          />
        )}

        {/* Genera Pagamenti Modal */}
        {generaPagamentiQuoteId && (() => {
          const targetQuote = quotes?.find(q => q.id === generaPagamentiQuoteId);

          if (!targetQuote || !job.clientiIds?.[0]) return null;
          if (targetQuote.status !== 'firmato') {
            console.warn('Tentativo di generare piano pagamenti per preventivo non firmato');
            return null;
          }

          const totale = calculateQuoteTotalForPayments(targetQuote);

          return (
            <GeneraPagamentiModal
              open={true}
              onClose={() => setGeneraPagamentiQuoteId(null)}
              quoteId={targetQuote.id}
              quoteTotale={totale}
              jobId={job.id}
              clienteId={job.clientiIds?.[0] || ''}
              eventDate={eventDateObj}
            />
          );
        })()}
      </div>

      {/* Edit Job Modal */}
      <EditJobModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        job={job}
      />

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

      {/* Add Cliente Dialog — ibrido: cerca esistente + crea nuovo */}
      <AssegnaClienteDialog
        open={showAddClienteDialog}
        onOpenChange={setShowAddClienteDialog}
        excludeClienteIds={job?.clientiIds ?? []}
        onSuccess={(cliente) => {
          addClienteToJobMutation.mutate(cliente.id);
        }}
      />

      {/* Create Calendar Event Modal */}
      <Dialog open={showCalendarDialog} onOpenChange={setShowCalendarDialog}>
        <DialogContent 
          className="max-w-2xl"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
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
                <TimeInput
                  id="start-time"
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
        <DialogContent 
          className="max-w-2xl"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
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
      <Dialog open={showConsultationDialog} onOpenChange={(open) => {
        setShowConsultationDialog(open);
        if (!open) {
          setConsultationDateRange({ from: undefined, to: undefined });
        }
      }}>
        <DialogContent 
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Invia Richiesta Consulenza</DialogTitle>
            <DialogDescription>
              Scegli come inviare la richiesta di appuntamento al cliente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Date Range Picker */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Limita date disponibili (opzionale)
              </Label>
              <p className="text-xs text-muted-foreground">
                Il cliente potrà prenotare solo nelle date selezionate
              </p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !consultationDateRange.from && "text-muted-foreground"
                    )}
                  >
                    <CalendarRange className="mr-2 h-4 w-4" />
                    {consultationDateRange.from ? (
                      consultationDateRange.to ? (
                        <>
                          {format(consultationDateRange.from, "dd MMM", { locale: it })} - {format(consultationDateRange.to, "dd MMM yyyy", { locale: it })}
                        </>
                      ) : (
                        format(consultationDateRange.from, "dd MMMM yyyy", { locale: it })
                      )
                    ) : (
                      "Tutte le date disponibili"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[100]" align="start">
                  <Calendar
                    mode="range"
                    selected={consultationDateRange}
                    onSelect={(range) => setConsultationDateRange({ from: range?.from, to: range?.to })}
                    numberOfMonths={2}
                    locale={it}
                    disabled={(date) => date < new Date()}
                    modifiers={{ busy: (date) => busyDaySet.has(format(date, 'yyyy-MM-dd')) }}
                    modifiersClassNames={{
                      busy: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1.5 after:w-1.5 after:rounded-full after:bg-amber-500",
                    }}
                  />
                  {consultationDateRange.from && (
                    <div className="p-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => setConsultationDateRange({ from: undefined, to: undefined })}
                      >
                        Rimuovi filtro date
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Contesto calendario reale: impegni Google + anteprima slot cliente */}
            <div className="space-y-3" data-testid="consultation-calendar-context">
              {loadingConsultationCalendar ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Carico i tuoi impegni da Google Calendar…
                </div>
              ) : consultationCalendarError ? (
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-700 dark:text-amber-400">
                  Impossibile verificare Google Calendar in questo momento. Puoi comunque inviare la richiesta.
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                  I giorni con il puntino hanno già impegni sul tuo calendario
                </p>
              )}

              {consultationDateRange.from && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  {/* Impegni reali nel range */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium flex items-center gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      I tuoi impegni in queste date
                    </p>
                    {consultationEventsInRange.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nessun impegno: queste date sono libere sul tuo calendario.
                      </p>
                    ) : (
                      <ul className="space-y-1 max-h-32 overflow-y-auto pr-1" data-testid="consultation-events-list">
                        {consultationEventsInRange.map((ev) => (
                          <li key={ev.id} className="flex items-center gap-2 text-xs">
                            <span className="font-medium tabular-nums whitespace-nowrap">
                              {format(new Date(ev.start), 'dd MMM HH:mm', { locale: it })}
                            </span>
                            <span className="truncate">{ev.title}</span>
                            <Badge variant="outline" className="ml-auto shrink-0 text-[10px] capitalize">
                              {ev.type === 'google' ? 'Google' : ev.type === 'consulenza' ? 'Consulenza' : 'Lavoro'}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Anteprima slot che vedrebbe il cliente */}
                  {selectedTemplateId && (
                    <div className="space-y-1.5 border-t pt-2">
                      <p className="text-xs font-medium flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        Slot che vedrebbe il cliente
                      </p>
                      {loadingConsultationSlotPreview ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Calcolo gli slot disponibili…
                        </div>
                      ) : consultationSlotPreview.length === 0 ? (
                        <p className="text-xs text-muted-foreground">—</p>
                      ) : (
                        <ul className="space-y-1.5" data-testid="consultation-slot-preview">
                          {consultationSlotPreview.map((d) => (
                            <li key={d.date} className="text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="capitalize">
                                  {format(parseISO(d.date), 'EEE dd MMM', { locale: it })}
                                </span>
                                {d.count > 0 ? (
                                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                    {d.count} slot liberi
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">{d.message || 'Nessuno slot'}</span>
                                )}
                              </div>
                              {d.labels.length > 0 && (
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {d.labels.join(' · ')}
                                  {d.count > d.labels.length ? ' …' : ''}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {consultationRangeDays.length > 3 && (
                        <p className="text-[10px] text-muted-foreground">
                          Anteprima dei primi 3 giorni del periodo selezionato.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Channel Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Canale di invio</Label>
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
            onClick={() => openQuoteBuilder(null)}
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