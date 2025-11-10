/**
 * GESTIONE RATA MODAL
 * Modal per aggiungere o modificare una rata in un payment schedule
 */

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

const formSchema = z.object({
  tipo: z.enum(['acconto', 'rata', 'saldo']),
  importo: z.number().min(0.01, 'Importo deve essere maggiore di 0'),
  dataScadenza: z.date(),
  descrizione: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface GestioneRataModalProps {
  open: boolean;
  onClose: () => void;
  scheduleId: string;
  jobId: string;
  payment?: {
    id: string;
    tipo: string;
    importo: number;
    dataScadenza: any;
    descrizione?: string;
  };
  mode: 'add' | 'edit';
}

export default function GestioneRataModal({
  open,
  onClose,
  scheduleId,
  jobId,
  payment,
  mode,
}: GestioneRataModalProps) {
  const { toast } = useToast();

  // Helper: converti dataScadenza in Date (gestisce Timestamp Firestore o Date già convertito)
  const getDateFromPayment = (dataScadenza: any): Date => {
    if (!dataScadenza) return new Date();
    // Se è già un Date object, usalo direttamente
    if (dataScadenza instanceof Date) return dataScadenza;
    // Se è un Timestamp Firestore, converti con toDate()
    if (dataScadenza.toDate && typeof dataScadenza.toDate === 'function') {
      return dataScadenza.toDate();
    }
    // Fallback: prova a parsare come string/number
    return new Date(dataScadenza);
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tipo: (payment?.tipo as 'acconto' | 'rata' | 'saldo') || 'acconto',
      importo: payment?.importo || 0,
      dataScadenza: getDateFromPayment(payment?.dataScadenza),
      descrizione: payment?.descrizione || '',
    },
  });

  // Reset form quando modal si apre con payment diverso
  useEffect(() => {
    if (open) {
      form.reset({
        tipo: (payment?.tipo as 'acconto' | 'rata' | 'saldo') || 'acconto',
        importo: payment?.importo || 0,
        dataScadenza: getDateFromPayment(payment?.dataScadenza),
        descrizione: payment?.descrizione || '',
      });
    }
  }, [open, payment, form]);

  // Mutation: aggiungi/modifica rata
  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const endpoint = mode === 'add'
        ? `/api/payment-schedules/${scheduleId}/payments`
        : `/api/payment-schedules/${scheduleId}/payments/${payment?.id}`;
      
      const method = mode === 'add' ? 'POST' : 'PATCH';

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: data.tipo,
          importo: data.importo,
          dataScadenza: data.dataScadenza.toISOString(),
          descrizione: data.descrizione,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Errore ${mode === 'add' ? 'aggiunta' : 'modifica'} rata`);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-schedules', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      toast({
        title: mode === 'add' ? '✅ Rata aggiunta!' : '✅ Rata modificata!',
        description: mode === 'add' 
          ? 'La rata è stata aggiunta con successo al piano pagamenti.'
          : 'La rata è stata modificata con successo.',
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
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'add' ? 'Aggiungi Rata' : 'Modifica Rata'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'add'
              ? 'Aggiungi una nuova rata al piano pagamenti'
              : 'Modifica i dettagli della rata selezionata'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Tipo */}
            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-tipo">
                        <SelectValue placeholder="Seleziona tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="acconto">Acconto</SelectItem>
                      <SelectItem value="rata">Rata</SelectItem>
                      <SelectItem value="saldo">Saldo</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Importo */}
            <FormField
              control={form.control}
              name="importo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Importo (€)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      data-testid="input-importo"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Data Scadenza */}
            <FormField
              control={form.control}
              name="dataScadenza"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data Scadenza</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                          data-testid="button-date-picker"
                        >
                          {field.value ? (
                            format(field.value, 'dd/MM/yyyy', { locale: it })
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
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Descrizione */}
            <FormField
              control={form.control}
              name="descrizione"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrizione (opzionale)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Es: Prima rata, Saldo finale..."
                      {...field}
                      data-testid="input-descrizione"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Footer */}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Annulla
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-submit">
                {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {mode === 'add' ? 'Aggiungi' : 'Salva Modifiche'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
