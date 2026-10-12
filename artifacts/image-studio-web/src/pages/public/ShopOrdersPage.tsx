import { useCallback, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Clock3, Loader2, PackageOpen, RefreshCw, ShoppingBag, Trash2 } from 'lucide-react';
import { formatShopPrice, type ShopOrderDto } from '@shared/shop-types';
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
import { WhatsAppHelp } from '@/features/print-shop/WhatsAppHelp';
import { shopApi } from '@/features/shop/shop-api';
import { SHOP_DRAFT_STORAGE_KEY, writeStored } from '@/features/shop/shop-cart';
import { ShopDeliveryLine, ShopOrderLines, ShopStatusPill, formatOrderDate } from '@/features/shop/ShopOrderParts';
import { ShopPhotoUploader } from '@/features/shop/ShopPhotoUploader';
import { ShopShell } from '@/features/shop/ShopShell';
import { shopNextStep } from '@/features/shop/shop-status';

export default function ShopOrdersPage() {
  useSEO({
    title: 'I miei ordini dello shop | Image Studio',
    description: 'Segui lo stato dei tuoi ordini dello shop online e carica le foto che mancano.',
    canonical: '/online-shop/i-miei-ordini',
    noindex: true,
  });
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useFirebaseAuth();
  const { studioSettings } = useStudio();
  const [highlight] = useState(() => new URLSearchParams(window.location.search).get('ordine'));
  const [toDelete, setToDelete] = useState<ShopOrderDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const ordersQuery = useQuery({ queryKey: ['shop-orders'], queryFn: shopApi.listOrders, enabled: Boolean(user), staleTime: 15_000 });
  const orders = ordersQuery.data ?? [];
  const reload = useCallback(() => queryClient.invalidateQueries({ queryKey: ['shop-orders'] }), [queryClient]);

  const resume = (order: ShopOrderDto) => {
    writeStored(SHOP_DRAFT_STORAGE_KEY, order.id);
    navigate('/online-shop/ordine');
  };

  const removeDraft = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setActionError(null);
    try {
      await shopApi.cancelOrder(toDelete.id);
      await reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Non riesco a eliminare la bozza. Riprova.');
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  const studioAddress = studioSettings.address?.trim();

  return (
    <ShopShell
      eyebrow="Area personale"
      title="I miei ordini"
      subtitle="Segui ogni passaggio, dalle foto al ritiro o alla spedizione."
      actions={user ? <Link href="/online-shop"><Button className="h-12 rounded-full bg-terracotta px-6 text-white hover:bg-terracotta/90"><ShoppingBag aria-hidden="true" /> Vai allo shop</Button></Link> : undefined}
    >
      {actionError && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" /><span>{actionError}</span>
        </div>
      )}
      {authLoading ? (
        <div className="flex min-h-64 items-center justify-center" role="status"><Loader2 className="h-8 w-8 animate-spin text-terracotta" aria-hidden="true" /></div>
      ) : !user ? (
        <div className="mx-auto max-w-3xl"><PrintShopAuthGate /></div>
      ) : ordersQuery.isLoading ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3" role="status"><Loader2 className="h-8 w-8 animate-spin text-terracotta" aria-hidden="true" /><p className="text-sm text-blue-gray/55">Caricamento ordini…</p></div>
      ) : ordersQuery.isError ? (
        <div className="rounded-[2rem] border border-red-200 bg-white p-8 text-center shadow-sm" role="alert">
          <AlertTriangle className="mx-auto h-9 w-9 text-red-700" aria-hidden="true" />
          <p className="mt-4 font-semibold text-red-900">{ordersQuery.error instanceof Error ? ordersQuery.error.message : 'Non riesco a caricare gli ordini.'}</p>
          <Button type="button" variant="outline" onClick={() => void ordersQuery.refetch()} className="mt-5 rounded-full"><RefreshCw aria-hidden="true" /> Riprova</Button>
        </div>
      ) : orders.length === 0 ? (
        <section className="rounded-[2.5rem] border border-sage/20 bg-white p-8 text-center shadow-sm sm:p-12">
          <PackageOpen className="mx-auto h-14 w-14 text-sage" aria-hidden="true" />
          <h2 className="mt-5 text-2xl font-semibold">Non hai ancora fatto ordini</h2>
          <p className="mx-auto mt-3 max-w-lg text-blue-gray/55">Scegli un prodotto dalla vetrina dello shop: puoi fare tutto dal telefono.</p>
          <Link href="/online-shop"><Button className="mt-7 h-12 rounded-full bg-terracotta px-7 text-white hover:bg-terracotta/90">Vai alla vetrina <ArrowRight aria-hidden="true" /></Button></Link>
        </section>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-blue-gray/55">{orders.length} {orders.length === 1 ? 'ordine' : 'ordini'}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => void ordersQuery.refetch()} disabled={ordersQuery.isFetching} className="rounded-full text-blue-gray/55"><RefreshCw className={ordersQuery.isFetching ? 'animate-spin' : ''} aria-hidden="true" /> Aggiorna</Button>
          </div>
          {orders.map(order => {
            const next = shopNextStep(order);
            const needsPhotos = order.canUploadPhotos && order.photosMissing > 0 && !order.canEdit;
            return (
              <article key={order.id} className={`overflow-hidden rounded-[2rem] border bg-white shadow-sm ${highlight === order.id ? 'border-terracotta ring-2 ring-terracotta/20' : 'border-sage/20'}`}>
                <div className="p-5 sm:p-7">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">{order.orderNumber}</h2>
                        <ShopStatusPill order={order} />
                      </div>
                      <p className="mt-2 flex items-center gap-2 text-xs text-blue-gray/45"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> {formatOrderDate(order.createdAt)}</p>
                    </div>
                    <p className="text-2xl font-semibold text-terracotta sm:text-right">{formatShopPrice(order.totals.totalCents)}</p>
                  </div>
                  {next && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900">{next}{order.photoDeadlineAt && needsPhotos ? ` Entro il ${formatOrderDate(order.photoDeadlineAt)}.` : ''}</p>}
                  <details className="mt-5 rounded-xl border border-sage/15 px-4 py-3" open={highlight === order.id}>
                    <summary className="cursor-pointer text-sm font-semibold">Dettagli dell'ordine</summary>
                    <div className="mt-4 space-y-4">
                      <ShopOrderLines order={order} />
                      <ShopDeliveryLine order={order} studioAddress={studioAddress} />
                    </div>
                  </details>
                  {needsPhotos && (
                    <div className="mt-5 space-y-4">
                      {order.lines.filter(line => line.photosRequired > 0 && line.photosMissing > 0).map(line => (
                        <ShopPhotoUploader key={line.lineId} orderId={order.id} line={line} onChanged={() => void reload()} />
                      ))}
                    </div>
                  )}
                  <WhatsAppHelp orderNumber={order.orderNumber} className="mt-5" />
                  {order.canEdit && (
                    <div className="mt-5 flex flex-col gap-3 border-t border-sage/15 pt-5 sm:flex-row sm:justify-end">
                      <Button type="button" variant="outline" onClick={() => setToDelete(order)} disabled={deleting} className="rounded-full border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"><Trash2 aria-hidden="true" /> Elimina bozza</Button>
                      <Button type="button" onClick={() => resume(order)} className="rounded-full bg-terracotta text-white hover:bg-terracotta/90">Riprendi ordine <ArrowRight aria-hidden="true" /></Button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <AlertDialog open={Boolean(toDelete)} onOpenChange={open => { if (!open && !deleting) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa bozza?</AlertDialogTitle>
            <AlertDialogDescription>Le foto caricate per {toDelete?.orderNumber ?? 'questo ordine'} verranno eliminate e non potrai recuperarle. Gli ordini già pagati non si eliminano da qui.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Mantieni bozza</AlertDialogCancel>
            <AlertDialogAction onClick={event => { event.preventDefault(); void removeDraft(); }} disabled={deleting} className="bg-red-700 text-white hover:bg-red-800">
              {deleting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />} Elimina definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ShopShell>
  );
}
