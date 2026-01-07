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
import { TimeInput } from '@/components/ui/time-input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, Loader2, X, User, AlertTriangle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { JobTypeIcon } from '@/lib/job-type-icons';
import type { AppuntamentoCliente } from '@shared/jobs-types';

// Helper per formattare date in modo sicuro (gestisce null/undefined/invalid)
const formatConflictDate = (dateStr: string | undefined, allDay: boolean = false): string => {
  if (!dateStr) return 'Data non disponibile';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Data non valida';
    return date.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: allDay ? undefined : '2-digit',
      minute: allDay ? undefined : '2-digit'
    });
  } catch {
    return 'Data non valida';
  }
};

const formSchema = z.object({
  nomeEvento: z.string().min(2, 'Nome evento troppo corto'),
  clientiIds: z.array(z.string()).min(1, 'Seleziona almeno un cliente'),
  jobType: z.string().min(1, 'Seleziona un tipo lavoro'),
  dataNonDefinita: z.boolean().default(false),
  eventDate: z.date().optional(),
  allDay: z.boolean(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  eventLocation: z.string().optional(),
  locationCerimonia: z.string().optional(),
  oraCerimonia: z.string().optional(),
  provenance: z.string().min(1, 'Seleziona una provenienza'),
  noteInterne: z.string().optional()
}).refine((data) => {
  // Se data non definita, salta validazione data e orari
  if (data.dataNonDefinita) return true;
  // Altrimenti data è obbligatoria
  if (!data.eventDate) return false;
  return true;
}, {
  message: 'Data evento obbligatoria (o seleziona "Data non definita")',
  path: ['eventDate']
}).refine((data) => {
  // Se data non definita o tutto il giorno, salta validazione orari
  if (data.dataNonDefinita || data.allDay) return true;
  if (!data.startTime || !data.endTime) return false;
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
  const [appuntamentiClienti, setAppuntamentiClienti] = useState<Record<string, { orario: string; note: string }>>({});
  const [detectedConflicts, setDetectedConflicts] = useState<Array<{
    type: 'calendar' | 'booking';
    title: string;
    start: string;
    end: string;
    allDay?: boolean;
    clientName?: string;
  }>>([]);
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
    if (!job.eventDate) return undefined;
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
      dataNonDefinita: job.dataNonDefinita || false,
      eventDate: getEventDate(),
      allDay: job.allDay || false,
      startTime: job.startTime || '',
      endTime: job.endTime || '',
      provenance: job.provenance || '',
      eventLocation: job.eventLocation || '',
      locationCerimonia: (job as any).locationCerimonia || (job as any).rituLocation || '',
      oraCerimonia: (job as any).oraCerimonia || (job as any).rituTime || '',
      noteInterne: job.noteInterne || ''
    }
  });

  const dataNonDefinita = form.watch('dataNonDefinita');
  const allDay = form.watch('allDay');
  const eventDate = form.watch('eventDate');
  const startTime = form.watch('startTime');
  const endTime = form.watch('endTime');

  // Fetch clienti iniziali e inizializza appuntamenti
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
        
        // Inizializza appuntamenti dal job esistente
        if (job.appuntamentiClienti && job.appuntamentiClienti.length > 0) {
          const appuntamentiMap: Record<string, { orario: string; note: string }> = {};
          job.appuntamentiClienti.forEach(app => {
            appuntamentiMap[app.clienteId] = {
              orario: app.orarioAppuntamento || '',
              note: app.noteAppuntamento || ''
            };
          });
          setAppuntamentiClienti(appuntamentiMap);
        } else {
          setAppuntamentiClienti({});
        }
      } catch (error) {
        console.error('Error fetching clienti:', error);
      } finally {
        setLoadingClienti(false);
      }
    };

    if (open && job.clientiIds?.length > 0) {
      fetchClienti();
    }
  }, [open, job.clientiIds, job.appuntamentiClienti]);

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
          setDetectedConflicts(data.conflicts);
        } else {
          setDetectedConflicts([]);
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
    // Rimuovi anche l'appuntamento associato
    const newAppuntamenti = { ...appuntamentiClienti };
    delete newAppuntamenti[clienteId];
    setAppuntamentiClienti(newAppuntamenti);
  };

  const handleAppuntamentoChange = (clienteId: string, field: 'orario' | 'note', value: string) => {
    setAppuntamentiClienti(prev => ({
      ...prev,
      [clienteId]: {
        ...prev[clienteId],
        [field]: value
      }
    }));
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
      
      // Converti appuntamentiClienti da oggetto a array
      const appuntamenti: AppuntamentoCliente[] = Object.entries(appuntamentiClienti)
        .filter(([_, val]) => val.orario) // Solo se ha un orario
        .map(([clienteId, val]) => ({
          clienteId,
          orarioAppuntamento: val.orario,
          ...(val.note && { noteAppuntamento: val.note })
        }));
      
      await updateJob(job.id, {
        nomeEvento: data.nomeEvento,
        clientiIds: data.clientiIds,
        jobType: data.jobType,
        dataNonDefinita: data.dataNonDefinita,
        eventDate: data.dataNonDefinita ? undefined : data.eventDate,
        allDay: data.allDay,
        startTime: data.startTime,
        endTime: data.endTime,
        eventLocation: data.eventLocation,
        locationCerimonia: data.locationCerimonia,
        oraCerimonia: data.oraCerimonia,
        provenance: data.provenance,
        noteInterne: data.noteInterne,
        appuntamentiClienti: appuntamenti.length > 0 ? appuntamenti : undefined
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
        <DialogContent className="w-[95vw] max-w-3xl h-[90vh] sm:h-auto max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-4 border-b">
            <DialogTitle className="text-lg sm:text-xl">Modifica Lavoro</DialogTitle>
            <DialogDescription className="text-sm">
              Aggiorna i dettagli del lavoro "{job.nomeEvento}"
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 sm:space-y-6" id="edit-job-form">
                {/* Nome Evento */}
              <FormField
                control={form.control}
                name="nomeEvento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm sm:text-base">Nome Evento *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="es. Matrimonio Sara e Luca"
                        data-testid="input-nome-evento"
                        className="text-sm sm:text-base"
                      />
                    </FormControl>
                    <FormMessage className="text-xs sm:text-sm" />
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
                          <div className="space-y-3 mt-2">
                            {selectedClienti.map((cliente) => (
                              <div
                                key={cliente.id}
                                className="p-3 border rounded-lg bg-muted/30"
                                data-testid={`cliente-appuntamento-${cliente.id}`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <User className="w-4 h-4 text-muted-foreground" />
                                    <span className="font-medium">{cliente.nome} {cliente.cognome}</span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-auto p-1 hover:bg-transparent text-muted-foreground hover:text-destructive"
                                    onClick={() => handleRemoveCliente(cliente.id)}
                                    data-testid={`button-remove-${cliente.id}`}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <TimeInput
                                    placeholder="Orario appuntamento"
                                    value={appuntamentiClienti[cliente.id]?.orario || ''}
                                    onChange={(e) => handleAppuntamentoChange(cliente.id, 'orario', e.target.value)}
                                    className="h-8"
                                    data-testid={`input-orario-${cliente.id}`}
                                  />
                                  <Input
                                    type="text"
                                    placeholder="Note (es. indirizzo, citofono...)"
                                    value={appuntamentiClienti[cliente.id]?.note || ''}
                                    onChange={(e) => handleAppuntamentoChange(cliente.id, 'note', e.target.value)}
                                    className="h-8"
                                    data-testid={`input-note-${cliente.id}`}
                                  />
                                </div>
                              </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <FormField
                  control={form.control}
                  name="jobType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm sm:text-base">Tipo Lavoro *</FormLabel>
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
                              <span className="flex items-center gap-2">
                                <JobTypeIcon slug={type.slug} size="sm" />
                                {type.nome}
                              </span>
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

              {/* Opzione Data Non Definita */}
              <FormField
                control={form.control}
                name="dataNonDefinita"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between p-4 border rounded-lg bg-amber-50 border-amber-200">
                    <div>
                      <FormLabel>Data non definita</FormLabel>
                      <FormDescription className="text-xs">
                        Il cliente è in fase di trattativa, la data sarà definita in seguito
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          // Se attivo, resetta i campi data/orario
                          if (checked) {
                            form.setValue('eventDate', undefined);
                            form.setValue('allDay', true);
                            form.setValue('startTime', '');
                            form.setValue('endTime', '');
                            setDateInputValue('');
                          }
                        }}
                        data-testid="switch-data-non-definita"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Messaggio informativo quando data non definita */}
              {dataNonDefinita && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-700">
                    <strong>Lavoro in trattativa:</strong> Questo lavoro è salvato senza una data definita. 
                    Potrai aggiungere la data quando il cliente conferma.
                  </p>
                </div>
              )}

              {/* Data Evento - Solo se data è definita */}
              {!dataNonDefinita && (
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
              )}

              {/* All Day Switch - Solo se data è definita */}
              {!dataNonDefinita && (
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
              )}

              {/* Orari (condizionale) - Solo se data è definita e non tutto il giorno */}
              {!dataNonDefinita && !allDay && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm sm:text-base">Ora Inizio *</FormLabel>
                        <FormControl>
                          <TimeInput
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
                          <TimeInput
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

              {/* Location */}
              <FormField
                control={form.control}
                name="eventLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location Evento</FormLabel>
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

              {/* Rito/Cerimonia */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <FormField
                  control={form.control}
                  name="locationCerimonia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Luogo Rito/Cerimonia</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="es. Chiesa San Francesco"
                          data-testid="input-location-cerimonia"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="oraCerimonia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Orario Cerimonia</FormLabel>
                      <FormControl>
                        <TimeInput
                          {...field}
                          data-testid="input-ora-cerimonia"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Note Interne */}
              <FormField
                control={form.control}
                name="noteInterne"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Note Interne</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder="Note private visibili solo in admin..."
                        data-testid="textarea-note"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

                {/* Avviso conflitti inline */}
                {checkingConflicts && (
                  <div className="flex items-center gap-2 text-sm text-amber-600 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifica disponibilità calendario...
                  </div>
                )}

                {!checkingConflicts && detectedConflicts.length > 0 && (
                  <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg space-y-3">
                    <div className="flex items-center gap-2 text-amber-700 font-medium">
                      <AlertTriangle className="w-5 h-5" />
                      <span>
                        {detectedConflicts.length} {detectedConflicts.length === 1 ? 'conflitto rilevato' : 'conflitti rilevati'}
                      </span>
                    </div>
                    <div className="space-y-2 max-h-[150px] overflow-y-auto">
                      {detectedConflicts.map((conflict, index) => (
                        <div
                          key={index}
                          className="p-2 bg-white rounded border border-amber-200 text-sm"
                        >
                          <p className="font-medium text-gray-800">
                            {conflict.type === 'calendar' ? '📅' : '📸'} {conflict.title}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            {formatConflictDate(conflict.start, conflict.allDay)}
                            {' → '}
                            {formatConflictDate(conflict.end, conflict.allDay)}
                          </p>
                          {conflict.clientName && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              Cliente: {conflict.clientName}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-amber-600">
                      Puoi comunque salvare le modifiche, ma verifica che non ci siano sovrapposizioni indesiderate.
                    </p>
                  </div>
                )}
              </form>
            </Form>
          </div>
          <div className="px-4 sm:px-6 py-4 border-t bg-gray-50 dark:bg-gray-900 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={updateMutation.isPending}
              data-testid="button-cancel"
              className="flex-1 sm:flex-initial"
            >
              Annulla
            </Button>
            <Button
              type="submit"
              form="edit-job-form"
              disabled={updateMutation.isPending || checkingConflicts}
              data-testid="button-save"
              className="flex-1 sm:flex-initial"
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salva
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
