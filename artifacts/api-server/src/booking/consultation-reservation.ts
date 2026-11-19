import type { Firestore } from 'firebase-admin/firestore';
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
 * Lancia BookingSlotConflictError se lo slot e' occupato e ConsultationNotPendingError se la
 * consulenza non e' piu' `in_attesa` (es. due approvazioni contemporanee).
 */
export async function confirmConsultationReservation(
  db: Firestore,
  consultationId: string,
  start: Date,
  end: Date,
  updates: Record<string, unknown>,
): Promise<void> {
  const ref = db.collection('consultations').doc(consultationId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.data()?.stato !== 'in_attesa') throw new ConsultationNotPendingError();
    const reserve = await checkSlotReservation(
      transaction, db, start, end, undefined, undefined, undefined, { includeConsultations: false },
    );
    transaction.update(ref, updates);
    reserve();
  });
}
