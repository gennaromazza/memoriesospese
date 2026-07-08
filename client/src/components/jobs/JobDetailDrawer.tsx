/**
 * JOB DETAIL DRAWER
 * Drawer completo dettagli lavoro con tutte le sezioni
 */

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getJob, getJobTimeline, updateJobStatus, attachPDF } from '@/lib/jobs';
import { getQuotesForJob } from '@/lib/quotes';
import { getPaymentScheduleForJob } from '@/lib/payment-schedules';
import { getJobTypeBySlug } from '@/lib/job-types';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import QuoteBuilder from '@/components/quotes/QuoteBuilder';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  X,
  Calendar,
  MapPin,
  User,
  FileText,
  Euro,
  Upload,
  Download,
  Clock,
  ArrowRight,
  Loader2,
  ClipboardList,
} from 'lucide-react';
import { Plus } from 'lucide-react';
import NewGalleryModal from '@/components/NewGalleryModal';
import InfoFormJobSection from './InfoFormJobSection';
import ConsultationVisioneSection from './ConsultationVisioneSection';
import OperationalTracksSection from './operativo/OperationalTracksSection';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import type { JobStatus } from '@shared/jobs-types';

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

const STATUS_OPTIONS: JobStatus[] = [
  'lead',
  'preventivo_inviato',
  'confermato',
  'shooting_fatto',
  'selezione_pending',
  'produzione',
  'consegnato',
  'archiviato'
];

interface JobDetailDrawerProps {
  jobId: string;
  onClose: () => void;
}

export default function JobDetailDrawer({ jobId, onClose }: JobDetailDrawerProps) {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const [uploadingPDF, setUploadingPDF] = useState(false);
  const [quoteBuilderOpen, setQuoteBuilderOpen] = useState(false);
  const [showNewGalleryModal, setShowNewGalleryModal] = useState(false);

  // Gallerie collegate al job
  const [linkedGalleries, setLinkedGalleries] = useState<Array<{id: string; name: string; code: string; date?: string; photoCount?: number; jobType?: string}>>([]);
  const [loadingGalleries, setLoadingGalleries] = useState(false);

  const loadLinkedGalleries = () => {
    if (!jobId) return;
    setLoadingGalleries(true);
    const q = query(collection(db, 'galleries'), where('jobId', '==', jobId));
    getDocs(q).then(snap => {
      setLinkedGalleries(snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || '',
        code: d.data().code || '',
        date: d.data().date,
        photoCount: d.data().photoCount || 0,
        jobType: d.data().jobType
      })));
    }).catch(console.error).finally(() => setLoadingGalleries(false));
  };

  useEffect(() => { loadLinkedGalleries(); }, [jobId]);
  
  // Queries
  const { data: job, isLoading } = useQuery({
    queryKey: ['jobs', jobId],
    queryFn: () => getJob(jobId)
  });

  // Prefill per NewGalleryModal (memoizzato: un oggetto inline ri-eseguirebbe l'init effect del modal)
  const galleryPrePopulate = useMemo(() => ({
    jobId,
    name: job?.nomeEvento || '',
    date: job?.eventDate ? format(job.eventDate.toDate(), 'yyyy-MM-dd') : '',
  }), [jobId, job?.nomeEvento, job?.eventDate]);
  
  const { data: timeline = [] } = useQuery({
    queryKey: ['job-timeline', jobId],
    queryFn: () => getJobTimeline(jobId)
  });
  
  const { data: quotes = [] } = useQuery({
    queryKey: ['job-quotes', jobId],
    queryFn: () => getQuotesForJob(jobId)
  });
  
  const { data: paymentSchedule } = useQuery({
    queryKey: ['job-payment-schedule', jobId],
    queryFn: () => getPaymentScheduleForJob(jobId)
  });
  
  // Query multiple clienti
  const { data: clienti = [] } = useQuery({
    queryKey: ['clienti', 'job', job?.clientiIds],
    queryFn: async () => {
      if (!job?.clientiIds || job.clientiIds.length === 0) return [];
      const { getClienteById } = await import('@/lib/clienti');
      const clientiPromises = job.clientiIds.map(id => getClienteById(id));
      const results = await Promise.all(clientiPromises);
      return results.filter(c => c !== null);
    },
    enabled: !!job?.clientiIds && job.clientiIds.length > 0
  });
  
  // Query per ottenere il JobType dinamico
  const { data: jobType } = useQuery({
    queryKey: ['jobType', job?.jobType],
    queryFn: () => getJobTypeBySlug(job!.jobType),
    enabled: !!job?.jobType
  });
  
  // Mutation cambia status
  const updateStatusMutation = useMutation({
    mutationFn: (newStatus: JobStatus) => 
      updateJobStatus(jobId, newStatus, user!.uid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['job-timeline', jobId] });
      toast({
        title: 'Stato aggiornato',
        description: 'Lo stato del lavoro è stato aggiornato.'
      });
    }
  });
  
  // Upload PDF
  const handleUploadPDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    setUploadingPDF(true);
    try {
      await attachPDF(jobId, file, 'modulo_prenotazione', user.uid);
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      toast({
        title: 'PDF caricato',
        description: 'Il documento è stato caricato con successo.'
      });
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setUploadingPDF(false);
    }
  };
  
  if (isLoading || !job) {
    return (
      <Sheet open onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-sage" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }
  
  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-2xl font-playfair">
                {job.nomeEvento}
              </SheetTitle>
              <SheetDescription>
                {job.eventDate ? format(job.eventDate.toDate(), 'PPP', { locale: it }) : 'Data non definita'}
                {!job.allDay && job.startTime && (
                  <span className="ml-2">
                    • {job.startTime}{job.endTime && ` - ${job.endTime}`}
                  </span>
                )}
              </SheetDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-drawer">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          {/* Status badge + change */}
          <div className="flex items-center gap-3">
            <Label>Stato:</Label>
            <Select
              value={job.status}
              onValueChange={(v) => updateStatusMutation.mutate(v as JobStatus)}
              disabled={updateStatusMutation.isPending}
            >
              <SelectTrigger className="w-48" data-testid="select-job-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(status => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Separator />
          
          {/* Tabs */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="overview" data-testid="tab-overview" className="text-xs px-1">Overview</TabsTrigger>
              <TabsTrigger value="timeline" data-testid="tab-timeline" className="text-xs px-1">Timeline</TabsTrigger>
              <TabsTrigger value="preventivi" data-testid="tab-preventivi" className="text-xs px-1">Preventivi</TabsTrigger>
              <TabsTrigger value="pagamenti" data-testid="tab-pagamenti" className="text-xs px-1">Pagamenti</TabsTrigger>
              <TabsTrigger value="gallerie" data-testid="tab-gallerie" className="text-xs px-1">Gallerie</TabsTrigger>
              <TabsTrigger value="moduli" data-testid="tab-moduli" className="text-xs px-1">
                <ClipboardList className="h-3.5 w-3.5 mr-1 inline-block" />
                Moduli
              </TabsTrigger>
              <TabsTrigger value="operativo" data-testid="tab-operativo" className="text-xs px-1">Operativo</TabsTrigger>
            </TabsList>
            
            {/* Overview */}
            <TabsContent value="overview" className="space-y-4">
              {/* Clienti */}
              {clienti.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Client{clienti.length === 1 ? 'e' : 'i'} ({clienti.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {clienti.map((cliente, idx) => (
                      <div key={cliente.id} className={idx > 0 ? 'pt-3 border-t' : ''}>
                        <div>
                          <strong>{cliente.nome} {cliente.cognome}</strong>
                        </div>
                        <div className="text-gray-600">{cliente.email}</div>
                        {cliente.cellulare1 && (
                          <div className="text-gray-600">{cliente.cellulare1}</div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              
              {/* Info evento */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Dettagli Evento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span>{job.eventDate ? format(job.eventDate.toDate(), 'PPP', { locale: it }) : 'Data non definita'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span>
                      {job.allDay ? 'Tutto il giorno' : 
                        job.startTime && job.endTime ? `${job.startTime} - ${job.endTime}` :
                        job.startTime ? `Dalle ${job.startTime}` : 
                        'Orario non specificato'}
                    </span>
                  </div>
                  {job.eventLocation && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span>{job.eventLocation}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500">Provenienza: </span>
                    {job.provenance === 'preventivo-rapido' ? (
                      <Badge className="bg-amber-100 text-amber-800 border border-amber-300">⚡ Preventivo Rapido</Badge>
                    ) : (
                      <Badge variant="outline">{job.provenance}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              {/* Financials */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Euro className="w-4 h-4" />
                    Situazione Economica
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Preventivato:</span>
                    <span className="font-semibold">
                      €{job.financials.totalePreventivato.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Pagato:</span>
                    <span className="font-semibold text-green-600">
                      €{job.financials.totalePagato.toLocaleString()}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-gray-600">Saldo residuo:</span>
                    <span className="font-semibold text-orange-600">
                      €{job.financials.saldoResiduo.toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
              
              {/* PDF Moduli */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Documenti PDF
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {job.pdfs.length === 0 ? (
                    <p className="text-sm text-gray-500">Nessun documento caricato</p>
                  ) : (
                    <div className="space-y-2">
                      {job.pdfs.map((pdf, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <div className="text-sm font-medium">{pdf.nome}</div>
                            <div className="text-xs text-gray-500">
                              {format(pdf.uploadedAt.toDate(), 'PPp', { locale: it })}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(pdf.url, '_blank')}
                            data-testid={`button-download-pdf-${idx}`}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="pt-2">
                    <Label htmlFor="pdf-upload" className="cursor-pointer">
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-sage transition-colors">
                        <Upload className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                        <p className="text-sm text-gray-600">
                          {uploadingPDF ? 'Caricamento...' : 'Carica PDF'}
                        </p>
                      </div>
                    </Label>
                    <Input
                      id="pdf-upload"
                      type="file"
                      accept=".pdf"
                      onChange={handleUploadPDF}
                      disabled={uploadingPDF}
                      className="hidden"
                      data-testid="input-upload-pdf"
                    />
                  </div>
                </CardContent>
              </Card>
              
              {/* Note interne / Nota cliente */}
              {job.noteInterne && (
                job.noteInterne.startsWith('[Nota cliente]') ? (
                  <Card className="border-blue-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-blue-700">
                        <User className="w-4 h-4" />
                        Nota del Cliente
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {job.noteInterne.replace(/^\[Nota cliente\]\s*/, '')}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Note Interne</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {job.noteInterne}
                      </p>
                    </CardContent>
                  </Card>
                )
              )}
            </TabsContent>
            
            {/* Timeline */}
            <TabsContent value="timeline" className="space-y-3">
              {timeline.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  Nessun evento in timeline
                </p>
              ) : (
                <div className="space-y-3">
                  {timeline.map(event => (
                    <div key={event.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-sage mt-2" />
                        <div className="w-px h-full bg-gray-200" />
                      </div>
                      <div className="flex-1 pb-6">
                        <div className="text-sm font-medium">{event.descrizione}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                          <Clock className="w-3 h-3" />
                          {format(event.data.toDate(), 'PPp', { locale: it })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            
            {/* Preventivi */}
            <TabsContent value="preventivi" className="space-y-3">
              {quotes.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 mb-4">
                    Nessun preventivo creato
                  </p>
                  <Button 
                    className="bg-sage hover:bg-dark-sage" 
                    data-testid="button-create-preventivo"
                    onClick={() => setQuoteBuilderOpen(true)}
                    disabled={!jobType}
                  >
                    {!jobType ? 'Caricamento...' : 'Crea Preventivo'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {quotes.map(quote => (
                    <Card key={quote.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">
                            Preventivo {quote.type === 'fisso' ? 'Fisso' : 'Variabile'}
                          </CardTitle>
                          <Badge>{quote.status}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Totale:</span>
                          <span className="font-semibold">
                            €{(quote.totaleBase ?? 0).toLocaleString()}
                          </span>
                        </div>
                        {quote.sentAt && (
                          <div className="text-xs text-gray-500">
                            Inviato {format(quote.sentAt.toDate(), 'PPp', { locale: it })}
                          </div>
                        )}
                        {quote.signature && (
                          <div className="text-xs text-green-600">
                            ✓ Firmato da {quote.signature?.clientName || 'Cliente'}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  
                  <Button 
                    className="w-full bg-sage hover:bg-dark-sage" 
                    onClick={() => setQuoteBuilderOpen(true)}
                    disabled={!jobType}
                    data-testid="button-add-preventivo"
                  >
                    {!jobType ? 'Caricamento...' : '+ Aggiungi Preventivo'}
                  </Button>
                </div>
              )}
            </TabsContent>
            
            {/* Pagamenti */}
            <TabsContent value="pagamenti" className="space-y-3">
              {!paymentSchedule ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 mb-4">
                    Nessun calendario pagamenti
                  </p>
                  <Button className="bg-sage hover:bg-dark-sage" data-testid="button-create-payment-schedule">
                    Crea Calendario Pagamenti
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Riepilogo Pagamenti</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Totale:</span>
                        <span className="font-semibold">
                          €{paymentSchedule.totale.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Pagato:</span>
                        <span className="font-semibold text-green-600">
                          €{paymentSchedule.totalePagato.toLocaleString()}
                        </span>
                      </div>
                      <Separator />
                      <div className="flex justify-between">
                        <span>Saldo residuo:</span>
                        <span className="font-semibold text-orange-600">
                          €{paymentSchedule.saldoResiduo.toLocaleString()}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                  
                  {paymentSchedule.payments.map(payment => (
                    <Card key={payment.id}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium capitalize">
                              {payment.tipo}
                            </div>
                            <div className="text-xs text-gray-500">
                              Scadenza: {format(payment.dataScadenza.toDate(), 'PP', { locale: it })}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold">
                              €{payment.importo.toLocaleString()}
                            </div>
                            <Badge
                              variant={payment.stato === 'pagato' ? 'default' : 'outline'}
                              className="text-xs"
                            >
                              {payment.stato}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Moduli Informativi */}
            <TabsContent value="moduli" className="space-y-3 pt-2">
              {job && (
                <ConsultationVisioneSection
                  jobId={jobId}
                  jobType={job.jobType}
                  visioneAutoInviteSentAt={job.visioneAutoInviteSentAt}
                  visioneAutoInviteTemplateId={job.visioneAutoInviteTemplateId}
                  workflowEvents={job.workflowEvents}
                />
              )}
              <InfoFormJobSection
                jobId={jobId}
                jobName={job?.nomeEvento}
                clienti={clienti.map(c => ({
                  id: c.id,
                  nome: c.nome,
                  cognome: c.cognome,
                  email: c.email,
                  whatsapp: c.whatsapp,
                  cellulare1: c.cellulare1,
                }))}
              />
            </TabsContent>

            {/* Operativo */}
            <TabsContent value="operativo" className="space-y-3 pt-2">
              <OperationalTracksSection jobId={jobId} />
            </TabsContent>

            {/* Gallerie */}
            <TabsContent value="gallerie" className="space-y-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-700">Gallerie Collegate</h3>
                  <Badge variant="outline">{linkedGalleries.length}</Badge>
                </div>
                <Button
                  size="sm"
                  className="bg-sage hover:bg-sage/90 text-white"
                  onClick={() => setShowNewGalleryModal(true)}
                  data-testid="button-create-gallery-from-job"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Crea Galleria
                </Button>
              </div>
              {loadingGalleries ? (
                <div className="text-sm text-muted-foreground py-4 text-center">Caricamento gallerie…</div>
              ) : linkedGalleries.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-sm text-muted-foreground">
                    <p>Nessuna galleria collegata a questo lavoro.</p>
                    <p className="text-xs mt-1">Collega le gallerie dalla scheda "Modifica Galleria" → campo "Lavoro Collegato".</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {linkedGalleries.map(g => (
                    <Card key={g.id} className="hover:shadow-sm transition-shadow">
                      <CardContent className="pt-4 pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-gray-900 truncate">{g.name}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <code className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{g.code}</code>
                              {g.date && <span className="text-xs text-muted-foreground">{g.date}</span>}
                              {g.jobType && (
                                <span className="text-[10px] bg-terracotta/10 text-terracotta border border-terracotta/20 rounded px-1.5 py-0.5 font-medium">{g.jobType}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-xs text-muted-foreground">{g.photoCount} foto</span>
                            <a
                              href={`/admin/gallery/${g.id}/manage`}
                              className="text-xs font-medium text-sage hover:underline"
                            >
                              Gestisci →
                            </a>
                            <a
                              href={`/gallery/${g.code}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:underline"
                            >
                              Vista cliente
                            </a>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
      
      {/* QuoteBuilder Modal */}
      {job && jobType && clienti.length > 0 && (
        <QuoteBuilder
          jobId={jobId}
          clienteId={clienti[0].id}
          jobType={jobType}
          jobTypeSlug={job.jobType}
          open={quoteBuilderOpen}
          onClose={() => setQuoteBuilderOpen(false)}
        />
      )}

      {/* Crea Galleria dal Job */}
      {showNewGalleryModal && job && (
        <NewGalleryModal
          isOpen={showNewGalleryModal}
          onClose={() => setShowNewGalleryModal(false)}
          prePopulate={galleryPrePopulate}
          onGalleryCreated={() => {
            loadLinkedGalleries();
            queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
          }}
        />
      )}
    </Sheet>
  );
}
