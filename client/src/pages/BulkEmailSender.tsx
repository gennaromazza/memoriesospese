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
import { Send, Mail, Users, CheckCircle, XCircle, Loader2, AlertCircle, Eye, Search, Gauge } from 'lucide-react';
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
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  errors: Array<{ email: string; error: string }>;
  createdAt: any;
  completedAt?: any;
}

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

  // Query destinatari disponibili
  const { data: recipientsData, isLoading: recipientsLoading } = useQuery({
    queryKey: ['/api/bulk-email/recipients', filter],
    queryFn: async () => {
      const params = filter !== 'all' ? `?filter=${filter}` : '';
      const response = await fetch(`/api/bulk-email/recipients${params}`);
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
      const response = await fetch(`/api/bulk-email/jobs/${activeJobId}`);
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

  // Query tutti i job
  const { data: jobsData } = useQuery({
    queryKey: ['/api/bulk-email/jobs'],
    refetchInterval: 5000 // Aggiorna ogni 5 secondi
  });

  const allJobs: BulkEmailJob[] = jobsData?.jobs || [];

  // Query quota giornaliera
  const { data: quotaData } = useQuery({
    queryKey: ['/api/bulk-email/quota'],
    refetchInterval: 30000
  });

  const quota = quotaData?.quota || { sent: 0, reserved: 0, limit: 2000, remaining: 2000 };

  // Query filtri disponibili (anni dinamici + tipi lavoro)
  const { data: filtersData } = useQuery({
    queryKey: ['/api/bulk-email/filters']
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

  // Mutation invio email
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

      return apiRequest('/api/bulk-email/send', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          body,
          recipients: selectedList,
          senderId: 'admin'
        })
      });
    },
    onSuccess: (data) => {
      toast({
        title: '✅ Invio avviato!',
        description: `Invio di ${selectedRecipients.size} email in corso...`
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

  // Conferma invio
  const handleConfirmSend = () => {
    setShowConfirmDialog(false);
    sendMutation.mutate();
  };

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
          Sistema di invio massivo per comunicazioni ai clienti (max 2,000 email/giorno)
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

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowPreview(!showPreview)}
                      data-testid="button-toggle-preview"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      {showPreview ? 'Nascondi' : 'Mostra'} Anteprima
                    </Button>
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
                    onClick={() => setShowConfirmDialog(true)}
                    disabled={sendMutation.isPending || selectedRecipients.size === 0 || !subject.trim() || !body.trim() || selectedRecipients.size > quota.remaining}
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

              {/* Progress attivo */}
              {activeJob && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      {activeJob.status === 'in_progress' && <Loader2 className="h-4 w-4 animate-spin" />}
                      {activeJob.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-600" />}
                      {activeJob.status === 'failed' && <XCircle className="h-4 w-4 text-destructive" />}
                      Job Corrente
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Progress</span>
                        <span className="font-semibold">
                          {activeJob.sentCount} / {activeJob.totalRecipients}
                        </span>
                      </div>
                      <Progress 
                        value={(activeJob.sentCount / activeJob.totalRecipients) * 100} 
                        className="h-2"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span>{activeJob.sentCount} inviate</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-destructive" />
                        <span>{activeJob.failedCount} errori</span>
                      </div>
                    </div>

                    {activeJob.errors.length > 0 && (
                      <div className="mt-3 p-2 bg-destructive/10 rounded text-xs">
                        <p className="font-semibold mb-1">Errori:</p>
                        {activeJob.errors.slice(0, 3).map((err, idx) => (
                          <p key={idx} className="text-destructive">
                            {err.email}: {err.error}
                          </p>
                        ))}
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
                          'destructive'
                        }>
                          {job.status}
                        </Badge>
                      </div>

                      <Progress 
                        value={(job.sentCount / job.totalRecipients) * 100} 
                        className="h-2 mb-2"
                      />

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
    </div>
  );
}
