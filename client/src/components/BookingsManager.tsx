/**
 * Bookings Manager - Gestione prenotazioni booking per admin
 */

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import {
  getAllBookings,
  getBookingsByStatus,
  approveBooking,
  updateBookingStatus,
  deleteBooking,
  markBookingAsViewed,
  updateBooking,
} from '@/lib/bookings';
import { getAllCampaigns } from '@/lib/booking-campaigns';
import { getAllOrders, createOrder } from '@/lib/orders';
import { getActiveProducts } from '@/lib/products';
import { GalleryService, type Gallery } from '@/lib/galleries';
import type { Booking, BookingCampaign, Order, Product, OrderItem } from '@shared/booking-types';
import NewGalleryModal from '@/components/NewGalleryModal';
import { OrdersManager } from '@/components/OrdersManager';
import ManualBookingModal from '@/components/ManualBookingModal';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
  FileText,
  Search,
  ShoppingCart,
  Plus,
  Image as ImageIcon,
  Receipt
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
  const { user } = useFirebaseAuth();
  const [activeTab, setActiveTab] = useState<'bookings' | 'orders'>('bookings');
  const [selectedStato, setSelectedStato] = useState<string>('all');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBookingForOrder, setSelectedBookingForOrder] = useState<Booking | null>(null);
  const [selectedBookingForGallery, setSelectedBookingForGallery] = useState<Booking | null>(null);
  const [filterBookingId, setFilterBookingId] = useState<string | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [showManualBookingModal, setShowManualBookingModal] = useState(false);
  
  // State form modifica prenotazione
  const [editNome, setEditNome] = useState('');
  const [editCognome, setEditCognome] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editNote, setEditNote] = useState('');

  // Query bookings - sempre tutti per permettere filtro client-side
  const { data: allBookings = [], isLoading, refetch } = useQuery<Booking[]>({
    queryKey: ['bookings'],
    queryFn: getAllBookings,
  });

  // Query campagne per nomi
  const { data: campaigns = [] } = useQuery<BookingCampaign[]>({
    queryKey: ['campaigns'],
    queryFn: getAllCampaigns,
  });

  // Query ordini per lookup
  const { data: allOrders = [] } = useQuery<Order[]>({
    queryKey: ['orders'],
    queryFn: getAllOrders,
  });

  // Query prodotti attivi per dialog creazione ordine
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products', 'active'],
    queryFn: getActiveProducts,
  });

  // Query galleries per trovare gallerie create da bookings
  const { data: allGalleries = [] } = useQuery<Gallery[]>({
    queryKey: ['galleries'],
    queryFn: GalleryService.getAllGalleries,
  });

  // Helper: Ottieni nome campagna
  const getCampaignName = (campaignId: string) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    return campaign?.nome || 'Campagna sconosciuta';
  };

  // Helper: Trova ordine per booking
  const getOrderByBookingId = (bookingId: string): Order | undefined => {
    return allOrders.find(order => order.bookingId === bookingId);
  };

  // Helper: Trova galleria per booking (prima galleria trovata)
  const getGalleryByBookingId = (bookingId: string): Gallery | undefined => {
    return allGalleries.find(gallery => gallery.bookingId === bookingId);
  };

  // Helper: Trova TUTTE le gallerie collegate a un booking
  const getGalleriesByBookingId = (bookingId: string): Gallery[] => {
    return allGalleries.filter(gallery => gallery.bookingId === bookingId);
  };

  // Filtra, cerca e ordina bookings
  const bookings = useMemo(() => {
    let filtered = [...allBookings];

    // 1. Filtra per stato
    if (selectedStato !== 'all') {
      filtered = filtered.filter(b => b.stato === selectedStato);
    }

    // 2. Ricerca per nome, email, campagna
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(b => {
        const nomeCompleto = `${b.cliente.nome} ${b.cliente.cognome}`.toLowerCase();
        const email = b.cliente.email.toLowerCase();
        const campagna = getCampaignName(b.campaignId).toLowerCase();
        
        return nomeCompleto.includes(query) || 
               email.includes(query) || 
               campagna.includes(query);
      });
    }

    // 3. Ordina per data e ora (più recenti prima)
    filtered.sort((a, b) => {
      const getTime = (timestamp: any): number => {
        if (!timestamp) return 0;
        if (timestamp.toDate) return timestamp.toDate().getTime();
        if (timestamp instanceof Date) return timestamp.getTime();
        return new Date(timestamp).getTime();
      };
      
      return getTime(b.dataShootingInizio) - getTime(a.dataShootingInizio);
    });

    return filtered;
  }, [allBookings, selectedStato, searchQuery, campaigns]);

  // Mutation: Approva prenotazione
  const approveMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const adminUid = user?.uid || 'admin';
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

  // Mutation: Aggiorna prenotazione
  const updateBookingMutation = useMutation({
    mutationFn: ({ 
      bookingId, 
      data, 
      oldEmail 
    }: { 
      bookingId: string; 
      data: { cliente?: any; note?: string }; 
      oldEmail?: string 
    }) => updateBooking(bookingId, data, oldEmail),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      const emailChanged = variables.oldEmail && variables.data.cliente?.email && 
                          variables.oldEmail !== variables.data.cliente.email;
      toast({
        title: 'Prenotazione aggiornata',
        description: emailChanged 
          ? 'Dati aggiornati con successo. Email di notifica inviata al cliente.'
          : 'I dati della prenotazione sono stati aggiornati',
      });
      setEditBooking(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore aggiornamento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation: Marca come vista
  const markAsViewedMutation = useMutation({
    mutationFn: markBookingAsViewed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: (error: Error) => {
      console.error('Errore marca come vista:', error);
      // Silent fail - non mostrare toast per non disturbare admin
    },
  });

  // Mutation: Crea ordine da booking
  const createOrderMutation = useMutation({
    mutationFn: createOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast({
        title: 'Ordine creato',
        description: 'L\'ordine è stato creato con successo',
      });
      setSelectedBookingForOrder(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore creazione ordine',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handler: Apri dettagli e marca come vista
  const handleOpenDetails = async (booking: Booking) => {
    setSelectedBooking(booking);
    
    // Marca come vista solo se è nuova (dataVisualizzazione null/undefined)
    if (!booking.dataVisualizzazione) {
      markAsViewedMutation.mutate(booking.id);
    }
  };

  // Handler: Apri dialog modifica
  const handleOpenEdit = (booking: Booking) => {
    setEditBooking(booking);
    setEditNome(booking.cliente.nome);
    setEditCognome(booking.cliente.cognome);
    setEditEmail(booking.cliente.email);
    setEditWhatsapp(booking.cliente.whatsapp);
    setEditNote(booking.note || '');
  };

  // Handler: Salva modifiche prenotazione
  const handleSaveEdit = () => {
    if (!editBooking) return;

    // Validazione base
    if (!editNome.trim() || !editCognome.trim() || !editEmail.trim() || !editWhatsapp.trim()) {
      toast({
        title: 'Campi obbligatori',
        description: 'Nome, Cognome, Email e WhatsApp sono campi obbligatori',
        variant: 'destructive',
      });
      return;
    }

    // Validazione email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editEmail)) {
      toast({
        title: 'Email non valida',
        description: 'Inserisci un indirizzo email valido',
        variant: 'destructive',
      });
      return;
    }

    updateBookingMutation.mutate({
      bookingId: editBooking.id,
      data: {
        cliente: {
          nome: editNome.trim(),
          cognome: editCognome.trim(),
          email: editEmail.trim(),
          whatsapp: editWhatsapp.trim(),
        },
        note: editNote.trim(),
      },
      oldEmail: editBooking.cliente.email, // Per rilevare cambio email
    });
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

  // Helper: Formatta timestamp per input date (YYYY-MM-DD)
  const formatDateForInput = (timestamp: any): string => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, 'yyyy-MM-dd');
  };

  return (
    <div className="space-y-6">
      {/* Tabs Prenotazioni/Ordini */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeTab === 'bookings' ? 'default' : 'ghost'}
          className={activeTab === 'bookings' ? 'bg-sage hover:bg-dark-sage' : ''}
          onClick={() => setActiveTab('bookings')}
          data-testid="tab-bookings"
        >
          <Calendar className="w-4 h-4 mr-2" />
          Prenotazioni
        </Button>
        <Button
          variant={activeTab === 'orders' ? 'default' : 'ghost'}
          className={activeTab === 'orders' ? 'bg-sage hover:bg-dark-sage' : ''}
          onClick={() => setActiveTab('orders')}
          data-testid="tab-orders"
        >
          <Receipt className="w-4 h-4 mr-2" />
          Ordini
        </Button>
      </div>

      {/* Contenuto Tab Prenotazioni */}
      {activeTab === 'bookings' && (
        <>
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
          <div className="space-y-4">
            {/* Filtri */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
              <div className="flex-1">
                <Select value={selectedStato} onValueChange={setSelectedStato}>
                  <SelectTrigger data-testid="select-stato-filter">
                    <SelectValue placeholder="Filtra per stato" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATI_BOOKING.map((stato) => (
                      <SelectItem key={stato.value} value={stato.value}>
                        {stato.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Cerca per nome, email o campagna..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-bookings"
                  />
                </div>
              </div>
              <Button
                variant="outline"
                size="default"
                onClick={() => refetch()}
                data-testid="button-refresh"
              >
                Aggiorna
              </Button>
              <Button
                variant="default"
                size="default"
                onClick={() => setShowManualBookingModal(true)}
                className="bg-sage hover:bg-dark-sage"
                data-testid="button-new-manual-booking"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuova Prenotazione
              </Button>
            </div>

            {/* Contatore risultati */}
            {searchQuery.trim() && (
              <div className="text-sm text-gray-600">
                Trovate <strong>{bookings.length}</strong> prenotazioni
              </div>
            )}
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
                        <h3 className="text-lg font-bold font-playfair text-blue-gray flex items-center gap-2">
                          {booking.cliente.nome} {booking.cliente.cognome}
                          {booking.isManual && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                              👤 Walk-in
                            </Badge>
                          )}
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

                    {/* Gallerie Collegate */}
                    {(() => {
                      const galleries = getGalleriesByBookingId(booking.id);
                      if (galleries.length === 0) return null;
                      
                      return (
                        <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg space-y-2">
                          <p className="text-sm font-semibold text-purple-900 flex items-center gap-2">
                            <ImageIcon className="w-4 h-4" />
                            Gallerie Collegate ({galleries.length})
                          </p>
                          <div className="space-y-1.5">
                            {galleries.map((gallery) => (
                              <div key={gallery.id} className="flex items-center justify-between gap-2 bg-white p-2 rounded border border-purple-100">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <a 
                                      href={`/gallery/${gallery.code}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm font-medium text-purple-700 hover:text-purple-900 hover:underline truncate"
                                      data-testid={`link-gallery-${gallery.code}`}
                                    >
                                      {gallery.name}
                                    </a>
                                    {gallery.selectionStatus === 'completed' && (
                                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs shrink-0">
                                        ✓ Selezione OK
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500 font-mono">
                                    Codice: {gallery.code}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

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
                    {/* Badge NUOVA se non ancora visualizzata */}
                    {!booking.dataVisualizzazione && (
                      <Badge className="bg-red-500 text-white hover:bg-red-600 animate-pulse">
                        🔔 NUOVA
                      </Badge>
                    )}

                    {/* Badge Ordine Creato */}
                    {getOrderByBookingId(booking.id) && (
                      <Badge className="bg-green-50 text-green-700 border-green-200" variant="outline">
                        <ShoppingCart className="w-3 h-3 mr-1" />
                        Ordine Creato
                      </Badge>
                    )}

                    {/* Badge Galleria Creata */}
                    {getGalleryByBookingId(booking.id) && (
                      <Badge className="bg-purple-50 text-purple-700 border-purple-200" variant="outline">
                        <ImageIcon className="w-3 h-3 mr-1" />
                        Galleria Creata
                      </Badge>
                    )}

                    {/* Badge Selezione Completata */}
                    {(() => {
                      const gallery = getGalleryByBookingId(booking.id);
                      return gallery && gallery.selectionStatus === 'completed' && (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold" variant="outline">
                          ✓ Selezione Completata
                        </Badge>
                      );
                    })()}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenDetails(booking)}
                      data-testid={`button-view-${booking.id}`}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Dettagli
                    </Button>

                    {/* Pulsante + Ordine (solo se non esiste già) */}
                    {!getOrderByBookingId(booking.id) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedBookingForOrder(booking)}
                        className="border-sage text-sage hover:bg-sage hover:text-white"
                        data-testid={`button-create-order-${booking.id}`}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Ordine
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setFilterBookingId(booking.id);
                          setActiveTab('orders');
                        }}
                        className="border-green-500 text-green-500 hover:bg-green-500 hover:text-white"
                        data-testid={`button-manage-order-${booking.id}`}
                      >
                        <Receipt className="w-4 h-4 mr-1" />
                        Gestisci Ordine
                      </Button>
                    )}

                    {/* Pulsante + Galleria (solo se non esiste già) */}
                    {!getGalleryByBookingId(booking.id) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedBookingForGallery(booking)}
                        className="border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white"
                        data-testid={`button-create-gallery-${booking.id}`}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Galleria
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const gallery = getGalleryByBookingId(booking.id);
                          if (gallery) {
                            window.location.href = `/admin/gallery/${gallery.id}/manage`;
                          }
                        }}
                        className="border-purple-500 text-purple-500 hover:bg-purple-500 hover:text-white"
                        data-testid={`button-manage-gallery-${booking.id}`}
                      >
                        <ImageIcon className="w-4 h-4 mr-1" />
                        Gestisci Galleria
                      </Button>
                    )}

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
            <Button 
              variant="outline" 
              onClick={() => {
                if (selectedBooking) {
                  handleOpenEdit(selectedBooking);
                  setSelectedBooking(null);
                }
              }}
              data-testid="button-edit-booking"
            >
              ✏️ Modifica Dati
            </Button>
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

      {/* Dialog modifica prenotazione */}
      <Dialog open={!!editBooking} onOpenChange={() => setEditBooking(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-playfair text-2xl">
              ✏️ Modifica Prenotazione
            </DialogTitle>
            <DialogDescription>
              Modifica i dati della prenotazione. Se cambi l'email, verrà inviata una notifica al cliente.
            </DialogDescription>
          </DialogHeader>

          {editBooking && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-nome">Nome *</Label>
                  <Input
                    id="edit-nome"
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    placeholder="Nome cliente"
                    data-testid="input-edit-nome"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-cognome">Cognome *</Label>
                  <Input
                    id="edit-cognome"
                    value={editCognome}
                    onChange={(e) => setEditCognome(e.target.value)}
                    placeholder="Cognome cliente"
                    data-testid="input-edit-cognome"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-email">Email *</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="email@esempio.com"
                  data-testid="input-edit-email"
                />
                {editEmail !== editBooking.cliente.email && (
                  <Alert className="bg-orange-50 border-orange-200">
                    <AlertCircle className="w-4 h-4 text-orange-600" />
                    <AlertDescription className="text-orange-800 text-sm">
                      📧 <strong>Attenzione:</strong> Stai modificando l'email. Verrà inviata automaticamente una notifica al cliente al nuovo indirizzo.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-whatsapp">WhatsApp *</Label>
                <Input
                  id="edit-whatsapp"
                  value={editWhatsapp}
                  onChange={(e) => setEditWhatsapp(e.target.value)}
                  placeholder="+39 XXX XXX XXXX"
                  data-testid="input-edit-whatsapp"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-note">Note</Label>
                <Input
                  id="edit-note"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Note aggiuntive (opzionale)"
                  data-testid="input-edit-note"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  ℹ️ <strong>Info:</strong> I campi marcati con * sono obbligatori. Le modifiche verranno salvate immediatamente.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditBooking(null)}
              disabled={updateBookingMutation.isPending}
            >
              Annulla
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateBookingMutation.isPending}
              className="bg-sage hover:bg-dark-sage"
              data-testid="button-save-edit"
            >
              {updateBookingMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                <>
                  ✓ Salva Modifiche
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog creazione ordine da booking */}
      {selectedBookingForOrder && (
        <CreateOrderDialog
          booking={selectedBookingForOrder}
          products={products}
          onClose={() => setSelectedBookingForOrder(null)}
          onSubmit={(orderData) => createOrderMutation.mutate(orderData)}
          isPending={createOrderMutation.isPending}
        />
      )}

      {/* Dialog creazione galleria da booking */}
      {selectedBookingForGallery && (() => {
        const campaign = campaigns.find(c => c.id === selectedBookingForGallery.campaignId);
        return (
          <NewGalleryModal
            isOpen={true}
            onClose={() => setSelectedBookingForGallery(null)}
            onGalleryCreated={() => {
              queryClient.invalidateQueries({ queryKey: ['galleries'] });
              setSelectedBookingForGallery(null);
              toast({
                title: 'Galleria creata',
                description: 'La galleria è stata creata con successo',
              });
            }}
            prePopulate={{
              name: campaign
                ? `${selectedBookingForGallery.cliente.nome} ${selectedBookingForGallery.cliente.cognome} - ${campaign.nome}`
                : `${selectedBookingForGallery.cliente.nome} ${selectedBookingForGallery.cliente.cognome}`,
              date: formatDateForInput(selectedBookingForGallery.dataShootingInizio),
              specialTheme: campaign?.temaStagionale || undefined,
              bookingId: selectedBookingForGallery.id, // Link galleria a booking
              prodottoId: selectedBookingForGallery.prodottoId, // Fetch product data per auto-populate selection
              clienteEmail: selectedBookingForGallery.cliente.email, // Email for gallery ready notification
              clienteNome: `${selectedBookingForGallery.cliente.nome} ${selectedBookingForGallery.cliente.cognome}`, // Nome completo per email
            }}
          />
        );
      })()}
        </>
      )}

      {/* Contenuto Tab Ordini */}
      {activeTab === 'orders' && (
        <>
          {filterBookingId && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">
                  Filtrando ordini per prenotazione selezionata
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilterBookingId(null)}
                className="text-blue-600 hover:text-blue-800"
              >
                Mostra tutti gli ordini
              </Button>
            </div>
          )}
          <OrdersManager filterBookingId={filterBookingId} />
        </>
      )}
    </div>
  );
}

/**
 * Dialog creazione ordine da booking
 */
interface CreateOrderDialogProps {
  booking: Booking;
  products: Product[];
  onClose: () => void;
  onSubmit: (orderData: any) => void;
  isPending: boolean;
}

function CreateOrderDialog({ booking, products, onClose, onSubmit, isPending }: CreateOrderDialogProps) {
  const [selectedProducts, setSelectedProducts] = useState<Array<{
    prodottoId: string;
    quantita: number;
  }>>([]);
  const [acconto, setAcconto] = useState<number>(0);
  const [note, setNote] = useState<string>('');

  // Pre-popola prodotto da booking se disponibile (solo al mount)
  useEffect(() => {
    if (booking.prodottoId) {
      setSelectedProducts([{ prodottoId: booking.prodottoId, quantita: 1 }]);
    }
  }, []);

  // Helper: Aggiungi prodotto vuoto
  const addProduct = () => {
    setSelectedProducts([...selectedProducts, { prodottoId: '', quantita: 1 }]);
  };

  // Helper: Rimuovi prodotto
  const removeProduct = (index: number) => {
    setSelectedProducts(selectedProducts.filter((_, i) => i !== index));
  };

  // Helper: Aggiorna prodotto
  const updateProduct = (index: number, field: 'prodottoId' | 'quantita', value: string | number) => {
    const updated = [...selectedProducts];
    updated[index] = { ...updated[index], [field]: value };
    setSelectedProducts(updated);
  };

  // Helper: Calcola subtotale per prodotto
  const getProductSubtotal = (prodottoId: string, quantita: number): number => {
    const product = products.find(p => p.id === prodottoId);
    if (!product) return 0;
    return product.prezzoFinale * quantita;
  };

  // Helper: Calcola totale ordine
  const calculateTotale = (): number => {
    return selectedProducts.reduce((sum, item) => {
      return sum + getProductSubtotal(item.prodottoId, item.quantita);
    }, 0);
  };

  // Handler: Submit ordine
  const handleSubmit = () => {
    // Validation
    if (selectedProducts.length === 0) {
      alert('Seleziona almeno un prodotto');
      return;
    }

    // Verifica che tutti prodotti siano selezionati
    if (selectedProducts.some(p => !p.prodottoId || p.quantita <= 0)) {
      alert('Completa tutti i prodotti con quantità valida');
      return;
    }

    // Costruisci array OrderItem con snapshot
    const prodottiOrderItems: OrderItem[] = selectedProducts.map(item => {
      const product = products.find(p => p.id === item.prodottoId)!;
      return {
        prodottoId: product.id,
        prodottoNome: product.nome,
        prodottoPrezzo: product.prezzoFinale,
        prodottoNumeroFoto: product.numeroFoto,
        quantita: item.quantita,
      };
    });

    const totale = calculateTotale();

    // Crea ordine
    const orderData = {
      bookingId: booking.id,
      nomeCliente: `${booking.cliente.nome} ${booking.cliente.cognome}`,
      emailCliente: booking.cliente.email,
      whatsappCliente: booking.cliente.whatsapp,
      prodotti: prodottiOrderItems,
      acconto,
      note,
      stato: 'bozza' as const,
    };

    onSubmit(orderData);
  };

  const totale = calculateTotale();

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-playfair text-2xl flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-sage" />
            Crea Ordine da Prenotazione
          </DialogTitle>
          <DialogDescription>
            Cliente: {booking.cliente.nome} {booking.cliente.cognome}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Prodotti */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Prodotti</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addProduct}
                className="border-sage text-sage hover:bg-sage hover:text-white"
                data-testid="button-add-product"
              >
                <Plus className="w-4 h-4 mr-1" />
                Aggiungi Prodotto
              </Button>
            </div>

            {selectedProducts.length === 0 ? (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>Nessun prodotto aggiunto</p>
                <p className="text-sm mt-1">Clicca "Aggiungi Prodotto" per iniziare</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedProducts.map((item, index) => {
                  const product = products.find(p => p.id === item.prodottoId);
                  const subtotale = getProductSubtotal(item.prodottoId, item.quantita);

                  return (
                    <div key={index} className="flex items-center gap-3 p-4 border rounded-lg bg-white">
                      <div className="flex-1">
                        <Select
                          value={item.prodottoId}
                          onValueChange={(value) => updateProduct(index, 'prodottoId', value)}
                        >
                          <SelectTrigger data-testid={`select-product-${index}`}>
                            <SelectValue placeholder="Seleziona prodotto" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.nome} - €{p.prezzoFinale.toFixed(2)} ({p.numeroFoto} foto)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="w-24">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantita}
                          onChange={(e) => updateProduct(index, 'quantita', parseInt(e.target.value) || 1)}
                          placeholder="Qtà"
                          data-testid={`input-quantity-${index}`}
                        />
                      </div>

                      <div className="w-28 text-right font-medium">
                        €{subtotale.toFixed(2)}
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeProduct(index)}
                        data-testid={`button-remove-product-${index}`}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Riepilogo totale */}
          <div className="bg-sage/10 p-4 rounded-lg">
            <div className="flex justify-between items-center text-lg font-bold">
              <span>Totale Ordine:</span>
              <span className="text-sage">€{totale.toFixed(2)}</span>
            </div>
          </div>

          {/* Acconto */}
          <div>
            <Label htmlFor="acconto" className="mb-2 block">Acconto (opzionale)</Label>
            <Input
              id="acconto"
              type="number"
              min="0"
              max={totale}
              step="0.01"
              value={acconto}
              onChange={(e) => setAcconto(parseFloat(e.target.value) || 0)}
              placeholder="Inserisci acconto in euro"
              data-testid="input-acconto"
            />
            {acconto > 0 && (
              <p className="text-sm text-gray-600 mt-1">
                Saldo da versare: €{(totale - acconto).toFixed(2)}
              </p>
            )}
          </div>

          {/* Note */}
          <div>
            <Label htmlFor="note" className="mb-2 block">Note (opzionale)</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note aggiuntive per l'ordine"
              data-testid="input-note"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Annulla
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || selectedProducts.length === 0}
            className="bg-sage hover:bg-dark-sage"
            data-testid="button-submit-order"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creazione...
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4 mr-2" />
                Crea Ordine
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Manual Booking Modal */}
    <ManualBookingModal
      isOpen={showManualBookingModal}
      onClose={() => setShowManualBookingModal(false)}
      onSuccess={() => {
        queryClient.invalidateQueries({ queryKey: ['bookings'] });
        refetch();
      }}
    />
  );
}
