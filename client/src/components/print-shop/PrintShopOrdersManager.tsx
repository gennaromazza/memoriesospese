import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  Image as ImageIcon,
  Loader2,
  PackageCheck,
  Printer,
  RefreshCw,
  Search,
  Send,
  WalletCards,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { convertFirestoreTimestamp } from '@/lib/firebase';
import { getAllLabs } from '@/lib/labs';
import { eligiblePrintShopLabs, isLabDpaSigned } from '@/features/print-shop/lab-dpa';
import { useToast } from '@/hooks/use-toast';
import type { Lab, LabShipment } from '@shared/lab-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type FulfillmentStatus =
  | 'draft'
  | 'awaiting_payment'
  | 'submitted'
  | 'files_check'
  | 'ready_to_print'
  | 'sent_to_laboratory'
  | 'printing'
  | 'ready_for_pickup'
  | 'delivered'
  | 'cancelled';

interface PrintOrderItemSummary {
  productName?: string;
  prodottoNome?: string;
  formatLabel?: string;
  finish?: 'glossy' | 'matte';
  fitMode?: 'border' | 'cover';
  quantity?: number;
  quantita?: number;
  copyCount?: number;
  totalCents?: number;
}

interface PrintOrderSummary {
  id: string;
  orderNumber?: string;
  nomeCliente?: string;
  emailCliente?: string;
  customer?: { displayName?: string; email?: string; phone?: string };
  totals?: { totalCents?: number };
  totale?: number;
  payment?: { status?: string; paidAt?: unknown; paypalCaptureId?: string };
  fulfillment?: { status?: FulfillmentStatus; updatedAt?: unknown };
  printShop?: {
    assetCount?: number;
    copyCount?: number;
    lowResolutionAccepted?: boolean;
    items?: PrintOrderItemSummary[];
    totalSupplierCostCents?: number;
    estimatedMarginCents?: number;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface PrintOrderDetail extends PrintOrderSummary {
  assets?: Array<{
    id?: string;
    fileName?: string;
    width?: number;
    height?: number;
    validationStatus?: string;
    qualityWarning?: boolean;
  }>;
  labShipments?: LabShipment[];
}

const STATUS_LABELS: Record<FulfillmentStatus, string> = {
  draft: 'Bozza',
  awaiting_payment: 'In attesa del pagamento',
  submitted: 'Ordine ricevuto',
  files_check: 'Controllo file',
  ready_to_print: 'Pronto per il laboratorio',
  sent_to_laboratory: 'Inviato al laboratorio',
  printing: 'In stampa',
  ready_for_pickup: 'Pronto per il ritiro',
  delivered: 'Consegnato',
  cancelled: 'Annullato',
};

const STATUS_COLORS: Record<FulfillmentStatus, string> = {
  draft: 'bg-stone-100 text-stone-700 border-stone-200',
  awaiting_payment: 'bg-orange-100 text-orange-800 border-orange-200',
  submitted: 'bg-blue-100 text-blue-800 border-blue-200',
  files_check: 'bg-amber-100 text-amber-800 border-amber-200',
  ready_to_print: 'bg-violet-100 text-violet-800 border-violet-200',
  sent_to_laboratory: 'bg-purple-100 text-purple-800 border-purple-200',
  printing: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  ready_for_pickup: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  delivered: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
};

const STATUS_OPTIONS = Object.keys(STATUS_LABELS) as FulfillmentStatus[];

const NEXT_PRODUCTION_STATUSES: Partial<Record<FulfillmentStatus, FulfillmentStatus[]>> = {
  submitted: ['files_check', 'ready_to_print'],
  files_check: ['ready_to_print'],
  ready_to_print: ['sent_to_laboratory', 'printing'],
  sent_to_laboratory: ['printing', 'ready_for_pickup'],
  printing: ['ready_for_pickup'],
  ready_for_pickup: ['delivered'],
};

function euroFromCents(value?: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format((value || 0) / 100);
}

function orderTotalCents(order: PrintOrderSummary): number {
  if (typeof order.totals?.totalCents === 'number') return order.totals.totalCents;
  return Math.round((order.totale || 0) * 100);
}

function orderCustomerName(order: PrintOrderSummary): string {
  return order.customer?.displayName || order.nomeCliente || 'Cliente';
}

function orderCustomerEmail(order: PrintOrderSummary): string {
  return order.customer?.email || order.emailCliente || '';
}

function formatDate(value: unknown): string {
  const date = convertFirestoreTimestamp(value);
  return date
    ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : '—';
}

async function downloadProtected(path: string, fallbackName: string): Promise<void> {
  const response = await apiRequest('GET', path);
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const matched = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  const fileName = matched ? decodeURIComponent(matched[1].replace(/\"/g, '')) : fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function PrintShopOrdersManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [labDialogOpen, setLabDialogOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<FulfillmentStatus>('files_check');
  const [statusNote, setStatusNote] = useState('');
  const [selectedLabId, setSelectedLabId] = useState('');
  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [supplierCost, setSupplierCost] = useState('');

  const listQuery = useQuery<{ orders: PrintOrderSummary[] }>({
    queryKey: ['/api/print-shop/admin/orders', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const response = await apiRequest('GET', `/api/print-shop/admin/orders?${params}`);
      return response.json();
    },
  });

  const detailQuery = useQuery<{ order: PrintOrderDetail; assets?: PrintOrderDetail['assets'] }>({
    queryKey: ['/api/print-shop/admin/orders', selectedOrderId],
    enabled: !!selectedOrderId,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/print-shop/admin/orders/${selectedOrderId}`);
      const payload = await response.json();
      if (payload.order && payload.assets && !payload.order.assets) payload.order.assets = payload.assets;
      return payload;
    },
  });

  const shipmentsQuery = useQuery<{ shipments: LabShipment[] }>({
    queryKey: ['/api/print-shop/admin/orders', selectedOrderId, 'lab-shipments'],
    enabled: !!selectedOrderId,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/print-shop/admin/orders/${selectedOrderId}/lab-shipments`);
      return response.json();
    },
  });

  const labsQuery = useQuery<Lab[]>({
    queryKey: ['/api/labs', 'active'],
    queryFn: () => getAllLabs(true),
  });
  const eligibleLabs = useMemo(() => eligiblePrintShopLabs(labsQuery.data || []), [labsQuery.data]);
  const blockedLabsCount = (labsQuery.data || []).filter((lab) => lab.attivo !== false && !isLabDpaSigned(lab)).length;
  const selectedLabEligible = eligibleLabs.some((lab) => lab.id === selectedLabId);

  const invalidateOrder = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/print-shop/admin/orders'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/print-shop/admin/orders', selectedOrderId] }),
    ]);
  };

  const statusMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrderId) throw new Error('Ordine non selezionato');
      const response = await apiRequest('PATCH', `/api/print-shop/admin/orders/${selectedOrderId}/status`, {
        status: nextStatus,
        ...(statusNote.trim() ? { note: statusNote.trim() } : {}),
      });
      return response.json();
    },
    onSuccess: async () => {
      await invalidateOrder();
      setStatusDialogOpen(false);
      setStatusNote('');
      toast({ title: 'Stato aggiornato', description: STATUS_LABELS[nextStatus] });
    },
    onError: (error: Error) => toast({ title: 'Aggiornamento non riuscito', description: error.message, variant: 'destructive' }),
  });

  const labMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrderId || !selectedLabId) throw new Error('Seleziona un laboratorio');
      if (!selectedLabEligible) throw new Error('Il laboratorio non ha un accordo DPA firmato: invio file bloccato');
      const response = await apiRequest('POST', `/api/print-shop/admin/orders/${selectedOrderId}/lab-shipments`, {
        labId: selectedLabId,
        expiryDays: 90,
      });
      return response.json();
    },
    onSuccess: async () => {
      await shipmentsQuery.refetch();
      setLabDialogOpen(false);
      toast({
        title: 'Invio al laboratorio preparato',
        description: 'Il trasferimento degli originali su Drive continua in background.',
      });
    },
    onError: (error: Error) => toast({ title: 'Preparazione non riuscita', description: error.message, variant: 'destructive' }),
  });

  const sendShipmentMutation = useMutation({
    mutationFn: async (shipmentId: string) => {
      if (!selectedOrderId) throw new Error('Ordine non selezionato');
      const response = await apiRequest(
        'POST',
        `/api/print-shop/admin/orders/${selectedOrderId}/lab-shipments/${shipmentId}/send`,
        {},
      );
      return response.json();
    },
    onSuccess: async () => {
      await shipmentsQuery.refetch();
      toast({ title: 'Ordine inviato al laboratorio', description: 'Il link è stato inviato e lo storico è aggiornato.' });
    },
    onError: (error: Error) => toast({ title: 'Invio non riuscito', description: error.message, variant: 'destructive' }),
  });

  const supplierCostMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrderId || !selectedShipmentId) throw new Error('Spedizione non selezionata');
      const normalized = supplierCost.trim().replace(',', '.');
      const amount = Number(normalized);
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Inserisci un costo valido');
      const response = await apiRequest(
        'POST',
        `/api/print-shop/admin/orders/${selectedOrderId}/lab-shipments/${selectedShipmentId}/cost`,
        { importo: amount },
      );
      return response.json();
    },
    onSuccess: async () => {
      await Promise.all([shipmentsQuery.refetch(), invalidateOrder()]);
      setCostDialogOpen(false);
      setSelectedShipmentId('');
      setSupplierCost('');
      toast({ title: 'Costo laboratorio salvato', description: 'Margine e storico ordine sono stati aggiornati.' });
    },
    onError: (error: Error) => toast({ title: 'Costo non salvato', description: error.message, variant: 'destructive' }),
  });

  const orders = listQuery.data?.orders || [];
  const filteredOrders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('it-IT');
    if (!query) return orders;
    return orders.filter((order) =>
      [order.orderNumber, orderCustomerName(order), orderCustomerEmail(order)]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('it-IT').includes(query)),
    );
  }, [orders, search]);

  const metrics = useMemo(() => ({
    total: orders.length,
    toPrint: orders.filter((order) => ['submitted', 'files_check', 'ready_to_print'].includes(order.fulfillment?.status || '')).length,
    printing: orders.filter((order) => ['sent_to_laboratory', 'printing'].includes(order.fulfillment?.status || '')).length,
    ready: orders.filter((order) => order.fulfillment?.status === 'ready_for_pickup').length,
    revenueCents: orders.filter((order) => order.payment?.status === 'paid').reduce((sum, order) => sum + orderTotalCents(order), 0),
  }), [orders]);

  const selectedOrder = detailQuery.data?.order;
  const shipments = shipmentsQuery.data?.shipments || selectedOrder?.labShipments || [];
  const selectedStatus = selectedOrder?.fulfillment?.status || 'submitted';
  const availableNextStatuses = NEXT_PRODUCTION_STATUSES[selectedStatus] || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-stone-900">Stampe online</h2>
          <p className="mt-1 text-sm text-stone-600">Ordini pagati, file, produzione e laboratori in un unico flusso.</p>
        </div>
        <Button variant="outline" onClick={() => listQuery.refetch()} disabled={listQuery.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${listQuery.isFetching ? 'animate-spin' : ''}`} />
          Aggiorna
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Ordini', metrics.total],
          ['Da preparare', metrics.toPrint],
          ['In stampa', metrics.printing],
          ['Pronti', metrics.ready],
          ['Incassato', euroFromCents(metrics.revenueCents)],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-stone-900">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_240px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca numero ordine, cliente o email" className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Tutti gli stati" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              {STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{STATUS_LABELS[status]}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {listQuery.isLoading ? (
        <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-stone-500" /></div>
      ) : listQuery.isError ? (
        <Card className="border-red-200 bg-red-50"><CardContent className="p-6 text-red-800">Impossibile caricare gli ordini: {(listQuery.error as Error).message}</CardContent></Card>
      ) : filteredOrders.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-stone-500"><Printer className="mx-auto mb-3 h-9 w-9" />Nessun ordine corrisponde ai filtri.</CardContent></Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredOrders.map((order) => {
            const status = order.fulfillment?.status || 'submitted';
            const isPaid = order.payment?.status === 'paid';
            return (
              <Card key={order.id} className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{order.orderNumber || order.id}</CardTitle>
                      <CardDescription>{orderCustomerName(order)} · {orderCustomerEmail(order)}</CardDescription>
                    </div>
                    <Badge variant="outline" className={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-stone-50 p-3 text-sm sm:grid-cols-4">
                    <div><span className="block text-stone-500">Pagamento</span><span className={isPaid ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>{isPaid ? 'Pagato' : 'Da verificare'}</span></div>
                    <div><span className="block text-stone-500">Totale</span><span className="font-semibold">{euroFromCents(orderTotalCents(order))}</span></div>
                    <div><span className="block text-stone-500">File</span><span className="font-semibold">{order.printShop?.assetCount || 0}</span></div>
                    <div><span className="block text-stone-500">Copie</span><span className="font-semibold">{order.printShop?.copyCount || 0}</span></div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-stone-500">Ricevuto {formatDate(order.createdAt)}</span>
                    <Button onClick={() => setSelectedOrderId(order.id)}>Apri ordine</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedOrderId} onOpenChange={(open) => !open && setSelectedOrderId(null)}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedOrder?.orderNumber || 'Dettaglio ordine'}</DialogTitle>
            <DialogDescription>{selectedOrder ? `${orderCustomerName(selectedOrder)} · ${orderCustomerEmail(selectedOrder)}` : 'Caricamento…'}</DialogDescription>
          </DialogHeader>
          {detailQuery.isLoading || !selectedOrder ? (
            <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Card><CardContent className="p-4"><p className="text-xs text-stone-500">Totale pagato</p><p className="text-xl font-semibold">{euroFromCents(orderTotalCents(selectedOrder))}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-stone-500">Fotografie</p><p className="text-xl font-semibold">{selectedOrder.printShop?.assetCount || selectedOrder.assets?.length || 0}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-stone-500">Stampe totali</p><p className="text-xl font-semibold">{selectedOrder.printShop?.copyCount || 0}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-stone-500">Costo laboratorio</p><p className="text-xl font-semibold">{euroFromCents(selectedOrder.printShop?.totalSupplierCostCents)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-stone-500">Margine stimato</p><p className="text-xl font-semibold">{euroFromCents(selectedOrder.printShop?.estimatedMarginCents ?? orderTotalCents(selectedOrder))}</p></CardContent></Card>
              </div>

              <section>
                <h3 className="mb-3 font-semibold text-stone-900">Configurazioni di stampa</h3>
                <div className="space-y-2">
                  {(selectedOrder.printShop?.items || []).map((item, index) => (
                    <div key={index} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                      <div>
                        <p className="font-medium">{item.productName || item.prodottoNome || item.formatLabel || `Gruppo ${index + 1}`}</p>
                        <p className="text-stone-500">
                          {item.finish === 'matte' ? 'Carta opaca' : 'Carta lucida'} · {item.fitMode === 'border' ? 'Foto intera con bordo bianco' : 'Riempi tutto il foglio'}
                        </p>
                      </div>
                      <Badge variant="secondary">{item.copyCount || item.quantity || item.quantita || 0} stampe</Badge>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-stone-900">File originali</h3>
                  <span className="text-xs text-stone-500">Conservazione: 90 giorni dalla consegna</span>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <span className="flex items-center gap-2"><ImageIcon className="h-4 w-4" />{selectedOrder.assets?.length || selectedOrder.printShop?.assetCount || 0} JPG</span>
                    {selectedOrder.assets?.some((asset) => asset.qualityWarning) && (
                      <span className="flex items-center gap-2 text-amber-700"><AlertTriangle className="h-4 w-4" />Sono presenti avvisi qualità</span>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => downloadProtected(`/api/print-shop/admin/orders/${selectedOrder.id}/manifest?format=csv`, `${selectedOrder.orderNumber || selectedOrder.id}.csv`)}>
                      <Download className="mr-2 h-4 w-4" />Distinta CSV
                    </Button>
                    <Button variant="outline" onClick={() => downloadProtected(`/api/print-shop/admin/orders/${selectedOrder.id}/archive`, `${selectedOrder.orderNumber || selectedOrder.id}.zip`)}>
                      <FileArchive className="mr-2 h-4 w-4" />Originali ZIP
                    </Button>
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-stone-900">Produzione laboratorio</h3>
                    <p className="text-xs text-stone-500">I file vengono trasferiti su Drive e collegati a questo ordine.</p>
                  </div>
                  <Button variant="outline" onClick={() => { setSelectedLabId(''); setLabDialogOpen(true); }}>
                    <Printer className="mr-2 h-4 w-4" />Prepara invio
                  </Button>
                </div>
                {shipmentsQuery.isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : shipments.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-5 text-sm text-stone-500">Nessuna spedizione al laboratorio.</div>
                ) : (
                  <div className="space-y-2">
                    {shipments.map((shipment) => {
                      const transferStatus = (shipment as LabShipment & { transfer?: { status?: string } }).transfer?.status || shipment.pageTransfer?.status;
                      const canSend = transferStatus === 'completed';
                      return (
                        <div key={shipment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                          <div>
                            <p className="font-medium">{shipment.labNome || 'Laboratorio da assegnare'}</p>
                            <p className="text-stone-500">{shipment.status} · trasferimento {transferStatus || 'preparato'}</p>
                            <p className="mt-1 text-xs text-stone-500">Costo: {typeof shipment.costoImporto === 'number' ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(shipment.costoImporto) : 'da inserire'}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => {
                              setSelectedShipmentId(shipment.id);
                              setSupplierCost(typeof shipment.costoImporto === 'number' ? String(shipment.costoImporto).replace('.', ',') : '');
                              setCostDialogOpen(true);
                            }}>
                              <WalletCards className="mr-2 h-4 w-4" />Costo
                            </Button>
                            {shipment.status === 'da_inviare' && (
                              <Button size="sm" disabled={!canSend || sendShipmentMutation.isPending} onClick={() => sendShipmentMutation.mutate(shipment.id)}>
                                <Send className="mr-2 h-4 w-4" />Invia link
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
                <Badge variant="outline" className={STATUS_COLORS[selectedOrder.fulfillment?.status || 'submitted']}>
                  {STATUS_LABELS[selectedOrder.fulfillment?.status || 'submitted']}
                </Badge>
                {availableNextStatuses.length > 0 && (
                  <Button onClick={() => {
                    setNextStatus(availableNextStatuses[0]);
                    setStatusDialogOpen(true);
                  }}>
                    <PackageCheck className="mr-2 h-4 w-4" />Aggiorna stato
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aggiorna produzione</DialogTitle><DialogDescription>La modifica sarà visibile anche al cliente.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nuovo stato</Label><Select value={nextStatus} onValueChange={(value) => setNextStatus(value as FulfillmentStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{availableNextStatuses.map((status) => <SelectItem key={status} value={status}>{STATUS_LABELS[status]}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="print-status-note">Nota interna</Label><Textarea id="print-status-note" value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="Facoltativa" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setStatusDialogOpen(false)}>Annulla</Button><Button onClick={() => statusMutation.mutate()} disabled={statusMutation.isPending}>{statusMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Salva stato</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={labDialogOpen} onOpenChange={setLabDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Prepara il laboratorio</DialogTitle><DialogDescription>Gli originali e la distinta verranno copiati nella cartella Drive della spedizione.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label>Laboratorio con DPA firmato</Label><Select value={selectedLabId} onValueChange={setSelectedLabId} disabled={eligibleLabs.length === 0}><SelectTrigger><SelectValue placeholder={eligibleLabs.length ? 'Seleziona laboratorio' : 'Nessun laboratorio abilitato'} /></SelectTrigger><SelectContent>{eligibleLabs.map((lab) => <SelectItem key={lab.id} value={lab.id}>{lab.nome}</SelectItem>)}</SelectContent></Select></div>
          {blockedLabsCount > 0 && <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" /><p>{blockedLabsCount} {blockedLabsCount === 1 ? 'laboratorio è escluso' : 'laboratori sono esclusi'} perché l’accordo DPA non risulta firmato. Aggiorna l’anagrafica Laboratori per abilitarlo.</p></div>}
          <DialogFooter><Button variant="outline" onClick={() => setLabDialogOpen(false)}>Annulla</Button><Button onClick={() => labMutation.mutate()} disabled={!selectedLabEligible || labMutation.isPending}>{labMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}Prepara trasferimento</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={costDialogOpen} onOpenChange={setCostDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Costo del laboratorio</DialogTitle><DialogDescription>Il costo fornitore aggiorna automaticamente il margine stimato dell'ordine.</DialogDescription></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="print-supplier-cost">Importo in euro</Label>
            <Input id="print-supplier-cost" inputMode="decimal" value={supplierCost} onChange={(event) => setSupplierCost(event.target.value)} placeholder="0,00" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCostDialogOpen(false)}>Annulla</Button>
            <Button onClick={() => supplierCostMutation.mutate()} disabled={!supplierCost.trim() || supplierCostMutation.isPending}>
              {supplierCostMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salva costo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
