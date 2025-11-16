/**
 * EDIT JOB MODAL
 * Form modifica job esistente
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { updateJob } from '@/lib/jobs';
import { getJobTypes } from '@/lib/job-types';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useJobEntity } from '@/hooks/useJobEntity';
import { ClientAutocomplete } from '@/components/clienti/ClientAutocomplete';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { Job } from '@shared/jobs-types';
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
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, Loader2, X, User, AlertTriangle } from 'lucide-react';
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

interface EditJobModalProps {
  open: boolean;
  onClose: () => void;
  job: Job;
}

export default function EditJobModal({ open, onClose, job }: EditJobModalProps) {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [dateInputValue, setDateInputValue] = useState('');
  const [selectedClienti, setSelectedClienti] = useState<Cliente[]>([]);
  const [loadingClienti, setLoadingClienti] = useState(true);
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
  
  // Converti eventDate da Timestamp a Date (gestisce Firestore Timestamp, Date, string)
  const getEventDate = () => {
    if (!job.eventDate) return new Date();
    const ed = job.eventDate as any;
    if (typeof ed.toDate === 'function') return ed.toDate();
    if (ed instanceof Date) return ed;
    return new Date(ed);
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nomeEvento: job.nomeEvento || '',
      clientiIds: job.clientiIds || [],
      jobType: job.jobType || '',
      eventDate: getEventDate(),
      allDay: job.allDay || false,
      startTime: job.startTime || '',
      endTime: job.endTime || '',
      provenance: job.provenance || '',
      eventLocation: job.eventLocation || '',
      noteInterne: job.noteInterne || ''
    }
  });

  const allDay = form.watch('allDay');
  const eventDate = form.watch('eventDate');
  const startTime = form.watch('startTime');
  const endTime = form.watch('endTime');

  // Fetch clienti iniziali
  useEffect(() => {
    const fetchClienti = async () => {
      try {
        setLoadingClienti(true);
        const clientiData: Cliente[] = [];
        
        for (const clienteId of job.clientiIds || []) {
          const clienteDoc = await getDoc(doc(db, 'clienti', clienteId));
          if (clienteDoc.exists()) {
            clientiData.push({ id: clienteDoc.id, ...clienteDoc.data() } as Cliente);
          }
        }
        
        setSelectedClienti(clientiData);
      } catch (error) {
        console.error('Error fetching clienti:', error);
      } finally {
        setLoadingClienti(false);
      }
    };

    if (open && job.clientiIds?.length > 0) {
      fetchClienti();
    }
  }, [open, job.clientiIds]);

  // Sync dateInputValue when eventDate changes
  useEffect(() => {
    if (eventDate) {
      const day = String(eventDate.getDate()).padStart(2, '0');
      const month = String(eventDate.getMonth() + 1).padStart(2, '0');
      const year = eventDate.getFullYear();
      setDateInputValue(`${day}/${month}/${year}`);
    } else {
      setDateInputValue('');
    }
  }, [eventDate]);

  // Auto-check calendar conflicts
  useEffect(() => {
    if (!eventDate) return;

    const checkConflicts = async () => {
      try {
        setCheckingConflicts(true);
        
        const year = eventDate.getFullYear();
        const month = String(eventDate.getMonth() + 1).padStart(2, '0');
        const day = String(eventDate.getDate()).padStart(2, '0');
        const eventDateStr = `${year}-${month}-${day}`;
        
        const params = new URLSearchParams({
          eventDate: eventDateStr,
          allDay: String(allDay),
          excludeJobId: job.id
        });
        
        if (!allDay && startTime && endTime) {
          params.append('startTime', startTime);
          params.append('endTime', endTime);
        }
        
        const response = await fetch(`/api/jobs/check-calendar?${params.toString()}`);
        const data = await response.json();
        
        if (data.hasConflicts && data.conflicts.length > 0) {
          setConflictsAlert({
            open: true,
            conflicts: data.conflicts
          });
        } else {
          setConflictsAlert({
            open: false,
            conflicts: []
          });
        }
      } catch (error) {
        console.error('[Conflict Check] Error:', error);
      } finally {
        setCheckingConflicts(false);
      }
    };

    const timer = setTimeout(checkConflicts, 500);
    return () => clearTimeout(timer);
  }, [eventDate, allDay, startTime, endTime, job.id]);

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

  // Date input handlers
  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDateInputValue(value);
    
    const parts = value.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        const date = new Date(year, month, day);
        if (date.getDate() === day && date.getMonth() === month && date.getFullYear() === year) {
          form.setValue('eventDate', date);
        }
      }
    }
  };

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!user) throw new Error('User not authenticated');
      
      await updateJob(job.id, {
        nomeEvento: data.nomeEvento,
        clientiIds: data.clientiIds,
        jobType: data.jobType,
        eventDate: data.eventDate,
        allDay: data.allDay,
        startTime: data.startTime,
        endTime: data.endTime,
        eventLocation: data.eventLocation,
        provenance: data.provenance,
        noteInterne: data.noteInterne
      }, user.uid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['jobs', job.id], exact: true });
      toast({
        title: 'Lavoro aggiornato',
        description: 'Le modifiche sono state salvate con successo'
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: 'Errore',
        description: error instanceof Error ? error.message : 'Impossibile aggiornare il lavoro',
        variant: 'destructive'
      });
    }
  });

  const handleSubmit = (data: FormData) => {
    updateMutation.mutate(data);
  };

  if (!open) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifica Lavoro</DialogTitle>
            <DialogDescription>
              Aggiorna i dettagli del lavoro "{job.nomeEvento}"
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              {/* Nome Evento */}
              <FormField
                control={form.control}
                name="nomeEvento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Evento *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="es. Matrimonio Sara e Luca"
                        data-testid="input-nome-evento"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Multi-client selector */}
              <FormField
                control={form.control}
                name="clientiIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clienti *</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <ClientAutocomplete
                          onSelect={handleAddCliente}
                          placeholder="Cerca e aggiungi cliente..."
                        />
                        
                        {loadingClienti && (
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Caricamento clienti...
                          </div>
                        )}
                        
                        {!loadingClienti && selectedClienti.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {selectedClienti.map((cliente) => (
                              <Badge
                                key={cliente.id}
                                variant="secondary"
                                className="pl-3 pr-1 py-1"
                                data-testid={`badge-cliente-${cliente.id}`}
                              >
                                <User className="h-3 w-3 mr-1" />
                                {cliente.nome} {cliente.cognome}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCliente(cliente.id)}
                                  className="ml-2 hover:bg-gray-200 rounded-full p-1"
                                  data-testid={`remove-cliente-${cliente.id}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormDescription>
                      Aggiungi uno o più clienti (es. sposi)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Tipo e Provenienza */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="jobType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo Lavoro *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={loadingJobTypes}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-job-type">
                            <SelectValue placeholder={loadingJobTypes ? 'Caricamento...' : 'Seleziona tipo...'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {jobTypes.map((type) => (
                            <SelectItem
                              key={type.id}
                              value={type.slug}
                              data-testid={`option-type-${type.slug}`}
                            >
                              {type.icona} {type.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="provenance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provenienza *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={loadingProvenances}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-provenance">
                            <SelectValue placeholder={loadingProvenances ? 'Caricamento...' : 'Seleziona...'} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {provenances.map((prov) => (
                            <SelectItem
                              key={prov.id}
                              value={prov.slug}
                              data-testid={`option-provenance-${prov.slug}`}
                            >
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

              {/* Data Evento */}
              <FormField
                control={form.control}
                name="eventDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data Evento *</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          value={dateInputValue}
                          onChange={handleDateInputChange}
                          placeholder="gg/mm/aaaa"
                          className="flex-1"
                          data-testid="input-event-date-manual"
                        />
                      </FormControl>
                      <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-calendar-picker"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
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
                    </div>
                    <FormDescription>
                      Digita o usa il calendario
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* All Day Switch */}
              <FormField
                control={form.control}
                name="allDay"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Evento Giornata Intera</FormLabel>
                      <FormDescription>
                        Disabilita se l'evento ha orari specifici
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

              {/* Orari (condizionale) */}
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
                            {...field}
                            type="time"
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
                            {...field}
                            type="time"
                            data-testid="input-end-time"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Location */}
              <FormField
                control={form.control}
                name="eventLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="es. Casale dei Baroni"
                        data-testid="input-location"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Note Interne */}
              <FormField
                control={form.control}
                name="noteInterne"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Note Interne</FormLabel>
                    <FormControl>
                      <RichTextEditor
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Note private visibili solo in admin..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Conflict Warning */}
              {checkingConflicts && (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifica disponibilità...
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={updateMutation.isPending}
                  data-testid="button-cancel"
                >
                  Annulla
                </Button>
                <Button
                  type="submit"
                  disabled={updateMutation.isPending || checkingConflicts}
                  data-testid="button-save"
                >
                  {updateMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Salva Modifiche
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Conflicts Alert Dialog */}
      <AlertDialog
        open={conflictsAlert.open}
        onOpenChange={(open) => setConflictsAlert({ ...conflictsAlert, open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Conflitti di Calendario
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ci sono eventi già programmati in questo slot orario:
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {conflictsAlert.conflicts.map((conflict, idx) => (
              <div
                key={idx}
                className="border rounded-lg p-3 bg-amber-50"
              >
                <div className="font-medium text-sm">{conflict.title}</div>
                <div className="text-xs text-gray-600 mt-1">
                  {conflict.type === 'calendar' ? '📅 Google Calendar' : '📝 Prenotazione'}
                  {conflict.clientName && ` • ${conflict.clientName}`}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {conflict.start}{conflict.end ? ` - ${conflict.end}` : ''}
                  {conflict.allDay && ' (Tutto il giorno)'}
                </div>
              </div>
            ))}
          </div>

          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setConflictsAlert({ open: false, conflicts: [] })}>
              Ho capito
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
