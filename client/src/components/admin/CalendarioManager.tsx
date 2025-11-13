import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Calendar as CalendarIcon,
  Plus,
  Filter,
  CalendarCheck,
  Briefcase,
  Users,
  Clock,
  MapPin,
  Mail,
  Loader2,
  Eye
} from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { ClientAutocomplete } from '@/components/clienti/ClientAutocomplete';
import type { Cliente } from '@shared/clienti-types';

interface CalendarEventDTO {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  type: 'google' | 'consulenza' | 'job';
  clientName?: string;
  clientEmail?: string;
  googleEventId?: string;
}

export default function CalendarioManager() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [eventTypeFilter, setEventTypeFilter] = useState<'all' | 'google' | 'consulenza' | 'job'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventDTO | null>(null);
  
  const safeParseISO = (dateString: string | undefined): Date | null => {
    if (!dateString || dateString.trim() === '') return null;
    try {
      const parsed = parseISO(dateString);
      return isNaN(parsed.getTime()) ? null : parsed;
    } catch {
      return null;
    }
  };
  
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDescription, setNewEventDescription] = useState('');
  const [newEventStartDate, setNewEventStartDate] = useState('');
  const [newEventStartTime, setNewEventStartTime] = useState('');
  const [newEventEndDate, setNewEventEndDate] = useState('');
  const [newEventEndTime, setNewEventEndTime] = useState('');
  const [newEventLocation, setNewEventLocation] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [sendNotification, setSendNotification] = useState(true);

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);

  const { data: eventsData, isLoading: eventsLoading } = useQuery<{ events: CalendarEventDTO[]; warnings?: string[] }>({
    queryKey: ['/api/calendar/events', monthStart.toISOString(), monthEnd.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: monthStart.toISOString(),
        endDate: monthEnd.toISOString()
      });
      const response = await fetch(`/api/calendar/events?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch calendar events');
      }
      const data = await response.json();
      
      if (data.warnings && data.warnings.length > 0) {
        data.warnings.forEach((warning: string) => {
          toast({
            title: 'Avviso',
            description: warning,
            variant: 'default',
          });
        });
      }
      
      return data;
    },
    enabled: true,
  });

  const createEventMutation = useMutation({
    mutationFn: async (eventData: {
      title: string;
      description?: string;
      start: string;
      end: string;
      location?: string;
      clienteId?: string;
      notifyCliente: boolean;
    }) => {
      return await apiRequest('POST', '/api/calendar/create-event', eventData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/events'] });
      toast({
        title: 'Evento creato',
        description: 'L\'evento è stato aggiunto al calendario con successo',
      });
      handleCloseCreateDialog();
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message || 'Impossibile creare l\'evento',
        variant: 'destructive',
      });
    },
  });

  const events = eventsData?.events || [];

  const eventsByType = useMemo(() => {
    return {
      google: events.filter(e => e.type === 'google').length,
      consulenza: events.filter(e => e.type === 'consulenza').length,
      job: events.filter(e => e.type === 'job').length,
    };
  }, [events]);

  const filteredEvents = useMemo(() => {
    let filtered = events;
    
    if (eventTypeFilter !== 'all') {
      filtered = filtered.filter(e => e.type === eventTypeFilter);
    }
    
    return filtered;
  }, [events, eventTypeFilter]);

  const eventsForSelectedDate = useMemo(() => {
    return filteredEvents.filter(event => {
      const eventStart = safeParseISO(event.start);
      return eventStart && isSameDay(eventStart, selectedDate);
    });
  }, [filteredEvents, selectedDate]);

  const eventsByDate = useMemo(() => {
    const grouped: Record<string, CalendarEventDTO[]> = {};
    
    filteredEvents.forEach(event => {
      const eventStart = safeParseISO(event.start);
      if (eventStart) {
        const dateKey = format(eventStart, 'yyyy-MM-dd');
        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(event);
      }
    });
    
    Object.keys(grouped).forEach(dateKey => {
      grouped[dateKey].sort((a, b) => {
        const aStart = safeParseISO(a.start);
        const bStart = safeParseISO(b.start);
        if (!aStart || !bStart) return 0;
        return aStart.getTime() - bStart.getTime();
      });
    });
    
    return grouped;
  }, [filteredEvents]);

  const handleCreateEvent = () => {
    if (!newEventTitle.trim() || !newEventStartDate || !newEventStartTime || !newEventEndDate || !newEventEndTime) {
      toast({
        title: 'Campi obbligatori',
        description: 'Compila tutti i campi obbligatori',
        variant: 'destructive',
      });
      return;
    }

    const startDate = new Date(`${newEventStartDate}T${newEventStartTime}:00`);
    const endDate = new Date(`${newEventEndDate}T${newEventEndTime}:00`);

    createEventMutation.mutate({
      title: newEventTitle,
      description: newEventDescription || undefined,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      location: newEventLocation || undefined,
      clienteId: selectedCliente?.id,
      notifyCliente: sendNotification,
    });
  };

  const handleCloseCreateDialog = () => {
    setShowCreateDialog(false);
    setNewEventTitle('');
    setNewEventDescription('');
    setNewEventStartDate('');
    setNewEventStartTime('');
    setNewEventEndDate('');
    setNewEventEndTime('');
    setNewEventLocation('');
    setSelectedCliente(null);
    setSendNotification(true);
  };

  const getEventTypeBadge = (type: string) => {
    switch (type) {
      case 'google':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Google Calendar</Badge>;
      case 'consulenza':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Consulenza</Badge>;
      case 'job':
        return <Badge className="bg-purple-100 text-purple-700 border-purple-200">Job</Badge>;
      default:
        return <Badge>{type}</Badge>;
    }
  };

  const datesWithEvents = useMemo(() => {
    return Object.keys(eventsByDate)
      .map(dateStr => safeParseISO(dateStr))
      .filter((date): date is Date => date !== null);
  }, [eventsByDate]);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Calendario Appuntamenti</h1>
          <p className="text-gray-600 mt-1">
            Gestisci tutti gli eventi e appuntamenti
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-new-event">
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Evento
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setEventTypeFilter('google')}
          data-testid="card-google-events"
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">
                Google Calendar
              </CardTitle>
              <CalendarCheck className="w-4 h-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{eventsByType.google}</div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setEventTypeFilter('consulenza')}
          data-testid="card-consulenze-events"
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">
                Consulenze
              </CardTitle>
              <Users className="w-4 h-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{eventsByType.consulenza}</div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setEventTypeFilter('job')}
          data-testid="card-jobs-events"
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">
                Jobs
              </CardTitle>
              <Briefcase className="w-4 h-4 text-purple-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{eventsByType.job}</div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4">
        <Label>Filtra per tipo</Label>
        <Select value={eventTypeFilter} onValueChange={(value: any) => setEventTypeFilter(value)}>
          <SelectTrigger className="w-[200px]" data-testid="select-event-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="google">Google Calendar</SelectItem>
            <SelectItem value="consulenza">Consulenze</SelectItem>
            <SelectItem value="job">Jobs</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>Seleziona Data</CardTitle>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-[300px] w-full" />
                </div>
              ) : (
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  modifiers={{
                    hasEvent: datesWithEvents
                  }}
                  modifiersClassNames={{
                    hasEvent: 'bg-blue-100 font-bold'
                  }}
                  className="rounded-md border"
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-8">
          <Card>
            <CardHeader>
              <CardTitle>Eventi - {format(selectedDate, 'dd MMMM yyyy', { locale: it })}</CardTitle>
              <CardDescription>
                {eventsForSelectedDate.length} {eventsForSelectedDate.length === 1 ? 'evento' : 'eventi'} in questa data
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : eventsForSelectedDate.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CalendarIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Nessun evento per questa data</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {eventsForSelectedDate.map(event => (
                    <Card 
                      key={event.id} 
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => setSelectedEvent(event)}
                      data-testid={`event-card-${event.id}`}
                    >
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold">{event.title}</h3>
                              {getEventTypeBadge(event.type)}
                            </div>
                            
                            {event.description && (
                              <p className="text-sm text-gray-600 mb-2">{event.description}</p>
                            )}
                            
                            <div className="flex flex-col gap-1 text-sm text-gray-500">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {safeParseISO(event.start) ? format(safeParseISO(event.start)!, 'HH:mm') : 'N/A'} - {safeParseISO(event.end) ? format(safeParseISO(event.end)!, 'HH:mm') : 'N/A'}
                              </div>
                              
                              {event.location && (
                                <div className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {event.location}
                                </div>
                              )}
                              
                              {event.clientName && (
                                <div className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {event.clientName}
                                </div>
                              )}
                              
                              {event.clientEmail && (
                                <div className="flex items-center gap-1">
                                  <Mail className="w-3 h-3" />
                                  {event.clientEmail}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <Button variant="ghost" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuovo Evento</DialogTitle>
            <DialogDescription>
              Crea un nuovo evento nel calendario
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titolo *</Label>
              <Input
                id="title"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="Es. Consulenza con cliente"
                data-testid="input-event-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                value={newEventDescription}
                onChange={(e) => setNewEventDescription(e.target.value)}
                placeholder="Dettagli dell'evento..."
                rows={3}
                data-testid="textarea-event-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">Data Inizio *</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={newEventStartDate}
                  onChange={(e) => setNewEventStartDate(e.target.value)}
                  data-testid="input-start-date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="start-time">Ora Inizio *</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={newEventStartTime}
                  onChange={(e) => setNewEventStartTime(e.target.value)}
                  data-testid="input-start-time"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="end-date">Data Fine *</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={newEventEndDate}
                  onChange={(e) => setNewEventEndDate(e.target.value)}
                  data-testid="input-end-date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-time">Ora Fine *</Label>
                <Input
                  id="end-time"
                  type="time"
                  value={newEventEndTime}
                  onChange={(e) => setNewEventEndTime(e.target.value)}
                  data-testid="input-end-time"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Luogo</Label>
              <Input
                id="location"
                value={newEventLocation}
                onChange={(e) => setNewEventLocation(e.target.value)}
                placeholder="Es. Studio, Online, etc."
                data-testid="input-event-location"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client">Cliente</Label>
              <ClientAutocomplete
                value={selectedCliente?.id}
                onSelect={setSelectedCliente}
                placeholder="Cerca cliente (opzionale)"
                enableQuickAdd={true}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="send-notification"
                checked={sendNotification}
                onCheckedChange={(checked) => setSendNotification(checked as boolean)}
                data-testid="checkbox-send-notification"
              />
              <Label 
                htmlFor="send-notification" 
                className="text-sm font-normal cursor-pointer"
              >
                Invia notifica email al cliente
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseCreateDialog}>
              Annulla
            </Button>
            <Button 
              onClick={handleCreateEvent} 
              disabled={createEventMutation.isPending}
              data-testid="button-create-event"
            >
              {createEventMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Crea Evento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dettagli Evento</DialogTitle>
          </DialogHeader>

          {selectedEvent && (
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-xs text-gray-500">Titolo</Label>
                <p className="font-medium">{selectedEvent.title}</p>
              </div>

              {selectedEvent.description && (
                <div>
                  <Label className="text-xs text-gray-500">Descrizione</Label>
                  <p className="text-sm">{selectedEvent.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">Data/Ora Inizio</Label>
                  <p className="text-sm">
                    {safeParseISO(selectedEvent.start) 
                      ? format(safeParseISO(selectedEvent.start)!, 'dd MMM yyyy HH:mm', { locale: it })
                      : 'Data non disponibile'}
                  </p>
                </div>

                <div>
                  <Label className="text-xs text-gray-500">Data/Ora Fine</Label>
                  <p className="text-sm">
                    {safeParseISO(selectedEvent.end) 
                      ? format(safeParseISO(selectedEvent.end)!, 'dd MMM yyyy HH:mm', { locale: it })
                      : 'Data non disponibile'}
                  </p>
                </div>
              </div>

              {selectedEvent.location && (
                <div>
                  <Label className="text-xs text-gray-500">Luogo</Label>
                  <p className="text-sm">{selectedEvent.location}</p>
                </div>
              )}

              <div>
                <Label className="text-xs text-gray-500">Tipo</Label>
                <div className="mt-1">{getEventTypeBadge(selectedEvent.type)}</div>
              </div>

              {selectedEvent.clientName && (
                <div>
                  <Label className="text-xs text-gray-500">Cliente</Label>
                  <p className="text-sm">{selectedEvent.clientName}</p>
                  {selectedEvent.clientEmail && (
                    <p className="text-xs text-gray-500">{selectedEvent.clientEmail}</p>
                  )}
                </div>
              )}

              {selectedEvent.googleEventId && (
                <div>
                  <Label className="text-xs text-gray-500">Google Event ID</Label>
                  <p className="text-xs font-mono bg-gray-50 p-2 rounded">
                    {selectedEvent.googleEventId}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setSelectedEvent(null)}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
