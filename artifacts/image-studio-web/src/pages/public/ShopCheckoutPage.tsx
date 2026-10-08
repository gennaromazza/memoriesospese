import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Loader2, Minus, Plus, ShoppingBag, Trash2, Truck } from 'lucide-react';
import type { PrintShopPostalAddress } from '@shared/print-shop-types';
import { SHOP_MAX_QUANTITY, formatShopPrice, type ShopOrderDto } from '@shared/shop-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { useSEO } from '@/hooks/useSEO';
import { PrintShopAuthGate } from '@/features/print-shop/PrintShopAuthGate';
import { WhatsAppHelp } from '@/features/print-shop/WhatsAppHelp';
import { GiftCardPayPalButtons } from '@/features/gift-cards/GiftCardPayPalButtons';
import { ShopApiError, shopApi, type ShopLineInput, type ShopOrderUpdate } from '@/features/shop/shop-api';
import { ShopAddressFields, blankPostalAddress } from '@/features/shop/ShopAddressFields';
import { ShopOrderLines } from '@/features/shop/ShopOrderParts';
import { ShopPhotoUploader } from '@/features/shop/ShopPhotoUploader';
import { ShopShell } from '@/features/shop/ShopShell';
import {
  SHOP_DRAFT_STORAGE_KEY,
  cartLines,
  pruneCart,
  readStored,
  writeStored,
} from '@/features/shop/shop-cart';
import { buildOrderPatch, checkoutProblems } from '@/features/shop/shop-checkout';
import { useShopCart } from '@/features/shop/useShopCart';

const CONFIRMATION_PATH = '/shop-natale/ordine/conferma';

function ConsentRow({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-sage/15 bg-off-white/45 p-3 text-sm leading-relaxed text-blue-gray/70">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-0.5 h-5 w-5 flex-none rounded border-sage text-terracotta accent-[#b56b50]" />
      <span>{children}</span>
    </label>
  );
}

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="rounded-[2rem] border border-sage/20 bg-white p-5 shadow-sm sm:p-7">
      <h2 className="text-xl font-semibold">{title}</h2>
      {hint ? <p className="mt-1 text-sm text-blue-gray/55">{hint}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function ShopCheckoutPage() {
  useSEO({
    title: 'Il tuo ordine | Image Studio',
    description: 'Completa l’ordine dello shop di Natale: foto, consegna e pagamento sicuro con PayPal.',
    canonical: '/shop-natale/ordine',
    noindex: true,
  });
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useFirebaseAuth();
  const { cart, clear: clearCart, replace: replaceCart } = useShopCart();

  const catalogQuery = useQuery({ queryKey: ['shop-catalog'], queryFn: shopApi.getCatalog, staleTime: 30_000 });
  const paypalQuery = useQuery({ queryKey: ['shop-paypal-config'], queryFn: shopApi.getPayPalConfig, staleTime: 5 * 60_000 });
  const catalog = catalogQuery.data;

  const [orderId, setOrderId] = useState<string | null>(() => readStored(SHOP_DRAFT_STORAGE_KEY));
  const orderQuery = useQuery({
    queryKey: ['shop-order', orderId],
    queryFn: () => shopApi.getOrder(orderId as string),
    enabled: Boolean(user && orderId),
    retry: false,
  });
  const order = orderQuery.data;

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const syncGuard = useRef(false);
  const failedFor = useRef<string | null>(null);

  const setOrder = useCallback((next: ShopOrderDto) => queryClient.setQueryData(['shop-order', next.id], next), [queryClient]);
  const forgetDraft = useCallback(() => {
    writeStored(SHOP_DRAFT_STORAGE_KEY, null);
    setOrderId(null);
  }, []);

  // Modulo
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<'studio_pickup' | 'shipping'>('studio_pickup');
  const [shippingAddress, setShippingAddress] = useState<PrintShopPostalAddress>(blankPostalAddress);
  const [fiscalCode, setFiscalCode] = useState('');
  const [residenceSame, setResidenceSame] = useState(true);
  const [residenceAddress, setResidenceAddress] = useState<PrintShopPostalAddress>(blankPostalAddress);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [personalized, setPersonalized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ orderId: string; paypalOrderId: string } | null>(null);
  const pending = useRef<{ orderId: string; paypalOrderId: string } | null>(null);
  const loadedFor = useRef<string | null>(null);

  // Porta nell'ordine ciò che c'è nel carrello: crea la bozza oppure aggiunge le righe a quella esistente.
  useEffect(() => {
    if (!user || !catalog || cart.items.length === 0 || syncGuard.current) return;
    if (orderId && orderQuery.isLoading) return;
    if (!catalog.orderingOpen) return;
    const signature = JSON.stringify(cart.items);
    if (failedFor.current === signature) return;
    syncGuard.current = true;
    setSyncing(true);
    setSyncError(null);
    void (async () => {
      try {
        const available = new Set(catalog.products.map(product => product.id));
        const pruned = pruneCart(cart, available);
        if (pruned !== cart) replaceCart(pruned);
        const lines = cartLines(pruned);
        if (lines.length === 0) {
          clearCart();
          setSyncError('I prodotti nel carrello non sono più disponibili.');
          return;
        }
        let result: ShopOrderDto;
        if (orderId && order?.canEdit) {
          const existing: ShopLineInput[] = order.lines.map(line => ({ lineId: line.lineId, productId: line.productId, quantity: line.quantity }));
          result = await shopApi.replaceLines(orderId, [...existing, ...lines]);
        } else {
          result = await shopApi.createOrder({ lines, ...(user.displayName ? { customer: { name: user.displayName } } : {}) });
        }
        writeStored(SHOP_DRAFT_STORAGE_KEY, result.id);
        setOrderId(result.id);
        setOrder(result);
        clearCart();
      } catch (caught) {
        failedFor.current = signature;
        setSyncError(caught instanceof Error ? caught.message : 'Non riesco a preparare l’ordine.');
      } finally {
        syncGuard.current = false;
        setSyncing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, catalog, cart, orderId, order, orderQuery.isLoading, retryTick]);

  // Un ordine già pagato si segue dalla pagina di conferma; uno annullato si dimentica.
  useEffect(() => {
    if (!order) return;
    if (order.paymentStatus !== 'pending' && order.paymentStatus !== 'failed') {
      forgetDraft();
      navigate(`${CONFIRMATION_PATH}?ordine=${encodeURIComponent(order.id)}`);
    } else if (order.fulfillmentStatus === 'cancelled') {
      forgetDraft();
    }
  }, [order, forgetDraft, navigate]);

  useEffect(() => {
    if (orderQuery.error instanceof ShopApiError && orderQuery.error.status === 404) forgetDraft();
  }, [orderQuery.error, forgetDraft]);

  // Compila il modulo con i dati già salvati, una volta per ordine.
  useEffect(() => {
    if (!order || loadedFor.current === order.id) return;
    loadedFor.current = order.id;
    setName(order.customer.name || user?.displayName || '');
    setPhone(order.customer.phone || '');
    setNotes(order.customerNotes || '');
    setMethod(order.fulfillment.method);
    if (order.fulfillment.shippingAddress) setShippingAddress(order.fulfillment.shippingAddress);
    if (order.billingDetails) {
      setFiscalCode(order.billingDetails.fiscalCode || '');
      setResidenceAddress(order.billingDetails.residenceAddress);
      setResidenceSame(JSON.stringify(order.billingDetails.residenceAddress) === JSON.stringify(order.fulfillment.shippingAddress));
    }
  }, [order, user]);

  const shippingConfig = catalog?.shipping;
  const shippingOffered = Boolean(shippingConfig?.enabled);
  const shippingCents = method === 'shipping' && shippingConfig?.enabled ? shippingConfig.priceCents : 0;
  const subtotalCents = order?.totals.subtotalCents ?? 0;
  const totalCents = subtotalCents + shippingCents;
  const hasPhotoLines = order?.lines.some(line => line.photosRequired > 0) ?? false;
  const photosMissing = order?.photosMissing ?? 0;
  const shipping = method === 'shipping';

  const form = useMemo(
    () => ({ name, phone, notes, method, shippingAddress, fiscalCode, residenceSame, residenceAddress }),
    [name, phone, notes, method, shippingAddress, fiscalCode, residenceSame, residenceAddress],
  );
  const problems = useMemo(
    () => checkoutProblems({ ...form, terms, privacy, personalized, orderingOpen: Boolean(catalog?.orderingOpen), hasPhotoLines }),
    [form, terms, privacy, personalized, catalog?.orderingOpen, hasPhotoLines],
  );
  const buildPatch = useCallback((): ShopOrderUpdate => buildOrderPatch(form), [form]);

  const refresh = useCallback(async () => {
    if (!orderId) return;
    await queryClient.invalidateQueries({ queryKey: ['shop-order', orderId] });
  }, [orderId, queryClient]);

  const changeLines = async (lines: ShopLineInput[]) => {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      if (lines.length === 0) {
        await shopApi.cancelOrder(order.id);
        forgetDraft();
        navigate('/shop-natale');
        return;
      }
      setOrder(await shopApi.replaceLines(order.id, lines));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Non riesco ad aggiornare l’ordine.');
    } finally {
      setBusy(false);
    }
  };

  const lineInputs = (skip?: string, quantityFor?: { lineId: string; quantity: number }): ShopLineInput[] =>
    (order?.lines ?? [])
      .filter(line => line.lineId !== skip)
      .map(line => ({ lineId: line.lineId, productId: line.productId, quantity: quantityFor?.lineId === line.lineId ? quantityFor.quantity : line.quantity }));

  const createPayPalOrder = useCallback(async (): Promise<string> => {
    if (!order) throw new Error('Ordine non disponibile.');
    setError(null);
    setBusy(true);
    try {
      const updated = await shopApi.updateOrder(order.id, buildPatch());
      setOrder(updated);
      if (updated.totals.totalCents !== totalCents) {
        throw new Error('Il totale è cambiato: controlla il riepilogo e riprova.');
      }
      const result = await shopApi.createPayPalOrder(updated.id, {
        termsAccepted: true,
        privacyAccepted: true,
        personalizedProductionAccepted: personalized,
        expectedQuoteFingerprint: updated.quoteFingerprint as string,
        expectedTotalCents: updated.totals.totalCents,
      });
      pending.current = { orderId: updated.id, paypalOrderId: result.paypalOrderId };
      return result.paypalOrderId;
    } catch (caught) {
      setBusy(false);
      if (caught instanceof ShopApiError && (caught.code === 'quote_changed' || caught.code === 'product_unavailable')) {
        // Un prezzo o un prodotto è cambiato: riallinea l'ordine e fai ricontrollare.
        void shopApi.replaceLines(order.id, lineInputs()).then(setOrder).catch(() => refresh());
      }
      setError(caught instanceof Error ? caught.message : 'Non riesco a preparare il pagamento.');
      throw caught;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, buildPatch, totalCents, personalized, refresh]);

  const confirmPayment = useCallback(async (payment: { orderId: string; paypalOrderId: string }) => {
    try {
      await shopApi.capturePayPalOrder(payment.orderId, payment.paypalOrderId);
    } catch (caught) {
      setBusy(false);
      // Se la conferma non arriva, PayPal potrebbe aver già incassato: si può solo ripetere la conferma, mai pagare di nuovo.
      const unreachable = caught instanceof ShopApiError && (caught.status === 0 || caught.status >= 500 || caught.status === 409);
      if (unreachable) setRetry(payment);
      setError(caught instanceof Error ? caught.message : 'Non riesco a confermare il pagamento.');
      return;
    }
    forgetDraft();
    pending.current = null;
    setRetry(null);
    setBusy(false);
    void queryClient.invalidateQueries({ queryKey: ['shop-orders'] });
    navigate(`${CONFIRMATION_PATH}?ordine=${encodeURIComponent(payment.orderId)}`);
  }, [forgetDraft, navigate, queryClient]);

  const approve = useCallback(async (paypalOrderId: string) => {
    const payment = pending.current;
    if (!payment || payment.paypalOrderId !== paypalOrderId) {
      setError('Non riesco a collegare il pagamento al tuo ordine. Scrivici: controlliamo subito.');
      return;
    }
    setBusy(true);
    await confirmPayment(payment);
  }, [confirmPayment]);

  const paypalConfig = paypalQuery.data;
  const orderingOpen = Boolean(catalog?.orderingOpen);

  // --- schermate ------------------------------------------------------------

  const wrapper = (children: React.ReactNode) => (
    <ShopShell title="Il tuo ordine" subtitle="Controlla i prodotti, carica le foto e paga in sicurezza con PayPal.">{children}</ShopShell>
  );

  if (authLoading || catalogQuery.isLoading) {
    return wrapper(<div className="flex min-h-64 items-center justify-center" role="status"><Loader2 className="h-8 w-8 animate-spin text-terracotta" aria-hidden="true" /></div>);
  }

  if (!user) {
    return wrapper(
      <div className="mx-auto max-w-3xl space-y-6">
        <p className="rounded-2xl border border-sage/20 bg-white p-5 text-sm text-blue-gray/70">
          Accedi o crea il tuo account per completare l'ordine: serve a tenere private le tue foto e a ritrovare l'ordine quando vuoi.
        </p>
        <PrintShopAuthGate />
      </div>,
    );
  }

  if (!order) {
    if (syncing || orderQuery.isLoading) {
      return wrapper(<div className="flex min-h-64 flex-col items-center justify-center gap-3" role="status"><Loader2 className="h-8 w-8 animate-spin text-terracotta" aria-hidden="true" /><p className="text-sm text-blue-gray/55">Preparo il tuo ordine…</p></div>);
    }
    return wrapper(
      <div className="mx-auto max-w-xl rounded-[2rem] border border-sage/20 bg-white p-8 text-center shadow-sm">
        <ShoppingBag className="mx-auto h-12 w-12 text-sage" aria-hidden="true" />
        <h2 className="mt-4 text-2xl font-semibold">{cart.items.length > 0 && !orderingOpen ? 'Gli ordini non sono aperti' : 'Il carrello è vuoto'}</h2>
        {syncError ? (
          <p className="mt-3 text-sm text-red-700" role="alert">{syncError}</p>
        ) : (
          <p className="mt-3 text-blue-gray/60">{cart.items.length > 0 && !orderingOpen ? 'Quando gli ordini apriranno potrai completare l’acquisto.' : 'Scegli un prodotto dalla vetrina per iniziare.'}</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {syncError && cart.items.length > 0 && (
            <Button type="button" variant="outline" className="rounded-full" onClick={() => { failedFor.current = null; setRetryTick(tick => tick + 1); }}>Riprova</Button>
          )}
          <Link href="/shop-natale"><Button className="h-12 rounded-full bg-terracotta px-7 text-white hover:bg-terracotta/90">Vai alla vetrina <ArrowRight aria-hidden="true" /></Button></Link>
        </div>
      </div>,
    );
  }

  return wrapper(
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        {syncError && <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><AlertTriangle className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" /><span>{syncError}</span></div>}

        <Section title="I tuoi prodotti">
          <ul className="divide-y divide-sage/15">
            {order.lines.map(line => (
              <li key={line.lineId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{line.productName}</p>
                  <p className="text-xs text-blue-gray/55">
                    {formatShopPrice(line.unitPriceCents)}{line.photosRequired > 0 ? ` · ${line.photosRequired === 1 ? '1 foto' : `${line.photosRequired} foto`}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {line.photosRequired === 0 && (
                    <div className="flex items-center gap-1" role="group" aria-label={`Quantità di ${line.productName}`}>
                      <Button type="button" size="icon" variant="outline" className="h-8 w-8 rounded-full" disabled={busy || line.quantity <= 1} onClick={() => void changeLines(lineInputs(undefined, { lineId: line.lineId, quantity: line.quantity - 1 }))} aria-label="Una in meno"><Minus className="h-4 w-4" aria-hidden="true" /></Button>
                      <span className="w-6 text-center text-sm font-semibold">{line.quantity}</span>
                      <Button type="button" size="icon" variant="outline" className="h-8 w-8 rounded-full" disabled={busy || line.quantity >= SHOP_MAX_QUANTITY} onClick={() => void changeLines(lineInputs(undefined, { lineId: line.lineId, quantity: line.quantity + 1 }))} aria-label="Una in più"><Plus className="h-4 w-4" aria-hidden="true" /></Button>
                    </div>
                  )}
                  <strong className="w-20 text-right">{formatShopPrice(line.lineTotalCents)}</strong>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-700" disabled={busy} onClick={() => void changeLines(lineInputs(line.lineId))} aria-label={`Togli ${line.productName}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                </div>
              </li>
            ))}
          </ul>
          <Link href="/shop-natale" className="mt-3 inline-block text-sm font-semibold text-terracotta underline underline-offset-2">Aggiungi altri prodotti</Link>
        </Section>

        {hasPhotoLines && (
          <Section
            title="Le tue foto"
            hint={`Carica ora le foto, oppure dopo il pagamento${catalog ? ` (hai ${catalog.photoWaitDays} giorni)` : ''}: lavoriamo il prodotto quando le abbiamo tutte.`}
          >
            <div className="space-y-4">
              {order.lines.filter(line => line.photosRequired > 0).map(line => (
                <ShopPhotoUploader key={line.lineId} orderId={order.id} line={line} disabled={!order.canUploadPhotos} onChanged={() => void refresh()} />
              ))}
            </div>
          </Section>
        )}

        <Section title="I tuoi dati">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-blue-gray">Nome e cognome<Input value={name} onChange={event => setName(event.target.value)} autoComplete="name" className="mt-2 h-12 rounded-xl font-normal" /></label>
            <label className="text-sm font-semibold text-blue-gray">Telefono (facoltativo)<Input value={phone} onChange={event => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" className="mt-2 h-12 rounded-xl font-normal" /></label>
            <label className="text-sm font-semibold text-blue-gray sm:col-span-2">Note per lo studio (facoltative)<textarea value={notes} onChange={event => setNotes(event.target.value)} maxLength={1000} rows={2} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-base font-normal" placeholder="Per esempio: foto in bianco e nero" /></label>
          </div>
        </Section>

        <Section title="Come lo ricevi">
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Metodo di consegna">
            <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm ${method === 'studio_pickup' ? 'border-terracotta bg-terracotta/5' : 'border-sage/25'}`}>
              <input type="radio" name="shop-delivery" checked={method === 'studio_pickup'} onChange={() => setMethod('studio_pickup')} className="mt-1" />
              <span><strong>Ritiro in studio</strong><br />Gratuito. Ti scriviamo quando è pronto.</span>
            </label>
            {shippingOffered && shippingConfig && (
              <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm ${method === 'shipping' ? 'border-terracotta bg-terracotta/5' : 'border-sage/25'}`}>
                <input type="radio" name="shop-delivery" checked={method === 'shipping'} onChange={() => setMethod('shipping')} className="mt-1" />
                <span><Truck className="mr-1 inline h-4 w-4" aria-hidden="true" /><strong>Spedizione in Italia</strong><br />{shippingConfig.priceCents > 0 ? formatShopPrice(shippingConfig.priceCents) : 'Gratuita'} · circa {shippingConfig.estimatedMinDays}-{shippingConfig.estimatedMaxDays} giorni dopo che il prodotto è pronto.</span>
              </label>
            )}
          </div>
          {shipping && (
            <div className="mt-6 space-y-5">
              <div>
                <h3 className="mb-3 font-semibold">Indirizzo di consegna</h3>
                <ShopAddressFields address={shippingAddress} onChange={setShippingAddress} prefix="shop-shipping" />
              </div>
              <div>
                <h3 className="mb-1 font-semibold">Dati per la ricevuta</h3>
                <p className="mb-3 text-sm text-blue-gray/55">Per le spedizioni servono il codice fiscale e l'indirizzo di residenza.</p>
                <label className="text-sm font-semibold text-blue-gray">
                  Codice fiscale
                  <Input value={fiscalCode} onChange={event => setFiscalCode(event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 16).toUpperCase())} maxLength={16} autoComplete="off" placeholder="RSSMRA85M01H501Q" className="mt-2 h-12 max-w-sm rounded-xl font-normal uppercase" />
                </label>
                <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={residenceSame} onChange={event => setResidenceSame(event.target.checked)} className="h-4 w-4" /> Abito all'indirizzo di consegna</label>
                {!residenceSame && <div className="mt-4"><ShopAddressFields address={residenceAddress} onChange={setResidenceAddress} prefix="shop-residence" /></div>}
              </div>
            </div>
          )}
        </Section>
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="space-y-5 rounded-[2rem] border border-sage/20 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-semibold">Riepilogo</h2>
          <ShopOrderLines order={order} totalCents={totalCents} shippingCents={shippingCents} />
          {hasPhotoLines && photosMissing > 0 && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              {photosMissing === 1 ? 'Manca ancora 1 foto' : `Mancano ancora ${photosMissing} foto`}: puoi pagare adesso e caricarle dopo.
            </p>
          )}

          <div className="space-y-2">
            <ConsentRow checked={terms} onChange={setTerms}>Ho letto le <Link href="/terms" className="underline">condizioni di vendita</Link>.</ConsentRow>
            <ConsentRow checked={privacy} onChange={setPrivacy}>Ho letto l'<Link href="/privacy" className="underline">informativa privacy</Link>.</ConsentRow>
            {hasPhotoLines && <ConsentRow checked={personalized} onChange={setPersonalized}>Capisco che il prodotto viene realizzato con le mie foto: è un prodotto personalizzato.</ConsentRow>}
          </div>

          {!orderingOpen ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">Gli ordini online non sono aperti in questo momento.</p>
          ) : (
            <>
              {problems.length > 0 && !busy && <p className="text-sm text-blue-gray/60">Per pagare mancano: {problems.join(', ')}.</p>}
              {error && <p className="text-sm font-medium text-red-700" role="alert">{error}</p>}
              {retry ? (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
                  <p><strong>Non pagare di nuovo.</strong> Il pagamento potrebbe essere già stato registrato da PayPal.</p>
                  <Button type="button" className="rounded-full" disabled={busy} onClick={() => { setBusy(true); setError(null); void confirmPayment(retry); }}>Riprova a confermare</Button>
                </div>
              ) : !paypalConfig?.checkoutEnabled ? (
                <p className="text-sm text-red-700" role="alert">Il pagamento online non è ancora attivo.</p>
              ) : (
                <GiftCardPayPalButtons
                  config={{ enabled: paypalConfig.checkoutEnabled, clientId: paypalConfig.clientId, environment: paypalConfig.environment, currency: 'EUR' }}
                  enabled={problems.length === 0 && !busy}
                  createOrder={createPayPalOrder}
                  onApprove={approve}
                  onCancel={() => { setBusy(false); setError('Pagamento annullato. Non è stato addebitato nulla.'); }}
                  onError={message => { setBusy(false); setError(message); }}
                />
              )}
              <p className="text-xs text-blue-gray/50">Paghi in modo sicuro con PayPal. Non vediamo i dati della tua carta.</p>
            </>
          )}
          <WhatsAppHelp orderNumber={order.orderNumber} />
        </div>
      </aside>
    </div>,
  );
}
