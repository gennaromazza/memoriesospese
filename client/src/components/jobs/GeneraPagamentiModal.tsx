/**
 * GENERA PAGAMENTI MODAL
 * Modal per generare piano pagamenti da quote firmato
 * Dual-mode: Automatico (presets) + Manuale (custom rate)
 */

import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Plus, Trash2, CalendarIcon, Loader2, AlertCircle } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { it } from 'date-fns/locale';

const paymentSchema = z.object({
  importo: z.number().min(0.01, 'Importo obbligatorio'),
  dataScadenza: z.date(),
  descrizione: z.string().optional(),
});

const formSchema = z.object({
  payments: z.array(paymentSchema).min(1, 'Almeno una rata richiesta'),
});

type FormData = z.infer<typeof formSchema>;

interface GeneraPagamentiModalProps {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  quoteTotale: number;
  jobId: string;
  clienteId: string;
}

export default function GeneraPagamentiModal({
  open,
  onClose,
  quoteId,
  quoteTotale,
  jobId,
  clienteId,
}: GeneraPagamentiModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'automatico' | 'manuale'>('automatico');

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
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'payments',
  });

  // Calcola totale rate
  const payments = form.watch('payments');
  const totaleRate = payments.reduce((sum, p) => sum + (p.importo || 0), 0);
  const differenza = totaleRate - quoteTotale;
  const isValid = Math.abs(differenza) < 0.01; // Tolleranza 1 centesimo

  // Presets automatici
  const applyPreset = (preset: '30-70' | '50-50' | '3-rate') => {
    const today = new Date();
    let newPayments: { importo: number; dataScadenza: Date; descrizione: string }[] = [];

    switch (preset) {
      case '30-70':
        newPayments = [
          {
            importo: quoteTotale * 0.3,
            dataScadenza: addDays(today, 7),
            descrizione: 'Acconto 30%',
          },
          {
            importo: quoteTotale * 0.7,
            dataScadenza: addDays(today, 30),
            descrizione: 'Saldo 70%',
          },
        ];
        break;
      case '50-50':
        newPayments = [
          {
            importo: quoteTotale * 0.5,
            dataScadenza: addDays(today, 7),
            descrizione: 'Acconto 50%',
          },
          {
            importo: quoteTotale * 0.5,
            dataScadenza: addDays(today, 30),
            descrizione: 'Saldo 50%',
          },
        ];
        break;
      case '3-rate':
        const rataImporto = quoteTotale / 3;
        newPayments = [
          {
            importo: rataImporto,
            dataScadenza: addDays(today, 7),
            descrizione: 'Prima rata (1/3)',
          },
          {
            importo: rataImporto,
            dataScadenza: addDays(today, 30),
            descrizione: 'Seconda rata (2/3)',
          },
          {
            importo: rataImporto,
            dataScadenza: addDays(today, 60),
            descrizione: 'Terza rata (3/3)',
          },
        ];
        break;
    }

    replace(newPayments); // Use useFieldArray replace to sync fields
    setActiveTab('manuale'); // Switch to manual tab per review
  };

  // Mutation: crea payment schedule
  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await fetch('/api/payment-schedules/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId,
          jobId,
          clienteId,
          payments: data.payments,
          totale: quoteTotale,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Errore creazione piano pagamenti');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-schedules', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      toast({
        title: '✅ Piano pagamenti generato!',
        description: 'Lo scadenzario è stato creato con successo.',
      });
      onClose();
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: FormData) => {
    if (!isValid) {
      toast({
        title: 'Totale non valido',
        description: `Il totale delle rate (€${totaleRate.toFixed(2)}) deve essere uguale al totale preventivato (€${quoteTotale.toFixed(2)})`,
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Genera Piano Pagamenti</DialogTitle>
          <DialogDescription>
            Totale preventivato: <strong className="text-foreground">€{quoteTotale.toFixed(2)}</strong>
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'automatico' | 'manuale')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="automatico">Automatico</TabsTrigger>
            <TabsTrigger value="manuale">Manuale</TabsTrigger>
          </TabsList>

          {/* Tab Automatico - Presets */}
          <TabsContent value="automatico" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Seleziona un preset per generare automaticamente lo scadenzario
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="cursor-pointer hover:bg-accent transition-colors" onClick={() => applyPreset('30-70')}>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2">30% / 70%</h3>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Acconto:</span>
                      <span className="font-medium">€{(quoteTotale * 0.3).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Saldo:</span>
                      <span className="font-medium">€{(quoteTotale * 0.7).toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:bg-accent transition-colors" onClick={() => applyPreset('50-50')}>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2">50% / 50%</h3>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Acconto:</span>
                      <span className="font-medium">€{(quoteTotale * 0.5).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Saldo:</span>
                      <span className="font-medium">€{(quoteTotale * 0.5).toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:bg-accent transition-colors" onClick={() => applyPreset('3-rate')}>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2">3 Rate Uguali</h3>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Importo rata:</span>
                      <span className="font-medium">€{(quoteTotale / 3).toFixed(2)}</span>
                    </div>
                    <div className="text-muted-foreground text-xs mt-2">
                      Scadenze: +7, +30, +60 giorni
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab Manuale - Custom Rate */}
          <TabsContent value="manuale" className="space-y-4 mt-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

                          <FormField
                            control={form.control}
                            name={`payments.${index}.dataScadenza`}
                            render={({ field: formField }) => (
                              <FormItem>
                                <FormLabel>Data Scadenza</FormLabel>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant="outline"
                                        className={cn(
                                          'w-full pl-3 text-left font-normal',
                                          !formField.value && 'text-muted-foreground'
                                        )}
                                      >
                                        {formField.value ? (
                                          format(formField.value, 'dd/MM/yyyy', { locale: it })
                                        ) : (
                                          <span>Seleziona data</span>
                                        )}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                      </Button>
                                    </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={formField.value}
                                      onSelect={formField.onChange}
                                      disabled={(date) => date < new Date()}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
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
                  <Button type="submit" disabled={!isValid || createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Genera Piano Pagamenti
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
