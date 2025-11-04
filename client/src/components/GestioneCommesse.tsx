/**
 * Gestione Commesse - Vista unificata Prenotazioni + Ordini + Gallerie
 * Gestisce il workflow operativo completo con stati e email automatiche
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllBookings, updateWorkflowState } from '@/lib/bookings';
import { getAllOrders } from '@/lib/orders';
import { GalleryService, type Gallery } from '@/lib/galleries';
import type { Booking, Order, WorkflowState } from '@shared/booking-types';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Calendar, Package, Image, CheckCircle, Clock, Truck, Box, Edit2, Plus, ExternalLink, Mail, MessageCircle, Search, ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

// Tipo per commessa unificata
interface Commessa {
  id: string;
  tipo: 'booking' | 'order';
  booking?: Booking;
  order?: Order;
  gallery?: Gallery;
  
  // Dati cliente
  clienteNome: string;
  clienteEmail: string;
  clienteWhatsapp?: string;
  
  // Dati servizio
  dataServizio?: Date;
  prodottiNomi: string[];
  
  // Stato workflow
  statoWorkflow?: WorkflowState;
  
  // Collegamenti
  hasOrder: boolean;
  hasGallery: boolean;
  orderId?: string;
  galleryId?: string;
}

// Type per tab validi
type ValidTab = 'galleries' | 'users' | 'slideshow' | 'requests' | 'email' | 'questionnaire' | 'settings' | 'cassa' | 'bookings' | 'commesse' | 'themes';

// Props interface
interface GestioneCommesseProps {
  onNavigateToTab: (tab: ValidTab) => void;
  onEditGallery: (gallery: Gallery) => void;
  onCreateGallery: () => void;
  onOpenBooking?: (bookingId: string) => void;
  onOpenOrder?: (orderId: string) => void;
  onOpenPhotoSelection?: (gallery: Gallery) => void;
}

// Helper: Mappa stato a badge
function getStatoBadge(stato?: WorkflowState) {
  if (!stato) return null;
  
  const configs = {
    shooting_da_svolgere: { label: 'Shooting da Svolgere', color: 'bg-blue-100 text-blue-800', icon: Calendar },
    shooting_svolto: { label: 'Shooting Svolto', color: 'bg-yellow-100 text-yellow-800', icon: CheckCircle },
    inizio_lavorazione: { label: 'In Lavorazione', color: 'bg-orange-100 text-orange-800', icon: Clock },
    pronto_consegna: { label: 'Pronto Consegna', color: 'bg-green-100 text-green-800', icon: Truck },
  };
  
  const config = configs[stato];
  const Icon = config.icon;
  
  return (
    <Badge className={`${config.color} flex items-center gap-1`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

export default function GestioneCommesse({ 
  onNavigateToTab, 
  onEditGallery, 
  onCreateGallery,
  onOpenBooking,
  onOpenOrder,
  onOpenPhotoSelection
}: GestioneCommesseProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filtroStato, setFiltroStato] = useState<WorkflowState | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Query dati
  const { data: bookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ['bookings'],
    queryFn: getAllBookings,
  });

  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['orders'],
    queryFn: getAllOrders,
  });

  const { data: galleries = [], isLoading: loadingGalleries } = useQuery({
    queryKey: ['galleries', 'admin'],
    queryFn: GalleryService.getAllGalleriesForAdmin,
  });

  // Combina dati in commesse unificate
  const commesse: Commessa[] = [];

  // 1. Aggiungi tutte le prenotazioni come commesse
  bookings.forEach((booking) => {
    const linkedOrder = orders.find(o => o.bookingId === booking.id);
    const linkedGallery = galleries.find(g => 
      g.bookingId === booking.id
    );

    commesse.push({
      id: booking.id,
      tipo: 'booking',
      booking,
      order: linkedOrder,
      gallery: linkedGallery,
      clienteNome: `${booking.cliente.nome} ${booking.cliente.cognome}`,
      clienteEmail: booking.cliente.email,
      clienteWhatsapp: booking.cliente.whatsapp,
      dataServizio: booking.dataShootingInizio?.toDate ? booking.dataShootingInizio.toDate() : undefined,
      prodottiNomi: linkedOrder ? linkedOrder.prodotti.map(p => p.prodottoNome) : (booking.prodottoNome ? [booking.prodottoNome] : []),
      statoWorkflow: booking.statoWorkflow || linkedOrder?.statoWorkflow,
      hasOrder: !!linkedOrder,
      hasGallery: !!linkedGallery,
      orderId: linkedOrder?.id,
      galleryId: linkedGallery?.id,
    });
  });

  // 2. Aggiungi ordini standalone (senza booking)
  orders.forEach((order) => {
    const hasBooking = bookings.some(b => b.id === order.bookingId);
    if (hasBooking) return; // Già gestito sopra

    // Per ordini con bookingId, cerca galleria via booking
    const linkedGallery = order.bookingId 
      ? galleries.find(g => g.bookingId === order.bookingId)
      : undefined;

    commesse.push({
      id: order.id,
      tipo: 'order',
      order,
      gallery: linkedGallery,
      clienteNome: order.nomeCliente || 'N/A',
      clienteEmail: order.emailCliente || '',
      clienteWhatsapp: order.whatsappCliente,
      dataServizio: order.dataServizio?.toDate ? order.dataServizio.toDate() : undefined,
      prodottiNomi: order.prodotti.map(p => p.prodottoNome),
      statoWorkflow: order.statoWorkflow,
      hasOrder: true,
      hasGallery: !!linkedGallery,
      orderId: order.id,
      galleryId: linkedGallery?.id,
    });
  });

  // Filtra per stato
  let commesseFiltrate = filtroStato === 'all' 
    ? commesse 
    : commesse.filter(c => c.statoWorkflow === filtroStato);

  // Filtra per ricerca (nome cliente o email)
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    commesseFiltrate = commesseFiltrate.filter(c => 
      c.clienteNome.toLowerCase().includes(query) ||
      c.clienteEmail.toLowerCase().includes(query)
    );
  }

  // Ordina per data servizio (più recenti prima)
  commesseFiltrate.sort((a, b) => {
    if (!a.dataServizio) return 1;
    if (!b.dataServizio) return -1;
    return b.dataServizio.getTime() - a.dataServizio.getTime();
  });

  // Paginazione
  const totalPages = Math.ceil(commesseFiltrate.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const commessePaginate = commesseFiltrate.slice(startIndex, endIndex);

  // Reset pagina quando cambiano filtri
  const resetPage = () => setCurrentPage(1);

  const isLoading = loadingBookings || loadingOrders || loadingGalleries;

  // Mutation cambio stato workflow
  const cambioStatoMutation = useMutation({
    mutationFn: async ({ 
      commessa, 
      nuovoStato 
    }: { 
      commessa: Commessa; 
      nuovoStato: WorkflowState 
    }) => {
      // Prepara dati email
      const prodottoNome = commessa.prodottiNomi.length > 0 
        ? commessa.prodottiNomi[0] 
        : undefined;
      
      const bookingDate = commessa.dataServizio 
        ? format(commessa.dataServizio, 'dd MMMM yyyy', { locale: it })
        : undefined;

      const datiEmail = {
        clienteNome: commessa.clienteNome,
        clienteEmail: commessa.clienteEmail,
        prodottoNome,
        campaignName: commessa.booking?.campaignId, // TODO: Recuperare nome campagna se necessario
        bookingDate,
      };

      // Aggiorna stato (sincronizza booking + order + email)
      await updateWorkflowState(
        commessa.id,
        commessa.tipo,
        nuovoStato,
        datiEmail
      );
    },
    onSuccess: () => {
      // Invalida cache per ricaricare dati
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      
      toast({
        title: 'Stato aggiornato',
        description: 'Lo stato della commessa è stato aggiornato e il cliente ha ricevuto una notifica via email',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore aggiornamento stato',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handler cambio stato
  const handleCambioStato = (commessa: Commessa, nuovoStato: WorkflowState) => {
    cambioStatoMutation.mutate({ commessa, nuovoStato });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-sage" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-playfair font-bold text-dark-sage">Gestione Commesse</h2>
            <p className="text-sm text-gray-600 mt-1">
              Vista unificata di prenotazioni, ordini e gallerie con workflow completo
            </p>
          </div>

          {/* Barra Ricerca */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Cerca per nome o email..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                resetPage();
              }}
            />
          </div>
        </div>

        {/* Filtri Stato */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filtroStato === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setFiltroStato('all');
              resetPage();
            }}
          >
            Tutte ({commesse.length})
          </Button>
          <Button
            variant={filtroStato === 'shooting_da_svolgere' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setFiltroStato('shooting_da_svolgere');
              resetPage();
            }}
            className="flex items-center gap-1"
          >
            <Calendar className="w-3 h-3" />
            Da Svolgere
          </Button>
          <Button
            variant={filtroStato === 'shooting_svolto' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setFiltroStato('shooting_svolto');
              resetPage();
            }}
            className="flex items-center gap-1"
          >
            <CheckCircle className="w-3 h-3" />
            Svolti
          </Button>
          <Button
            variant={filtroStato === 'inizio_lavorazione' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setFiltroStato('inizio_lavorazione');
              resetPage();
            }}
            className="flex items-center gap-1"
          >
            <Clock className="w-3 h-3" />
            Da Lavorare
          </Button>
          <Button
            variant={filtroStato === 'pronto_consegna' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setFiltroStato('pronto_consegna');
              resetPage();
            }}
            className="flex items-center gap-1"
          >
            <Truck className="w-3 h-3" />
            Pronti
          </Button>
        </div>
      </div>

      {/* Tabella Commesse */}
      {commesseFiltrate.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Box className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">
              {filtroStato === 'all' 
                ? 'Nessuna commessa trovata' 
                : `Nessuna commessa con stato "${filtroStato}"`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {commessePaginate.map((commessa) => (
            <Card key={commessa.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  {/* Cliente */}
                  <div className="md:col-span-2">
                    <p className="font-semibold text-dark-sage text-sm">{commessa.clienteNome}</p>
                    <p className="text-xs text-gray-500 truncate">{commessa.clienteEmail}</p>
                    {commessa.clienteWhatsapp && (
                      <p className="text-xs text-gray-500">📱 {commessa.clienteWhatsapp}</p>
                    )}
                  </div>

                  {/* Data Servizio */}
                  <div className="md:col-span-2">
                    {commessa.dataServizio ? (
                      <>
                        <p className="text-sm font-medium">
                          {format(commessa.dataServizio, 'dd MMM yyyy', { locale: it })}
                        </p>
                        <p className="text-xs text-gray-500">
                          {format(commessa.dataServizio, 'HH:mm')}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400">Data non specificata</p>
                    )}
                  </div>

                  {/* Prodotti */}
                  <div className="md:col-span-2">
                    {commessa.prodottiNomi.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {commessa.prodottiNomi.slice(0, 2).map((nome, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {nome}
                          </Badge>
                        ))}
                        {commessa.prodottiNomi.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{commessa.prodottiNomi.length - 2}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">N/A</p>
                    )}
                  </div>

                  {/* Info Pagamenti & Foto */}
                  <div className="md:col-span-1 flex flex-col gap-1">
                    {/* Badge Pagamento Ordine */}
                    {commessa.order && (
                      <div title={`Totale: €${commessa.order.totale} | Acconto: €${commessa.order.acconto} | Saldo: €${commessa.order.saldo}`}>
                        {commessa.order.saldo === 0 ? (
                          <Badge className="bg-green-100 text-green-800 text-xs px-1 py-0">
                            Saldato
                          </Badge>
                        ) : commessa.order.acconto > 0 ? (
                          <Badge className="bg-yellow-100 text-yellow-800 text-xs px-1 py-0">
                            Acconto
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 text-xs px-1 py-0">
                            Da pagare
                          </Badge>
                        )}
                      </div>
                    )}
                    
                    {/* Counter Foto Galleria */}
                    {commessa.gallery && (
                      <div title={`${commessa.gallery.photoCount || 0} foto caricate`}>
                        <Badge variant="outline" className="text-xs px-1 py-0">
                          {commessa.gallery.photoCount || 0} 📸
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Stato Workflow */}
                  <div className="md:col-span-2">
                    {getStatoBadge(commessa.statoWorkflow)}
                    <Select
                      value={commessa.statoWorkflow || 'none'}
                      onValueChange={(value) => {
                        if (value !== 'none') {
                          handleCambioStato(commessa, value as WorkflowState);
                        }
                      }}
                      disabled={cambioStatoMutation.isPending}
                    >
                      <SelectTrigger className="mt-2 h-7 text-xs">
                        <SelectValue placeholder="Cambia" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" disabled>Seleziona stato</SelectItem>
                        <SelectItem value="shooting_da_svolgere">📅 Da Svolgere</SelectItem>
                        <SelectItem value="shooting_svolto">✅ Svolto</SelectItem>
                        <SelectItem value="inizio_lavorazione">⏳ Lavorazione</SelectItem>
                        <SelectItem value="pronto_consegna">🎁 Pronto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Azioni Rapide */}
                  <div className="md:col-span-3 flex flex-wrap gap-2">
                    {/* Bottone Booking */}
                    {commessa.booking && onOpenBooking && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2"
                        onClick={() => onOpenBooking(commessa.booking!.id)}
                        title="Apri dettaglio prenotazione"
                      >
                        <Calendar className="w-3 h-3 mr-1" />
                        Booking
                      </Button>
                    )}

                    {/* Bottone Ordine */}
                    {commessa.hasOrder && commessa.order && onOpenOrder && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2"
                        onClick={() => onOpenOrder(commessa.order!.id)}
                        title="Apri dettaglio ordine"
                      >
                        <Package className="w-3 h-3 mr-1" />
                        Ordine
                      </Button>
                    )}

                    {/* Azioni Galleria */}
                    {commessa.hasGallery && commessa.gallery ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2"
                          onClick={() => onEditGallery(commessa.gallery!)}
                          title="Modifica Galleria"
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Galleria
                        </Button>
                        
                        {/* Bottone Gestisci Selezioni - solo se enablePhotoSelection */}
                        {commessa.gallery.enablePhotoSelection && onOpenPhotoSelection && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-2"
                            onClick={() => onOpenPhotoSelection(commessa.gallery!)}
                            title="Gestisci selezioni foto"
                          >
                            <Heart className="w-3 h-3 mr-1" />
                            Selezioni
                          </Button>
                        )}
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2"
                        onClick={() => onCreateGallery()}
                        title="Crea Galleria"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Galleria
                      </Button>
                    )}

                    {/* Link Cliente */}
                    <a
                      href={`mailto:${commessa.clienteEmail}`}
                      className="inline-flex items-center justify-center h-7 px-2 text-xs border rounded hover:bg-gray-50"
                      title="Invia Email"
                    >
                      <Mail className="w-3 h-3" />
                    </a>

                    {commessa.clienteWhatsapp && (
                      <a
                        href={`https://wa.me/${commessa.clienteWhatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-7 px-2 text-xs border rounded hover:bg-gray-50"
                        title="Apri WhatsApp"
                      >
                        <MessageCircle className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            ))}
          </div>

          {/* Paginazione */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-gray-600">
                Mostrando {startIndex + 1}-{Math.min(endIndex, commesseFiltrate.length)} di {commesseFiltrate.length} commesse
              </p>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Precedente
                </Button>
                
                <div className="flex items-center gap-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <Button
                      key={page}
                      variant={currentPage === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className="w-8 h-8 p-0"
                    >
                      {page}
                    </Button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Successiva
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
