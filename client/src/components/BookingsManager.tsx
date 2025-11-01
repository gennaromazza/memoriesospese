/**
 * Bookings Manager - Gestione prenotazioni booking per admin
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import {
  getAllBookings,
  getBookingsByStatus,
  approveBooking,
  updateBookingStatus,
  deleteBooking,
} from '@/lib/bookings';
import { getAllCampaigns } from '@/lib/booking-campaigns';
import type { Booking, BookingCampaign } from '@shared/booking-types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Calendar,
  Clock,
  User,
  Mail,
  Phone,
  Package,
  CheckCircle,
  XCircle,
  Trash2,
  Eye,
  AlertCircle,
  Loader2,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';

const STATI_BOOKING = [
  { value: 'all', label: 'Tutti', icon: FileText },
  { value: 'in_attesa', label: 'In Attesa', icon: Clock },
  { value: 'confermata', label: 'Confermate', icon: CheckCircle },
  { value: 'completata', label: 'Completate', icon: Package },
  { value: 'annullata', label: 'Annullate', icon: XCircle },
] as const;

function getStatoBadge(stato: string) {
  switch (stato) {
    case 'in_attesa':
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">In Attesa</Badge>;
    case 'confermata':
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Confermata</Badge>;
    case 'completata':
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Completata</Badge>;
    case 'annullata':
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Annullata</Badge>;
    default:
      return <Badge>{stato}</Badge>;
  }
}

export default function BookingsManager() {
  const { toast } = useToast();
  const { currentUser } = useFirebaseAuth();
  const [selectedStato, setSelectedStato] = useState<string>('all');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Query bookings
  const { data: bookings = [], isLoading, refetch } = useQuery<Booking[]>({
    queryKey: ['bookings', selectedStato],
    queryFn: async () => {
      if (selectedStato === 'all') {
        return await getAllBookings();
      }
      return await getBookingsByStatus(selectedStato as any);
    },
  });

  // Query campagne per nomi
  const { data: campaigns = [] } = useQuery<BookingCampaign[]>({
    queryKey: ['campaigns'],
    queryFn: getAllCampaigns,
  });

  // Mutation: Approva prenotazione
  const approveMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const adminUid = currentUser?.uid || 'admin';
      await approveBooking(bookingId, adminUid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast({
        title: 'Prenotazione approvata',
        description: 'Email di conferma inviata al cliente',
      });
      setSelectedBooking(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore approvazione',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation: Cambia stato
  const changeStatusMutation = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: any }) => {
      await updateBookingStatus(id, stato);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast({
        title: 'Stato aggiornato',
        description: 'Lo stato della prenotazione è stato modificato',
      });
      setSelectedBooking(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore aggiornamento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation: Elimina prenotazione
  const deleteMutation = useMutation({
    mutationFn: deleteBooking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast({
        title: 'Prenotazione eliminata',
        description: 'La prenotazione è stata rimossa dal sistema',
      });
      setDeleteConfirmId(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore eliminazione',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Helper: Ottieni nome campagna
  const getCampaignName = (campaignId: string) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    return campaign?.nome || 'Campagna sconosciuta';
  };

  // Helper: Formatta data/ora
  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, "EEEE d MMMM yyyy 'alle' HH:mm", { locale: it });
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, 'HH:mm', { locale: it });
  };

  return (
    <div className="space-y-6">
      {/* Header e filtri */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-6 h-6 text-sage" />
            Gestione Prenotazioni
          </CardTitle>
          <CardDescription>
            Visualizza e gestisci tutte le prenotazioni dei clienti
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Select value={selectedStato} onValueChange={setSelectedStato}>
                <SelectTrigger data-testid="select-stato-filter">
                  <SelectValue placeholder="Filtra per stato" />
                </SelectTrigger>
                <SelectContent>
                  {STATI_BOOKING.map((stato) => (
                    <SelectItem key={stato.value} value={stato.value}>
                      <div className="flex items-center gap-2">
                        <stato.icon className="w-4 h-4" />
                        {stato.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              data-testid="button-refresh"
            >
              Aggiorna
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista prenotazioni */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-sage" />
          </CardContent>
        </Card>
      ) : bookings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium">Nessuna prenotazione trovata</p>
            <p className="text-sm mt-2">
              {selectedStato === 'all'
                ? 'Non ci sono prenotazioni nel sistema'
                : `Non ci sono prenotazioni con stato "${STATI_BOOKING.find(s => s.value === selectedStato)?.label}"`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {bookings.map((booking) => (
            <Card key={booking.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex justify-between items-start gap-6">
                  {/* Info prenotazione */}
                  <div className="flex-1 space-y-3">
                    {/* Intestazione */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold font-playfair text-blue-gray">
                          {booking.cliente.nome} {booking.cliente.cognome}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {getCampaignName(booking.campaignId)}
                        </p>
                      </div>
                      {getStatoBadge(booking.stato)}
                    </div>

                    {/* Dettagli */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-gray-700">
                        <Calendar className="w-4 h-4 text-sage" />
                        <span>{formatDateTime(booking.dataShootingInizio)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-700">
                        <Clock className="w-4 h-4 text-sage" />
                        <span>
                          {formatTime(booking.dataShootingInizio)} - {formatTime(booking.dataShootingFine)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-700">
                        <Mail className="w-4 h-4 text-sage" />
                        <a href={`mailto:${booking.cliente.email}`} className="hover:underline">
                          {booking.cliente.email}
                        </a>
                      </div>
                      <div className="flex items-center gap-2 text-gray-700">
                        <Phone className="w-4 h-4 text-sage" />
                        <a href={`https://wa.me/${booking.cliente.whatsapp}`} className="hover:underline">
                          {booking.cliente.whatsapp}
                        </a>
                      </div>
                      {booking.prodottoNome && (
                        <div className="flex items-center gap-2 text-gray-700">
                          <Package className="w-4 h-4 text-sage" />
                          <span>{booking.prodottoNome}</span>
                        </div>
                      )}
                    </div>

                    {/* Note */}
                    {booking.note && (
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-700">
                          <strong>Note:</strong> {booking.note}
                        </p>
                      </div>
                    )}

                    {/* Email status */}
                    <div className="flex gap-2">
                      {booking.emailRicevutaInviata && (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                          ✉️ Email ricevuta inviata
                        </Badge>
                      )}
                      {booking.emailConfermataInviata && (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                          ✉️ Email conferma inviata
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Azioni */}
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedBooking(booking)}
                      data-testid={`button-view-${booking.id}`}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Dettagli
                    </Button>

                    {booking.stato === 'in_attesa' && (
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate(booking.id)}
                        disabled={approveMutation.isPending}
                        className="bg-sage hover:bg-dark-sage"
                        data-testid={`button-approve-${booking.id}`}
                      >
                        {approveMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4 mr-1" />
                        )}
                        Approva
                      </Button>
                    )}

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteConfirmId(booking.id)}
                      data-testid={`button-delete-${booking.id}`}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Elimina
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog dettagli prenotazione */}
      <Dialog open={!!selectedBooking} onOpenChange={() => setSelectedBooking(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-playfair text-2xl">
              Dettagli Prenotazione
            </DialogTitle>
            <DialogDescription>
              Gestisci lo stato e visualizza tutti i dettagli
            </DialogDescription>
          </DialogHeader>

          {selectedBooking && (
            <div className="space-y-6 py-4">
              {/* Stato corrente */}
              <div>
                <Label className="text-sm font-medium">Stato Attuale</Label>
                <div className="mt-2">{getStatoBadge(selectedBooking.stato)}</div>
              </div>

              {/* Cambia stato */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Cambia Stato</Label>
                <Select
                  value={selectedBooking.stato}
                  onValueChange={(value) =>
                    changeStatusMutation.mutate({
                      id: selectedBooking.id,
                      stato: value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_attesa">In Attesa</SelectItem>
                    <SelectItem value="confermata">Confermata</SelectItem>
                    <SelectItem value="completata">Completata</SelectItem>
                    <SelectItem value="annullata">Annullata</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Info cliente */}
              <div className="space-y-3">
                <h4 className="font-semibold text-blue-gray">Informazioni Cliente</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Nome:</span>
                    <p className="font-medium">
                      {selectedBooking.cliente.nome} {selectedBooking.cliente.cognome}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">Email:</span>
                    <p className="font-medium">{selectedBooking.cliente.email}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">WhatsApp:</span>
                    <p className="font-medium">{selectedBooking.cliente.whatsapp}</p>
                  </div>
                </div>
              </div>

              {/* Info prenotazione */}
              <div className="space-y-3">
                <h4 className="font-semibold text-blue-gray">Dettagli Prenotazione</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600">Campagna:</span>
                    <p className="font-medium">{getCampaignName(selectedBooking.campaignId)}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Data e Ora:</span>
                    <p className="font-medium">{formatDateTime(selectedBooking.dataShootingInizio)}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Orario:</span>
                    <p className="font-medium">
                      {formatTime(selectedBooking.dataShootingInizio)} - {formatTime(selectedBooking.dataShootingFine)}
                    </p>
                  </div>
                  {selectedBooking.prodottoNome && (
                    <div>
                      <span className="text-gray-600">Prodotto:</span>
                      <p className="font-medium">{selectedBooking.prodottoNome}</p>
                    </div>
                  )}
                  {selectedBooking.note && (
                    <div>
                      <span className="text-gray-600">Note:</span>
                      <p className="font-medium">{selectedBooking.note}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Azioni rapide */}
              {selectedBooking.stato === 'in_attesa' && (
                <Alert className="bg-yellow-50 border-yellow-200">
                  <AlertCircle className="w-4 h-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800">
                    Questa prenotazione è in attesa di approvazione. Clicca su "Approva Ora" per confermare e inviare l'email al cliente.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            {selectedBooking?.stato === 'in_attesa' && (
              <Button
                onClick={() => approveMutation.mutate(selectedBooking.id)}
                disabled={approveMutation.isPending}
                className="bg-sage hover:bg-dark-sage"
              >
                {approveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Approvazione...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approva Ora
                  </>
                )}
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedBooking(null)}>
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog conferma eliminazione */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conferma Eliminazione</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare questa prenotazione? Questa azione è irreversibile.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
