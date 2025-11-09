/**
 * JOBS MANAGER - Vista Kanban Pipeline
 * Componente principale gestione lavori
 */

import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { getAllJobs } from '@/lib/jobs';
import { getJobTypes } from '@/lib/job-types';
import type { Job, JobStatus, JobFilters } from '@shared/jobs-types';
import type { JobType as JobTypeDoc } from '@shared/job-types';
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
  Plus,
  Search,
  Filter,
  Calendar,
  MapPin,
  Euro,
  User,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
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
  
  // Crea mappa slug -> JobType per lookup veloci
  const jobTypeMap = useMemo(() => {
    const map: Record<string, JobTypeDoc> = {};
    jobTypes.forEach(jt => {
      map[jt.slug] = jt;
    });
    return map;
  }, [jobTypes]);
  
  // Filtra jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      // Escludi archiviati dalla vista principale
      if (job.status === 'archiviato') return false;
      
      // Filtro tipo
      if (filterType !== 'all' && job.jobType !== filterType) return false;
      
      // Ricerca testuale
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const nomeEvento = job.nomeEvento?.toLowerCase() || '';
        const eventLocation = job.eventLocation?.toLowerCase() || '';
        const note = job.noteInterne?.toLowerCase() || '';
        return nomeEvento.includes(query) || eventLocation.includes(query) || note.includes(query);
      }
      
      return true;
    });
  }, [jobs, filterType, searchQuery]);
  
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
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Cerca per nome evento, location, note..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-jobs"
          />
        </div>
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
                    {/* Nome Evento + Location */}
                    <TableCell className="font-medium">
                      <div className="space-y-1">
                        <div className="font-semibold">{job.nomeEvento}</div>
                        {job.eventLocation && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
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
