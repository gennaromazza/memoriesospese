import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useQueries } from '@tanstack/react-query';
import { ArrowLeft, Loader2, MoreVertical, Edit, Trash2, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Job } from '@shared/jobs-types';
import { Cliente } from '@shared/clienti-types';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { getJob } from '@/lib/jobs';
import { getClienteById } from '@/lib/clienti';
import { getJobTypeBySlug } from '@/lib/job-types';
import WorkflowTimeline from '@/components/jobs/WorkflowTimeline';
import ClienteJobCard from '@/components/jobs/ClienteJobCard';
import ModuliJobSection from '@/components/jobs/ModuliJobSection';
import CostiLavoroTable from '@/components/jobs/CostiLavoroTable';
import QuoteBuilder from '@/components/quotes/QuoteBuilder';

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [, navigate] = useLocation();
  const [quoteBuilderOpen, setQuoteBuilderOpen] = useState(false);

  const { data: job, isLoading } = useQuery<Job | null>({
    queryKey: ['jobs', jobId],
    queryFn: () => getJob(jobId!),
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
              
              {/* Actions Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-actions">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={() => alert('Modifica lavoro - Da implementare')}
                    data-testid="action-edit"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    <span>Modifica Lavoro</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => alert('Genera preventivo - Da implementare nella prossima fase')}
                    data-testid="action-generate-quote"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    <span>Genera Preventivo</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => alert('Esporta PDF - Da implementare')}
                    data-testid="action-export-pdf"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    <span>Esporta PDF</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      if (confirm('Sei sicuro di voler eliminare questo lavoro?')) {
                        alert('Elimina lavoro - Da implementare');
                      }
                    }}
                    className="text-destructive focus:text-destructive"
                    data-testid="action-delete"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    <span>Elimina Lavoro</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-6">
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
                      <ClienteJobCard key={cliente.id} cliente={cliente} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Moduli Prenotazione */}
            <Card>
              <CardHeader>
                <CardTitle>Moduli di Prenotazione</CardTitle>
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
                <CardTitle>Pagamenti</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Totale Preventivato</p>
                      <p className="text-2xl font-bold">€{job.financials.totalePreventivato.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Totale Pagato</p>
                      <p className="text-2xl font-bold text-green-600">€{job.financials.totalePagato.toFixed(2)}</p>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Saldo Residuo</p>
                    <p className="text-2xl font-bold text-orange-600">€{job.financials.saldoResiduo.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Costi */}
            <Card>
              <CardHeader>
                <CardTitle>Costi Lavoro</CardTitle>
              </CardHeader>
              <CardContent>
                <CostiLavoroTable
                  costi={job.costi || []}
                  totalePreventivato={job.financials.totalePreventivato}
                  isAdmin={true}
                />
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Workflow */}
          <div className="lg:col-span-1">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle>Workflow</CardTitle>
              </CardHeader>
              <CardContent>
                <WorkflowTimeline
                  job={job}
                  isAdmin={true}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
