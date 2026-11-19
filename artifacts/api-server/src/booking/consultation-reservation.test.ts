import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { reservationDb } from './test-helpers/reservation-db.js';
import { BookingSlotConflictError, CHECKOUT_HOLDS, checkSlotReservation } from './slot-reservations.js';
import { ConsultationNotPendingError, confirmConsultationReservation } from './consultation-reservation.js';

// 2027-02-10 (CET, UTC+1): 10:00-11:00 Rome == 09:00-10:00Z
const at = (hhmmRome: string) => new Date(`2027-02-10T${hhmmRome}:00+01:00`);
const day = Timestamp.fromDate(at('00:00'));
const GUARD = 'bookingSlotLocks/2027-02-10';

function consultation(extra: Record<string, unknown> = {}) {
  return { stato: 'in_attesa', dataConsulenza: day, orarioInizio: '10:00', orarioFine: '11:00',
    cliente: { nome: 'Anna' }, ...extra };
}
function booking(startRome: string, endRome: string, extra: Record<string, unknown> = {}) {
  return { stato: 'in_attesa', dataShootingInizio: Timestamp.fromDate(at(startRome)),
    dataShootingFine: Timestamp.fromDate(at(endRome)), ...extra };
}
const confirmUpdates = { stato: 'confermata', googleCalendarEventId: 'evt', confermataDa: 'admin' };

/** Come una prenotazione pubblica: controlla lo slot e scrive prenotazione + guardie nella stessa transazione. */
async function reserveBooking(store: ReturnType<typeof reservationDb>, id: string, s: string, e: string) {
  await store.db.runTransaction(async (tx: any) => {
    const bump = await checkSlotReservation(tx, store.db, at(s), at(e));
    tx.set(store.db.collection('bookings').doc(id), booking(s, e));
    bump();
  });
}

describe('checkSlotReservation e consulenze confermate', () => {
  it('blocca una prenotazione che si sovrappone a una consulenza confermata', async () => {
    const store = reservationDb();
    store.seed('consultations/c1', consultation({ stato: 'confermata' }));
    await expect(reserveBooking(store, 'b1', '10:30', '11:30')).rejects.toBeInstanceOf(BookingSlotConflictError);
    expect(store.value('bookings/b1')).toBeUndefined();
  });

  it('non blocca slot adiacenti, né consulenze solo in attesa', async () => {
    const store = reservationDb();
    store.seed('consultations/c1', consultation({ stato: 'confermata' }));
    store.seed('consultations/c2', consultation({ orarioInizio: '12:00', orarioFine: '13:00' })); // in attesa
    await reserveBooking(store, 'adjacent', '11:00', '11:30');
    await reserveBooking(store, 'on-pending', '12:15', '12:45');
    expect(store.value('bookings/adjacent')).toBeDefined();
    expect(store.value('bookings/on-pending')).toBeDefined();
  });

  it('con includeConsultations:false ignora le consulenze', async () => {
    const store = reservationDb();
    store.seed('consultations/c1', consultation({ stato: 'confermata' }));
    await store.db.runTransaction(async (tx: any) => {
      const bump = await checkSlotReservation(tx, store.db, at('10:00'), at('11:00'),
        undefined, undefined, undefined, { includeConsultations: false });
      bump();
    });
  });

  it('ignora consulenze con orario non valido invece di bloccare tutto il giorno', async () => {
    const store = reservationDb();
    store.seed('consultations/bad', consultation({ stato: 'confermata', orarioInizio: 'xx', orarioFine: '??' }));
    await reserveBooking(store, 'b1', '10:00', '11:00');
    expect(store.value('bookings/b1')).toBeDefined();
  });
});

describe('confirmConsultationReservation', () => {
  it('conferma la consulenza e aggiorna la guardia del giorno', async () => {
    const store = reservationDb();
    store.seed('consultations/c1', consultation());
    await confirmConsultationReservation(store.db, 'c1', at('10:00'), at('11:00'), confirmUpdates);
    expect(store.value('consultations/c1')).toMatchObject(confirmUpdates);
    expect(store.value(GUARD)).toEqual({ version: 1 });
  });

  it.each([
    ['una prenotazione in attesa di pagamento', 'bookings/b', booking('10:30', '11:30')],
    ['una prenotazione confermata', 'bookings/b', booking('09:30', '10:30', { stato: 'confermata' })],
    ['un blocco del checkout', `${CHECKOUT_HOLDS}/h`, { status: 'active', expiresAt: Timestamp.fromMillis(Date.now() + 600_000),
      dataShootingInizio: Timestamp.fromDate(at('10:00')), dataShootingFine: Timestamp.fromDate(at('11:00')) }],
  ])('rifiuta l\'approvazione sopra %s, senza modificare la consulenza', async (_label, path, value) => {
    const store = reservationDb();
    store.seed('consultations/c1', consultation());
    store.seed(path, value);
    await expect(confirmConsultationReservation(store.db, 'c1', at('10:00'), at('11:00'), confirmUpdates))
      .rejects.toBeInstanceOf(BookingSlotConflictError);
    expect(store.value('consultations/c1').stato).toBe('in_attesa');
  });

  it('non guarda le altre consulenze (come il controllo di approvazione esistente)', async () => {
    const store = reservationDb();
    store.seed('consultations/other', consultation({ stato: 'confermata' }));
    store.seed('consultations/c1', consultation());
    await confirmConsultationReservation(store.db, 'c1', at('10:00'), at('11:00'), confirmUpdates);
    expect(store.value('consultations/c1').stato).toBe('confermata');
  });

  it('rifiuta una consulenza non più in attesa (doppia approvazione)', async () => {
    const store = reservationDb();
    store.seed('consultations/c1', consultation({ stato: 'confermata' }));
    await expect(confirmConsultationReservation(store.db, 'c1', at('10:00'), at('11:00'), confirmUpdates))
      .rejects.toBeInstanceOf(ConsultationNotPendingError);
    await expect(confirmConsultationReservation(store.db, 'missing', at('10:00'), at('11:00'), confirmUpdates))
      .rejects.toBeInstanceOf(ConsultationNotPendingError);
  });
});

describe('gara tra approvazione consulenza e prenotazione pubblica sullo stesso slot', () => {
  it.each([
    ['approvazione avviata per prima', true],
    ['prenotazione avviata per prima', false],
  ])('ne passa una sola (%s)', async (_label, consultationFirst) => {
    const store = reservationDb();
    store.seed('consultations/c1', consultation());
    const approve = () => confirmConsultationReservation(store.db, 'c1', at('10:00'), at('11:00'), confirmUpdates);
    const book = () => reserveBooking(store, 'b1', '10:30', '11:30');

    const results = await Promise.allSettled(consultationFirst ? [approve(), book()] : [book(), approve()]);

    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(BookingSlotConflictError);
    const consultationConfirmed = store.value('consultations/c1').stato === 'confermata';
    const bookingExists = store.value('bookings/b1') !== undefined;
    expect(consultationConfirmed !== bookingExists).toBe(true); // mai entrambi, mai nessuno
  });
});
