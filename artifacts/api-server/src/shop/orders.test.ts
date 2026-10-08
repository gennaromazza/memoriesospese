import { describe, expect, it, vi } from 'vitest';
import { FakeFirestore } from '../print-shop/test-fakes';
import { ShopOrderService } from './orders';
import { ShopService } from './service';

const NOW = new Date('2026-12-01T10:00:00Z');
const alice = { uid: 'alice', email: 'Alice@Example.com' };
const bob = { uid: 'bob', email: 'bob@example.com' };

const address = { street: 'Via Roma', houseNumber: '12', postalCode: '81031', city: 'Aversa', province: 'ce', country: 'IT' };
const billing = { fiscalCode: 'RSSMRA85M01H501Q', residenceAddress: address };

async function setup(settingsPatch: Record<string, unknown> = {}) {
  const db = new FakeFirestore();
  db.seed('productCategories/c1', { value: 'natale', nome: 'Natale', attivo: true, displayOrder: 1 });
  db.seed('products/mug', { nome: 'Tazza con foto', descrizione: '', prezzo: 15, sconto: 0, numeroFoto: 1, categoria: 'natale', attivo: true, immagini: [] });
  db.seed('products/card', { nome: 'Cartolina', descrizione: '', prezzo: 3, sconto: 0, numeroFoto: 0, categoria: 'natale', attivo: true, immagini: [] });
  db.seed('products/old', { nome: 'Vecchio', descrizione: '', prezzo: 9, sconto: 0, numeroFoto: 0, categoria: 'natale', attivo: false, immagini: [] });
  let clock = NOW;
  const shop = new ShopService({ db: db as any, now: () => clock });
  await shop.updateSettings({
    enabled: true,
    ordersOpen: true,
    categoryValues: ['natale'],
    shipping: { enabled: true, priceCents: 590, estimatedMinDays: 3, estimatedMaxDays: 6 },
    ...settingsPatch,
  });
  const removeAssetsForLines = vi.fn(async () => undefined);
  const orders = new ShopOrderService({ db: db as any, shop, now: () => clock, removeAssetsForLines });
  return { db, shop, orders, removeAssetsForLines, setClock: (date: Date) => { clock = date; } };
}

const mugLine = { productId: 'mug', quantity: 1 };
const cardLine = { productId: 'card', quantity: 2 };

describe('creazione della bozza', () => {
  it('prezza le righe dal catalogo e crea un ordine del gestionale di tipo shop', async () => {
    const { db, orders } = await setup();
    const dto = await orders.createDraft(alice, { lines: [mugLine, cardLine], customer: { name: 'Alice Verdi', phone: '3331112222' } });
    expect(dto.totals).toEqual({ subtotalCents: 2100, shippingCents: 0, totalCents: 2100 });
    expect(dto.fulfillmentStatus).toBe('draft');
    expect(dto.paymentStatus).toBe('pending');
    expect(dto.canEdit).toBe(true);
    expect(dto.photosMissing).toBe(1);
    expect(dto.orderNumber).toMatch(/^SH-2026-[A-Z0-9]{8}$/);
    const stored = db.value(`orders/${dto.id}`);
    expect(stored).toMatchObject({
      orderType: 'shop',
      source: 'shop',
      ownerUid: 'alice',
      stato: 'bozza',
      acconto: 0,
      totale: 21,
      saldo: 21,
      nomeCliente: 'Alice Verdi',
      emailCliente: 'alice@example.com',
      telefonoCliente: '3331112222',
      fulfillment: { method: 'studio_pickup', status: 'draft' },
      payment: { method: 'paypal', status: 'pending' },
    });
    expect(stored.prodotti).toEqual([
      expect.objectContaining({ prodottoId: 'mug', prodottoNome: 'Tazza con foto', prodottoPrezzo: 15, quantita: 1, prodottoNumeroFoto: 1 }),
      expect.objectContaining({ prodottoId: 'card', prodottoPrezzo: 3, quantita: 2 }),
    ]);
    expect(stored.retention).toMatchObject({ status: 'scheduled', reason: 'draft' });
  });

  it('non crea clienti nel gestionale, ma collega un cliente già esistente per email', async () => {
    const { db, orders } = await setup();
    const first = await orders.createDraft(alice, { lines: [mugLine] });
    expect(db.value(`orders/${first.id}`).clienteId).toBeUndefined();
    expect(db.countCollection('clienti')).toBe(0);

    db.seed('clienti/cliente_1', { email: 'alice@example.com', nome: 'Alice' });
    const second = await orders.createDraft(alice, { lines: [mugLine] });
    expect(db.value(`orders/${second.id}`).clienteId).toBe('cliente_1');
    expect(db.countCollection('clienti')).toBe(1);
  });

  it('si rifiuta se la vetrina è spenta o gli ordini sono chiusi', async () => {
    const off = await setup({ enabled: false });
    await expect(off.orders.createDraft(alice, { lines: [mugLine] })).rejects.toMatchObject({ status: 409, code: 'shop_unavailable' });
    const closed = await setup({ ordersOpen: false });
    await expect(closed.orders.createDraft(alice, { lines: [mugLine] })).rejects.toMatchObject({ status: 409, code: 'orders_closed' });
    const late = await setup({ lastOrderDate: '2026-11-30' });
    await expect(late.orders.createDraft(alice, { lines: [mugLine] })).rejects.toMatchObject({ status: 409, code: 'orders_closed' });
  });

  it('rifiuta prodotti non disponibili e quantità non ammesse', async () => {
    const { orders } = await setup();
    await expect(orders.createDraft(alice, { lines: [{ productId: 'old', quantity: 1 }] })).rejects.toMatchObject({ code: 'product_unavailable' });
    await expect(orders.createDraft(alice, { lines: [{ productId: 'nope', quantity: 1 }] })).rejects.toMatchObject({ code: 'product_unavailable' });
    await expect(orders.createDraft(alice, { lines: [{ productId: 'mug', quantity: 2 }] })).rejects.toMatchObject({ code: 'invalid_quantity' });
    await expect(orders.createDraft(alice, { lines: [] })).rejects.toMatchObject({ code: 'empty_cart' });
  });

  it('limita le bozze aperte per cliente', async () => {
    const { orders } = await setup();
    for (let index = 0; index < 5; index++) await orders.createDraft(alice, { lines: [mugLine] });
    await expect(orders.createDraft(alice, { lines: [mugLine] })).rejects.toMatchObject({ status: 409, code: 'active_draft_limit' });
    await expect(orders.createDraft(bob, { lines: [mugLine] })).resolves.toBeDefined();
  });
});

describe('modifica del carrello', () => {
  it('mantiene l\'id delle righe esistenti, toglie le altre e avvisa per eliminare le loro foto', async () => {
    const { orders, removeAssetsForLines } = await setup();
    const draft = await orders.createDraft(alice, { lines: [mugLine, mugLine, cardLine] });
    const [first, second, third] = draft.lines;
    const next = await orders.replaceLines(alice, draft.id, [
      { lineId: first.lineId, productId: 'mug', quantity: 1 },
      { lineId: third.lineId, productId: 'card', quantity: 5 },
    ]);
    expect(next.lines.map(line => line.lineId)).toEqual([first.lineId, third.lineId]);
    expect(next.totals.totalCents).toBe(1500 + 1500);
    expect(removeAssetsForLines).toHaveBeenCalledWith(draft.id, [second.lineId]);
    expect(next.quoteFingerprint).not.toBe(draft.quoteFingerprint);
  });

  it('riallinea i prezzi al catalogo di adesso', async () => {
    const { db, orders } = await setup();
    const draft = await orders.createDraft(alice, { lines: [cardLine] });
    db.seed('products/card', { nome: 'Cartolina', descrizione: '', prezzo: 4, sconto: 0, numeroFoto: 0, categoria: 'natale', attivo: true, immagini: [] });
    const next = await orders.replaceLines(alice, draft.id, [{ lineId: draft.lines[0].lineId, productId: 'card', quantity: 2 }]);
    expect(next.lines[0].unitPriceCents).toBe(400);
    expect(next.totals.totalCents).toBe(800);
  });

  it('un nuovo carrello annulla un pagamento PayPal già preparato', async () => {
    const { db, orders } = await setup();
    const draft = await orders.createDraft(alice, { lines: [cardLine] });
    db.seed(`orders/${draft.id}`, {
      ...db.value(`orders/${draft.id}`),
      payment: { method: 'paypal', status: 'pending', paypalOrderId: 'PAYPAL1', invoiceId: 'X-A2', attempt: 2, quoteFingerprint: 'abc' },
      fulfillment: { method: 'studio_pickup', status: 'awaiting_payment' },
    });
    await orders.replaceLines(alice, draft.id, [{ lineId: draft.lines[0].lineId, productId: 'card', quantity: 1 }]);
    const stored = db.value(`orders/${draft.id}`);
    expect(stored.payment).toEqual({ method: 'paypal', status: 'pending', attempt: 2 });
    expect(stored.fulfillment.status).toBe('draft');
  });

  it('non tocca ordini altrui né ordini pagati', async () => {
    const { db, orders } = await setup();
    const draft = await orders.createDraft(alice, { lines: [cardLine] });
    await expect(orders.replaceLines(bob, draft.id, [cardLine])).rejects.toMatchObject({ status: 404, code: 'order_not_found' });
    await expect(orders.getOwnerOrder(bob, draft.id)).rejects.toMatchObject({ status: 404 });
    db.seed(`orders/${draft.id}`, { ...db.value(`orders/${draft.id}`), payment: { method: 'paypal', status: 'paid' } });
    await expect(orders.replaceLines(alice, draft.id, [cardLine])).rejects.toMatchObject({ status: 409, code: 'order_locked' });
    await expect(orders.updateOrder(alice, draft.id, { customerNotes: 'ciao' })).rejects.toMatchObject({ status: 409, code: 'order_locked' });
  });

  it('una bozza scaduta non si modifica più', async () => {
    const { orders, setClock } = await setup();
    const draft = await orders.createDraft(alice, { lines: [cardLine] });
    setClock(new Date('2026-12-09T10:00:00Z'));
    await expect(orders.replaceLines(alice, draft.id, [cardLine])).rejects.toMatchObject({ status: 409, code: 'order_locked' });
  });
});

describe('consegna e fatturazione', () => {
  it('la spedizione aggiunge il costo, il ritiro lo toglie e cancella indirizzo e dati fiscali', async () => {
    const { db, orders } = await setup();
    const draft = await orders.createDraft(alice, { lines: [mugLine] });
    const shipped = await orders.updateOrder(alice, draft.id, {
      fulfillment: { method: 'shipping', shippingAddress: address },
      billingDetails: billing,
    });
    expect(shipped.totals).toEqual({ subtotalCents: 1500, shippingCents: 590, totalCents: 2090 });
    expect(shipped.fulfillment.shippingAddress).toMatchObject({ province: 'CE', postalCode: '81031' });
    expect(shipped.billingDetails?.fiscalCode).toBe('RSSMRA85M01H501Q');

    const pickup = await orders.updateOrder(alice, draft.id, { fulfillment: { method: 'studio_pickup' } });
    expect(pickup.totals).toEqual({ subtotalCents: 1500, shippingCents: 0, totalCents: 1500 });
    expect(pickup.fulfillment.shippingAddress).toBeNull();
    expect(pickup.billingDetails).toBeNull();
    expect(db.value(`orders/${draft.id}`).fulfillment.shippingAddress).toBeUndefined();
    expect(pickup.quoteFingerprint).not.toBe(shipped.quoteFingerprint);
  });

  it('rifiuta indirizzi e codici fiscali non validi e la spedizione spenta', async () => {
    const { orders } = await setup();
    const draft = await orders.createDraft(alice, { lines: [mugLine] });
    await expect(orders.updateOrder(alice, draft.id, { fulfillment: { method: 'shipping', shippingAddress: { ...address, postalCode: '1' } } }))
      .rejects.toMatchObject({ status: 400, code: 'shipping_address_required' });
    await orders.updateOrder(alice, draft.id, { fulfillment: { method: 'shipping', shippingAddress: address } });
    await expect(orders.updateOrder(alice, draft.id, { billingDetails: { ...billing, fiscalCode: 'SBAGLIATO' } }))
      .rejects.toMatchObject({ status: 400, code: 'fiscal_code_required' });
    const off = await setup({ shipping: { enabled: false, priceCents: 0, estimatedMinDays: 3, estimatedMaxDays: 6 } });
    const offDraft = await off.orders.createDraft(alice, { lines: [mugLine] });
    await expect(off.orders.updateOrder(alice, offDraft.id, { fulfillment: { method: 'shipping', shippingAddress: address } }))
      .rejects.toMatchObject({ status: 409, code: 'shipping_disabled' });
  });

  it('aggiorna nome, telefono e note del cliente', async () => {
    const { db, orders } = await setup();
    const draft = await orders.createDraft(alice, { lines: [mugLine] });
    const updated = await orders.updateOrder(alice, draft.id, { customer: { name: ' Alice  Verdi ', phone: '333 444' }, customerNotes: 'Bianco e nero, grazie' });
    expect(updated.customer).toMatchObject({ name: 'Alice  Verdi', email: 'alice@example.com', phone: '333 444' });
    expect(updated.customerNotes).toBe('Bianco e nero, grazie');
    expect(db.value(`orders/${draft.id}`)).toMatchObject({ nomeCliente: 'Alice  Verdi', telefonoCliente: '333 444' });
  });
});

describe('annullamento e elenco', () => {
  it('annulla una bozza non pagata e non la mostra più nell\'elenco', async () => {
    const { db, orders } = await setup();
    const keep = await orders.createDraft(alice, { lines: [mugLine] });
    const drop = await orders.createDraft(alice, { lines: [cardLine] });
    await orders.cancelDraft(alice, drop.id);
    expect(db.value(`orders/${drop.id}`)).toMatchObject({ stato: 'annullato', fulfillment: { status: 'cancelled' }, retention: { reason: 'cancelled' } });
    expect((await orders.listOwnerOrders(alice)).map(order => order.id)).toEqual([keep.id]);
    await expect(orders.replaceLines(alice, drop.id, [cardLine])).rejects.toMatchObject({ code: 'order_locked' });
  });

  it('non annulla un ordine pagato', async () => {
    const { db, orders } = await setup();
    const draft = await orders.createDraft(alice, { lines: [mugLine] });
    db.seed(`orders/${draft.id}`, { ...db.value(`orders/${draft.id}`), payment: { method: 'paypal', status: 'paid' } });
    await expect(orders.cancelDraft(alice, draft.id)).rejects.toMatchObject({ status: 409, code: 'order_locked' });
  });

  it('elenca solo i propri ordini, dal più recente', async () => {
    const { orders, setClock } = await setup();
    const first = await orders.createDraft(alice, { lines: [mugLine] });
    setClock(new Date('2026-12-02T10:00:00Z'));
    const second = await orders.createDraft(alice, { lines: [cardLine] });
    await orders.createDraft(bob, { lines: [cardLine] });
    expect((await orders.listOwnerOrders(alice)).map(order => order.id)).toEqual([second.id, first.id]);
  });
});

describe('foto e permessi sull\'ordine', () => {
  it('conta le foto mancanti dalle sole foto pronte e abilita il caricamento', async () => {
    const { db, orders } = await setup();
    const draft = await orders.createDraft(alice, { lines: [mugLine, mugLine] });
    const [a, b] = draft.lines;
    db.seed(`orders/${draft.id}/shopAssets/x1`, { lineId: a.lineId, status: 'ready', originalName: 'a.jpg', sizeBytes: 1000, widthPx: 3000, heightPx: 2000 });
    db.seed(`orders/${draft.id}/shopAssets/x2`, { lineId: b.lineId, status: 'prepared', originalName: 'b.jpg', sizeBytes: 1000 });
    db.seed(`orders/${draft.id}/shopAssets/x3`, { lineId: b.lineId, status: 'purged', originalName: 'c.jpg', sizeBytes: 1000 });
    const dto = await orders.getOwnerOrder(alice, draft.id);
    expect(dto.photosMissing).toBe(1);
    expect(dto.lines[0]).toMatchObject({ photosMissing: 0 });
    expect(dto.lines[0].photos.map(photo => photo.id)).toEqual(['x1']);
    expect(dto.lines[1]).toMatchObject({ photosMissing: 1 });
    expect(dto.lines[1].photos.map(photo => photo.id)).toEqual(['x2']);
    expect(dto.canUploadPhotos).toBe(true);
  });

  it('dopo il pagamento le foto si caricano solo se ne mancano', async () => {
    const { db, orders } = await setup();
    const draft = await orders.createDraft(alice, { lines: [mugLine] });
    const stored = db.value(`orders/${draft.id}`);
    db.seed(`orders/${draft.id}`, { ...stored, payment: { method: 'paypal', status: 'paid' }, fulfillment: { ...stored.fulfillment, status: 'awaiting_photos' } });
    let dto = await orders.getOwnerOrder(alice, draft.id);
    expect(dto).toMatchObject({ canEdit: false, canUploadPhotos: true });
    db.seed(`orders/${draft.id}`, { ...stored, payment: { method: 'paypal', status: 'paid' }, fulfillment: { ...stored.fulfillment, status: 'in_production' } });
    dto = await orders.getOwnerOrder(alice, draft.id);
    expect(dto).toMatchObject({ canEdit: false, canUploadPhotos: false });
  });
});
