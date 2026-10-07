import { describe, expect, it } from 'vitest';
import { FakeFirestore } from '../print-shop/test-fakes';
import { PayPalApiError, centsToPayPalValue } from '../print-shop/paypal-orders';
import { GiftCardOnlineService, type GiftCardMail, type GiftCardPaypalClient } from './online';
import { GiftCardService } from './service';

const NOW = new Date('2026-11-20T10:00:00.000Z');

class FakePaypal implements GiftCardPaypalClient {
  readonly config = { merchantId: 'MERCH1' };
  enabled = true;
  failCreate = false;
  failCapture = false;
  amountOverride: number | null = null;
  readonly orders = new Map<string, { input: any; captured: boolean }>();
  captureCalls = 0;
  private counter = 0;

  publicConfig() {
    return { enabled: this.enabled, checkoutEnabled: this.enabled, webhookReady: true, environment: 'sandbox' as const, clientId: 'client123' };
  }
  async createOrder(input: any) {
    if (this.failCreate) throw new PayPalApiError('boom', 500);
    const id = `PAYORDER${++this.counter}`;
    this.orders.set(id, { input, captured: false });
    return { id, status: 'CREATED' };
  }
  response(id: string) {
    const order = this.orders.get(id)!;
    order.captured = true;
    return {
      id,
      status: 'COMPLETED',
      payer: { email_address: 'buyer@paypal.test' },
      purchase_units: [{
        custom_id: order.input.internalOrderId,
        payee: { merchant_id: 'MERCH1' },
        payments: {
          captures: [{
            id: `CAP-${id}`,
            status: 'COMPLETED',
            amount: { currency_code: 'EUR', value: centsToPayPalValue(this.amountOverride ?? order.input.amountCents) },
            seller_receivable_breakdown: { paypal_fee: { value: '1.20' } },
          }],
        },
      }],
    };
  }
  async captureOrder(id: string) {
    this.captureCalls++;
    if (this.failCapture) throw new PayPalApiError('lost response', 500);
    return this.response(id);
  }
  async getOrder(id: string) {
    const order = this.orders.get(id);
    if (!order) throw new PayPalApiError('missing', 404);
    return order.captured ? this.response(id) : { id, status: 'CREATED' };
  }
}

class FakeMail implements GiftCardMail {
  sent: Array<{ to: string; subject: string; html: string; type: string }> = [];
  failing = false;
  async send(to: string, subject: string, html: string, log: { type: string }) {
    if (this.failing) throw new Error('smtp down');
    this.sent.push({ to, subject, html, type: log.type });
  }
  async studio() {
    return { name: 'Image Studio', email: 'studio@example.test', phone: '+39 000' };
  }
}

function setup(options: { webhook?: boolean } = {}) {
  const db = new FakeFirestore();
  const clock = { now: NOW };
  const codes = ['K7QM-4XD2-9PTR', 'R3WN-8HC5-2VJA', 'M4DX-7QPA-3GSY'];
  const paypal = new FakePaypal();
  const mail = new FakeMail();
  const service = new GiftCardService({ db: db as any, now: () => clock.now });
  const verifier = { ok: true, verifyWebhook: async () => verifier.ok };
  const online = new GiftCardOnlineService({
    db: db as any,
    service,
    paypal,
    mail,
    siteUrl: () => 'https://site.test',
    webhook: options.webhook ? verifier : undefined,
    now: () => clock.now,
    randomCode: () => codes.shift() ?? 'ZZZZ-ZZZZ-ZZZZ',
  });
  return { db, service, online, paypal, mail, clock, verifier };
}

const typeInput = {
  name: 'Foto di Natale + tela',
  description: 'Shooting e tela',
  title: 'Foto di Natale',
  line2: 'con stampa su tela',
  kind: 'prodotto' as const,
  priceCents: 3000,
  theme: 'natale' as const,
  campaignId: null,
  validityMode: 'date' as const,
  validityDate: '2026-12-31',
  sellUntil: '2026-12-20',
  sellOnline: true,
  sellInStudio: true,
  active: true,
};

const order = (typeId: string, extra: Record<string, unknown> = {}) => ({
  typeId,
  recipientName: 'Giulia',
  message: 'Auguri',
  buyerName: 'Marco',
  buyerEmail: 'Marco@Example.com',
  recipientEmail: 'giulia@example.com',
  deliverOn: null,
  termsAccepted: true,
  privacyAccepted: true,
  ...extra,
});

async function seedType(service: GiftCardService, extra: Record<string, unknown> = {}) {
  return service.saveType(null, { ...typeInput, ...extra }, 'admin@studio.test');
}

describe('vetrina online', () => {
  it('mostra solo i tipi vendibili online e la configurazione PayPal', async () => {
    const { service, online } = setup();
    const ok = await seedType(service);
    await seedType(service, { name: 'Solo studio', sellOnline: false });
    await seedType(service, { name: 'Nascosta', active: false });
    await seedType(service, { name: 'Chiusa', sellUntil: '2026-11-01' });
    const shop = await online.shop();
    expect(shop.types.map(type => type.id)).toEqual([ok.id]);
    expect(shop.types[0]).toMatchObject({ priceCents: 3000, validUntil: '2026-12-31T22:59:59.999Z' });
    expect(shop.paypal).toEqual({ enabled: true, clientId: 'client123', environment: 'sandbox', currency: 'EUR' });
    expect(JSON.stringify(shop)).not.toContain('admin@studio.test');
  });

  it('non espone il client id se PayPal non è pronto', async () => {
    const { online, paypal } = setup();
    paypal.enabled = false;
    expect((await online.shop()).paypal).toMatchObject({ enabled: false, clientId: null });
  });
});

describe('creazione dell\'ordine', () => {
  it('crea la card in attesa, l\'ordine PayPal e un token non memorizzato in chiaro', async () => {
    const { db, service, online, paypal } = setup();
    const type = await seedType(service);
    const result = await online.createOrder(order(type.id));
    expect(result).toMatchObject({ code: 'K7QM-4XD2-9PTR', amountCents: 3000, paypalOrderId: 'PAYORDER1' });
    expect(result.buyerToken.length).toBeGreaterThan(20);
    const stored = db.value('giftCards/K7QM-4XD2-9PTR');
    expect(stored).toMatchObject({
      status: 'in_attesa_pagamento',
      channel: 'online',
      buyerEmail: 'marco@example.com',
      valueCents: 3000,
      payment: { paypalOrderId: 'PAYORDER1' },
    });
    expect(JSON.stringify(stored)).not.toContain(result.buyerToken);
    expect(paypal.orders.get('PAYORDER1')!.input).toMatchObject({ internalOrderId: 'K7QM-4XD2-9PTR', amountCents: 3000 });
  });

  it('rifiuta richieste senza consensi, email sbagliate o tipi non vendibili', async () => {
    const { service, online } = setup();
    const type = await seedType(service);
    await expect(online.createOrder(order(type.id, { termsAccepted: false }))).rejects.toMatchObject({ code: 'legal_acceptance_required' });
    await expect(online.createOrder(order(type.id, { buyerEmail: 'non-una-email' }))).rejects.toMatchObject({ status: 422 });
    await expect(online.createOrder(order(type.id, { recipientEmail: 'x@' }))).rejects.toMatchObject({ status: 422 });
    await expect(online.createOrder(order(type.id, { buyerName: '  ' }))).rejects.toMatchObject({ status: 422 });
    await expect(online.createOrder(order(type.id, { message: 'x'.repeat(91) }))).rejects.toMatchObject({ status: 422 });
    const studioOnly = await seedType(service, { name: 'Solo studio', sellOnline: false });
    await expect(online.createOrder(order(studioOnly.id))).rejects.toMatchObject({ code: 'type_not_sellable' });
    const closed = await seedType(service, { name: 'Chiusa', sellUntil: '2026-11-01' });
    await expect(online.createOrder(order(closed.id))).rejects.toMatchObject({ code: 'type_not_sellable' });
    await expect(online.createOrder(order('inesistente'))).rejects.toMatchObject({ status: 404 });
  });

  it('controlla la data di consegna', async () => {
    const { service, online } = setup();
    const type = await seedType(service);
    await expect(online.createOrder(order(type.id, { deliverOn: '2026-11-01' }))).rejects.toMatchObject({ code: 'delivery_in_past' });
    await expect(online.createOrder(order(type.id, { deliverOn: '2027-01-15' }))).rejects.toMatchObject({ code: 'delivery_after_expiry' });
    await expect(online.createOrder(order(type.id, { deliverOn: '25/12/2026' }))).rejects.toMatchObject({ status: 422 });
    const scheduled = await online.createOrder(order(type.id, { deliverOn: '2026-12-25' }));
    expect(scheduled.code).toBeTruthy();
  });

  it('annulla la card se PayPal rifiuta la creazione, e risponde 503 se non è configurato', async () => {
    const { db, service, online, paypal } = setup();
    const type = await seedType(service);
    paypal.failCreate = true;
    await expect(online.createOrder(order(type.id))).rejects.toMatchObject({ status: 502 });
    expect(db.value('giftCards/K7QM-4XD2-9PTR')).toMatchObject({ status: 'annullata' });
    paypal.failCreate = false;
    paypal.enabled = false;
    await expect(online.createOrder(order(type.id))).rejects.toMatchObject({ status: 503, code: 'paypal_not_configured' });
  });
});

describe('pagamento e attivazione', () => {
  async function paid(opts: { deliverOn?: string | null; recipientEmail?: string } = {}) {
    const ctx = setup();
    const type = await seedType(ctx.service);
    const created = await ctx.online.createOrder(order(type.id, opts));
    return { ...ctx, type, created };
  }

  it('attiva la card, registra incasso e commissione in cassa e invia le email', async () => {
    const { db, online, mail, created } = await paid();
    const result = await online.capture(created.code, { paypalOrderId: created.paypalOrderId, buyerToken: created.buyerToken });
    expect(result).toMatchObject({ status: 'attiva', duplicate: false });
    expect(db.value(`giftCards/${created.code}`)).toMatchObject({ status: 'attiva', payment: { status: 'paid', feeCents: 120, netCents: 2880 } });

    const cash = [...db.documents.entries()].filter(([path]) => path.startsWith('cashMovements/')).map(([, value]) => value);
    expect(cash).toHaveLength(2);
    expect(cash.find(item => item.tipo === 'entrata')).toMatchObject({ importo: 30, categoria: 'Gift card', metodoPagamento: 'paypal', origine: 'gift_card' });
    expect(cash.find(item => item.tipo === 'uscita')).toMatchObject({ importo: 1.2, categoria: 'Commissioni di pagamento', movementRole: 'payment_fee' });

    expect(mail.sent.map(item => [item.to, item.type])).toEqual([
      ['marco@example.com', 'gift_card_receipt'],
      ['giulia@example.com', 'gift_card_delivery'],
    ]);
    expect(mail.sent[1].html).toContain(`https://site.test/regalo/${created.code}`);
    expect(db.value(`giftCards/${created.code}`).deliveredAt).toBeTruthy();
  });

  it('non incassa due volte se la conferma arriva due volte', async () => {
    const { db, online, paypal, mail, created } = await paid();
    const body = { paypalOrderId: created.paypalOrderId, buyerToken: created.buyerToken };
    await online.capture(created.code, body);
    const again = await online.capture(created.code, body);
    expect(again).toMatchObject({ status: 'attiva', duplicate: true });
    expect(paypal.captureCalls).toBe(1);
    expect(db.countCollection('cashMovements')).toBe(2);
    expect(mail.sent).toHaveLength(2);
  });

  it('non accetta token o ordine sbagliati e non rivela se la card esiste', async () => {
    const { online, created } = await paid();
    await expect(online.capture(created.code, { paypalOrderId: created.paypalOrderId, buyerToken: 'sbagliato' })).rejects.toMatchObject({ status: 404 });
    await expect(online.capture(created.code, { paypalOrderId: created.paypalOrderId })).rejects.toMatchObject({ status: 404 });
    await expect(online.capture('AAAA-BBBB-CCCC', { buyerToken: created.buyerToken })).rejects.toMatchObject({ status: 404 });
    await expect(online.capture('malformato', {})).rejects.toMatchObject({ status: 404 });
    await expect(online.capture(created.code, { paypalOrderId: 'ALTRO', buyerToken: created.buyerToken })).rejects.toMatchObject({ code: 'paypal_order_mismatch' });
  });

  it('rifiuta un pagamento con importo diverso e non attiva la card', async () => {
    const { db, online, paypal, created } = await paid();
    paypal.amountOverride = 100;
    await expect(online.capture(created.code, { paypalOrderId: created.paypalOrderId, buyerToken: created.buyerToken }))
      .rejects.toMatchObject({ status: 409, code: 'payment_mismatch' });
    expect(db.value(`giftCards/${created.code}`).status).toBe('in_attesa_pagamento');
    expect(db.countCollection('cashMovements')).toBe(0);
  });

  it('recupera il pagamento se la risposta di PayPal si perde', async () => {
    const { db, online, paypal, created } = await paid();
    const original = paypal.captureOrder.bind(paypal);
    paypal.captureOrder = async (id: string) => {
      await original(id); // PayPal incassa davvero...
      throw new PayPalApiError('timeout', 504); // ...ma noi non vediamo la risposta
    };
    const result = await online.capture(created.code, { paypalOrderId: created.paypalOrderId, buyerToken: created.buyerToken });
    expect(result).toMatchObject({ status: 'attiva' });
    expect(db.countCollection('cashMovements')).toBe(2);
  });

  it('libera la prenotazione del pagamento se PayPal fallisce davvero', async () => {
    const { db, online, paypal, created } = await paid();
    paypal.failCapture = true;
    await expect(online.capture(created.code, { paypalOrderId: created.paypalOrderId, buyerToken: created.buyerToken }))
      .rejects.toMatchObject({ status: 502 });
    expect(db.value(`giftCards/${created.code}`)).toMatchObject({ status: 'in_attesa_pagamento', payment: { captureStatus: 'released' } });
    paypal.failCapture = false;
    const retry = await online.capture(created.code, { paypalOrderId: created.paypalOrderId, buyerToken: created.buyerToken });
    expect(retry.status).toBe('attiva');
  });

  it('un pagamento che arriva su una card annullata viene registrato e segnalato', async () => {
    const { db, service, online, created } = await paid();
    await service.cancel(created.code, 'Errore', 'admin@studio.test');
    const provider = { ...(online as any).deps.paypal.response(created.paypalOrderId) };
    const reconciled = await online.activate(created.code, {
      paypalOrderId: created.paypalOrderId, captureId: provider.purchase_units[0].payments.captures[0].id,
      amountCents: 3000, currency: 'EUR', feeCents: 120, customId: created.code,
    }, 'test');
    expect(reconciled.status).toBe('annullata');
    expect(db.value(`giftCards/${created.code}`)).toMatchObject({ status: 'annullata', reviewRequired: true });
    expect(db.countCollection('cashMovements')).toBe(2);
  });
});

describe('email e consegna programmata', () => {
  it('manda subito la ricevuta e rimanda al 25 dicembre la consegna a chi riceve', async () => {
    const ctx = setup();
    const type = await seedType(ctx.service);
    const created = await ctx.online.createOrder(order(type.id, { deliverOn: '2026-12-25' }));
    await ctx.online.capture(created.code, { paypalOrderId: created.paypalOrderId, buyerToken: created.buyerToken });

    expect(ctx.mail.sent.map(item => item.type)).toEqual(['gift_card_receipt']);
    expect(ctx.mail.sent[0].html).toContain('25 dicembre 2026');
    const stored = ctx.db.value(`giftCards/${created.code}`);
    expect(stored.deliveredAt).toBeNull();
    expect(stored.mailDueAt.toDate().toISOString()).toBe('2026-12-25T07:00:00.000Z');

    ctx.clock.now = new Date('2026-12-24T12:00:00Z');
    expect(await ctx.online.processDueDeliveries()).toEqual({ processed: 0 });

    ctx.clock.now = new Date('2026-12-25T07:30:00Z');
    expect(await ctx.online.processDueDeliveries()).toEqual({ processed: 1 });
    expect(ctx.mail.sent.map(item => item.type)).toEqual(['gift_card_receipt', 'gift_card_delivery']);
    expect(ctx.db.value(`giftCards/${created.code}`).deliveredAt).toBeTruthy();
    expect(ctx.db.value(`giftCards/${created.code}`).mailDueAt).toBeNull();

    ctx.clock.now = new Date('2026-12-25T09:00:00Z');
    expect(await ctx.online.processDueDeliveries()).toEqual({ processed: 0 });
    expect(ctx.mail.sent).toHaveLength(2);
  });

  it('senza email di chi riceve manda solo la ricevuta, con il link da inoltrare', async () => {
    const ctx = setup();
    const type = await seedType(ctx.service);
    const created = await ctx.online.createOrder(order(type.id, { recipientEmail: '' }));
    await ctx.online.capture(created.code, { paypalOrderId: created.paypalOrderId, buyerToken: created.buyerToken });
    expect(ctx.mail.sent).toHaveLength(1);
    expect(ctx.mail.sent[0].html).toContain('inoltra tu il link');
    expect(ctx.mail.sent[0].html).toContain(`/regalo/${created.code}`);
  });

  it('un errore di posta non blocca il pagamento e viene ritentato', async () => {
    const ctx = setup();
    const type = await seedType(ctx.service);
    const created = await ctx.online.createOrder(order(type.id));
    ctx.mail.failing = true;
    const result = await ctx.online.capture(created.code, { paypalOrderId: created.paypalOrderId, buyerToken: created.buyerToken });
    expect(result.status).toBe('attiva');
    expect(ctx.mail.sent).toHaveLength(0);
    const stored = ctx.db.value(`giftCards/${created.code}`);
    expect(stored.mail.receipt).toMatchObject({ status: 'pending', attempts: 1 });
    expect(stored.mailDueAt).toBeTruthy();

    ctx.mail.failing = false;
    ctx.clock.now = new Date(NOW.getTime() + 20 * 60 * 1000);
    await ctx.online.processDueDeliveries();
    expect(ctx.mail.sent.map(item => item.type)).toEqual(['gift_card_receipt', 'gift_card_delivery']);
  });

  it('il contenuto scritto dal cliente non finisce come HTML nelle email', async () => {
    const ctx = setup();
    const type = await seedType(ctx.service);
    const created = await ctx.online.createOrder(order(type.id, { recipientName: '<b>Giulia</b>', message: '<script>alert(1)</script>', buyerName: '<img src=x>' }));
    await ctx.online.capture(created.code, { paypalOrderId: created.paypalOrderId, buyerToken: created.buyerToken });
    const html = ctx.mail.sent.map(item => item.html).join('\n');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('il reinvio manuale rimanda ricevuta o consegna', async () => {
    const ctx = setup();
    const type = await seedType(ctx.service);
    const created = await ctx.online.createOrder(order(type.id, { deliverOn: '2026-12-25' }));
    await ctx.online.capture(created.code, { paypalOrderId: created.paypalOrderId, buyerToken: created.buyerToken });
    await ctx.online.resend(created.code, 'buyer', 'admin@studio.test');
    expect(ctx.mail.sent.filter(item => item.type === 'gift_card_receipt')).toHaveLength(2);
    await ctx.online.resend(created.code, 'recipient', 'admin@studio.test');
    expect(ctx.mail.sent.filter(item => item.type === 'gift_card_delivery')).toHaveLength(1);
  });
});

describe('verifica con PayPal e webhook', () => {
  it('"verifica pagamento" attiva una card pagata ma rimasta in attesa', async () => {
    const ctx = setup();
    const type = await seedType(ctx.service);
    const created = await ctx.online.createOrder(order(type.id));
    // il cliente ha pagato su PayPal ma il browser non ha mai confermato
    ctx.paypal.orders.get(created.paypalOrderId)!.captured = true;
    const card = await ctx.online.reconcile(created.code, 'admin@studio.test');
    expect(card.status).toBe('attiva');
    expect(ctx.db.countCollection('cashMovements')).toBe(2);
    const untouched = await ctx.online.reconcile(created.code, 'admin@studio.test');
    expect(untouched.status).toBe('attiva');
    expect(ctx.db.countCollection('cashMovements')).toBe(2);
  });

  const completedEvent = (created: { code: string; paypalOrderId: string }, id = 'WH-1') => ({
    id,
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: `CAP-${created.paypalOrderId}`,
      status: 'COMPLETED',
      custom_id: created.code,
      amount: { currency_code: 'EUR', value: '30.00' },
      seller_receivable_breakdown: { paypal_fee: { value: '1.20' } },
      supplementary_data: { related_ids: { order_id: created.paypalOrderId } },
    },
  });

  it('il webhook attiva la card una sola volta anche se PayPal lo ripete', async () => {
    const ctx = setup({ webhook: true });
    const type = await seedType(ctx.service);
    const created = await ctx.online.createOrder(order(type.id));
    await ctx.online.webhook({}, completedEvent(created));
    expect(ctx.db.value(`giftCards/${created.code}`).status).toBe('attiva');
    expect(await ctx.online.webhook({}, completedEvent(created))).toMatchObject({ duplicate: true });
    await ctx.online.webhook({}, completedEvent(created, 'WH-2'));
    expect(ctx.db.countCollection('cashMovements')).toBe(2);
    const paidEvents = [...ctx.db.documents.entries()].filter(
      ([path, value]) => path.startsWith('giftCardEvents/') && value.type === 'paid_online',
    );
    expect(paidEvents).toHaveLength(1);
  });

  it('il webhook ignora ordini che non sono gift card e firme non valide', async () => {
    const ctx = setup({ webhook: true });
    const ignored = await ctx.online.webhook({}, {
      id: 'WH-9', event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAPX', status: 'COMPLETED', custom_id: 'ordine-stampe-123', amount: { currency_code: 'EUR', value: '5.00' }, supplementary_data: { related_ids: { order_id: 'PP9' } } },
    });
    expect(ignored).toMatchObject({ ignored: true });
    ctx.verifier.ok = false;
    await expect(ctx.online.webhook({}, completedEvent({ code: 'K7QM-4XD2-9PTR', paypalOrderId: 'PP1' }))).rejects.toMatchObject({ status: 401 });
  });

  it('un rimborso annulla la card e chiede un controllo della cassa', async () => {
    const ctx = setup({ webhook: true });
    const type = await seedType(ctx.service);
    const created = await ctx.online.createOrder(order(type.id));
    await ctx.online.webhook({}, completedEvent(created));
    await ctx.online.webhook({}, { id: 'WH-R', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: 'REF1', custom_id: created.code } });
    expect(ctx.db.value(`giftCards/${created.code}`)).toMatchObject({ status: 'annullata', reviewRequired: true, cancelReason: 'Rimborso PayPal' });
  });

  it('senza webhook dedicato risponde 503', async () => {
    const ctx = setup();
    await expect(ctx.online.webhook({}, {})).rejects.toMatchObject({ status: 503 });
    expect(ctx.online.isWebhookEnabled()).toBe(false);
  });
});
