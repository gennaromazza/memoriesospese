/**
 * JOBS MANAGER - Vista Kanban Pipeline
 * Componente principale gestione lavori
 */

import { useState, useMemo, Fragment } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllJobs, deleteMultipleJobs } from '@/lib/jobs';
import { getJobTypes } from '@/lib/job-types';
import { getAllClienti } from '@/lib/clienti';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Calendar as CalendarUI } from '@/components/ui/calendar';
import {
  Plus,
  Search,
  Filter,
  Calendar,
  MapPin,
  Euro,
  User,
  FileText,
  X,
  Trash2,
  Loader2
} from 'lucide-react';
import { format, isWithinInterval, startOfYear, endOfYear, differenceInDays, isFuture, isToday, isPast } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
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
  const [filterType, setFilterType] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterSemester, setFilterSemester] = useState<string>('all');
  const [customDateRange, setCustomDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({ from: undefined, to: undefined });
  
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ current: number; total: number; jobName?: string } | null>(null);
  
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

  // Filtra jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      // Escludi archiviati dalla vista principale
      if (job.status === 'archiviato') return false;
      
      // Filtro tipo
      if (filterType !== 'all' && job.jobType !== filterType) return false;
      
      // Filtri date (precedenza: custom range > anno+semestre > anno)
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
          // 2. Anno + Semestre
          else if (filterYear !== 'all' && filterSemester !== 'all') {
            const year = parseInt(filterYear);
            const eventYear = eventDate.getFullYear();
            const eventMonth = eventDate.getMonth() + 1; // 1-12
            
            if (eventYear !== year) return false;
            
            if (filterSemester === 'S1' && (eventMonth < 1 || eventMonth > 6)) return false;
            if (filterSemester === 'S2' && (eventMonth < 7 || eventMonth > 12)) return false;
          }
          // 3. Solo Anno
          else if (filterYear !== 'all') {
            const year = parseInt(filterYear);
            const eventYear = eventDate.getFullYear();
            if (eventYear !== year) return false;
          }
        }
      }
      
      // Ricerca testuale (nome evento, location, note, nomi clienti)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const nomeEvento = job.nomeEvento?.toLowerCase() || '';
        const eventLocation = job.eventLocation?.toLowerCase() || '';
        const note = job.noteInterne?.toLowerCase() || '';
        
        // Cerca anche nei nomi dei clienti collegati
        const clientiNames = (job.clientiIds || [])
          .map(id => clienteNamesMap[id]?.toLowerCase() || '')
          .join(' ');
        
        return nomeEvento.includes(query) || 
               eventLocation.includes(query) || 
               note.includes(query) ||
               clientiNames.includes(query);
      }
      
      return true;
    });
  }, [jobs, filterType, filterYear, filterSemester, customDateRange, searchQuery, clienteNamesMap]);
  
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
  
  // Sort jobs: prima i lavori futuri (dal più vicino), poi i passati (dal più recente)
  const sortedJobs = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return [...filteredJobs].sort((a, b) => {
      const dateA = toDate(a.eventDate);
      const dateB = toDate(b.eventDate);
      
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
  }, [filteredJobs]);
  
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
      
      {/* Stats cards */}
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
          
          {/* Filtro Tipo */}
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-48" data-testid="select-filter-type">
              <SelectValue placeholder="Tutti i tipi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i tipi</SelectItem>
              {jobTypes
                .filter(jt => jt.attivo)
                .sort((a, b) => a.ordine - b.ordine)
                .map(jobType => (
                  <SelectItem key={jobType.id} value={jobType.slug}>
                    {jobType.icona} {jobType.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          
          {/* Filtro Anno */}
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-32" data-testid="select-filter-year">
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
          
          {/* Filtro Semestre */}
          <Select 
            value={filterSemester} 
            onValueChange={setFilterSemester}
            disabled={filterYear === 'all'}
          >
            <SelectTrigger className="w-32" data-testid="select-filter-semester">
              <SelectValue placeholder="Semestre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Intero Anno</SelectItem>
              <SelectItem value="S1">1° Semestre</SelectItem>
              <SelectItem value="S2">2° Semestre</SelectItem>
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
                  // Reset year/semester quando usi custom range
                  if (range?.from && range?.to) {
                    setFilterYear('all');
                    setFilterSemester('all');
                  }
                }}
                numberOfMonths={2}
                locale={it}
              />
            </PopoverContent>
          </Popover>
          
          {/* Clear Filters Button */}
          {(filterType !== 'all' || filterYear !== 'all' || filterSemester !== 'all' || customDateRange.from || searchQuery) && (
            <Button
              variant="ghost"
              onClick={() => {
                setFilterType('all');
                setFilterYear('all');
                setFilterSemester('all');
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
        {(filterType !== 'all' || filterYear !== 'all' || customDateRange.from) && (
          <div className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
            <Filter className="w-4 h-4" />
            <span>Filtri attivi:</span>
            {filterType !== 'all' && (
              <Badge variant="secondary">
                {jobTypeMap[filterType]?.nome || filterType}
              </Badge>
            )}
            {filterYear !== 'all' && !customDateRange.from && (
              <Badge variant="secondary">
                {filterYear} {filterSemester !== 'all' ? `(${filterSemester})` : ''}
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
                <TableHead className="hidden md:table-cell font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const now = new Date();
                const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                let pastSeparatorShown = false;
                
                return sortedJobs.map((job, index) => {
                  const jobTypeInfo = jobTypeMap[job.jobType];
                  const displayType = jobTypeInfo ? `${jobTypeInfo.icona} ${jobTypeInfo.nome}` : job.jobType;
                  const eventDate = job.eventDate ? (job.eventDate as any).toDate?.() || job.eventDate : null;
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
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    
                    {/* Tipo */}
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className="text-xs font-medium gap-1.5 border-2"
                        style={{
                          borderColor: jobTypeInfo?.colore || '#94a3b8',
                          backgroundColor: jobTypeInfo?.colore ? `${jobTypeInfo.colore}15` : 'transparent',
                          color: jobTypeInfo?.colore || '#64748b'
                        }}
                      >
                        <span className="text-base leading-none">{jobTypeInfo?.icona || '📸'}</span>
                        <span>{jobTypeInfo?.nome || job.jobType}</span>
                      </Badge>
                    </TableCell>
                    
                    {/* Status */}
                    <TableCell>
                      <Badge className={STATUS_COLORS[job.status]}>
                        {STATUS_LABELS[job.status]}
                      </Badge>
                    </TableCell>
                    
                    {/* Actions */}
                    <TableCell className="hidden md:table-cell text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/jobs/${job.id}`);
                        }}
                        data-testid={`button-manage-${job.id}`}
                      >
                        Gestisci
                      </Button>
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
  const displayName = jobTypeInfo ? `${jobTypeInfo.icona} ${jobTypeInfo.nome}` : job.jobType;
  
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
          <Badge variant="outline" className="text-xs shrink-0">
            {displayName}
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
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Calendar className="w-3 h-3" />
          <span>
            {format(job.eventDate.toDate(), 'd MMM yyyy', { locale: it })}
            {!job.allDay && job.startTime && (
              <span className="ml-1 text-gray-500">
                • {job.startTime}{job.endTime && `-${job.endTime}`}
              </span>
            )}
          </span>
        </div>
        
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
