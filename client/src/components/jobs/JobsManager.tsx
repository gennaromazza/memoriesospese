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
import { apiRequest } from '@/lib/queryClient';
import type { JobCollaboratoreAssignment } from '@shared/collaboratori-types';
import { convertFirestoreTimestamp } from '@/lib/firebase';
import type { Job, JobStatus } from '@shared/jobs-types';
import type { JobTypeFE as JobTypeDoc } from '@shared/job-types';
import type { Cliente } from '@shared/clienti-types';
import { Card, CardContent } from '@/components/ui/card';
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
import { format, isWithinInterval, differenceInDays } from 'date-fns';
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
  const [filterQuoteStatus, setFilterQuoteStatus] = useState<string>('all'); // Stato preventivo (default: tutti per mostrare anche lavori nuovi)
  const [timeFilter, setTimeFilter] = useState<'all' | 'upcoming' | 'past'>('upcoming'); // Filtro temporale (default: prossimi impegni)
  const [filterCollaboratore, setFilterCollaboratore] = useState<string>('all'); // Filtro collaboratore
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
      queryClient.invalidateQueries({ queryKey: ['jobListAggregates'] });
      
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
  
  // Query tutti i collaboratori per il dropdown filtro (via API backend)
  const { data: allCollaboratori = [] } = useQuery<{ id: string; nome: string }[]>({
    queryKey: ['collaboratoriList'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/collaboratori');
      const data = await response.json();
      return data.map((c: any) => ({
        id: c.id,
        nome: `${c.nome || ''} ${c.cognome || ''}`.trim() || 'Senza nome'
      })).sort((a: any, b: any) => a.nome.localeCompare(b.nome));
    }
  });
  
  // Query tutti gli assignment collaboratori-job (via API backend)
  const { data: allAssignments = [] } = useQuery<JobCollaboratoreAssignment[]>({
    queryKey: ['collaboratoriAssignments'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/collaboratori/assignments');
      return response.json();
    }
  });
  
  // Calcola collaboratoriByJob dai dati caricati
  const collaboratoriByJob = useMemo(() => {
    const collaboratoriMap: Record<string, string> = {};
    allCollaboratori.forEach(c => {
      collaboratoriMap[c.id] = c.nome;
    });
    
    const details: Record<string, { count: number; nomi: string[] }> = {};
    allAssignments.forEach((assignment: JobCollaboratoreAssignment) => {
      if (assignment.jobId && assignment.status !== 'declined') {
        if (!details[assignment.jobId]) {
          details[assignment.jobId] = { count: 0, nomi: [] };
        }
        details[assignment.jobId].count += 1;
        const nome = collaboratoriMap[assignment.collaboratoreId];
        if (nome) {
          details[assignment.jobId].nomi.push(nome);
        }
      }
    });
    return details;
  }, [allCollaboratori, allAssignments]);
  
  // Calcola jobsByCollaboratore dai dati caricati
  const jobsByCollaboratore = useMemo(() => {
    const result: Record<string, Set<string>> = {};
    
    allAssignments.forEach((assignment: JobCollaboratoreAssignment) => {
      if (assignment.collaboratoreId && assignment.jobId && assignment.status !== 'declined') {
        if (!result[assignment.collaboratoreId]) {
          result[assignment.collaboratoreId] = new Set();
        }
        result[assignment.collaboratoreId].add(assignment.jobId);
      }
    });
    
    return result;
  }, [allAssignments]);
  
  // Aggregati leggeri (conteggio transazioni per ordine + stato preventivo per job)
  // calcolati server-side: evita di scaricare le intere collezioni 'orders' e 'quotes' nel browser.
  const { data: listAggregates } = useQuery<{
    ordersTransactionCounts: Record<string, number>;
    quotesStatus: Record<string, { hasQuote: boolean; isSigned: boolean; isEmailSent: boolean }>;
  }>({
    queryKey: ['jobListAggregates'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/jobs/list-aggregates');
      const data = await response.json();
      return {
        ordersTransactionCounts: data.ordersTransactionCounts || {},
        quotesStatus: data.quotesStatus || {},
      };
    },
    staleTime: 3 * 60 * 1000,
  });
  
  // orderId -> numero transazioni (usato da transazioniPerJob via job.orderIds)
  const pagamentiByJob = listAggregates?.ordersTransactionCounts ?? {};
  // jobId -> stato preventivo (usato dal filtro stato preventivo e dai badge)
  const quotesByJob = listAggregates?.quotesStatus ?? {};
  
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
      const eventLocation = (job.eventLocation || job.rituLocation || job.locationCerimonia || '').toLowerCase();
      const note = job.noteInterne?.toLowerCase() || '';
      
      const clientIds = job.clientiIds?.length 
        ? job.clientiIds 
        : (job.clienteId ? [job.clienteId] : []);
      const clientiNames = clientIds
        .map((id: string) => clienteNamesMap[id]?.toLowerCase() || '')
        .join(' ');
      
      return nomeEvento.includes(query) || 
             eventLocation.includes(query) || 
             note.includes(query) ||
             clientiNames.includes(query);
    };
    
    // Senza ricerca, applica normalmente i filtri
    return jobs.filter(job => {
      // Escludi archiviati dalla vista principale (a meno che non siano cercati)
      if (job.status === 'archiviato' && !searchQuery) return false;
      
      // Se c'è una ricerca attiva, controlla solo quella
      if (searchQuery) {
        return matchesSearch(job, searchQuery.toLowerCase());
      }
      
      // Filtro tipo
      if (filterType !== 'all' && job.jobType !== filterType) return false;
      
      // Filtro tempo (Prossimi Impegni / Impegni Passati)
      // I lead vengono sempre mostrati: non hanno una data confermata
      if (timeFilter !== 'all' && job.status !== 'lead' && job.eventDate) {
        const eventDate = convertFirestoreTimestamp(job.eventDate);
        if (eventDate && !isNaN(eventDate.getTime())) {
          const eventTime = eventDate.getTime();
          const todayTime = startOfToday.getTime();
          
          if (timeFilter === 'upcoming' && eventTime < todayTime) return false;
          if (timeFilter === 'past' && eventTime >= todayTime) return false;
        }
      }
      
      // Filtro stato preventivo - usa dati reali dai preventivi + status job come fallback
      if (filterQuoteStatus !== 'all') {
        const quoteStatus = quotesByJob[job.id];
        const hasQuote = quoteStatus?.hasQuote || false;
        
        const confirmedJobStatuses = ['confermato', 'shooting_fatto', 'selezione_pending', 'produzione', 'consegnato'];
        const jobIsConfirmed = confirmedJobStatuses.includes(job.status);
        const isSigned = quoteStatus?.isSigned || jobIsConfirmed;
        
        const isEmailSent = quoteStatus?.isEmailSent || false;
        
        if (filterQuoteStatus === 'firmato' && !isSigned) return false;
        if (filterQuoteStatus === 'non_firmato' && (!hasQuote || isSigned || !isEmailSent)) return false;
        if (filterQuoteStatus === 'non_inviato' && (hasQuote && isEmailSent)) return false;
      }
      
      // Filtro collaboratore
      if (filterCollaboratore !== 'all') {
        if (filterCollaboratore === 'non_assegnato') {
          const hasCollaboratori = collaboratoriByJob[job.id]?.count > 0;
          if (hasCollaboratori) return false;
        } else {
          const collaboratoreJobs = jobsByCollaboratore[filterCollaboratore];
          if (!collaboratoreJobs || !collaboratoreJobs.has(job.id)) return false;
        }
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
            const eventMonth = eventDate.getMonth() + 1;
            
            if (eventYear !== year || eventMonth !== month) return false;
          }
          // 3. Anno + Semestre
          else if (filterYear !== 'all' && filterSemester !== 'all') {
            const year = parseInt(filterYear);
            const eventYear = eventDate.getFullYear();
            const eventMonth = eventDate.getMonth() + 1;
            
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
        } else if (filterYear !== 'all' || filterMonth !== 'all' || filterSemester !== 'all' || customDateRange.from) {
          // Se c'è un filtro temporale attivo ma il job non ha data, escludilo
          return false;
        }
      } else if (filterYear !== 'all' || filterMonth !== 'all' || filterSemester !== 'all' || customDateRange.from) {
        // Se c'è un filtro temporale attivo ma il job non ha data, escludilo
        return false;
      }
      
      return true;
    });
  }, [jobs, filterType, filterYear, filterSemester, filterMonth, filterQuoteStatus, filterCollaboratore, timeFilter, customDateRange, searchQuery, clienteNamesMap, quotesByJob, collaboratoriByJob, jobsByCollaboratore]);
  
  // Funzione helper per convertire date Firestore
  const toDate = (val: any): Date => {
    if (!val) return new Date(0);
    
    const result = convertFirestoreTimestamp(val);
    if (!result || !Number.isFinite(result.getTime())) {
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
  }, [filterType, filterYear, filterSemester, filterMonth, filterQuoteStatus, filterCollaboratore, timeFilter, customDateRange, searchQuery]);
  
  // Clamp currentPage when totalPages decreases (e.g., after deletion or filtering)
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);
  
  // Stats
  const stats = useMemo(() => {
    // Escludi gli archiviati da conteggio e totali (possono rientrare in filteredJobs durante una ricerca)
    const activeJobs = filteredJobs.filter(j => j.status !== 'archiviato');
    return {
      totalJobs: activeJobs.length,
      totalePreventivato: activeJobs.reduce((sum, j) => 
        sum + (j.financials?.totalePreventivato || 0), 0
      ),
      totalePagato: activeJobs.reduce((sum, j) => 
        sum + (j.financials?.totalePagato || 0), 0
      ),
      saldoResiduo: activeJobs.reduce((sum, j) => 
        sum + (j.financials?.saldoResiduo || 0), 0
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
    // Seleziona/deseleziona solo i lavori visibili nella pagina corrente (evita di selezionare lavori non visibili)
    const pageIds = paginatedJobs.map(j => j.id);
    const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedJobs.has(id));
    const newSelected = new Set(selectedJobs);
    if (allPageSelected) {
      pageIds.forEach(id => newSelected.delete(id));
    } else {
      pageIds.forEach(id => newSelected.add(id));
    }
    setSelectedJobs(newSelected);
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
      
      {/* Filters - Responsive Grid Layout */}
      <div className="space-y-3">
        {/* Prima riga: Ricerca + Periodo + Stato Preventivo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search - occupa più spazio */}
          <div className="sm:col-span-2 lg:col-span-2 relative">
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
            <SelectTrigger className="w-full" data-testid="select-filter-time">
              <SelectValue placeholder="Periodo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">Prossimi Impegni</SelectItem>
              <SelectItem value="past">Impegni Passati</SelectItem>
              <SelectItem value="all">Tutti i periodi</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Filtro Stato Preventivo */}
          <Select value={filterQuoteStatus} onValueChange={setFilterQuoteStatus}>
            <SelectTrigger className="w-full" data-testid="select-filter-quote">
              <SelectValue placeholder="Stato Preventivo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i preventivi</SelectItem>
              <SelectItem value="firmato">Firmato</SelectItem>
              <SelectItem value="non_firmato">Non firmato</SelectItem>
              <SelectItem value="non_inviato">Non inviato</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Seconda riga: Collaboratore + Anno + Mese + Semestre */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Filtro Collaboratore */}
          <Select value={filterCollaboratore} onValueChange={setFilterCollaboratore}>
            <SelectTrigger className="w-full" data-testid="select-filter-collaboratore">
              <SelectValue placeholder="Collaboratori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i collaboratori</SelectItem>
              <SelectItem value="non_assegnato">Non assegnato</SelectItem>
              {allCollaboratori.map(collab => (
                <SelectItem key={collab.id} value={collab.id}>
                  {collab.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Filtro Anno */}
          <Select value={filterYear} onValueChange={(val) => {
            setFilterYear(val);
            setFilterMonth('all');
            setFilterSemester('all');
          }}>
            <SelectTrigger className="w-full" data-testid="select-filter-year">
              <SelectValue placeholder="Anno" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli anni</SelectItem>
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
              if (val !== 'all') setFilterSemester('all');
            }}
            disabled={filterYear === 'all'}
          >
            <SelectTrigger className="w-full" data-testid="select-filter-month">
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
              if (val !== 'all') setFilterMonth('all');
            }}
            disabled={filterYear === 'all' || filterMonth !== 'all'}
          >
            <SelectTrigger className="w-full" data-testid="select-filter-semester">
              <SelectValue placeholder="Semestre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutto</SelectItem>
              <SelectItem value="S1">1° Sem</SelectItem>
              <SelectItem value="S2">2° Sem</SelectItem>
            </SelectContent>
          </Select>
          
        </div>
        
        {/* Terza riga: Range personalizzato + Reset Filtri */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Custom Date Range */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full sm:w-auto sm:min-w-[220px] justify-start text-left font-normal",
                  !customDateRange.from && "text-muted-foreground"
                )}
                data-testid="button-custom-date-range"
              >
                <Calendar className="mr-2 h-4 w-4 shrink-0" />
                {customDateRange.from ? (
                  customDateRange.to ? (
                    <span className="truncate">
                      {format(customDateRange.from, "dd MMM yyyy", { locale: it })} - {format(customDateRange.to, "dd MMM yyyy", { locale: it })}
                    </span>
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
          {(filterType !== 'matrimonio' || filterYear !== 'all' || filterMonth !== 'all' || filterSemester !== 'all' || filterQuoteStatus !== 'all' || filterCollaboratore !== 'all' || timeFilter !== 'upcoming' || customDateRange.from || searchQuery) && (
            <Button
              variant="ghost"
              onClick={() => {
                setFilterType('matrimonio');
                setFilterYear('all');
                setFilterMonth('all');
                setFilterSemester('all');
                setFilterQuoteStatus('all');
                setFilterCollaboratore('all');
                setTimeFilter('upcoming');
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
        {(filterType !== 'matrimonio' || filterYear !== 'all' || filterMonth !== 'all' || filterQuoteStatus !== 'all' || filterCollaboratore !== 'all' || customDateRange.from || timeFilter !== 'upcoming') && (
          <div className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
            <Filter className="w-4 h-4" />
            <span>Filtri attivi:</span>
            {filterType !== 'matrimonio' && (
              <Badge variant="secondary">
                {filterType === 'all' ? 'Tutti i tipi' : (jobTypeMap[filterType]?.nome || filterType)}
              </Badge>
            )}
            {filterQuoteStatus !== 'all' && (
              <Badge variant="secondary">
                {filterQuoteStatus === 'firmato' ? 'Firmato' : filterQuoteStatus === 'non_firmato' ? 'Non firmato' : 'Non inviato'}
              </Badge>
            )}
            {timeFilter !== 'upcoming' && (
              <Badge variant="secondary">
                {timeFilter === 'past' ? 'Impegni passati' : 'Tutti i periodi'}
              </Badge>
            )}
            {filterCollaboratore !== 'all' && (
              <Badge variant="secondary">
                {filterCollaboratore === 'non_assegnato'
                  ? 'Senza collaboratore'
                  : (allCollaboratori.find(c => c.id === filterCollaboratore)?.nome || 'Collaboratore')}
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
                    checked={
                      paginatedJobs.length > 0 && paginatedJobs.every(j => selectedJobs.has(j.id))
                        ? true
                        : paginatedJobs.some(j => selectedJobs.has(j.id))
                          ? 'indeterminate'
                          : false
                    }
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
                // Indice globale (su tutte le pagine) del primo lavoro passato, solo in vista "Tutti i periodi".
                // Così il separatore appare una sola volta, nella pagina giusta, e solo se ci sono sia lavori futuri che passati.
                const firstPastIndexGlobal = timeFilter === 'all'
                  ? sortedJobs.findIndex(j => {
                      const d = convertFirestoreTimestamp(j.eventDate);
                      // Solo i lavori con data evento valida e passata contano come "passati":
                      // i lavori senza data non devono attivare il separatore.
                      return d != null && !isNaN(d.getTime()) && d < startOfToday;
                    })
                  : -1;
                
                return paginatedJobs.map((job, index) => {
                  const jobTypeInfo = jobTypeMap[job.jobType];
                  const rawEventDate = convertFirestoreTimestamp(job.eventDate);
                  const eventDate = rawEventDate && !isNaN(rawEventDate.getTime()) ? rawEventDate : null;
                  const rawCreatedAt = convertFirestoreTimestamp((job as any).createdAt);
                  const createdAtDate = rawCreatedAt && !isNaN(rawCreatedAt.getTime()) ? rawCreatedAt : null;
                  const isSelected = selectedJobs.has(job.id);
                  
                  // Mostra il separatore esattamente prima del primo lavoro passato (indice globale),
                  // solo se esiste almeno un lavoro futuro prima di esso.
                  const globalIndex = (currentPage - 1) * itemsPerPage + index;
                  const showPastSeparator = firstPastIndexGlobal > 0 && globalIndex === firstPastIndexGlobal;
                  
                  return (
                    <Fragment key={job.id}>
                      {showPastSeparator && (
                        <TableRow key="past-separator" className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800">
                          <TableCell colSpan={9} className="py-2 text-center">
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
                      {(() => {
                        const clientCount = job.clientiIds?.length
                          ? job.clientiIds.length
                          : (job.clienteId ? 1 : 0);
                        return clientCount > 0 ? (
                          <div className="flex items-center gap-1 text-sm">
                            <User className="w-3 h-3" />
                            {clientCount} client{clientCount === 1 ? 'e' : 'i'}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        );
                      })()}
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
                          {createdAtDate ? (
                            <div className="text-xs text-muted-foreground">
                              Compilato il {format(createdAtDate, 'dd MMM yyyy', { locale: it })}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">In trattativa</div>
                          )}
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
                        disabled={updateJobTypeMutation.isPending && updateJobTypeMutation.variables?.jobId === job.id}
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
                      <Badge className={STATUS_COLORS[job.status] || 'bg-gray-100 text-gray-700 border-gray-300'}>
                        {STATUS_LABELS[job.status] || job.status || '—'}
                      </Badge>
                    </TableCell>
                    
                    {/* Collaboratori - visibile solo se ci sono collaboratori attivi (non rifiutati) */}
                    <TableCell className="hidden lg:table-cell text-center" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const details = collaboratoriByJob[job.id];
                        const count = details?.count || 0;
                        const nomi = details?.nomi || [];
                        
                        // Se nessun collaboratore attivo (tutti rifiutati o nessuno assegnato),
                        // non mostrare l'icona — il rifiuto si vede solo entrando nel job
                        if (count === 0) return null;
                        
                        return (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs gap-1 border-sage text-sage"
                                  onClick={() => setCollaboratoriDialogJobId(job.id)}
                                >
                                  <Users className="w-3 h-3" />
                                  {count}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <div className="text-xs space-y-1">
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
