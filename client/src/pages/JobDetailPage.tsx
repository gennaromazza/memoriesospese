import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useQueries, useMutation } from '@tanstack/react-query';
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
import { getJob, deleteJob } from '@/lib/jobs';
import { getClienteById } from '@/lib/clienti';
import { getJobTypeBySlug } from '@/lib/job-types';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import WorkflowTimeline from '@/components/jobs/WorkflowTimeline';
import ClienteJobCard from '@/components/jobs/ClienteJobCard';
import ModuliJobSection from '@/components/jobs/ModuliJobSection';
import CostiLavoroTable from '@/components/jobs/CostiLavoroTable';
import QuoteBuilder from '@/components/quotes/QuoteBuilder';
import PaymentScheduleSection from '@/components/jobs/PaymentScheduleSection';
import EditJobModal from '@/components/jobs/EditJobModal';

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [, navigate] = useLocation();
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const [quoteBuilderOpen, setQuoteBuilderOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

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
                    onClick={() => setEditModalOpen(true)}
                    data-testid="action-edit"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    <span>Modifica Lavoro</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setQuoteBuilderOpen(true)}
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
                <CardTitle>Storico Pagamenti</CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentScheduleSection 
                  jobId={job.id}
                  isAdmin={true}
                />
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

      {/* Edit Job Modal */}
      {editModalOpen && (
        <EditJobModal
          open={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          job={job}
        />
      )}
    </div>
  );
}
