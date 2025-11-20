/**
 * CREATE JOB MODAL
 * Form creazione nuovo lavoro manuale
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'wouter';
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
import { DateInput } from '@/components/ui/date-input';
import { Loader2, X, User, AlertTriangle } from 'lucide-react';
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
  rituLocation: z.string().optional(),
  rituTime: z.string().optional(),
  provenance: z.string().min(1, 'Seleziona una provenienza'),
  noteInterne: z.string().optional()
}).refine((data) => {
  if (data.allDay) return true;
  if (!data.startTime || !data.endTime) return false;
  return data.startTime < data.endTime;
}, {
  message: 'L\'orario fine deve essere dopo l\'orario inizio',
  path: ['endTime']
});

type FormData = z.infer<typeof formSchema>;

interface CreateJobModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateJobModal({ open, onClose }: CreateJobModalProps) {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedClienti, setSelectedClienti] = useState<Cliente[]>([]);
  const [conflictsAlert, setConflictsAlert] = useState<{
    open: boolean;
    conflicts: Array<{
      type: 'calendar' | 'booking';
      title: string;
      start: string;
      end: string;
      allDay?: boolean;
      clientName?: string;
    }>;
  }>({
    open: false,
    conflicts: []
  });
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  
  // Query job types dinamici
  const { data: jobTypes = [], isLoading: loadingJobTypes } = useQuery<JobTypeDoc[]>({
    queryKey: ['jobTypes'],
    queryFn: getJobTypes
  });

  // Query provenances dinamiche
  const { items: provenances = [], isLoading: loadingProvenances } = useJobEntity('provenance');

  // Performance optimization: memoize sorted lists
  const orderedJobTypes = useMemo(() => {
    return jobTypes
      .filter(jt => jt.attivo)
      .sort((a, b) => a.ordine - b.ordine);
  }, [jobTypes]);

  const orderedProvenances = useMemo(() => {
    return provenances
      .filter(p => p.attivo)
      .sort((a, b) => a.ordine - b.ordine);
  }, [provenances]);
  
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
      rituLocation: '',
      rituTime: '',
      noteInterne: ''
    }
  });

  const allDay = form.watch('allDay');
  const eventDate = form.watch('eventDate');
  const startTime = form.watch('startTime');
  const endTime = form.watch('endTime');

  // Reset automatico orari quando allDay = true
  useEffect(() => {
    if (allDay) {
      form.setValue("startTime", "");
      form.setValue("endTime", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDay]);

  // Auto-check calendar conflicts quando data/orari cambiano
  useEffect(() => {
    if (!eventDate) return;

    const abortController = new AbortController();

    const checkConflicts = async () => {
      try {
        setCheckingConflicts(true);
        
        // Costruisci query params
        const year = eventDate.getFullYear();
        const month = String(eventDate.getMonth() + 1).padStart(2, '0');
        const day = String(eventDate.getDate()).padStart(2, '0');
        const eventDateStr = `${year}-${month}-${day}`;
        
        const params = new URLSearchParams({
          eventDate: eventDateStr,
          allDay: String(allDay)
        });
        
        if (!allDay && startTime && endTime) {
          params.append('startTime', startTime);
          params.append('endTime', endTime);
        }
        
        const response = await fetch(`/api/jobs/check-calendar?${params.toString()}`, {
          signal: abortController.signal
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        
        if (!data || typeof data !== "object") return;
        
        if (data.hasConflicts && data.conflicts.length > 0) {
          setConflictsAlert({
            open: true,
            conflicts: data.conflicts
          });
        } else {
          // Auto-chiudi alert se conflicts risolti
          setConflictsAlert({
            open: false,
            conflicts: []
          });
        }
      } catch (error: any) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('[Conflict Check] Error:', error);
        // Silent fail - non bloccare il form
      } finally {
        setCheckingConflicts(false);
      }
    };

    // Debounce check per evitare troppi requests
    const timer = setTimeout(checkConflicts, 500);
    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [eventDate, allDay, startTime, endTime]);

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
    onSuccess: (jobId: string) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast({
        title: 'Lavoro creato!',
        description: 'Il nuovo lavoro è stato creato con successo.'
      });
      form.reset();
      setSelectedClienti([]);
      onClose();
      
      // Redirect automatico a JobDetailPage
      navigate(`/admin/jobs/${jobId}`);
    },
    onError: (error: any) => {
      toast({
        title: 'Errore',
        description: error.message || 'Errore durante la creazione del lavoro.',
        variant: 'destructive'
      });
    }
  });
  
  const onSubmit = async (data: FormData) => {
    await createMutation.mutateAsync(data);
  };

  const handleClose = () => {
    form.reset();
    setSelectedClienti([]);
    onClose();
  };
  
  return (
    <>
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
                        aria-label="Rimuovi cliente"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveCliente(cliente.id);
                        }}
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
                    <FormLabel htmlFor="job-type-select">Tipo Lavoro *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={loadingJobTypes}
                    >
                      <FormControl>
                        <SelectTrigger 
                          id="job-type-select"
                          data-testid="select-job-type"
                          aria-label="Tipo Lavoro"
                        >
                          <SelectValue placeholder={loadingJobTypes ? 'Caricamento...' : 'Seleziona tipo...'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {orderedJobTypes.map(jobType => (
                          <SelectItem 
                            key={jobType.id} 
                            value={jobType.slug}
                          >
                            {jobType.icona} {jobType.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      Usa ↑↓ per navigare, Enter per selezionare
                    </FormDescription>
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
                    <FormLabel htmlFor="provenance-select">Provenienza *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={loadingProvenances}
                    >
                      <FormControl>
                        <SelectTrigger 
                          id="provenance-select"
                          data-testid="select-provenance"
                          aria-label="Provenienza"
                        >
                          <SelectValue placeholder={loadingProvenances ? 'Caricamento...' : 'Seleziona...'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {orderedProvenances.map(prov => (
                          <SelectItem 
                            key={prov.id} 
                            value={prov.slug}
                          >
                            {prov.icona} {prov.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      Usa ↑↓ per navigare, Enter per selezionare
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Data evento - keyboard + calendar input */}
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
                      data-testid="input-event-date"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Digita direttamente gg/mm/aaaa oppure usa il calendario
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* All day + orari */}
            <div className="space-y-4">
              {checkingConflicts && (
                <div className="text-xs text-muted-foreground">Controllo conflitti…</div>
              )}
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
                  <FormLabel>Location Evento</FormLabel>
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

            {/* Rito/Celebrazione */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="rituLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Luogo Rito/Celebrazione</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="es. Chiesa San Giuseppe"
                        {...field}
                        data-testid="input-ritu-location"
                      />
                    </FormControl>
                    <FormMessage />
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
                      <Input
                        type="time"
                        {...field}
                        data-testid="input-ritu-time"
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

    {/* Alert Dialog Conflitti */}
    <AlertDialog open={conflictsAlert.open} onOpenChange={(open) => setConflictsAlert(prev => ({ ...prev, open }))}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            Conflitti Calendario Rilevati
          </AlertDialogTitle>
          <AlertDialogDescription>
            Sono stati trovati {conflictsAlert.conflicts.length} {conflictsAlert.conflicts.length === 1 ? 'evento' : 'eventi'} 
            {' '}che si sovrappongono con la data/orario selezionato:
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Lista conflitti */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {conflictsAlert.conflicts.map((conflict, index) => (
            <div
              key={index}
              className="p-3 border rounded-lg bg-amber-50 dark:bg-amber-950/20"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="font-medium text-sm">
                    {conflict.type === 'calendar' ? '📅' : '📸'} {conflict.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(conflict.start).toLocaleString('it-IT', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: conflict.allDay ? undefined : '2-digit',
                      minute: conflict.allDay ? undefined : '2-digit'
                    })}
                    {' → '}
                    {new Date(conflict.end).toLocaleString('it-IT', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: conflict.allDay ? undefined : '2-digit',
                      minute: conflict.allDay ? undefined : '2-digit'
                    })}
                  </p>
                  {conflict.clientName && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Cliente: {conflict.clientName}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConflictsAlert({ open: false, conflicts: [] })}>
            Cambia Data
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => setConflictsAlert({ open: false, conflicts: [] })}
            className="bg-amber-600 hover:bg-amber-700"
          >
            Continua Comunque
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
