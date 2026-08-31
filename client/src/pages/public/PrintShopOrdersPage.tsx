import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock3,
  Image as ImageIcon,
  Loader2,
  MapPin,
  PackageOpen,
  RefreshCw,
  ShoppingBag,
  Trash2,
  Truck,
} from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
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
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { useStudio } from '@/context/StudioContext';
import { useSEO } from '@/hooks/useSEO';
import { PrintShopAuthGate } from '@/features/print-shop/PrintShopAuthGate';
import { printShopApi } from '@/features/print-shop/print-shop-api';
import { formatEuroCents } from '@/features/print-shop/print-shop-state';
import {
  formatPrintOrderDate,
  PRINT_ORDER_STATUS_LABELS,
  PRINT_PAYMENT_STATUS_LABELS,
  printOrderStatusTone,
  printPaymentStatusTone,
} from '@/features/print-shop/order-display';
import type { PrintShopOrderListItem } from '@/features/print-shop/types';
import {
  isResumablePrintDraft,
  printShopDraftRequestStorageKey,
  printShopDraftStorageKey,
} from '@/features/print-shop/resume-draft';

export default function PrintShopOrdersPage() {
  useSEO({
    title: 'I miei ordini di stampe | Image Studio',
    description: 'Consulta lo stato delle tue stampe fotografiche, dal pagamento alla consegna.',
    canonical: '/stampa-foto-aversa/i-miei-ordini',
    noindex: true,
  });
  const [, navigate] = useLocation();
  const { user, isGoogleAuthenticated, isLoading: authLoading } = useFirebaseAuth();
  const { studioSettings } = useStudio();
  const [orders, setOrders] = useState<PrintShopOrderListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draftToDelete, setDraftToDelete] = useState<PrintShopOrderListItem | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  const loadOrders = useCallback(async (signal?: AbortSignal) => {
    if (!user || !isGoogleAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      setOrders(await printShopApi.listMyOrders(signal));
    } catch (loadError) {
      if (!(loadError instanceof DOMException && loadError.name === 'AbortError')) {
        setError(loadError instanceof Error ? loadError.message : 'Non riesco a caricare gli ordini.');
      }
    } finally {
      setLoading(false);
    }
  }, [isGoogleAuthenticated, user]);

  useEffect(() => {
    if (!user || !isGoogleAuthenticated) {
      setOrders([]);
      return;
    }
    const controller = new AbortController();
    void loadOrders(controller.signal);
    return () => controller.abort();
  }, [isGoogleAuthenticated, loadOrders, user]);

  const resumeDraft = (order: PrintShopOrderListItem) => {
    if (!user || !isResumablePrintDraft(order)) return;
    sessionStorage.setItem(printShopDraftStorageKey(user.uid), order.id);
    // La bozza esiste già: una vecchia chiave di creazione non deve mai essere
    // riutilizzata se il GET dovesse poi stabilire che l'ordine non è più valido.
    sessionStorage.removeItem(printShopDraftRequestStorageKey(user.uid));
    navigate('/stampa-foto-aversa/ordine');
  };

  const deleteDraft = async () => {
    if (!user || !draftToDelete) return;
    const order = draftToDelete;
    setDeletingOrderId(order.id);
    setActionError(null);
    try {
      await printShopApi.deleteDraftOrder(order.id);
      if (sessionStorage.getItem(printShopDraftStorageKey(user.uid)) === order.id) {
        sessionStorage.removeItem(printShopDraftStorageKey(user.uid));
        sessionStorage.removeItem(printShopDraftRequestStorageKey(user.uid));
      }
      setOrders((current) => current.filter((entry) => entry.id !== order.id));
      setDraftToDelete(null);
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : 'Non riesco a eliminare la bozza. Riprova.');
      setDraftToDelete(null);
    } finally {
      setDeletingOrderId(null);
    }
  };

  const address = studioSettings.address?.trim();

  return (
    <div className="min-h-screen bg-off-white text-blue-gray">
      <Navigation />
      <main className="pb-20 pt-24 sm:pt-28">
        <header className="border-b border-sage/15 bg-white px-4 py-10">
          <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terracotta">Area personale</p>
              <h1 className="mt-2 text-3xl font-semibold sm:text-5xl">I miei ordini</h1>
              <p className="mt-3 text-blue-gray/60">Segui ogni passaggio, dalla verifica delle foto al ritiro o alla spedizione.</p>
            </div>
            {user && (
              <Link href="/stampa-foto-aversa/ordine"><Button className="h-12 rounded-full bg-terracotta px-6 text-white hover:bg-terracotta/90"><Camera aria-hidden="true" /> Nuovo ordine</Button></Link>
            )}
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-4 py-10">
          {actionError && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" />
              <span>{actionError}</span>
            </div>
          )}
          {authLoading ? (
            <div className="flex min-h-64 items-center justify-center" role="status"><Loader2 className="h-8 w-8 animate-spin text-terracotta" aria-hidden="true" /></div>
          ) : !user || !isGoogleAuthenticated ? (
            <div className="mx-auto max-w-3xl"><PrintShopAuthGate /></div>
          ) : loading && orders.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3" role="status"><Loader2 className="h-8 w-8 animate-spin text-terracotta" aria-hidden="true" /><p className="text-sm text-blue-gray/55">Caricamento ordini…</p></div>
          ) : error ? (
            <div className="rounded-[2rem] border border-red-200 bg-white p-8 text-center shadow-sm" role="alert">
              <AlertTriangle className="mx-auto h-9 w-9 text-red-700" aria-hidden="true" />
              <p className="mt-4 font-semibold text-red-900">{error}</p>
              <Button type="button" variant="outline" onClick={() => void loadOrders()} className="mt-5 rounded-full"><RefreshCw aria-hidden="true" /> Riprova</Button>
            </div>
          ) : orders.length === 0 ? (
            <section className="rounded-[2.5rem] border border-sage/20 bg-white p-8 text-center shadow-sm sm:p-12">
              <PackageOpen className="mx-auto h-14 w-14 text-sage" aria-hidden="true" />
              <h2 className="mt-5 text-2xl font-semibold">Non hai ancora ordinato stampe</h2>
              <p className="mx-auto mt-3 max-w-lg text-blue-gray/55">Scegli le fotografie, il formato e la carta: puoi fare tutto online dal telefono.</p>
              <Link href="/stampa-foto-aversa/ordine"><Button className="mt-7 h-12 rounded-full bg-terracotta px-7 text-white hover:bg-terracotta/90">Inizia un ordine <ArrowRight aria-hidden="true" /></Button></Link>
            </section>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-blue-gray/55">{orders.length} {orders.length === 1 ? 'ordine' : 'ordini'}</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => void loadOrders()} disabled={loading} className="rounded-full text-blue-gray/55"><RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Aggiorna</Button>
              </div>

              {orders.map((order) => {
                const status = order.fulfillment?.status ?? 'draft';
                const paymentStatus = order.payment?.status ?? 'pending';
                const ready = status === 'ready_for_pickup';
                const shipping = order.fulfillment?.method === 'shipping';
                const shippingAddress = order.fulfillment?.shippingAddress;
                const shippingAddressText = shippingAddress ? `${shippingAddress.street} ${shippingAddress.houseNumber}, ${shippingAddress.postalCode} ${shippingAddress.city} (${shippingAddress.province})` : '';
                const resumable = isResumablePrintDraft(order);
                return (
                  <article key={order.id} className={`overflow-hidden rounded-[2rem] border bg-white shadow-sm ${ready ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-sage/20'}`}>
                    {ready && (
                      <div className="flex items-center justify-center gap-2 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Le tue stampe sono {shipping ? 'pronte per la spedizione' : 'pronte'}!</div>
                    )}
                    <div className="p-5 sm:p-7">
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xl font-semibold">{order.orderNumber}</h2>
                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${printOrderStatusTone(status)}`}>{shipping && status === 'ready_for_pickup' ? 'Pronto per la spedizione' : PRINT_ORDER_STATUS_LABELS[status]}</span>
                          </div>
                          <p className="mt-2 flex items-center gap-2 text-xs text-blue-gray/45"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> {formatPrintOrderDate(order.createdAt)}</p>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-2xl font-semibold text-terracotta">{formatEuroCents(order.totals?.totalCents ?? 0)}</p>
                          <p className={`mt-1 text-xs font-semibold ${printPaymentStatusTone(paymentStatus)}`}>{PRINT_PAYMENT_STATUS_LABELS[paymentStatus]}</p>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 rounded-2xl bg-off-white/70 p-4 sm:grid-cols-3">
                        <div className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-dark-sage" aria-hidden="true" /><span className="text-sm"><strong>{order.printShop?.assetCount ?? 0}</strong> file</span></div>
                        <div className="flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-dark-sage" aria-hidden="true" /><span className="text-sm"><strong>{order.printShop?.copyCount ?? 0}</strong> stampe</span></div>
                        <div className="flex items-center gap-2">{shipping ? <Truck className="h-4 w-4 flex-none text-dark-sage" aria-hidden="true" /> : <MapPin className="h-4 w-4 flex-none text-dark-sage" aria-hidden="true" />}<span className="truncate text-sm" title={shipping ? shippingAddressText : address}>{shipping ? `Spedizione${shippingAddressText ? ` · ${shippingAddressText}` : ''}` : `Ritiro in sede${address ? ` · ${address}` : ''}`}</span></div>
                      </div>

                      {order.printShop?.items && order.printShop.items.length > 0 && (
                        <details className="mt-5 rounded-xl border border-sage/15 px-4 py-3">
                          <summary className="cursor-pointer text-sm font-semibold text-blue-gray">Mostra formati e quantità</summary>
                          <ul className="mt-3 space-y-2 border-t border-sage/10 pt-3 text-sm text-blue-gray/60">
                            {order.printShop.items.map((item) => (
                              <li key={`${item.sku}-${item.finish}-${item.fitMode}`} className="flex justify-between gap-3">
                                <span>{item.productName} · {item.finish === 'glossy' ? 'lucida' : 'opaca'} · {item.fitMode === 'border' ? 'bordo bianco' : 'tutta pagina'}</span>
                                <strong className="whitespace-nowrap text-blue-gray">{item.copyCount} copie</strong>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}

                      {ready && <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-900">{shipping ? 'L’ordine è pronto per essere affidato alla spedizione. Riceverai gli aggiornamenti ai recapiti indicati.' : <>Puoi ritirare l’ordine{address ? ` presso ${address}` : ' in sede'}. Porta con te il numero <strong>{order.orderNumber}</strong>.</>}</p>}

                      {resumable && (
                        <div className="mt-5 flex flex-col gap-3 border-t border-sage/15 pt-5 sm:flex-row sm:justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDraftToDelete(order)}
                            disabled={deletingOrderId === order.id}
                            className="rounded-full border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                          >
                            <Trash2 aria-hidden="true" /> Elimina bozza
                          </Button>
                          <Button
                            type="button"
                            onClick={() => resumeDraft(order)}
                            disabled={deletingOrderId === order.id}
                            className="rounded-full bg-terracotta text-white hover:bg-terracotta/90"
                          >
                            Riprendi ordine <ArrowRight aria-hidden="true" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <AlertDialog open={Boolean(draftToDelete)} onOpenChange={(open) => { if (!open && !deletingOrderId) setDraftToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa bozza?</AlertDialogTitle>
            <AlertDialogDescription>
              Le foto caricate per {draftToDelete?.orderNumber ?? 'questo ordine'} verranno eliminate e non potrai recuperarle. Gli ordini già pagati non possono essere eliminati da qui.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingOrderId)}>Mantieni bozza</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); void deleteDraft(); }}
              disabled={Boolean(deletingOrderId)}
              className="bg-red-700 text-white hover:bg-red-800"
            >
              {deletingOrderId ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
              Elimina definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Footer />
    </div>
  );
}
