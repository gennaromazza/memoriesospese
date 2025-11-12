/**
 * JOBS MANAGER - Vista Kanban Pipeline
 * Componente principale gestione lavori
 */

import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { getAllJobs } from '@/lib/jobs';
import { getJobTypes } from '@/lib/job-types';
import { getAllClienti } from '@/lib/clienti';
import type { Job, JobStatus, JobFilters } from '@shared/jobs-types';
import type { JobType as JobTypeDoc } from '@shared/job-types';
import type { Cliente } from '@shared/clienti-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  X
} from 'lucide-react';
import { format, isWithinInterval, startOfYear, endOfYear } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import CreateJobModal from './CreateJobModal';
import JobDetailDrawer from './JobDetailDrawer';

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
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterSemester, setFilterSemester] = useState<string>('all');
  const [customDateRange, setCustomDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({ from: undefined, to: undefined });
  
  // Query jobs
  const { data: jobs = [], isLoading } = useQuery<Job[]>({
    queryKey: ['jobs'],
    queryFn: () => getAllJobs()
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
        const date = typeof job.eventDate.toDate === 'function' 
          ? job.eventDate.toDate() 
          : new Date(job.eventDate);
        if (!isNaN(date.getTime())) {
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
        const eventDate = typeof job.eventDate.toDate === 'function' 
          ? job.eventDate.toDate() 
          : new Date(job.eventDate);
        
        if (!isNaN(eventDate.getTime())) {
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
  
  // Sort jobs by date (più recenti primi)
  const sortedJobs = useMemo(() => {
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
    
    return [...filteredJobs].sort((a, b) => {
      const dateA = toDate(a.eventDate);
      const dateB = toDate(b.eventDate);
      return dateB.getTime() - dateA.getTime();
    });
  }, [filteredJobs]);
  
  // Stats
  const stats = useMemo(() => {
    return {
      totalJobs: filteredJobs.length,
      totalePreventivato: filteredJobs.reduce((sum, j) => 
        sum + (j.financials?.totalePreventivato || 0), 0
      ),
      totalePagato: filteredJobs.reduce((sum, j) => 
        sum + (j.financials?.totalePagato || 0), 0
      ),
      saldoResiduo: filteredJobs.reduce((sum, j) => 
        sum + (j.financials?.saldoResiduo || 0), 0
      )
    };
  }, [filteredJobs]);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-playfair font-bold text-blue-gray">
            Gestione Lavori
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {stats.totalJobs} lavori attivi
          </p>
        </div>
        <Button
          onClick={() => setCreateModalOpen(true)}
          className="bg-sage hover:bg-dark-sage"
          data-testid="button-create-job"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuovo Lavoro
        </Button>
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
              {sortedJobs.map(job => {
                const jobTypeInfo = jobTypeMap[job.jobType];
                const displayType = jobTypeInfo ? `${jobTypeInfo.icona} ${jobTypeInfo.nome}` : job.jobType;
                const eventDate = job.eventDate ? (job.eventDate as any).toDate?.() || job.eventDate : null;
                
                return (
                  <TableRow
                    key={job.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/admin/jobs/${job.id}`)}
                    data-testid={`job-row-${job.id}`}
                  >
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
                        <div className="space-y-1">
                          <div className="text-sm font-medium">
                            {format(eventDate as Date, 'dd MMM yyyy', { locale: it })}
                          </div>
                          {job.startTime && job.endTime && (
                            <div className="text-xs text-muted-foreground">
                              {job.startTime} - {job.endTime}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    
                    {/* Tipo */}
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {displayType}
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
                          setSelectedJobId(job.id);
                        }}
                        data-testid={`button-manage-${job.id}`}
                      >
                        Gestisci
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      
      {/* Modals */}
      <CreateJobModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />
      
      {selectedJobId && (
        <JobDetailDrawer
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
        />
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
              €{job.financials?.totalePreventivato || 0}
            </span>
          </div>
          {(job.financials?.saldoResiduo || 0) > 0 && (
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-gray-500">Da incassare:</span>
              <span className="font-semibold text-orange-600">
                €{job.financials?.saldoResiduo || 0}
              </span>
            </div>
          )}
        </div>
        
        {/* Badges */}
        <div className="flex flex-wrap gap-1 pt-2">
          {(job.quoteIds?.length || 0) > 0 && (
            <Badge variant="secondary" className="text-xs">
              <FileText className="w-3 h-3 mr-1" />
              {job.quoteIds?.length || 0} preventiv{(job.quoteIds?.length || 0) === 1 ? 'o' : 'i'}
            </Badge>
          )}
          {(job.orderIds?.length || 0) > 0 && (
            <Badge variant="secondary" className="text-xs">
              <Euro className="w-3 h-3 mr-1" />
              {job.orderIds?.length || 0} ordin{(job.orderIds?.length || 0) === 1 ? 'e' : 'i'}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
