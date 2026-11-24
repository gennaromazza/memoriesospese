import type { DocumentReference, Firestore } from 'firebase-admin/firestore';

export class BookingStateChangedError extends Error {
  constructor() { super("Lo stato della prenotazione e' cambiato nel frattempo"); }
}

/**
 * Scrive `updates` solo se la prenotazione e' ancora nello stato letto prima di creare l'evento
 * Google: due approvazioni concorrenti non possono confermarla entrambe (la seconda deve
 * rimuovere il proprio evento).
 */
export async function updateBookingIfStateUnchanged(
  db: Firestore, ref: DocumentReference, expectedStato: string, updates: Record<string, unknown>,
): Promise<void> {
  await db.runTransaction(async transaction => {
    const current = (await transaction.get(ref)).data();
    if (!current || current.stato !== expectedStato) throw new BookingStateChangedError();
    transaction.update(ref, updates);
  });
}
