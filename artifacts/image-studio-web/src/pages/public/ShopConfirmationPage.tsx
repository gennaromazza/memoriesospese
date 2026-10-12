import { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { useStudio } from '@/context/StudioContext';
import { useSEO } from '@/hooks/useSEO';
import { PrintShopAuthGate } from '@/features/print-shop/PrintShopAuthGate';
import { WhatsAppHelp } from '@/features/print-shop/WhatsAppHelp';
import { shopApi } from '@/features/shop/shop-api';
import { ShopDeliveryLine, ShopOrderLines, ShopStatusPill, formatOrderDate } from '@/features/shop/ShopOrderParts';
import { ShopPhotoUploader } from '@/features/shop/ShopPhotoUploader';
import { ShopShell } from '@/features/shop/ShopShell';

export default function ShopConfirmationPage() {
  useSEO({
    title: 'Ordine confermato | Image Studio',
    description: 'Riepilogo del tuo ordine dello shop di Natale.',
    canonical: '/shop-natale/ordine/conferma',
    noindex: true,
  });
  const { user, isLoading: authLoading } = useFirebaseAuth();
  const { studioSettings } = useStudio();
  const queryClient = useQueryClient();
  const [orderId] = useState(() => new URLSearchParams(window.location.search).get('ordine'));
  const orderQuery = useQuery({
    queryKey: ['shop-order', orderId],
    queryFn: () => shopApi.getOrder(orderId as string),
    enabled: Boolean(user && orderId),
    retry: false,
  });
  const order = orderQuery.data;
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ['shop-order', orderId] }), [orderId, queryClient]);

  // Quando l'ordine è confermato, il carrello e la bozza locali non servono più.
  useEffect(() => {
    if (order && order.paymentStatus === 'paid') void queryClient.invalidateQueries({ queryKey: ['shop-orders'] });
  }, [order, queryClient]);

  const wrapper = (children: React.ReactNode) => <ShopShell title="Ordine confermato" subtitle="Grazie! Ti abbiamo scritto una email con il riepilogo.">{children}</ShopShell>;

  if (authLoading || (user && orderQuery.isLoading)) {
    return wrapper(<div className="flex min-h-64 items-center justify-center" role="status"><Loader2 className="h-8 w-8 animate-spin text-terracotta" aria-hidden="true" /></div>);
  }
  if (!user) return wrapper(<div className="mx-auto max-w-3xl"><PrintShopAuthGate /></div>);
  if (!orderId || orderQuery.isError || !order) {
    return wrapper(
      <div className="mx-auto max-w-xl rounded-[2rem] border border-red-200 bg-white p-8 text-center shadow-sm" role="alert">
        <AlertTriangle className="mx-auto h-9 w-9 text-red-700" aria-hidden="true" />
        <p className="mt-4 font-semibold text-red-900">Non troviamo questo ordine.</p>
        <Link href="/shop-natale/i-miei-ordini"><Button variant="outline" className="mt-5 rounded-full">Vai ai miei ordini</Button></Link>
      </div>,
    );
  }

  const paid = order.paymentStatus === 'paid' || order.paymentStatus === 'partially_refunded';
  const deadline = order.photoDeadlineAt ? formatOrderDate(order.photoDeadlineAt) : '';
  return wrapper(
    <div className="mx-auto max-w-3xl space-y-6">
      {!paid && (
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 text-amber-900" role="status">
          <p className="font-semibold">Questo ordine non risulta ancora pagato.</p>
          <Link href="/shop-natale/ordine"><Button className="mt-4 rounded-full bg-terracotta text-white hover:bg-terracotta/90">Torna all'ordine <ArrowRight aria-hidden="true" /></Button></Link>
        </div>
      )}

      <section className="rounded-[2rem] border border-sage/20 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          {paid && <CheckCircle2 className="h-7 w-7 text-emerald-600" aria-hidden="true" />}
          <h2 className="text-2xl font-semibold">{order.orderNumber}</h2>
          <ShopStatusPill order={order} />
        </div>
        <p className="mt-2 flex items-center gap-2 text-xs text-blue-gray/45"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> {formatOrderDate(order.paidAt || order.createdAt)}</p>
        <div className="mt-5"><ShopOrderLines order={order} /></div>
        <div className="mt-5 border-t border-sage/15 pt-4"><ShopDeliveryLine order={order} studioAddress={studioSettings.address?.trim()} /></div>
      </section>

      {paid && order.photosMissing > 0 && order.canUploadPhotos && (
        <section className="rounded-[2rem] border border-amber-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold">{order.photosMissing === 1 ? 'Ci manca ancora 1 foto' : `Ci mancano ancora ${order.photosMissing} foto`}</h2>
          <p className="mt-1 text-sm text-blue-gray/60">
            Carica {order.photosMissing === 1 ? 'la foto' : 'le foto'} {deadline ? `entro il ${deadline}` : 'appena puoi'}: iniziamo a lavorare il prodotto quando le abbiamo tutte.
          </p>
          <div className="mt-5 space-y-4">
            {order.lines.filter(line => line.photosRequired > 0).map(line => (
              <ShopPhotoUploader key={line.lineId} orderId={order.id} line={line} onChanged={() => void refresh()} />
            ))}
          </div>
        </section>
      )}

      {paid && order.photosMissing === 0 && order.lines.some(line => line.photosRequired > 0) && (
        <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-medium text-emerald-900">Abbiamo tutte le foto: iniziamo a lavorare il tuo ordine.</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <WhatsAppHelp orderNumber={order.orderNumber} />
        <div className="flex gap-3">
          <Link href="/shop-natale/i-miei-ordini"><Button variant="outline" className="rounded-full">I miei ordini</Button></Link>
          <Link href="/shop-natale"><Button className="rounded-full bg-terracotta text-white hover:bg-terracotta/90">Torna alla vetrina</Button></Link>
        </div>
      </div>
    </div>,
  );
}
