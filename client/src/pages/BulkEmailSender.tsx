/**
 * BulkEmailSender - Sistema invio massivo email ai clienti
 * Supporta selezione destinatari, editor HTML, preview, rate limiting
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Send, Mail, Users, CheckCircle, XCircle, Loader2, AlertCircle, Eye, Search, Gauge, Save, FileText, Trash2, Play } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
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

interface BulkEmailRecipient {
  email: string;
  nome: string;
  cognome: string;
  clientId?: string;
}

interface BulkEmailJob {
  id: string;
  subject: string;
  body: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'scheduled' | 'queued';
  errors: Array<{ email: string; error: string }>;
  createdAt: any;
  completedAt?: any;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: any;
  updatedAt: any;
}

const DAILY_LIMIT = 400;

export default function BulkEmailSender() {
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  // Query destinatari disponibili
  const { data: recipientsData, isLoading: recipientsLoading } = useQuery({
    queryKey: ['/api/bulk-email/recipients', filter],
    queryFn: async () => {
      const params = filter !== 'all' ? `?filter=${filter}` : '';
      const response = await apiRequest('GET', `/api/bulk-email/recipients${params}`);
      if (!response.ok) throw new Error('Errore caricamento destinatari');
      return response.json();
    }
  });

  const recipients: BulkEmailRecipient[] = recipientsData?.recipients || [];

  // Query job attivo (polling ogni 2 secondi se in progress)
  const { data: activeJobData } = useQuery({
    queryKey: ['/api/bulk-email/jobs', activeJobId],
    queryFn: async () => {
      if (!activeJobId) return null;
      const response = await apiRequest('GET', `/api/bulk-email/jobs/${activeJobId}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!activeJobId,
    refetchInterval: (data) => {
      const job = data?.job as BulkEmailJob | undefined;
      return job?.status === 'in_progress' ? 2000 : false;
    }
  });

  const activeJob: BulkEmailJob | null = activeJobData?.job || null;

  // Query tutti i job (polling solo se c'è un job attivo)
  const hasActiveJob = !!activeJobId;
  const { data: jobsData } = useQuery<{ jobs: BulkEmailJob[] }>({
    queryKey: ['/api/bulk-email/jobs'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/bulk-email/jobs');
      if (!response.ok) return { jobs: [] };
      return response.json();
    },
    refetchInterval: hasActiveJob ? 5000 : false, // Polling solo durante invio attivo
    staleTime: 60000, // Dati freschi per 1 minuto
  });

  const allJobs: BulkEmailJob[] = jobsData?.jobs || [];

  // Query quota giornaliera
  const { data: quotaData } = useQuery<{ quota: { sent: number; reserved: number; limit: number; remaining: number } }>({
    queryKey: ['/api/bulk-email/quota'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/bulk-email/quota');
      if (!response.ok) return { quota: { sent: 0, reserved: 0, limit: 400, remaining: 400 } };
      return response.json();
    },
    refetchInterval: 30000
  });

  const quota = quotaData?.quota || { sent: 0, reserved: 0, limit: 400, remaining: 400 };

  // Query template email salvati
  const { data: templatesData } = useQuery<{ templates: EmailTemplate[] }>({
    queryKey: ['/api/bulk-email/templates'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/bulk-email/templates');
      if (!response.ok) return { templates: [] };
      return response.json();
    },
  });
  const templates: EmailTemplate[] = templatesData?.templates || [];

  // Query filtri disponibili (anni dinamici + tipi lavoro)
  const { data: filtersData } = useQuery<{ filters: { value: string; label: string }[]; jobTypeFilters: { value: string; label: string }[] }>({
    queryKey: ['/api/bulk-email/filters'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/bulk-email/filters');
      if (!response.ok) return { filters: [], jobTypeFilters: [] };
      return response.json();
    },
  });

  const yearFilters = filtersData?.filters || [];
  const jobTypeFilters = filtersData?.jobTypeFilters || [];

  // Filtra destinatari per ricerca
  const filteredRecipients = useMemo(() => {
    if (!searchQuery.trim()) return recipients;
    const query = searchQuery.toLowerCase();
    return recipients.filter(r => 
      r.nome?.toLowerCase().includes(query) ||
      r.cognome?.toLowerCase().includes(query) ||
      r.email?.toLowerCase().includes(query) ||
      `${r.nome} ${r.cognome}`.toLowerCase().includes(query)
    );
  }, [recipients, searchQuery]);

  // Calcola info split per la modale
  const splitInfo = useMemo(() => {
    const count = selectedRecipients.size;
    if (count <= DAILY_LIMIT) {
      return { needsSplit: false, jobs: 1, distribution: [count] };
    }
    const jobs = Math.ceil(count / DAILY_LIMIT);
    const distribution: number[] = [];
    let remaining = count;
    for (let i = 0; i < jobs; i++) {
      const chunk = Math.min(remaining, DAILY_LIMIT);
      distribution.push(chunk);
      remaining -= chunk;
    }
    return { needsSplit: true, jobs, distribution };
  }, [selectedRecipients.size]);

  // Mutation invio email (supporta split automatico)
  const sendMutation = useMutation({
    mutationFn: async () => {
      const selectedList = Array.from(selectedRecipients)
        .map(email => recipients.find(r => r.email === email))
        .filter(Boolean);

      if (selectedList.length === 0) {
        throw new Error('Seleziona almeno un destinatario');
      }

      if (!subject.trim() || !body.trim()) {
        throw new Error('Oggetto e corpo email sono obbligatori');
      }

      const response = await apiRequest('POST', '/api/bulk-email/send-split', {
        subject,
        body,
        recipients: selectedList,
        senderId: 'admin'
      });
      return response.json();
    },
    onSuccess: (data) => {
      const jobCount = data.jobs?.length || 1;
      toast({
        title: '✅ Invio avviato!',
        description: jobCount > 1 
          ? `Creati ${jobCount} job: il primo parte subito, gli altri sono programmati`
          : `Invio di ${selectedRecipients.size} email in corso...`
      });
      setActiveJobId(data.jobs?.[0]?.id || data.jobId);
      setShowSplitDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/bulk-email/jobs'] });
    },
    onError: (error: any) => {
      toast({
        title: '❌ Errore',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Toggle seleziona tutti (usa filteredRecipients)
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedRecipients(new Set());
    } else {
      setSelectedRecipients(new Set(filteredRecipients.map(r => r.email)));
    }
    setSelectAll(!selectAll);
  };

  // Aggiorna selectAll quando cambiano i filteredRecipients
  useEffect(() => {
    if (filteredRecipients.length > 0) {
      const allSelected = filteredRecipients.every(r => selectedRecipients.has(r.email));
      setSelectAll(allSelected);
    } else {
      setSelectAll(false);
    }
  }, [filteredRecipients, selectedRecipients]);

  // Reset activeJobId quando il job è completato (ferma polling immediatamente)
  useEffect(() => {
    if (activeJob && (activeJob.status === 'completed' || activeJob.status === 'failed')) {
      // Invalida la lista job per aggiornare lo storico e resetta subito
      queryClient.invalidateQueries({ queryKey: ['/api/bulk-email/jobs'] });
      setActiveJobId(null);
    }
  }, [activeJob?.status]);

  // Conferma invio
  const handleConfirmSend = () => {
    setShowConfirmDialog(false);
    sendMutation.mutate();
  };

  // Mutation per salvare template
  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!templateName.trim() || !subject.trim() || !body.trim()) {
        throw new Error('Nome, oggetto e corpo sono obbligatori');
      }
      const response = await apiRequest('POST', '/api/bulk-email/templates', {
        name: templateName,
        subject,
        body
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: '✅ Template salvato!' });
      setShowSaveTemplate(false);
      setTemplateName('');
      queryClient.invalidateQueries({ queryKey: ['/api/bulk-email/templates'] });
    },
    onError: (error: any) => {
      toast({ title: '❌ Errore', description: error.message, variant: 'destructive' });
    }
  });

  // Mutation per eliminare template
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await apiRequest('DELETE', `/api/bulk-email/templates/${templateId}`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({ title: '🗑️ Template eliminato' });
      queryClient.invalidateQueries({ queryKey: ['/api/bulk-email/templates'] });
    },
    onError: (error: any) => {
      toast({ title: '❌ Errore', description: error.message, variant: 'destructive' });
    }
  });

  // Carica template selezionato
  const loadTemplate = (template: EmailTemplate) => {
    setSubject(template.subject);
    setBody(template.body);
    toast({ title: '📝 Template caricato', description: template.name });
  };

  // Mutation per avviare job scheduled
  const startScheduledJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiRequest('POST', `/api/bulk-email/jobs/${jobId}/start`, {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: '🚀 Invio avviato!', description: `Job ${data.jobId} in esecuzione...` });
      setActiveJobId(data.jobId);
      queryClient.invalidateQueries({ queryKey: ['/api/bulk-email/jobs'] });
    },
    onError: (error: any) => {
      toast({ title: '❌ Errore', description: error.message, variant: 'destructive' });
    }
  });

  // Mutation per riprovare email fallite
  const retryFailedMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiRequest('POST', `/api/bulk-email/jobs/${jobId}/retry-failed`, {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: '🔄 Nuovo invio avviato!',
        description: `Riprovando ${data.recipientsCount} email fallite...`
      });
      setActiveJobId(data.jobId);
      queryClient.invalidateQueries({ queryKey: ['/api/bulk-email/jobs'] });
    },
    onError: (error: any) => {
      toast({
        title: '❌ Errore',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Toggle singolo destinatario
  const handleToggleRecipient = (email: string) => {
    const newSet = new Set(selectedRecipients);
    if (newSet.has(email)) {
      newSet.delete(email);
    } else {
      newSet.add(email);
    }
    setSelectedRecipients(newSet);
    setSelectAll(newSet.size === recipients.length);
  };

  // Template email esempio
  const insertExampleTemplate = () => {
    setSubject('Cambio Piattaforma - Nuova Area Clienti');
    setBody(`<div style="margin-bottom: 20px;">
  <p>Ciao <strong>{nome}</strong>,</p>
  <p>Ti scriviamo per informarti di un importante aggiornamento della nostra piattaforma.</p>
</div>

<div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
  <h3 style="color: #8b5a3c; margin-top: 0;">🎉 Nuova Area Clienti</h3>
  <p>Abbiamo completamente rinnovato il sistema di gestione per offrirti un'esperienza ancora migliore:</p>
  <ul style="line-height: 1.8;">
    <li><strong>Gallerie Fotografiche</strong> più veloci e intuitive</li>
    <li><strong>Preventivi Digitali</strong> firmabili online</li>
    <li><strong>Scadenzario Pagamenti</strong> automatico</li>
    <li><strong>Gestione Completa</strong> del tuo servizio fotografico</li>
  </ul>
</div>

<p>Tutte le tue informazioni sono state migrate nella nuova piattaforma. Se hai domande o necessiti di supporto, non esitare a contattarci.</p>

<p style="margin-top: 30px;">A presto,<br><strong>Gennaro Mazzacane</strong></p>`);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">📧 Invio Email Massivo</h1>
        <p className="text-muted-foreground">
          Sistema di invio massivo per comunicazioni ai clienti (max 400 email/giorno)
        </p>
      </div>

      <Tabs defaultValue="compose" className="space-y-6">
        <TabsList>
          <TabsTrigger value="compose">
            <Mail className="h-4 w-4 mr-2" />
            Componi Email
          </TabsTrigger>
          <TabsTrigger value="jobs">
            <Loader2 className="h-4 w-4 mr-2" />
            Jobs Attivi ({allJobs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Editor Email */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>✍️ Componi Messaggio</CardTitle>
                  <CardDescription>
                    Usa <code className="bg-muted px-1">{`{nome}`}</code>, <code className="bg-muted px-1">{`{cognome}`}</code>, <code className="bg-muted px-1">{`{nome_completo}`}</code> per personalizzare
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="subject">Oggetto Email</Label>
                    <Input
                      id="subject"
                      placeholder="Es: Cambio Piattaforma - Nuova Area Clienti"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      data-testid="input-email-subject"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label htmlFor="body">Corpo Email (HTML supportato)</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={insertExampleTemplate}
                        data-testid="button-insert-template"
                      >
                        📝 Template Esempio
                      </Button>
                    </div>
                    <Textarea
                      id="body"
                      placeholder="Inserisci il corpo dell'email qui (HTML supportato)..."
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={16}
                      className="font-mono text-sm"
                      data-testid="textarea-email-body"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowPreview(!showPreview)}
                      data-testid="button-toggle-preview"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      {showPreview ? 'Nascondi' : 'Mostra'} Anteprima
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowSaveTemplate(true)}
                      disabled={!subject.trim() || !body.trim()}
                      data-testid="button-save-template"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Salva Template
                    </Button>
                    {templates.length > 0 && (
                      <Select onValueChange={(id) => {
                        const tpl = templates.find(t => t.id === id);
                        if (tpl) loadTemplate(tpl);
                      }}>
                        <SelectTrigger className="w-[200px]" data-testid="select-load-template">
                          <FileText className="h-4 w-4 mr-2" />
                          <SelectValue placeholder="Carica template..." />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map(tpl => (
                            <SelectItem key={tpl.id} value={tpl.id}>
                              {tpl.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {showPreview && (
                    <Card className="bg-muted/50">
                      <CardHeader>
                        <CardTitle className="text-sm">📧 Anteprima Email</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="bg-white p-6 rounded-lg">
                          <div className="mb-4 pb-4 border-b">
                            <p className="text-sm text-muted-foreground mb-1">Oggetto:</p>
                            <p className="font-semibold">{subject || '(nessun oggetto)'}</p>
                          </div>
                          <div 
                            dangerouslySetInnerHTML={{ 
                              __html: body.replace(/\{nome\}/g, '<span class="bg-yellow-100">Mario</span>')
                                          .replace(/\{cognome\}/g, '<span class="bg-yellow-100">Rossi</span>')
                                          .replace(/\{nome_completo\}/g, '<span class="bg-yellow-100">Mario Rossi</span>')
                            }} 
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Selezione Destinatari */}
            <div className="space-y-6">
              {/* Quota Giornaliera */}
              <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Gauge className="h-5 w-5 text-blue-600" />
                      <span className="font-semibold text-blue-900">Quota Giornaliera</span>
                    </div>
                    <Badge variant={quota.remaining > 500 ? "default" : quota.remaining > 100 ? "secondary" : "destructive"}>
                      {quota.remaining} rimanenti
                    </Badge>
                  </div>
                  <Progress 
                    value={((quota.sent + quota.reserved) / quota.limit) * 100} 
                    className="h-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{quota.sent} inviate + {quota.reserved} riservate</span>
                    <span>Max {quota.limit}/giorno</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Destinatari ({selectedRecipients.size})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="filter">Filtra Clienti</Label>
                    <Select value={filter} onValueChange={(v) => { setFilter(v); setSelectedRecipients(new Set()); }}>
                      <SelectTrigger id="filter" data-testid="select-recipient-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={4} className="z-[9999] max-h-[400px]">
                        <SelectItem value="all">📋 Tutti i clienti</SelectItem>
                        
                        {/* Filtri Speciali */}
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">
                          🎯 Filtri Speciali
                        </div>
                        <SelectItem value="preventivi_non_firmati">Preventivi Non Firmati (Upsell)</SelectItem>
                        
                        {/* Tipi Lavoro */}
                        {jobTypeFilters.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">
                              📷 Per Tipo Lavoro
                            </div>
                            {jobTypeFilters.map((f: { value: string; label: string }) => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </>
                        )}
                        
                        {/* Per Anno */}
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">
                          📅 Per Anno
                        </div>
                        <SelectItem value="anno_corrente">Anno corrente</SelectItem>
                        {yearFilters.map((f: { value: string; label: string }) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Ricerca Destinatari */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Cerca per nome o email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-recipients"
                    />
                  </div>

                  {recipientsLoading ? (
                    <div className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Caricamento...</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 py-2 border-b">
                        <Checkbox
                          checked={selectAll && filteredRecipients.length > 0}
                          onCheckedChange={handleSelectAll}
                          id="select-all"
                          data-testid="checkbox-select-all"
                        />
                        <Label htmlFor="select-all" className="cursor-pointer font-semibold">
                          Seleziona tutti ({filteredRecipients.length})
                        </Label>
                        {searchQuery && (
                          <Badge variant="outline" className="ml-auto">
                            {filteredRecipients.length} di {recipients.length}
                          </Badge>
                        )}
                      </div>

                      <ScrollArea className="h-[350px]">
                        <div className="space-y-2">
                          {filteredRecipients.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                              <p>Nessun destinatario trovato</p>
                            </div>
                          ) : (
                            filteredRecipients.map((recipient) => (
                              <div
                                key={recipient.email}
                                className="flex items-start gap-2 p-2 rounded hover:bg-muted/50"
                              >
                                <Checkbox
                                  checked={selectedRecipients.has(recipient.email)}
                                  onCheckedChange={() => handleToggleRecipient(recipient.email)}
                                  id={`recipient-${recipient.email}`}
                                  data-testid={`checkbox-recipient-${recipient.email}`}
                                />
                                <Label
                                  htmlFor={`recipient-${recipient.email}`}
                                  className="cursor-pointer flex-1"
                                >
                                  <p className="font-medium text-sm">
                                    {recipient.nome} {recipient.cognome}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{recipient.email}</p>
                                </Label>
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </>
                  )}

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => splitInfo.needsSplit ? setShowSplitDialog(true) : setShowConfirmDialog(true)}
                    disabled={sendMutation.isPending || selectedRecipients.size === 0 || !subject.trim() || !body.trim()}
                    data-testid="button-send-bulk-email"
                  >
                    {sendMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Invio in corso...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Invia a {selectedRecipients.size} destinatari
                      </>
                    )}
                  </Button>

                  {selectedRecipients.size > quota.remaining && (
                    <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-destructive">
                        <strong>Quota insufficiente!</strong><br />
                        Hai selezionato {selectedRecipients.size} destinatari ma ne puoi inviare solo {quota.remaining} oggi.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Progress attivo - VERSIONE MIGLIORATA */}
              {activeJob && (
                <Card className={`border-2 ${
                  activeJob.status === 'in_progress' 
                    ? 'border-blue-400 bg-blue-50/50 animate-pulse' 
                    : activeJob.status === 'completed' 
                      ? 'border-green-400 bg-green-50/50' 
                      : 'border-red-400 bg-red-50/50'
                }`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-3">
                      {activeJob.status === 'in_progress' && (
                        <div className="relative">
                          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                          <div className="absolute inset-0 h-6 w-6 animate-ping bg-blue-400 rounded-full opacity-30" />
                        </div>
                      )}
                      {activeJob.status === 'completed' && <CheckCircle className="h-6 w-6 text-green-600" />}
                      {activeJob.status === 'failed' && <XCircle className="h-6 w-6 text-destructive" />}
                      <span className="text-lg">
                        {activeJob.status === 'in_progress' ? 'Invio in corso...' : 
                         activeJob.status === 'completed' ? 'Invio completato!' : 'Invio fallito'}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Barra progresso grande */}
                    <div>
                      <div className="flex justify-between items-end mb-2">
                        <div className="text-3xl font-bold text-blue-700">
                          {Math.round((activeJob.sentCount / activeJob.totalRecipients) * 100)}%
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold">
                            {activeJob.sentCount} / {activeJob.totalRecipients}
                          </div>
                          <div className="text-xs text-muted-foreground">email elaborate</div>
                        </div>
                      </div>
                      <Progress 
                        value={(activeJob.sentCount / activeJob.totalRecipients) * 100} 
                        className="h-4"
                      />
                    </div>

                    {/* Stats cards */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-green-100 rounded-lg p-3 text-center">
                        <CheckCircle className="h-5 w-5 text-green-600 mx-auto mb-1" />
                        <div className="text-2xl font-bold text-green-700">{activeJob.sentCount}</div>
                        <div className="text-xs text-green-600">Inviate con successo</div>
                      </div>
                      <div className="bg-red-100 rounded-lg p-3 text-center">
                        <XCircle className="h-5 w-5 text-red-600 mx-auto mb-1" />
                        <div className="text-2xl font-bold text-red-700">{activeJob.failedCount}</div>
                        <div className="text-xs text-red-600">Non inviate</div>
                      </div>
                    </div>

                    {/* Tasso di successo */}
                    {activeJob.status === 'completed' && (
                      <div className={`p-3 rounded-lg text-center ${
                        activeJob.failedCount === 0 
                          ? 'bg-green-100 text-green-800' 
                          : activeJob.failedCount < activeJob.sentCount 
                            ? 'bg-yellow-100 text-yellow-800' 
                            : 'bg-red-100 text-red-800'
                      }`}>
                        <div className="text-lg font-semibold">
                          Tasso di successo: {Math.round((activeJob.sentCount / activeJob.totalRecipients) * 100)}%
                        </div>
                        {activeJob.failedCount > 0 && (
                          <div className="text-sm mt-1">
                            {activeJob.failedCount} email non sono state consegnate
                          </div>
                        )}
                      </div>
                    )}

                    {/* Lista errori dettagliata */}
                    {activeJob.errors && activeJob.errors.length > 0 && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-destructive flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            Email non inviate ({activeJob.errors.length})
                          </span>
                        </div>
                        <ScrollArea className="h-[150px] border rounded-lg">
                          <div className="p-2 space-y-1">
                            {activeJob.errors.map((err, idx) => (
                              <div 
                                key={idx} 
                                className="flex items-start gap-2 p-2 bg-red-50 rounded text-sm border-l-2 border-red-400"
                              >
                                <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                                <div>
                                  <div className="font-medium text-red-700">{err.email}</div>
                                  <div className="text-xs text-red-600">{err.error}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    )}

                    {/* Pulsanti azione quando completato */}
                    {activeJob.status !== 'in_progress' && (
                      <div className="space-y-2 mt-4">
                        {/* Pulsante riprova email fallite */}
                        {activeJob.failedCount > 0 && (
                          <Button 
                            className="w-full bg-amber-600 hover:bg-amber-700"
                            onClick={() => retryFailedMutation.mutate(activeJob.id)}
                            disabled={retryFailedMutation.isPending}
                          >
                            {retryFailedMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Creazione nuovo job...
                              </>
                            ) : (
                              <>
                                <Send className="h-4 w-4 mr-2" />
                                🔄 Riprova {activeJob.failedCount} email fallite
                              </>
                            )}
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => setActiveJobId(null)}
                        >
                          Chiudi e torna all'editor
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <CardTitle>📊 Storico Jobs</CardTitle>
              <CardDescription>Ultimi 50 job di invio massivo</CardDescription>
            </CardHeader>
            <CardContent>
              {allJobs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nessun job trovato</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {allJobs.map((job) => (
                    <div
                      key={job.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold">{job.subject}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(job.createdAt?.seconds * 1000 || job.createdAt).toLocaleString('it-IT')}
                          </p>
                        </div>
                        <Badge variant={
                          job.status === 'completed' ? 'default' : 
                          job.status === 'in_progress' ? 'outline' : 
                          job.status === 'scheduled' ? 'secondary' :
                          job.status === 'queued' ? 'outline' :
                          'destructive'
                        }>
                          {job.status === 'scheduled' ? '⏰ Programmato' : 
                           job.status === 'queued' ? '🔄 In coda' :
                           job.status === 'in_progress' ? '📤 In corso' :
                           job.status === 'completed' ? '✅ Completato' :
                           job.status}
                        </Badge>
                      </div>

                      <Progress 
                        value={(job.sentCount / job.totalRecipients) * 100} 
                        className="h-2 mb-2"
                      />

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-sm">
                          <span>
                            <CheckCircle className="h-4 w-4 inline mr-1 text-green-600" />
                            {job.sentCount}/{job.totalRecipients}
                          </span>
                          {job.failedCount > 0 && (
                            <span className="text-destructive">
                              <XCircle className="h-4 w-4 inline mr-1" />
                              {job.failedCount} errori
                            </span>
                          )}
                        </div>
                        {job.status === 'scheduled' && (
                          <Button 
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => startScheduledJobMutation.mutate(job.id)}
                            disabled={startScheduledJobMutation.isPending}
                            data-testid={`button-start-job-${job.id}`}
                          >
                            {startScheduledJobMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4 mr-1" />
                            )}
                            Avvia
                          </Button>
                        )}
                        {job.failedCount > 0 && job.status === 'completed' && (
                          <Button 
                            size="sm"
                            variant="outline"
                            className="text-amber-600 border-amber-300 hover:bg-amber-50"
                            onClick={() => retryFailedMutation.mutate(job.id)}
                            disabled={retryFailedMutation.isPending}
                          >
                            🔄 Riprova ({job.failedCount})
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog di Conferma Invio */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              Conferma Invio Email Massivo
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>Stai per inviare un'email a <strong>{selectedRecipients.size}</strong> destinatari.</p>
                
                <div className="bg-muted p-3 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Oggetto:</span>
                    <span className="font-medium truncate max-w-[200px]">{subject}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Destinatari:</span>
                    <span className="font-medium">{selectedRecipients.size}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Quota rimanente dopo invio:</span>
                    <span className="font-medium">{quota.remaining - selectedRecipients.size}</span>
                  </div>
                </div>

                <div className="text-sm text-amber-600 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Questa azione non può essere annullata. Verifica che i destinatari e il contenuto siano corretti.</span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmSend}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Send className="h-4 w-4 mr-2" />
              Conferma Invio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Split Automatico */}
      <AlertDialog open={showSplitDialog} onOpenChange={setShowSplitDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-amber-600" />
              Invio Diviso in Più Giorni
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Hai selezionato <strong>{selectedRecipients.size}</strong> destinatari, 
                  che superano il limite giornaliero di <strong>{DAILY_LIMIT}</strong> email.
                </p>
                
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                  <p className="font-semibold text-amber-800 mb-3">
                    📬 Le email saranno divise in {splitInfo.jobs} invii:
                  </p>
                  <div className="space-y-2">
                    {splitInfo.distribution.map((count, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          {idx === 0 ? (
                            <Badge className="bg-green-600">Oggi</Badge>
                          ) : (
                            <Badge variant="outline">Giorno {idx + 1}</Badge>
                          )}
                          <span>{count} email</span>
                        </span>
                        {idx === 0 ? (
                          <span className="text-green-600 text-xs">Parte subito</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Clicca per avviare</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  Il primo invio parte subito. Gli altri job saranno creati in stato "Programmato" 
                  e potrai avviarli cliccando il pulsante "Avvia" quando vorrai.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => sendMutation.mutate()}
              className="bg-amber-600 hover:bg-amber-700"
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Crea {splitInfo.jobs} Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Salva Template */}
      <AlertDialog open={showSaveTemplate} onOpenChange={setShowSaveTemplate}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Save className="h-5 w-5 text-green-600" />
              Salva Template Email
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-2">
                <div>
                  <Label htmlFor="template-name">Nome Template</Label>
                  <Input
                    id="template-name"
                    placeholder="Es: Promozione Natale 2025"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    data-testid="input-template-name"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Verrà salvato l'oggetto e il corpo dell'email corrente.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => saveTemplateMutation.mutate()}
              disabled={!templateName.trim() || saveTemplateMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {saveTemplateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salva Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
