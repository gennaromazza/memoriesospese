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
import { getJobTypes } from '@/lib/job-types';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useJobEntity } from '@/hooks/useJobEntity';
import { ClientAutocomplete } from '@/components/clienti/ClientAutocomplete';
import type { JobType as JobTypeDoc } from '@shared/job-types';
import type { Cliente } from '@shared/clienti-types';
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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, Loader2, X, User } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  nomeEvento: z.string().min(2, 'Nome evento troppo corto'),
  clientiIds: z.array(z.string()).min(1, 'Seleziona almeno un cliente'),
  jobType: z.string().min(1, 'Seleziona un tipo lavoro'),
  eventDate: z.date({
    required_error: 'Data evento obbligatoria'
  }),
  allDay: z.boolean(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  eventLocation: z.string().optional(),
  provenance: z.string().min(1, 'Seleziona una provenienza'),
  noteInterne: z.string().optional()
}).refine((data) => {
  if (!data.allDay && (!data.startTime || !data.endTime)) {
    return false;
  }
  return true;
}, {
  message: 'Orari richiesti se non è tutto il giorno',
  path: ['startTime']
});

type FormData = z.infer<typeof formSchema>;

interface CreateJobModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateJobModal({ open, onClose }: CreateJobModalProps) {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedClienti, setSelectedClienti] = useState<Cliente[]>([]);
  
  // Query job types dinamici
  const { data: jobTypes = [], isLoading: loadingJobTypes } = useQuery<JobTypeDoc[]>({
    queryKey: ['jobTypes'],
    queryFn: getJobTypes
  });

  // Query provenances dinamiche
  const { items: provenances = [], isLoading: loadingProvenances } = useJobEntity('provenance');
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nomeEvento: '',
      clientiIds: [],
      jobType: '',
      allDay: false,
      startTime: '',
      endTime: '',
      provenance: '',
      eventLocation: '',
      noteInterne: ''
    }
  });

  const allDay = form.watch('allDay');

  // Multi-client handlers
  const handleAddCliente = (cliente: Cliente | null) => {
    if (!cliente) return;
    
    const currentIds = form.getValues('clientiIds');
    if (currentIds.includes(cliente.id)) {
      toast({
        title: 'Cliente già aggiunto',
        description: `${cliente.nome} ${cliente.cognome} è già nella lista`,
        variant: 'destructive'
      });
      return;
    }
    
    form.setValue('clientiIds', [...currentIds, cliente.id]);
    setSelectedClienti([...selectedClienti, cliente]);
  };

  const handleRemoveCliente = (clienteId: string) => {
    const currentIds = form.getValues('clientiIds');
    form.setValue('clientiIds', currentIds.filter(id => id !== clienteId));
    setSelectedClienti(selectedClienti.filter(c => c.id !== clienteId));
  };
  
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
      setSelectedClienti([]);
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

  const handleClose = () => {
    form.reset();
    setSelectedClienti([]);
    onClose();
  };
  
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuovo Lavoro</DialogTitle>
          <DialogDescription>
            Crea un nuovo lavoro fotografico. Potrai poi creare preventivi e gestire il workflow completo.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Nome Evento */}
            <FormField
              control={form.control}
              name="nomeEvento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Evento *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="es. Matrimonio Sara e Luca"
                      {...field}
                      data-testid="input-nome-evento"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Multi-client section */}
            <div className="space-y-3">
              <FormLabel>Clienti *</FormLabel>
              <ClientAutocomplete
                onSelect={handleAddCliente}
                placeholder="Cerca e aggiungi cliente..."
                enableQuickAdd
              />
              
              {/* Chip list */}
              {selectedClienti.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedClienti.map(cliente => (
                    <Badge
                      key={cliente.id}
                      variant="secondary"
                      className="pl-3 pr-1 py-1.5"
                      data-testid={`badge-cliente-${cliente.id}`}
                    >
                      <User className="w-3 h-3 mr-1.5" />
                      <span>{cliente.nome} {cliente.cognome}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto p-1 ml-1.5 hover:bg-transparent"
                        onClick={() => handleRemoveCliente(cliente.id)}
                        data-testid={`button-remove-${cliente.id}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
              
              {form.formState.errors.clientiIds && (
                <p className="text-sm font-medium text-destructive">
                  {form.formState.errors.clientiIds.message}
                </p>
              )}
            </div>
            
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
                      disabled={loadingJobTypes}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-job-type">
                          <SelectValue placeholder={loadingJobTypes ? 'Caricamento...' : 'Seleziona tipo...'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {jobTypes
                          .filter(jt => jt.attivo)
                          .sort((a, b) => a.ordine - b.ordine)
                          .map(jobType => (
                            <SelectItem key={jobType.id} value={jobType.slug}>
                              {jobType.icona} {jobType.nome}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Provenienza dinamica */}
              <FormField
                control={form.control}
                name="provenance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provenienza *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={loadingProvenances}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-provenance">
                          <SelectValue placeholder={loadingProvenances ? 'Caricamento...' : 'Seleziona...'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {provenances
                          .filter(p => p.attivo)
                          .sort((a, b) => a.ordine - b.ordine)
                          .map(prov => (
                            <SelectItem key={prov.id} value={prov.slug}>
                              {prov.icona} {prov.nome}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
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

            {/* All day + orari */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="allDay"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <FormLabel>Tutto il giorno</FormLabel>
                      <FormDescription className="text-xs">
                        L'evento dura tutta la giornata
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-all-day"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {!allDay && (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ora Inizio *</FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            {...field}
                            data-testid="input-start-time"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ora Fine *</FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            {...field}
                            data-testid="input-end-time"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

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
                onClick={handleClose}
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
