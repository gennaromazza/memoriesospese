import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { GiftCardHttpError } from './gift-cards/service.js';
import type { AddressInfo } from 'node:net';

const h = vi.hoisted(() => ({
  campaign: {} as any,
  bookings: new Map<string, any>(),
  guards: new Map<string, any>(),
  management: new Map<string, any>(),
  confirmations: new Map<string, any>(),
  sequence: 0,
  available: [] as any[],
  events: vi.fn(),
  googleBusy: [] as Array<{ start: Date; end: Date }>,
  orphanAlert: vi.fn(),
  manualDeposit: vi.fn(),
  slots: vi.fn(),
  createEvent: vi.fn(),
  deleteEvent: vi.fn(),
  sendEmail: vi.fn(),
  received: vi.fn(),
  confirmed: vi.fn(),
  admin: vi.fn(),
  calendarLink: vi.fn(),
  claimGift: vi.fn(),
  attachGift: vi.fn(),
  releaseGift: vi.fn(),
  failSave: false,
  tail: Promise.resolve(),
  trace: [] as string[],
}));
const stamp = (value: string | Date) => ({ toDate: () => new Date(value) });
const start = new Date('2030-12-10T09:00:00Z');
const end = new Date('2030-12-10T09:30:00Z');
const client = { nome: 'Cliente', cognome: 'Test', email: 'cliente@example.com', whatsapp: '+390000000000' };

function reference(collection: string, id: string): any {
  return {
    id, collection,
    get: async () => ({
      exists: collection === 'bookingConfirmationJobs' ? h.confirmations.has(id) : collection === 'bookingManagementAccess' ? h.management.has(id) : collection !== 'bookings' || h.bookings.has(id),
      data: () => collection === 'bookingSlotLocks' ? h.guards.get(id) : collection === 'booking_campaigns' ? h.campaign
        : collection === 'clienti' ? { sourceRefs: { bookingIds: ['booking-1', 'booking-2', 'booking-3'] } }
        : collection === 'bookingConfirmationJobs' ? h.confirmations.get(id) : collection === 'bookingManagementAccess' ? h.management.get(id) : h.bookings.get(id),
    }),
    update: async (patch: any) => {
      if (patch.stato === 'confermata' && h.failSave) throw new Error('save failed');
      if (collection === 'bookings') Object.assign(h.bookings.get(id), patch);
    },
    delete: async () => { h.bookings.delete(id); },
  };
}
function collection(name: string, conditions: any[] = []): any {
  return {
    where: (field: string, operator: string, value: any) => collection(name, [...conditions, [field, operator, value]]),
    orderBy: () => collection(name, conditions),
    limit: () => collection(name, conditions),
    doc: (id?: string) => reference(name, id || `booking-${++h.sequence}`),
    add: async (data: any) => {
      const ref = reference(name, `booking-${++h.sequence}`);
      h.bookings.set(ref.id, { ...data });
      return ref;
    },
    get: async () => ({
      docs: (name === 'bookingCheckoutHolds' ? [] : [...h.bookings]).filter(([, data]) => conditions.every(([field, op, expected]) => {
        const actual = data[field]?.toDate?.().getTime() ?? data[field];
        const value = expected?.toDate?.().getTime() ?? expected;
        return op === '==' ? actual === value : op === '>=' ? actual >= value : actual <= value;
      })).map(([id, data]) => ({ id, ref: reference(name, id), data: () => data })),
    }),
  };
}

vi.mock('./firebase-admin.js', () => ({
  db: {
    collection: (name: string) => collection(name),
    runTransaction: async (fn: any) => {
      // Deterministic serialized fake: mirrors Firestore's serializable commit.
      const before = h.tail;
      let unlock!: () => void;
      h.tail = new Promise<void>(resolve => { unlock = resolve; });
      await before;
      const writes: (() => void)[] = [];
      try {
        const result = await fn({
          get: (target: any) => target.get(),
          set: (ref: any, data: any) => writes.push(() => (ref.collection === 'bookingSlotLocks' ? h.guards : ref.collection === 'bookingManagementAccess' ? h.management : h.bookings).set(ref.id, { ...data })),
          update: (ref: any, data: any) => writes.push(() => { if (ref.collection === 'bookings') Object.assign(h.bookings.get(ref.id), data); }),
        });
        writes.forEach(write => write());
        return result;
      } finally { unlock(); }
    },
  },
  FieldValue: { serverTimestamp: () => 'server-time', arrayUnion: (...values: any[]) => values },
}));
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { fromDate: (date: Date) => stamp(date), now: () => stamp(new Date()) },
  FieldValue: { serverTimestamp: () => 'server-time' },
}));
vi.mock('./google-calendar.js', () => ({
  getAvailableSlots: vi.fn(), deleteEvent: h.deleteEvent, createEvent: h.createEvent,
  checkFreeBusy: async () => [], getEventById: vi.fn(), resolveCalendarId: () => 'primary',
}));
vi.mock('./booking/calendar-adapter.js', () => ({
  validateCampaign: () => true,
  campaignToAvailabilityConfig: (campaign: any) => ({ duration: campaign.durataShootingMinuti }),
  getAllExistingBookingEvents: h.events,
}));
vi.mock('./calendar-engine/index.js', () => ({ getAvailableSlotsForDate: h.slots }));
// Ricontrollo di Google subito prima di creare l'evento (confirmPublicBooking).
vi.mock('./calendar-engine/google-sync.js', () => ({ checkGoogleCalendarBusyPeriods: async () => h.googleBusy }));
// Gli avvisi all'admin sono asincroni (import dinamico): senza questo mock l'email di avviso
// "evento orfano" finirebbe nei contatori di sendEmail dei test successivi.
vi.mock('./system-alerts.js', () => ({ notifyOrphanCalendarEvents: h.orphanAlert, notifyCalendarUnavailable: vi.fn() }));
// Cassa dell'acconto delle prenotazioni manuali (testata a parte in booking/manual-booking-deposit.test.ts).
vi.mock('./booking/manual-booking-deposit.js', () => ({ registerManualBookingDeposit: h.manualDeposit }));
vi.mock('./lib/logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('./gift-cards/service.js', () => ({
  GiftCardHttpError: class extends Error {},
  GiftCardService: class {
    claimForBooking = h.claimGift;
    attachBooking = h.attachGift;
    releaseClaim = h.releaseGift;
  },
}));
vi.mock('./email-routes.js', () => ({
  authenticateFirebase: (req: any, res: any, next: any) => {
    if (req.headers.authorization !== 'Bearer admin') return res.status(401).json({ error: 'Non autorizzato' });
    req.user = { uid: 'admin-test', email: 'gennaro.mazzacane@gmail.com' };
    next();
  },
  sendGmailEmail: h.sendEmail,
  createBookingReceivedEmailHTML: h.received,
  createBookingConfirmedEmailHTML: h.confirmed,
  createAdminNotificationEmailHTML: h.admin,
  generateGoogleCalendarLink: h.calendarLink,
  getStudioContactInfo: async () => ({ name: 'Studio', email: 'studio@example.com', phone: '+390000000000', address: 'Studio' }),
}));

const { default: router } = await import('./booking-routes.js');
const app = express();
app.use(express.json());
app.use('/api/booking', router);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/booking`;
afterAll(() => { server.close(); vi.unstubAllEnvs(); });
function request(patch: any = {}, route = '/v2/create', admin = false) {
  return fetch(`${base}${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer admin' } : {}) },
    body: JSON.stringify({ campaignId: 'campaign', cliente: client, dataShootingInizio: start.toISOString(), dataShootingFine: end.toISOString(), ...patch }),
  });
}
function firstBooking(): any { return [...h.bookings.values()][0]; }
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SESSION_SECRET', 'booking-creation-test-key-not-a-real-secret');
  h.management.clear();
  h.confirmations.clear();
  h.bookings.clear(); h.guards.clear(); h.sequence = 0; h.failSave = false; h.trace = []; h.tail = Promise.resolve();
  h.campaign = {
    nome: 'Campagna test', attiva: true, dataInizio: stamp('2030-12-01'), dataFine: stamp('2030-12-31'),
    orarioApertura: '09:00', orarioPausaInizio: '13:00', orarioPausaFine: '14:00',
    orarioChiusura: '19:00', durataShootingMinuti: 30, prodottiDisponibili: [],
  };
  h.events.mockResolvedValue([]);
  h.googleBusy = [];
  h.orphanAlert.mockReset();
  h.manualDeposit.mockReset().mockResolvedValue(true);
  h.available = [{ start, end }];
  h.slots.mockImplementation(async () => h.available);
  h.createEvent.mockImplementation(async () => { h.trace.push('calendar'); return { id: 'event-test' }; });
  h.deleteEvent.mockResolvedValue(undefined);
  h.received.mockReturnValue('received-html');
  h.confirmed.mockReturnValue('confirmed-html');
  h.admin.mockReturnValue('admin-html');
  h.calendarLink.mockReturnValue('https://calendar.google.com/calendar/render?test=1');
  h.sendEmail.mockImplementation(async () => { h.trace.push('email'); });
  h.claimGift.mockResolvedValue({ code: 'GIFT-TEST', title: 'Regalo', typeName: 'Shooting', valueCents: 7500 });
  h.attachGift.mockResolvedValue(undefined);
  h.releaseGift.mockResolvedValue(undefined);
});

describe('creazione pubblica senza acconto', () => {
  it('does not duplicate a final confirmation already queued for delivery', async () => {
    h.bookings.set('booking-one', { stato: 'confermata', cliente: client, campaignId: 'campaign',
      dataShootingInizio: stamp(start), dataShootingFine: stamp(end) });
    h.confirmations.set('booking-one', { status: 'pending' });
    const response = await fetch(`${base}/resend-confirmation-emails`, {
      method: 'POST', headers: { Authorization: 'Bearer admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 1 }),
    });
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).toContain('già in coda');
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
  it.each(['/v2/create', '/create'])('mantiene le campagne legacy in attesa tramite %s', async route => {
    const response = await request({ stato: 'confermata', richiedeApprovazione: false }, route);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ stato: 'in_attesa' });
    expect(firstBooking()).toMatchObject({ stato: 'in_attesa', emailRicevutaInviata: true, emailConfermataInviata: false });
    expect(h.createEvent).not.toHaveBeenCalled();
    expect(h.received).toHaveBeenCalledOnce();
    expect(h.confirmed).not.toHaveBeenCalled();
    expect(h.sendEmail).toHaveBeenCalledTimes(2);
    expect(h.admin.mock.calls[0].at(-1)).toBe(false);
  });

  it('mantiene la richiesta manuale e consente la successiva approvazione admin', async () => {
    h.campaign.richiedeApprovazione = true;
    h.campaign.richiedeAcconto = false;
    const response = await request();
    const { bookingId } = await response.json() as { bookingId: string };
    const approval = await fetch(`${base}/v2/${bookingId}/approve`, { method: 'PATCH', headers: { Authorization: 'Bearer admin' } });
    expect(approval.status).toBe(200);
    expect(firstBooking()).toMatchObject({ stato: 'confermata', googleCalendarEventId: 'event-test', confermataDa: 'admin-test' });
    expect(h.confirmed).toHaveBeenCalledOnce();
  });

  it.each(['/v2/create', '/create'])('conferma dalla policy server, calendario prima delle email: %s', async route => {
    h.campaign.richiedeApprovazione = false;
    h.campaign.richiedeAcconto = false;
    const response = await request({ richiedeApprovazione: true, richiedeAcconto: true, stato: 'in_attesa' }, route);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ stato: 'confermata' });
    expect(firstBooking()).toMatchObject({
      stato: 'confermata', googleCalendarEventId: 'event-test', confermataDa: 'sistema',
      emailRicevutaInviata: false, emailConfermataInviata: true, prodottoId: null, prodotti: null,
    });
    expect(h.trace).toEqual(['calendar', 'email', 'email']);
    expect(h.received).not.toHaveBeenCalled();
    expect(h.confirmed.mock.calls[0][8]).toContain('calendar.google.com');
    expect(h.confirmed.mock.calls[0][10]).toMatch(/^https:\/\/imagestudiofotografico\.com\/prenota\/gestisci\/booking-\d+#[a-f0-9]{64}$/);
    expect(h.management.size).toBe(1);
    expect(h.admin.mock.calls[0].at(-1)).toBe(true);
  });

  it.each(['/v2/create', '/create'])('non permette di saltare il checkout immediato tramite %s', async route => {
    Object.assign(h.campaign, { richiedeApprovazione: false, richiedeAcconto: true, accontoImportoCentesimi: 2000 });
    const response = await request({ richiedeAcconto: false, accontoImportoCentesimi: 0 }, route);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'CHECKOUT_REQUIRED', checkoutPath: '/api/booking/v2/checkout-holds' });
    expect(h.bookings.size).toBe(0); // No permanent unpaid reservation left occupying the slot.
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.claimGift).not.toHaveBeenCalled();
    expect(h.createEvent).not.toHaveBeenCalled();
  });

  describe('gift card su una campagna con acconto immediato', () => {
    beforeEach(() => {
      Object.assign(h.campaign, { richiedeApprovazione: false, richiedeAcconto: true, accontoImportoCentesimi: 2000 });
    });

    it.each(['/v2/create', '/create'])('una gift card valida sostituisce l’acconto: prenotazione confermata senza PayPal (%s)', async route => {
      const response = await request({ giftCardCode: 'GIFT-TEST' }, route);
      expect(response.status).toBe(201);
      expect(firstBooking()).toMatchObject({ stato: 'confermata', acconto: 75, saldo: 0, giftCard: { code: 'GIFT-TEST' } });
      expect(h.claimGift).toHaveBeenCalledWith('GIFT-TEST', 'campaign');
      expect(h.createEvent).toHaveBeenCalledOnce();
      expect(h.attachGift).toHaveBeenCalledWith('GIFT-TEST', expect.objectContaining({ id: 'booking-1' }));
      expect(h.releaseGift).not.toHaveBeenCalled();
    });

    it('se la gift card non copre l’acconto non crea nulla e libera la card', async () => {
      h.campaign.accontoImportoCentesimi = 9000; // la card vale 75 euro
      const response = await request({ giftCardCode: 'GIFT-TEST' });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'gift_card_below_deposit' });
      expect(h.releaseGift).toHaveBeenCalledWith('GIFT-TEST');
      expect(h.bookings.size).toBe(0);
      expect(h.createEvent).not.toHaveBeenCalled();
      expect(h.sendEmail).not.toHaveBeenCalled();
    });

    it('un codice non valido o già usato non salta il pagamento: nessuna prenotazione', async () => {
      h.claimGift.mockRejectedValue(Object.assign(new GiftCardHttpError('Questa gift card è già stata usata'), { status: 409, code: 'gift_card_unusable' }));
      const response = await request({ giftCardCode: 'GIFT-USATA' });
      expect(response.status).toBe(409);
      expect(h.bookings.size).toBe(0);
      expect(h.createEvent).not.toHaveBeenCalled();
      expect(h.attachGift).not.toHaveBeenCalled();
    });

    it('un codice vuoto equivale a nessun codice: serve il checkout', async () => {
      const response = await request({ giftCardCode: '   ' });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'CHECKOUT_REQUIRED' });
      expect(h.claimGift).not.toHaveBeenCalled();
    });
  });

  it('mantiene il percorso con approvazione prima dell’acconto', async () => {
    Object.assign(h.campaign, { richiedeApprovazione: true, richiedeAcconto: true, accontoImportoCentesimi: 2000 });
    const response = await request();
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ stato: 'in_attesa' });
    expect(h.createEvent).not.toHaveBeenCalled();
  });

  it.each([true, false])('rifiuta slot non disponibili con approvazione=%s', async approval => {
    h.campaign.richiedeApprovazione = approval;
    h.available = [];
    expect((await request()).status).toBe(409);
    expect(h.bookings.size).toBe(0);
    expect(h.createEvent).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('rifiuta il conflitto Firestore anche se l’anteprima dello slot è obsoleta', async () => {
    h.campaign.richiedeApprovazione = false;
    h.bookings.set('other-campaign', { campaignId: 'different', stato: 'confermata', dataShootingInizio: stamp(start), dataShootingFine: stamp(end) });
    expect((await request()).status).toBe(409);
    expect(h.bookings.size).toBe(1);
    expect(h.createEvent).not.toHaveBeenCalled();
  });

  it('una coppia di richieste concorrenti non conferma due volte lo stesso slot', async () => {
    h.campaign.richiedeApprovazione = false;
    const responses = await Promise.all([request(), request()]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(h.bookings.size).toBe(1);
    expect(h.createEvent).toHaveBeenCalledOnce();
    expect(h.confirmed).toHaveBeenCalledOnce();
  });

  it.each([true, false])('conserva il riscatto gift card con approvazione=%s', async approval => {
    h.campaign.richiedeApprovazione = approval;
    const response = await request({ giftCardCode: 'GIFT-TEST' });
    expect(response.status).toBe(201);
    expect(firstBooking()).toMatchObject({ stato: approval ? 'in_attesa' : 'confermata', acconto: 75, saldo: 0, giftCard: { code: 'GIFT-TEST' } });
    expect(h.attachGift).toHaveBeenCalledWith('GIFT-TEST', expect.objectContaining({ id: 'booking-1' }));
    expect(h.releaseGift).not.toHaveBeenCalled();
  });

  it('rilascia la gift card se la riserva trova un conflitto', async () => {
    h.bookings.set('existing', { stato: 'in_attesa', dataShootingInizio: stamp(start), dataShootingFine: stamp(end) });
    expect((await request({ giftCardCode: 'GIFT-TEST' })).status).toBe(409);
    expect(h.releaseGift).toHaveBeenCalledWith('GIFT-TEST');
    expect(h.attachGift).not.toHaveBeenCalled();
  });

  it('non invia conferme se Calendar fallisce e trattiene la riserva per riconciliazione', async () => {
    h.campaign.richiedeApprovazione = false;
    h.createEvent.mockRejectedValueOnce(new Error('Calendar timeout'));
    expect((await request()).status).toBe(503);
    expect(firstBooking()).toMatchObject({ stato: 'in_attesa', automaticConfirmationError: true, emailConfermataInviata: false });
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('se un impegno Google compare dopo la riserva non crea l’evento, libera lo slot e risponde 409', async () => {
    h.campaign.richiedeApprovazione = false;
    h.googleBusy = [{ start: new Date(start.getTime() + 15 * 60_000), end: new Date(end.getTime() + 15 * 60_000) }];
    const response = await request({ giftCardCode: 'GIFT-TEST' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'AUTOMATIC_CONFIRMATION_FAILED' });
    expect(h.createEvent).not.toHaveBeenCalled();
    expect(h.bookings.size).toBe(0);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.releaseGift).toHaveBeenCalledWith('GIFT-TEST');
  });

  it('se Calendar non è leggibile risponde 503 senza salvare né inviare email', async () => {
    h.campaign.richiedeApprovazione = false;
    h.events.mockRejectedValueOnce(Object.assign(new Error('CALENDAR_UNAVAILABLE'), { code: 'CALENDAR_UNAVAILABLE' }));
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'CALENDAR_UNAVAILABLE' });
    expect(h.bookings.size).toBe(0);
    expect(h.createEvent).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('annulla l’evento e rilascia la gift card se fallisce il salvataggio della conferma', async () => {
    h.campaign.richiedeApprovazione = false; h.failSave = true;
    expect((await request({ giftCardCode: 'GIFT-TEST' })).status).toBe(500);
    expect(h.deleteEvent).toHaveBeenCalledWith('primary', 'event-test');
    expect(h.bookings.size).toBe(0);
    expect(h.releaseGift).toHaveBeenCalledWith('GIFT-TEST');
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('non riapre lo slot se non riesce ad annullare l’evento Google', async () => {
    h.campaign.richiedeApprovazione = false; h.failSave = true;
    h.deleteEvent.mockRejectedValueOnce(new Error('cleanup failed'));
    expect((await request()).status).toBe(500);
    expect(firstBooking()).toMatchObject({ stato: 'in_attesa', automaticConfirmationError: true, googleCalendarEventId: 'event-test' });
    expect(h.sendEmail).not.toHaveBeenCalled();
    // L'evento che non si e' riusciti a rimuovere viene segnalato all'admin.
    await vi.waitFor(() => expect(h.orphanAlert).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'event-test', kind: 'booking' }),
    ]));
  });

  it('un errore email non annulla un evento già confermato e non imposta il flag di invio', async () => {
    h.campaign.richiedeApprovazione = false;
    h.sendEmail.mockRejectedValueOnce(new Error('mail unavailable'));
    expect((await request()).status).toBe(201);
    expect(firstBooking()).toMatchObject({ stato: 'confermata', emailConfermataInviata: false });
    expect(h.deleteEvent).not.toHaveBeenCalled();
  });

  it.each([
    { dataShootingFine: start.toISOString() },
    { dataShootingInizio: '2031-01-10T09:00:00Z', dataShootingFine: '2031-01-10T09:30:00Z' },
    { dataShootingInizio: '2020-12-10T09:00:00Z', dataShootingFine: '2020-12-10T09:30:00Z' },
  ])('rifiuta intervalli invalidi o fuori campagna', async patch => {
    expect((await request(patch)).status).toBe(400);
    expect(h.bookings.size).toBe(0);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('preserva la prenotazione manuale autenticata, incluse le cifre di pagamento', async () => {
    Object.assign(h.campaign, { richiedeApprovazione: false, richiedeAcconto: true, accontoImportoCentesimi: 2000 });
    h.available = [];
    const response = await request({ isManual: true, totale: 100, acconto: 20, metodoPagamento: 'contante' }, '/v2/create', true);
    expect(response.status).toBe(201);
    expect(firstBooking()).toMatchObject({ stato: 'confermata', isManual: true, createdByAdmin: 'admin-test', totale: 100, acconto: 20, saldo: 80 });
    expect(h.slots).not.toHaveBeenCalled();
    // L'acconto della prenotazione manuale entra in cassa (ricevuta + movimento).
    expect(h.manualDeposit).toHaveBeenCalledTimes(1);
    expect(h.manualDeposit).toHaveBeenCalledWith(expect.anything(), 'booking-1', 'admin-test');
  });

  it('prenotazione manuale senza acconto: nessuna registrazione di cassa', async () => {
    Object.assign(h.campaign, { richiedeApprovazione: false });
    h.available = [];
    const response = await request({ isManual: true, totale: 100, acconto: 0 }, '/v2/create', true);
    expect(response.status).toBe(201);
    expect(h.manualDeposit).not.toHaveBeenCalled();
  });

  it('se la registrazione di cassa fallisce la prenotazione resta creata e viene avvisato l\'admin', async () => {
    h.manualDeposit.mockRejectedValueOnce(new Error('Firestore non disponibile'));
    Object.assign(h.campaign, { richiedeApprovazione: false });
    h.available = [];
    const response = await request({ isManual: true, totale: 100, acconto: 20, metodoPagamento: 'contante' }, '/v2/create', true);
    expect(response.status).toBe(201);
    expect(firstBooking()).toMatchObject({ stato: 'confermata', acconto: 20 });
    expect(await response.json()).toMatchObject({ depositCashRecorded: false });
  });

  it('prenotazione pubblica: nessuna registrazione di cassa manuale', async () => {
    Object.assign(h.campaign, { richiedeApprovazione: true });
    await request({});
    expect(h.manualDeposit).not.toHaveBeenCalled();
  });

  it('il template reale informa l’admin se la prenotazione è già confermata', async () => {
    const { createAdminNotificationEmailHTML } = await vi.importActual<typeof import('./email-routes.js')>('./email-routes.js');
    const args = ['Cliente Test', 'cliente@example.com', '+390000000000', 'Campagna', '10 dicembre', '10:00'] as const;
    const pending = createAdminNotificationEmailHTML(...args);
    const confirmed = createAdminNotificationEmailHTML(...args, undefined, undefined, undefined, undefined, true);
    expect(pending).toContain('attende la tua approvazione');
    expect(confirmed).toContain('Non serve approvarla');
    expect(confirmed).not.toContain('attende la tua approvazione');
  });
});
