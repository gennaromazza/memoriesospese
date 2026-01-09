/**
 * JOBS MANAGER - Vista Kanban Pipeline
 * Componente principale gestione lavori
 */

import { useState, useMemo, Fragment, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllJobs, deleteMultipleJobs, updateJob } from '@/lib/jobs';
import { getJobTypes } from '@/lib/job-types';
import { getAllClienti } from '@/lib/clienti';
import { db } from '@/lib/firebase';
import { collection, getDocs, query as firestoreQuery, where } from 'firebase/firestore';
import type { Order } from '@shared/booking-types';
import type { JobCollaboratoreAssignment } from '@shared/collaboratori-types';
import type { Quote } from '@shared/quotes-types';
import { convertFirestoreTimestamp } from '@/lib/firebase';
import type { Job, JobStatus, JobFilters } from '@shared/jobs-types';
import type { JobType as JobTypeDoc } from '@shared/job-types';
import type { Cliente } from '@shared/clienti-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Calendar as CalendarUI } from '@/components/ui/calendar';
import { JobCollaboratoriSection } from '@/components/jobs/JobCollaboratoriSection';
import {
  Plus,
  Search,
  Filter,
  Calendar,
  MapPin,
  Euro,
  User,
  Users,
  FileText,
  X,
  Trash2,
  Loader2,
  Check,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff
} from 'lucide-react';
import { format, isWithinInterval, startOfYear, endOfYear, differenceInDays, isFuture, isToday, isPast } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { JobTypeIcon } from '@/lib/job-type-icons';
import CreateJobModal from './CreateJobModal';

// Status pipeline labels
const STATUS_LABELS: Record<JobStatus, string> = {
  lead: 'Lead',
  preventivo_inviato: 'Preventivo Inviato',
  confermato: 'Confermato',
  shooting_fatto: 'Shooting Fatto',
  selezione_pending: 'Selezione Pending',
  produzione: 'Produzione',
  consegnato: 'Consegnato',
  archiviato: 'Archiviato'
};

// Status colors
const STATUS_COLORS: Record<JobStatus, string> = {
  lead: 'bg-gray-100 text-gray-700 border-gray-300',
  preventivo_inviato: 'bg-blue-100 text-blue-700 border-blue-300',
  confermato: 'bg-green-100 text-green-700 border-green-300',
  shooting_fatto: 'bg-purple-100 text-purple-700 border-purple-300',
  selezione_pending: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  produzione: 'bg-orange-100 text-orange-700 border-orange-300',
  consegnato: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  archiviato: 'bg-slate-100 text-slate-700 border-slate-300'
};


export default function JobsManager() {
  const [, navigate] = useLocation();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('matrimonio'); // Default: Matrimonio
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterSemester, setFilterSemester] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all'); // Nuovo: filtro mese
  const [filterQuoteStatus, setFilterQuoteStatus] = useState<string>('firmato'); // Nuovo: stato preventivo (default: firmato)
  const [timeFilter, setTimeFilter] = useState<'all' | 'upcoming' | 'past'>('upcoming'); // Filtro temporale (default: prossimi impegni)
  const [customDateRange, setCustomDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({ from: undefined, to: undefined });
  
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ current: number; total: number; jobName?: string } | null>(null);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  
  // Privacy toggle - nascondi statistiche finanziarie di default
  const [showFinancialStats, setShowFinancialStats] = useState(false);
  
  // Dialog gestione collaboratori inline
  const [collaboratoriDialogJobId, setCollaboratoriDialogJobId] = useState<string | null>(null);
  
  const { toast } = useToast();
  const { user } = useFirebaseAuth();
  const queryClient = useQueryClient();
  
  // Query jobs
  const { data: jobs = [], isLoading } = useQuery<Job[]>({
    queryKey: ['jobs'],
    queryFn: () => getAllJobs()
  });
  
  const deleteMutation = useMutation({
    mutationFn: async (jobIds: string[]) => {
      return deleteMultipleJobs(
        jobIds, 
        user?.uid || 'admin',
        (current, total, jobName) => {
          setDeleteProgress({ current, total, jobName });
        }
      );
    },
    onSuccess: (result) => {
      setDeleteProgress(null);
      setSelectedJobs(new Set());
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['galleries'] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      
      if (result.errors.length > 0) {
        toast({
          title: 'Eliminazione parziale',
          description: `Eliminati ${result.deletedJobs} lavori. ${result.errors.length} errori.`,
          variant: 'destructive'
        });
      } else {
        toast({
          title: 'Lavori eliminati',
          description: `Eliminati ${result.deletedJobs} lavori, ${result.deletedOrders} ordini, ${result.deletedGalleries} gallerie, ${result.deletedQuotes} preventivi.`,
        });
      }
    },
    onError: (error) => {
      setDeleteProgress(null);
      toast({
        title: 'Errore',
        description: 'Impossibile eliminare i lavori selezionati',
        variant: 'destructive'
      });
    }
  });
  
  // Mutation per aggiornare tipo lavoro inline
  const updateJobTypeMutation = useMutation({
    mutationFn: async ({ jobId, newJobType }: { jobId: string; newJobType: string }) => {
      return updateJob(jobId, { jobType: newJobType }, user?.uid || 'admin');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast({
        title: 'Tipo aggiornato',
        description: 'Il tipo lavoro è stato modificato',
      });
    },
    onError: () => {
      toast({
        title: 'Errore',
        description: 'Impossibile aggiornare il tipo lavoro',
        variant: 'destructive'
      });
    }
  });
  
  // Query job types dinamici
  const { data: jobTypes = [] } = useQuery<JobTypeDoc[]>({
    queryKey: ['jobTypes'],
    queryFn: getJobTypes
  });
  
  // Query tutti i clienti (per ricerca nomi)
  const { data: clienti = [] } = useQuery<Cliente[]>({
    queryKey: ['clienti'],
    queryFn: getAllClienti
  });
  
  // Query collaboratori assegnati ai job (con nomi e conteggi)
  const { data: collaboratoriByJob = {} } = useQuery<Record<string, { count: number; nomi: string[] }>>({
    queryKey: ['jobCollaboratoriDetails'],
    queryFn: async () => {
      // Carica tutti gli assignment
      const assignmentsSnapshot = await getDocs(collection(db, 'jobCollaboratoreAssignments'));
      
      // Carica tutti i collaboratori per avere i nomi
      const collaboratoriSnapshot = await getDocs(collection(db, 'collaboratori'));
      const collaboratoriMap: Record<string, string> = {};
      collaboratoriSnapshot.docs.forEach(doc => {
        const data = doc.data();
        collaboratoriMap[doc.id] = `${data.nome || ''} ${data.cognome || ''}`.trim();
      });
      
      const details: Record<string, { count: number; nomi: string[] }> = {};
      assignmentsSnapshot.docs.forEach(doc => {
        const data = doc.data() as JobCollaboratoreAssignment;
        if (data.jobId) {
          if (!details[data.jobId]) {
            details[data.jobId] = { count: 0, nomi: [] };
          }
          details[data.jobId].count += 1;
          const nome = collaboratoriMap[data.collaboratoreId];
          if (nome) {
            details[data.jobId].nomi.push(nome);
          }
        }
      });
      return details;
    }
  });
  
  // Query pagamenti per job - carica tutti gli ordini in un'unica query
  const { data: pagamentiByJob = {} } = useQuery<Record<string, number>>({
    queryKey: ['jobPagamentiCounts'],
    queryFn: async () => {
      // Carica tutti gli ordini una volta sola
      const ordersSnapshot = await getDocs(collection(db, 'orders'));
      const ordersMap: Record<string, number> = {};
      
      // Mappa orderId -> numero transazioni (include legacy)
      ordersSnapshot.docs.forEach(doc => {
        const data = doc.data() as Order;
        // Usa transactions se presente, altrimenti conta legacy acconto
        if (data.transactions && data.transactions.length > 0) {
          ordersMap[doc.id] = data.transactions.length;
        } else if (data.acconto && data.acconto > 0) {
          // Legacy: se c'è un acconto senza transactions, conta come 1
          ordersMap[doc.id] = 1;
        } else {
          ordersMap[doc.id] = 0;
        }
      });
      
      return ordersMap;
    },
    staleTime: 30000 // Cache per 30 secondi
  });
  
  // Query tutti i preventivi per determinare stato firma (supporta job legacy)
  const { data: quotesByJob = {} } = useQuery<Record<string, { hasQuote: boolean; isSigned: boolean; isEmailSent: boolean }>>({
    queryKey: ['jobQuotesStatus'],
    queryFn: async () => {
      const quotesSnapshot = await getDocs(collection(db, 'quotes'));
      const statusMap: Record<string, { hasQuote: boolean; isSigned: boolean; isEmailSent: boolean }> = {};
      
      quotesSnapshot.docs.forEach(doc => {
        const quote = doc.data() as Quote;
        const jobId = quote.jobId;
        if (!jobId) return;
        
        // Controlla firma: signature presente OPPURE status === 'firmato'
        const quoteIsSigned = !!quote.signature || quote.status === 'firmato';
        // Controlla invio: emailSentAt, sentTo, oppure status non è 'bozza'
        const quoteIsEmailSent = !!quote.emailSentAt || !!quote.sentTo || 
          (quote.status && quote.status !== 'bozza');
        
        // Se già esiste una entry, aggiorna solo se migliora lo stato
        if (!statusMap[jobId]) {
          statusMap[jobId] = {
            hasQuote: true,
            isSigned: quoteIsSigned,
            isEmailSent: quoteIsEmailSent
          };
        } else {
          // Se c'è un preventivo firmato, marca come firmato
          if (quoteIsSigned) {
            statusMap[jobId].isSigned = true;
          }
          // Se almeno un preventivo è stato inviato
          if (quoteIsEmailSent) {
            statusMap[jobId].isEmailSent = true;
          }
        }
      });
      
      return statusMap;
    },
    staleTime: 30000
  });
  
  // Deriva conteggio transazioni per job dai dati caricati
  const transazioniPerJob = useMemo(() => {
    const counts: Record<string, number> = {};
    jobs.forEach(job => {
      if (job.orderIds && job.orderIds.length > 0) {
        let total = 0;
        job.orderIds.forEach(orderId => {
          total += pagamentiByJob[orderId] || 0;
        });
        if (total > 0) {
          counts[job.id] = total;
        }
      }
    });
    return counts;
  }, [jobs, pagamentiByJob]);
  
  // Crea mappa slug -> JobType per lookup veloci
  const jobTypeMap = useMemo(() => {
    const map: Record<string, JobTypeDoc> = {};
    jobTypes.forEach(jt => {
      map[jt.slug] = jt;
    });
    return map;
  }, [jobTypes]);
  
  // Crea mappa clienteId -> nome completo per ricerca
  const clienteNamesMap = useMemo(() => {
    const map: Record<string, string> = {};
    clienti.forEach(c => {
      map[c.id] = `${c.nome} ${c.cognome}`.trim();
    });
    return map;
  }, [clienti]);
  
  // Anni disponibili (per dropdown)
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    jobs.forEach(job => {
      if (job.eventDate) {
        const date = convertFirestoreTimestamp(job.eventDate);
        if (date && !isNaN(date.getTime())) {
          years.add(date.getFullYear());
        }
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [jobs]);
  
  // Conteggio lavori per tipo (esclude archiviati)
  const jobCountsByType = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    jobs.forEach(job => {
      if (job.status !== 'archiviato') {
        counts.all = (counts.all || 0) + 1;
        counts[job.jobType] = (counts[job.jobType] || 0) + 1;
      }
    });
    return counts;
  }, [jobs]);
  
  // Mesi disponibili per l'anno selezionato
  const availableMonths = useMemo(() => {
    if (filterYear === 'all') return [];
    const months = new Set<number>();
    const year = parseInt(filterYear);
    jobs.forEach(job => {
      if (job.eventDate) {
        const date = convertFirestoreTimestamp(job.eventDate);
        if (date && !isNaN(date.getTime()) && date.getFullYear() === year) {
          months.add(date.getMonth() + 1); // 1-12
        }
      }
    });
    return Array.from(months).sort((a, b) => a - b);
  }, [jobs, filterYear]);

  // Filtra jobs
  const filteredJobs = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Helper per ricerca testuale
    const matchesSearch = (job: typeof jobs[0], query: string): boolean => {
      const nomeEvento = job.nomeEvento?.toLowerCase() || '';
      const eventLocation = (job.eventLocation || job.rituLocation || (job as any).locationCerimonia || '').toLowerCase();
      const note = job.noteInterne?.toLowerCase() || '';
      
      const clientIds = job.clientiIds?.length 
        ? job.clientiIds 
        : ((job as any).clienteId ? [(job as any).clienteId] : []);
      const clientiNames = clientIds
        .map((id: string) => clienteNamesMap[id]?.toLowerCase() || '')
        .join(' ');
      
      return nomeEvento.includes(query) || 
             eventLocation.includes(query) || 
             note.includes(query) ||
             clientiNames.includes(query);
    };
    
    // Se c'è una ricerca attiva, cerca in TUTTI i lavori (ignora filtri)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return jobs.filter(job => {
        // Escludi sempre archiviati
        if (job.status === 'archiviato') return false;
        return matchesSearch(job, query);
      });
    }
    
    // Senza ricerca, applica normalmente i filtri
    return jobs.filter(job => {
      // Escludi archiviati dalla vista principale
      if (job.status === 'archiviato') return false;
      
      // Filtro tempo (Prossimi Impegni / Impegni Passati)
      if (timeFilter !== 'all' && job.eventDate) {
        const eventDate = convertFirestoreTimestamp(job.eventDate);
        if (eventDate && !isNaN(eventDate.getTime())) {
          const eventTime = eventDate.getTime();
          const todayTime = startOfToday.getTime();
          
          if (timeFilter === 'upcoming' && eventTime < todayTime) return false;
          if (timeFilter === 'past' && eventTime >= todayTime) return false;
        }
      }
      
      // Filtro tipo
      if (filterType !== 'all' && job.jobType !== filterType) return false;
      
      // Filtro stato preventivo - usa dati reali dai preventivi + status job come fallback
      if (filterQuoteStatus !== 'all') {
        // Usa la mappa quotesByJob che legge direttamente dalla collezione quotes
        const quoteStatus = quotesByJob[job.id];
        const hasQuote = quoteStatus?.hasQuote || false;
        
        // IMPORTANTE: Un job è considerato "firmato" se:
        // 1. Il preventivo ha signature o status 'firmato' OPPURE
        // 2. Il job è in stato confermato o successivo (fallback per job legacy)
        const confirmedJobStatuses = ['confermato', 'shooting_fatto', 'selezione_pending', 'produzione', 'consegnato'];
        const jobIsConfirmed = confirmedJobStatuses.includes(job.status);
        const isSigned = quoteStatus?.isSigned || jobIsConfirmed;
        
        const isEmailSent = quoteStatus?.isEmailSent || false;
        
        // Firmato: preventivo firmato OPPURE job confermato
        if (filterQuoteStatus === 'firmato' && !isSigned) return false;
        // Non firmato: ha preventivo inviato, NON firmato, e job NON confermato
        if (filterQuoteStatus === 'non_firmato' && (!hasQuote || isSigned || !isEmailSent)) return false;
        // Non inviato: non ha preventivo o ha preventivo non ancora inviato
        if (filterQuoteStatus === 'non_inviato' && (hasQuote && isEmailSent)) return false;
      }
      
      // Filtri date (precedenza: custom range > mese > anno+semestre > anno)
      if (job.eventDate) {
        const eventDate = convertFirestoreTimestamp(job.eventDate);
        
        if (eventDate && !isNaN(eventDate.getTime())) {
          // 1. Custom date range (massima priorità)
          if (customDateRange.from && customDateRange.to) {
            const inRange = isWithinInterval(eventDate, {
              start: customDateRange.from,
              end: customDateRange.to
            });
            if (!inRange) return false;
          }
          // 2. Anno + Mese specifico
          else if (filterYear !== 'all' && filterMonth !== 'all') {
            const year = parseInt(filterYear);
            const month = parseInt(filterMonth);
            const eventYear = eventDate.getFullYear();
            const eventMonth = eventDate.getMonth() + 1; // 1-12
            
            if (eventYear !== year || eventMonth !== month) return false;
          }
          // 3. Anno + Semestre
          else if (filterYear !== 'all' && filterSemester !== 'all') {
            const year = parseInt(filterYear);
            const eventYear = eventDate.getFullYear();
            const eventMonth = eventDate.getMonth() + 1; // 1-12
            
            if (eventYear !== year) return false;
            
            if (filterSemester === 'S1' && (eventMonth < 1 || eventMonth > 6)) return false;
            if (filterSemester === 'S2' && (eventMonth < 7 || eventMonth > 12)) return false;
          }
          // 4. Solo Anno
          else if (filterYear !== 'all') {
            const year = parseInt(filterYear);
            const eventYear = eventDate.getFullYear();
            if (eventYear !== year) return false;
          }
        }
      }
      
      return true;
    });
  }, [jobs, filterType, filterYear, filterSemester, filterMonth, filterQuoteStatus, timeFilter, customDateRange, searchQuery, clienteNamesMap, quotesByJob]);
  
  // Funzione helper per convertire date Firestore
  const toDate = (val: any): Date => {
    if (!val) return new Date(0);
    
    let result: Date;
    if (typeof val.toDate === 'function') {
      result = val.toDate();
    } else {
      result = new Date(val);
    }
    
    // Validate: fallback to epoch if invalid date
    if (!Number.isFinite(result.getTime())) {
      return new Date(0);
    }
    
    return result;
  };
  
  // Sort jobs in base al filtro temporale
  const sortedJobs = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return [...filteredJobs].sort((a, b) => {
      const dateA = toDate(a.eventDate);
      const dateB = toDate(b.eventDate);
      
      // Se filtro "past": ordina dal più recente (decrescente)
      if (timeFilter === 'past') {
        return dateB.getTime() - dateA.getTime();
      }
      
      // Se filtro "upcoming": ordina dal più vicino (crescente)
      if (timeFilter === 'upcoming') {
        return dateA.getTime() - dateB.getTime();
      }
      
      // Se filtro "all": logica mista (futuri prima, poi passati)
      const aIsFuture = dateA >= startOfToday;
      const bIsFuture = dateB >= startOfToday;
      
      // Se uno è futuro e l'altro no, il futuro viene prima
      if (aIsFuture && !bIsFuture) return -1;
      if (!aIsFuture && bIsFuture) return 1;
      
      // Se entrambi futuri: ordina dal più vicino (crescente)
      if (aIsFuture && bIsFuture) {
        return dateA.getTime() - dateB.getTime();
      }
      
      // Se entrambi passati: ordina dal più recente (decrescente)
      return dateB.getTime() - dateA.getTime();
    });
  }, [filteredJobs, timeFilter]);
  
  // Paginated jobs
  const paginatedJobs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedJobs.slice(startIndex, endIndex);
  }, [sortedJobs, currentPage, itemsPerPage]);
  
  const totalPages = Math.ceil(sortedJobs.length / itemsPerPage);
  
  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, filterYear, filterSemester, timeFilter, customDateRange, searchQuery]);
  
  // Clamp currentPage when totalPages decreases (e.g., after deletion or filtering)
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);
  
  // Stats
  const stats = useMemo(() => {
    return {
      totalJobs: filteredJobs.length,
      totalePreventivato: filteredJobs.reduce((sum, j) => 
        sum + j.financials.totalePreventivato, 0
      ),
      totalePagato: filteredJobs.reduce((sum, j) => 
        sum + j.financials.totalePagato, 0
      ),
      saldoResiduo: filteredJobs.reduce((sum, j) => 
        sum + j.financials.saldoResiduo, 0
      )
    };
  }, [filteredJobs]);
  
  const toggleSelectJob = (jobId: string) => {
    const newSelected = new Set(selectedJobs);
    if (newSelected.has(jobId)) {
      newSelected.delete(jobId);
    } else {
      newSelected.add(jobId);
    }
    setSelectedJobs(newSelected);
  };
  
  const toggleSelectAll = () => {
    if (selectedJobs.size === sortedJobs.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(sortedJobs.map(j => j.id)));
    }
  };
  
  const handleDeleteSelected = () => {
    if (selectedJobs.size === 0) return;
    setDeleteDialogOpen(true);
  };
  
  const confirmDelete = () => {
    setDeleteDialogOpen(false);
    deleteMutation.mutate(Array.from(selectedJobs));
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-playfair font-bold text-blue-gray">
            Gestione Lavori
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {selectedJobs.size > 0 ? (
              <span className="text-red-600 font-medium">
                {selectedJobs.size} lavori selezionati
              </span>
            ) : (
              `${stats.totalJobs} lavori attivi`
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {selectedJobs.size > 0 && (
            <Button
              onClick={handleDeleteSelected}
              variant="destructive"
              disabled={deleteMutation.isPending}
              data-testid="button-delete-selected"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminazione...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Elimina ({selectedJobs.size})
                </>
              )}
            </Button>
          )}
          <Button
            onClick={() => setCreateModalOpen(true)}
            className="bg-sage hover:bg-dark-sage"
            data-testid="button-create-job"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuovo Lavoro
          </Button>
        </div>
      </div>
      
      {/* Stats cards - con toggle privacy */}
      <div className="relative">
        <div className="flex items-center justify-end mb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFinancialStats(!showFinancialStats)}
            className="text-muted-foreground hover:text-foreground"
            data-testid="button-toggle-financial-stats"
            title={showFinancialStats ? "Nascondi statistiche" : "Mostra statistiche"}
          >
            {showFinancialStats ? (
              <Eye className="w-4 h-4 mr-2" />
            ) : (
              <EyeOff className="w-4 h-4 mr-2" />
            )}
            {showFinancialStats ? "Nascondi" : "Mostra statistiche"}
          </Button>
        </div>
        
        {showFinancialStats ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-blue-gray">
                  {stats.totalJobs}
                </div>
                <p className="text-sm text-gray-600">Lavori Attivi</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">
                  €{stats.totalePreventivato.toLocaleString()}
                </div>
                <p className="text-sm text-gray-600">Preventivato</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-blue-600">
                  €{stats.totalePagato.toLocaleString()}
                </div>
                <p className="text-sm text-gray-600">Incassato</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-orange-600">
                  €{stats.saldoResiduo.toLocaleString()}
                </div>
                <p className="text-sm text-gray-600">Da Incassare</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="py-4 text-center text-muted-foreground text-sm">
              Statistiche nascoste per privacy
            </CardContent>
          </Card>
        )}
      </div>
      
      {/* Card Navigazione Tipi Lavoro */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-2 min-w-max">
          {/* Card "Tutti" */}
          <button
            onClick={() => setFilterType('all')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all min-w-[100px]",
              filterType === 'all'
                ? "bg-slate-100 border-slate-400 text-slate-800 shadow-sm"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            )}
            data-testid="card-filter-all"
          >
            <FileText className="w-5 h-5" />
            <div className="text-left">
              <div className="font-medium text-sm">Tutti</div>
              <div className="text-xs text-muted-foreground">{jobCountsByType.all || 0}</div>
            </div>
          </button>
          
          {/* Card per ogni tipo attivo */}
          {jobTypes
            .filter(jt => jt.attivo)
            .sort((a, b) => a.ordine - b.ordine)
            .map(jobType => (
              <button
                key={jobType.id}
                onClick={() => setFilterType(jobType.slug)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all min-w-[120px]",
                  filterType === jobType.slug
                    ? "shadow-sm"
                    : "bg-white hover:bg-opacity-10"
                )}
                style={{
                  borderColor: filterType === jobType.slug ? jobType.colore : '#e2e8f0',
                  backgroundColor: filterType === jobType.slug ? `${jobType.colore}15` : 'white',
                  color: filterType === jobType.slug ? jobType.colore : '#64748b'
                }}
                data-testid={`card-filter-${jobType.slug}`}
              >
                <JobTypeIcon slug={jobType.slug} size="lg" />
                <div className="text-left">
                  <div className="font-medium text-sm" style={{ color: filterType === jobType.slug ? jobType.colore : '#334155' }}>
                    {jobType.nome}
                  </div>
                  <div className="text-xs opacity-70">{jobCountsByType[jobType.slug] || 0}</div>
                </div>
              </button>
            ))}
        </div>
      </div>
      
      {/* Filters */}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[250px] relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Cerca per evento, location, clienti, note..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-jobs"
            />
          </div>
          
          {/* Filtro Periodo (Prossimi/Passati) */}
          <Select value={timeFilter} onValueChange={(val: 'all' | 'upcoming' | 'past') => setTimeFilter(val)}>
            <SelectTrigger className="w-44" data-testid="select-filter-time">
              <SelectValue placeholder="Periodo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">Prossimi Impegni</SelectItem>
              <SelectItem value="past">Impegni Passati</SelectItem>
              <SelectItem value="all">Tutti</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Filtro Stato Preventivo */}
          <Select value={filterQuoteStatus} onValueChange={setFilterQuoteStatus}>
            <SelectTrigger className="w-44" data-testid="select-filter-quote">
              <SelectValue placeholder="Stato Preventivo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i preventivi</SelectItem>
              <SelectItem value="firmato">Firmato</SelectItem>
              <SelectItem value="non_firmato">Non firmato</SelectItem>
              <SelectItem value="non_inviato">Non inviato</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Filtro Anno */}
          <Select value={filterYear} onValueChange={(val) => {
            setFilterYear(val);
            setFilterMonth('all'); // Reset mese quando cambia anno
            setFilterSemester('all'); // Reset semestre
          }}>
            <SelectTrigger className="w-28" data-testid="select-filter-year">
              <SelectValue placeholder="Anno" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              {availableYears.map(year => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Filtro Mese */}
          <Select 
            value={filterMonth} 
            onValueChange={(val) => {
              setFilterMonth(val);
              if (val !== 'all') setFilterSemester('all'); // Reset semestre se scelgo mese
            }}
            disabled={filterYear === 'all'}
          >
            <SelectTrigger className="w-32" data-testid="select-filter-month">
              <SelectValue placeholder="Mese" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i mesi</SelectItem>
              {[
                { val: '1', label: 'Gennaio' },
                { val: '2', label: 'Febbraio' },
                { val: '3', label: 'Marzo' },
                { val: '4', label: 'Aprile' },
                { val: '5', label: 'Maggio' },
                { val: '6', label: 'Giugno' },
                { val: '7', label: 'Luglio' },
                { val: '8', label: 'Agosto' },
                { val: '9', label: 'Settembre' },
                { val: '10', label: 'Ottobre' },
                { val: '11', label: 'Novembre' },
                { val: '12', label: 'Dicembre' }
              ].filter(m => availableMonths.includes(parseInt(m.val)) || availableMonths.length === 0)
               .map(month => (
                <SelectItem key={month.val} value={month.val}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Filtro Semestre (alternativo al mese) */}
          <Select 
            value={filterSemester} 
            onValueChange={(val) => {
              setFilterSemester(val);
              if (val !== 'all') setFilterMonth('all'); // Reset mese se scelgo semestre
            }}
            disabled={filterYear === 'all' || filterMonth !== 'all'}
          >
            <SelectTrigger className="w-32" data-testid="select-filter-semester">
              <SelectValue placeholder="Semestre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutto</SelectItem>
              <SelectItem value="S1">1° Sem</SelectItem>
              <SelectItem value="S2">2° Sem</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Custom Date Range */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-64 justify-start text-left font-normal",
                  !customDateRange.from && "text-muted-foreground"
                )}
                data-testid="button-custom-date-range"
              >
                <Calendar className="mr-2 h-4 w-4" />
                {customDateRange.from ? (
                  customDateRange.to ? (
                    <>
                      {format(customDateRange.from, "dd MMM yyyy", { locale: it })} -{" "}
                      {format(customDateRange.to, "dd MMM yyyy", { locale: it })}
                    </>
                  ) : (
                    format(customDateRange.from, "dd MMM yyyy", { locale: it })
                  )
                ) : (
                  <span>Range personalizzato</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarUI
                mode="range"
                defaultMonth={customDateRange.from}
                selected={{
                  from: customDateRange.from,
                  to: customDateRange.to
                }}
                onSelect={(range) => {
                  setCustomDateRange({
                    from: range?.from,
                    to: range?.to
                  });
                  // Reset year/semester/month quando usi custom range
                  if (range?.from && range?.to) {
                    setFilterYear('all');
                    setFilterMonth('all');
                    setFilterSemester('all');
                  }
                }}
                numberOfMonths={2}
                locale={it}
              />
            </PopoverContent>
          </Popover>
          
          {/* Clear Filters Button */}
          {(filterType !== 'matrimonio' || filterYear !== 'all' || filterMonth !== 'all' || filterSemester !== 'all' || filterQuoteStatus !== 'firmato' || customDateRange.from || searchQuery) && (
            <Button
              variant="ghost"
              onClick={() => {
                setFilterType('matrimonio'); // Default: Matrimonio
                setFilterYear('all');
                setFilterMonth('all');
                setFilterSemester('all');
                setFilterQuoteStatus('firmato'); // Default: firmato
                setCustomDateRange({ from: undefined, to: undefined });
                setSearchQuery('');
              }}
              className="gap-2"
              data-testid="button-clear-filters"
            >
              <X className="w-4 h-4" />
              Reset Filtri
            </Button>
          )}
        </div>
        
        {/* Active Filters Summary */}
        {(filterType !== 'matrimonio' || filterYear !== 'all' || filterMonth !== 'all' || filterQuoteStatus !== 'firmato' || customDateRange.from) && (
          <div className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
            <Filter className="w-4 h-4" />
            <span>Filtri attivi:</span>
            {filterType !== 'matrimonio' && (
              <Badge variant="secondary">
                {filterType === 'all' ? 'Tutti i tipi' : (jobTypeMap[filterType]?.nome || filterType)}
              </Badge>
            )}
            {filterQuoteStatus !== 'firmato' && (
              <Badge variant="secondary">
                {filterQuoteStatus === 'all' ? 'Tutti prev.' : filterQuoteStatus === 'non_firmato' ? 'Non firmato' : 'Non inviato'}
              </Badge>
            )}
            {filterYear !== 'all' && !customDateRange.from && (
              <Badge variant="secondary">
                {filterYear} {filterMonth !== 'all' ? `(${['', 'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'][parseInt(filterMonth)]})` : (filterSemester !== 'all' ? `(${filterSemester})` : '')}
              </Badge>
            )}
            {customDateRange.from && customDateRange.to && (
              <Badge variant="secondary">
                {format(customDateRange.from, "dd/MM/yy")} - {format(customDateRange.to, "dd/MM/yy")}
              </Badge>
            )}
          </div>
        )}
      </div>
      
      {/* Jobs Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : sortedJobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Nessun lavoro trovato</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selectedJobs.size === sortedJobs.length && sortedJobs.length > 0}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Seleziona tutti"
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                <TableHead className="font-semibold">Nome Evento</TableHead>
                <TableHead className="hidden md:table-cell font-semibold">Cliente/i</TableHead>
                <TableHead className="hidden lg:table-cell font-semibold">Location</TableHead>
                <TableHead className="font-semibold">Data/Orario</TableHead>
                <TableHead className="font-semibold">Tipo</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="hidden lg:table-cell font-semibold text-center">👥</TableHead>
                <TableHead className="hidden md:table-cell font-semibold text-center">💰</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const now = new Date();
                const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                let pastSeparatorShown = false;
                
                return paginatedJobs.map((job, index) => {
                  const jobTypeInfo = jobTypeMap[job.jobType];
                  const rawEventDate = convertFirestoreTimestamp(job.eventDate);
                  const eventDate = rawEventDate && !isNaN(rawEventDate.getTime()) ? rawEventDate : null;
                  const isSelected = selectedJobs.has(job.id);
                  const jobDate = eventDate ? new Date(eventDate) : new Date(0);
                  const isJobPast = jobDate < startOfToday;
                  
                  // Check if this is the first past job
                  const showPastSeparator = isJobPast && !pastSeparatorShown;
                  if (showPastSeparator) {
                    pastSeparatorShown = true;
                  }
                  
                  return (
                    <Fragment key={job.id}>
                      {showPastSeparator && (
                        <TableRow key="past-separator" className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800">
                          <TableCell colSpan={8} className="py-2 text-center">
                            <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                              <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600" />
                              <span className="font-medium">📅 Lavori Passati</span>
                              <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600" />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow
                        className={cn(
                          "cursor-pointer hover:bg-muted/50 relative",
                          isSelected && "bg-red-50 hover:bg-red-100"
                        )}
                        style={{
                          boxShadow: jobTypeInfo?.colore ? `inset 4px 0 0 ${jobTypeInfo.colore}` : undefined
                        }}
                        onClick={() => navigate(`/admin/jobs/${job.id}`)}
                        data-testid={`job-row-${job.id}`}
                      >
                    {/* Checkbox */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelectJob(job.id)}
                        aria-label={`Seleziona ${job.nomeEvento}`}
                        data-testid={`checkbox-job-${job.id}`}
                      />
                    </TableCell>
                    {/* Nome Evento */}
                    <TableCell className="font-medium">
                      <div className="space-y-1">
                        <div className="font-semibold">{job.nomeEvento}</div>
                        {job.eventLocation && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 lg:hidden">
                            <MapPin className="w-3 h-3" />
                            {job.eventLocation}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    
                    {/* Cliente/i */}
                    <TableCell className="hidden md:table-cell">
                      {job.clientiIds && job.clientiIds.length > 0 ? (
                        <div className="flex items-center gap-1 text-sm">
                          <User className="w-3 h-3" />
                          {job.clientiIds.length} client{job.clientiIds.length === 1 ? 'e' : 'i'}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    
                    {/* Location */}
                    <TableCell className="hidden lg:table-cell">
                      {job.eventLocation ? (
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <span>{job.eventLocation}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    
                    {/* Data/Orario */}
                    <TableCell>
                      {eventDate ? (
                        (() => {
                          const now = new Date();
                          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                          const eventDateObj = eventDate as Date;
                          const days = differenceInDays(eventDateObj, startOfToday);
                          const isEventToday = days === 0;
                          const isEventFuture = days > 0;
                          const isEventPast = days < 0;
                          
                          let relativeText = '';
                          let relativeColor = '';
                          
                          if (isEventToday) {
                            relativeText = 'OGGI';
                            relativeColor = 'text-green-600 font-bold';
                          } else if (days === 1) {
                            relativeText = 'Domani';
                            relativeColor = 'text-blue-600 font-semibold';
                          } else if (days === -1) {
                            relativeText = 'Ieri';
                            relativeColor = 'text-gray-500';
                          } else if (isEventFuture && days <= 7) {
                            relativeText = `tra ${days} giorni`;
                            relativeColor = 'text-blue-600';
                          } else if (isEventFuture && days <= 30) {
                            relativeText = `tra ${Math.ceil(days / 7)} sett.`;
                            relativeColor = 'text-blue-500';
                          } else if (isEventFuture) {
                            relativeText = `tra ${Math.ceil(days / 30)} mesi`;
                            relativeColor = 'text-blue-400';
                          } else if (isEventPast && Math.abs(days) <= 7) {
                            relativeText = `${Math.abs(days)} giorni fa`;
                            relativeColor = 'text-gray-400';
                          } else if (isEventPast && Math.abs(days) <= 30) {
                            relativeText = `${Math.ceil(Math.abs(days) / 7)} sett. fa`;
                            relativeColor = 'text-gray-400';
                          } else if (isEventPast) {
                            relativeText = `${Math.ceil(Math.abs(days) / 30)} mesi fa`;
                            relativeColor = 'text-gray-400';
                          }
                          
                          return (
                            <div className="space-y-0.5">
                              <div className="text-sm font-medium">
                                {format(eventDateObj, 'dd MMM yyyy', { locale: it })}
                              </div>
                              {relativeText && (
                                <div className={cn("text-xs", relativeColor)}>
                                  {relativeText}
                                </div>
                              )}
                              {job.startTime && job.endTime && (
                                <div className="text-xs text-muted-foreground">
                                  {job.startTime} - {job.endTime}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      ) : job.dataNonDefinita ? (
                        <div className="space-y-0.5">
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                            Da definire
                          </Badge>
                          <div className="text-xs text-muted-foreground">In trattativa</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    
                    {/* Tipo - Select inline */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={job.jobType}
                        onValueChange={(newType) => {
                          if (newType !== job.jobType) {
                            updateJobTypeMutation.mutate({ jobId: job.id, newJobType: newType });
                          }
                        }}
                        disabled={updateJobTypeMutation.isPending}
                      >
                        <SelectTrigger 
                          className="h-8 min-w-[130px] border-2 text-xs font-medium"
                          style={{
                            borderColor: jobTypeInfo?.colore || '#94a3b8',
                            backgroundColor: jobTypeInfo?.colore ? `${jobTypeInfo.colore}15` : 'transparent',
                          }}
                        >
                          <div className="flex items-center gap-1.5" style={{ color: jobTypeInfo?.colore || '#64748b' }}>
                            <JobTypeIcon slug={job.jobType} size="sm" />
                            <span className="truncate">{jobTypeInfo?.nome || job.jobType}</span>
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {jobTypes.map((jt) => (
                            <SelectItem key={jt.id} value={jt.slug}>
                              <div className="flex items-center gap-2">
                                <JobTypeIcon slug={jt.slug} size="sm" />
                                <span>{jt.nome}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    
                    {/* Status */}
                    <TableCell>
                      <Badge className={STATUS_COLORS[job.status]}>
                        {STATUS_LABELS[job.status]}
                      </Badge>
                    </TableCell>
                    
                    {/* Collaboratori - con pulsante gestione */}
                    <TableCell className="hidden lg:table-cell text-center" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const details = collaboratoriByJob[job.id];
                        const count = details?.count || 0;
                        const nomi = details?.nomi || [];
                        
                        return (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={cn(
                                    "h-7 text-xs gap-1",
                                    count > 0 ? "border-sage text-sage" : "border-gray-300 text-gray-500"
                                  )}
                                  onClick={() => setCollaboratoriDialogJobId(job.id)}
                                >
                                  <Users className="w-3 h-3" />
                                  {count > 0 ? count : '+'}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <div className="text-xs space-y-1">
                                  {count > 0 ? (
                                    <>
                                      <p className="font-semibold">Collaboratori assegnati:</p>
                                      {nomi.length > 0 ? (
                                        <ul className="list-disc list-inside">
                                          {nomi.map((nome, i) => (
                                            <li key={i}>{nome}</li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="text-muted-foreground">{count} collaboratore/i</p>
                                      )}
                                    </>
                                  ) : (
                                    <p>Clicca per assegnare collaboratori</p>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()}
                    </TableCell>
                    
                    {/* Pagamenti */}
                    <TableCell className="hidden md:table-cell text-center">
                      {(() => {
                        const count = transazioniPerJob[job.id] || 0;
                        const financials = job.financials;
                        const totalePreventivato = financials?.totalePreventivato || 0;
                        const totalePagato = financials?.totalePagato || 0;
                        const saldoResiduo = financials?.saldoResiduo ?? 0;
                        const isPagato = saldoResiduo <= 0 && totalePagato > 0;
                        const hasAcconti = totalePagato > 0 && saldoResiduo > 0;
                        
                        const tooltipContent = (
                          <div className="text-xs space-y-1">
                            <p><span className="font-semibold">Preventivato:</span> €{totalePreventivato.toLocaleString('it-IT')}</p>
                            <p><span className="font-semibold">Pagato:</span> €{totalePagato.toLocaleString('it-IT')}</p>
                            <p><span className="font-semibold">Residuo:</span> €{saldoResiduo.toLocaleString('it-IT')}</p>
                            {count > 0 && <p><span className="font-semibold">Transazioni:</span> {count}</p>}
                          </div>
                        );
                        
                        if (isPagato) {
                          return (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge className="bg-green-100 text-green-700 text-xs cursor-help">
                                    <Check className="w-3 h-3 mr-1" />
                                    Saldato
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  {tooltipContent}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        }
                        
                        // Mostra conteggio transazioni se disponibile, altrimenti usa financials
                        if (count > 0 || hasAcconti) {
                          return (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50 cursor-help">
                                    <CreditCard className="w-3 h-3 mr-1" />
                                    {count > 0 ? count : `€${totalePagato.toLocaleString('it-IT')}`}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  {tooltipContent}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        }
                        
                        return <span className="text-muted-foreground text-xs">—</span>;
                      })()}
                    </TableCell>
                  </TableRow>
                    </Fragment>
                  );
                });
              })()}
            </TableBody>
          </Table>
        </div>
      )}
      
      {/* Pagination Controls */}
      {sortedJobs.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>
              Mostrando {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, sortedJobs.length)} di {sortedJobs.length} lavori
            </span>
            <Select
              value={itemsPerPage.toString()}
              onValueChange={(value) => {
                setItemsPerPage(Number(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-20 h-8" data-testid="select-items-per-page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="hidden sm:inline">per pagina</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              data-testid="button-first-page"
            >
              Prima
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <Select
              value={currentPage.toString()}
              onValueChange={(value) => setCurrentPage(Number(value))}
            >
              <SelectTrigger className="w-28 h-8" data-testid="select-page-number">
                <SelectValue>
                  Pagina {currentPage}/{totalPages || 1}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: totalPages || 1 }, (_, i) => i + 1).map((page) => (
                  <SelectItem key={page} value={page.toString()}>
                    Pagina {page}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              data-testid="button-next-page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage >= totalPages}
              data-testid="button-last-page"
            >
              Ultima
            </Button>
          </div>
        </div>
      )}
      
      {/* Modals */}
      <CreateJobModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">
              Conferma Eliminazione
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Stai per eliminare <strong>{selectedJobs.size} lavori</strong> e tutti i dati collegati:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 text-red-600">
                <li>Tutti gli ordini associati</li>
                <li>Tutte le gallerie fotografiche</li>
                <li>Tutti i preventivi</li>
                <li>Tutti i piani di pagamento</li>
                <li>Tutta la cronologia eventi</li>
              </ul>
              <p className="font-semibold text-red-600 mt-2">
                Questa azione è irreversibile!
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Elimina {selectedJobs.size} lavori
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Delete Progress Overlay */}
      {deleteProgress && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-96">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-red-600" />
                <div>
                  <p className="font-semibold">Eliminazione in corso...</p>
                  <p className="text-sm text-muted-foreground">
                    {deleteProgress.current} di {deleteProgress.total}
                  </p>
                </div>
              </div>
              {deleteProgress.jobName && (
                <p className="text-sm text-muted-foreground truncate">
                  Eliminando: {deleteProgress.jobName}
                </p>
              )}
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-red-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(deleteProgress.current / deleteProgress.total) * 100}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Dialog gestione collaboratori */}
      <Dialog 
        open={!!collaboratoriDialogJobId} 
        onOpenChange={(open) => !open && setCollaboratoriDialogJobId(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Gestione Collaboratori
            </DialogTitle>
          </DialogHeader>
          {collaboratoriDialogJobId && (
            <JobCollaboratoriSection jobId={collaboratoriDialogJobId} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Job Card - Singola card nel Kanban
 */
interface JobCardProps {
  job: Job;
  onClick: () => void;
}

interface JobCardInternalProps extends JobCardProps {
  jobTypeMap: Record<string, JobTypeDoc>;
}

function JobCard({ job, onClick, jobTypeMap }: JobCardInternalProps) {
  const jobTypeInfo = jobTypeMap[job.jobType];
  
  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-all border-l-4"
      style={{
        borderLeftColor: STATUS_COLORS[job.status].split(' ').find(c => c.includes('border-'))
      }}
      onClick={onClick}
      data-testid={`job-card-${job.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold line-clamp-1">
            {job.nomeEvento}
          </CardTitle>
          <Badge variant="outline" className="text-xs shrink-0 gap-1">
            <JobTypeIcon slug={job.jobType} size="sm" />
            {jobTypeInfo?.nome || job.jobType}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-2 pt-0">
        {/* Clienti */}
        {job.clientiIds && job.clientiIds.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <User className="w-3 h-3" />
            <span>{job.clientiIds.length} client{job.clientiIds.length === 1 ? 'e' : 'i'}</span>
          </div>
        )}
        
        {/* Data evento */}
        {job.eventDate && (() => {
          const eventDateObj = convertFirestoreTimestamp(job.eventDate);
          if (!eventDateObj || isNaN(eventDateObj.getTime())) return null;
          return (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Calendar className="w-3 h-3" />
              <span>
                {format(eventDateObj, 'd MMM yyyy', { locale: it })}
                {!job.allDay && job.startTime && (
                  <span className="ml-1 text-gray-500">
                    • {job.startTime}{job.endTime && `-${job.endTime}`}
                  </span>
                )}
              </span>
            </div>
          );
        })()}
        
        {/* Location */}
        {job.eventLocation && (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <MapPin className="w-3 h-3" />
            <span className="line-clamp-1">{job.eventLocation}</span>
          </div>
        )}
        
        {/* Financials */}
        <div className="pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Preventivato:</span>
            <span className="font-semibold text-green-600">
              €{job.financials.totalePreventivato}
            </span>
          </div>
          {job.financials.saldoResiduo > 0 && (
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-gray-500">Da incassare:</span>
              <span className="font-semibold text-orange-600">
                €{job.financials.saldoResiduo}
              </span>
            </div>
          )}
        </div>
        
        {/* Badges */}
        <div className="flex flex-wrap gap-1 pt-2">
          {job.quoteIds.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              <FileText className="w-3 h-3 mr-1" />
              {job.quoteIds.length} preventiv{job.quoteIds.length === 1 ? 'o' : 'i'}
            </Badge>
          )}
          {job.orderIds.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              <Euro className="w-3 h-3 mr-1" />
              {job.orderIds.length} ordin{job.orderIds.length === 1 ? 'e' : 'i'}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
