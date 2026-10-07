import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { FakeFirestore } from '../print-shop/test-fakes';
import { GiftCardHttpError, GiftCardService } from './service';

const NOW = new Date('2026-11-20T10:00:00.000Z');

function makeService(options: { codes?: string[]; now?: Date } = {}) {
  const db = new FakeFirestore();
  const codes = [...(options.codes ?? ['K7QM-4XD2-9PTR', 'R3WN-8HC5-2VJA', 'M4DX-7QPA-3GSY'])];
  const service = new GiftCardService({
    db: db as any,
    now: () => options.now ?? NOW,
    randomCode: () => codes.shift() ?? 'ZZZZ-ZZZZ-ZZZZ',
  });
  return { db, service };
}

const typeInput = {
  name: 'Foto di Natale + tela',
  description: 'Shooting in studio e stampa su tela inclusa',
  title: 'Foto di Natale',
  line2: 'con stampa su tela',
  kind: 'prodotto' as const,
  priceCents: 3000,
  theme: 'natale' as const,
  campaignId: null,
  validityMode: 'date' as const,
  validityDate: '2026-12-20',
  sellUntil: null,
  sellOnline: true,
  sellInStudio: true,
  active: true,
};

async function seedType(service: GiftCardService, overrides: Record<string, unknown> = {}) {
  return service.saveType(null, { ...typeInput, ...overrides }, 'admin@studio.test');
}

function seedCampaign(db: FakeFirestore, id = 'camp1', extra: Record<string, unknown> = {}) {
  db.seed(`booking_campaigns/${id}`, {
    nome: 'Shooting Natale 2026',
    code: 'NATALE26',
    dataInizio: Timestamp.fromDate(new Date('2026-11-15T00:00:00Z')),
    dataFine: Timestamp.fromDate(new Date('2026-12-20T22:00:00Z')),
    attiva: true,
    temaStagionale: 'natale',
    ...extra,
  });
}

const sellInput = (typeId: string, extra: Record<string, unknown> = {}) => ({
  typeId,
  recipientName: 'Giulia',
  message: 'Per i tuoi 30 anni',
  paymentMethod: 'contante' as const,
  ...extra,
});

describe('GiftCardService types', () => {
  it('rifiuta tipi senza prezzo o senza titolo', async () => {
    const { service } = makeService();
    await expect(service.saveType(null, { ...typeInput, priceCents: 0, title: ' ' }, 'a@b.it'))
      .rejects.toMatchObject({ status: 422, code: 'invalid_input' });
  });

  it('richiede una campagna esistente per scadere a fine campagna', async () => {
    const { service } = makeService();
    await expect(service.saveType(null, { ...typeInput, validityMode: 'campaign', campaignId: null }, 'a@b.it'))
      .rejects.toMatchObject({ status: 422 });
    await expect(service.saveType(null, { ...typeInput, validityMode: 'campaign', campaignId: 'manca' }, 'a@b.it'))
      .rejects.toMatchObject({ status: 422, code: 'campaign_not_found' });
  });

  it('aggiorna un tipo esistente senza cambiarne l\'id', async () => {
    const { service } = makeService();
    const created = await seedType(service);
    const updated = await service.saveType(created.id, { ...typeInput, priceCents: 3500 }, 'a@b.it');
    expect(updated.id).toBe(created.id);
    expect(updated.priceCents).toBe(3500);
    expect(await service.listTypes()).toHaveLength(1);
  });
});

describe('GiftCardService sell', () => {
  it('vende in contanti: card attiva, evento e incasso in cassa', async () => {
    const { db, service } = makeService();
    const type = await seedType(service);
    const card = await service.sell(sellInput(type.id), 'admin@studio.test');

    expect(card).toMatchObject({
      code: 'K7QM-4XD2-9PTR',
      status: 'attiva',
      effectiveStatus: 'attiva',
      valueCents: 3000,
      recipientName: 'Giulia',
      channel: 'studio',
      title: 'Foto di Natale',
    });
    expect(card.expiresAt).toBe('2026-12-20T22:59:59.999Z');
    expect(db.countCollection('giftCardEvents')).toBe(1);
    const cash = [...db.documents.entries()].filter(([path]) => path.startsWith('cashMovements/'));
    expect(cash).toHaveLength(1);
    expect(cash[0][1]).toMatchObject({
      tipo: 'entrata',
      importo: 30,
      metodoPagamento: 'contante',
      origine: 'gift_card',
      origineRef: 'K7QM-4XD2-9PTR',
    });
  });

  it('con bonifico resta in attesa e non registra l\'incasso', async () => {
    const { db, service } = makeService();
    const type = await seedType(service);
    const card = await service.sell(sellInput(type.id, { paymentMethod: 'bonifico' }), 'a@b.it');
    expect(card.status).toBe('in_attesa_pagamento');
    expect(db.countCollection('cashMovements')).toBe(0);

    const confirmed = await service.confirmPayment(card.code, 'a@b.it');
    expect(confirmed.status).toBe('attiva');
    expect(db.countCollection('cashMovements')).toBe(1);
    await expect(service.confirmPayment(card.code, 'a@b.it')).rejects.toMatchObject({ status: 409 });
  });

  it('prende la scadenza dalla fine della campagna', async () => {
    const { db, service } = makeService();
    seedCampaign(db);
    const type = await seedType(service, { validityMode: 'campaign', validityDate: null, campaignId: 'camp1' });
    const card = await service.sell(sellInput(type.id), 'a@b.it');
    expect(card.expiresAt).toBe('2026-12-20T22:00:00.000Z');
    expect(card.campaignId).toBe('camp1');
  });

  it('permette di cambiare o togliere la scadenza alla vendita', async () => {
    const { service } = makeService();
    const type = await seedType(service);
    const custom = await service.sell(sellInput(type.id, { expiresOn: '2027-01-31' }), 'a@b.it');
    expect(custom.expiresAt).toBe('2027-01-31T22:59:59.999Z');
    const forever = await service.sell(sellInput(type.id, { noExpiry: true }), 'a@b.it');
    expect(forever.expiresAt).toBeNull();
    expect(forever.effectiveStatus).toBe('attiva');
  });

  it('rifiuta scadenze passate, messaggi lunghi e tipi non vendibili', async () => {
    const { service } = makeService();
    const type = await seedType(service);
    await expect(service.sell(sellInput(type.id, { expiresOn: '2026-11-01' }), 'a@b.it'))
      .rejects.toMatchObject({ code: 'expiry_in_past' });
    await expect(service.sell(sellInput(type.id, { message: 'x'.repeat(91) }), 'a@b.it'))
      .rejects.toMatchObject({ status: 422 });
    const hidden = await seedType(service, { name: 'Nascosta', active: false });
    await expect(service.sell(sellInput(hidden.id), 'a@b.it')).rejects.toMatchObject({ code: 'type_not_sellable' });
    const online = await seedType(service, { name: 'Solo online', sellInStudio: false });
    await expect(service.sell(sellInput(online.id), 'a@b.it')).rejects.toMatchObject({ code: 'type_not_sellable' });
    await expect(service.sell(sellInput('inesistente'), 'a@b.it')).rejects.toMatchObject({ status: 404 });
  });

  it('riprova con un nuovo codice se è già usato', async () => {
    const { db, service } = makeService({ codes: ['K7QM-4XD2-9PTR', 'K7QM-4XD2-9PTR', 'R3WN-8HC5-2VJA'] });
    const type = await seedType(service);
    const first = await service.sell(sellInput(type.id), 'a@b.it');
    const second = await service.sell(sellInput(type.id), 'a@b.it');
    expect(first.code).toBe('K7QM-4XD2-9PTR');
    expect(second.code).toBe('R3WN-8HC5-2VJA');
    expect(db.countCollection('giftCards')).toBe(2);
  });

  it('non cambia il valore delle card già vendute se il prezzo del tipo cambia', async () => {
    const { service } = makeService();
    const type = await seedType(service);
    const card = await service.sell(sellInput(type.id), 'a@b.it');
    await service.saveType(type.id, { ...typeInput, priceCents: 9900, title: 'Altro titolo' }, 'a@b.it');
    const stored = await service.get(card.code);
    expect(stored.valueCents).toBe(3000);
    expect(stored.title).toBe('Foto di Natale');
  });
});

describe('GiftCardService gestione', () => {
  it('annulla una card attiva solo con un motivo e non la riannulla', async () => {
    const { service } = makeService();
    const type = await seedType(service);
    const card = await service.sell(sellInput(type.id), 'a@b.it');
    await expect(service.cancel(card.code, '  ', 'a@b.it')).rejects.toMatchObject({ status: 422 });
    const cancelled = await service.cancel(card.code, 'Cartoncino perso', 'a@b.it');
    expect(cancelled).toMatchObject({ status: 'annullata', cancelReason: 'Cartoncino perso' });
    await expect(service.cancel(card.code, 'ancora', 'a@b.it')).rejects.toMatchObject({ code: 'not_cancellable' });
  });

  it('sposta la scadenza e la fa tornare valida', async () => {
    const past = makeService({ now: new Date('2026-12-25T10:00:00Z') });
    const type = await seedType(past.service, { validityDate: '2026-12-30' });
    const card = await past.service.sell(sellInput(type.id), 'a@b.it');
    // stessa base dati, ma un giorno dopo la scadenza
    const later = new GiftCardService({ db: past.db as any, now: () => new Date('2026-12-31T12:00:00Z') });
    expect((await later.get(card.code)).effectiveStatus).toBe('scaduta');
    const extended = await new GiftCardService({
      db: past.db as any,
      now: () => new Date('2026-12-26T12:00:00Z'),
    }).setExpiry(card.code, '2027-02-28', 'a@b.it');
    expect(extended.expiresAt).toBe('2027-02-28T22:59:59.999Z');
    expect((await later.get(card.code)).effectiveStatus).toBe('attiva');
  });

  it('elenca le card dalla più recente e filtra per stato effettivo', async () => {
    const { service } = makeService();
    const type = await seedType(service);
    await service.sell(sellInput(type.id), 'a@b.it');
    const second = await service.sell(sellInput(type.id), 'a@b.it');
    await service.cancel(second.code, 'Errore', 'a@b.it');
    expect(await service.list()).toHaveLength(2);
    expect((await service.list({ status: 'annullata' })).map(card => card.code)).toEqual([second.code]);
    expect(await service.list({ status: 'scaduta' })).toHaveLength(0);
  });
});

describe('GiftCardService getPublic', () => {
  it('espone solo i dati utili a chi riceve, senza dati interni', async () => {
    const { db, service } = makeService();
    seedCampaign(db);
    const type = await seedType(service, { validityMode: 'campaign', validityDate: null, campaignId: 'camp1' });
    const card = await service.sell(sellInput(type.id, { paymentMethod: 'carta' }), 'admin@studio.test');
    const publicCard = await service.getPublic(card.code.toLowerCase().replace(/-/g, ''));

    expect(publicCard).toMatchObject({
      code: card.code,
      status: 'attiva',
      theme: 'natale',
      title: 'Foto di Natale',
      recipientName: 'Giulia',
      message: 'Per i tuoi 30 anni',
      campaign: { name: 'Shooting Natale 2026', bookingCode: 'NATALE26', state: 'open' },
    });
    const text = JSON.stringify(publicCard);
    expect(text).not.toContain('admin@studio.test');
    expect(text).not.toContain('carta');
    expect(text).not.toContain('valueCents');
  });

  it('indica se la campagna deve ancora aprire o è chiusa', async () => {
    const { db, service } = makeService();
    seedCampaign(db, 'camp1', { dataInizio: Timestamp.fromDate(new Date('2026-12-01T00:00:00Z')) });
    seedCampaign(db, 'camp2', { dataFine: Timestamp.fromDate(new Date('2026-11-18T00:00:00Z')) });
    const upcoming = await seedType(service, { campaignId: 'camp1', validityMode: 'none', validityDate: null });
    const closed = await seedType(service, { name: 'Chiusa', campaignId: 'camp2', validityMode: 'none', validityDate: null });
    const a = await service.sell(sellInput(upcoming.id), 'a@b.it');
    const b = await service.sell(sellInput(closed.id), 'a@b.it');
    expect((await service.getPublic(a.code)).campaign?.state).toBe('upcoming');
    expect((await service.getPublic(b.code)).campaign?.state).toBe('closed');
  });

  it('mostra una card scaduta e risponde 404 a codici sconosciuti o malformati', async () => {
    const { db, service } = makeService();
    const type = await seedType(service, { validityDate: '2026-11-21' });
    const card = await service.sell(sellInput(type.id), 'a@b.it');
    const later = new GiftCardService({ db: db as any, now: () => new Date('2026-12-01T00:00:00Z') });
    expect((await later.getPublic(card.code)).status).toBe('scaduta');

    for (const bad of ['', 'ciao', 'AAAA-BBBB-CCCC', 'K7QM-4XD2-9PT0', 'K7QM-4XD2']) {
      await expect(service.getPublic(bad)).rejects.toBeInstanceOf(GiftCardHttpError);
      await expect(service.getPublic(bad)).rejects.toMatchObject({ status: 404 });
    }
  });
});

describe('prodotti del catalogo nel tipo', () => {
  const seedProduct = (db: FakeFirestore, id = 'p1', extra: Record<string, unknown> = {}) =>
    db.seed('products/' + id, { nome: 'Tela 30x40', descrizione: 'Stampa su tela', prezzo: 50, prezzoFinale: 45, attivo: true, immagini: ['https://img.test/a.jpg', 'https://img.test/b.jpg'], ...extra });

  it('rifiuta prodotti che non esistono, ripetuti o con quantità sbagliata', async () => {
    const { db, service } = makeService();
    seedProduct(db);
    await expect(seedType(service, { items: [{ productId: 'manca', quantity: 1 }] })).rejects.toMatchObject({ code: 'product_not_found' });
    await expect(seedType(service, { items: [{ productId: 'p1', quantity: 1 }, { productId: 'p1', quantity: 2 }] })).rejects.toMatchObject({ status: 422 });
    await expect(seedType(service, { items: [{ productId: 'p1', quantity: 0 }] })).rejects.toMatchObject({ status: 422 });
    const ok = await seedType(service, { items: [{ productId: 'p1', quantity: 2 }] });
    expect(ok.items).toEqual([{ productId: 'p1', quantity: 2 }]);
  });

  it('chi riceve vede i prodotti aggiornati dal catalogo, mai il prezzo', async () => {
    const { db, service } = makeService();
    seedProduct(db);
    const type = await seedType(service, { description: 'Una tela e un servizio', items: [{ productId: 'p1', quantity: 1 }] });
    const card = await service.sell(sellInput(type.id), 'a@b.it');

    let publicCard = await service.getPublic(card.code);
    expect(publicCard.includes).toBe('Una tela e un servizio');
    expect(publicCard.items).toEqual([{ productId: 'p1', quantity: 1, name: 'Tela 30x40', description: 'Stampa su tela', imageUrls: ['https://img.test/a.jpg', 'https://img.test/b.jpg'] }]);
    expect(JSON.stringify(publicCard)).not.toMatch(/45|prezzo|price/i);

    seedProduct(db, 'p1', { nome: 'Tela 40x60', immagini: ['https://img.test/c.jpg'] });
    publicCard = await service.getPublic(card.code);
    expect(publicCard.items[0]).toMatchObject({ name: 'Tela 40x60', imageUrls: ['https://img.test/c.jpg'] });
  });

  it('se il prodotto sparisce dal catalogo restano i dati della vendita', async () => {
    const { db, service } = makeService();
    seedProduct(db);
    const type = await seedType(service, { items: [{ productId: 'p1', quantity: 1 }] });
    const card = await service.sell(sellInput(type.id), 'a@b.it');
    db.documents.delete('products/p1');
    expect((await service.getPublic(card.code)).items[0]).toMatchObject({ name: 'Tela 30x40', description: 'Stampa su tela' });
    seedProduct(db, 'p1', { attivo: false, nome: 'Nascosto' });
    expect((await service.getPublic(card.code)).items[0].name).toBe('Tela 30x40');
  });
});

describe('clienti nella vendita al banco', () => {
  it('salva chi compra tra i clienti se c\'è l\'email e collega l\'incasso', async () => {
    const { db, service } = makeService();
    const type = await seedType(service);
    const card = await service.sell(
      sellInput(type.id, { buyer: { firstName: 'Anna', lastName: 'Verdi', email: 'Anna@Example.com', phone: '347 111' } }),
      'admin@studio.test',
    );
    const clients = [...db.documents.entries()].filter(([path]) => path.startsWith('clienti/'));
    expect(clients).toHaveLength(1);
    expect(clients[0][1]).toMatchObject({ nome: 'Anna', cognome: 'Verdi', email: 'anna@example.com', cellulare1: '347 111' });
    const cash = [...db.documents.entries()].find(([path]) => path.startsWith('cashMovements/'))![1];
    expect(cash).toMatchObject({ clienteId: clients[0][0].split('/')[1], nomeCliente: 'Anna Verdi' });
    expect(card.buyerEmail).toBe('anna@example.com');
  });

  it('senza dati di chi compra non crea clienti, e chiede nome e cognome con l\'email', async () => {
    const { db, service } = makeService();
    const type = await seedType(service);
    await service.sell(sellInput(type.id), 'a@b.it');
    expect(db.countCollection('clienti')).toBe(0);
    await expect(service.sell(sellInput(type.id, { buyer: { email: 'x@example.com' } }), 'a@b.it')).rejects.toMatchObject({ status: 422 });
    await expect(service.sell(sellInput(type.id, { buyer: { firstName: 'A', lastName: 'B', email: 'non-email' } }), 'a@b.it')).rejects.toMatchObject({ status: 422 });
  });
});

describe('riscatto nella prenotazione', () => {
  async function activeCard(extra: { campaign?: boolean } = {}) {
    const ctx = makeService();
    seedCampaign(ctx.db);
    const type = await seedType(ctx.service, extra.campaign === false ? {} : { validityMode: 'campaign', validityDate: null, campaignId: 'camp1' });
    const card = await ctx.service.sell(sellInput(type.id), 'a@b.it');
    return { ...ctx, card };
  }

  it('riserva la card una sola volta e rifiuta il secondo uso', async () => {
    const { service, card } = await activeCard();
    const claim = await service.claimForBooking(card.code.toLowerCase(), 'camp1');
    expect(claim).toMatchObject({ code: card.code, title: 'Foto di Natale', valueCents: 3000 });
    expect((await service.get(card.code)).status).toBe('riscattata');
    await expect(service.claimForBooking(card.code, 'camp1')).rejects.toMatchObject({ status: 409, code: 'gift_card_unusable' });
  });

  it('rifiuta card di un\'altra campagna, scadute, annullate o inesistenti', async () => {
    const { db, service, card } = await activeCard();
    await expect(service.claimForBooking(card.code, 'altra')).rejects.toMatchObject({ code: 'gift_card_campaign_mismatch' });
    expect((await service.get(card.code)).status).toBe('attiva');
    await expect(service.claimForBooking('AAAA-BBBB-CCCC', 'camp1')).rejects.toMatchObject({ status: 404 });
    await expect(service.claimForBooking('malformato', 'camp1')).rejects.toMatchObject({ status: 404 });

    const expired = new GiftCardService({ db: db as any, now: () => new Date('2027-01-05T00:00:00Z') });
    await expect(expired.claimForBooking(card.code, 'camp1')).rejects.toMatchObject({ code: 'gift_card_unusable' });
    await service.cancel(card.code, 'Errore', 'a@b.it');
    await expect(service.claimForBooking(card.code, 'camp1')).rejects.toMatchObject({ code: 'gift_card_unusable' });
  });

  it('una card senza campagna vale per qualsiasi campagna', async () => {
    const { service, card } = await activeCard({ campaign: false });
    await expect(service.claimForBooking(card.code, 'qualsiasi')).resolves.toMatchObject({ code: card.code });
  });

  it('libera la card se la prenotazione non viene creata', async () => {
    const { service, card } = await activeCard();
    await service.claimForBooking(card.code, 'camp1');
    await service.releaseClaim(card.code);
    expect((await service.get(card.code)).status).toBe('attiva');
    await service.claimForBooking(card.code, 'camp1');
    await service.attachBooking(card.code, { id: 'booking1', campaignId: 'camp1' });
    await service.releaseClaim(card.code); // con la prenotazione collegata non si libera più
    expect((await service.get(card.code))).toMatchObject({ status: 'riscattata', bookingId: 'booking1' });
  });

  it('collega la prenotazione e porta gli incassi nella campagna senza duplicarli', async () => {
    const { db, service, card } = await activeCard();
    await service.claimForBooking(card.code, 'camp1');
    await service.attachBooking(card.code, { id: 'booking1', campaignId: 'camp1', campaignTheme: 'natale' });
    const cash = [...db.documents.entries()].filter(([path]) => path.startsWith('cashMovements/')).map(([, value]) => value);
    expect(cash).toHaveLength(1);
    expect(cash[0]).toMatchObject({ bookingId: 'booking1', campaignId: 'camp1', origineTema: 'natale', importo: 30, origine: 'gift_card' });
    expect(db.countCollection('cashMovements')).toBe(1);
  });
});
