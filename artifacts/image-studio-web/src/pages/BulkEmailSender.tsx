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
import { toggleMarketingAudienceFilter } from '@/lib/marketing-audience-selection';
import { Send, Mail, Users, CheckCircle, XCircle, Loader2, AlertCircle, Eye, Search, Save, FileText, Trash2, Play, CalendarDays, Filter } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useStudio } from '@/context/StudioContext';
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
  provider?: 'gmail' | 'resend';
  providerStatus?: string;
  progressStage?: string;
  preparedCount?: number;
  excludedCount?: number;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: any;
  updatedAt: any;
}

interface BookingCampaignFilter {
  value: string;
  label: string;
  endDate: string | null;
  recipientsCount: number;
}

function emailSelectionKey(email: string): string {
  return email.trim().toLowerCase();
}

function formatCampaignDate(date: string | null | undefined): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Data non disponibile';
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export default function BulkEmailSender() {
  const { toast } = useToast();
  const { studioSettings, loading: studioSettingsLoading } = useStudio();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [senderEmail, setSenderEmail] = useState('');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  const { data: resendStatus, isLoading: resendStatusLoading, error: resendStatusError } = useQuery<{
    success: boolean;
    connected: boolean;
    verifiedSendingDomains: Array<{ id: string; name: string; status: string }>;
  }>({
    queryKey: ['/api/bulk-email/resend-status'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/bulk-email/resend-status');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Collegamento Resend non disponibile');
      }
      return data;
    },
    retry: false,
  });

  const verifiedSendingDomains = resendStatus?.verifiedSendingDomains || [];
  const hasStudioContact = Boolean(studioSettings.email.trim() || studioSettings.phone.trim());

  useEffect(() => {
    if (!senderEmail && verifiedSendingDomains.length > 0) {
      const preferredDomain = verifiedSendingDomains.find(
        (domain) => domain.name === 'imagestudiofotografico.com',
      );
      setSenderEmail(`newsletter@${(preferredDomain || verifiedSendingDomains[0]).name}`);
    }
  }, [senderEmail, verifiedSendingDomains]);

  // Query destinatari disponibili
  const recipientsFilterKey = selectedFilters.slice().sort().join('|');
  const { data: recipientsData, isLoading: recipientsLoading, error: recipientsError } = useQuery<{
    recipients: BulkEmailRecipient[];
    total: number;
    duplicatesRemoved?: number;
    unlinkedBookingContacts?: number;
  }>({
    queryKey: ['/api/bulk-email/recipients', recipientsFilterKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      selectedFilters.forEach((value) => params.append('filters', value));
      const response = await apiRequest('GET', `/api/bulk-email/recipients?${params.toString()}`);
      if (!response.ok) throw new Error('Errore caricamento destinatari');
      return response.json();
    },
    enabled: selectedFilters.length > 0,
  });

  const recipients: BulkEmailRecipient[] = recipientsData?.recipients || [];
  const duplicatesRemoved = recipientsData?.duplicatesRemoved || 0;
  const unlinkedBookingContacts = recipientsData?.unlinkedBookingContacts || 0;

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
    refetchInterval: (query) => {
      const job = query.state.data?.job as BulkEmailJob | undefined;
      return job && ['queued', 'in_progress'].includes(job.status) ? 2000 : false;
    }
  });

  const activeJob: BulkEmailJob | null = activeJobData?.job || null;

  // Query tutti i job (polling solo se c'è un job attivo)
  const hasActiveJob = !!activeJobId && (!activeJob || ['queued', 'in_progress'].includes(activeJob.status));
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
  const { data: filtersData } = useQuery<{
    filters: { value: string; label: string }[];
    jobTypeFilters: { value: string; label: string }[];
    bookingCampaignFilters: BookingCampaignFilter[];
  }>({
    queryKey: ['/api/bulk-email/filters'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/bulk-email/filters');
      if (!response.ok) return { filters: [], jobTypeFilters: [], bookingCampaignFilters: [] };
      return response.json();
    },
  });

  const yearFilters = filtersData?.filters || [];
  const jobTypeFilters = filtersData?.jobTypeFilters || [];
  const bookingCampaignFilters = filtersData?.bookingCampaignFilters || [];
  const audienceFilterLabels = new Map([
    ["all", "Tutti i clienti"],
    ["preventivi_non_firmati", "Preventivi non firmati"],
    ["anno_corrente", "Anno corrente"],
    ...yearFilters.map(({ value, label }) => [value, label]),
    ...jobTypeFilters.map(({ value, label }) => [value, label]),
    ...bookingCampaignFilters.map(({ value, label }) => [value, label]),
  ] as [string, string][]);
  const activeAudienceLabels = selectedFilters.map((value) => audienceFilterLabels.get(value) || value);

  const toggleRecipientFilter = (value: string) => {
    setSelectedFilters((current) => toggleMarketingAudienceFilter(current, value));
    setSelectedRecipients(new Set());
    setSelectAll(false);
    setConsentConfirmed(false);
    setShowConfirmDialog(false);
  };

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

  // Mutation per creare una campagna Resend Marketing.
  const sendMutation = useMutation({
    mutationFn: async () => {
      const selectedList = Array.from(selectedRecipients)
        .map(email => recipients.find(r => emailSelectionKey(r.email) === email))
        .filter(Boolean);

      if (selectedList.length === 0) {
        throw new Error('Seleziona almeno un destinatario');
      }

      if (!subject.trim() || !body.trim() || !senderEmail.trim()) {
        throw new Error('Mittente, oggetto e corpo email sono obbligatori');
      }
      if (!hasStudioContact) {
        throw new Error('Configura almeno un’email o un telefono in Impostazioni > Studio prima di inviare.');
      }

      const response = await apiRequest('POST', '/api/bulk-email/send-resend', {
        subject,
        body,
        senderEmail,
        recipients: selectedList,
        senderId: 'admin',
        confirmMarketingConsent: true,
        audienceFilters: selectedFilters,
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Impossibile avviare la campagna');
      }
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Campagna Resend avviata',
        description: `Resend sta preparando ${selectedRecipients.size} destinatari.`,
      });
      setActiveJobId(data.jobs?.[0]?.id || data.jobId);
      setConsentConfirmed(false);
      setShowConfirmDialog(false);
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

  // Seleziona/deseleziona i risultati visibili senza perdere la selezione fuori ricerca.
  const handleSelectAll = () => {
    const visibleEmails = filteredRecipients.map((recipient) => emailSelectionKey(recipient.email));
    const allVisibleSelected = visibleEmails.length > 0 &&
      visibleEmails.every((email) => selectedRecipients.has(email));
    setSelectedRecipients((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleEmails.forEach((email) => next.delete(email));
      else visibleEmails.forEach((email) => next.add(email));
      return next;
    });
  };

  // Aggiorna selectAll quando cambiano i filteredRecipients
  useEffect(() => {
    if (filteredRecipients.length > 0) {
      const allSelected = filteredRecipients.every(r => selectedRecipients.has(emailSelectionKey(r.email)));
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
      if (activeJob.provider !== 'resend') setActiveJobId(null);
    }
  }, [activeJob?.status]);

  // Conferma invio
  const handleConfirmSend = () => {
    if (!consentConfirmed) return;
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
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Impossibile riprendere il job');
      }
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: data.resumed ? 'Ripresa Resend avviata' : 'Nuovo invio avviato',
        description: data.resumed
          ? 'Verifico lo stato della campagna esistente senza creare un invio duplicato.'
          : `Riprovando ${data.recipientsCount} email fallite...`
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

  const resumeResendJob = (job: BulkEmailJob) => {
    if (window.confirm(
      `Questa ripresa usa i ${job.totalRecipients} destinatari originali, NON i filtri attualmente selezionati. ` +
      "Per cambiare pubblico, annulla e crea una nuova campagna dall’editor. Vuoi riprendere la lista originale?",
    )) retryFailedMutation.mutate(job.id);
  };

  // Toggle singolo destinatario
  const handleToggleRecipient = (email: string) => {
    const key = emailSelectionKey(email);
    const newSet = new Set(selectedRecipients);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedRecipients(newSet);
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

  const renderAudienceFilter = (
    value: string,
    label: string,
    description: string,
    count?: number,
  ) => {
    const id = `audience-${value.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    return (
      <div
        key={value}
        className="flex min-w-0 items-start gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2.5 transition-colors hover:border-teal-300 hover:bg-teal-50/40"
      >
        <Checkbox
          id={id}
          checked={selectedFilters.includes(value)}
          onCheckedChange={() => toggleRecipientFilter(value)}
          data-testid={`checkbox-${id}`}
          disabled={count === 0}
          className="mt-0.5"
        />
        <Label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-sm font-medium leading-5 text-stone-800">{label}</span>
            <span className="mt-0.5 block text-xs leading-4 text-stone-500">{description}</span>
          </span>
          {typeof count === "number" && (
            <Badge variant="secondary" className="shrink-0 rounded-full bg-stone-100 text-stone-600">
              {count}
            </Badge>
          )}
        </Label>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-3 py-5 sm:px-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-gradient-to-r from-stone-50 to-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-teal-800">
            <Mail className="h-4 w-4" />
            Comunicazione clienti
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
            Invio email marketing
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Prepara una campagna, componi il pubblico e controlla i destinatari prima di affidarla a Resend.
          </p>
        </div>
        <Badge
          variant={resendStatus?.connected ? "default" : "destructive"}
          className="w-fit rounded-full px-3 py-1"
          data-testid="status-resend-connection"
        >
          {resendStatusLoading ? "Verifica Resend…" : resendStatus?.connected ? "Resend collegato" : "Resend non disponibile"}
        </Badge>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="rounded-lg bg-amber-50 p-2 text-amber-800"><Mail className="h-4 w-4" /></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">01 · Messaggio</p><p className="text-sm text-stone-700">Oggetto e contenuto</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="rounded-lg bg-teal-50 p-2 text-teal-800"><Users className="h-4 w-4" /></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">02 · Destinatari</p><p className="text-sm text-stone-700">{recipients.length} contatti unici disponibili</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="rounded-lg bg-sky-50 p-2 text-sky-800"><CheckCircle className="h-4 w-4" /></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">03 · Revisione</p><p className="text-sm text-stone-700">Anteprima e conferma prima dell’invio</p></div>
        </div>
      </div>

      <Tabs defaultValue="compose" className="space-y-5">
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl bg-stone-100 p-1 sm:w-fit">
          <TabsTrigger value="compose">
            <Mail className="h-4 w-4 mr-2" />
            Nuovo invio
          </TabsTrigger>
          <TabsTrigger value="jobs">
            <Loader2 className="h-4 w-4 mr-2" />
            Invii e attività ({allJobs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
            {/* Editor Email */}
            <div className="space-y-5 lg:col-span-3">
              <Card className="overflow-hidden rounded-2xl border-stone-200 shadow-sm">
                <CardHeader className="border-b border-stone-100 bg-stone-50/70">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Mail className="h-5 w-5 text-teal-800" />
                    Componi il messaggio
                  </CardTitle>
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
                    <Label htmlFor="sender-email">Indirizzo mittente</Label>
                    <Input
                      id="sender-email"
                      type="email"
                      placeholder="newsletter@gennaromazzacane.it"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      data-testid="input-sender-email"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Deve appartenere a un dominio verificato in Resend. Ogni invio includerà il footer automatico con i recapiti dello studio.
                    </p>
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
                      rows={13}
                      className="min-h-64 resize-y font-mono text-sm"
                      data-testid="textarea-email-body"
                    />
                    <div
                      className={`mt-3 rounded-lg border p-3 text-xs ${
                        studioSettingsLoading || hasStudioContact
                          ? 'border-teal-200 bg-teal-50 text-teal-900'
                          : 'border-amber-300 bg-amber-50 text-amber-900'
                      }`}
                      role="status"
                      data-testid="notice-automatic-email-footer"
                    >
                      <p className="font-semibold">
                        {studioSettingsLoading
                          ? 'Caricamento dei recapiti dello studio…'
                          : hasStudioContact
                            ? 'Footer automatico incluso in ogni invio'
                            : 'Completa i recapiti dello studio'}
                      </p>
                      <p className="mt-1">
                        Ogni email avviserà il cliente di non rispondere direttamente e mostrerà i recapiti salvati in Impostazioni dello studio.
                        {!studioSettingsLoading && !hasStudioContact && ' Inserisci almeno email o telefono per abilitare l’invio.'}
                      </p>
                    </div>
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
                            <div className="mt-8 border-t border-stone-200 pt-4 text-xs leading-relaxed text-stone-600" data-testid="preview-automatic-email-footer">
                              <p className="font-semibold text-stone-800">Comunicazione automatica</p>
                              <p className="mt-1">
                                Ti chiediamo di non rispondere direttamente a questa email. Per informazioni o assistenza, contatta {studioSettings.name.trim() || 'lo studio'} tramite i recapiti qui sotto.
                              </p>
                              <div className="mt-2 space-y-1">
                                {studioSettings.email.trim() && (
                                  <p><a className="text-teal-800 underline" href={`mailto:${encodeURIComponent(studioSettings.email.trim())}`}>{studioSettings.email.trim()}</a></p>
                                )}
                                {studioSettings.phone.trim() && (
                                  <p><a className="text-teal-800 underline" href={`tel:${studioSettings.phone.trim().replace(/[^\d+]/g, '')}`}>{studioSettings.phone.trim()}</a></p>
                                )}
                                {studioSettings.address.trim() && <p>{studioSettings.address.trim()}</p>}
                                {!studioSettings.email.trim() && !studioSettings.phone.trim() && (
                                  <p className="text-amber-700">Aggiungi email o telefono in Impostazioni dello studio.</p>
                                )}
                              </div>
                            </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Selezione Destinatari */}
            <div className="space-y-5 lg:col-span-2">
              <Card className="overflow-hidden rounded-2xl border-sky-200 bg-gradient-to-br from-sky-50 to-white shadow-sm">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Mail className="h-5 w-5 text-blue-600" />
                      <span className="font-semibold text-blue-900">Configurazione Resend Marketing</span>
                    </div>
                  </div>
                  {verifiedSendingDomains.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Domini mittente verificati: {verifiedSendingDomains.map((domain) => domain.name).join(', ')}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {resendStatusLoading
                        ? "Controllo il collegamento e i domini…"
                        : resendStatusError instanceof Error
                          ? resendStatusError.message
                          : "Verifica un dominio mittente in Resend per iniziare."}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Resend gestisce le disiscrizioni. La campagna non usa la quota Gmail giornaliera.
                  </p>
                </CardContent>
              </Card>

              <Card className="overflow-hidden rounded-2xl border-stone-200 shadow-sm">
                <CardHeader className="border-b border-stone-100 bg-stone-50/70 pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Users className="h-5 w-5 text-teal-800" />
                        Destinatari
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {selectedRecipients.size} selezionati · {recipients.length} email uniche
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="shrink-0 rounded-full bg-white px-3">
                      {recipients.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="flex items-start gap-2">
                    <Filter className="mt-0.5 h-4 w-4 text-stone-500" />
                    <div>
                      <Label className="text-sm font-semibold text-stone-800">Componi il pubblico</Label>
                      <p className="mt-0.5 text-xs text-stone-500">
                        Seleziona uno o più gruppi: i contatti vengono uniti e le email duplicate eliminate.
                        “Tutti i clienti” è alternativo ai gruppi specifici, non si aggiunge ad essi.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {renderAudienceFilter("all", "Tutti i clienti", "Anagrafica clienti")}
                    {renderAudienceFilter(
                      "preventivi_non_firmati",
                      "Preventivi non firmati",
                      "Per un messaggio di ricontatto",
                    )}
                  </div>

                  {selectedFilters.length > 0 && (
                    <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm" data-testid="active-audience-groups">
                      <p className="mb-2 font-semibold text-teal-900">Gruppi attivi ({selectedFilters.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedFilters.map((value) => (
                          <Button key={value} type="button" variant="outline" size="sm"
                            className="h-auto max-w-full whitespace-normal text-left"
                            onClick={() => toggleRecipientFilter(value)}
                            aria-label={`Rimuovi ${audienceFilterLabels.get(value) || value}`}>
                            {audienceFilterLabels.get(value) || value} ×
                          </Button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-teal-900">Solo i destinatari di questi gruppi sono inclusi. Clicca un gruppo per rimuoverlo.</p>
                    </div>
                  )}

                  <details className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-stone-700">
                      <span className="flex items-center gap-2"><Users className="h-4 w-4" /> Per tipo di lavoro</span>
                      <Badge variant="secondary">{jobTypeFilters.length}</Badge>
                    </summary>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {jobTypeFilters.length > 0
                        ? jobTypeFilters.map((filterOption) => renderAudienceFilter(
                            filterOption.value,
                            filterOption.label,
                            "Clienti con un lavoro di questo tipo",
                          ))
                        : <p className="text-xs text-stone-500">Nessun tipo di lavoro disponibile.</p>}
                    </div>
                  </details>

                  <details className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-stone-700">
                      <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Per anno</span>
                      <Badge variant="secondary">{yearFilters.length + 1}</Badge>
                    </summary>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {renderAudienceFilter("anno_corrente", "Anno corrente", "Clienti dell’anno in corso")}
                      {yearFilters.map((filterOption) => renderAudienceFilter(
                        filterOption.value,
                        filterOption.label,
                        "Clienti associati a questo anno",
                      ))}
                    </div>
                  </details>

                  <details open className="rounded-xl border border-teal-200 bg-teal-50/40 p-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-teal-900">
                      <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Campagne di prenotazione concluse</span>
                      <Badge variant="secondary" className="bg-white text-teal-800">{bookingCampaignFilters.length}</Badge>
                    </summary>
                    <p className="mb-3 mt-1 text-xs text-teal-800/75">
                      Includono le prenotazioni non annullate delle campagne con data di fine passata.
                    </p>
                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {bookingCampaignFilters.length > 0
                        ? bookingCampaignFilters.map((campaign) => renderAudienceFilter(
                            campaign.value,
                            campaign.label,
                            `Conclusa il ${formatCampaignDate(campaign.endDate)}`,
                            campaign.recipientsCount,
                          ))
                        : <p className="rounded-lg border border-dashed border-teal-200 bg-white/70 p-3 text-xs text-stone-500">
                            Non ci sono campagne di prenotazione concluse.
                          </p>}
                    </div>
                  </details>

                  <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-900">
                    L’elenco mostra un solo contatto per indirizzo email, anche se compare in più gruppi.
                    {duplicatesRemoved > 0 && (
                      <span className="ml-1 font-semibold">
                        {duplicatesRemoved} {duplicatesRemoved === 1 ? "duplicato eliminato" : "duplicati eliminati"}.
                      </span>
                    )}
                  </div>

                  {unlinkedBookingContacts > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" data-testid="warning-unlinked-booking-contacts">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        {unlinkedBookingContacts} {unlinkedBookingContacts === 1 ? "prenotazione usa" : "prenotazioni usano"} i dati dello snapshot, perché non è stata trovata una scheda cliente collegata.
                      </span>
                    </div>
                  )}

                  {/* Ricerca Destinatari */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Cerca per nome o email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-10 rounded-lg bg-white pl-10"
                      data-testid="input-search-recipients"
                    />
                  </div>

                  {recipientsError instanceof Error ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert" data-testid="error-loading-recipients">
                      {recipientsError.message || "Errore nel caricamento dei destinatari."}
                    </div>
                  ) : selectedFilters.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center">
                      <Users className="mx-auto mb-2 h-6 w-6 text-stone-400" />
                      <p className="text-sm font-medium text-stone-700">Seleziona almeno un gruppo</p>
                      <p className="mt-1 text-xs text-stone-500">I destinatari appariranno qui, senza duplicati.</p>
                    </div>
                  ) : recipientsLoading ? (
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
                        <Label htmlFor="select-all" className="cursor-pointer text-sm font-semibold">
                          Seleziona tutti i visibili ({filteredRecipients.length})
                        </Label>
                        {searchQuery && (
                          <Badge variant="outline" className="ml-auto">
                            {filteredRecipients.length} di {recipients.length}
                          </Badge>
                        )}
                      </div>

                      <ScrollArea className="h-72 pr-3">
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
                                  checked={selectedRecipients.has(emailSelectionKey(recipient.email))}
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
                    onClick={() => {
                      setConsentConfirmed(false);
                      setShowConfirmDialog(true);
                    }}
                    disabled={
                      sendMutation.isPending ||
                      selectedRecipients.size === 0 ||
                      !subject.trim() ||
                      !body.trim() ||
                      !senderEmail.trim() ||
                      studioSettingsLoading ||
                      !hasStudioContact ||
                      !resendStatus?.connected ||
                      verifiedSendingDomains.length === 0
                    }
                    data-testid="button-send-bulk-email"
                  >
                    {sendMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Preparazione in corso...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Crea campagna per {selectedRecipients.size}
                      </>
                    )}
                  </Button>
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
                        {activeJob.status === 'in_progress'
                          ? (activeJob.provider === 'resend' ? 'Preparazione campagna…' : 'Invio in corso...')
                          : activeJob.status === 'completed'
                            ? (activeJob.provider === 'resend' ? 'Campagna affidata a Resend' : 'Invio completato!')
                            : 'Invio fallito'}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {activeJob.provider === 'resend' && activeJob.progressStage && activeJob.status === 'in_progress' && (
                      <p className="text-sm text-muted-foreground">{activeJob.progressStage}</p>
                    )}
                    {/* Barra progresso grande */}
                    <div>
                      <div className="flex justify-between items-end mb-2">
                        <div className="text-3xl font-bold text-blue-700">
                          {Math.round((((activeJob.provider === 'resend' && activeJob.status === 'in_progress')
                            ? (activeJob.preparedCount || 0)
                            : activeJob.sentCount) / activeJob.totalRecipients) * 100)}%
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold">
                            {(activeJob.provider === 'resend' && activeJob.status === 'in_progress')
                              ? (activeJob.preparedCount || 0)
                              : activeJob.sentCount} / {activeJob.totalRecipients}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {activeJob.provider === 'resend' && activeJob.status === 'in_progress' ? 'contatti preparati' : 'destinatari'}
                          </div>
                        </div>
                      </div>
                      <Progress 
                        value={(((activeJob.provider === 'resend' && activeJob.status === 'in_progress')
                          ? (activeJob.preparedCount || 0)
                          : activeJob.sentCount) / activeJob.totalRecipients) * 100}
                        className="h-4"
                      />
                    </div>

                    {/* Stats cards */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-green-100 rounded-lg p-3 text-center">
                        <CheckCircle className="h-5 w-5 text-green-600 mx-auto mb-1" />
                        <div className="text-2xl font-bold text-green-700">{activeJob.sentCount}</div>
                        <div className="text-xs text-green-600">
                          {activeJob.provider === 'resend' ? 'Affidate a Resend' : 'Inviate con successo'}
                        </div>
                      </div>
                      <div className="bg-red-100 rounded-lg p-3 text-center">
                        <XCircle className="h-5 w-5 text-red-600 mx-auto mb-1" />
                        <div className="text-2xl font-bold text-red-700">
                          {activeJob.provider === 'resend' ? (activeJob.excludedCount || 0) : activeJob.failedCount}
                        </div>
                        <div className="text-xs text-red-600">
                          {activeJob.provider === 'resend' ? 'Esclusi (disiscritti)' : 'Non inviate'}
                        </div>
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
                          {activeJob.provider === 'resend'
                            ? `Resend ha preso in carico ${activeJob.sentCount} destinatari`
                            : `Tasso di successo: ${Math.round((activeJob.sentCount / activeJob.totalRecipients) * 100)}%`}
                        </div>
                        {activeJob.provider === 'resend' && (
                          <div className="text-sm mt-1">
                            La presa in carico non equivale alla consegna finale. Consulta lo stato della campagna su Resend.
                          </div>
                        )}
                        {activeJob.provider !== 'resend' && activeJob.failedCount > 0 && (
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
                        {activeJob.provider === 'resend' && activeJob.status === 'failed' && (
                          <Button
                            className="w-full bg-amber-600 hover:bg-amber-700"
                            onClick={() => resumeResendJob(activeJob)}
                            disabled={retryFailedMutation.isPending}
                          >
                            {retryFailedMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Riprendi lista originale ({activeJob.totalRecipients})
                          </Button>
                        )}
                        {activeJob.provider !== 'resend' && activeJob.failedCount > 0 && (
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
                           job.status === 'completed'
                             ? (job.provider === 'resend' ? '✅ Affidata a Resend' : '✅ Completato') :
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
                        {job.provider === 'resend' && job.status === 'failed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-amber-600 border-amber-300 hover:bg-amber-50"
                            onClick={() => resumeResendJob(job)}
                            disabled={retryFailedMutation.isPending}
                          >
                            Riprendi lista originale ({job.totalRecipients})
                          </Button>
                        )}
                        {job.provider !== 'resend' && job.failedCount > 0 && job.status === 'completed' && (
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
              Conferma Campagna Resend
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>Stai per affidare a Resend Marketing una campagna per <strong>{selectedRecipients.size}</strong> destinatari.</p>
                <p><strong>Gruppi di provenienza:</strong> {activeAudienceLabels.join(", ")}</p>
                
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
                    <span className="text-muted-foreground">Mittente:</span>
                    <span className="font-medium">{senderEmail}</span>
                  </div>
                </div>

                <div className="text-sm text-amber-600 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Una volta avviata, la campagna non può essere annullata dall’app. I contatti già disiscritti saranno esclusi.</span>
                </div>

                <div className="flex items-start gap-2 rounded-md border p-3">
                  <Checkbox
                    id="confirm-marketing-consent"
                    checked={consentConfirmed}
                    onCheckedChange={(checked) => setConsentConfirmed(checked === true)}
                    data-testid="checkbox-marketing-consent"
                  />
                  <Label htmlFor="confirm-marketing-consent" className="cursor-pointer text-sm leading-5">
                    Confermo che i destinatari selezionati hanno dato il consenso alle comunicazioni promozionali.
                  </Label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmSend}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={!consentConfirmed || sendMutation.isPending}
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Affida a Resend
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
