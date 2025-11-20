/**
 * REGISTRA PAGAMENTO MODAL
 * Modal per registrare pagamento ricevuto
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

import {
  Dialog,
  DialogContent,
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
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, DollarSign } from 'lucide-react';

// Metodi pagamento disponibili
const PAYMENT_METHODS = [
  { value: 'contanti', label: 'Contanti' },
  { value: 'bonifico', label: 'Bonifico Bancario' },
  { value: 'carta', label: 'Carta di Credito/Debito' },
  { value: 'assegno', label: 'Assegno' },
  { value: 'altro', label: 'Altro' },
] as const;

// Form schema
const registraPagamentoSchema = z.object({
  importoPagato: z.number().positive('Importo deve essere positivo'),
  dataPagamento: z.date(),
  metodoPagamento: z.enum(['contanti', 'bonifico', 'carta', 'assegno', 'altro']),
  note: z.string().optional(),
});

type RegistraPagamentoForm = z.infer<typeof registraPagamentoSchema>;

interface RegistraPagamentoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string;
  payment: {
    id: string;
    tipo: string;
    importo: number;
  };
  jobId: string;
}

export default function RegistraPagamentoModal({
  open,
  onOpenChange,
  scheduleId,
  payment,
  jobId,
}: RegistraPagamentoModalProps) {
  const { toast } = useToast();
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const form = useForm<RegistraPagamentoForm>({
    resolver: zodResolver(registraPagamentoSchema),
    defaultValues: {
      importoPagato: payment.importo,
      dataPagamento: new Date(),
      metodoPagamento: 'bonifico',
      note: '',
    },
  });

  // Mutation: Registra pagamento
  const registraMutation = useMutation({
    mutationFn: async (data: RegistraPagamentoForm) => {
      const response = await apiRequest(
        'POST',
        `/api/payment-schedules/${scheduleId}/payments/${payment.id}/register`,
        {
          importoPagato: data.importoPagato,
          dataPagamento: data.dataPagamento.toISOString(),
          metodoPagamento: data.metodoPagamento,
          note: data.note || undefined,
        }
      );
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Pagamento registrato',
        description: `Pagamento di €${data.data.totalePagato.toFixed(2)} registrato. Saldo residuo: €${data.data.saldoResiduo.toFixed(2)}`,
      });
      // Invalida cache payment schedules (both queryKeys for real-time Financial Summary update)
      queryClient.invalidateQueries({ queryKey: ['payment-schedules', jobId] });
      queryClient.invalidateQueries({ queryKey: ['paymentSchedule', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Errore registrazione',
        description: error.message || 'Impossibile registrare il pagamento',
      });
    },
  });

  const onSubmit = (data: RegistraPagamentoForm) => {
    // Validazione: importo non deve superare importo rata
    if (data.importoPagato > payment.importo) {
      toast({
        variant: 'destructive',
        title: 'Importo non valido',
        description: `L'importo pagato non può superare €${payment.importo.toFixed(2)}`,
      });
      return;
    }

    registraMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="modal-registra-pagamento">
        <DialogHeader>
          <DialogTitle>Registra Pagamento - {payment.tipo}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Importo Pagato */}
            <FormField
              control={form.control}
              name="importoPagato"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Importo Pagato</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={payment.importo}
                        placeholder="0.00"
                        className="pl-9"
                        data-testid="input-importo-pagato"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Importo rata: €{payment.importo.toFixed(2)}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Data Pagamento */}
            <FormField
              control={form.control}
              name="dataPagamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data Pagamento</FormLabel>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                          data-testid="button-data-pagamento"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? (
                            format(field.value, 'dd/MM/yyyy', { locale: it })
                          ) : (
                            <span>Seleziona data</span>
                          )}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={(date) => {
                          field.onChange(date);
                          setDatePickerOpen(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Metodo Pagamento */}
            <FormField
              control={form.control}
              name="metodoPagamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Metodo di Pagamento</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-metodo-pagamento">
                        <SelectValue placeholder="Seleziona metodo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PAYMENT_METHODS.map((method) => (
                        <SelectItem
                          key={method.value}
                          value={method.value}
                          data-testid={`option-metodo-${method.value}`}
                        >
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Note */}
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (opzionale)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Aggiungi note sul pagamento..."
                      rows={3}
                      data-testid="textarea-note"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={registraMutation.isPending}
                data-testid="button-annulla"
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={registraMutation.isPending}
                data-testid="button-registra-submit"
              >
                {registraMutation.isPending ? 'Registrazione...' : 'Registra Pagamento'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
