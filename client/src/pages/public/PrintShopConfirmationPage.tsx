import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
  AlertTriangle,
  Check,
  Clock3,
  Image as ImageIcon,
  Loader2,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { useStudio } from '@/context/StudioContext';
import { useSEO } from '@/hooks/useSEO';
import { PrintShopAuthGate } from '@/features/print-shop/PrintShopAuthGate';
import {
  printShopConfirmationFromOrder,
  readPrintShopConfirmationLocation,
} from '@/features/print-shop/confirmation-state';
import { printShopApi } from '@/features/print-shop/print-shop-api';
import { formatEuroCents } from '@/features/print-shop/print-shop-state';
import type { PrintShopOrderListItem } from '@/features/print-shop/types';

export default function PrintShopConfirmationPage() {
  useSEO({
    title: 'Ordine stampe confermato | Image Studio',
    description: 'Conferma del tuo ordine di stampe fotografiche.',
    canonical: '/stampa-foto-aversa/ordine/conferma',
    noindex: true,
  });
  const { user, isGoogleAuthenticated, isLoading: authLoading } = useFirebaseAuth();
  const { studioSettings } = useStudio();
  const { orderId } = readPrintShopConfirmationLocation(window.location.search);
  const [order, setOrder] = useState<PrintShopOrderListItem | null>(null);
  const [loading, setLoading] = useState(Boolean(orderId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isGoogleAuthenticated || !orderId) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    printShopApi.getOrder(orderId, controller.signal)
      .then(setOrder)
      .catch((fetchError) => {
        if (!(fetchError instanceof DOMException && fetchError.name === 'AbortError')) {
          setError(fetchError instanceof Error ? fetchError.message : 'Non riesco a caricare il riepilogo.');
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [isGoogleAuthenticated, orderId, user]);

  const confirmation = printShopConfirmationFromOrder(order);
  const paid = confirmation.paid;
  const actionRequired = confirmation.actionRequired;
  const orderNumber = confirmation.orderNumber || '—';
  const address = studioSettings.address?.trim();
  const shipping = order?.fulfillment?.method === 'shipping';
  const deliveryAddress = order?.fulfillment?.shippingAddress;
  const deliveryAddressText = deliveryAddress
    ? `${deliveryAddress.street} ${deliveryAddress.houseNumber}, ${deliveryAddress.postalCode} ${deliveryAddress.city} (${deliveryAddress.province})`
    : '';

  return (
    <div className="min-h-screen bg-off-white text-blue-gray">
      <Navigation />
      <main className="px-4 pb-20 pt-28 sm:pt-32">
        <div className="mx-auto max-w-3xl">
          {authLoading ? (
            <div className="flex min-h-80 items-center justify-center" role="status"><Loader2 className="h-8 w-8 animate-spin text-terracotta" aria-hidden="true" /></div>
          ) : !user || !isGoogleAuthenticated ? (
            <PrintShopAuthGate />
          ) : !orderId ? (
            <section className="rounded-[2rem] border border-red-200 bg-white p-8 text-center shadow-sm">
              <h1 className="text-2xl font-semibold">Codice ordine mancante</h1>
              <p className="mt-3 text-blue-gray/60">Apri “I miei ordini” per ritrovare il riepilogo corretto.</p>
              <Link href="/stampa-foto-aversa/i-miei-ordini"><Button className="mt-6 rounded-full bg-terracotta text-white">I miei ordini</Button></Link>
            </section>
          ) : (
            <>
              <section className="overflow-hidden rounded-[2.5rem] border border-sage/20 bg-white text-center shadow-xl">
                <div className={`px-6 py-10 text-white ${paid ? 'bg-dark-sage' : actionRequired ? 'bg-amber-800' : 'bg-blue-gray'}`}>
                  <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
                    {paid ? <Check className="h-10 w-10" aria-hidden="true" /> : actionRequired ? <AlertTriangle className="h-9 w-9" aria-hidden="true" /> : <Clock3 className="h-9 w-9" aria-hidden="true" />}
                  </span>
                  <h1 className="mt-6 text-3xl font-semibold sm:text-5xl">{paid ? 'Ordine ricevuto!' : actionRequired ? 'Serve una verifica dello studio' : 'Pagamento in verifica'}</h1>
                  <p className="mx-auto mt-4 max-w-xl leading-relaxed text-white/75">
                    {paid
                      ? 'Il pagamento è confermato. Ora controlliamo le fotografie e prepariamo la produzione.'
                      : actionRequired
                        ? `Il pagamento risulta acquisito, ma l’ordine richiede assistenza manuale. Non ripetere il pagamento: contatta ${studioSettings.name || 'lo studio'}.`
                        : 'PayPal sta completando la conferma. Non ripetere il pagamento: aggiorneremo automaticamente lo stato.'}
                  </p>
                </div>

                <div className="p-6 sm:p-10">
                  {loading ? (
                    <p className="flex items-center justify-center gap-2 text-sm text-blue-gray/55" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Caricamento riepilogo…</p>
                  ) : (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-gray/45">Numero ordine</p>
                      <p className="mt-2 text-2xl font-semibold tracking-wide text-terracotta">{orderNumber}</p>
                      {order && (
                        <dl className="mx-auto mt-8 grid max-w-xl gap-4 rounded-2xl bg-off-white p-5 text-left sm:grid-cols-3">
                          <div><dt className="text-xs text-blue-gray/45">Foto</dt><dd className="mt-1 font-semibold">{order.printShop?.assetCount ?? 0}</dd></div>
                          <div><dt className="text-xs text-blue-gray/45">Stampe</dt><dd className="mt-1 font-semibold">{order.printShop?.copyCount ?? 0}</dd></div>
                          <div><dt className="text-xs text-blue-gray/45">Totale pagato</dt><dd className="mt-1 font-semibold">{formatEuroCents(order.totals?.totalCents ?? 0)}</dd></div>
                        </dl>
                      )}
                    </>
                  )}

                  {error && <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">{error} Il pagamento già confermato non viene perso.</p>}

                  <div className="mx-auto mt-8 grid max-w-xl gap-4 text-left sm:grid-cols-2">
                    <div className="rounded-2xl border border-sage/15 p-4">
                      <div className="flex items-start gap-3">{shipping ? <Truck className="mt-0.5 h-5 w-5 flex-none text-terracotta" aria-hidden="true" /> : <MapPin className="mt-0.5 h-5 w-5 flex-none text-terracotta" aria-hidden="true" />}<div><p className="font-semibold">{shipping ? 'Spedizione a domicilio' : 'Ritiro in sede'}</p><p className="mt-1 text-sm text-blue-gray/55">{shipping ? deliveryAddressText || 'Indirizzo registrato nell’ordine.' : address || 'Consulta i contatti dello studio prima del ritiro.'}</p></div></div>
                    </div>
                    <div className="rounded-2xl border border-sage/15 p-4">
                      <div className="flex items-start gap-3"><PackageCheck className="mt-0.5 h-5 w-5 flex-none text-terracotta" aria-hidden="true" /><div><p className="font-semibold">Ti avvisiamo noi</p><p className="mt-1 text-sm text-blue-gray/55">Riceverai un messaggio quando le stampe saranno {shipping ? 'pronte per la spedizione' : 'pronte'}.</p></div></div>
                    </div>
                  </div>

                  <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                    <Link href="/stampa-foto-aversa/i-miei-ordini"><Button className="h-12 w-full rounded-full bg-terracotta px-7 text-white hover:bg-terracotta/90 sm:w-auto"><ImageIcon aria-hidden="true" /> Segui il tuo ordine</Button></Link>
                    <Link href="/stampa-foto-aversa"><Button variant="outline" className="h-12 w-full rounded-full border-sage/30 px-7 sm:w-auto">Torna alle stampe</Button></Link>
                  </div>
                </div>
              </section>

              <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs leading-relaxed text-blue-gray/45">
                <ShieldCheck className="h-4 w-4 flex-none text-dark-sage" aria-hidden="true" />
                Gli originali restano privati e vengono cancellati 90 giorni dopo la consegna.
              </p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
