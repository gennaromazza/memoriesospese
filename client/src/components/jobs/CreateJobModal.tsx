/**
 * CREATE JOB MODAL
 * Form creazione nuovo lavoro manuale
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createJob } from '@/lib/jobs';
import { getAllClienti } from '@/lib/clienti';
import { useAuth } from '@/contexts/FirebaseAuthContext';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { JobType, JobProvenance } from '@shared/jobs-types';

const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: 'matrimonio', label: 'Matrimonio' },
  { value: 'battesimo', label: 'Battesimo' },
  { value: 'famiglia', label: 'Famiglia' },
  { value: 'evento', label: 'Evento' },
  { value: 'comunione', label: 'Comunione' },
  { value: 'compleanno', label: 'Compleanno' },
  { value: 'altro', label: 'Altro' }
];

const PROVENANCES: { value: JobProvenance; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'passaparola', label: 'Passaparola' },
  { value: 'fiera', label: 'Fiera' },
  { value: 'google', label: 'Google' },
  { value: 'sito_web', label: 'Sito Web' },
  { value: 'altro', label: 'Altro' }
];

const formSchema = z.object({
  clienteId: z.string().min(1, 'Seleziona un cliente'),
  jobType: z.enum([
    'matrimonio',
    'battesimo',
    'famiglia',
    'evento',
    'comunione',
    'compleanno',
    'altro'
  ]),
  eventDate: z.date({
    required_error: 'Data evento obbligatoria'
  }),
  eventLocation: z.string().optional(),
  provenance: z.enum([
    'instagram',
    'facebook',
    'passaparola',
    'fiera',
    'google',
    'sito_web',
    'altro'
  ]),
  noteInterne: z.string().optional()
});

type FormData = z.infer<typeof formSchema>;

interface CreateJobModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateJobModal({ open, onClose }: CreateJobModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  
  // Query clienti
  const { data: clienti = [] } = useQuery({
    queryKey: ['clienti'],
    queryFn: getAllClienti
  });
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clienteId: '',
      jobType: 'matrimonio',
      provenance: 'instagram',
      eventLocation: '',
      noteInterne: ''
    }
  });
  
  // Mutation crea job
  const createMutation = useMutation({
    mutationFn: (data: FormData) => createJob(data, user!.uid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast({
        title: 'Lavoro creato!',
        description: 'Il nuovo lavoro è stato creato con successo.'
      });
      form.reset();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Errore',
        description: error.message || 'Errore durante la creazione del lavoro.',
        variant: 'destructive'
      });
    }
  });
  
  const onSubmit = (data: FormData) => {
    createMutation.mutate(data);
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuovo Lavoro</DialogTitle>
          <DialogDescription>
            Crea un nuovo lavoro fotografico. Potrai poi creare preventivi e gestire il workflow completo.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Cliente */}
            <FormField
              control={form.control}
              name="clienteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente *</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-cliente">
                        <SelectValue placeholder="Seleziona cliente..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clienti.map(cliente => (
                        <SelectItem key={cliente.id} value={cliente.id}>
                          {cliente.nome} {cliente.cognome} ({cliente.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Se il cliente non è in lista, crealo prima nella sezione Clienti.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-4">
              {/* Tipo lavoro */}
              <FormField
                control={form.control}
                name="jobType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo Lavoro *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-job-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {JOB_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Provenienza */}
              <FormField
                control={form.control}
                name="provenance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provenienza *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-provenance">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PROVENANCES.map(prov => (
                          <SelectItem key={prov.value} value={prov.value}>
                            {prov.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Data evento */}
              <FormField
                control={form.control}
                name="eventDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Evento *</FormLabel>
                    <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                            data-testid="button-select-date"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? (
                              format(field.value, 'PPP', { locale: it })
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
                          locale={it}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Location */}
              <FormField
                control={form.control}
                name="eventLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="es. Casale dei Baroni"
                        {...field}
                        data-testid="input-location"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Note interne */}
            <FormField
              control={form.control}
              name="noteInterne"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note Interne</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Note private visibili solo in admin..."
                      className="resize-none"
                      rows={3}
                      {...field}
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormDescription>
                    Queste note sono visibili solo agli admin
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={createMutation.isPending}
                data-testid="button-cancel"
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-sage hover:bg-dark-sage"
                data-testid="button-submit"
              >
                {createMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Crea Lavoro
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
