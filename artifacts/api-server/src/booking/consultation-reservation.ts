import type { Firestore } from 'firebase-admin/firestore';
import { DateTime } from 'luxon';
import { checkSlotReservation } from './slot-reservations.js';

export class ConsultationNotPendingError extends Error {}

/**
 * Conferma una consulenza dentro la stessa transazione con cui le prenotazioni
 * riservano gli slot: stesse guardie giornaliere `bookingSlotLocks`, stessi controlli su
 * prenotazioni (anche in attesa di pagamento), blocchi del checkout e spostamenti/annullamenti.
 *
 * Senza questo passaggio un'approvazione e una prenotazione pubblica concorrenti potevano
 * confermare entrambe lo stesso orario. Le altre consulenze non vengono considerate, come
 * nel controllo di approvazione precedente (evita conflitti "fantasma").
 *
 * `expectedStato` (default `in_attesa`; `confermata` per spostare una consulenza gia' confermata).
 * `force` (approvazione forzata dall'admin) salta il controllo di sovrapposizione ma aggiorna le guardie.
 *
 * Lancia BookingSlotConflictError se lo slot e' occupato e ConsultationNotPendingError se la
 * consulenza non e' piu' `in_attesa` (es. due approvazioni contemporanee).
 */
export async function confirmConsultationReservation(
  db: Firestore,
  consultationId: string,
  start: Date,
  end: Date,
  updates: Record<string, unknown>,
  options: { force?: boolean; expectedStato?: string } = {},
): Promise<void> {
  const ref = db.collection('consultations').doc(consultationId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.data()?.stato !== (options.expectedStato ?? 'in_attesa')) throw new ConsultationNotPendingError();
    const reserve = await checkSlotReservation(
      transaction, db, start, end, undefined, undefined, undefined,
      { includeConsultations: false, skipConflictCheck: options.force === true },
    );
    transaction.update(ref, updates);
    reserve();
  });
}

/**
 * Un evento Google (dai dettagli di getEventsWithDetailsAllCalendars) si sovrappone a [from, to)?
 * Gli eventi "tutto il giorno" hanno date senza orario e fine esclusiva, in giorni Europe/Rome.
 */
export function googleEventOverlaps(
  event: { start: string; end: string; isAllDay?: boolean }, from: Date, to: Date,
): boolean {
  const zone = 'Europe/Rome';
  const start = event.isAllDay
    ? DateTime.fromISO(event.start, { zone }).startOf('day').toMillis() : Date.parse(event.start);
  const end = event.isAllDay
    ? DateTime.fromISO(event.end, { zone }).startOf('day').toMillis() : Date.parse(event.end);
  return Number.isFinite(start) && Number.isFinite(end) && from.getTime() < end && to.getTime() > start;
}
