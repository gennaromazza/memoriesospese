import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
import { expireBookingPayments } from './payment-expiry.js';
import { createApprovedDepositRequest } from './payment-deadlines.js';
import { RECOVERY_JOBS, RECOVERY_DELAY_MS as hour } from './recovery-queue.js';
import { deliverBookingRecovery, startBookingRecoveryWorker } from './recovery-delivery.js';
import { bookingRecoveryEmail } from './recovery-email.js';

const providers = vi.hoisted(() => ({ studio: vi.fn(), send: vi.fn() }));
vi.mock('../email-routes.js', () => ({ getStudioContactInfo: providers.studio, sendGmailEmail: providers.send }));
vi.mock('../lib/logger.js', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
const initial = Date.parse('2030-12-10T08:00:00Z');
let now = initial, store: ReturnType<typeof reservationDb>;
const stamp = (ms: number) => Timestamp.fromMillis(ms);
const studio = { name: 'Studio Test', email: 'studio@example.test', phone: '+39 1234567', address: 'Via Test 1' };
const customer = { nome: 'Cliente', email: 'CLIENTE@example.test', whatsapp: '+39 3456789000' };
const campaign = () => ({ nome: 'Natale', code: 'NATALE', attiva: true, richiedeAcconto: true,
  emailRecuperoAcconto: true, recuperoAccontoAttivatoIl: stamp(initial - hour),
  dataFine: stamp(initial + hour * 72) });
const hold = () => ({ bookingId: 'one', campaignId: 'campaign', status: 'active',
  expiresAt: stamp(initial), draft: { cliente: customer }, dataShootingInizio: stamp(initial + hour * 5) });
const root = () => ({ campaignId: 'campaign', stato: 'in_attesa', cliente: customer, acconto: 0,
  depositPaymentRequest: createApprovedDepositRequest(500, new Date(initial + hour * 5), initial - hour) });
const deps = () => ({ studio: providers.studio, send: providers.send });
const value = (id = 'one') => store.value(`${RECOVERY_JOBS}/${id}`);
async function expired(id = 'one', source: 'root' | 'hold' | 'both' = 'root') {
  if (source !== 'hold') store.seed(`bookings/${id}`, root());
  if (source !== 'root') store.seed(`bookingCheckoutHolds/${id}`, { ...hold(), bookingId: id });
  await expireBookingPayments(store.db);
}
beforeEach(() => {
  now = initial; vi.spyOn(Date, 'now').mockImplementation(() => now);
  store = reservationDb(); store.seed('booking_campaigns/campaign', campaign());
  providers.studio.mockReset().mockResolvedValue(studio); providers.send.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const send = (id = 'one') => deliverBookingRecovery(store.db, id, deps());

describe('attivazione e programmazione del recupero', () => {
  it.each(['root', 'hold', 'both'] as const)('accoda solo una volta dalla scadenza %s, senza inviare subito', async source => {
    await expired('one', source);
    await expireBookingPayments(store.db);
    expect(value()).toMatchObject({ status: 'pending', attempts: 0, notBefore: stamp(initial + hour) });
    expect([...store.rows.keys()].filter(key => key.startsWith(`${RECOVERY_JOBS}/`))).toHaveLength(1);
    expect(providers.send).not.toHaveBeenCalled();
  });
  it.each([undefined, false])('nessun recupero con opzione %s nelle campagne esistenti', async enabled => {
    const config: any = campaign(); if (enabled === undefined) delete config.emailRecuperoAcconto; else config.emailRecuperoAcconto = enabled;
    store.seed('booking_campaigns/campaign', config); await expired();
    expect(value()).toBeUndefined();
  });
  it('non recupera le scadenze precedenti all’attivazione', async () => {
    store.seed('booking_campaigns/campaign', { ...campaign(), recuperoAccontoAttivatoIl: stamp(initial + 1) });
    await expired(); expect(value()).toBeUndefined();
  });
  it('non accoda prenotazioni annullate per altri motivi', async () => {
    store.seed('bookings/one', { ...root(), stato: 'annullata' });
    await expireBookingPayments(store.db); expect(value()).toBeUndefined();
  });
  it('non accoda un checkout abbandonato esplicitamente dal cliente', async () => {
    store.seed('bookingCheckoutHolds/one', { ...hold(), status: 'cancelled' });
    await expireBookingPayments(store.db); expect(value()).toBeUndefined();
  });
  it('non accoda in presenza di incasso o richiesta da riconciliare', async () => {
    store.seed('bookings/one', { ...root(), depositPayment: { status: 'paid_action_required' } });
    await expireBookingPayments(store.db); expect(value()).toBeUndefined();
  });
});

describe('invio singolo dopo un’ora, con ricontrollo dei dati', () => {
  it('non invia prima dell’ora e invia una sola volta esattamente al confine', async () => {
    await expired(); now = initial + hour - 1; await send();
    expect(providers.send).not.toHaveBeenCalled();
    now++; await Promise.all([send(), send()]); await send();
    expect(providers.send).toHaveBeenCalledExactlyOnceWith('cliente@example.test',
      'La tua richiesta per Natale è scaduta', expect.stringContaining('/prenota/NATALE'), 'one');
    expect(value().status).toBe('sent');
    expect(store.value('bookings/one').stato).toBe('annullata');
    expect([...store.rows.keys()].some(path => /^(cash|orders|transactions)/.test(path))).toBe(false);
  });
  it('funziona anche per il pagamento immediato senza documento prenotazione', async () => {
    await expired('one', 'hold'); now += hour; await send();
    expect(providers.send).toHaveBeenCalledOnce();
    expect(store.value('bookings/one')).toBeUndefined();
  });
  it('deduplica due richieste scadute dello stesso indirizzo nella stessa campagna', async () => {
    await expired('one'); await expired('two');
    now += hour; await Promise.all([send('one'), send('two')]);
    expect(providers.send).toHaveBeenCalledOnce();
    expect([value('one').status, value('two').status].sort()).toEqual(['sent', 'skipped']);
  });
  it.each(['flag', 'active', 'end', 'deleted'] as const)('non invia se la campagna cambia: %s', async change => {
    await expired(); now += hour;
    const config = campaign();
    if (change === 'flag') config.emailRecuperoAcconto = false;
    if (change === 'active') config.attiva = false;
    if (change === 'end') config.dataFine = stamp(initial - 24 * hour);
    if (change === 'deleted') await store.db.collection('booking_campaigns').doc('campaign').delete();
    else store.seed('booking_campaigns/campaign', config);
    await send(); expect(value().status).toBe('skipped'); expect(providers.send).not.toHaveBeenCalled();
  });
  it('la campagna resta aperta durante tutto il giorno finale in Italia', async () => {
    store.seed('booking_campaigns/campaign', { ...campaign(), dataFine: stamp(Date.parse('2030-12-10T00:00:00Z')) });
    await expired(); now += hour; await send(); expect(providers.send).toHaveBeenCalledOnce();
  });
  it.each(['confermata', 'in_attesa', 'completata'])('non contatta chi ha riprenotato: %s', async stato => {
    await expired(); now += hour;
    store.seed('bookings/another', { ...root(), stato, cliente: { ...customer, email: 'cliente@example.test' },
      depositPaymentRequest: undefined });
    await send(); expect(providers.send).not.toHaveBeenCalled(); expect(value().status).toBe('skipped');
  });
  it('non contatta chi ha iniziato un nuovo checkout ancora valido', async () => {
    await expired(); now += hour;
    store.seed('bookingCheckoutHolds/new', { ...hold(), bookingId: 'new', expiresAt: stamp(now + hour) });
    await send(); expect(providers.send).not.toHaveBeenCalled();
  });
  it.each(['receipt', 'capture', 'waiver', 'review'])('blocca il recupero con stato finanziario %s', async change => {
    await expired('one', 'both'); now += hour;
    const path = change === 'capture' ? 'bookingCheckoutHolds/one' : 'bookings/one';
    const patch = change === 'receipt' ? { depositPayment: { status: 'paid', paypalCaptureId: 'CAPTURE' } }
      : change === 'capture' ? { paypalCaptureAttempt: { state: 'started' } }
        : change === 'waiver' ? { depositWaiver: { reason: 'admin_status_confirmation' } } : { paymentReviewRequired: true };
    store.seed(path, { ...store.value(path), ...patch }); await send();
    expect(providers.send).not.toHaveBeenCalled();
  });
  it.each(['payment', 'new_booking', 'disabled', 'email'])('rilegge le modifiche avvenute durante la preparazione: %s', async change => {
    await expired(); now += hour;
    providers.studio.mockImplementationOnce(async () => {
      if (change === 'payment') store.seed('bookings/one', { ...store.value('bookings/one'), depositPayment: { status: 'paid' } });
      if (change === 'new_booking') store.seed('bookings/new', { ...root(), stato: 'confermata' });
      if (change === 'disabled') store.seed('booking_campaigns/campaign', { ...campaign(), emailRecuperoAcconto: false });
      if (change === 'email') store.seed('bookings/one', { ...store.value('bookings/one'), cliente: { ...customer, email: 'new@example.test' } });
      return studio;
    });
    await send(); expect(providers.send).not.toHaveBeenCalled(); expect(value().status).toBe('skipped');
  });
  it('non invia se il controllo viene ripreso oltre ventiquattr’ore dopo la scadenza', async () => {
    await expired(); now += hour * 25; await send(); expect(value().status).toBe('skipped');
    expect(providers.send).not.toHaveBeenCalled();
  });
  it('in attesa della pulizia della prenotazione non manda un messaggio prematuro', async () => {
    await expired('one', 'both'); now += hour; store.seed('bookings/one', root());
    await send(); expect(value().status).toBe('pending'); expect(providers.send).not.toHaveBeenCalled();
    await expireBookingPayments(store.db); await send(); expect(providers.send).toHaveBeenCalledOnce();
  });
});

describe('errori e ripartenze senza duplicare email', () => {
  it('un timeout del provider resta incerto e non viene ripetuto, nemmeno da un altro checkout', async () => {
    await expired(); await expired('two'); now += hour;
    providers.send.mockRejectedValueOnce(new Error('timeout'));
    await send(); await send(); await send('two');
    expect(value().status).toBe('unknown'); expect(providers.send).toHaveBeenCalledOnce();
    expect(value('two').status).toBe('skipped');
  });
  it('il fallimento della scrittura dopo l’invio non causa un secondo invio', async () => {
    await expired(); now += hour;
    const run = store.db.runTransaction.bind(store.db);
    let sent = false, broken = false;
    providers.send.mockImplementationOnce(async () => { sent = true; });
    vi.spyOn(store.db, 'runTransaction').mockImplementation((async (fn: any) => {
      if (sent && !broken) { broken = true; throw new Error('write failed'); }
      return run(fn);
    }) as typeof store.db.runTransaction);
    await send(); await send();
    expect(value().status).toBe('unknown'); expect(providers.send).toHaveBeenCalledOnce();
  });
  it('non ripete un invio interrotto da un riavvio del server', async () => {
    await expired(); now += hour;
    store.seed(`${RECOVERY_JOBS}/one`, { ...value(), status: 'sending', leaseUntil: stamp(now - 1) });
    await send(); expect(value().status).toBe('unknown'); expect(providers.send).not.toHaveBeenCalled();
  });
  it('riprova al massimo tre volte la sola preparazione, mai l’invio', async () => {
    await expired(); now += hour;
    providers.studio.mockRejectedValue(new Error('settings unavailable'));
    for (let i = 0; i < 4; i++) { await send(); now += 60_000; }
    expect(providers.studio).toHaveBeenCalledTimes(3);
    expect(value().status).toBe('failed'); expect(providers.send).not.toHaveBeenCalled();
  });
  it('il worker supera le pagine non ancora dovute e si ferma allo shutdown', async () => {
    await expired('zzz'); now += hour;
    for (let i = 0; i < 20; i++) store.seed(`${RECOVERY_JOBS}/aaa-${String(i).padStart(2, '0')}`,
      { status: 'pending', deadline: stamp(now + hour), notBefore: stamp(now + 2 * hour) });
    vi.useFakeTimers(); const stop = startBookingRecoveryWorker(store.db, 1000);
    await vi.advanceTimersByTimeAsync(1000); expect(providers.send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000); expect(providers.send).toHaveBeenCalledOnce();
    stop(); const access = vi.spyOn(store.db, 'collection');
    await vi.advanceTimersByTimeAsync(3000); expect(access).not.toHaveBeenCalled();
  });
});

it('il testo usa solo il link pubblico della campagna, sfugge HTML e include l’avviso automatico e i recapiti', () => {
  const email = bookingRecoveryEmail('<Cliente>', 'Natale & foto', 'NATALE', studio);
  expect(email.html).toContain('https://imagestudiofotografico.com/prenota/NATALE');
  expect(email.html).not.toContain('/prenota/acconto/');
  expect(email.html).toContain('&lt;Cliente&gt;'); expect(email.html).toContain('Natale &amp; foto');
  expect(email.html).toContain('non è più riservato'); expect(email.html).toContain('Non rispondere');
  for (const value of Object.values(studio)) expect(email.html).toContain(value);
});
