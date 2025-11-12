
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { Calendar as CalendarIcon, Plus, Link as LinkIcon, Mail, Loader2, Filter, X, Edit, Trash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { ClientAutocomplete } from '@/components/clienti/ClientAutocomplete';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Consultation } from '@shared/consultation-types';
import type { Job } from '@shared/jobs-types';
import type { Cliente } from '@shared/clienti-types';
import { getAllClienti } from '@/lib/clienti';

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  type: 'google' | 'consultation' | 'job';
  entityId?: string;
  clienteEmail?: string;
  clienteNome?: string;
  googleEventId?: string;
  description?: string;
  location?: string;
}

export default function CalendarioManager() {
  const { toast } = useToast();
  const { user } = useFirebaseAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'day'>('month');
  const [filterType, setFilterType] = useState<'all' | 'google' | 'consultation' | 'job'>('all');
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [isEditEventOpen, setIsEditEventOpen] = useState(false);
  const [isDeleteEventOpen, setIsDeleteEventOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Form state per nuovo evento
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    location: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '09:00',
    endTime: '10:00',
    clienteId: '',
    linkType: '' as 'booking' | 'consultation' | 'job' | '',
    linkEntityId: '',
    notifyCliente: false,
  });

  // Form state per edit evento
  const [editEvent, setEditEvent] = useState({
    title: '',
    description: '',
    location: '',
    date: '',
    startTime: '',
    endTime: '',
    clienteId: '',
    notifyCliente: false,
  });

  // Fetch Google Calendar events
  const { data: googleEvents = [], isLoading: loadingGoogle } = useQuery<any[]>({
    queryKey: ['calendar-events', selectedDate.getFullYear(), selectedDate.getMonth()],
    queryFn: async () => {
      const start = startOfMonth(selectedDate);
      const end = endOfMonth(selectedDate);
      
      console.log('[CalendarioManager] Fetching Google Calendar events:', {
        timeMin: start.toISOString(),
        timeMax: end.toISOString()
      });
      
      const response = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[CalendarioManager] Google Calendar fetch error:', errorText);
        throw new Error(`Errore caricamento eventi Google: ${errorText}`);
      }
      const events = await response.json();
      console.log('[CalendarioManager] Google Calendar events loaded:', events.length);
      return events;
    },
    enabled: !!user,
    retry: false,
  });

  

  // Fetch Consultations approvate
  const { data: consultations = [], isLoading: loadingConsultations } = useQuery<Consultation[]>({
    queryKey: ['consultations'],
    queryFn: async () => {
      console.log('[CalendarioManager] Fetching consultations...');
      const token = user ? await user.getIdToken() : '';
      const response = await fetch('/api/consultations', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        console.error('[CalendarioManager] Consultations fetch error:', response.status);
        throw new Error('Errore caricamento consulenze');
      }
      const data = await response.json();
      const approved = data.filter((c: Consultation) => c.stato === 'approvata' || c.stato === 'confermata');
      console.log('[CalendarioManager] Consultations loaded:', {
        total: data.length,
        approved: approved.length
      });
      return approved;
    },
    enabled: !!user,
    retry: false,
  });

  // Fetch Jobs confermati
  const { data: jobs = [], isLoading: loadingJobs } = useQuery<Job[]>({
    queryKey: ['jobs'],
    queryFn: async () => {
      console.log('[CalendarioManager] Fetching jobs...');
      const response = await fetch('/api/jobs');
      if (!response.ok) {
        console.error('[CalendarioManager] Jobs fetch error:', response.status);
        throw new Error('Errore caricamento jobs');
      }
      const data = await response.json();
      const active = data.filter((j: Job) => 
        j.status !== 'lead' && j.status !== 'annullato' && j.status !== 'archiviato'
      );
      console.log('[CalendarioManager] Jobs loaded:', {
        total: data.length,
        active: active.length
      });
      return active;
    },
    enabled: !!user,
    retry: false,
  });

  // Fetch Clienti
  const { data: clienti = [] } = useQuery<Cliente[]>({
    queryKey: ['clienti'],
    queryFn: getAllClienti,
    enabled: !!user,
  });

  // Debug stato caricamento
  useEffect(() => {
    console.log('[CalendarioManager] Data loading state:', {
      user: !!user,
      loadingGoogle,
      loadingConsultations,
      loadingJobs,
      googleEvents: googleEvents.length,
      consultations: consultations.length,
      jobs: jobs.length
    });
  }, [user, loadingGoogle, loadingConsultations, loadingJobs, googleEvents, consultations, jobs]);

  // Converti eventi in formato unificato
  const allEvents = useMemo<CalendarEvent[]>(() => {
    const events: CalendarEvent[] = [];
    console.log('[CalendarioManager] Building allEvents from:', {
      googleEvents: googleEvents.length,
      consultations: consultations.length,
      jobs: jobs.length
    });

    // Google Calendar Events
    googleEvents.forEach((event: any) => {
      const start = event.start?.dateTime ? parseISO(event.start.dateTime) : parseISO(event.start.date);
      const end = event.end?.dateTime ? parseISO(event.end.dateTime) : parseISO(event.end.date);

      events.push({
        id: `google-${event.id}`,
        title: event.summary || 'Evento senza titolo',
        start,
        end,
        type: 'google',
        googleEventId: event.id,
        description: event.description,
        location: event.location,
      });
    });

    // Consultations
    consultations.forEach((consultation: Consultation) => {
      try {
        const start = consultation.dataConsulenza?.toDate ? consultation.dataConsulenza.toDate() : new Date(consultation.dataConsulenza as any);
        // Calcola end basandosi su orarioFine
        const end = new Date(start);
        const [hours, minutes] = consultation.orarioFine.split(':');
        end.setHours(parseInt(hours), parseInt(minutes));

      events.push({
          id: `consultation-${consultation.id}`,
          title: `💼 Consulenza - ${consultation.cliente.nome} ${consultation.cliente.cognome}`,
          start,
          end,
          type: 'consultation',
          entityId: consultation.id,
          clienteEmail: consultation.cliente.email,
          clienteNome: `${consultation.cliente.nome} ${consultation.cliente.cognome}`,
        });
      } catch (error) {
        console.error('[CalendarioManager] Error parsing consultation:', consultation.id, error);
      }
    });

    // Jobs
    jobs.forEach((job: Job) => {
      try {
        const start = job.eventDate?.toDate ? job.eventDate.toDate() : new Date(job.eventDate as any);
        const end = new Date(start);
        if (job.endTime) {
          const [hours, minutes] = job.endTime.split(':');
          end.setHours(parseInt(hours), parseInt(minutes));
        } else {
          end.setHours(start.getHours() + 2); // Default 2 ore
        }

      // Trova nomi clienti
      const clienteNomi = job.clientiIds
        .map(id => {
          const cliente = clienti.find(c => c.id === id);
          return cliente ? `${cliente.nome} ${cliente.cognome}` : null;
        })
        .filter(Boolean)
        .join(', ');

      events.push({
          id: `job-${job.id}`,
          title: `🎯 ${job.nomeEvento}${clienteNomi ? ` - ${clienteNomi}` : ''}`,
          start,
          end,
          type: 'job',
          entityId: job.id,
          clienteNome: clienteNomi,
        });
      } catch (error) {
        console.error('[CalendarioManager] Error parsing job:', job.id, error);
      }
    });

    console.log('[CalendarioManager] Total events built:', events.length);
    return events;
  }, [googleEvents, consultations, jobs, clienti]);

  // Filtra eventi per tipo
  const filteredEvents = useMemo(() => {
    if (filterType === 'all') return allEvents;
    return allEvents.filter(e => e.type === filterType);
  }, [allEvents, filterType]);

  // Eventi per giorno selezionato
  const eventsForSelectedDate = useMemo(() => {
    return filteredEvents.filter(event => isSameDay(event.start, selectedDate));
  }, [filteredEvents, selectedDate]);

  // Crea nuovo evento Google Calendar
  const createEventMutation = useMutation({
    mutationFn: async (data: typeof newEvent) => {
      const startDateTime = new Date(`${data.date}T${data.startTime}`);
      const endDateTime = new Date(`${data.date}T${data.endTime}`);

      const response = await fetch('/api/calendar/create-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: data.title,
          description: data.description,
          location: data.location,
          start: startDateTime.toISOString(),
          end: endDateTime.toISOString(),
          attendees: data.clienteId && data.notifyCliente
            ? [clienti.find(c => c.id === data.clienteId)?.email].filter(Boolean)
            : [],
        }),
      });

      if (!response.ok) throw new Error('Errore creazione evento');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      setIsCreateEventOpen(false);
      toast({
        title: 'Evento creato',
        description: 'L\'evento è stato aggiunto al calendario',
      });
      // Reset form
      setNewEvent({
        title: '',
        description: '',
        location: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        startTime: '09:00',
        endTime: '10:00',
        clienteId: '',
        linkType: '',
        linkEntityId: '',
        notifyCliente: false,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreateEvent = () => {
    if (!newEvent.title) {
      toast({
        title: 'Errore',
        description: 'Il titolo è obbligatorio',
        variant: 'destructive',
      });
      return;
    }

    createEventMutation.mutate(newEvent);
  };

  // Aggiorna evento Google Calendar
  const updateEventMutation = useMutation({
    mutationFn: async (data: typeof editEvent & { eventId: string }) => {
      const startDateTime = new Date(`${data.date}T${data.startTime}`);
      const endDateTime = new Date(`${data.date}T${data.endTime}`);

      const response = await fetch('/api/calendar/update-event', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: data.eventId,
          summary: data.title,
          description: data.description,
          location: data.location,
          start: startDateTime.toISOString(),
          end: endDateTime.toISOString(),
          attendees: data.clienteId && data.notifyCliente
            ? [clienti.find(c => c.id === data.clienteId)?.email].filter(Boolean)
            : [],
        }),
      });

      if (!response.ok) throw new Error('Errore aggiornamento evento');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      setIsEditEventOpen(false);
      setSelectedEvent(null);
      toast({
        title: 'Evento aggiornato',
        description: 'L\'evento è stato modificato con successo',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Elimina evento Google Calendar
  const deleteEventMutation = useMutation({
    mutationFn: async (data: { eventId: string; attendees: string[] }) => {
      const response = await fetch(`/api/calendar/delete-event/${data.eventId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendees: data.attendees }),
      });

      if (!response.ok) throw new Error('Errore eliminazione evento');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      setIsDeleteEventOpen(false);
      setSelectedEvent(null);
      toast({
        title: 'Evento eliminato',
        description: 'L\'evento è stato rimosso dal calendario',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleEditEvent = (event: CalendarEvent) => {
    if (event.type !== 'google') {
      toast({
        title: 'Non modificabile',
        description: 'Puoi modificare solo eventi creati da Google Calendar',
        variant: 'destructive',
      });
      return;
    }

    setSelectedEvent(event);
    setEditEvent({
      title: event.title,
      description: event.description || '',
      location: event.location || '',
      date: format(event.start, 'yyyy-MM-dd'),
      startTime: format(event.start, 'HH:mm'),
      endTime: format(event.end, 'HH:mm'),
      clienteId: '',
      notifyCliente: false,
    });
    setIsEditEventOpen(true);
  };

  const handleUpdateEvent = () => {
    if (!editEvent.title || !selectedEvent) {
      toast({
        title: 'Errore',
        description: 'Il titolo è obbligatorio',
        variant: 'destructive',
      });
      return;
    }

    updateEventMutation.mutate({
      ...editEvent,
      eventId: selectedEvent.googleEventId!,
    });
  };

  const handleDeleteEvent = (event: CalendarEvent) => {
    if (event.type !== 'google') {
      toast({
        title: 'Non eliminabile',
        description: 'Puoi eliminare solo eventi creati da Google Calendar',
        variant: 'destructive',
      });
      return;
    }

    setSelectedEvent(event);
    setIsDeleteEventOpen(true);
  };

  const confirmDeleteEvent = () => {
    if (!selectedEvent) return;

    deleteEventMutation.mutate({
      eventId: selectedEvent.googleEventId!,
      attendees: selectedEvent.clienteEmail ? [selectedEvent.clienteEmail] : [],
    });
  };

  const getEventTypeColor = (type: CalendarEvent['type']) => {
    switch (type) {
      case 'google': return 'bg-blue-500';
      case 'consultation': return 'bg-green-500';
      case 'job': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const getEventTypeBadge = (type: CalendarEvent['type']) => {
    switch (type) {
      case 'google': return <Badge variant="outline">Google Calendar</Badge>;
      case 'consultation': return <Badge variant="outline" className="bg-green-50">Consulenza</Badge>;
      case 'job': return <Badge variant="outline" className="bg-orange-50">Job</Badge>;
    }
  };

  const isLoading = loadingGoogle || loadingConsultations || loadingJobs;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-blue-gray">Calendario Impegni</h2>
          <p className="text-sm text-muted-foreground">
            Visualizza tutti gli eventi da Google Calendar, Booking, Consulenze e Jobs
          </p>
        </div>

        <div className="flex gap-2">
          <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtra per tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli eventi</SelectItem>
              <SelectItem value="google">Google Calendar</SelectItem>
              <SelectItem value="consultation">Consulenze</SelectItem>
              <SelectItem value="job">Jobs</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={() => setIsCreateEventOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuovo Evento
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Google Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allEvents.filter(e => e.type === 'google').length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Consulenze</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allEvents.filter(e => e.type === 'consultation').length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allEvents.filter(e => e.type === 'job').length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Calendario e Lista Eventi */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendario */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Seleziona Data</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              locale={it}
              className="rounded-md border"
              modifiers={{
                hasEvents: (date) => filteredEvents.some(e => isSameDay(e.start, date)),
              }}
              modifiersStyles={{
                hasEvents: { fontWeight: 'bold', textDecoration: 'underline' },
              }}
            />
          </CardContent>
        </Card>

        {/* Lista Eventi */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              Eventi del {format(selectedDate, 'dd MMMM yyyy', { locale: it })}
            </CardTitle>
            <CardDescription>
              {eventsForSelectedDate.length} {eventsForSelectedDate.length === 1 ? 'evento' : 'eventi'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-sage" />
              </div>
            ) : eventsForSelectedDate.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nessun evento per questa data
              </div>
            ) : (
              <div className="space-y-3">
                {eventsForSelectedDate
                  .sort((a, b) => a.start.getTime() - b.start.getTime())
                  .map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50 transition"
                    >
                      <div className={`w-1 h-full ${getEventTypeColor(event.type)} rounded`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getEventTypeBadge(event.type)}
                          <span className="text-xs text-muted-foreground">
                            {format(event.start, 'HH:mm')} - {format(event.end, 'HH:mm')}
                          </span>
                        </div>
                        <h4 className="font-medium">{event.title}</h4>
                        {event.clienteNome && (
                          <p className="text-sm text-muted-foreground">
                            Cliente: {event.clienteNome}
                          </p>
                        )}
                        {event.location && (
                          <p className="text-sm text-muted-foreground">
                            📍 {event.location}
                          </p>
                        )}
                        {event.description && (
                          <div 
                            className="text-sm text-muted-foreground mt-1 prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: event.description }}
                          />
                        )}
                      </div>
                      {event.type === 'google' && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditEvent(event)}
                            title="Modifica evento"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteEvent(event)}
                            title="Elimina evento"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog Modifica Evento */}
      <Dialog open={isEditEventOpen} onOpenChange={setIsEditEventOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifica Evento</DialogTitle>
            <DialogDescription>
              Modifica i dettagli dell'evento nel calendario
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Titolo *</Label>
              <Input
                id="edit-title"
                value={editEvent.title}
                onChange={(e) => setEditEvent({ ...editEvent, title: e.target.value })}
                placeholder="Es. Riunione con cliente"
              />
            </div>

            <div>
              <Label htmlFor="edit-description">Descrizione</Label>
              <Textarea
                id="edit-description"
                value={editEvent.description}
                onChange={(e) => setEditEvent({ ...editEvent, description: e.target.value })}
                placeholder="Dettagli evento..."
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="edit-location">Luogo</Label>
              <Input
                id="edit-location"
                value={editEvent.location}
                onChange={(e) => setEditEvent({ ...editEvent, location: e.target.value })}
                placeholder="Es. Studio fotografico"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="edit-date">Data</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editEvent.date}
                  onChange={(e) => setEditEvent({ ...editEvent, date: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-startTime">Ora Inizio</Label>
                <Input
                  id="edit-startTime"
                  type="time"
                  value={editEvent.startTime}
                  onChange={(e) => setEditEvent({ ...editEvent, startTime: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-endTime">Ora Fine</Label>
                <Input
                  id="edit-endTime"
                  type="time"
                  value={editEvent.endTime}
                  onChange={(e) => setEditEvent({ ...editEvent, endTime: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-cliente">Notifica Cliente (opzionale)</Label>
              <ClientAutocomplete
                value={editEvent.clienteId}
                onSelect={(cliente) => setEditEvent({ ...editEvent, clienteId: cliente?.id || '' })}
                placeholder="Seleziona cliente per notifica..."
              />
              {editEvent.clienteId && (
                <div className="flex items-center space-x-2 mt-2">
                  <input
                    type="checkbox"
                    id="edit-notifyCliente"
                    checked={editEvent.notifyCliente}
                    onChange={(e) => setEditEvent({ ...editEvent, notifyCliente: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="edit-notifyCliente" className="cursor-pointer">
                    Invia notifica email di modifica
                  </Label>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditEventOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleUpdateEvent} disabled={updateEventMutation.isPending}>
              {updateEventMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Aggiornamento...
                </>
              ) : (
                'Salva Modifiche'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Elimina Evento */}
      <Dialog open={isDeleteEventOpen} onOpenChange={setIsDeleteEventOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elimina Evento</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare questo evento? Questa azione non può essere annullata.
            </DialogDescription>
          </DialogHeader>

          {selectedEvent && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">{selectedEvent.title}</h4>
              <p className="text-sm text-muted-foreground">
                📅 {format(selectedEvent.start, 'dd MMMM yyyy', { locale: it })}
              </p>
              <p className="text-sm text-muted-foreground">
                🕐 {format(selectedEvent.start, 'HH:mm')} - {format(selectedEvent.end, 'HH:mm')}
              </p>
              {selectedEvent.clienteEmail && (
                <p className="text-sm text-muted-foreground mt-2">
                  ✉️ Verrà inviata email di cancellazione a: {selectedEvent.clienteEmail}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteEventOpen(false)}>
              Annulla
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteEvent}
              disabled={deleteEventMutation.isPending}
            >
              {deleteEventMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminazione...
                </>
              ) : (
                <>
                  <Trash className="mr-2 h-4 w-4" />
                  Elimina Evento
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Crea Evento */}
      <Dialog open={isCreateEventOpen} onOpenChange={setIsCreateEventOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crea Nuovo Evento</DialogTitle>
            <DialogDescription>
              Crea un nuovo evento nel calendario e associalo opzionalmente a clienti/entità
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Titolo *</Label>
              <Input
                id="title"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                placeholder="Es. Riunione con cliente"
              />
            </div>

            <div>
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                value={newEvent.description}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                placeholder="Dettagli evento..."
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="location">Luogo</Label>
              <Input
                id="location"
                value={newEvent.location}
                onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                placeholder="Es. Studio fotografico"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  type="date"
                  value={newEvent.date}
                  onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="startTime">Ora Inizio</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={newEvent.startTime}
                  onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="endTime">Ora Fine</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={newEvent.endTime}
                  onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="cliente">Cliente (opzionale)</Label>
              <ClientAutocomplete
                value={newEvent.clienteId}
                onSelect={(cliente) => setNewEvent({ ...newEvent, clienteId: cliente?.id || '' })}
                placeholder="Cerca cliente per nome o email..."
                enableQuickAdd={true}
              />
              {newEvent.clienteId && (() => {
                const selectedCliente = clienti.find(c => c.id === newEvent.clienteId);
                return selectedCliente ? (
                  <div className="mt-2 p-3 bg-sage/10 rounded-md border border-sage/20">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-full bg-sage/20 flex items-center justify-center">
                        <span className="text-sm font-semibold text-sage">
                          {selectedCliente.nome.charAt(0)}{selectedCliente.cognome.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{selectedCliente.nome} {selectedCliente.cognome}</p>
                        <p className="text-xs text-muted-foreground">{selectedCliente.email}</p>
                      </div>
                    </div>
                  </div>
                ) : null;
              })()}
            </div>

            {newEvent.clienteId && (
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="notifyCliente"
                  checked={newEvent.notifyCliente}
                  onChange={(e) => setNewEvent({ ...newEvent, notifyCliente: e.target.checked })}
                  className="rounded"
                />
                <Label htmlFor="notifyCliente" className="cursor-pointer">
                  Invia notifica email al cliente
                </Label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateEventOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleCreateEvent} disabled={createEventMutation.isPending}>
              {createEventMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creazione...
                </>
              ) : (
                'Crea Evento'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
