/**
 * GENERA PAGAMENTI MODAL
 * Modal per generare piano pagamenti da quote firmato
 * Dual-mode: Automatico (presets) + Manuale (custom rate)
 */

import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getPaymentSchedulesForJob } from '@/lib/payment-schedules';
import type { PaymentSchedule } from '@shared/payment-schedule-types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DateInput } from '@/components/ui/date-input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Plus, Trash2, Loader2, AlertCircle, CalendarDays } from 'lucide-react';
import { addDays } from 'date-fns';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const paymentSchema = z.object({
  importo: z.number().min(0.01, 'Importo obbligatorio'),
  dataScadenza: z.date(),
  descrizione: z.string().optional(),
});

const formSchema = z.object({
  payments: z.array(paymentSchema).min(1, 'Almeno una rata richiesta'),
  dataRiferimento: z.date().optional(), // Data firma/riferimento per lavori storici
});

type FormData = z.infer<typeof formSchema>;

interface GeneraPagamentiModalProps {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  quoteTotale: number;
  jobId: string;
  clienteId: string;
  eventDate?: Date | null;
}

export default function GeneraPagamentiModal({
  open,
  onClose,
  quoteId,
  quoteTotale,
  jobId,
  clienteId,
  eventDate,
}: GeneraPagamentiModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'automatico' | 'manuale'>('automatico');
  const [selectedPreset, setSelectedPreset] = useState<'acconto-saldo' | '2-rate' | '3-rate' | '4-rate-evento'>('4-rate-evento');
  const [dateModes, setDateModes] = useState<Array<'absolute' | 'relative'>>([]);
  const [relativeDaysArray, setRelativeDaysArray] = useState<number[]>([]);
  const [quoteSignatureDate, setQuoteSignatureDate] = useState<Date | undefined>();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accontoIniziale, setAccontoIniziale] = useState<number>(0);
  const [ratePerc, setRatePerc] = useState({ rata2Perc: 50, rata3Perc: 25 });
  const [rateDays, setRateDays] = useState({ rata2Days: -10, rata3Days: 90, saldoDays: 130 });
  // Testo grezzo dei campi percentuale/giorni: consente di svuotare il campo e
  // digitare liberamente; il clamp avviene solo su blur (fix "si inceppa nel calcolo")
  const [percInput, setPercInput] = useState({ rata2: '50', rata3: '25' });
  const [daysInput, setDaysInput] = useState({ rata2: '-10', rata3: '90', saldo: '130' });

  // Refs per passare i flag alla mutation senza dipendere da state (evita React batching e reset prematuro)
  const bypassRef = useRef(false);
  const replaceRef = useRef(false);

  // Fetch existing payment schedules for this job
  const { data: existingSchedules = [] } = useQuery<PaymentSchedule[]>({
    queryKey: ['payment-schedules-check', jobId],
    queryFn: () => getPaymentSchedulesForJob(jobId),
    enabled: open && !!jobId,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      payments: [
        {
          importo: quoteTotale,
          dataScadenza: addDays(new Date(), 7),
          descrizione: 'Pagamento totale',
        },
      ],
      dataRiferimento: undefined, // Auto-populated da firma preventivo
    },
  });

  const { fields, append, remove: originalRemove, replace } = useFieldArray({
    control: form.control,
    name: 'payments',
  });

  // Wrapper per remove che aggiorna anche dateModes/relativeDaysArray
  const remove = (index: number) => {
    originalRemove(index);
    setDateModes(prev => prev.filter((_, i) => i !== index));
    setRelativeDaysArray(prev => prev.filter((_, i) => i !== index));
  };

  // Reset state quando il modal viene chiuso
  useEffect(() => {
    if (!open) {
      setIsSubmitting(false);
      // Reset completo dei parametri del piano 4 rate (evita valori stantii alla riapertura)
      setAccontoIniziale(0);
      setRatePerc({ rata2Perc: 50, rata3Perc: 25 });
      setRateDays({ rata2Days: -10, rata3Days: 90, saldoDays: 130 });
      setPercInput({ rata2: '50', rata3: '25' });
      setDaysInput({ rata2: '-10', rata3: '90', saldo: '130' });
      bypassRef.current = false;
      replaceRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (open && eventDate && selectedPreset === '4-rate-evento') {
      const preview = compute4RatePreview(accontoIniziale);
      if (preview.length > 0) {
        replace(preview);
      }
    }
  }, [open]);

  // Fetch quote signature date on mount
  useEffect(() => {
    const fetchQuoteSignatureDate = async () => {
      try {
        const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
        if (quoteDoc.exists()) {
          const quoteData = quoteDoc.data();
          if (quoteData.signature?.signedAt) {
            const signedDate = quoteData.signature.signedAt.toDate();
            setQuoteSignatureDate(signedDate);
            // Auto-popola dataRiferimento con la data di firma
            form.setValue('dataRiferimento', signedDate);
          }
        }
      } catch (error) {
        console.error('Errore fetch quote signature:', error);
      }
    };

    if (open && quoteId) {
      fetchQuoteSignatureDate();
    }
  }, [open, quoteId, form]);

  // Sincronizza dateModes/relativeDaysArray quando si aggiungono nuove rate
  useEffect(() => {
    if (dateModes.length < fields.length) {
      setDateModes(prev => [...prev, ...new Array(fields.length - prev.length).fill('absolute')]);
      setRelativeDaysArray(prev => [...prev, ...new Array(fields.length - prev.length).fill(0)]);
    }
  }, [fields.length, dateModes.length]);

  // Reset dateModes/relativeDaysArray quando si passa al tab manuale
  // per evitare valori "sporchi" ereditati da preset precedenti
  useEffect(() => {
    if (activeTab === 'manuale') {
      setDateModes(new Array(fields.length).fill('absolute'));
      setRelativeDaysArray(new Array(fields.length).fill(0));
    }
  }, [activeTab, fields.length]);

  // Aggiorna data quando modalità relativa è attiva
  useEffect(() => {
    if (eventDate) {
      dateModes.forEach((mode, index) => {
        if (mode === 'relative') {
          const calculatedDate = addDays(new Date(eventDate), relativeDaysArray[index] || 0);
          form.setValue(`payments.${index}.dataScadenza`, calculatedDate);
        }
      });
    }
  }, [dateModes, relativeDaysArray, eventDate, form]);

  // Calcola totale rate
  const payments = form.watch('payments');
  const totaleRate = payments.reduce((sum, p) => sum + (p.importo || 0), 0);
  const differenza = totaleRate - quoteTotale;
  const isValid = Math.abs(differenza) < 0.01; // Tolleranza 1 centesimo

  const compute4RatePreview = (acconto: number, perc = ratePerc, days = rateDays) => {
    if (!eventDate) return [];
    const today = new Date();
    const evDate = new Date(eventDate);
    const accontoRound = Math.round(acconto);
    const targetRata2 = Math.round(quoteTotale * perc.rata2Perc / 100) - accontoRound;
    const rata2 = Math.max(0, targetRata2);
    const rata3 = Math.round(quoteTotale * perc.rata3Perc / 100);
    const saldo = quoteTotale - accontoRound - rata2 - rata3;

    const dataRata2 = addDays(evDate, days.rata2Days);
    const dataRata3 = addDays(evDate, days.rata3Days);
    const dataSaldo = addDays(evDate, days.saldoDays);

    const saldoPerc = 100 - perc.rata2Perc - perc.rata3Perc;

    return [
      { importo: accontoRound, dataScadenza: today, descrizione: 'Acconto alla firma' },
      { importo: rata2, dataScadenza: dataRata2 < today ? today : dataRata2, descrizione: `2ª rata (${perc.rata2Perc}% - acconto) pre-evento` },
      { importo: rata3, dataScadenza: dataRata3, descrizione: `3ª rata (${perc.rata3Perc}%) post-evento` },
      { importo: saldo, dataScadenza: dataSaldo, descrizione: `Saldo (${saldoPerc}%)` },
    ];
  };

  const applyPreset = (preset: '30-70' | '50-50' | '3-rate' | '4-rate-evento') => {
    const presetTypeMap: Record<string, 'acconto-saldo' | '2-rate' | '3-rate' | '4-rate-evento'> = {
      '30-70': 'acconto-saldo',
      '50-50': '2-rate',
      '3-rate': '3-rate',
      '4-rate-evento': '4-rate-evento',
    };
    setSelectedPreset(presetTypeMap[preset]);

    const today = new Date();
    let newPayments: { importo: number; dataScadenza: Date; descrizione: string }[] = [];

    switch (preset) {
      case '30-70':
        newPayments = [
          { importo: quoteTotale * 0.3, dataScadenza: addDays(today, 7), descrizione: 'Acconto 30%' },
          { importo: quoteTotale * 0.7, dataScadenza: addDays(today, 30), descrizione: 'Saldo 70%' },
        ];
        break;
      case '50-50':
        newPayments = [
          { importo: quoteTotale * 0.5, dataScadenza: addDays(today, 7), descrizione: 'Acconto 50%' },
          { importo: quoteTotale * 0.5, dataScadenza: addDays(today, 30), descrizione: 'Saldo 50%' },
        ];
        break;
      case '3-rate': {
        const rataImporto = quoteTotale / 3;
        newPayments = [
          { importo: rataImporto, dataScadenza: addDays(today, 7), descrizione: 'Prima rata (1/3)' },
          { importo: rataImporto, dataScadenza: addDays(today, 30), descrizione: 'Seconda rata (2/3)' },
          { importo: rataImporto, dataScadenza: addDays(today, 60), descrizione: 'Terza rata (3/3)' },
        ];
        break;
      }
      case '4-rate-evento':
        newPayments = compute4RatePreview(accontoIniziale);
        break;
    }

    if (newPayments.length > 0) {
      replace(newPayments);
    }
  };

  useEffect(() => {
    if (selectedPreset === '4-rate-evento' && eventDate) {
      const preview = compute4RatePreview(accontoIniziale, ratePerc, rateDays);
      if (preview.length > 0) {
        replace(preview);
      }
    }
  }, [accontoIniziale, eventDate, selectedPreset, ratePerc, rateDays]);

  // Mutation: crea payment schedule (automatic vs manual)
  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Usa ref invece di state per evitare reset prematuro
      if (replaceRef.current && existingSchedules.length > 0) {
        console.log(`🗑️ Eliminazione ${existingSchedules.length} payment schedule(s) esistenti...`);
        for (const schedule of existingSchedules) {
          await deleteDoc(doc(db, 'paymentSchedules', schedule.id));
        }
        console.log('✅ Vecchi payment schedules eliminati');
      }

      // Prepara body base (include dataRiferimento opzionale)
      const baseBody = {
        quoteId,
        jobId,
        clienteId,
        ...(data.dataRiferimento && { dataRiferimento: data.dataRiferimento.toISOString() }),
      };

      const body = activeTab === 'automatico'
        ? {
            ...baseBody,
            presetType: selectedPreset,
            ...(selectedPreset === '4-rate-evento' && {
              accontoIniziale: Math.round(accontoIniziale),
              eventDate: eventDate ? eventDate.toISOString() : undefined,
              rata2Perc: ratePerc.rata2Perc,
              rata3Perc: ratePerc.rata3Perc,
              rata2Days: rateDays.rata2Days,
              rata3Days: rateDays.rata3Days,
              saldoDays: rateDays.saldoDays,
            }),
          }
        : {
            ...baseBody,
            payments: data.payments,
            totale: quoteTotale,
          };

      const response = await apiRequest('POST', '/api/payment-schedules/generate', body);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Errore creazione piano pagamenti');
      }

      return response.json();
    },
    onSuccess: () => {
      setIsSubmitting(false);
      bypassRef.current = false;
      replaceRef.current = false;
      queryClient.invalidateQueries({ queryKey: ['payment-schedules', jobId] });
      queryClient.invalidateQueries({ queryKey: ['paymentSchedule', jobId] });
      queryClient.invalidateQueries({ queryKey: ['paymentSchedules', 'aggregated', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      toast({
        title: '✅ Piano pagamenti generato!',
        description: 'Lo scadenzario è stato creato con successo.',
      });
      onClose();
      form.reset();
    },
    onError: (error: Error) => {
      setIsSubmitting(false);
      bypassRef.current = false;  // Reset per richiedere conferma su retry
      // NON resettare replaceRef - mantiene l'intento per retry
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: FormData, options?: { bypass?: boolean; replace?: boolean }) => {
    if (isSubmitting) {
      return;
    }

    if (activeTab === 'automatico' && selectedPreset === '4-rate-evento') {
      if (!eventDate) {
        toast({
          title: 'Data evento mancante',
          description: 'Per generare il piano a 4 rate è necessaria la data dell\'evento.',
          variant: 'destructive',
        });
        return;
      }
      if (accontoIniziale < 0 || accontoIniziale >= quoteTotale) {
        toast({
          title: 'Acconto non valido',
          description: `L'acconto deve essere tra €0 e €${quoteTotale.toFixed(0)}`,
          variant: 'destructive',
        });
        return;
      }
      if (ratePerc.rata2Perc + ratePerc.rata3Perc >= 100) {
        toast({
          title: 'Percentuali non valide',
          description: 'La somma delle percentuali non può essere 100% o più.',
          variant: 'destructive',
        });
        return;
      }
    } else if (!isValid) {
      toast({
        title: 'Totale non valido',
        description: `Il totale delle rate (€${totaleRate.toFixed(2)}) deve essere uguale al totale preventivato (€${quoteTotale.toFixed(2)})`,
        variant: 'destructive',
      });
      return;
    }

    // Se options fornite (confirm dialog), aggiorna i refs
    if (options) {
      if (options.bypass !== undefined) bypassRef.current = options.bypass;
      if (options.replace !== undefined) replaceRef.current = options.replace;
    }

    // Usa refs per il controllo (mantengono valore tra renders)
    const shouldBypass = bypassRef.current;
    const shouldReplace = replaceRef.current;

    // Controlla se esistono già payment schedules (solo se non bypassato)
    if (existingSchedules.length > 0 && !shouldReplace && !shouldBypass) {
      setShowConfirmDialog(true);
      return;
    }

    // Procedi con creazione (dopo conferma o se non esistono schedules)
    setIsSubmitting(true);
    createMutation.mutate(data);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent 
        className="w-[95vw] max-w-2xl h-[90vh] sm:h-auto max-h-[90vh] flex flex-col p-0"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-4 border-b">
          <DialogTitle className="text-lg sm:text-xl">Genera Piano Pagamenti</DialogTitle>
          <DialogDescription className="text-sm">
            Crea automaticamente le rate di pagamento per questo preventivo
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          <Form {...form}>
          {/* Data Firma/Riferimento globale (per lavori storici) - disponibile per ENTRAMBI i tab */}
          <Card className="bg-muted/30 mb-6">
            <CardContent className="p-4">
              <FormField
                control={form.control}
                name="dataRiferimento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Data Firma/Riferimento
                      {quoteSignatureDate && (
                        <Badge variant="secondary" className="ml-2">
                          Auto-rilevata dalla firma
                        </Badge>
                      )}
                    </FormLabel>
                    <FormControl>
                      <DateInput
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="gg/mm/aaaa"
                        data-testid="input-data-riferimento-global"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground mt-1">
                      {quoteSignatureDate ? (
                        <>
                          Data firma preventivo rilevata automaticamente: <strong>{format(quoteSignatureDate, 'dd/MM/yyyy', { locale: it })}</strong>.
                          Puoi modificarla se necessario.
                        </>
                      ) : (
                        'Se stai inserendo un lavoro vecchio, puoi specificare quando è stata effettuata la firma. Lascia vuoto per usare la data odierna.'
                      )}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'automatico' | 'manuale')}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="automatico">Automatico</TabsTrigger>
              <TabsTrigger value="manuale">Manuale</TabsTrigger>
            </TabsList>

            {/* Tab Automatico - 4 Rate Evento (default) + Presets classici */}
            <TabsContent value="automatico" className="space-y-4 mt-4">

            {/* Acconto Input */}
            <Card className={cn(
              "border-2",
              selectedPreset === '4-rate-evento' ? "border-primary bg-primary/5" : ""
            )}>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Piano 4 Rate</h3>
                  {selectedPreset !== '4-rate-evento' && (
                    <Button variant="outline" size="sm" onClick={() => applyPreset('4-rate-evento')}>
                      Seleziona
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Acconto personalizzabile, percentuali e scadenze modificabili. Importi arrotondati automaticamente.
                </p>

                {!eventDate && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>Data evento non definita. Imposta la data evento sul lavoro per usare questo piano.</span>
                  </div>
                )}

                {eventDate && selectedPreset === '4-rate-evento' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="acconto-input">Acconto alla firma (€)</Label>
                      <Input
                        id="acconto-input"
                        type="number"
                        min={0}
                        max={quoteTotale - 1}
                        step={50}
                        value={accontoIniziale}
                        onChange={(e) => setAccontoIniziale(parseFloat(e.target.value) || 0)}
                        className="max-w-[180px]"
                        placeholder="0"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">2ª rata (%)</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={5}
                            max={90}
                            step={5}
                            value={percInput.rata2}
                            onChange={(e) => {
                              setPercInput(prev => ({ ...prev, rata2: e.target.value }));
                              const parsed = parseInt(e.target.value);
                              if (!isNaN(parsed) && parsed >= 5 && parsed <= 90) {
                                const rata3 = Math.min(ratePerc.rata3Perc, 100 - parsed - 5);
                                setRatePerc({ rata2Perc: parsed, rata3Perc: rata3 });
                                setPercInput(prev => ({ ...prev, rata2: e.target.value, rata3: String(rata3) }));
                              }
                            }}
                            onBlur={() => {
                              const parsed = parseInt(percInput.rata2);
                              const v = isNaN(parsed) ? ratePerc.rata2Perc : Math.min(90, Math.max(5, parsed));
                              const rata3 = Math.min(ratePerc.rata3Perc, 100 - v - 5);
                              setRatePerc({ rata2Perc: v, rata3Perc: rata3 });
                              setPercInput({ rata2: String(v), rata3: String(rata3) });
                            }}
                            className="w-20"
                          />
                          <span className="text-xs text-muted-foreground">gg evento:</span>
                          <Input
                            type="number"
                            min={-90}
                            max={0}
                            value={daysInput.rata2}
                            onChange={(e) => {
                              setDaysInput(prev => ({ ...prev, rata2: e.target.value }));
                              const parsed = parseInt(e.target.value);
                              if (!isNaN(parsed)) setRateDays(prev => ({ ...prev, rata2Days: parsed }));
                            }}
                            onBlur={() => setDaysInput(prev => ({ ...prev, rata2: String(rateDays.rata2Days) }))}
                            className="w-20"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">3ª rata (%)</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={5}
                            max={100 - ratePerc.rata2Perc - 5}
                            step={5}
                            value={percInput.rata3}
                            onChange={(e) => {
                              setPercInput(prev => ({ ...prev, rata3: e.target.value }));
                              const parsed = parseInt(e.target.value);
                              const maxVal = 100 - ratePerc.rata2Perc - 5;
                              if (!isNaN(parsed) && parsed >= 5 && parsed <= maxVal) {
                                setRatePerc(prev => ({ ...prev, rata3Perc: parsed }));
                              }
                            }}
                            onBlur={() => {
                              const parsed = parseInt(percInput.rata3);
                              const maxVal = 100 - ratePerc.rata2Perc - 5;
                              const v = isNaN(parsed) ? ratePerc.rata3Perc : Math.min(maxVal, Math.max(5, parsed));
                              setRatePerc(prev => ({ ...prev, rata3Perc: v }));
                              setPercInput(prev => ({ ...prev, rata3: String(v) }));
                            }}
                            className="w-20"
                          />
                          <span className="text-xs text-muted-foreground">gg evento:</span>
                          <Input
                            type="number"
                            min={1}
                            max={365}
                            value={daysInput.rata3}
                            onChange={(e) => {
                              setDaysInput(prev => ({ ...prev, rata3: e.target.value }));
                              const parsed = parseInt(e.target.value);
                              if (!isNaN(parsed)) setRateDays(prev => ({ ...prev, rata3Days: parsed }));
                            }}
                            onBlur={() => setDaysInput(prev => ({ ...prev, rata3: String(rateDays.rata3Days) }))}
                            className="w-20"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">Saldo ({100 - ratePerc.rata2Perc - ratePerc.rata3Perc}%) a +</span>
                      <Input
                        type="number"
                        min={rateDays.rata3Days + 1}
                        max={730}
                        value={daysInput.saldo}
                        onChange={(e) => {
                          setDaysInput(prev => ({ ...prev, saldo: e.target.value }));
                          const parsed = parseInt(e.target.value);
                          if (!isNaN(parsed)) setRateDays(prev => ({ ...prev, saldoDays: parsed }));
                        }}
                        onBlur={() => setDaysInput(prev => ({ ...prev, saldo: String(rateDays.saldoDays) }))}
                        className="w-20"
                      />
                      <span className="text-xs text-muted-foreground">gg dall'evento</span>
                    </div>

                    {(ratePerc.rata2Perc + ratePerc.rata3Perc) >= 100 && (
                      <p className="text-xs text-red-600">La somma delle percentuali non può superare il 95% (serve almeno un 5% di saldo)</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Preset classici (collapsible) */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Oppure scegli un preset classico:</p>
              <div className="grid grid-cols-3 gap-2">
                <Card
                  className={cn(
                    "cursor-pointer hover:bg-accent transition-colors border",
                    selectedPreset === 'acconto-saldo' && "border-primary bg-primary/5"
                  )}
                  onClick={() => applyPreset('30-70')}
                >
                  <CardContent className="p-3 text-center">
                    <h4 className="text-sm font-semibold">30/70</h4>
                    <p className="text-xs text-muted-foreground mt-1">€{(quoteTotale * 0.3).toFixed(0)} + €{(quoteTotale * 0.7).toFixed(0)}</p>
                  </CardContent>
                </Card>
                <Card
                  className={cn(
                    "cursor-pointer hover:bg-accent transition-colors border",
                    selectedPreset === '2-rate' && "border-primary bg-primary/5"
                  )}
                  onClick={() => applyPreset('50-50')}
                >
                  <CardContent className="p-3 text-center">
                    <h4 className="text-sm font-semibold">50/50</h4>
                    <p className="text-xs text-muted-foreground mt-1">€{(quoteTotale * 0.5).toFixed(0)} + €{(quoteTotale * 0.5).toFixed(0)}</p>
                  </CardContent>
                </Card>
                <Card
                  className={cn(
                    "cursor-pointer hover:bg-accent transition-colors border",
                    selectedPreset === '3-rate' && "border-primary bg-primary/5"
                  )}
                  onClick={() => applyPreset('3-rate')}
                >
                  <CardContent className="p-3 text-center">
                    <h4 className="text-sm font-semibold">3 Rate</h4>
                    <p className="text-xs text-muted-foreground mt-1">€{(quoteTotale / 3).toFixed(0)} x3</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Anteprima Scadenzario */}
            {payments.length > 0 && selectedPreset && (
              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <h4 className="font-medium mb-3">Anteprima Scadenzario:</h4>
                  <div className="space-y-2">
                    {payments.map((payment, idx) => {
                      const importoStr = Number.isInteger(payment.importo) ? payment.importo.toFixed(0) : payment.importo.toFixed(2);
                      return (
                        <div key={idx} className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">{payment.descrizione}</span>
                          <div className="text-right">
                            <span className="font-semibold">€{importoStr}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {format(payment.dataScadenza, 'dd/MM/yyyy', { locale: it })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between items-center text-sm font-semibold mt-3 pt-3 border-t">
                    <span>Pagamento totale</span>
                    <span>€{Number.isInteger(totaleRate) ? totaleRate.toFixed(0) : totaleRate.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Footer con Bottone Genera */}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Annulla
              </Button>
              <Button
                type="button"
                onClick={() => onSubmit(form.getValues())}
                disabled={isSubmitting || createMutation.isPending || (selectedPreset === '4-rate-evento' && (!eventDate || accontoIniziale >= quoteTotale || ratePerc.rata2Perc + ratePerc.rata3Perc >= 100))}
                data-testid="button-genera-automatico"
              >
                {(isSubmitting || createMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Genera Piano Pagamenti
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Tab Manuale - Custom Rate */}
          <TabsContent value="manuale" className="space-y-4 mt-4">
            <form onSubmit={form.handleSubmit((data) => onSubmit(data))} className="space-y-4">
                {/* Lista Rate */}
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <Card key={field.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <h4 className="font-medium">Rata {index + 1}</h4>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => remove(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        <FormField
                          control={form.control}
                          name={`payments.${index}.importo`}
                          render={({ field: formField }) => (
                            <FormItem>
                              <FormLabel>Importo (€)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  {...formField}
                                  onChange={(e) => formField.onChange(parseFloat(e.target.value) || 0)}
                                  data-testid={`input-importo-${index}`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Data Scadenza con modalità relativa */}
                        <div className="space-y-3 mt-3">
                          {eventDate && (
                            <RadioGroup
                              value={dateModes[index] || 'absolute'}
                              onValueChange={(value) => {
                                const newModes = [...dateModes];
                                newModes[index] = value as 'absolute' | 'relative';
                                setDateModes(newModes);
                              }}
                              className="flex gap-4"
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="absolute" id={`absolute-${index}`} />
                                <Label htmlFor={`absolute-${index}`} className="font-normal cursor-pointer text-sm">
                                  Data assoluta
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="relative" id={`relative-${index}`} />
                                <Label htmlFor={`relative-${index}`} className="font-normal cursor-pointer text-sm">
                                  Relativa all'evento
                                </Label>
                              </div>
                            </RadioGroup>
                          )}

                          {(dateModes[index] === 'absolute' || !eventDate) && (
                            <FormField
                              control={form.control}
                              name={`payments.${index}.dataScadenza`}
                              render={({ field: formField }) => (
                                <FormItem>
                                  <FormLabel>Data Scadenza</FormLabel>
                                  <FormControl>
                                    <DateInput
                                      value={formField.value}
                                      onChange={formField.onChange}
                                      data-testid={`input-data-scadenza-${index}`}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}

                          {eventDate && dateModes[index] === 'relative' && (
                            <div className="space-y-2">
                              <Label>Giorni dall'evento</Label>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const newDays = [...relativeDaysArray];
                                    newDays[index] = (newDays[index] || 0) - 1;
                                    setRelativeDaysArray(newDays);
                                  }}
                                  className="h-8 w-8 p-0"
                                >
                                  -
                                </Button>
                                <Input
                                  type="number"
                                  value={relativeDaysArray[index] || 0}
                                  onChange={(e) => {
                                    const newDays = [...relativeDaysArray];
                                    newDays[index] = parseInt(e.target.value) || 0;
                                    setRelativeDaysArray(newDays);
                                  }}
                                  className="text-center w-20"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const newDays = [...relativeDaysArray];
                                    newDays[index] = (newDays[index] || 0) + 1;
                                    setRelativeDaysArray(newDays);
                                  }}
                                  className="h-8 w-8 p-0"
                                >
                                  +
                                </Button>
                                <span className="text-sm text-muted-foreground ml-2">
                                  {relativeDaysArray[index] === 0 ? 'giorno evento' :
                                   relativeDaysArray[index] > 0 ? `giorni dopo` : `giorni prima`}
                                </span>
                              </div>
                              <div className="rounded-md bg-muted p-2 flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-semibold">
                                  {format(addDays(eventDate, relativeDaysArray[index] || 0), 'dd/MM/yyyy', { locale: it })}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        <FormField
                          control={form.control}
                          name={`payments.${index}.descrizione`}
                          render={({ field: formField }) => (
                            <FormItem className="mt-3">
                              <FormLabel>Descrizione</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Es: Acconto, Saldo, Prima rata..."
                                  {...formField}
                                  data-testid={`input-descrizione-${index}`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Aggiungi Rata */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    append({
                      importo: 0,
                      dataScadenza: addDays(new Date(), 30 * (fields.length + 1)),
                      descrizione: `Rata ${fields.length + 1}`,
                    })
                  }
                  data-testid="button-add-rata"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Aggiungi Rata
                </Button>

                {/* Totali */}
                <Card className={cn(
                  'border-2',
                  isValid ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-red-500 bg-red-50 dark:bg-red-900/20'
                )}>
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Totale Rate:</span>
                        <span className="font-bold text-lg">€{totaleRate.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Totale Preventivato:</span>
                        <span>€{quoteTotale.toFixed(2)}</span>
                      </div>
                      {!isValid && (
                        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 mt-2">
                          <AlertCircle className="h-4 w-4" />
                          <span>
                            Differenza: €{Math.abs(differenza).toFixed(2)}
                            {differenza > 0 ? ' in eccesso' : ' in difetto'}
                          </span>
                        </div>
                      )}
                      {isValid && (
                        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mt-2">
                          <Badge variant="default" className="bg-green-600">✓ Totale corretto</Badge>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Submit */}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={onClose}>
                    Annulla
                  </Button>
                  <Button type="submit" disabled={!isValid || isSubmitting || createMutation.isPending}>
                    {(isSubmitting || createMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Genera Piano Pagamenti
                  </Button>
                </DialogFooter>
              </form>
          </TabsContent>
        </Tabs>
        </Form>
        </div>
      </DialogContent>
    </Dialog>

    {/* AlertDialog: Conferma sovrascrittura piano pagamenti esistente */}
    <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>⚠️ Piano Pagamenti Già Esistente</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Per questo lavoro esiste già {existingSchedules.length === 1 ? 'un piano pagamenti' : `${existingSchedules.length} piani pagamenti`} con{' '}
              <strong>
                {existingSchedules.reduce((sum, s) => sum + s.payments.length, 0)} rate totali
              </strong>
              {' '}per un importo di{' '}
              <strong>
                €{existingSchedules.reduce((sum, s) => sum + s.totale, 0).toFixed(2)}
              </strong>
              .
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Cosa vuoi fare?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel data-testid="button-cancel-schedule">
            Annulla
          </AlertDialogCancel>
          <Button
            variant="outline"
            onClick={() => {
              setShowConfirmDialog(false);
              // Passa parametri espliciti per evitare React batching issues
              onSubmit(form.getValues(), { bypass: true, replace: false });
            }}
            disabled={isSubmitting || createMutation.isPending}
            className="flex-1 sm:flex-initial"
            data-testid="button-add-anyway"
          >
            {(isSubmitting || createMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Aggiungi Comunque
          </Button>
          <AlertDialogAction
            onClick={() => {
              setShowConfirmDialog(false);
              // Passa parametri espliciti per evitare React batching issues
              onSubmit(form.getValues(), { bypass: true, replace: true });
            }}
            disabled={isSubmitting || createMutation.isPending}
            className="bg-red-600 hover:bg-red-700 flex-1 sm:flex-initial"
            data-testid="button-replace-schedule"
          >
            {(isSubmitting || createMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Sostituisci
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}