import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DateInput } from '@/components/ui/date-input';
import { Switch } from '@/components/ui/switch';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Loader2,
  FileText,
  CheckCircle2,
  AlertCircle,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar as CalendarIcon,
  Package,
  Euro,
  ChevronDown,
  ChevronUp,
  Percent,
  Clipboard,
  ClipboardCheck,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { calculateQuoteTotals } from '@shared/quote-utils';
import type { QuoteProduct } from '@shared/quotes-types';
import placeholderUrl from '@assets/generated_images/Custom_product_placeholder_image_f076e89e.png';

interface QuickQuoteData {
  template: {
    id: string;
    nome: string;
    jobType: string;
    type: 'fisso' | 'variabile';
    theme: {
      primaryColor: string;
      secondaryColor: string;
      footerText?: string;
    };
    defaultProducts: QuoteProduct[];
    defaultClauses: Array<{ text: string; required: boolean }>;
    discountType?: 'amount' | 'percent';
    discountValue?: number;
  };
  jobTypeInfo: {
    id: string;
    nome: string;
    slug: string;
    imageUrl?: string | null;
  } | null;
  studioInfo: {
    studioName: string;
    email: string;
    phone: string;
    logo?: string;
  } | null;
}

const quickQuoteSchema = z.object({
  nome: z.string().min(2, 'Nome obbligatorio'),
  cognome: z.string().min(2, 'Cognome obbligatorio'),
  email: z.string().email('Email non valida'),
  cellulare: z.string().optional(),
  nomeEvento: z.string().min(2, 'Nome evento obbligatorio'),
  dataNonDefinita: z.boolean().default(false),
  eventDate: z.date().optional(),
  eventLocation: z.string().optional(),
  rituLocation: z.string().optional(),
  rituTime: z.string().optional(),
  noteCliente: z.string().optional(),
}).refine((data) => {
  if (data.dataNonDefinita) return true;
  return !!data.eventDate;
}, {
  message: 'Data evento obbligatoria (o seleziona "Data non definita")',
  path: ['eventDate']
});

type QuickQuoteFormData = z.infer<typeof quickQuoteSchema>;

export default function QuickQuotePage() {
  const params = useParams();
  const { toast } = useToast();
  const token = params.token;

  const [step, setStep] = useState<'form' | 'otp' | 'preview' | 'success'>('form');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [acceptedClauses, setAcceptedClauses] = useState<string[]>([]);
  const [signerName, setSignerName] = useState('');
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<number>>(new Set());
  const [submitError, setSubmitError] = useState<string | null>(null);
  // ✅ IDs creati da save-draft (al passaggio alla preview) — usati da activate per non duplicare
  const [draftJobId, setDraftJobId] = useState<string | null>(null);
  const [draftClienteId, setDraftClienteId] = useState<string | null>(null);
  // OTP
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  // true se lo step OTP è stato ripristinato da sessionStorage (pagina ricaricata)
  const [otpRestoredFromSession, setOtpRestoredFromSession] = useState(false);
  // feedback pulsante incolla
  const [pasteFeedback, setPasteFeedback] = useState(false);

  const SESSION_KEY = `qqs_draft_${token}`;

  const { data, isLoading, error } = useQuery<{ success: boolean; data: QuickQuoteData }>({
    queryKey: ['/api/quotes/quick', token],
    queryFn: async () => {
      const response = await fetch(`/api/quotes/quick/${token}`);
      if (!response.ok) throw new Error('Template non trovato');
      return response.json();
    },
    enabled: !!token,
  });

  const templateData = data?.data;
  const template = templateData?.template;
  const jobTypeInfo = templateData?.jobTypeInfo;
  const studioInfo = templateData?.studioInfo;

  const form = useForm<QuickQuoteFormData>({
    resolver: zodResolver(quickQuoteSchema),
    defaultValues: {
      nome: '',
      cognome: '',
      email: '',
      cellulare: '',
      nomeEvento: '',
      dataNonDefinita: false,
      eventLocation: '',
      rituLocation: '',
      rituTime: '',
      noteCliente: '',
    },
  });

  const dataNonDefinita = form.watch('dataNonDefinita');

  useEffect(() => {
    if (template?.type === 'fisso') {
      setSelectedProducts(template.defaultProducts.map(p => p.productId || p.nome));
    }
  }, [template]);

  // Countdown resend OTP
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const sendOtp = async (email: string, nome: string) => {
    setOtpSending(true);
    setOtpError(null);
    setOtpRestoredFromSession(false); // nuovo invio reale → reset messaggio ripristino
    try {
      const res = await fetch(`/api/quotes/quick/${token}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, nome }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Impossibile inviare il codice');
      setResendCooldown(60); // 60s prima di poter rinviare
    } catch (err: unknown) {
      setOtpError(err instanceof Error ? err.message : 'Errore invio codice');
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = async () => {
    const email = form.getValues('email');
    if (!otpCode || otpCode.length !== 6) {
      setOtpError('Inserisci il codice a 6 cifre ricevuto via email.');
      return;
    }
    setOtpVerifying(true);
    setOtpError(null);
    try {
      const res = await fetch(`/api/quotes/quick/${token}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Codice non valido');
      // ✅ OTP verificato — salva bozza (sincrono) poi vai alla preview
      const formData = form.getValues();
      setSavingDraft(true);
      try {
        const r = await fetch(`/api/quotes/quick/${token}/save-draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            eventDate: formData.eventDate?.toISOString(),
            existingJobId: draftJobId || undefined,
          }),
        });
        if (r.ok) {
          const result = await r.json();
          const newJobId = result.jobId || draftJobId;
          const newClienteId = result.clienteId || draftClienteId;
          if (result.jobId) setDraftJobId(result.jobId);
          if (result.clienteId) setDraftClienteId(result.clienteId);
          // Salva step + draftIds in sessionStorage per sopravvivere al reload
          try {
            const existing = sessionStorage.getItem(SESSION_KEY);
            const base = existing ? JSON.parse(existing) : {};
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
              ...base,
              step: 'preview',
              draftJobId: newJobId,
              draftClienteId: newClienteId,
            }));
          } catch { /* ignora */ }
        }
      } catch { /* silenzioso — non bloccare la preview */ }
      finally { setSavingDraft(false); }
      setStep('preview');
    } catch (err: unknown) {
      setOtpError(err instanceof Error ? err.message : 'Codice non valido');
    } finally {
      setOtpVerifying(false);
    }
  };

  // Ripristina dati + step da sessionStorage se disponibili (es. dopo reload su mobile)
  useEffect(() => {
    if (!template) return;
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.formData) {
          form.reset({
            ...draft.formData,
            eventDate: draft.formData.eventDate ? new Date(draft.formData.eventDate) : undefined,
          });
        }
        if (draft.selectedProducts) setSelectedProducts(draft.selectedProducts);
        if (draft.acceptedClauses) setAcceptedClauses(draft.acceptedClauses);
        if (draft.signerName) setSignerName(draft.signerName);
        if (draft.draftJobId) setDraftJobId(draft.draftJobId);
        if (draft.draftClienteId) setDraftClienteId(draft.draftClienteId);
        // Ripristina lo step senza reinviare automaticamente l'OTP
        if (draft.step === 'otp') {
          setStep('otp');
          setOtpRestoredFromSession(true); // segnala che NON abbiamo inviato un nuovo codice
        } else if (draft.step === 'preview' && draft.draftJobId) {
          setStep('preview');
        }
      }
    } catch {
      // sessionStorage non disponibile o dati corrotti — ignora
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  useEffect(() => {
    if (template?.theme) {
      document.documentElement.style.setProperty('--theme-primary', template.theme.primaryColor || '#8B9A8B');
      document.documentElement.style.setProperty('--theme-secondary', template.theme.secondaryColor || '#C8D4C8');
    }
    return () => {
      document.documentElement.style.removeProperty('--theme-primary');
      document.documentElement.style.removeProperty('--theme-secondary');
    };
  }, [template?.theme]);

  const totals = useMemo(() => {
    if (!template) return { totalBeforeDiscount: 0, discountAmount: 0, totalAfterDiscount: 0 };

    let subtotale: number;
    if (template.type === 'variabile') {
      subtotale = template.defaultProducts
        .filter(p => selectedProducts.includes(p.productId || p.nome))
        .reduce((sum, p) => sum + p.prezzo, 0);
    } else {
      subtotale = template.defaultProducts.reduce((sum, p) => sum + p.prezzo, 0);
    }

    return calculateQuoteTotals(subtotale, template.discountType, template.discountValue);
  }, [template, selectedProducts]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);

  const primaryColor = template?.theme?.primaryColor ?? '#8B9A8B';
  const secondaryColor = template?.theme?.secondaryColor ?? '#C8D4C8';

  const activateMutation = useMutation({
    mutationFn: async (formData: QuickQuoteFormData) => {
      const response = await fetch(`/api/quotes/quick/${token}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          eventDate: formData.eventDate?.toISOString(),
          selectedProducts: template?.type === 'variabile' ? selectedProducts : undefined,
          signerName: signerName.trim() || undefined,
          clausesAccepted: acceptedClauses.length > 0
            ? template?.defaultClauses
                .filter((_, i) => acceptedClauses.includes(String(i)))
                .map(c => c.text)
            : undefined,
          // ✅ Passa gli ID già creati da save-draft (evita duplicati)
          existingJobId: draftJobId || undefined,
          existingClienteId: draftClienteId || undefined,
        }),
      });
      if (!response.ok) {
        let errMsg = 'Errore del server. I tuoi dati sono stati salvati — riprova tra qualche secondo.';
        try {
          const err = await response.json();
          if (err.message) errMsg = err.message;
        } catch { /* non JSON */ }
        throw new Error(errMsg);
      }
      return response.json();
    },
    onSuccess: (result) => {
      // Pulizia draft ora che è andato a buon fine
      try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignora */ }
      setSubmitError(null);
      setStep('success');
      toast({
        title: 'Preventivo inviato!',
        description: result.data?.status === 'firmato'
          ? 'Il preventivo è stato firmato con successo.'
          : 'Il preventivo è stato inviato. Riceverai conferma via email.',
      });
    },
    onError: (error: Error) => {
      setSubmitError(error.message);
    },
  });

  const handleFormSubmit = (formData: QuickQuoteFormData) => {
    // Salva dati + step in sessionStorage — così il reload non perde il contesto
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        step: 'otp',
        formData: { ...formData, eventDate: formData.eventDate?.toISOString() },
        selectedProducts,
        acceptedClauses,
        signerName,
      }));
    } catch { /* sessionStorage non disponibile — continua comunque */ }
    setSubmitError(null);
    setOtpCode('');
    setOtpError(null);
    // ✅ Invia OTP all'email fornita e vai allo step di verifica
    setStep('otp');
    sendOtp(formData.email, formData.nome);
  };

  const handleConfirm = () => {
    const formData = form.getValues();
    setSubmitError(null);
    activateMutation.mutate(formData);
  };

  const toggleDescription = (idx: number) => {
    setExpandedDescriptions(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const requiredClauses = template?.defaultClauses?.filter(c => c.required) || [];
  const allRequiredAccepted = requiredClauses.every((_, i) => {
    const clauseIndex = template?.defaultClauses?.findIndex(c => c === requiredClauses[i]);
    return acceptedClauses.includes(String(clauseIndex));
  });
  const canSign = signerName.trim().length > 0 && allRequiredAccepted;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
              <p className="text-gray-600">Caricamento preventivo...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data?.success || !template) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
        <Card className="w-full max-w-md border-red-200">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <FileText className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Preventivo non disponibile</h2>
                <p className="text-gray-600">Il link non è valido o il template non è più attivo.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(135deg, ${secondaryColor}20, ${primaryColor}20)` }}>
        <Card className="w-full max-w-md" style={{ borderColor: `${primaryColor}40` }}>
          <CardContent className="pt-8 pb-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: `${primaryColor}20` }}>
                <CheckCircle2 className="w-10 h-10" style={{ color: primaryColor }} />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">Preventivo Inviato!</h2>
                <p className="text-gray-600">
                  {activateMutation.data?.data?.status === 'firmato'
                    ? 'Il preventivo è stato firmato con successo. Riceverai una conferma via email.'
                    : 'Il tuo preventivo è stato creato. Riceverai una conferma via email con il link per visionarlo e firmarlo.'}
                </p>
              </div>
              {studioInfo && (
                <div className="mt-4 p-4 rounded-lg text-sm text-gray-600" style={{ backgroundColor: `${secondaryColor}20` }}>
                  <p className="font-medium">{studioInfo.studioName}</p>
                  {studioInfo.email && <p>{studioInfo.email}</p>}
                  {studioInfo.phone && <p>{studioInfo.phone}</p>}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4" style={{ background: `linear-gradient(135deg, ${secondaryColor}15, ${primaryColor}10)` }}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          {studioInfo?.logo && (
            <img
              src={studioInfo.logo}
              alt={studioInfo.studioName}
              className="h-16 mx-auto object-contain"
            />
          )}
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            {template.nome}
          </h1>
          {jobTypeInfo && (
            <Badge variant="outline" className="text-sm" style={{ borderColor: primaryColor, color: primaryColor }}>
              {jobTypeInfo.nome}
            </Badge>
          )}
          {studioInfo && (
            <p className="text-sm text-gray-500">{studioInfo.studioName}</p>
          )}
        </div>

        {step === 'form' && (
          <>
            {/* Form dati cliente */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <User className="w-5 h-5" style={{ color: primaryColor }} />
                  I Tuoi Dati
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="nome"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome *</FormLabel>
                            <FormControl>
                              <Input placeholder="Il tuo nome" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="cognome"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cognome *</FormLabel>
                            <FormControl>
                              <Input placeholder="Il tuo cognome" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email *</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="email@esempio.it" {...field} />
                            </FormControl>
                            <FormDescription className="flex items-center gap-1 text-xs">
                              <Mail className="w-3 h-3 flex-shrink-0" />
                              Ti invieremo un codice di verifica su questa email
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="cellulare"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cellulare</FormLabel>
                            <FormControl>
                              <Input type="tel" placeholder="+39 333 1234567" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <h3 className="font-medium flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4" style={{ color: primaryColor }} />
                        Dettagli Evento
                      </h3>

                      <FormField
                        control={form.control}
                        name="nomeEvento"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome Evento *</FormLabel>
                            <FormControl>
                              <Input placeholder="es. Matrimonio Sara e Luca" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="dataNonDefinita"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between p-3 border rounded-lg bg-amber-50 border-amber-200">
                            <div>
                              <FormLabel>Data non ancora definita</FormLabel>
                              <FormDescription className="text-xs">
                                La data sarà definita in seguito
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={(checked) => {
                                  field.onChange(checked);
                                  if (checked) {
                                    form.setValue('eventDate', undefined);
                                  }
                                }}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      {!dataNonDefinita && (
                        <FormField
                          control={form.control}
                          name="eventDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Data Evento *</FormLabel>
                              <FormControl>
                                <DateInput
                                  value={field.value}
                                  onChange={field.onChange}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      <FormField
                        control={form.control}
                        name="eventLocation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Location Evento</FormLabel>
                            <FormControl>
                              <Input placeholder="es. Casale dei Baroni" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="rituLocation"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Luogo Rito/Celebrazione</FormLabel>
                              <FormControl>
                                <Input placeholder="es. Chiesa San Giuseppe" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="rituTime"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Orario Rito</FormLabel>
                              <FormControl>
                                <Input type="time" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="noteCliente"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Note o richieste particolari</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Scrivi qui eventuali richieste o dettagli importanti..."
                                className="resize-none"
                                rows={3}
                                {...field}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full text-white"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Vedi Preventivo
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </>
        )}

        {/* ── Step OTP ──────────────────────────────────────────────── */}
        {step === 'otp' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="w-5 h-5" style={{ color: primaryColor }} />
                Verifica la tua email
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {otpSending ? (
                <div className="flex flex-col items-center gap-3 py-6 text-gray-500">
                  <Loader2 className="w-7 h-7 animate-spin" style={{ color: primaryColor }} />
                  <p className="text-sm">Invio codice in corso…</p>
                </div>
              ) : (
                <>
                  <div className="text-center space-y-1">
                    {otpRestoredFromSession ? (
                      <>
                        <p className="text-sm text-gray-700">
                          La pagina si è ricaricata, ma il tuo codice è ancora valido. Inserisci quello che hai ricevuto via email:
                        </p>
                        <p className="font-semibold text-gray-900 break-all">{form.getValues('email')}</p>
                        <p className="text-xs text-gray-500 mt-1">Il codice scade dopo 10 minuti. Se è scaduto usa "Rinvia codice".</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-gray-700">
                          Abbiamo inviato un codice a 6 cifre a:
                        </p>
                        <p className="font-semibold text-gray-900 break-all">{form.getValues('email')}</p>
                        <p className="text-xs text-gray-500 mt-1">Controlla anche la cartella spam se non lo trovi.</p>
                      </>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="otp-input">Codice di verifica</Label>
                    <div className="flex gap-2">
                      <Input
                        id="otp-input"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        placeholder="_ _ _ _ _ _"
                        value={otpCode}
                        onChange={e => {
                          setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                          setOtpError(null);
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') verifyOtp(); }}
                        className="text-center text-2xl tracking-[0.4em] font-mono h-14 flex-1"
                        autoFocus
                      />
                      <button
                        type="button"
                        title="Incolla dagli appunti"
                        className={`flex-shrink-0 h-14 w-14 rounded-md border flex flex-col items-center justify-center gap-1 text-xs transition-colors ${
                          pasteFeedback
                            ? 'bg-green-50 border-green-400 text-green-600'
                            : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700'
                        }`}
                        onClick={async () => {
                          try {
                            const text = await navigator.clipboard.readText();
                            const digits = text.replace(/\D/g, '').slice(0, 6);
                            if (digits) {
                              setOtpCode(digits);
                              setOtpError(null);
                              setPasteFeedback(true);
                              setTimeout(() => setPasteFeedback(false), 1500);
                            }
                          } catch {
                            // Fallback: focus input so the user can paste manualmente
                            document.getElementById('otp-input')?.focus();
                          }
                        }}
                      >
                        {pasteFeedback
                          ? <ClipboardCheck className="w-5 h-5" />
                          : <Clipboard className="w-5 h-5" />
                        }
                        <span className="leading-none">{pasteFeedback ? 'Ok!' : 'Incolla'}</span>
                      </button>
                    </div>
                  </div>

                  {otpError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{otpError}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={verifyOtp}
                      disabled={otpVerifying || savingDraft || otpCode.length !== 6}
                      className="w-full text-white"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {savingDraft ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparazione anteprima…</>
                      ) : otpVerifying ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifica in corso…</>
                      ) : (
                        <><CheckCircle2 className="w-4 h-4 mr-2" /> Conferma codice</>
                      )}
                    </Button>

                    <div className="flex items-center justify-between text-sm">
                      <button
                        type="button"
                        className="text-gray-500 underline text-xs"
                        onClick={() => { setStep('form'); setOtpError(null); }}
                      >
                        ← Modifica email
                      </button>
                      <button
                        type="button"
                        className={`text-xs ${resendCooldown > 0 ? 'text-gray-400 cursor-not-allowed' : 'underline'}`}
                        style={resendCooldown === 0 ? { color: primaryColor } : {}}
                        disabled={resendCooldown > 0 || otpSending}
                        onClick={() => {
                          const email = form.getValues('email');
                          const nome = form.getValues('nome');
                          setOtpCode('');
                          setOtpError(null);
                          sendOtp(email, nome);
                        }}
                      >
                        {resendCooldown > 0 ? `Rinvia tra ${resendCooldown}s` : 'Rinvia codice'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {step === 'preview' && (
          <>
            {/* Banner: link portale inviato via email */}
            <div className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(107,127,107,0.12)', border: '1px solid rgba(107,127,107,0.3)' }}>
              <Mail className="w-5 h-5 mt-0.5 shrink-0" style={{ color: primaryColor }} />
              <div>
                <p className="font-semibold" style={{ color: primaryColor }}>
                  Abbiamo inviato il link del tuo preventivo a <span className="underline underline-offset-2">{form.getValues('email')}</span>
                </p>
                <p className="mt-0.5 text-gray-600">
                  Il link rimarrà sempre attivo: potrai aprirlo quando vuoi, esplorare i servizi e firmare quando sei pronto/a.
                </p>
              </div>
            </div>

            {/* Riepilogo dati */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="w-5 h-5" style={{ color: primaryColor }} />
                    Riepilogo
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStep('form')}
                  >
                    Modifica
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Nome:</span>
                    <p className="font-medium">{form.getValues('nome')} {form.getValues('cognome')}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Email:</span>
                    <p className="font-medium break-all">{form.getValues('email')}</p>
                  </div>
                  {form.getValues('cellulare') && (
                    <div>
                      <span className="text-gray-500">Cellulare:</span>
                      <p className="font-medium">{form.getValues('cellulare')}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500">Evento:</span>
                    <p className="font-medium">{form.getValues('nomeEvento')}</p>
                  </div>
                  {form.getValues('eventDate') && (
                    <div>
                      <span className="text-gray-500">Data:</span>
                      <p className="font-medium">
                        {form.getValues('eventDate')!.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                  {form.getValues('dataNonDefinita') && (
                    <div>
                      <span className="text-gray-500">Data:</span>
                      <p className="font-medium text-amber-600">Da definire</p>
                    </div>
                  )}
                  {form.getValues('eventLocation') && (
                    <div>
                      <span className="text-gray-500">Location:</span>
                      <p className="font-medium">{form.getValues('eventLocation')}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Prodotti */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="w-5 h-5" style={{ color: primaryColor }} />
                  {template.type === 'variabile' ? 'Seleziona i Servizi' : 'Servizi Inclusi'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {template.defaultProducts.map((product, idx) => {
                  const isSelected = selectedProducts.includes(product.productId || product.nome);
                  const isExpanded = expandedDescriptions.has(idx);

                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border transition-all ${
                        template.type === 'variabile'
                          ? isSelected
                            ? 'border-2 bg-white shadow-sm'
                            : 'border bg-gray-50 opacity-70'
                          : 'border bg-white'
                      }`}
                      style={isSelected && template.type === 'variabile' ? { borderColor: primaryColor } : {}}
                    >
                      <div className="flex items-start gap-3">
                        {template.type === 'variabile' && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              const key = product.productId || product.nome;
                              if (checked) {
                                setSelectedProducts([...selectedProducts, key]);
                              } else {
                                setSelectedProducts(selectedProducts.filter(p => p !== key));
                              }
                            }}
                            className="mt-1 flex-shrink-0"
                          />
                        )}
                        
                        {product.immagini?.[0] && (
                          <img
                            src={product.immagini[0]}
                            alt={product.nome}
                            className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = placeholderUrl;
                            }}
                          />
                        )}

                        <div className="flex-1 min-w-0">
                          {/* Nome + Prezzo: impilati su mobile piccolo, affiancati su schermi più grandi */}
                          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5">
                            <h4 className="font-medium text-gray-900 leading-snug">{product.nome}</h4>
                            <span className="font-bold text-base flex-shrink-0" style={{ color: primaryColor }}>
                              {formatCurrency(product.prezzo)}
                            </span>
                          </div>

                          {product.categoria && (
                            <Badge variant="outline" className="text-xs mt-1">
                              {product.categoria.replace(/_/g, ' ')}
                            </Badge>
                          )}

                          {product.descrizione && (
                            <div className="mt-1">
                              <p className={`text-sm text-gray-600 ${!isExpanded ? 'line-clamp-2' : ''}`}>
                                {product.descrizione}
                              </p>
                              {product.descrizione.length > 100 && (
                                <button
                                  className="text-xs mt-1 flex items-center gap-1"
                                  style={{ color: primaryColor }}
                                  onClick={() => toggleDescription(idx)}
                                >
                                  {isExpanded ? (
                                    <><ChevronUp className="w-3 h-3" /> Meno</>
                                  ) : (
                                    <><ChevronDown className="w-3 h-3" /> Altro</>
                                  )}
                                </button>
                              )}
                            </div>
                          )}

                          {/* ✅ Fix: usa > 0 per evitare che "0" venga renderizzato come testo */}
                          {(product.numeroFoto ?? 0) > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                              {product.numeroFoto} foto incluse
                            </p>
                          )}

                          {product.isBundle && product.bundleItems && product.bundleItems.length > 0 && (
                            <div className="mt-2 p-2 bg-gray-50 rounded text-xs space-y-1">
                              <p className="font-medium text-gray-700">Include:</p>
                              {product.bundleItems.map((item, bIdx) => (
                                <div key={bIdx} className="flex justify-between text-gray-600">
                                  <span>{item.prodottoNome} (x{item.quantita})</span>
                                  {item.numeroFoto && <span>{item.numeroFoto} foto</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Totali */}
            <Card>
              <CardContent className="pt-6 space-y-3">
                {totals.discountAmount > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Subtotale</span>
                      <span>{formatCurrency(totals.totalBeforeDiscount)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-green-600">
                      <span className="flex items-center gap-1">
                        <Percent className="w-3 h-3" />
                        Sconto
                        {template.discountType === 'percent' ? ` (${template.discountValue}%)` : ''}
                      </span>
                      <span>-{formatCurrency(totals.discountAmount)}</span>
                    </div>
                    <Separator />
                  </>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-lg font-medium">Totale</span>
                  <span className="text-2xl font-bold" style={{ color: primaryColor }}>
                    {formatCurrency(totals.totalAfterDiscount)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Clausole */}
            {template.defaultClauses && template.defaultClauses.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Termini e Condizioni</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {template.defaultClauses.map((clause, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <Checkbox
                        checked={acceptedClauses.includes(String(idx))}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setAcceptedClauses([...acceptedClauses, String(idx)]);
                          } else {
                            setAcceptedClauses(acceptedClauses.filter(c => c !== String(idx)));
                          }
                        }}
                      />
                      <div className="text-sm">
                        <span dangerouslySetInnerHTML={{ __html: clause.text }} />
                        {clause.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Firma */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Firma Digitale</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="signer-name">Nome e Cognome per la firma</Label>
                  <Input
                    id="signer-name"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Scrivi il tuo nome completo"
                    className="mt-1"
                  />
                </div>
                {signerName.trim() && (
                  <div className="p-4 border-2 border-dashed rounded-lg text-center" style={{ borderColor: `${primaryColor}60` }}>
                    <p
                      className="text-2xl italic"
                      style={{ fontFamily: "'Dancing Script', 'Brush Script MT', cursive", color: primaryColor }}
                    >
                      {signerName}
                    </p>
                  </div>
                )}

                {!allRequiredAccepted && requiredClauses.length > 0 && (
                  <Alert variant="destructive" className="bg-amber-50 border-amber-200">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-700">
                      Devi accettare tutte le clausole obbligatorie (*) prima di firmare.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Errore invio — visibile e con pulsante Riprova */}
            {submitError && (
              <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-red-800 mb-1">Invio non riuscito</p>
                    <p className="text-sm text-red-700 mb-3">
                      {submitError} I tuoi dati sono al sicuro — puoi riprovare senza reinserire nulla.
                    </p>
                    <Button
                      size="sm"
                      className="text-white bg-red-600 hover:bg-red-700"
                      onClick={handleConfirm}
                      disabled={activateMutation.isPending}
                    >
                      {activateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Riprova invio
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep('form')}
                disabled={activateMutation.isPending}
              >
                Indietro
              </Button>
              <Button
                className="flex-1 text-white"
                style={{ backgroundColor: primaryColor }}
                onClick={handleConfirm}
                disabled={activateMutation.isPending || (!canSign && template.defaultClauses.length > 0)}
              >
                {activateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {canSign ? 'Conferma e Firma' : 'Invia Preventivo'}
              </Button>
            </div>

            {/* Footer */}
            {template.theme?.footerText && (
              <div className="text-center text-xs text-gray-400 pb-4">
                {template.theme.footerText}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
