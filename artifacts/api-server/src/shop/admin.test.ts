import { describe, expect, it } from 'vitest';
import { FakeFirestore, FakeStorage } from '../print-shop/test-fakes';
import { ShopAdminService, allowedAdminTransitions } from './admin';
import { ShopMailer } from './mail';
import { ShopService } from './service';
import { ShopUploadService } from './uploads';

const NOW = new Date('2026-12-10T10:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const daysAhead = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
const admin = 'admin@studio.test';

const line = (id: string, photos = 1) => ({
  lineId: id,
  productId: 'mug',
  productName: 'Tazza con foto',
  categoria: 'natale',
  unitPriceCents: 1500,
  listPriceCents: 1500,
  discountPercent: 0,
  quantity: 1,
  photosRequired: photos,
  lineTotalCents: 1500,
});

const paidOrder = (patch: Record<string, unknown> = {}) => ({
  orderType: 'shop',
  orderNumber: 'SH-2026-AAAA1111',
  nomeCliente: 'Alice Verdi',
  emailCliente: 'alice@example.com',
  ownerUid: 'alice',
  customer: { name: 'Alice Verdi', email: 'alice@example.com', phone: '3331112222' },
  lines: [line('l_00000001')],
  totals: { subtotalCents: 1500, shippingCents: 0, totalCents: 1500 },
  stato: 'in_lavorazione',
  fulfillment: { method: 'studio_pickup', status: 'photos_received' },
  payment: { method: 'paypal', status: 'paid', paidAt: daysAgo(2), amountCents: 1500, paypalFeeCents: 80, netAmountCents: 1420, refundedCents: 0, paypalOrderId: 'PAYPAL-ORDER-1', paypalCaptureId: 'CAP-1' },
  retention: { status: 'production' },
  shop: {},
  createdAt: daysAgo(3),
  ...patch,
});

async function setup() {
  const db = new FakeFirestore();
  const storage = new FakeStorage();
  const sent: Array<{ to: string; subject: string; html: string; log: any }> = [];
  const mailer = new ShopMailer({
    db: db as any,
    siteUrl: () => 'https://sito.test',
    now: () => NOW,
    mail: {
      async send(to, subject, html, log) {
        sent.push({ to, subject, html, log });
      },
      async studio() {
        return { name: 'Image Studio', email: 'studio@example.com', phone: '081 000000', address: 'Via Roma 1, Aversa' };
      },
    },
  });
  const shop = new ShopService({ db: db as any, now: () => NOW });
  await shop.updateSettings({ enabled: true, ordersOpen: true, categoryValues: ['natale'], photoWaitDays: 7 });
  const uploads = new ShopUploadService({ db: db as any, storage, orders: { requireOwnerOrder: async () => ({}) }, now: () => NOW });
  const service = new ShopAdminService({ db: db as any, mailer, uploads, shop, now: () => NOW });
  return { db, storage, sent, service };
}

describe('passaggi consentiti', () => {
  const order = (status: string, method = 'studio_pickup', payment = 'paid') => ({ payment: { status: payment }, fulfillment: { method, status } });

  it('seguono il percorso: foto, lavorazione, ritiro o spedizione, consegna', () => {
    expect(allowedAdminTransitions(order('awaiting_photos'))).toEqual(['cancelled']);
    expect(allowedAdminTransitions(order('photos_received'))).toEqual(['in_production', 'cancelled']);
    expect(allowedAdminTransitions(order('in_production'))).toEqual(['ready_for_pickup', 'cancelled']);
    expect(allowedAdminTransitions(order('in_production', 'shipping'))).toEqual(['shipped', 'cancelled']);
    expect(allowedAdminTransitions(order('ready_for_pickup'))).toEqual(['delivered', 'cancelled']);
    expect(allowedAdminTransitions(order('shipped', 'shipping'))).toEqual(['delivered']);
  });

  it('niente da fare su ordini non pagati, finiti o già rimborsati', () => {
    expect(allowedAdminTransitions(order('draft', 'studio_pickup', 'pending'))).toEqual([]);
    expect(allowedAdminTransitions(order('awaiting_payment', 'studio_pickup', 'pending'))).toEqual([]);
    expect(allowedAdminTransitions(order('delivered'))).toEqual([]);
    expect(allowedAdminTransitions(order('cancelled'))).toEqual([]);
    expect(allowedAdminTransitions(order('in_production', 'studio_pickup', 'refunded'))).toEqual([]);
  });
});

describe('elenco ordini', () => {
  async function seeded() {
    const env = await setup();
    env.db.seed('orders/early', paidOrder({ orderNumber: 'SH-2026-EARLY000', payment: { status: 'paid', paidAt: daysAgo(5) } }));
    env.db.seed('orders/late', paidOrder({ orderNumber: 'SH-2026-LATE0000', nomeCliente: 'Bruno Neri', emailCliente: 'bruno@example.com', payment: { status: 'paid', paidAt: daysAgo(1) } }));
    env.db.seed('orders/photos', paidOrder({ orderNumber: 'SH-2026-PHOTOS00', fulfillment: { method: 'studio_pickup', status: 'awaiting_photos' }, shop: { photoDeadlineAt: daysAhead(3) } }));
    env.db.seed('orders/overdue', paidOrder({ orderNumber: 'SH-2026-OVERDUE0', fulfillment: { method: 'studio_pickup', status: 'awaiting_photos' }, shop: { photoOverdue: true } }));
    env.db.seed('orders/draft', paidOrder({ orderNumber: 'SH-2026-DRAFT000', payment: { status: 'pending' }, fulfillment: { method: 'studio_pickup', status: 'draft' } }));
    env.db.seed('orders/dead', paidOrder({ orderNumber: 'SH-2026-DEAD0000', payment: { status: 'pending' }, fulfillment: { method: 'studio_pickup', status: 'cancelled' } }));
    env.db.seed('orders/done', paidOrder({ orderNumber: 'SH-2026-DONE0000', fulfillment: { method: 'studio_pickup', status: 'delivered' } }));
    env.db.seed('orders/stampe', { orderType: 'print_shop', orderNumber: 'ST-2026-AAAA', payment: { status: 'paid' }, fulfillment: { status: 'submitted' } });
    return env;
  }

  it('"da lavorare" mostra gli ordini pagati in corso, dal più vecchio', async () => {
    const { service } = await seeded();
    const list = await service.listOrders({ view: 'active' });
    expect(list.map(order => order.id)).toEqual(expect.arrayContaining(['early', 'late', 'photos', 'overdue']));
    expect(list.map(order => order.id)).not.toContain('draft');
    expect(list.map(order => order.id)).not.toContain('done');
    expect(list.map(order => order.id).indexOf('early')).toBeLessThan(list.map(order => order.id).indexOf('late'));
    expect(list.find(order => order.id === 'stampe')).toBeUndefined();
  });

  it('gli altri elenchi separano bozze, chiusi e da guardare', async () => {
    const { service } = await seeded();
    expect((await service.listOrders({ view: 'drafts' })).map(order => order.id)).toEqual(['draft']);
    expect((await service.listOrders({ view: 'closed' })).map(order => order.id)).toEqual(['done']);
    expect((await service.listOrders({ view: 'attention' })).map(order => order.id)).toEqual(['overdue']);
    const all = (await service.listOrders({ view: 'all' })).map(order => order.id);
    expect(all).not.toContain('dead');
    expect(all).not.toContain('stampe');
    expect(all).toHaveLength(6);
  });

  it('cerca per numero, nome ed email', async () => {
    const { service } = await seeded();
    expect((await service.listOrders({ view: 'all', q: 'bruno' })).map(order => order.id)).toEqual(['late']);
    expect((await service.listOrders({ view: 'all', q: 'LATE0000' })).map(order => order.id)).toEqual(['late']);
    expect((await service.listOrders({ view: 'all', q: 'example.com' })).length).toBe(6);
    expect(await service.listOrders({ view: 'all', q: 'nessuno' })).toEqual([]);
  });

  it('conta le foto mancanti solo dove serve', async () => {
    const { db, service } = await seeded();
    db.seed('orders/photos/shopAssets/a1', { lineId: 'l_00000001', status: 'prepared' });
    const list = await service.listOrders({ view: 'all' });
    expect(list.find(order => order.id === 'photos')).toMatchObject({ photosMissing: 1, photoDeadlineAt: daysAhead(3).toISOString() });
    expect(list.find(order => order.id === 'early')?.photosMissing).toBeNull();
    expect(list.find(order => order.id === 'overdue')).toMatchObject({ photoOverdue: true, needsAttention: true });
  });
});

describe('dettaglio ordine', () => {
  it('riassume cliente, consegna, pagamento, accettazioni, email e storia', async () => {
    const { db, service } = await setup();
    db.seed('orders/o1', paidOrder({
      fulfillment: { method: 'shipping', status: 'in_production', shippingAddress: { street: 'Via Po', houseNumber: '3', postalCode: '10100', city: 'Torino', province: 'TO', country: 'IT' } },
      billingDetails: { fiscalCode: 'RSSMRA85M01H501Q', residenceAddress: { street: 'Via Po', houseNumber: '3', postalCode: '10100', city: 'Torino', province: 'TO', country: 'IT' } },
      legal: { termsAcceptedAt: daysAgo(3), termsVersion: '2026-10-08.1', manifestHash: 'abc' },
      shop: {
        customerNotes: 'Bianco e nero',
        adminNotes: 'Cliente gentile',
        notifications: { order_confirmed: { kind: 'order_confirmed', status: 'sent', attempts: 1, sentAt: daysAgo(2) }, shipped: { kind: 'shipped', status: 'failed', attempts: 2, lastError: 'Gmail non risponde' } },
        history: [{ at: daysAgo(1), by: admin, from: 'photos_received', to: 'in_production', note: 'Si parte' }],
      },
    }));
    db.seed('orders/o1/shopAssets/a1', { lineId: 'l_00000001', status: 'ready', originalName: 'IMG_1.jpg', sizeBytes: 5000, widthPx: 3000, heightPx: 2000 });
    db.seed('orders/o1/shopAssets/a2', { lineId: 'l_00000001', status: 'purged', originalName: 'old.jpg' });
    const dto = await service.getOrder('o1');
    expect(dto).toMatchObject({
      id: 'o1',
      customer: { name: 'Alice Verdi', email: 'alice@example.com', phone: '3331112222' },
      customerNotes: 'Bianco e nero',
      adminNotes: 'Cliente gentile',
      photosMissing: 0,
      allowedStatuses: ['shipped', 'cancelled'],
      canReactivate: false,
      canRequestNewPhoto: true,
      payment: { amountCents: 1500, paypalFeeCents: 80, netAmountCents: 1420, paypalCaptureId: 'CAP-1', reconciliationRequired: false },
      legal: { termsVersion: '2026-10-08.1', manifestHash: 'abc' },
      fulfillment: { shippingAddress: { city: 'Torino' }, tracking: null },
      billingDetails: { fiscalCode: 'RSSMRA85M01H501Q' },
    });
    expect(dto.lines[0].photos.map(photo => photo.id)).toEqual(['a1']);
    expect(dto.notifications).toEqual([
      expect.objectContaining({ key: 'order_confirmed', status: 'sent', attempts: 1 }),
      expect.objectContaining({ key: 'shipped', status: 'failed', lastError: 'Gmail non risponde' }),
    ]);
    expect(dto.history).toEqual([expect.objectContaining({ by: admin, from: 'photos_received', to: 'in_production', note: 'Si parte' })]);
  });

  it('non mostra ordini delle stampe o inesistenti', async () => {
    const { db, service } = await setup();
    db.seed('orders/stampe', { orderType: 'print_shop' });
    await expect(service.getOrder('stampe')).rejects.toMatchObject({ status: 404 });
    await expect(service.getOrder('nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('avanzamento dell\'ordine', () => {
  it('ritiro in studio: lavorazione, pronto, consegnato, con le email giuste e la conservazione delle foto', async () => {
    const { db, sent, service } = await setup();
    db.seed('orders/o1', paidOrder());
    let dto = await service.updateStatus('o1', admin, { status: 'in_production' });
    expect(dto.fulfillmentStatus).toBe('in_production');
    expect(sent).toHaveLength(0);

    dto = await service.updateStatus('o1', admin, { status: 'ready_for_pickup' });
    expect(dto.fulfillmentStatus).toBe('ready_for_pickup');
    expect(sent.map(mail => mail.log.type)).toEqual(['shop_order_ready_for_pickup']);
    expect(sent[0].to).toBe('alice@example.com');
    expect(dto.fulfillment.readyAt).toBe(NOW.toISOString());

    dto = await service.updateStatus('o1', admin, { status: 'delivered' });
    const stored = db.value('orders/o1');
    expect(stored).toMatchObject({ stato: 'completato', fulfillment: { status: 'delivered' }, retention: { status: 'scheduled', reason: 'delivered' } });
    expect((stored.retention.deleteAfter as Date).toISOString()).toBe('2027-03-10T10:00:00.000Z');
    expect(sent.map(mail => mail.log.type)).toEqual(['shop_order_ready_for_pickup', 'shop_order_delivered']);
    expect(dto.history.map(entry => [entry.from, entry.to])).toEqual([['photos_received', 'in_production'], ['in_production', 'ready_for_pickup'], ['ready_for_pickup', 'delivered']]);
    expect(dto.history[0].by).toBe(admin);
  });

  it('spedizione: serve il codice di tracciamento, che finisce nell\'email al cliente', async () => {
    const { db, sent, service } = await setup();
    db.seed('orders/o1', paidOrder({ fulfillment: { method: 'shipping', status: 'in_production', shippingAddress: { street: 'Via Po', houseNumber: '3', postalCode: '10100', city: 'Torino', province: 'TO' } } }));
    await expect(service.updateStatus('o1', admin, { status: 'shipped' })).rejects.toMatchObject({ status: 400, code: 'tracking_required' });
    await expect(service.updateStatus('o1', admin, { status: 'shipped', tracking: { code: '   ' } })).rejects.toMatchObject({ code: 'tracking_required' });
    await expect(service.updateStatus('o1', admin, { status: 'ready_for_pickup' })).rejects.toMatchObject({ status: 409, code: 'transition_not_allowed' });
    const dto = await service.updateStatus('o1', admin, { status: 'shipped', tracking: { carrier: 'BRT', code: 'ABC123' } });
    expect(dto.fulfillmentStatus).toBe('shipped');
    expect(dto.fulfillment.tracking).toEqual({ carrier: 'BRT', code: 'ABC123' });
    expect(dto.fulfillment.shippedAt).toBe(NOW.toISOString());
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain('ABC123');
    expect(sent[0].html).toContain('BRT');
  });

  it('non si salta un passaggio e non si tocca ciò che è finito o non pagato', async () => {
    const { db, service } = await setup();
    db.seed('orders/o1', paidOrder());
    await expect(service.updateStatus('o1', admin, { status: 'delivered' })).rejects.toMatchObject({ status: 409, code: 'transition_not_allowed' });
    await expect(service.updateStatus('o1', admin, { status: 'ready_for_pickup' })).rejects.toMatchObject({ code: 'transition_not_allowed' });
    db.seed('orders/draft', paidOrder({ payment: { status: 'pending' }, fulfillment: { method: 'studio_pickup', status: 'draft' } }));
    await expect(service.updateStatus('draft', admin, { status: 'in_production' })).rejects.toMatchObject({ code: 'transition_not_allowed' });
    db.seed('orders/done', paidOrder({ fulfillment: { method: 'studio_pickup', status: 'delivered' } }));
    await expect(service.updateStatus('done', admin, { status: 'cancelled', note: 'x' })).rejects.toMatchObject({ code: 'transition_not_allowed' });
    await expect(service.updateStatus('nope', admin, { status: 'in_production' })).rejects.toMatchObject({ status: 404 });
  });

  it('annullare richiede il motivo, avvisa il cliente e ricorda di rimborsare da PayPal', async () => {
    const { db, sent, service } = await setup();
    db.seed('orders/o1', paidOrder());
    await expect(service.updateStatus('o1', admin, { status: 'cancelled' })).rejects.toMatchObject({ status: 400, code: 'reason_required' });
    const dto = await service.updateStatus('o1', admin, { status: 'cancelled', note: 'Foto non utilizzabili' });
    const stored = db.value('orders/o1');
    expect(stored).toMatchObject({ stato: 'annullato', fulfillment: { status: 'cancelled', cancellationReason: 'Foto non utilizzabili' }, retention: { status: 'scheduled', reason: 'cancelled' }, shop: { refundPending: true } });
    expect(dto.refundPending).toBe(true);
    expect(dto.needsAttention).toBe(true);
    expect(sent.map(mail => mail.log.type)).toEqual(['shop_order_cancelled']);
    expect(dto.allowedStatuses).toEqual([]);
  });
});

describe('note, email e foto da sostituire', () => {
  it('salva le note interne senza mostrarle al cliente', async () => {
    const { db, service } = await setup();
    db.seed('orders/o1', paidOrder());
    const dto = await service.setAdminNotes('o1', '  Chiamare prima della consegna  ');
    expect(dto.adminNotes).toBe('Chiamare prima della consegna');
    expect(db.value('orders/o1').shop.adminNotes).toBe('Chiamare prima della consegna');
  });

  it('rimanda le email consentite, anche se erano già partite', async () => {
    const { db, sent, service } = await setup();
    db.seed('orders/o1', paidOrder());
    await service.resendNotification('o1', 'order_confirmed');
    await service.resendNotification('o1', 'order_confirmed');
    expect(sent.map(mail => mail.log.type)).toEqual(['shop_order_order_confirmed', 'shop_order_order_confirmed']);
    await service.resendNotification('o1', 'photos_reminder');
    await service.resendNotification('o1', 'photos_reminder');
    expect(sent).toHaveLength(4);
    await expect(service.resendNotification('o1', 'admin_new_order' as any)).rejects.toMatchObject({ status: 400, code: 'invalid_mail' });
  });

  it('se la mail non parte lo dice invece di far finta di niente', async () => {
    const { db, service } = await setup();
    db.seed('orders/o1', paidOrder({ emailCliente: '', customer: { name: 'Senza email' } }));
    await expect(service.resendNotification('o1', 'order_confirmed')).rejects.toMatchObject({ status: 502, code: 'mail_failed' });
  });

  it('toglie la foto non adatta, riapre l\'attesa con un nuovo termine e scrive al cliente con il motivo', async () => {
    const { db, storage, sent, service } = await setup();
    db.seed('orders/o1', paidOrder());
    db.seed('orders/o1/shopAssets/a1', { lineId: 'l_00000001', status: 'ready', originalName: 'sfocata.jpg', storagePath: 'shop-orders/alice/o1/l/a1.jpg' });
    storage.put('shop-orders/alice/o1/l/a1.jpg', Buffer.from('x'));
    await expect(service.requestNewPhoto('o1', 'a1', admin, '  ')).rejects.toMatchObject({ status: 400, code: 'reason_required' });
    const dto = await service.requestNewPhoto('o1', 'a1', admin, 'È sfocata');
    expect(storage.files.size).toBe(0);
    expect(db.value('orders/o1/shopAssets/a1')).toBeUndefined();
    expect(dto).toMatchObject({ fulfillmentStatus: 'awaiting_photos', photosMissing: 1, photoOverdue: false });
    expect(dto.photoDeadlineAt).toBe(daysAhead(7).toISOString());
    expect(db.value('orders/o1').shop.lastPhotoRejection).toMatchObject({ reason: 'È sfocata', fileName: 'sfocata.jpg' });
    expect(sent.map(mail => mail.log.type)).toEqual(['shop_order_photo_rejected']);
    expect(sent[0].html).toContain('È sfocata');
    expect(sent[0].html).toContain('Carica la nuova foto');
    expect(dto.history.at(-1)).toMatchObject({ to: 'awaiting_photos', note: 'Foto da sostituire: È sfocata' });
  });

  it('non si chiede una foto nuova per ordini spediti o non pagati', async () => {
    const { db, service } = await setup();
    db.seed('orders/shipped', paidOrder({ fulfillment: { method: 'shipping', status: 'shipped' } }));
    db.seed('orders/draft', paidOrder({ payment: { status: 'pending' }, fulfillment: { method: 'studio_pickup', status: 'draft' } }));
    await expect(service.requestNewPhoto('shipped', 'a1', admin, 'x')).rejects.toMatchObject({ status: 409 });
    await expect(service.requestNewPhoto('draft', 'a1', admin, 'x')).rejects.toMatchObject({ status: 409 });
  });
});

describe('pagamento arrivato su un ordine annullato', () => {
  const lateOrder = (patch: Record<string, unknown> = {}) => paidOrder({
    stato: 'attenzione_pagamento',
    fulfillment: { method: 'studio_pickup', status: 'cancelled', cancelledAt: daysAgo(1), cancellationReason: 'payment_after_cancellation' },
    payment: { method: 'paypal', status: 'paid_action_required', paidAt: daysAgo(0), amountCents: 1500, reconciliationRequired: true, reconciliationReason: 'paypal_completed_after_cancellation' },
    retention: { status: 'scheduled', reason: 'cancelled', deleteAfter: daysAhead(5), reconciliationRequired: true },
    ...patch,
  });

  it('lo studio può tenerlo: l\'ordine riparte e il cliente riceve la conferma', async () => {
    const { db, sent, service } = await setup();
    db.seed('orders/o1', lateOrder());
    db.seed('orders/o1/shopAssets/a1', { lineId: 'l_00000001', status: 'ready' });
    const before = await service.getOrder('o1');
    expect(before).toMatchObject({ canReactivate: true, needsAttention: true });
    const dto = await service.reactivate('o1', admin);
    expect(dto).toMatchObject({ fulfillmentStatus: 'photos_received', paymentStatus: 'paid', canReactivate: false, needsAttention: false });
    expect(db.value('orders/o1')).toMatchObject({ stato: 'in_lavorazione', retention: { status: 'production' } });
    expect(db.value('orders/o1').payment.reconciliationRequired).toBeUndefined();
    expect(sent.map(mail => mail.log.type)).toEqual(['shop_order_order_confirmed']);
  });

  it('se mancano le foto torna in attesa con un nuovo termine', async () => {
    const { db, service } = await setup();
    db.seed('orders/o1', lateOrder());
    const dto = await service.reactivate('o1', admin);
    expect(dto).toMatchObject({ fulfillmentStatus: 'awaiting_photos', photosMissing: 1 });
    expect(dto.photoDeadlineAt).toBe(daysAhead(7).toISOString());
  });

  it('non si riattiva un ordine normale o con le foto già cancellate', async () => {
    const { db, service } = await setup();
    db.seed('orders/normal', paidOrder());
    db.seed('orders/purged', lateOrder({ retention: { status: 'purged' } }));
    await expect(service.reactivate('normal', admin)).rejects.toMatchObject({ status: 409, code: 'transition_not_allowed' });
    await expect(service.reactivate('purged', admin)).rejects.toMatchObject({ code: 'transition_not_allowed' });
  });
});
