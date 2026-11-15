import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { reservationDb } from './test-helpers/reservation-db.js';

const h = vi.hoisted(() => ({ events: vi.fn(), slots: vi.fn() }));
vi.mock('./calendar-adapter.js', () => ({
  validateCampaign: () => true, campaignToAvailabilityConfig: () => ({}),
  getAllExistingBookingEvents: h.events,
}));
vi.mock('../calendar-engine/index.js', () => ({ getAvailableSlotsForDate: h.slots }));
vi.mock('../google-calendar.js', () => ({ createEvent: vi.fn(), deleteEvent: vi.fn() }));
import { createCheckoutHold, resumeCheckoutHold, releaseCheckoutHold, CHECKOUT_HOLD_MS } from './checkout-holds.js';
import { CHECKOUT_HOLDS, loadCheckoutHoldEvents } from './slot-reservations.js';
import { reservePublicBooking } from './public-creation.js';
import { checkoutHoldRouter } from './checkout-hold-routes.js';

const now = new Date('2030-12-10T08:00:00Z').getTime();
const start = new Date('2030-12-10T09:00:00Z'), end = new Date('2030-12-10T09:30:00Z');
const input = {
  campaignId: 'campaign-a', cliente: { nome: 'Cliente', cognome: 'Test', email: 'cliente@example.com', whatsapp: '+390000000000' },
  dataShootingInizio: start, dataShootingFine: end,
};
const stamp = (date: Date) => Timestamp.fromDate(date);
const campaign = {
  attiva: true, richiedeApprovazione: false, richiedeAcconto: true, accontoImportoCentesimi: 2000,
  dataInizio: stamp(new Date('2030-12-10T00:00:00Z')), dataFine: stamp(new Date('2030-12-11T00:00:00Z')),
  prodottiDisponibili: ['product'], orarioApertura: '09:00', orarioPausaInizio: '13:00', orarioPausaFine: '14:00',
  orarioChiusura: '18:00', durataShootingMinuti: 30,
};
let store: ReturnType<typeof reservationDb>;
beforeEach(() => {
  store = reservationDb();
  store.seed('booking_campaigns/campaign-a', campaign);
  store.seed('booking_campaigns/campaign-b', campaign);
  vi.spyOn(Date, 'now').mockReturnValue(now);
  h.events.mockReset().mockResolvedValue([]);
  h.slots.mockReset().mockResolvedValue([{ start, end }]);
});
afterEach(() => vi.restoreAllMocks());

it.each(['capturing', 'unknown'])('non libera prematuramente un incasso %s da un’altra scheda', async state => {
  const result = await createCheckoutHold(store.db, input);
  const path = `${CHECKOUT_HOLDS}/${result.bookingId}`;
  store.seed(path, { ...store.value(path), paypalCaptureAttempt: { state } });
  await expect(releaseCheckoutHold(store.db, result.bookingId, result.token)).rejects.toMatchObject({ status: 409 });
  expect(store.value(path).status).toBe('active');
  vi.mocked(Date.now).mockReturnValue(now + CHECKOUT_HOLD_MS);
  expect(await releaseCheckoutHold(store.db, result.bookingId, result.token)).toMatchObject({ status: 'expired' });
  expect(store.value(path).paypalCaptureAttempt.state).toBe(state);
});

it('consente di annullare dopo un rifiuto definitivo di PayPal, verificato dal server', async () => {
  const result = await createCheckoutHold(store.db, input);
  const path = `${CHECKOUT_HOLDS}/${result.bookingId}`;
  store.seed(path, { ...store.value(path), paypalCaptureAttempt: { state: 'declined' } });
  expect(await releaseCheckoutHold(store.db, result.bookingId, result.token)).toMatchObject({ status: 'cancelled' });
  expect(store.value(path).status).toBe('cancelled');
});

describe('riserve checkout immediate', () => {
  it('salva una bozza privata e l’importo della campagna, anche scegliendo i prodotti in studio', async () => {
    const hold = await createCheckoutHold(store.db, input);
    expect(hold.depositAmountCents).toBe(2000);
    expect(hold.expiresAt.getTime()).toBe(now + CHECKOUT_HOLD_MS);
    expect(store.value(`bookings/${hold.bookingId}`)).toBeUndefined();
    const data = store.value(`${CHECKOUT_HOLDS}/${hold.bookingId}`);
    expect(data).toMatchObject({ campaignId: 'campaign-a', bookingId: hold.bookingId, status: 'active',
      draft: { prodottoId: null, cliente: input.cliente } });
    expect(data.tokenHash).not.toBe(hold.token);
    expect(hold.token).toHaveLength(64);
    expect(hold).not.toHaveProperty('tokenHash');
    expect(hold).not.toHaveProperty('draft');
    expect(await loadCheckoutHoldEvents(store.db, start, end)).toHaveLength(1);
  });

  it('risolve la concorrenza anche con query inizialmente vuote e campagne diverse', async () => {
    const results = await Promise.allSettled([
      createCheckoutHold(store.db, input),
      createCheckoutHold(store.db, { ...input, campaignId: 'campaign-b' }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { message: 'Slot non più disponibile' } });
    expect(store.retries()).toBeGreaterThan(0);
    expect([...store.rows.keys()].filter(key => key.startsWith(`${CHECKOUT_HOLDS}/`))).toHaveLength(1);
  });

  it('impedisce a hold e prenotazione ordinaria di prenotare contemporaneamente lo stesso slot', async () => {
    const results = await Promise.allSettled([
      createCheckoutHold(store.db, input),
      reservePublicBooking(store.db, { stato: 'in_attesa', dataShootingInizio: stamp(start), dataShootingFine: stamp(end) }, start, end),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  });

  it('blocca anche gli overlap parziali ma lascia prenotare gli slot adiacenti', async () => {
    await createCheckoutHold(store.db, input);
    const overlapStart = new Date(start.getTime() + 15 * 60_000), overlapEnd = new Date(end.getTime() + 15 * 60_000);
    h.slots.mockResolvedValue([{ start: overlapStart, end: overlapEnd }]);
    await expect(createCheckoutHold(store.db, { ...input, dataShootingInizio: overlapStart, dataShootingFine: overlapEnd })).rejects.toThrow('Slot non più disponibile');
    const adjacentEnd = new Date(end.getTime() + 30 * 60_000);
    h.slots.mockResolvedValue([{ start: end, end: adjacentEnd }]);
    await expect(createCheckoutHold(store.db, { ...input, dataShootingInizio: end, dataShootingFine: adjacentEnd })).resolves.toHaveProperty('bookingId');
  });

  it('il refresh non rinnova il termine e allo scadere esatto lo slot torna disponibile', async () => {
    const hold = await createCheckoutHold(store.db, input);
    vi.mocked(Date.now).mockReturnValue(now + CHECKOUT_HOLD_MS - 1);
    expect((await resumeCheckoutHold(store.db, hold.bookingId, hold.token)).expiresAt).toEqual(hold.expiresAt);
    expect(await loadCheckoutHoldEvents(store.db, start, end)).toHaveLength(1);
    vi.mocked(Date.now).mockReturnValue(now + CHECKOUT_HOLD_MS);
    await expect(resumeCheckoutHold(store.db, hold.bookingId, hold.token)).rejects.toMatchObject({ status: 410 });
    expect(await loadCheckoutHoldEvents(store.db, start, end)).toHaveLength(0);
    const replacement = await createCheckoutHold(store.db, input);
    expect(replacement.bookingId).not.toBe(hold.bookingId);
    expect(replacement.expiresAt.getTime()).toBe(now + 2 * CHECKOUT_HOLD_MS);
    await expect(resumeCheckoutHold(store.db, hold.bookingId, hold.token)).rejects.toMatchObject({ status: 410 });
    expect((await releaseCheckoutHold(store.db, hold.bookingId, hold.token)).status).toBe('expired');
    expect((await resumeCheckoutHold(store.db, replacement.bookingId, replacement.token)).status).toBe('active');
  });

  it.each(['cancelled', 'payment_failed'] as const)('rilascia la riserva dopo %s, senza riattivarla al refresh', async reason => {
    const hold = await createCheckoutHold(store.db, input);
    expect(await releaseCheckoutHold(store.db, hold.bookingId, hold.token, reason)).toEqual({ bookingId: hold.bookingId, status: reason });
    expect(await releaseCheckoutHold(store.db, hold.bookingId, hold.token, reason)).toEqual({ bookingId: hold.bookingId, status: reason });
    expect(await loadCheckoutHoldEvents(store.db, start, end)).toHaveLength(0);
    await expect(resumeCheckoutHold(store.db, hold.bookingId, hold.token)).rejects.toMatchObject({ status: 409 });
    await expect(createCheckoutHold(store.db, input)).resolves.toHaveProperty('bookingId');
  });

  it('non rivela o rilascia riserve altrui e non annulla un checkout già consumato', async () => {
    const hold = await createCheckoutHold(store.db, input);
    await expect(releaseCheckoutHold(store.db, hold.bookingId, '0'.repeat(64))).rejects.toMatchObject({ status: 404 });
    await expect(resumeCheckoutHold(store.db, hold.bookingId, '0'.repeat(64))).rejects.toMatchObject({ status: 404 });
    store.seed(`${CHECKOUT_HOLDS}/${hold.bookingId}`, { ...store.value(`${CHECKOUT_HOLDS}/${hold.bookingId}`), status: 'consumed' });
    await expect(releaseCheckoutHold(store.db, hold.bookingId, hold.token)).rejects.toMatchObject({ status: 409 });
  });

  it.each([
    { richiedeApprovazione: true }, { richiedeAcconto: false }, { attiva: false },
    { accontoImportoCentesimi: 0 }, { accontoImportoCentesimi: 1.5 }, { richiedeApprovazione: undefined },
  ])('rifiuta configurazioni incompatibili: %j', async patch => {
    store.seed('booking_campaigns/campaign-a', { ...campaign, ...patch });
    await expect(createCheckoutHold(store.db, input)).rejects.toMatchObject({ status: 400 });
    expect([...store.rows.keys()].some(key => key.startsWith(`${CHECKOUT_HOLDS}/`))).toBe(false);
  });

  it('deriva il nome prodotto dal catalogo senza cambiare l’acconto', async () => {
    store.seed('products/product', { attivo: true, nome: 'Pacchetto reale', prezzoFinale: 500 });
    const hold = await createCheckoutHold(store.db, { ...input, prodottoId: 'product' });
    expect(hold.depositAmountCents).toBe(2000);
    expect(store.value(`${CHECKOUT_HOLDS}/${hold.bookingId}`).draft.prodottoNome).toBe('Pacchetto reale');
  });

  it('non scrive se il calendario non è leggibile o la campagna cambia durante il controllo', async () => {
    h.events.mockRejectedValueOnce(new Error('CALENDAR_UNAVAILABLE'));
    await expect(createCheckoutHold(store.db, input)).rejects.toThrow('CALENDAR_UNAVAILABLE');
    h.events.mockImplementationOnce(async () => {
      store.seed('booking_campaigns/campaign-a', { ...campaign, richiedeAcconto: false }); return [];
    });
    await expect(createCheckoutHold(store.db, input)).rejects.toMatchObject({ status: 409 });
    expect([...store.rows.keys()].some(key => key.startsWith(`${CHECKOUT_HOLDS}/`))).toBe(false);
  });
});

const app = express();
app.use(express.json());
app.use('/holds', (req, res, next) => checkoutHoldRouter(store.db)(req, res, next));
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/holds`;
afterAll(() => server.close());
const post = (path: string, body: any) => fetch(`${base}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
describe('contratto HTTP checkout', () => {
  it('crea, riprende e abbandona una riserva senza esporre dati privati', async () => {
    const response = await post('/', input);
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const hold = await response.json() as any;
    expect(hold.depositAmountCents).toBe(2000);
    const resumed = await post(`/${hold.bookingId}/resume`, { token: hold.token });
    expect(resumed.status).toBe(200);
    expect((await resumed.json() as any).expiresAt).toBe(hold.expiresAt);
    expect((await post(`/${hold.bookingId}/release`, { token: hold.token })).status).toBe(200);
    expect((await post(`/${hold.bookingId}/resume`, { token: hold.token })).status).toBe(409);
  });
  it('rifiuta importi e scadenze client-side, token invalidi e errori di disponibilità', async () => {
    expect((await post('/', { ...input, depositAmountCents: 1, expiresAt: '2099-01-01' })).status).toBe(400);
    expect((await post('/arbitrary/resume', { token: 'invalid' })).status).toBe(400);
    h.events.mockRejectedValueOnce(new Error('CALENDAR_UNAVAILABLE'));
    expect((await post('/', input)).status).toBe(503);
    expect([...store.rows.keys()].some(key => key.startsWith(`${CHECKOUT_HOLDS}/`))).toBe(false);
  });
});
