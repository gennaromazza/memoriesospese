/**
 * Gestione Commesse - Vista unificata Prenotazioni + Ordini + Gallerie
 * Gestisce il workflow operativo completo con stati e email automatiche
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllBookings, updateWorkflowState } from '@/lib/bookings';
import { getAllOrders } from '@/lib/orders';
import { getAllGalleries } from '@/lib/galleries';
import type { Booking, Order, WorkflowState } from '@shared/booking-types';
import type { Gallery } from '@/lib/types';
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
import { Loader2, Calendar, Package, Image, CheckCircle, Clock, Truck, Box } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

export default function GestioneCommesse() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filtroStato, setFiltroStato] = useState<WorkflowState | 'all'>('all');

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
    queryFn: () => getAllGalleries(true),
  });

  // Combina dati in commesse unificate
  const commesse: Commessa[] = [];

  // 1. Aggiungi tutte le prenotazioni come commesse
  bookings.forEach((booking) => {
    const linkedOrder = orders.find(o => o.bookingId === booking.id);
    const linkedGallery = galleries.find(g => 
      g.bookingId === booking.id || g.orderId === linkedOrder?.id
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

    const linkedGallery = galleries.find(g => g.orderId === order.id);

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
  const commesseFiltrate = filtroStato === 'all' 
    ? commesse 
    : commesse.filter(c => c.statoWorkflow === filtroStato);

  // Ordina per data servizio (più recenti prima)
  commesseFiltrate.sort((a, b) => {
    if (!a.dataServizio) return 1;
    if (!b.dataServizio) return -1;
    return b.dataServizio.getTime() - a.dataServizio.getTime();
  });

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
      {/* Header e Filtri */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-playfair font-bold text-dark-sage">Gestione Commesse</h2>
          <p className="text-sm text-gray-600 mt-1">
            Vista unificata di prenotazioni, ordini e gallerie con workflow completo
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant={filtroStato === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFiltroStato('all')}
          >
            Tutte ({commesse.length})
          </Button>
          <Button
            variant={filtroStato === 'shooting_da_svolgere' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFiltroStato('shooting_da_svolgere')}
            className="flex items-center gap-1"
          >
            <Calendar className="w-3 h-3" />
            Da Svolgere
          </Button>
          <Button
            variant={filtroStato === 'shooting_svolto' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFiltroStato('shooting_svolto')}
            className="flex items-center gap-1"
          >
            <CheckCircle className="w-3 h-3" />
            Svolti
          </Button>
          <Button
            variant={filtroStato === 'inizio_lavorazione' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFiltroStato('inizio_lavorazione')}
            className="flex items-center gap-1"
          >
            <Clock className="w-3 h-3" />
            Da Lavorare
          </Button>
          <Button
            variant={filtroStato === 'pronto_consegna' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFiltroStato('pronto_consegna')}
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
        <div className="space-y-4">
          {commesseFiltrate.map((commessa) => (
            <Card key={commessa.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  {/* Cliente */}
                  <div className="md:col-span-3">
                    <p className="font-semibold text-dark-sage">{commessa.clienteNome}</p>
                    <p className="text-xs text-gray-500">{commessa.clienteEmail}</p>
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
                  <div className="md:col-span-3">
                    {commessa.prodottiNomi.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {commessa.prodottiNomi.map((nome, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {nome}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">Nessun prodotto</p>
                    )}
                  </div>

                  {/* Collegamenti */}
                  <div className="md:col-span-2 flex gap-2">
                    {commessa.hasOrder && (
                      <Badge variant="secondary" className="text-xs">
                        <Package className="w-3 h-3 mr-1" />
                        Ordine
                      </Badge>
                    )}
                    {commessa.hasGallery && (
                      <Badge variant="secondary" className="text-xs">
                        <Image className="w-3 h-3 mr-1" />
                        Galleria
                      </Badge>
                    )}
                  </div>

                  {/* Stato Workflow + Cambio Stato */}
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
                      <SelectTrigger className="mt-2 h-8 text-xs">
                        <SelectValue placeholder="Cambia stato" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" disabled>
                          Seleziona stato
                        </SelectItem>
                        <SelectItem value="shooting_da_svolgere">
                          📅 Shooting da Svolgere
                        </SelectItem>
                        <SelectItem value="shooting_svolto">
                          ✅ Shooting Svolto
                        </SelectItem>
                        <SelectItem value="inizio_lavorazione">
                          ⏳ Inizio Lavorazione
                        </SelectItem>
                        <SelectItem value="pronto_consegna">
                          🎁 Pronto Consegna
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
