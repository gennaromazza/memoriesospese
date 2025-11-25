import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import {
  getAllOrders,
  deleteOrder,
  recordAccontoPayment,
  addAccontoPayment,
  recordSaldoPayment,
  updateOrder,
  createOrder,
  markTransactionEmailSent,
  getOrderPaymentStatus,
  getOrderTotals,
} from '@/lib/orders';
import { getAllBookings } from '@/lib/bookings';
import { getActiveProducts } from '@/lib/products';
import type { Order, Booking, InsertOrder, Product } from '@shared/booking-types';
import EditOrderModal from '@/components/EditOrderModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Eye,
  Trash2,
  Plus,
  Search,
  Euro,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Edit,
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

type OrderWithBooking = Order & {
  booking?: Booking;
};

interface OrdersManagerProps {
  filterBookingId?: string | null;
  highlightOrderId?: string | null;
  onHighlightComplete?: () => void;
}

export function OrdersManager({ 
  filterBookingId,
  highlightOrderId,
  onHighlightComplete
}: OrdersManagerProps = {}) {
  const { toast } = useToast();
  
  // State: Filtri e ricerca
  const [statoFilter, setStatoFilter] = useState<string>('tutti');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderWithBooking | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<{
    orderId: string;
    tipo: 'acconto' | 'saldo';
  } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'contante' | 'carta' | 'bonifico' | 'paypal'>('contante');
  const [paymentAmount, setPaymentAmount] = useState<string>(''); // String per input controlled
  const [paymentNote, setPaymentNote] = useState<string>(''); // Note opzionali
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const orderRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clearHighlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Query: Carica ordini
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: getAllOrders,
  });

  // Query: Carica bookings
  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings'],
    queryFn: getAllBookings,
  });

  // Query: Carica prodotti per EditOrderModal
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: getActiveProducts,
  });

  // Arricchisci ordini con dati booking
  const ordersWithBookings: OrderWithBooking[] = useMemo(() => {
    return orders.map(order => {
      const booking = order.bookingId 
        ? bookings.find(b => b.id === order.bookingId)
        : undefined;
      
      return { ...order, booking };
    });
  }, [orders, bookings]);

  // Mutation: Elimina ordine
  const deleteMutation = useMutation({
    mutationFn: deleteOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({
        title: 'Ordine eliminato',
        description: 'L\'ordine è stato rimosso dal sistema',
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

  // Mutation: Registra pagamento acconto (supporta acconti multipli)
  const accontoMutation = useMutation({
    mutationFn: ({ 
      orderId, 
      importo, 
      metodo, 
      note 
    }: { 
      orderId: string; 
      importo: number; 
      metodo: 'contante' | 'carta' | 'bonifico' | 'paypal';
      note?: string;
    }) => addAccontoPayment(orderId, importo, metodo, note),
    onSuccess: async (result, variables) => {
      // Estrai transaction e index dal risultato
      const { transaction, index: transactionIndex } = result;
      
      // Recupera ordine per email (prima dell'aggiornamento, calcola i nuovi valori)
      const order = orders.find(o => o.id === variables.orderId);
      // Guard: skip email se emailCliente è vuota/blank
      if (order && order.emailCliente?.trim() && order.nomeCliente?.trim()) {
        try {
          // Calcola valori aggiornati per email usando helper unificato
          const orderTotals = getOrderTotals(order);
          const nuovoAccontoTotale = orderTotals.totalePagato + variables.importo;
          const nuovoSaldo = orderTotals.totale - nuovoAccontoTotale;
          
          // Calcola il nome prodotto per l'email (primo prodotto o "Ordine Multi-Prodotto")
          const prodottoNome = order.prodotti && order.prodotti.length > 0
            ? order.prodotti.length === 1 
              ? order.prodotti[0].prodottoNome
              : `Ordine Multi-Prodotto (${order.prodotti.length} prodotti)`
            : "Ordine";

          // Invia email notifica acconto al cliente con cronologia completa (include transaction appena creata)
          const updatedTransactions = [...(order.transactions || []), transaction];
          
          await fetch('/api/email/acconto-received', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipientEmail: order.emailCliente,
              clienteName: order.nomeCliente,
              prodottoNome,
              accontoImporto: variables.importo,
              accontoTotale: nuovoAccontoTotale,
              saldoRimanente: nuovoSaldo,
              metodo: variables.metodo,
              note: variables.note,
              totaleOrdine: orderTotals.totale, // Usa totale da helper unificato
              transactions: updatedTransactions // Cronologia completa pagamenti inclusa ultima transaction
            })
          });
          
          console.log('✅ Email acconto inviata a', order.emailCliente);
          
          // Marca transaction come email inviata
          try {
            await markTransactionEmailSent(variables.orderId, transactionIndex);
            console.log('✅ Transaction marcata come email inviata');
          } catch (markError) {
            console.error('❌ Errore marking email sent:', markError);
          }
        } catch (emailError) {
          console.error('❌ Errore invio email acconto:', emailError);
          // Non bloccare il successo se email fallisce
        }
      }
      
      // Invalida cache DOPO email send e mark (evita race condition con stale data)
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      
      toast({
        title: 'Acconto registrato',
        description: 'Il pagamento dell\'acconto è stato salvato con successo',
      });
      setPaymentDialog(null);
      setPaymentAmount('');
      setPaymentNote('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore registrazione',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation: Registra pagamento saldo
  const saldoMutation = useMutation({
    mutationFn: ({ orderId, metodo, note }: { orderId: string; metodo: 'contante' | 'carta' | 'bonifico' | 'paypal'; note?: string }) =>
      recordSaldoPayment(orderId, metodo, note),
    onSuccess: async (result, variables) => {
      // Estrai transaction e index dal risultato
      const { transaction, index: transactionIndex } = result;
      
      // Recupera ordine per email PRIMA dell'invalidazione (usa valori dal result)
      const order = orders.find(o => o.id === variables.orderId);
      // Guard: skip email se emailCliente è vuota/blank
      if (order && order.emailCliente?.trim() && order.nomeCliente?.trim()) {
        try {
          // Usa helper unificato per totali e importo dalla transaction appena creata
          const orderTotals = getOrderTotals(order);
          const saldoAmount = transaction.importo;
          
          // Calcola il nome prodotto per l'email (primo prodotto o "Ordine Multi-Prodotto")
          const prodottoNome = order.prodotti && order.prodotti.length > 0
            ? order.prodotti.length === 1 
              ? order.prodotti[0].prodottoNome
              : `Ordine Multi-Prodotto (${order.prodotti.length} prodotti)`
            : "Ordine";

          // Invia email notifica saldo al cliente con cronologia completa (include transaction appena creata)
          const updatedTransactions = [...(order.transactions || []), transaction];
          
          await fetch('/api/email/saldo-received', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipientEmail: order.emailCliente,
              clienteName: order.nomeCliente,
              prodottoNome,
              saldoAmount,
              totaleOrdine: orderTotals.totale, // Usa totale da helper unificato
              transactions: updatedTransactions // Cronologia completa pagamenti inclusa ultima transaction
            })
          });
          
          console.log('✅ Email saldo inviata a', order.emailCliente);
          
          // Marca transaction come email inviata
          try {
            await markTransactionEmailSent(variables.orderId, transactionIndex);
            console.log('✅ Transaction marcata come email inviata');
          } catch (markError) {
            console.error('❌ Errore marking email sent:', markError);
          }
        } catch (emailError) {
          console.error('❌ Errore invio email saldo:', emailError);
          // Non bloccare il successo se email fallisce
        }
      }
      
      // Invalida cache DOPO email send e mark (evita race condition con stale data)
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      
      toast({
        title: 'Saldo registrato',
        description: 'Il pagamento del saldo è stato completato',
      });
      setPaymentDialog(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore registrazione',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation: Cambia stato ordine
  const updateStatoMutation = useMutation({
    mutationFn: ({ orderId, stato }: { orderId: string; stato: 'bozza' | 'in_lavorazione' | 'completato' | 'annullato' }) =>
      updateOrder(orderId, { stato }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({
        title: 'Stato aggiornato',
        description: 'Lo stato dell\'ordine è stato modificato',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore aggiornamento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Helper: Ottieni ordine corrente dal paymentDialog
  const currentPaymentOrder = useMemo(() => {
    if (!paymentDialog) return null;
    return orders.find(o => o.id === paymentDialog.orderId);
  }, [paymentDialog, orders]);

  // Helper: Calcola riepilogo acconto usando helper unificati
  const accontoSummary = useMemo(() => {
    if (!currentPaymentOrder || !paymentDialog || paymentDialog.tipo !== 'acconto') {
      return null;
    }

    // Usa helper unificato per ottenere totali basati su transactions
    const totals = getOrderTotals(currentPaymentOrder);
    
    const importo = parseFloat(paymentAmount) || 0;
    const nuovoAccontoTotale = totals.totalePagato + importo;
    const nuovoSaldo = totals.totale - nuovoAccontoTotale;
    const saldoMassimo = totals.saldoResiduo; // Max aggiungibile = saldo residuo

    return {
      totale: totals.totale,
      accontoAttuale: totals.totalePagato, // Totale già pagato
      nuovoImporto: importo,
      nuovoAccontoTotale,
      nuovoSaldo,
      saldoMassimo,
      isValid: importo > 0 && nuovoAccontoTotale <= totals.totale,
    };
  }, [currentPaymentOrder, paymentDialog, paymentAmount]);

  // Handler: Registra pagamento
  const handlePayment = () => {
    if (!paymentDialog) return;

    if (paymentDialog.tipo === 'acconto') {
      // Validation importo
      const importo = parseFloat(paymentAmount);
      if (isNaN(importo) || importo <= 0) {
        toast({
          title: 'Importo non valido',
          description: 'Inserisci un importo maggiore di zero',
          variant: 'destructive',
        });
        return;
      }

      // Validation acconto totale <= totale ordine (già validato server-side, ma meglio client-side)
      if (!accontoSummary || !accontoSummary.isValid) {
        toast({
          title: 'Importo non valido',
          description: `L'acconto totale non può superare il totale ordine. Massimo aggiungibile: €${accontoSummary?.saldoMassimo.toFixed(2)}`,
          variant: 'destructive',
        });
        return;
      }

      // Mutation acconto con importo, metodo, note
      const mutationData: any = {
        orderId: paymentDialog.orderId,
        importo,
        metodo: paymentMethod,
      };
      
      // Aggiungi note solo se non vuota (evita undefined)
      const trimmedNote = paymentNote.trim();
      if (trimmedNote) {
        mutationData.note = trimmedNote;
      }
      
      accontoMutation.mutate(mutationData);
    } else {
      // Mutation saldo con metodo e note
      const saldoData: any = {
        orderId: paymentDialog.orderId,
        metodo: paymentMethod,
      };
      
      // Aggiungi note solo se non vuota (evita undefined)
      const trimmedNote = paymentNote.trim();
      if (trimmedNote) {
        saldoData.note = trimmedNote;
      }
      
      saldoMutation.mutate(saldoData);
    }
  };

  // Filtri: Ordini filtrati e cercati
  const filteredOrders = useMemo(() => {
    let result = ordersWithBookings;

    // Filtro per bookingId (se passato come prop)
    if (filterBookingId) {
      result = result.filter(o => o.bookingId === filterBookingId);
    }

    // Filtro per stato
    if (statoFilter !== 'tutti') {
      result = result.filter(o => o.stato === statoFilter);
    }

    // Ricerca per nome cliente (dalla booking), prodotto, galleria
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        o =>
          o.booking?.cliente?.nome?.toLowerCase().includes(query) ||
          o.booking?.cliente?.cognome?.toLowerCase().includes(query) ||
          o.booking?.cliente?.email?.toLowerCase().includes(query) ||
          o.prodotti?.some(p => p.prodottoNome.toLowerCase().includes(query)) ||
          o.galleryId?.toLowerCase().includes(query)
      );
    }

    // Ordina per data creazione (più recenti prima)
    return result.sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(0);
      const dateB = b.createdAt?.toDate?.() || new Date(0);
      return dateB.getTime() - dateA.getTime();
    });
  }, [ordersWithBookings, statoFilter, searchQuery, filterBookingId]);

  // Scroll e highlight ordine quando richiesto
  useEffect(() => {
    // Cleanup dei timeout precedenti
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    if (clearHighlightTimeoutRef.current) {
      clearTimeout(clearHighlightTimeoutRef.current);
      clearHighlightTimeoutRef.current = null;
    }

    if (!highlightOrderId) return;

    // Attendi il caricamento dei dati prima di procedere
    if (isLoading) {
      return;
    }

    // Cerca l'ordine nel dataset completo
    const targetOrder = orders.find(o => o.id === highlightOrderId);
    
    if (!targetOrder) {
      console.warn(`Ordine ${highlightOrderId} non trovato nel dataset`);
      onHighlightComplete?.();
      return;
    }

    // Calcola dove si trova l'ordine PRIMA di resettare i filtri
    // Usa orders direttamente (equivalente a filtri='tutti', search='')
    const sortedAllOrders = [...ordersWithBookings].sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(0);
      const dateB = b.createdAt?.toDate?.() || new Date(0);
      return dateB.getTime() - dateA.getTime();
    });
    
    const orderIndex = sortedAllOrders.findIndex(o => o.id === highlightOrderId);
    if (orderIndex === -1) {
      console.warn(`Ordine ${highlightOrderId} non trovato nella lista ordinata`);
      onHighlightComplete?.();
      return;
    }
    
    // Reset filtri (ordini non ha paginazione, quindi non serve calcolare la pagina)
    setStatoFilter('tutti');
    setSearchQuery('');
    
    // Timeout per assicurarsi che il DOM sia renderizzato dopo reset filtri
    highlightTimeoutRef.current = setTimeout(() => {
      const element = orderRefs.current[highlightOrderId];
      if (element) {
        // Scroll smooth alla card
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
        
        // Aggiungi highlight temporaneo
        setHighlightedId(highlightOrderId);
        
        // Rimuovi highlight dopo 3 secondi
        clearHighlightTimeoutRef.current = setTimeout(() => {
          setHighlightedId(null);
          onHighlightComplete?.();
          clearHighlightTimeoutRef.current = null;
        }, 3000);
      } else {
        console.warn(`Elemento DOM per ordine ${highlightOrderId} non trovato`);
        onHighlightComplete?.();
      }
      highlightTimeoutRef.current = null;
    }, 300);

    // Cleanup on unmount
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
      if (clearHighlightTimeoutRef.current) {
        clearTimeout(clearHighlightTimeoutRef.current);
        clearHighlightTimeoutRef.current = null;
      }
    };
  }, [highlightOrderId, orders, ordersWithBookings, isLoading, onHighlightComplete]);

  // Helper: Badge stato
  const getStatoBadge = (stato: Order['stato']) => {
    const config = {
      bozza: { label: 'Bozza', variant: 'secondary' as const, icon: FileText },
      in_lavorazione: { label: 'In Lavorazione', variant: 'default' as const, icon: Clock },
      completato: { label: 'Completato', variant: 'default' as const, icon: CheckCircle },
      annullato: { label: 'Annullato', variant: 'destructive' as const, icon: XCircle },
    };
    const { label, variant, icon: Icon } = config[stato];
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {label}
      </Badge>
    );
  };

  // Helper: Formatta data
  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, 'dd MMM yyyy', { locale: it });
  };

  // Helper: Formatta valuta
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  // Helper: Nome cliente dall'ordine (con fallback)
  const getClienteName = (order: OrderWithBooking) => {
    if (order.booking) {
      return `${order.booking.cliente.nome} ${order.booking.cliente.cognome}`;
    }
    return order.galleryId ? `Galleria ${order.galleryId.substring(0, 8)}` : 'Ordine Standalone';
  };

  // Helper: Email cliente (con fallback)
  const getClienteEmail = (order: OrderWithBooking) => {
    return order.booking?.cliente.email || 'N/A';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Caricamento ordini...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gestione Ordini</h2>
          <p className="text-sm text-muted-foreground">
            {filteredOrders.length} ordini trovati
          </p>
        </div>
      </div>

      {/* Filtri */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="stato-filter">Filtra per Stato</Label>
          <Select value={statoFilter} onValueChange={setStatoFilter}>
            <SelectTrigger id="stato-filter" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti gli Stati</SelectItem>
              <SelectItem value="bozza">Bozza</SelectItem>
              <SelectItem value="in_lavorazione">In Lavorazione</SelectItem>
              <SelectItem value="completato">Completato</SelectItem>
              <SelectItem value="annullato">Annullato</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="search">Ricerca</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Cerca per cliente, prodotto, galleria..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-orders"
            />
          </div>
        </div>
      </div>

      {/* Lista ordini */}
      {filteredOrders.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-2">
            <FileText className="w-12 h-12 text-muted-foreground" />
            <p className="text-lg font-medium">Nessun ordine trovato</p>
            <p className="text-sm text-muted-foreground">
              {statoFilter !== 'tutti'
                ? 'Prova a cambiare i filtri'
                : 'Gli ordini vengono creati automaticamente dalle prenotazioni'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredOrders.map((order) => {
            // Usa helper unificato per stato pagamento
            const paymentStatus = getOrderPaymentStatus(order);
            const totals = getOrderTotals(order);
            const isHighlighted = highlightedId === order.id;

            return (
              <Card 
                key={order.id} 
                ref={(el) => { orderRefs.current[order.id] = el; }}
                className={`p-4 transition-all ${isHighlighted ? 'ring-4 ring-blue-500 ring-offset-2 shadow-2xl' : ''}`}
                data-testid={`card-order-${order.id}`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  {/* Info ordine */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg">
                            {getClienteName(order)}
                          </h3>
                          {getStatoBadge(order.stato)}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {getClienteEmail(order)}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm text-muted-foreground">
                            {order.prodotti.length} prodott{order.prodotti.length === 1 ? 'o' : 'i'}
                            {order.galleryId && ` • Galleria: ${order.galleryId.substring(0, 12)}...`}
                          </p>
                          {order.prodotti.some(p => p.isCustom || p.prodottoId?.startsWith('custom_')) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                              Personalizzato
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Dettagli finanziari - usa helper unificati */}
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Totale</p>
                        <p className="font-semibold">{formatCurrency(totals.totale)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Pagato</p>
                        <p className="font-semibold text-green-600">{formatCurrency(totals.totalePagato)}</p>
                        {paymentStatus.percentualePagata > 0 && paymentStatus.percentualePagata < 100 && (
                          <p className="text-xs text-muted-foreground">
                            {paymentStatus.percentualePagata}% del totale
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Da Saldare</p>
                        <p className={`font-semibold ${totals.saldoResiduo > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {formatCurrency(totals.saldoResiduo)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Stato Pagamento</p>
                        {paymentStatus.stato === 'saldato' ? (
                          <Badge className="bg-green-500 text-white">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            {paymentStatus.label}
                          </Badge>
                        ) : paymentStatus.stato === 'acconto_pagato' ? (
                          <Badge className="bg-yellow-500 text-white">
                            <Clock className="w-3 h-3 mr-1" />
                            {paymentStatus.label}
                          </Badge>
                        ) : (
                          <Badge variant="outline">{paymentStatus.label}</Badge>
                        )}
                      </div>
                    </div>

                    {/* Data creazione */}
                    <p className="text-xs text-muted-foreground">
                      Creato: {formatDate(order.createdAt)}
                    </p>
                  </div>

                  {/* Azioni */}
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedOrder(order)}
                        data-testid={`button-view-order-${order.id}`}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Dettagli
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditOrder(order)}
                        data-testid={`button-edit-order-${order.id}`}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Modifica
                      </Button>
                    </div>

                    {/* Pulsanti pagamento - usa helper unificati */}
                    {/* Mostra pulsanti solo se c'è ancora saldo da pagare */}
                    {paymentStatus.stato !== 'saldato' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => setPaymentDialog({ orderId: order.id, tipo: 'acconto' })}
                          data-testid={`button-record-acconto-${order.id}`}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Euro className="w-4 h-4 mr-1" />
                          {totals.totalePagato > 0 ? 'Aggiungi Pagamento' : 'Registra Acconto'}
                        </Button>

                        {/* Mostra "Registra Saldo" solo se c'è già almeno un pagamento */}
                        {totals.totalePagato > 0 && (
                          <Button
                            size="sm"
                            onClick={() => setPaymentDialog({ orderId: order.id, tipo: 'saldo' })}
                            data-testid={`button-record-saldo-${order.id}`}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Euro className="w-4 h-4 mr-1" />
                            Salda Ordine ({formatCurrency(totals.saldoResiduo)})
                          </Button>
                        )}
                      </>
                    )}

                    {/* Cambio stato */}
                    {order.stato === 'bozza' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatoMutation.mutate({ orderId: order.id, stato: 'in_lavorazione' })}
                        data-testid={`button-start-order-${order.id}`}
                      >
                        Inizia Lavorazione
                      </Button>
                    )}

                    {order.stato === 'in_lavorazione' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatoMutation.mutate({ orderId: order.id, stato: 'completato' })}
                        data-testid={`button-complete-order-${order.id}`}
                      >
                        Completa Ordine
                      </Button>
                    )}

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteConfirmId(order.id)}
                      data-testid={`button-delete-order-${order.id}`}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Elimina
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog: Dettagli ordine */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dettagli Ordine</DialogTitle>
            <DialogDescription>
              Visualizza tutte le informazioni dell'ordine
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              {/* Info cliente */}
              {selectedOrder.booking && (
                <div>
                  <h3 className="font-semibold mb-2">Cliente</h3>
                  <div className="space-y-1 text-sm">
                    <p><strong>Nome:</strong> {selectedOrder.booking.cliente.nome} {selectedOrder.booking.cliente.cognome}</p>
                    <p><strong>Email:</strong> {selectedOrder.booking.cliente.email}</p>
                    <p><strong>WhatsApp:</strong> {selectedOrder.booking.cliente.whatsapp}</p>
                  </div>
                </div>
              )}

              {/* Prodotti */}
              <div>
                <h3 className="font-semibold mb-2">Prodotti ({selectedOrder.prodotti.length})</h3>
                <div className="space-y-2">
                  {selectedOrder.prodotti.map((prodotto, index) => (
                    <Card key={index} className="p-3">
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <p><strong>{prodotto.prodottoNome}</strong></p>
                          {(prodotto.isCustom || prodotto.prodottoId?.startsWith('custom_')) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                              Personalizzato
                            </span>
                          )}
                        </div>
                        <p>Prezzo: {formatCurrency(prodotto.prodottoPrezzo)} × {prodotto.quantita}</p>
                        <p>Numero Foto: {prodotto.prodottoNumeroFoto}</p>
                        <p className="font-semibold">
                          Subtotale: {formatCurrency(prodotto.prodottoPrezzo * prodotto.quantita)}
                        </p>
                      </div>
                    </Card>
                  ))}
                  {selectedOrder.galleryId && (
                    <p className="text-sm text-muted-foreground mt-2">
                      <strong>Galleria:</strong> {selectedOrder.galleryId}
                    </p>
                  )}
                </div>
              </div>

              {/* Stato */}
              <div>
                <h3 className="font-semibold mb-2">Stato</h3>
                {getStatoBadge(selectedOrder.stato)}
              </div>

              {/* Dettagli finanziari - usa helper unificati */}
              {(() => {
                const detailTotals = getOrderTotals(selectedOrder);
                const detailStatus = getOrderPaymentStatus(selectedOrder);
                return (
                  <div>
                    <h3 className="font-semibold mb-2">Dettagli Finanziari</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Card className="p-3">
                        <p className="text-xs text-muted-foreground mb-1">Totale Ordine</p>
                        <p className="text-xl font-bold">{formatCurrency(detailTotals.totale)}</p>
                      </Card>
                      <Card className="p-3">
                        <p className="text-xs text-muted-foreground mb-1">Totale Pagato</p>
                        <p className="text-xl font-bold text-green-600">{formatCurrency(detailTotals.totalePagato)}</p>
                        {detailStatus.percentualePagata > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {detailStatus.percentualePagata}% del totale
                          </p>
                        )}
                      </Card>
                      <Card className="p-3">
                        <p className="text-xs text-muted-foreground mb-1">Da Saldare</p>
                        <p className={`text-xl font-bold ${detailTotals.saldoResiduo > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {formatCurrency(detailTotals.saldoResiduo)}
                        </p>
                      </Card>
                      <Card className="p-3">
                        <p className="text-xs text-muted-foreground mb-1">Stato</p>
                        {detailStatus.stato === 'saldato' ? (
                          <Badge className="bg-green-500 text-white">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            {detailStatus.label}
                          </Badge>
                        ) : detailStatus.stato === 'acconto_pagato' ? (
                          <Badge className="bg-yellow-500 text-white">
                            <Clock className="w-3 h-3 mr-1" />
                            {detailStatus.label}
                          </Badge>
                        ) : (
                          <Badge variant="outline">{detailStatus.label}</Badge>
                        )}
                      </Card>
                    </div>
                    
                    {/* Lista transazioni se presenti */}
                    {(selectedOrder.transactions?.length || 0) > 0 && (
                      <div className="mt-4">
                        <h4 className="font-medium mb-2 text-sm">Storico Pagamenti</h4>
                        <div className="space-y-2">
                          {selectedOrder.transactions?.map((t, idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm p-2 bg-gray-50 rounded">
                              <div>
                                <span className="font-medium">{formatCurrency(t.importo)}</span>
                                <span className="text-muted-foreground ml-2">({t.metodo})</span>
                                <Badge variant="outline" className="ml-2 text-xs">
                                  {t.tipo === 'acconto' ? 'Acconto' : 'Saldo'}
                                </Badge>
                              </div>
                              <span className="text-muted-foreground">{formatDate(t.data)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Timestamp */}
              <div>
                <h3 className="font-semibold mb-2">Date</h3>
                <div className="text-sm space-y-1">
                  <p><strong>Creato:</strong> {formatDate(selectedOrder.createdAt)}</p>
                  <p><strong>Aggiornato:</strong> {formatDate(selectedOrder.updatedAt)}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Registra pagamento */}
      <Dialog open={!!paymentDialog} onOpenChange={() => {
        setPaymentDialog(null);
        setPaymentAmount('');
        setPaymentNote('');
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Registra {paymentDialog?.tipo === 'acconto' ? 'Acconto' : 'Saldo'}
            </DialogTitle>
            <DialogDescription>
              {paymentDialog?.tipo === 'acconto' 
                ? 'Inserisci importo e metodo di pagamento per il nuovo acconto'
                : 'Seleziona il metodo di pagamento per il saldo finale'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Input Importo (solo per acconto) */}
            {paymentDialog?.tipo === 'acconto' && (
              <div>
                <Label htmlFor="payment-amount">Importo Acconto (€) <span className="text-red-500">*</span></Label>
                <Input
                  id="payment-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Es. 500.00"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  data-testid="input-payment-amount"
                />
                {accontoSummary && accontoSummary.saldoMassimo > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Massimo aggiungibile: €{accontoSummary.saldoMassimo.toFixed(2)}
                  </p>
                )}
              </div>
            )}

            {/* Metodo Pagamento */}
            <div>
              <Label htmlFor="payment-method">Metodo Pagamento</Label>
              <Select value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                <SelectTrigger id="payment-method" data-testid="select-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contante">Contante</SelectItem>
                  <SelectItem value="carta">Carta di Credito/Debito</SelectItem>
                  <SelectItem value="bonifico">Bonifico Bancario</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Note Opzionali */}
            <div>
              <Label htmlFor="payment-note">Note (opzionale)</Label>
              <Input
                id="payment-note"
                placeholder="Es. Primo acconto, Bonifico IBAN: IT..."
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                data-testid="input-payment-note"
              />
            </div>

            {/* Riepilogo Acconto (solo per acconto con importo valido) */}
            {paymentDialog?.tipo === 'acconto' && accontoSummary && accontoSummary.nuovoImporto > 0 && (
              <div className={`p-3 rounded-md border ${accontoSummary.isValid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  {accontoSummary.isValid ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                  Riepilogo Acconto
                </h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Totale Ordine:</span>
                    <span className="font-medium">€{accontoSummary.totale.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Acconto Attuale:</span>
                    <span className="font-medium">€{accontoSummary.accontoAttuale.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1">
                    <span className="text-gray-600 font-semibold">Nuovo Acconto Totale:</span>
                    <span className="font-bold text-blue-600">€{accontoSummary.nuovoAccontoTotale.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 font-semibold">Saldo Rimanente:</span>
                    <span className={`font-bold ${accontoSummary.isValid ? 'text-green-600' : 'text-red-600'}`}>
                      €{accontoSummary.nuovoSaldo.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setPaymentDialog(null);
              setPaymentAmount('');
              setPaymentNote('');
            }}>
              Annulla
            </Button>
            <Button
              onClick={handlePayment}
              disabled={accontoMutation.isPending || saldoMutation.isPending || (paymentDialog?.tipo === 'acconto' && (!accontoSummary || !accontoSummary.isValid))}
              data-testid="button-confirm-payment"
            >
              {accontoMutation.isPending || saldoMutation.isPending ? 'Registrazione...' : 'Conferma Pagamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Conferma eliminazione */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo ordine? Questa azione è irreversibile.
              Le foto selezionate associate non verranno eliminate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* EditOrderModal: Modifica ordine con email automatica */}
      <EditOrderModal
        order={editOrder}
        products={products}
        onClose={() => setEditOrder(null)}
      />
    </div>
  );
}
