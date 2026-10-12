import { describe, expect, it, vi } from 'vitest';
import { PayPalApiError } from '../print-shop/paypal-orders';
import { FakeFirestore } from '../print-shop/test-fakes';
import { ShopOrderService } from './orders';
import { ShopPaymentService } from './payments';
import { ShopService } from './service';
import { FakePayPal } from './test-support';

const NOW = new Date('2026-12-01T10:00:00Z');
const alice = { uid: 'alice', email: 'alice@example.com' };
const bob = { uid: 'bob', email: 'bob@example.com' };
const address = { street: 'Via Roma', houseNumber: '12', postalCode: '81031', city: 'Aversa', province: 'CE', country: 'IT' };
const billing = { fiscalCode: 'RSSMRA85M01H501Q', residenceAddress: address };
const consents = { termsAccepted: true, privacyAccepted: true, personalizedProductionAccepted: true };

async function setup() {
  const db = new FakeFirestore();
  db.seed('productCategories/c1', { value: 'natale', nome: 'Natale', attivo: true, displayOrder: 1 });
  db.seed('products/mug', { nome: 'Tazza con foto', descrizione: '', prezzo: 15, sconto: 0, numeroFoto: 1, categoria: 'natale', attivo: true, immagini: [] });
  db.seed('products/card', { nome: 'Cartolina', descrizione: '', prezzo: 3, sconto: 0, numeroFoto: 0, categoria: 'natale', attivo: true, immagini: [] });
  let clock = NOW;
  const shop = new ShopService({ db: db as any, now: () => clock });
  await shop.updateSettings({
    enabled: true,
    ordersOpen: true,
    categoryValues: ['natale'],
    photoWaitDays: 7,
    shipping: { enabled: true, priceCents: 590, estimatedMinDays: 3, estimatedMaxDays: 6 },
  });
  const orders = new ShopOrderService({ db: db as any, shop, now: () => clock });
  const paypal = new FakePayPal();
  const onPaid = vi.fn(async () => undefined);
  const onRefunded = vi.fn(async () => undefined);
  const payments = new ShopPaymentService({
    db: db as any,
    paypal,
    orders,
    shop,
    now: () => clock,
    studio: async () => ({ name: 'Image Studio', email: 'studio@example.com', phone: '081000000', address: 'Aversa' }),
    hooks: { onPaid, onRefunded },
  });
  return { db, shop, orders, paypal, payments, onPaid, onRefunded, setClock: (date: Date) => { clock = date; } };
}

type Env = Awaited<ReturnType<typeof setup>>;

/** Bozza con una tazza (serve 1 foto) e due cartoline: 21,00 € con ritiro in studio. */
async function draft(env: Env, identity = alice) {
  const dto = await env.orders.createDraft(identity, { lines: [{ productId: 'mug', quantity: 1 }, { productId: 'card', quantity: 2 }], customer: { name: 'Alice Verdi', phone: '3331112222' } });
  return dto;
}

function payInput(dto: { quoteFingerprint: string | null; totals: { totalCents: number } }, patch: Record<string, unknown> = {}) {
  return { ...consents, expectedQuoteFingerprint: dto.quoteFingerprint!, expectedTotalCents: dto.totals.totalCents, ...patch };
}

async function created(env: Env) {
  const dto = await draft(env);
  const result = await env.payments.createPaypalOrder(alice, dto.id, payInput(dto));
  return { dto, result, orderId: dto.id, paypalOrderId: result.paypalOrderId as string };
}

async function paid(env: Env, options: { withPhoto?: boolean } = {}) {
  const dto = await draft(env);
  if (options.withPhoto) {
    env.db.seed(`orders/${dto.id}/shopAssets/photo1`, { lineId: dto.lines[0].lineId, status: 'ready', ownerUid: 'alice' });
  }
  const result = await env.payments.createPaypalOrder(alice, dto.id, payInput(dto));
  await env.payments.capturePaypalOrder(alice, dto.id, { paypalOrderId: result.paypalOrderId as string });
  return { dto, orderId: dto.id, paypalOrderId: result.paypalOrderId as string };
}

const cashOf = (env: Env) => [...env.db.documents.entries()].filter(([path]) => path.startsWith('cashMovements/')).map(([path, value]) => ({ path, ...value }));

describe('creazione dell\'ordine PayPal', () => {
  it('si rifiuta se PayPal non è attivo o gli ordini sono chiusi', async () => {
    const env = await setup();
    const dto = await draft(env);
    env.paypal.enabled = false;
    await expect(env.payments.createPaypalOrder(alice, dto.id, payInput(dto))).rejects.toMatchObject({ status: 503, code: 'paypal_not_configured' });
    env.paypal.enabled = true;
    await env.shop.updateSettings({ enabled: true, ordersOpen: false, categoryValues: ['natale'] });
    await expect(env.payments.createPaypalOrder(alice, dto.id, payInput(dto))).rejects.toMatchObject({ status: 409, code: 'orders_closed' });
  });

  it('chiede le accettazioni: condizioni e privacy sempre, produzione personalizzata se ci sono foto', async () => {
    const env = await setup();
    const dto = await draft(env);
    for (const patch of [{ termsAccepted: false }, { privacyAccepted: false }, { personalizedProductionAccepted: false }, { personalizedProductionAccepted: undefined }]) {
      await expect(env.payments.createPaypalOrder(alice, dto.id, payInput(dto, patch))).rejects.toMatchObject({ status: 400, code: 'legal_acceptance_required' });
    }
    const plain = await env.orders.createDraft(alice, { lines: [{ productId: 'card', quantity: 1 }] });
    await expect(
      env.payments.createPaypalOrder(alice, plain.id, { termsAccepted: true, privacyAccepted: true, expectedQuoteFingerprint: plain.quoteFingerprint!, expectedTotalCents: plain.totals.totalCents }),
    ).resolves.toMatchObject({ currency: 'EUR' });
  });

  it('non accetta un riepilogo diverso da quello che il cliente ha visto', async () => {
    const env = await setup();
    const dto = await draft(env);
    await expect(env.payments.createPaypalOrder(alice, dto.id, payInput(dto, { expectedTotalCents: 1 }))).rejects.toMatchObject({ status: 409, code: 'quote_changed' });
    await expect(env.payments.createPaypalOrder(alice, dto.id, payInput(dto, { expectedQuoteFingerprint: 'x'.repeat(64) }))).rejects.toMatchObject({ code: 'quote_changed' });
    expect(env.paypal.created).toHaveLength(0);
  });

  it('se un prezzo cambia dopo che il cliente lo ha visto, blocca e indica il nuovo totale', async () => {
    const env = await setup();
    const dto = await draft(env);
    env.db.seed('products/card', { nome: 'Cartolina', descrizione: '', prezzo: 4, sconto: 0, numeroFoto: 0, categoria: 'natale', attivo: true, immagini: [] });
    await expect(env.payments.createPaypalOrder(alice, dto.id, payInput(dto))).rejects.toMatchObject({
      status: 409,
      code: 'quote_changed',
      details: { totalCents: 2300 },
    });
    expect(env.paypal.created).toHaveLength(0);
  });

  it('se un prodotto non è più in vendita, blocca', async () => {
    const env = await setup();
    const dto = await draft(env);
    env.db.seed('products/card', { nome: 'Cartolina', descrizione: '', prezzo: 3, sconto: 0, numeroFoto: 0, categoria: 'natale', attivo: false, immagini: [] });
    await expect(env.payments.createPaypalOrder(alice, dto.id, payInput(dto))).rejects.toMatchObject({ status: 409, code: 'product_unavailable' });
  });

  it('con la spedizione servono indirizzo e dati fiscali validi, anche per richieste costruite a mano', async () => {
    const env = await setup();
    const dto = await draft(env);
    const shipped = await env.orders.updateOrder(alice, dto.id, { fulfillment: { method: 'shipping', shippingAddress: address } });
    await expect(env.payments.createPaypalOrder(alice, dto.id, payInput(shipped))).rejects.toMatchObject({ status: 400, code: 'fiscal_code_required' });
    const complete = await env.orders.updateOrder(alice, dto.id, { billingDetails: billing });
    const result = await env.payments.createPaypalOrder(alice, dto.id, payInput(complete));
    expect(result.amount).toEqual({ subtotalCents: 2100, shippingCents: 590, totalCents: 2690 });
    expect(env.paypal.created[0].amountCents).toBe(2690);
  });

  it('crea l\'ordine PayPal con importo e riferimenti del server e conserva la prova di accettazione', async () => {
    const env = await setup();
    const { orderId, result } = await created(env);
    expect(result).toMatchObject({ paypalOrderId: 'PAYPAL-ORDER-1', status: 'CREATED', approveUrl: 'https://paypal.test/approve/PAYPAL-ORDER-1', reused: false });
    expect(env.paypal.created[0]).toMatchObject({ internalOrderId: orderId, amountCents: 2100, currency: 'EUR' });
    expect(env.paypal.created[0].invoiceId).toMatch(/^SH-2026-[A-Z0-9]{8}-A1$/);
    const stored = env.db.value(`orders/${orderId}`);
    expect(stored.payment).toMatchObject({ method: 'paypal', status: 'pending', paypalOrderId: 'PAYPAL-ORDER-1', attempt: 1, amountCents: 2100 });
    expect(stored.fulfillment.status).toBe('awaiting_payment');
    expect(stored.legal).toMatchObject({ termsVersion: expect.any(String), personalizedProductionAcceptedAt: expect.anything(), totalCents: 2100, attempt: 1 });
    expect(stored.legal.sellerSnapshot).toMatchObject({ name: 'Image Studio', email: 'studio@example.com' });
    expect(env.db.countCollection(`orders/${orderId}/legalAcceptances`)).toBe(1);
  });

  it('riusa l\'ordine PayPal già creato se nulla è cambiato, ne crea uno nuovo dopo una modifica', async () => {
    const env = await setup();
    const { dto, orderId } = await created(env);
    const again = await env.payments.createPaypalOrder(alice, orderId, payInput(dto));
    expect(again).toMatchObject({ paypalOrderId: 'PAYPAL-ORDER-1', reused: true });
    expect(env.paypal.created).toHaveLength(1);
    const edited = await env.orders.replaceLines(alice, orderId, [{ lineId: dto.lines[1].lineId, productId: 'card', quantity: 1 }]);
    const next = await env.payments.createPaypalOrder(alice, orderId, payInput(edited, { personalizedProductionAccepted: true }));
    expect(next).toMatchObject({ paypalOrderId: 'PAYPAL-ORDER-2', reused: false });
    expect(env.paypal.created[1].invoiceId).toMatch(/-A2$/);
  });

  it('non crea pagamenti per ordini altrui o già pagati', async () => {
    const env = await setup();
    const dto = await draft(env);
    await expect(env.payments.createPaypalOrder(bob, dto.id, payInput(dto))).rejects.toMatchObject({ status: 404 });
    await paid(env);
    const stored = [...env.db.documents.entries()].find(([path, value]) => path.startsWith('orders/') && !path.includes('/') === false && value.payment?.status === 'paid');
    expect(stored).toBeDefined();
    const orderId = stored![0].split('/')[1];
    await expect(env.payments.createPaypalOrder(alice, orderId, payInput(dto))).rejects.toMatchObject({ status: 409, code: 'order_locked' });
  });
});

describe('conferma del pagamento', () => {
  it('registra incasso, ordine, cassa, cliente e notifica', async () => {
    const env = await setup();
    const { orderId, paypalOrderId } = await paid(env);
    const order = env.db.value(`orders/${orderId}`);
    expect(order.payment).toMatchObject({
      status: 'paid', paypalOrderId, paypalCaptureId: 'CAP-1', amountCents: 2100, paypalFeeCents: 95, netAmountCents: 2005, collectedCents: 2100, refundedCents: 0,
    });
    expect(order.payment.captureClaimToken).toBeUndefined();
    expect(order).toMatchObject({ stato: 'in_lavorazione', acconto: 21, saldo: 0, metodoPagamentoSaldo: 'paypal', fulfillment: { status: 'awaiting_photos' }, retention: { status: 'production' } });
    expect(order.transactions).toEqual([expect.objectContaining({ tipo: 'saldo', importo: 21, metodo: 'paypal', providerCaptureId: 'CAP-1' })]);
    expect((order.shop.photoDeadlineAt as Date).toISOString()).toBe('2026-12-08T10:00:00.000Z');

    const cash = cashOf(env);
    expect(cash).toHaveLength(2);
    const sale = cash.find(movement => movement.tipo === 'entrata')!;
    expect(sale).toMatchObject({ categoria: 'Vendita shop online', importo: 21, origine: 'shop', origineTema: 'shop', origineRef: orderId, orderId, metodoPagamento: 'paypal', providerTransactionId: 'CAP-1' });
    expect(sale.path).toMatch(/^cashMovements\/shop_paypal_[0-9a-f]{32}$/);
    expect(cash.find(movement => movement.tipo === 'uscita')).toMatchObject({ categoria: 'Commissioni di pagamento', importo: 0.95, origine: 'shop', movementRole: 'payment_fee' });

    expect(env.db.value(`adminNotifications/shop-order-${orderId}`)).toMatchObject({
      type: 'shop_order',
      title: 'Nuovo ordine shop online',
      deepLink: `/admin/dashboard?shopOrderId=${orderId}`,
      isRead: false,
    });
    expect(env.db.value(`adminNotifications/shop-order-${orderId}`).description).toContain('mancano 1 foto');
    expect(env.onPaid).toHaveBeenCalledWith(orderId, { photosMissing: 1, needsReconciliation: false });
  });

  it('crea la scheda cliente al primo pagamento e la collega all\'ordine', async () => {
    const env = await setup();
    const { orderId } = await paid(env);
    expect(env.db.countCollection('clienti')).toBe(1);
    const clientEntry = [...env.db.documents.entries()].find(([path]) => path.startsWith('clienti/'))!;
    const client = clientEntry[1];
    expect(env.db.value(`orders/${orderId}`).clienteId).toBe(clientEntry[0].split('/')[1]);
    expect(client).toMatchObject({
      email: 'alice@example.com', nome: 'Alice', cognome: 'Verdi', whatsapp: '3331112222', tags: ['shop-online'], source: 'shop',
      financials: { totalRevenue: 21, outstandingBalance: 0, totalOrders: 1 },
      lifecycle: { status: 'cliente' },
      sourceRefs: { orderIds: [orderId], userIds: ['alice'] },
    });
  });

  it('aggiorna una scheda esistente senza sovrascrivere i suoi dati e senza crearne un\'altra', async () => {
    const env = await setup();
    env.db.seed('clienti/c1', {
      email: 'alice@example.com', nome: 'Alice', cognome: 'Bianchi', source: 'booking', codiceFiscale: 'GIA_PRESENTE',
      financials: { totalRevenue: 100, outstandingBalance: 0, totalOrders: 2 }, sourceRefs: { orderIds: ['old'] },
    });
    const dto = await draft(env);
    await env.orders.updateOrder(alice, dto.id, { fulfillment: { method: 'shipping', shippingAddress: address }, billingDetails: billing });
    const current = await env.orders.getOwnerOrder(alice, dto.id);
    const result = await env.payments.createPaypalOrder(alice, dto.id, payInput(current));
    await env.payments.capturePaypalOrder(alice, dto.id, { paypalOrderId: result.paypalOrderId as string });
    expect(env.db.countCollection('clienti')).toBe(1);
    const client = env.db.value('clienti/c1');
    expect(client).toMatchObject({ cognome: 'Bianchi', codiceFiscale: 'GIA_PRESENTE', indirizzo: 'Via Roma 12', cap: '81031', citta: 'Aversa', provincia: 'CE' });
    expect(client.financials).toMatchObject({ totalRevenue: 126.9, totalOrders: 3 });
    expect(client.sourceRefs.orderIds).toEqual(['old', dto.id]);
    expect(env.db.value(`orders/${dto.id}`).clienteId).toBe('c1');
  });

  it('con tutte le foto già caricate l\'ordine è pronto da lavorare, senza scadenza', async () => {
    const env = await setup();
    const { orderId } = await paid(env, { withPhoto: true });
    const order = env.db.value(`orders/${orderId}`);
    expect(order.fulfillment.status).toBe('photos_received');
    expect(order.shop.photoDeadlineAt).toBeNull();
    expect(env.onPaid).toHaveBeenCalledWith(orderId, { photosMissing: 0, needsReconciliation: false });
  });

  it('confermare due volte non incassa due volte', async () => {
    const env = await setup();
    const { orderId, paypalOrderId } = await paid(env);
    const again = await env.payments.capturePaypalOrder(alice, orderId, { paypalOrderId });
    expect(again).toMatchObject({ success: true, duplicate: true, status: 'paid', captureId: 'CAP-1' });
    expect(cashOf(env)).toHaveLength(2);
    expect(env.db.value('clienti/' + env.db.value(`orders/${orderId}`).clienteId).financials).toMatchObject({ totalRevenue: 21, totalOrders: 1 });
    expect(env.onPaid).toHaveBeenCalledTimes(1);
  });

  it('rifiuta una cattura il cui importo non corrisponde e non segna pagato', async () => {
    const env = await setup();
    const { orderId, paypalOrderId } = await created(env);
    env.paypal.amountOverride = '1.00';
    await expect(env.payments.capturePaypalOrder(alice, orderId, { paypalOrderId })).rejects.toMatchObject({ status: 409, code: 'paypal_capture_mismatch' });
    expect(env.db.value(`orders/${orderId}`).payment.status).toBe('pending');
    expect(cashOf(env)).toHaveLength(0);
    expect(env.onPaid).not.toHaveBeenCalled();
  });

  it('se la risposta di PayPal si perde ma l\'incasso c\'è stato, lo recupera', async () => {
    const env = await setup();
    const { orderId, paypalOrderId } = await created(env);
    env.paypal.captureError = new Error('timeout');
    env.paypal.completeBehindTheScenes(paypalOrderId);
    await expect(env.payments.capturePaypalOrder(alice, orderId, { paypalOrderId })).resolves.toMatchObject({ success: true, duplicate: true, status: 'paid' });
    expect(env.db.value(`orders/${orderId}`).payment.status).toBe('paid');
    expect(cashOf(env)).toHaveLength(2);
  });

  it('se PayPal rifiuta e non c\'è incasso, libera l\'ordine perché si possa riprovare', async () => {
    const env = await setup();
    const { orderId, paypalOrderId } = await created(env);
    env.paypal.captureError = new PayPalApiError('rifiutato', 422, { name: 'INSTRUMENT_DECLINED' });
    await expect(env.payments.capturePaypalOrder(alice, orderId, { paypalOrderId })).rejects.toMatchObject({ status: 409, code: 'paypal_error' });
    const stored = env.db.value(`orders/${orderId}`);
    expect(stored.payment).toMatchObject({ status: 'pending', captureStatus: 'retryable' });
    expect(stored.payment.captureClaimToken).toBeUndefined();
    env.paypal.captureError = undefined;
    await expect(env.payments.capturePaypalOrder(alice, orderId, { paypalOrderId })).resolves.toMatchObject({ success: true });
  });

  it('non parte una seconda conferma mentre la prima è in corso', async () => {
    const env = await setup();
    const { orderId, paypalOrderId } = await created(env);
    const stored = env.db.value(`orders/${orderId}`);
    env.db.seed(`orders/${orderId}`, { ...stored, payment: { ...stored.payment, captureStatus: 'capturing', captureClaimedAt: NOW, captureClaimToken: 'x' } });
    await expect(env.payments.capturePaypalOrder(alice, orderId, { paypalOrderId })).rejects.toMatchObject({ status: 409, code: 'capture_running' });
  });

  it('controlla chi conferma e cosa conferma', async () => {
    const env = await setup();
    const dto = await draft(env);
    await expect(env.payments.capturePaypalOrder(alice, dto.id, {})).rejects.toMatchObject({ status: 409, code: 'paypal_order_required' });
    const { paypalOrderId } = { paypalOrderId: (await env.payments.createPaypalOrder(alice, dto.id, payInput(dto))).paypalOrderId as string };
    await expect(env.payments.capturePaypalOrder(bob, dto.id, { paypalOrderId })).rejects.toMatchObject({ status: 404 });
    await expect(env.payments.capturePaypalOrder(alice, dto.id, { paypalOrderId: 'ALTRO' })).rejects.toMatchObject({ status: 409, code: 'paypal_order_mismatch' });
  });

  it('un pagamento che arriva su un ordine già annullato va controllato a mano', async () => {
    const env = await setup();
    const { orderId, paypalOrderId } = await created(env);
    const stored = env.db.value(`orders/${orderId}`);
    env.db.seed(`orders/${orderId}`, { ...stored, fulfillment: { ...stored.fulfillment, status: 'cancelled' }, stato: 'annullato' });
    env.paypal.completeBehindTheScenes(paypalOrderId);
    await env.payments.paypalWebhook({}, completedEvent('WH-LATE', orderId, paypalOrderId, 2100));
    const order = env.db.value(`orders/${orderId}`);
    expect(order).toMatchObject({ stato: 'attenzione_pagamento', fulfillment: { status: 'cancelled' }, payment: { status: 'paid_action_required', reconciliationRequired: true } });
    expect(env.onPaid).toHaveBeenCalledWith(orderId, { photosMissing: 1, needsReconciliation: true });
    expect(env.db.value(`adminNotifications/shop-order-${orderId}`).description).toContain('controlla');
  });
});

function completedEvent(id: string, orderId: string, paypalOrderId: string, amountCents: number, captureId = 'CAP-1') {
  return {
    id,
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: captureId,
      status: 'COMPLETED',
      amount: { value: (amountCents / 100).toFixed(2), currency_code: 'EUR' },
      custom_id: orderId,
      invoice_id: undefined,
      payee: { merchant_id: 'MERCH' },
      supplementary_data: { related_ids: { order_id: paypalOrderId } },
      seller_receivable_breakdown: { paypal_fee: { value: '0.95', currency_code: 'EUR' } },
    },
  };
}

function refundEvent(id: string, paypalOrderId: string, amount: string, refundId = 'REF-1', captureId = 'CAP-1', type = 'PAYMENT.CAPTURE.REFUNDED') {
  return {
    id,
    event_type: type,
    resource: {
      id: refundId,
      amount: { value: amount, currency_code: 'EUR' },
      supplementary_data: { related_ids: { order_id: paypalOrderId, capture_id: captureId } },
    },
  };
}

describe('webhook PayPal', () => {
  it('rifiuta firme non valide ed eventi incompleti', async () => {
    const env = await setup();
    env.paypal.webhookValid = false;
    await expect(env.payments.paypalWebhook({}, { id: 'a', event_type: 'X' })).rejects.toMatchObject({ status: 401, code: 'invalid_webhook_signature' });
    env.paypal.webhookValid = true;
    await expect(env.payments.paypalWebhook({}, { event_type: 'X' })).rejects.toMatchObject({ status: 400, code: 'invalid_webhook' });
  });

  it('registra l\'incasso anche se il browser non conferma, una volta sola', async () => {
    const env = await setup();
    const { orderId, paypalOrderId } = await created(env);
    const event = completedEvent('WH-1', orderId, paypalOrderId, 2100);
    await expect(env.payments.paypalWebhook({}, event)).resolves.toEqual({ ok: true, orderId });
    expect(env.db.value(`orders/${orderId}`).payment).toMatchObject({ status: 'paid', paypalCaptureId: 'CAP-1' });
    expect(cashOf(env)).toHaveLength(2);
    await expect(env.payments.paypalWebhook({}, event)).resolves.toEqual({ ok: true, duplicate: true });
    await expect(env.payments.paypalWebhook({}, completedEvent('WH-2', orderId, paypalOrderId, 2100))).resolves.toEqual({ ok: true, orderId });
    expect(cashOf(env)).toHaveLength(2);
    expect(env.db.value('shopPaymentEvents/' + [...env.db.documents.keys()].find(key => key.startsWith('shopPaymentEvents/'))!.split('/')[1]).status).toBeDefined();
    expect(env.onPaid).toHaveBeenCalledTimes(1);
    // Poi la conferma del browser trova l'ordine già pagato.
    await expect(env.payments.capturePaypalOrder(alice, orderId, { paypalOrderId })).resolves.toMatchObject({ duplicate: true, status: 'paid' });
  });

  it('ignora eventi di ordini sconosciuti o incompleti', async () => {
    const env = await setup();
    await expect(env.payments.paypalWebhook({}, completedEvent('WH-X', 'nessuno', 'PP-NO', 100))).resolves.toEqual({ ok: true, ignored: true });
    await expect(env.payments.paypalWebhook({}, { id: 'WH-Y', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: {} })).resolves.toEqual({ ok: true, ignored: true });
    await expect(env.payments.paypalWebhook({}, { id: 'WH-Z', event_type: 'CHECKOUT.ORDER.APPROVED', resource: {} })).resolves.toEqual({ ok: true, ignored: true });
    expect(cashOf(env)).toHaveLength(0);
  });

  it('un pagamento rifiutato lascia l\'ordine pagabile di nuovo', async () => {
    const env = await setup();
    const { orderId, paypalOrderId } = await created(env);
    const event = { ...completedEvent('WH-D', orderId, paypalOrderId, 2100), event_type: 'PAYMENT.CAPTURE.DECLINED' };
    event.resource.status = 'DECLINED';
    await env.payments.paypalWebhook({}, event);
    expect(env.db.value(`orders/${orderId}`).payment).toMatchObject({ status: 'failed', paypalStatus: 'DECLINED' });
    expect(env.db.value(`orders/${orderId}`).fulfillment.status).toBe('awaiting_payment');
    expect(cashOf(env)).toHaveLength(0);
  });
});

describe('rimborsi', () => {
  it('un rimborso totale annulla l\'ordine, storna la cassa e il ricavo del cliente', async () => {
    const env = await setup();
    const { orderId, paypalOrderId } = await paid(env);
    await expect(env.payments.paypalWebhook({}, refundEvent('WH-R1', paypalOrderId, '21.00'))).resolves.toEqual({ ok: true, orderId });
    const order = env.db.value(`orders/${orderId}`);
    expect(order).toMatchObject({
      stato: 'annullato',
      acconto: 0,
      fulfillment: { status: 'cancelled' },
      retention: { status: 'scheduled', reason: 'refunded' },
      payment: { status: 'refunded', refundedCents: 2100, collectedCents: 0 },
    });
    const refund = cashOf(env).find(movement => movement.categoria === 'Rimborso')!;
    expect(refund).toMatchObject({ tipo: 'uscita', importo: 21, origine: 'shop', origineRef: orderId, providerTransactionId: 'REF-1' });
    expect(refund.path).toMatch(/^cashMovements\/shop_refund_[0-9a-f]{32}$/);
    expect(env.db.value('clienti/' + order.clienteId).financials.totalRevenue).toBe(0);
    expect(env.onRefunded).toHaveBeenCalledWith(orderId, { full: true, cancelled: true });
  });

  it('lo stesso rimborso notificato due volte conta una volta sola', async () => {
    const env = await setup();
    const { paypalOrderId } = await paid(env);
    await env.payments.paypalWebhook({}, refundEvent('WH-R1', paypalOrderId, '21.00'));
    await env.payments.paypalWebhook({}, refundEvent('WH-R2', paypalOrderId, '21.00'));
    expect(cashOf(env).filter(movement => movement.categoria === 'Rimborso')).toHaveLength(1);
    expect(env.onRefunded).toHaveBeenCalledTimes(1);
  });

  it('un rimborso parziale non annulla l\'ordine', async () => {
    const env = await setup();
    const { orderId, paypalOrderId } = await paid(env);
    await env.payments.paypalWebhook({}, refundEvent('WH-R1', paypalOrderId, '6.00'));
    const order = env.db.value(`orders/${orderId}`);
    expect(order).toMatchObject({ stato: 'in_lavorazione', fulfillment: { status: 'awaiting_photos' }, payment: { status: 'partially_refunded', refundedCents: 600, collectedCents: 1500 }, acconto: 15 });
    expect(env.onRefunded).toHaveBeenCalledWith(orderId, { full: false, cancelled: false });
    await env.payments.paypalWebhook({}, refundEvent('WH-R2', paypalOrderId, '15.00', 'REF-2'));
    expect(env.db.value(`orders/${orderId}`)).toMatchObject({ stato: 'annullato', payment: { status: 'refunded', refundedCents: 2100 } });
  });

  it('se la merce è già partita il rimborso non annulla l\'ordine ma lo segnala', async () => {
    const env = await setup();
    const { orderId, paypalOrderId } = await paid(env);
    const stored = env.db.value(`orders/${orderId}`);
    env.db.seed(`orders/${orderId}`, { ...stored, fulfillment: { ...stored.fulfillment, status: 'shipped' } });
    await env.payments.paypalWebhook({}, refundEvent('WH-R1', paypalOrderId, '21.00'));
    const order = env.db.value(`orders/${orderId}`);
    expect(order.fulfillment.status).toBe('shipped');
    expect(order.stato).toBe('in_lavorazione');
    expect(order.payment.status).toBe('refunded');
    expect(order.shop.refundedAfterShipping).toBe(true);
    expect(env.onRefunded).toHaveBeenCalledWith(orderId, { full: true, cancelled: false });
  });

  it('ignora rimborsi di un\'altra cattura o oltre l\'importo pagato', async () => {
    const env = await setup();
    const { orderId, paypalOrderId } = await paid(env);
    await env.payments.paypalWebhook({}, refundEvent('WH-R1', paypalOrderId, '5.00', 'REF-1', 'ALTRA-CATTURA'));
    await env.payments.paypalWebhook({}, refundEvent('WH-R2', paypalOrderId, '99.00', 'REF-2'));
    expect(env.db.value(`orders/${orderId}`).payment).toMatchObject({ status: 'paid', refundedCents: 0 });
    expect(cashOf(env).filter(movement => movement.categoria === 'Rimborso')).toHaveLength(0);
    expect(env.onRefunded).not.toHaveBeenCalled();
  });

  it('un rimborso senza importo ("annullato") rimborsa tutto il residuo', async () => {
    const env = await setup();
    const { orderId, paypalOrderId } = await paid(env);
    const event = refundEvent('WH-REV', paypalOrderId, '21.00', 'REV-1', 'CAP-1', 'PAYMENT.CAPTURE.REVERSED');
    (event.resource as any).amount = undefined;
    await env.payments.paypalWebhook({}, event);
    expect(env.db.value(`orders/${orderId}`).payment).toMatchObject({ status: 'refunded', refundedCents: 2100 });
  });
});
