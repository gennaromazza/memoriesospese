import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Clock3, Download, FileArchive, ImageIcon, Loader2, Mail, MapPin, MessageCircle, Phone, RefreshCw, Search, Send, Truck } from 'lucide-react';
import {
  SHOP_RESENDABLE_MAILS,
  formatShopPrice,
  type ShopAdminOrderDto,
  type ShopAdminOrderSummaryDto,
  type ShopAdminView,
  type ShopAssetDto,
} from '@shared/shop-types';
import { getWhatsAppLink } from '@shared/phone-utils';
import { formatShopWeight } from '@shared/shop-shipping';
import { shopApi } from '@/features/shop/shop-api';
import { downloadBlob } from '@/features/shop/download';
import { addressText, formatOrderDate } from '@/features/shop/ShopOrderParts';
import { ADMIN_ACTION_LABELS, ADMIN_STATUS_LABELS, mailKindLabel } from '@/features/shop/shop-status';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type TargetStatus = keyof typeof ADMIN_ACTION_LABELS;

const VIEWS: Array<{ id: ShopAdminView; label: string }> = [
  { id: 'active', label: 'Da lavorare' },
  { id: 'attention', label: 'Da guardare' },
  { id: 'drafts', label: 'Bozze' },
  { id: 'closed', label: 'Chiusi' },
  { id: 'all', label: 'Tutti' },
];

const listKey = (view: ShopAdminView, q: string) => ['shop-admin-orders', view, q] as const;
const orderKey = (id: string | null) => ['shop-admin-order', id] as const;

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** Anteprima ridotta di una foto del cliente: si scarica con l'accesso dello studio. */
function AdminPhoto({ orderId, asset, onDownload }: { orderId: string; asset: ShopAssetDto; onDownload: () => void }) {
  const preview = useQuery({
    queryKey: ['shop-admin-preview', orderId, asset.id],
    queryFn: () => shopApi.adminPreview(orderId, asset.id),
    enabled: asset.status === 'ready',
    staleTime: Infinity,
    retry: false,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!preview.data) return;
    const objectUrl = URL.createObjectURL(preview.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [preview.data]);
  return (
    <button type="button" onClick={onDownload} className="group relative block h-24 w-24 overflow-hidden rounded-xl bg-sage/10" title={`Scarica l'originale: ${asset.originalName}`}>
      {url ? <img src={url} alt={asset.originalName} className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-blue-gray/40">{preview.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-6 w-6" />}</span>}
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-0.5 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"><Download className="h-3 w-3" /> Originale</span>
      {asset.lowResolution && <span className="absolute left-0 top-0 rounded-br-lg bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">Piccola</span>}
    </button>
  );
}

function statusTone(order: Pick<ShopAdminOrderSummaryDto, 'fulfillmentStatus' | 'needsAttention'>): string {
  if (order.needsAttention) return 'border-red-200 bg-red-50 text-red-800';
  if (order.fulfillmentStatus === 'awaiting_photos' || order.fulfillmentStatus === 'awaiting_payment') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (order.fulfillmentStatus === 'cancelled') return 'border-sage/30 bg-white text-blue-gray/60';
  return 'border-emerald-200 bg-emerald-50 text-emerald-800';
}

export function OrderDetail({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const orderQuery = useQuery({ queryKey: orderKey(orderId), queryFn: () => shopApi.adminOrder(orderId), staleTime: 10_000 });
  const order = orderQuery.data;
  const [action, setAction] = useState<TargetStatus | null>(null);
  const [reason, setReason] = useState('');
  const [carrier, setCarrier] = useState('');
  const [code, setCode] = useState('');
  const [notes, setNotes] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [zipping, setZipping] = useState(false);

  const accept = (updated: ShopAdminOrderDto, message?: string) => {
    queryClient.setQueryData(orderKey(orderId), updated);
    void queryClient.invalidateQueries({ queryKey: ['shop-admin-orders'] });
    if (message) toast({ title: message });
  };
  const failure = (title: string) => (error: unknown) => toast({ variant: 'destructive', title, description: errorText(error, 'Riprova tra poco.') });

  const statusMutation = useMutation({
    mutationFn: (input: Parameters<typeof shopApi.adminUpdateStatus>[1]) => shopApi.adminUpdateStatus(orderId, input),
    onSuccess: updated => {
      accept(updated, `Ordine ${ADMIN_STATUS_LABELS[updated.fulfillmentStatus].toLowerCase()}`);
      setAction(null);
      setReason('');
      setCarrier('');
      setCode('');
    },
    onError: failure('Passaggio non riuscito'),
  });
  const notesMutation = useMutation({
    mutationFn: (note: string) => shopApi.adminSaveNotes(orderId, note),
    onSuccess: updated => { accept(updated, 'Note salvate'); setNotes(null); },
    onError: failure('Note non salvate'),
  });
  const resendMutation = useMutation({
    mutationFn: (kind: (typeof SHOP_RESENDABLE_MAILS)[number]) => shopApi.adminResend(orderId, kind),
    onSuccess: updated => accept(updated, 'Email inviata'),
    onError: failure('Email non inviata'),
  });
  const rejectMutation = useMutation({
    mutationFn: (input: { assetId: string; reason: string }) => shopApi.adminRejectPhoto(orderId, input.assetId, input.reason),
    onSuccess: updated => { accept(updated, 'Foto tolta: ho avvisato il cliente'); setRejecting(null); setRejectReason(''); },
    onError: failure('Foto non tolta'),
  });
  const reactivateMutation = useMutation({
    mutationFn: () => shopApi.adminReactivate(orderId),
    onSuccess: updated => accept(updated, 'Ordine riattivato'),
    onError: failure('Ordine non riattivato'),
  });

  const downloadOriginal = async (asset: ShopAssetDto) => {
    try {
      downloadBlob(await shopApi.adminOriginal(orderId, asset.id), asset.originalName || `${asset.id}.jpg`);
    } catch (error) {
      failure('Download non riuscito')(error);
    }
  };
  const downloadZip = async () => {
    if (!order) return;
    setZipping(true);
    try {
      downloadBlob(await shopApi.adminPhotosZip(orderId), `${order.orderNumber}-foto.zip`);
    } catch (error) {
      failure('Archivio non scaricato')(error);
    } finally {
      setZipping(false);
    }
  };

  if (orderQuery.isLoading) return <div className="flex items-center justify-center py-16" role="status"><Loader2 className="h-7 w-7 animate-spin text-terracotta" /></div>;
  if (orderQuery.isError || !order) {
    return (
      <div className="py-10 text-center" role="alert">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-700" />
        <p className="mt-3 font-semibold text-red-900">{errorText(orderQuery.error, 'Non riesco a caricare l’ordine.')}</p>
        <Button variant="outline" className="mt-4" onClick={onClose}>Chiudi</Button>
      </div>
    );
  }

  const phone = order.customer.phone;
  const whatsapp = phone ? getWhatsAppLink(phone, `Ciao ${order.customer.name.split(' ')[0] || ''}, ti scriviamo per l'ordine shop ${order.orderNumber}.`) : '';
  const photoLines = order.lines.filter(line => line.photosRequired > 0);
  const hasPhotos = photoLines.some(line => line.photos.some(photo => photo.status === 'ready'));
  const busy = statusMutation.isPending;
  const startAction = (next: TargetStatus) => {
    setAction(next);
    setReason('');
  };
  const canConfirm = action === 'cancelled' ? reason.trim().length > 0 : action === 'shipped' ? code.trim().length > 0 : action !== null;

  return (
    <div className="space-y-6 text-sm">
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
          {order.orderNumber}
          <Badge variant="outline" className={statusTone(order)}>{ADMIN_STATUS_LABELS[order.fulfillmentStatus]}</Badge>
        </DialogTitle>
        <DialogDescription>
          Ordinato il {formatOrderDate(order.createdAt)}{order.paidAt ? ` · pagato il ${formatOrderDate(order.paidAt)}` : ' · non ancora pagato'}
        </DialogDescription>
      </DialogHeader>

      {order.paymentStatus === 'paid_action_required' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900" role="alert">
          <p className="font-semibold">Pagamento da controllare</p>
          <p className="mt-1">È arrivato un pagamento PayPal su un ordine non più attivo. Puoi riattivare l'ordine, oppure rimborsare da PayPal.</p>
          {order.canReactivate && <Button className="mt-3" disabled={reactivateMutation.isPending} onClick={() => reactivateMutation.mutate()}>{reactivateMutation.isPending ? <Loader2 className="animate-spin" /> : null} Tieni l'ordine e riattivalo</Button>}
        </div>
      )}
      {order.refundPending && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900" role="alert">
          <p className="font-semibold">Da rimborsare</p>
          <p className="mt-1">Hai annullato un ordine già pagato: il rimborso si fa da PayPal. Quando lo fai, qui compare da solo.</p>
        </div>
      )}
      {order.refundedAfterShipping && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900" role="alert">Questo ordine è stato rimborsato dopo la spedizione: l'ordine non è stato annullato.</div>
      )}
      {order.photoOverdue && order.fulfillmentStatus === 'awaiting_photos' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900" role="alert">Le foto non sono arrivate entro il termine{order.photoDeadlineAt ? ` (${formatOrderDate(order.photoDeadlineAt)})` : ''}. Scrivi al cliente, oppure annulla e rimborsa.</div>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-sage/20 p-4">
          <h3 className="font-semibold">Cliente</h3>
          <p className="mt-2">{order.customer.name}</p>
          <p className="mt-1 flex items-center gap-2"><Mail className="h-4 w-4 text-dark-sage" /><a className="underline" href={`mailto:${order.customer.email}`}>{order.customer.email}</a></p>
          {phone && <p className="mt-1 flex flex-wrap items-center gap-2"><Phone className="h-4 w-4 text-dark-sage" /><a className="underline" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a>{whatsapp && <a className="inline-flex items-center gap-1 underline" href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}</p>}
          {order.customerNotes && <p className="mt-3 rounded-lg bg-off-white p-2 text-blue-gray/80"><strong>Note del cliente:</strong> {order.customerNotes}</p>}
        </div>
        <div className="rounded-xl border border-sage/20 p-4">
          <h3 className="font-semibold">Consegna</h3>
          {order.method === 'shipping' ? (
            <>
              <p className="mt-2 flex items-start gap-2"><Truck className="mt-0.5 h-4 w-4 text-dark-sage" /> {order.fulfillment.shippingAddress ? addressText(order.fulfillment.shippingAddress) : 'Indirizzo mancante'}</p>
              {order.fulfillment.tracking && <p className="mt-1">Corriere {order.fulfillment.tracking.carrier || '—'} · tracking <strong>{order.fulfillment.tracking.code}</strong></p>}
              {order.billingDetails && <p className="mt-2 text-blue-gray/70">Codice fiscale <strong>{order.billingDetails.fiscalCode}</strong><br />Residenza: {addressText(order.billingDetails.residenceAddress)}</p>}
            </>
          ) : (
            <p className="mt-2 flex items-center gap-2"><MapPin className="h-4 w-4 text-dark-sage" /> Ritiro in studio</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-sage/20 p-4">
        <h3 className="font-semibold">Prodotti</h3>
        <ul className="mt-2 divide-y divide-sage/15">
          {order.lines.map(line => (
            <li key={line.lineId} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{line.productName}{line.quantity > 1 ? ` × ${line.quantity}` : ''}</span>
                <span>{formatShopPrice(line.lineTotalCents)}</span>
              </div>
              {line.photosRequired > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-blue-gray/60">{line.photos.filter(photo => photo.status === 'ready').length} di {line.photosRequired} foto{line.photosMissing > 0 ? ` · mancano ${line.photosMissing}` : ''}</p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {line.photos.map(photo => (
                      <div key={photo.id}>
                        <AdminPhoto orderId={order.id} asset={photo} onDownload={() => void downloadOriginal(photo)} />
                        {order.canRequestNewPhoto && photo.status === 'ready' && (
                          <button type="button" className="mt-1 w-24 text-center text-[11px] text-red-700 underline" onClick={() => { setRejecting(photo.id); setRejectReason(''); }}>Chiedi un'altra</button>
                        )}
                        {photo.widthPx && <p className="w-24 text-center text-[10px] text-blue-gray/50">{photo.widthPx}×{photo.heightPx}</p>}
                      </div>
                    ))}
                  </div>
                  {rejecting && line.photos.some(photo => photo.id === rejecting) && (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                      <label className="text-xs font-semibold text-red-900" htmlFor="reject-reason">Che cosa non va nella foto? Il cliente lo leggerà nell'email.</label>
                      <Input id="reject-reason" value={rejectReason} onChange={event => setRejectReason(event.target.value)} maxLength={300} className="mt-2" placeholder="Per esempio: è sfocata" />
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" disabled={!rejectReason.trim() || rejectMutation.isPending} onClick={() => rejectMutation.mutate({ assetId: rejecting, reason: rejectReason })}>{rejectMutation.isPending ? <Loader2 className="animate-spin" /> : <Send />} Togli e avvisa il cliente</Button>
                        <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>Annulla</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-sage/20 pt-3">
          <span className="font-semibold">
            Totale {formatShopPrice(order.totals.totalCents)}{order.totals.shippingCents > 0 ? ` (spedizione ${formatShopPrice(order.totals.shippingCents)})` : ''}
            {order.weightGrams ? <span className="ml-2 font-normal text-blue-gray/70">· peso circa {formatShopWeight(order.weightGrams)}</span> : null}
          </span>
          {hasPhotos && <Button size="sm" variant="outline" disabled={zipping} onClick={() => void downloadZip()}>{zipping ? <Loader2 className="animate-spin" /> : <FileArchive />} Scarica tutte le foto (zip)</Button>}
        </div>
      </section>

      {order.allowedStatuses.length > 0 && (
        <section className="rounded-xl border border-terracotta/30 bg-terracotta/5 p-4">
          <h3 className="font-semibold">Avanzamento</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {order.allowedStatuses.map(status => (
              <Button key={status} variant={status === 'cancelled' ? 'outline' : 'default'} className={status === 'cancelled' ? 'border-red-200 text-red-700 hover:bg-red-50' : 'bg-terracotta text-white hover:bg-terracotta/90'} disabled={busy} onClick={() => startAction(status as TargetStatus)}>
                {ADMIN_ACTION_LABELS[status as TargetStatus]}
              </Button>
            ))}
          </div>
          {action && (
            <div className="mt-4 space-y-3 rounded-lg border border-sage/25 bg-white p-3">
              <p className="font-semibold">{ADMIN_ACTION_LABELS[action]}</p>
              {action === 'shipped' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-semibold">Corriere<Input value={carrier} onChange={event => setCarrier(event.target.value)} maxLength={60} placeholder="BRT, SDA, Poste…" className="mt-1" /></label>
                  <label className="text-xs font-semibold">Codice di tracciamento<Input value={code} onChange={event => setCode(event.target.value)} maxLength={100} className="mt-1" /></label>
                </div>
              )}
              {action === 'cancelled' && (
                <div>
                  <label className="text-xs font-semibold" htmlFor="cancel-reason">Motivo dell'annullamento (lo legge il cliente)</label>
                  <Textarea id="cancel-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} rows={2} className="mt-1" />
                  <p className="mt-1 text-xs text-amber-800">Se l'ordine è già pagato, il rimborso lo fai da PayPal.</p>
                </div>
              )}
              {(action === 'ready_for_pickup' || action === 'shipped' || action === 'delivered' || action === 'cancelled') && <p className="text-xs text-blue-gray/60">Al cliente parte una email.</p>}
              <div className="flex gap-2">
                <Button disabled={!canConfirm || busy} onClick={() => statusMutation.mutate({ status: action, ...(action === 'cancelled' ? { note: reason.trim() } : {}), ...(action === 'shipped' ? { tracking: { ...(carrier.trim() ? { carrier: carrier.trim() } : {}), code: code.trim() } } : {}) })}>
                  {busy ? <Loader2 className="animate-spin" /> : null} Conferma
                </Button>
                <Button variant="ghost" onClick={() => setAction(null)} disabled={busy}>Annulla</Button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-sage/20 p-4">
        <h3 className="font-semibold">Pagamento</h3>
        <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <div className="flex justify-between"><dt className="text-blue-gray/60">Incassato</dt><dd>{formatShopPrice(order.payment.amountCents)}</dd></div>
          <div className="flex justify-between"><dt className="text-blue-gray/60">Commissione PayPal</dt><dd>{formatShopPrice(order.payment.paypalFeeCents)}</dd></div>
          <div className="flex justify-between"><dt className="text-blue-gray/60">Netto</dt><dd>{formatShopPrice(order.payment.netAmountCents)}</dd></div>
          <div className="flex justify-between"><dt className="text-blue-gray/60">Rimborsato</dt><dd>{formatShopPrice(order.payment.refundedCents)}</dd></div>
        </dl>
        {order.payment.paypalCaptureId && <p className="mt-2 break-all text-xs text-blue-gray/50">PayPal: ordine {order.payment.paypalOrderId} · cattura {order.payment.paypalCaptureId}</p>}
        {order.legal && <p className="mt-1 text-xs text-blue-gray/50">Condizioni accettate il {formatOrderDate(order.legal.acceptedAt)} (versione {order.legal.termsVersion})</p>}
      </section>

      <section className="rounded-xl border border-sage/20 p-4">
        <h3 className="font-semibold">Note interne</h3>
        <Textarea value={notes ?? order.adminNotes ?? ''} onChange={event => setNotes(event.target.value)} rows={2} maxLength={2000} className="mt-2" placeholder="Solo per te: il cliente non le vede." />
        {notes !== null && notes !== (order.adminNotes ?? '') && (
          <Button size="sm" className="mt-2" disabled={notesMutation.isPending} onClick={() => notesMutation.mutate(notes)}>{notesMutation.isPending ? <Loader2 className="animate-spin" /> : null} Salva note</Button>
        )}
      </section>

      <section className="rounded-xl border border-sage/20 p-4">
        <h3 className="font-semibold">Email</h3>
        {order.notifications.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {order.notifications.map(item => (
              <li key={item.key} className="flex flex-wrap items-center justify-between gap-2">
                <span>{mailKindLabel(item.kind)}</span>
                <span className={item.status === 'sent' ? 'text-emerald-700' : item.status === 'failed' ? 'text-red-700' : 'text-amber-700'}>
                  {item.status === 'sent' ? `inviata ${formatOrderDate(item.sentAt)}` : item.status === 'failed' ? `non inviata (${item.lastError ?? 'errore'})` : 'in invio'}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-blue-gray/55">Nessuna email inviata finora.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {SHOP_RESENDABLE_MAILS.map(kind => (
            <Button key={kind} size="sm" variant="outline" disabled={resendMutation.isPending} onClick={() => resendMutation.mutate(kind)}>{mailKindLabel(kind)}</Button>
          ))}
        </div>
        <p className="mt-1 text-xs text-blue-gray/50">Ogni pulsante rimanda quell'email al cliente.</p>
      </section>

      {order.history.length > 0 && (
        <section className="rounded-xl border border-sage/20 p-4">
          <h3 className="font-semibold">Storia</h3>
          <ol className="mt-2 space-y-1">
            {order.history.map((entry, index) => (
              <li key={index} className="flex gap-2 text-blue-gray/75"><Clock3 className="mt-0.5 h-3.5 w-3.5 flex-none" /><span>{formatOrderDate(entry.at)} · {ADMIN_STATUS_LABELS[entry.to]}{entry.note ? ` · ${entry.note}` : ''} <span className="text-blue-gray/40">({entry.by})</span></span></li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/** Elenco degli ordini dello shop, con ricerca e dettaglio. */
export default function ShopOrdersManager() {
  const [view, setView] = useState<ShopAdminView>('active');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<string | null>(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('shopOrderId')));
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const listQuery = useQuery({ queryKey: listKey(view, debounced), queryFn: () => shopApi.adminOrders(view, debounced), staleTime: 15_000 });
  const attentionQuery = useQuery({ queryKey: listKey('attention', ''), queryFn: () => shopApi.adminOrders('attention'), staleTime: 30_000 });
  const attentionCount = attentionQuery.data?.length ?? 0;
  const orders = listQuery.data ?? [];
  const summary = useMemo(() => ({ total: orders.length }), [orders]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map(item => (
          <Button key={item.id} variant={view === item.id ? 'default' : 'outline'} size="sm" className="rounded-full" onClick={() => setView(item.id)}>
            {item.label}{item.id === 'attention' && attentionCount > 0 ? <Badge className="ml-2 bg-red-600 text-white">{attentionCount}</Badge> : null}
          </Button>
        ))}
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-gray/40" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Numero, nome o email" className="pl-9" aria-label="Cerca un ordine" />
        </div>
        <Button variant="ghost" size="icon" onClick={() => void listQuery.refetch()} aria-label="Aggiorna l'elenco"><RefreshCw className={listQuery.isFetching ? 'animate-spin' : ''} /></Button>
      </div>

      {listQuery.isLoading ? (
        <div className="flex justify-center py-16" role="status"><Loader2 className="h-7 w-7 animate-spin text-terracotta" /></div>
      ) : listQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-900" role="alert">{errorText(listQuery.error, 'Non riesco a caricare gli ordini.')}</div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sage/40 p-10 text-center text-blue-gray/60">Nessun ordine in questa vista.</div>
      ) : (
        <ul className="space-y-3">
          <li className="text-xs text-blue-gray/50">{summary.total} {summary.total === 1 ? 'ordine' : 'ordini'}</li>
          {orders.map(order => (
            <li key={order.id}>
              <button type="button" onClick={() => setSelected(order.id)} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-sage/25 bg-white p-4 text-left transition hover:border-terracotta/50">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{order.orderNumber}</span>
                    <Badge variant="outline" className={statusTone(order)}>{ADMIN_STATUS_LABELS[order.fulfillmentStatus]}</Badge>
                    {order.needsAttention && <AlertTriangle className="h-4 w-4 text-red-600" aria-label="Da guardare" />}
                    {order.method === 'shipping' && <Truck className="h-4 w-4 text-dark-sage" aria-label="Spedizione" />}
                  </div>
                  <p className="mt-1 truncate text-sm text-blue-gray/70">{order.customerName} · {order.customerEmail}</p>
                  <p className="mt-0.5 text-xs text-blue-gray/50">{formatOrderDate(order.paidAt || order.createdAt)}{order.photosMissing ? ` · mancano ${order.photosMissing} foto` : ''}{order.photoDeadlineAt && order.photosMissing ? ` (entro il ${formatOrderDate(order.photoDeadlineAt)})` : ''}</p>
                </div>
                <strong className="text-lg text-terracotta">{formatShopPrice(order.totalCents)}</strong>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {selected ? <OrderDetail orderId={selected} onClose={() => setSelected(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
