import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
import { approveBookingWithDeposit } from './approved-deposit-request.js';
import { deliverBookingDepositReminder, startBookingDepositReminderWorker } from './deposit-reminder-delivery.js';
import { DEPOSIT_REMINDER_JOBS, depositReminderJobId } from './deposit-reminder-queue.js';

const minute = 60_000, start = Date.parse('2030-12-10T08:00:00Z');
const id = 'booking', campaignId = 'NATALE';
const bk = `bookings/${id}`, hold = `bookingCheckoutHolds/${id}`, campaign = `booking_campaigns/${campaignId}`;
const job = (offset: number) => depositReminderJobId(id, offset);
const jobPath = (offset: number) => `${DEPOSIT_REMINDER_JOBS}/${job(offset)}`;
const stamp = (minutes: number) => Timestamp.fromMillis(start + minutes * minute);
let clock: number, store: ReturnType<typeof reservationDb>;
const signingKey = () => 'test-signing-key-with-at-least-32-characters';
const studio = vi.fn(async () => ({ name: 'Studio Test', email: 'studio@example.test', phone: '+39000000', address: '' }));
const send = vi.fn(async (_to: string, _subject: string, _html: string, _id: string) => {});
const initialSend = vi.fn(async (_to: string, _subject: string, _html: string, _id: string) => {});
const deps = { studio, send, signingKey };
const approve = () => approveBookingWithDeposit(store.db, id, 'admin', {
  signingKey, studio, send: initialSend, assertPayPalConfigured: () => {}, checkCalendar: async () => {},
});
const deliver = (offset: number) => deliverBookingDepositReminder(store.db, job(offset), deps);
const at = (minutes: number) => { clock = start + minutes * minute; };
const patch = (path: string, fields: Record<string, unknown>) => store.seed(path, { ...store.value(path), ...fields });

beforeEach(() => {
  at(0); vi.spyOn(Date, 'now').mockImplementation(() => clock);
  store = reservationDb();
  send.mockClear(); initialSend.mockClear(); studio.mockClear();
  store.seed(campaign, { attiva: true, richiedeAcconto: true, accontoImportoCentesimi: 1500, nome: 'Natale' });
  store.seed(bk, { campaignId, stato: 'in_attesa', acconto: 0,
    cliente: { nome: 'Test', email: 'test@example.test' },
    dataShootingInizio: stamp(180), dataShootingFine: stamp(210) });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('promemoria dell’acconto dopo approvazione', () => {
  it('programma una sola coppia a 30 e 50 minuti anche con approvazioni concorrenti; conserva il link originale', async () => {
    await Promise.all([approve(), approve()]);
    expect(initialSend).toHaveBeenCalledOnce();
    for (const offset of [30, 50]) {
      expect(store.value(jobPath(offset))).toMatchObject({ status: 'pending', minute: offset, dueAt: stamp(offset), deadline: stamp(60) });
      at(offset - 1); await deliver(offset);
      expect(send).toHaveBeenCalledTimes(offset === 30 ? 0 : 1);
      at(offset); await Promise.all([deliver(offset), deliver(offset)]); await deliver(offset);
      expect(store.value(jobPath(offset)).status).toBe('sent');
    }
    const link = initialSend.mock.calls[0][2].match(/https:\/\/imagestudiofotografico\.com\/prenota\/acconto\/booking#[a-f0-9]{64}/)?.[0];
    expect(link).toBeDefined(); expect(send).toHaveBeenCalledTimes(2);
    for (const [to, , html] of send.mock.calls) {
      expect(to).toBe('test@example.test'); expect(html).toContain(link!);
      expect(html).toContain('15,00'); expect(html).toContain('non è ancora confermato');
      expect(html).toContain('studio@example.test');
    }
    expect(store.value(bk).depositPaymentRequest.expiresAt).toEqual(stamp(60));
    expect(JSON.stringify(store.value(jobPath(50)))).not.toContain(link!);
  });

  it('non accoda se lo studio disattiva i promemoria per la campagna', async () => {
    patch(campaign, { emailPromemoriaAcconto: false }); await approve();
    expect(store.value(jobPath(30))).toBeUndefined();
    expect(store.value(jobPath(50))).toBeUndefined();
    expect(initialSend).toHaveBeenCalledOnce();
  });

  it.each(['paid', 'confirmed', 'capture', 'waiver', 'email', 'optout'])('salta il secondo invio se cambia lo stato: %s', async change => {
    await approve(); at(30); await deliver(30);
    if (change === 'paid') patch(bk, { depositPayment: { status: 'paid' } });
    if (change === 'confirmed') patch(bk, { stato: 'confermata' });
    if (change === 'capture') patch(hold, { paypalCaptureAttempt: { state: 'unknown' } });
    if (change === 'waiver') patch(bk, { depositWaiver: { waivedBy: 'admin' } });
    if (change === 'email') patch(bk, { cliente: { email: 'changed@example.test' } });
    if (change === 'optout') patch(campaign, { emailPromemoriaAcconto: false });
    at(50); await deliver(50);
    expect(send).toHaveBeenCalledOnce();
    expect(store.value(jobPath(50)).status).toBe('skipped');
  });

  it.each(['pagamento', 'scadenza'])('ricontrolla %s dopo aver preparato l’invio', async reason => {
    await approve(); at(50);
    await deliverBookingDepositReminder(store.db, job(50), { ...deps, studio: async () => {
      if (reason === 'pagamento') patch(bk, { acconto: 15 });
      else at(60);
      return studio();
    } });
    expect(send).not.toHaveBeenCalled();
    expect(store.value(jobPath(50)).status).toBe('skipped');
  });

  it('non spedisce due messaggi insieme al ripristino dopo il 50º minuto', async () => {
    await approve(); at(52);
    await deliver(30); await deliver(50);
    expect(store.value(jobPath(30)).status).toBe('skipped');
    expect(store.value(jobPath(50)).status).toBe('sent');
    expect(send).toHaveBeenCalledOnce();
  });

  it('non ripete uno stesso invio dall’esito incerto', async () => {
    await approve(); at(30);
    send.mockRejectedValueOnce(new Error('Gmail timeout'));
    await deliver(30); await deliver(30);
    expect(store.value(jobPath(30)).status).toBe('unknown');
    expect(send).toHaveBeenCalledOnce();
  });

  it('il controllo periodico legge la coda e si ferma allo spegnimento', async () => {
    await approve(); at(60); vi.useFakeTimers();
    const stop = startBookingDepositReminderWorker(store.db, 1000);
    await vi.advanceTimersByTimeAsync(1000); stop();
    expect(store.value(jobPath(30)).status).toBe('skipped');
    expect(store.value(jobPath(50)).status).toBe('skipped');
    expect(send).not.toHaveBeenCalled();
  });
});
