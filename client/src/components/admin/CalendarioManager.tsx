import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
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
  Eye,
  Trash2,
  Pencil
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
  entityStatus?: string;
  entityId?: string;
}

export default function CalendarioManager() {
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useFirebaseAuth();
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
  const [newEventLocation, setNewEventLocation] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [sendNotification, setSendNotification] = useState(true);
  
  const [isAllDay, setIsAllDay] = useState(false);
  const [durationPreset, setDurationPreset] = useState<'30min' | '1h' | '2h' | '3h' | 'custom'>('1h');
  const [customDurationHours, setCustomDurationHours] = useState('1');
  
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editEventData, setEditEventData] = useState({
    title: '',
    description: '',
    startDate: '',
    startTime: '',
    endTime: '',
    location: '',
  });

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);

  const { data: eventsData, isLoading: eventsLoading } = useQuery<{ events: CalendarEventDTO[]; warnings?: string[] }>({
    queryKey: ['/api/calendar/events', monthStart.toISOString(), monthEnd.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: monthStart.toISOString(),
        endDate: monthEnd.toISOString()
      });
      const response = await apiRequest('GET', `/api/calendar/events?${params}`);
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
    enabled: !authLoading && isAuthenticated,
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
      isAllDay?: boolean;
    }) => {
      return await apiRequest('POST', '/api/calendar/create-event', eventData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/events'], exact: false });
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

  const deleteEventMutation = useMutation({
    mutationFn: async ({ entityId, type }: { entityId: string; type: string }) => {
      if (type === 'consulenza') {
        return await apiRequest('DELETE', `/api/consultations/${entityId}`);
      } else {
        throw new Error('Tipo evento non supportato per cancellazione dal calendario');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/events'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/consultations'], exact: false });
      toast({
        title: 'Evento eliminato',
        description: 'L\'evento è stato rimosso dal calendario',
      });
      setSelectedEvent(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message || 'Impossibile eliminare l\'evento',
        variant: 'destructive',
      });
    },
  });
  
  const updateEventMutation = useMutation({
    mutationFn: async (eventData: {
      eventId: string;
      title?: string;
      description?: string;
      start: string;
      end: string;
      location?: string;
      type: 'google' | 'consulenza' | 'job';
      entityId?: string;
      googleEventId?: string;
    }) => {
      return await apiRequest('PATCH', `/api/calendar/events/${eventData.eventId}`, eventData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/events'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/consultations'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'], exact: false });
      toast({
        title: 'Evento aggiornato',
        description: 'L\'evento è stato modificato con successo',
      });
      setShowEditDialog(false);
      setSelectedEvent(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message || 'Impossibile modificare l\'evento',
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
    if (!newEventTitle.trim() || !newEventStartDate) {
      toast({
        title: 'Campi obbligatori',
        description: 'Compila titolo e data inizio',
        variant: 'destructive',
      });
      return;
    }

    if (!isAllDay && !newEventStartTime) {
      toast({
        title: 'Ora richiesta',
        description: 'Specifica ora inizio o seleziona "Tutto il giorno"',
        variant: 'destructive',
      });
      return;
    }

    if (isAllDay) {
      createEventMutation.mutate({
        title: newEventTitle,
        description: newEventDescription || undefined,
        start: newEventStartDate,
        end: newEventStartDate,
        location: newEventLocation || undefined,
        clienteId: selectedCliente?.id,
        notifyCliente: sendNotification,
        isAllDay: true,
      });
    } else {
      const startDate = new Date(`${newEventStartDate}T${newEventStartTime}:00`);
      
      let durationMinutes: number;
      
      if (durationPreset === 'custom') {
        const customHours = parseFloat(customDurationHours);
        if (isNaN(customHours) || customHours <= 0) {
          toast({
            title: 'Durata non valida',
            description: 'Inserisci una durata valida (es. 1.5)',
            variant: 'destructive',
          });
          return;
        }
        durationMinutes = customHours * 60;
      } else {
        const durationMap = {
          '30min': 30,
          '1h': 60,
          '2h': 120,
          '3h': 180,
        };
        durationMinutes = durationMap[durationPreset];
      }
      
      const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

      createEventMutation.mutate({
        title: newEventTitle,
        description: newEventDescription || undefined,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        location: newEventLocation || undefined,
        clienteId: selectedCliente?.id,
        notifyCliente: sendNotification,
        isAllDay: false,
      });
    }
  };

  const handleCloseCreateDialog = () => {
    setShowCreateDialog(false);
    setNewEventTitle('');
    setNewEventDescription('');
    setNewEventStartDate('');
    setNewEventStartTime('');
    setNewEventLocation('');
    setSelectedCliente(null);
    setSendNotification(true);
    setIsAllDay(false);
    setDurationPreset('1h');
    setCustomDurationHours('1');
  };
  
  const isAllDayEvent = (event: CalendarEventDTO): boolean => {
    const startDate = safeParseISO(event.start);
    const endDate = safeParseISO(event.end);
    if (!startDate || !endDate) return false;
    
    const startTime = format(startDate, 'HH:mm');
    const endTime = format(endDate, 'HH:mm');
    return startTime === '00:00' && endTime === '00:00';
  };
  
  const handleOpenEditDialog = (event: CalendarEventDTO) => {
    if (isAllDayEvent(event)) {
      toast({
        title: 'Evento tutto il giorno',
        description: 'Gli eventi tutto il giorno non possono essere modificati da qui. Modifica l\'evento direttamente da Google Calendar.',
        variant: 'default',
      });
      return;
    }
    
    const startDate = safeParseISO(event.start);
    const endDate = safeParseISO(event.end);
    
    setEditEventData({
      title: event.title || '',
      description: event.description || '',
      startDate: startDate ? format(startDate, 'yyyy-MM-dd') : '',
      startTime: startDate ? format(startDate, 'HH:mm') : '',
      endTime: endDate ? format(endDate, 'HH:mm') : '',
      location: event.location || '',
    });
    setShowEditDialog(true);
  };
  
  const handleUpdateEvent = () => {
    if (!selectedEvent) return;
    
    if (!editEventData.startDate || !editEventData.startTime || !editEventData.endTime) {
      toast({
        title: 'Campi obbligatori',
        description: 'Compila data e orari',
        variant: 'destructive',
      });
      return;
    }
    
    const startDate = new Date(`${editEventData.startDate}T${editEventData.startTime}:00`);
    const endDate = new Date(`${editEventData.startDate}T${editEventData.endTime}:00`);
    
    if (endDate <= startDate) {
      toast({
        title: 'Orario non valido',
        description: 'L\'ora di fine deve essere dopo l\'ora di inizio',
        variant: 'destructive',
      });
      return;
    }
    
    updateEventMutation.mutate({
      eventId: selectedEvent.id,
      title: editEventData.title || undefined,
      description: editEventData.description || undefined,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      location: editEventData.location || undefined,
      type: selectedEvent.type,
      entityId: selectedEvent.entityId,
      googleEventId: selectedEvent.googleEventId,
    });
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Calendario Appuntamenti</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Gestisci tutti gli eventi e appuntamenti
          </p>
        </div>
        <Button 
          onClick={() => setShowCreateDialog(true)} 
          data-testid="button-new-event"
          className="w-full sm:w-auto"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Evento
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setEventTypeFilter('google')}
          data-testid="card-google-events"
        >
          <CardHeader className="pb-2 px-4 sm:px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">
                Google Calendar
              </CardTitle>
              <CalendarCheck className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 flex-shrink-0" />
            </div>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <div className="text-xl sm:text-2xl font-bold">{eventsByType.google}</div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setEventTypeFilter('consulenza')}
          data-testid="card-consulenze-events"
        >
          <CardHeader className="pb-2 px-4 sm:px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">
                Richieste Info
              </CardTitle>
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
            </div>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <div className="text-xl sm:text-2xl font-bold">{eventsByType.consulenza}</div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setEventTypeFilter('job')}
          data-testid="card-jobs-events"
        >
          <CardHeader className="pb-2 px-4 sm:px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600">
                Jobs
              </CardTitle>
              <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500 flex-shrink-0" />
            </div>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <div className="text-xl sm:text-2xl font-bold">{eventsByType.job}</div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4">
        <Label className="text-sm sm:text-base">Filtra per tipo</Label>
        <Select value={eventTypeFilter} onValueChange={(value: any) => setEventTypeFilter(value)}>
          <SelectTrigger className="w-full sm:w-[200px] mt-1" data-testid="select-event-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="google">Google Calendar</SelectItem>
            <SelectItem value="consulenza">Richieste Info</SelectItem>
            <SelectItem value="job">Jobs</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
        <div className="lg:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg lg:text-xl">Seleziona Data</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              {eventsLoading ? (
                <div className="space-y-2 w-full">
                  <Skeleton className="h-[280px] sm:h-[300px] w-full" />
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
                  className="rounded-md border w-full"
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg lg:text-xl">
                Eventi - <span className="text-base lg:text-lg">{format(selectedDate, 'dd MMMM yyyy', { locale: it })}</span>
              </CardTitle>
              <CardDescription className="text-sm">
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
                  <CalendarIcon className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm sm:text-base">Nessun evento per questa data</p>
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
                      <CardContent className="pt-3 sm:pt-4 px-3 sm:px-6">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <h3 className="font-semibold text-sm sm:text-base truncate">{event.title}</h3>
                              {getEventTypeBadge(event.type)}
                            </div>
                            
                            {event.description && (
                              <p className="text-xs sm:text-sm text-gray-600 mb-2 line-clamp-2">{event.description}</p>
                            )}
                            
                            <div className="flex flex-col gap-1 text-xs sm:text-sm text-gray-500">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">
                                  {safeParseISO(event.start) ? format(safeParseISO(event.start)!, 'HH:mm') : 'N/A'} - {safeParseISO(event.end) ? format(safeParseISO(event.end)!, 'HH:mm') : 'N/A'}
                                </span>
                              </div>
                              
                              {event.location && (
                                <div className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">{event.location}</span>
                                </div>
                              )}
                              
                              {event.clientName && (
                                <div className="flex items-center gap-1">
                                  <Users className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">{event.clientName}</span>
                                </div>
                              )}
                              
                              {event.clientEmail && (
                                <div className="flex items-center gap-1">
                                  <Mail className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate text-xs">{event.clientEmail}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <Button variant="ghost" size="sm" className="self-start sm:self-auto flex-shrink-0">
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Nuovo Evento</DialogTitle>
            <DialogDescription className="text-sm">
              Crea un nuovo evento nel calendario
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:gap-4 py-4">
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

            <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
              <Checkbox
                id="all-day"
                checked={isAllDay}
                onCheckedChange={(checked) => setIsAllDay(checked as boolean)}
                data-testid="checkbox-all-day"
              />
              <Label 
                htmlFor="all-day" 
                className="text-sm font-normal cursor-pointer"
              >
                Evento di tutta la giornata
              </Label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date" className="text-sm">Data Inizio *</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={newEventStartDate}
                  onChange={(e) => setNewEventStartDate(e.target.value)}
                  data-testid="input-start-date"
                  className="text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="start-time" className="text-sm">Ora Inizio {!isAllDay && '*'}</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={newEventStartTime}
                  onChange={(e) => setNewEventStartTime(e.target.value)}
                  disabled={isAllDay}
                  data-testid="input-start-time"
                  className="text-sm"
                />
              </div>
            </div>

            {!isAllDay && (
              <div className="space-y-2">
                <Label htmlFor="duration">Durata</Label>
                <Select value={durationPreset} onValueChange={(val) => setDurationPreset(val as any)}>
                  <SelectTrigger id="duration" data-testid="select-duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30min">30 minuti</SelectItem>
                    <SelectItem value="1h">1 ora</SelectItem>
                    <SelectItem value="2h">2 ore</SelectItem>
                    <SelectItem value="3h">3 ore</SelectItem>
                    <SelectItem value="custom">Personalizzata</SelectItem>
                  </SelectContent>
                </Select>
                
                {durationPreset === 'custom' && (
                  <div className="mt-2">
                    <Label htmlFor="custom-duration" className="text-sm text-gray-600">
                      Durata (ore)
                    </Label>
                    <Input
                      id="custom-duration"
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={customDurationHours}
                      onChange={(e) => setCustomDurationHours(e.target.value)}
                      placeholder="Es. 1.5"
                      data-testid="input-custom-duration"
                    />
                  </div>
                )}
              </div>
            )}

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

          <DialogFooter className="flex justify-between">
            <div className="flex gap-2">
              {selectedEvent && selectedEvent.entityId && selectedEvent.entityStatus === 'rifiutata' && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (selectedEvent.entityId && confirm('Sei sicuro di voler eliminare questa consulenza rifiutata?')) {
                      deleteEventMutation.mutate({
                        entityId: selectedEvent.entityId,
                        type: selectedEvent.type
                      });
                    }
                  }}
                  disabled={deleteEventMutation.isPending}
                >
                  {deleteEventMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Trash2 className="w-4 h-4 mr-2" />
                  Elimina
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={() => {
                  if (selectedEvent) {
                    handleOpenEditDialog(selectedEvent);
                  }
                }}
                data-testid="button-edit-event"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Modifica
              </Button>
              <Button onClick={() => setSelectedEvent(null)}>Chiudi</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modifica Evento</DialogTitle>
            <DialogDescription>
              Modifica data e orario dell'evento. Le modifiche verranno sincronizzate con Google Calendar.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-title">Titolo</Label>
              <Input
                id="edit-title"
                value={editEventData.title}
                onChange={(e) => setEditEventData({ ...editEventData, title: e.target.value })}
                placeholder="Titolo evento"
                data-testid="input-edit-title"
              />
            </div>
            
            <div>
              <Label htmlFor="edit-date">Data *</Label>
              <Input
                id="edit-date"
                type="date"
                value={editEventData.startDate}
                onChange={(e) => setEditEventData({ ...editEventData, startDate: e.target.value })}
                required
                data-testid="input-edit-date"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-start-time">Ora Inizio *</Label>
                <Input
                  id="edit-start-time"
                  type="time"
                  value={editEventData.startTime}
                  onChange={(e) => setEditEventData({ ...editEventData, startTime: e.target.value })}
                  required
                  data-testid="input-edit-start-time"
                />
              </div>
              
              <div>
                <Label htmlFor="edit-end-time">Ora Fine *</Label>
                <Input
                  id="edit-end-time"
                  type="time"
                  value={editEventData.endTime}
                  onChange={(e) => setEditEventData({ ...editEventData, endTime: e.target.value })}
                  required
                  data-testid="input-edit-end-time"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="edit-location">Luogo</Label>
              <Input
                id="edit-location"
                value={editEventData.location}
                onChange={(e) => setEditEventData({ ...editEventData, location: e.target.value })}
                placeholder="Es. Studio, Online, etc."
                data-testid="input-edit-location"
              />
            </div>
            
            <div>
              <Label htmlFor="edit-description">Note</Label>
              <Textarea
                id="edit-description"
                value={editEventData.description}
                onChange={(e) => setEditEventData({ ...editEventData, description: e.target.value })}
                placeholder="Eventuali note..."
                rows={3}
                data-testid="textarea-edit-description"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Annulla
            </Button>
            <Button 
              onClick={handleUpdateEvent}
              disabled={updateEventMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateEventMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salva Modifiche
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
