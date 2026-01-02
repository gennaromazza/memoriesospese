/**
 * WalkInOrdersManager - Gestione Ordini Walk-in
 * Basato sulla logica di BookingsManager per gestione pagamenti
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { 
  ShoppingBag, 
  User, 
  Mail, 
  Phone, 
  MoreVertical, 
  Wallet, 
  Euro, 
  CheckCircle, 
  Loader2,
  Package,
  Send,
  Edit2,
  Trash2,
  AlertTriangle,
  Eye,
  Calendar,
  Receipt,
  CreditCard,
  FileText
} from 'lucide-react';
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
import { getAllOrders, addAccontoPayment, recordSaldoPayment, getOrderTotals, deleteOrder } from '@/lib/orders';

// Stati ordine walk-in
const ORDER_STATES = [
  { value: 'in_attesa', label: 'In Attesa', color: 'bg-amber-100 text-amber-700' },
  { value: 'in_lavorazione', label: 'In Lavorazione', color: 'bg-blue-100 text-blue-700' },
  { value: 'pronto', label: 'Pronto Ritiro', color: 'bg-purple-100 text-purple-700' },
  { value: 'completato', label: 'Completato', color: 'bg-green-100 text-green-700' },
];

export default function WalkInOrdersManager() {
  const { toast } = useToast();
  
  // Stati per dialog
  const [paymentDialog, setPaymentDialog] = useState<{
    orderId: string;
    tipo: 'acconto' | 'saldo';
  } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'contante' | 'carta' | 'bonifico' | 'paypal'>('contante');
  const [paymentNote, setPaymentNote] = useState('');
  const [sendEmailOnPayment, setSendEmailOnPayment] = useState(true);
  
  // Stato per email prodotto pronto
  const [sendReadyEmailOrder, setSendReadyEmailOrder] = useState<any>(null);
  
  // Stato per modifica ed eliminazione
  const [editOrder, setEditOrder] = useState<any>(null);
  const [deleteOrderDialog, setDeleteOrderDialog] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({
    nomeCliente: '',
    emailCliente: '',
    telefonoCliente: '',
    note: ''
  });
  
  // Stato per visualizzazione dettagli ordine
  const [viewOrderDetail, setViewOrderDetail] = useState<any>(null);

  // Query ordini walk-in
  const { data: walkInOrders = [], isLoading } = useQuery({
    queryKey: ['walk-in-orders'],
    queryFn: async () => {
      const allOrders = await getAllOrders();
      return allOrders
        .filter((order: any) => order.source === 'walk_in')
        .sort((a: any, b: any) => {
          const dateA = a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(a.createdAt || 0);
          const dateB = b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(b.createdAt || 0);
          return dateB.getTime() - dateA.getTime();
        });
    },
  });

  // Mutation per acconto
  const accontoMutation = useMutation({
    mutationFn: async (data: { orderId: string; importo: number; metodo: 'contante' | 'carta' | 'bonifico' | 'paypal'; note?: string }) => {
      return addAccontoPayment(data.orderId, data.importo, data.metodo, data.note);
    },
    onSuccess: () => {
      toast({ title: 'Acconto registrato', description: 'Il pagamento è stato registrato correttamente' });
      queryClient.invalidateQueries({ queryKey: ['walk-in-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      setPaymentDialog(null);
      setPaymentAmount('');
      setPaymentNote('');
    },
    onError: (error: any) => {
      toast({ title: 'Errore', description: error.message || 'Errore registrazione acconto', variant: 'destructive' });
    },
  });

  // Mutation per saldo
  const saldoMutation = useMutation({
    mutationFn: async (data: { orderId: string; metodo: 'contante' | 'carta' | 'bonifico' | 'paypal'; note?: string }) => {
      return recordSaldoPayment(data.orderId, data.metodo, data.note);
    },
    onSuccess: () => {
      toast({ title: 'Saldo registrato', description: 'Il pagamento è stato completato' });
      queryClient.invalidateQueries({ queryKey: ['walk-in-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      setPaymentDialog(null);
      setPaymentNote('');
    },
    onError: (error: any) => {
      toast({ title: 'Errore', description: error.message || 'Errore registrazione saldo', variant: 'destructive' });
    },
  });

  // Mutation per aggiornare stato ordine
  const updateOrderMutation = useMutation({
    mutationFn: async (data: { orderId: string; stato: string }) => {
      return apiRequest('PATCH', `/api/orders/${data.orderId}`, { stato: data.stato });
    },
    onSuccess: () => {
      toast({ title: 'Stato aggiornato', description: 'Lo stato dell\'ordine è stato aggiornato' });
      queryClient.invalidateQueries({ queryKey: ['walk-in-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: any) => {
      toast({ title: 'Errore', description: error.message || 'Errore aggiornamento stato', variant: 'destructive' });
    },
  });

  // Mutation per inviare email prodotto pronto
  const sendReadyEmailMutation = useMutation({
    mutationFn: async (order: any) => {
      const prodottiStr = order.prodotti?.map((p: any) => p.prodottoNome).join(', ') || 'Ordine';
      return apiRequest('POST', '/api/email/order-ready', {
        recipientEmail: order.emailCliente,
        clienteName: order.nomeCliente,
        prodottoNome: prodottiStr,
      });
    },
    onSuccess: () => {
      toast({ title: 'Email inviata', description: 'Il cliente è stato notificato che il prodotto è pronto' });
      setSendReadyEmailOrder(null);
    },
    onError: (error: any) => {
      toast({ title: 'Errore', description: error.message || 'Errore invio email', variant: 'destructive' });
    },
  });

  // Mutation per modificare ordine
  const editOrderMutation = useMutation({
    mutationFn: async (data: { orderId: string; updates: any }) => {
      return apiRequest('PATCH', `/api/orders/${data.orderId}`, data.updates);
    },
    onSuccess: () => {
      toast({ title: 'Ordine aggiornato', description: 'I dati dell\'ordine sono stati modificati' });
      queryClient.invalidateQueries({ queryKey: ['walk-in-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setEditOrder(null);
    },
    onError: (error: any) => {
      toast({ title: 'Errore', description: error.message || 'Errore modifica ordine', variant: 'destructive' });
    },
  });

  // Mutation per eliminare ordine
  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return deleteOrder(orderId);
    },
    onSuccess: () => {
      toast({ title: 'Ordine eliminato', description: 'L\'ordine è stato eliminato correttamente' });
      queryClient.invalidateQueries({ queryKey: ['walk-in-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      setDeleteOrderDialog(null);
    },
    onError: (error: any) => {
      toast({ title: 'Errore', description: error.message || 'Errore eliminazione ordine', variant: 'destructive' });
    },
  });

  // Apri dialog modifica
  const openEditDialog = (order: any) => {
    setEditFormData({
      nomeCliente: order.nomeCliente || '',
      emailCliente: order.emailCliente || '',
      telefonoCliente: order.telefonoCliente || '',
      note: order.note || ''
    });
    setEditOrder(order);
  };

  // Formatta valuta
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
  };

  // Ottieni label stato
  const getStateBadge = (stato: string) => {
    const state = ORDER_STATES.find(s => s.value === stato) || ORDER_STATES[0];
    return <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${state.color}`}>{state.label}</span>;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <ShoppingBag className="h-5 w-5 text-sage" />
            Ordini Walk-in
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Gestisci ordini per clienti che si presentano in studio. Registra pagamenti e notifica quando il prodotto è pronto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Caricamento ordini...
            </div>
          ) : walkInOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun ordine walk-in. Usa il pulsante "Ordine Rapido" nel Registro Cassa per crearne uno.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs sm:text-sm font-semibold">Data</th>
                    <th className="px-3 py-2 text-left text-xs sm:text-sm font-semibold">Cliente</th>
                    <th className="px-3 py-2 text-left text-xs sm:text-sm font-semibold">Prodotti</th>
                    <th className="px-3 py-2 text-right text-xs sm:text-sm font-semibold">Totale</th>
                    <th className="px-3 py-2 text-right text-xs sm:text-sm font-semibold">Pagato</th>
                    <th className="px-3 py-2 text-right text-xs sm:text-sm font-semibold">Saldo</th>
                    <th className="px-3 py-2 text-center text-xs sm:text-sm font-semibold">Stato</th>
                    <th className="px-3 py-2 text-center text-xs sm:text-sm font-semibold">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {walkInOrders.map((order: any) => {
                    const createdAt = order.createdAt instanceof Timestamp 
                      ? order.createdAt.toDate() 
                      : new Date(order.createdAt || Date.now());
                    const prodottiStr = order.prodotti
                      ?.map((p: any) => `${p.prodottoNome} x${p.quantita}`)
                      .join(', ') || '-';
                    
                    const totals = getOrderTotals(order);
                    const saldoResiduo = totals.saldoResiduo;
                    const isPaid = saldoResiduo <= 0;
                    
                    return (
                      <tr key={order.id} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs sm:text-sm">
                          {createdAt.toLocaleDateString('it-IT', { 
                            day: '2-digit', 
                            month: '2-digit', 
                            year: 'numeric',
                          })}
                          <br />
                          <span className="text-gray-400">
                            {createdAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs sm:text-sm font-medium flex items-center gap-1">
                              <User className="h-3 w-3 text-gray-400" />
                              {order.nomeCliente || 'N/D'}
                            </span>
                            {order.emailCliente && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {order.emailCliente}
                              </span>
                            )}
                            {order.telefonoCliente && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {order.telefonoCliente}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs sm:text-sm max-w-[180px]">
                          <div className="truncate" title={prodottiStr}>
                            {prodottiStr}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs sm:text-sm text-right font-medium">
                          {formatCurrency(totals.totale)}
                        </td>
                        <td className="px-3 py-2 text-xs sm:text-sm text-right">
                          <span className="text-green-600 font-medium">
                            {formatCurrency(totals.totalePagato)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs sm:text-sm text-right">
                          {isPaid ? (
                            <span className="text-green-600 flex items-center justify-end gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Saldato
                            </span>
                          ) : (
                            <span className="text-orange-600 font-medium">
                              {formatCurrency(saldoResiduo)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Select
                            value={order.stato || 'in_attesa'}
                            onValueChange={(value) => updateOrderMutation.mutate({ orderId: order.id, stato: value })}
                          >
                            <SelectTrigger className="h-7 text-xs w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ORDER_STATES.map(state => (
                                <SelectItem key={state.value} value={state.value}>
                                  {state.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => setViewOrderDetail(order)}
                                data-testid={`view-order-${order.id}`}
                              >
                                <Eye className="h-4 w-4 mr-2 text-sage" />
                                Visualizza Dettagli
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {!isPaid && (
                                <>
                                  <DropdownMenuItem onClick={() => {
                                    setPaymentDialog({ orderId: order.id, tipo: 'acconto' });
                                    setPaymentAmount('');
                                  }}>
                                    <Wallet className="h-4 w-4 mr-2 text-blue-600" />
                                    Registra Acconto
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => {
                                    setPaymentDialog({ orderId: order.id, tipo: 'saldo' });
                                  }}>
                                    <Euro className="h-4 w-4 mr-2 text-green-600" />
                                    Registra Saldo Completo
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              {order.emailCliente && (
                                <DropdownMenuItem onClick={() => setSendReadyEmailOrder(order)}>
                                  <Send className="h-4 w-4 mr-2 text-purple-600" />
                                  Email "Pronto Ritiro"
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openEditDialog(order)}>
                                <Edit2 className="h-4 w-4 mr-2 text-gray-600" />
                                Modifica Ordine
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => setDeleteOrderDialog(order)}
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Elimina Ordine
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Registrazione Pagamento */}
      <Dialog open={!!paymentDialog} onOpenChange={() => setPaymentDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {paymentDialog?.tipo === 'acconto' ? (
                <>
                  <Wallet className="w-5 h-5 text-blue-600" />
                  Registra Acconto
                </>
              ) : (
                <>
                  <Euro className="w-5 h-5 text-green-600" />
                  Registra Saldo
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {paymentDialog?.tipo === 'acconto' 
                ? "Inserisci l'importo dell'acconto ricevuto"
                : 'Conferma il pagamento del saldo residuo'}
            </DialogDescription>
          </DialogHeader>

          {paymentDialog && (() => {
            const order = walkInOrders.find((o: any) => o.id === paymentDialog.orderId);
            if (!order) return null;
            const totals = getOrderTotals(order);
            
            return (
              <div className="space-y-4 py-4">
                {/* Info ordine */}
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Totale ordine:</span>
                    <span className="font-medium">{formatCurrency(totals.totale)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Già pagato:</span>
                    <span className="text-green-600">{formatCurrency(totals.totalePagato)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-gray-600 font-medium">Saldo residuo:</span>
                    <span className="font-bold text-orange-600">{formatCurrency(totals.saldoResiduo)}</span>
                  </div>
                </div>

                {/* Importo (solo per acconto) */}
                {paymentDialog.tipo === 'acconto' && (
                  <div className="space-y-2">
                    <Label htmlFor="payment-amount">Importo Acconto *</Label>
                    <div className="relative">
                      <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="payment-amount"
                        type="number"
                        min="0"
                        max={totals.saldoResiduo}
                        step="0.01"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="0.00"
                        className="pl-9"
                      />
                    </div>
                    {parseFloat(paymentAmount) > totals.saldoResiduo && (
                      <p className="text-xs text-red-500">
                        L'importo non può superare il saldo residuo
                      </p>
                    )}
                  </div>
                )}

                {/* Metodo di pagamento */}
                <div className="space-y-2">
                  <Label>Metodo di Pagamento</Label>
                  <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contante">Contante</SelectItem>
                      <SelectItem value="bonifico">Bonifico</SelectItem>
                      <SelectItem value="carta">Carta</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Note */}
                <div className="space-y-2">
                  <Label htmlFor="payment-note">Note (opzionale)</Label>
                  <Input
                    id="payment-note"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    placeholder="Note aggiuntive..."
                  />
                </div>

                {/* Email notification checkbox */}
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="send-email" 
                    checked={sendEmailOnPayment}
                    onCheckedChange={(checked) => setSendEmailOnPayment(!!checked)}
                  />
                  <Label htmlFor="send-email" className="text-sm text-gray-600">
                    Invia email di conferma al cliente
                  </Label>
                </div>
              </div>
            );
          })()}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPaymentDialog(null)}
              disabled={accontoMutation.isPending || saldoMutation.isPending}
            >
              Annulla
            </Button>
            <Button
              onClick={() => {
                if (!paymentDialog) return;
                
                if (paymentDialog.tipo === 'acconto') {
                  const amount = parseFloat(paymentAmount);
                  if (isNaN(amount) || amount <= 0) {
                    toast({ title: 'Inserisci un importo valido', variant: 'destructive' });
                    return;
                  }
                  accontoMutation.mutate({
                    orderId: paymentDialog.orderId,
                    importo: amount,
                    metodo: paymentMethod,
                    note: paymentNote || undefined,
                  });
                } else {
                  saldoMutation.mutate({
                    orderId: paymentDialog.orderId,
                    metodo: paymentMethod,
                    note: paymentNote || undefined,
                  });
                }
              }}
              disabled={
                accontoMutation.isPending || 
                saldoMutation.isPending ||
                (paymentDialog?.tipo === 'acconto' && (!paymentAmount || parseFloat(paymentAmount) <= 0))
              }
              className="bg-sage hover:bg-sage/90"
            >
              {(accontoMutation.isPending || saldoMutation.isPending) ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Conferma Pagamento
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Email Prodotto Pronto */}
      <Dialog open={!!sendReadyEmailOrder} onOpenChange={() => setSendReadyEmailOrder(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-purple-600" />
              Notifica Prodotto Pronto
            </DialogTitle>
            <DialogDescription>
              Invia una email al cliente per informarlo che il prodotto è pronto per il ritiro.
            </DialogDescription>
          </DialogHeader>

          {sendReadyEmailOrder && (
            <div className="space-y-4 py-4">
              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-sm">
                  <strong>Cliente:</strong> {sendReadyEmailOrder.nomeCliente}
                </p>
                <p className="text-sm">
                  <strong>Email:</strong> {sendReadyEmailOrder.emailCliente}
                </p>
                <p className="text-sm mt-2">
                  <strong>Prodotti:</strong>{' '}
                  {sendReadyEmailOrder.prodotti?.map((p: any) => p.prodottoNome).join(', ')}
                </p>
              </div>
              <p className="text-sm text-gray-600">
                Verrà inviata una email professionale che invita il cliente a contattarti per concordare il ritiro.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendReadyEmailOrder(null)}>
              Annulla
            </Button>
            <Button
              onClick={() => sendReadyEmailMutation.mutate(sendReadyEmailOrder)}
              disabled={sendReadyEmailMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {sendReadyEmailMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Invio...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Invia Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Modifica Ordine */}
      <Dialog open={!!editOrder} onOpenChange={() => setEditOrder(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-gray-600" />
              Modifica Ordine
            </DialogTitle>
            <DialogDescription>
              Modifica i dati del cliente per questo ordine.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-nome">Nome Cliente *</Label>
              <Input
                id="edit-nome"
                value={editFormData.nomeCliente}
                onChange={(e) => setEditFormData({ ...editFormData, nomeCliente: e.target.value })}
                placeholder="Nome e Cognome"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editFormData.emailCliente}
                onChange={(e) => setEditFormData({ ...editFormData, emailCliente: e.target.value })}
                placeholder="email@esempio.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-telefono">Telefono</Label>
              <Input
                id="edit-telefono"
                value={editFormData.telefonoCliente}
                onChange={(e) => setEditFormData({ ...editFormData, telefonoCliente: e.target.value })}
                placeholder="+39..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-note">Note</Label>
              <Input
                id="edit-note"
                value={editFormData.note}
                onChange={(e) => setEditFormData({ ...editFormData, note: e.target.value })}
                placeholder="Note opzionali..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrder(null)}>
              Annulla
            </Button>
            <Button
              onClick={() => {
                if (!editOrder || !editFormData.nomeCliente.trim()) {
                  toast({ title: 'Inserisci il nome cliente', variant: 'destructive' });
                  return;
                }
                editOrderMutation.mutate({
                  orderId: editOrder.id,
                  updates: {
                    nomeCliente: editFormData.nomeCliente.trim(),
                    emailCliente: editFormData.emailCliente.trim() || null,
                    telefonoCliente: editFormData.telefonoCliente.trim() || null,
                    note: editFormData.note.trim() || null,
                  }
                });
              }}
              disabled={editOrderMutation.isPending || !editFormData.nomeCliente.trim()}
              className="bg-sage hover:bg-sage/90"
            >
              {editOrderMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Salva Modifiche
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Conferma Eliminazione */}
      <AlertDialog open={!!deleteOrderDialog} onOpenChange={() => setDeleteOrderDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Conferma Eliminazione
            </AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare l'ordine di <strong>{deleteOrderDialog?.nomeCliente}</strong>.
              <br /><br />
              Questa azione è irreversibile e rimuoverà anche tutti i movimenti di cassa associati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteOrderMutation.mutate(deleteOrderDialog?.id)}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteOrderMutation.isPending}
            >
              {deleteOrderMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminazione...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Elimina Ordine
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Dettagli Ordine */}
      <Dialog open={!!viewOrderDetail} onOpenChange={() => setViewOrderDetail(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-sage" />
              Dettagli Ordine
            </DialogTitle>
            <DialogDescription>
              Riepilogo completo dell'ordine walk-in
            </DialogDescription>
          </DialogHeader>

          {viewOrderDetail && (() => {
            const order = viewOrderDetail;
            const createdAt = order.createdAt instanceof Timestamp 
              ? order.createdAt.toDate() 
              : new Date(order.createdAt || Date.now());
            const totals = getOrderTotals(order);
            const isPaid = totals.saldoResiduo <= 0;
            const stateInfo = ORDER_STATES.find(s => s.value === order.stato) || ORDER_STATES[0];

            return (
              <div className="space-y-6 py-4" data-testid="order-detail-content">
                {/* Info Cliente */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Informazioni Cliente
                  </h4>
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 min-w-[80px]">Nome:</span>
                      <span className="font-medium" data-testid="order-detail-customer-name">{order.nomeCliente || 'N/D'}</span>
                    </div>
                    {order.emailCliente && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3 h-3 text-gray-400" />
                        <span className="text-gray-600" data-testid="order-detail-customer-email">{order.emailCliente}</span>
                      </div>
                    )}
                    {order.telefonoCliente && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3 h-3 text-gray-400" />
                        <span className="text-gray-600" data-testid="order-detail-customer-phone">{order.telefonoCliente}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Info Ordine */}
                <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                  <h4 className="font-medium text-sm text-blue-700 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Informazioni Ordine
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Data:</span>
                      <span className="ml-2 font-medium" data-testid="order-detail-date">
                        {createdAt.toLocaleDateString('it-IT', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Ora:</span>
                      <span className="ml-2 font-medium" data-testid="order-detail-time">
                        {createdAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center gap-2 mt-1">
                      <span className="text-gray-500">Stato:</span>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${stateInfo.color}`} data-testid="order-detail-status">
                        {stateInfo.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Prodotti */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Prodotti Ordinati
                  </h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Prodotto</th>
                          <th className="px-3 py-2 text-center font-medium">Qta</th>
                          <th className="px-3 py-2 text-right font-medium">Prezzo</th>
                          <th className="px-3 py-2 text-right font-medium">Subtotale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.prodotti?.map((p: any, idx: number) => (
                          <tr key={idx} className="border-t" data-testid={`order-detail-product-${idx}`}>
                            <td className="px-3 py-2">
                              {p.prodottoNome}
                              {p.isCustom && (
                                <span className="ml-1 text-xs text-amber-600">(Custom)</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center" data-testid={`order-detail-product-qty-${idx}`}>
                              {p.quantita}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600" data-testid={`order-detail-product-price-${idx}`}>
                              {formatCurrency(p.prodottoPrezzo)}
                            </td>
                            <td className="px-3 py-2 text-right font-medium" data-testid={`order-detail-product-subtotal-${idx}`}>
                              {formatCurrency(p.prodottoPrezzo * p.quantita)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 font-medium">
                        <tr className="border-t">
                          <td colSpan={3} className="px-3 py-2 text-right">Totale Ordine:</td>
                          <td className="px-3 py-2 text-right text-lg" data-testid="order-detail-total">
                            {formatCurrency(totals.totale)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Stato Pagamento */}
                <div className={`rounded-lg p-4 space-y-3 ${isPaid ? 'bg-green-50' : 'bg-amber-50'}`}>
                  <h4 className={`font-medium text-sm flex items-center gap-2 ${isPaid ? 'text-green-700' : 'text-amber-700'}`}>
                    <CreditCard className="w-4 h-4" />
                    Stato Pagamento
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Totale ordine:</span>
                      <span className="font-medium" data-testid="order-detail-payment-total">{formatCurrency(totals.totale)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Già pagato:</span>
                      <span className="text-green-600 font-medium" data-testid="order-detail-payment-paid">{formatCurrency(totals.totalePagato)}</span>
                    </div>
                    <div className="col-span-2 flex justify-between border-t pt-2">
                      <span className={`font-medium ${isPaid ? 'text-green-600' : 'text-amber-600'}`}>
                        {isPaid ? '✓ Ordine Saldato' : 'Saldo Residuo:'}
                      </span>
                      {!isPaid && (
                        <span className="font-bold text-amber-600" data-testid="order-detail-payment-remaining">
                          {formatCurrency(totals.saldoResiduo)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Note */}
                {order.note && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4" />
                      Note
                    </h4>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap" data-testid="order-detail-notes">
                      {order.note}
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setViewOrderDetail(null)}
              data-testid="order-detail-close"
            >
              Chiudi
            </Button>
            <Button
              onClick={() => {
                setViewOrderDetail(null);
                openEditDialog(viewOrderDetail);
              }}
              className="bg-sage hover:bg-sage/90"
              data-testid="order-detail-edit"
            >
              <Edit2 className="w-4 h-4 mr-2" />
              Modifica
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
