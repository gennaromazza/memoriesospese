import { createHash } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { IN_PERSON_METHODS, IN_PERSON_PROVIDER } from '@shared/booking-deposit-receipt';
import { IN_PERSON_DEPOSITS, IN_PERSON_SOURCE } from './in-person-deposit.js';

/**
 * Prenotazione manuale dell'admin con acconto gia' scritto sulla prenotazione (`transactions[0]`):
 * crea l'incasso in cassa e la ricevuta di persona e li collega alla riga, cosi' l'acconto e' in
 * cassa e puo' passare nell'ordine come ogni acconto incassato di persona.
 *
 * Idempotente (ricevuta e movimento hanno ID deterministici). Restituisce true solo se ha scritto.
 * Non cambia gli importi della prenotazione.
 */
export async function registerManualBookingDeposit(db: Firestore, bookingId: string, actor: string): Promise<boolean> {
  const digest = createHash('sha256').update(`manual-booking-deposit:${bookingId}`).digest('hex');
  const receiptRef = db.collection(IN_PERSON_DEPOSITS).doc(digest);
  const cashRef = db.collection('cashMovements').doc(`booking_inperson_${digest.slice(0, 32)}`);
  const bookingRef = db.collection('bookings').doc(bookingId);

  return db.runTransaction(async tx => {
    const [bookingSnap, receiptSnap, cashSnap] = await Promise.all([tx.get(bookingRef), tx.get(receiptRef), tx.get(cashRef)]);
    const booking = bookingSnap.data();
    if (!booking || booking.isManual !== true || booking.depositPayment || receiptSnap.exists) return false;
    const lines: any[] = Array.isArray(booking.transactions) ? booking.transactions : [];
    const index = lines.findIndex(line => line?.tipo === 'acconto' && !line.cashMovementId && !line.source);
    const line = lines[index];
    const amountCents = line ? Math.round(Number(line.importo) * 100) : 0;
    if (!line || !Number.isSafeInteger(amountCents) || amountCents <= 0
      || !(IN_PERSON_METHODS as readonly string[]).includes(line.metodo)
      || Math.round(Number(booking.acconto) * 100) !== amountCents) return false;

    const campaign = booking.campaignId ? (await tx.get(db.collection('booking_campaigns').doc(booking.campaignId))).data() : undefined;
    const now = Timestamp.fromMillis(Date.now());
    const customer = booking.cliente || {};
    const updated = lines.map((entry, i) => i === index
      ? { ...entry, source: IN_PERSON_SOURCE, receiptId: digest, cashMovementId: cashRef.id, recordedBy: actor } : entry);
    tx.update(bookingRef, {
      transactions: updated,
      depositPayment: { provider: IN_PERSON_PROVIDER, status: 'paid', method: line.metodo, amountCents, currency: 'EUR',
        paidAt: line.data ?? now, receiptId: digest, recordedBy: actor },
      updatedAt: now,
    });
    tx.set(receiptRef, { bookingId, amountCents, method: line.metodo, currency: 'EUR', recordedBy: actor,
      createdAt: now, cashMovementId: cashRef.id, origin: 'manual_booking' });
    if (!cashSnap.exists) {
      tx.set(cashRef, { tipo: 'entrata', categoria: 'Prenotazioni', importo: amountCents / 100, data: line.data ?? now,
        descrizione: `Acconto prenotazione manuale ${campaign?.nome || bookingId}`,
        metodoPagamento: line.metodo, origine: 'booking', origineRef: bookingId, campaignId: booking.campaignId ?? null,
        bookingId, nomeCliente: `${customer.nome || ''} ${customer.cognome || ''}`.trim() || bookingId,
        ...(typeof campaign?.temaStagionale === 'string' ? { origineTema: campaign.temaStagionale } : {}),
        provider: IN_PERSON_PROVIDER, receiptId: digest, createdAt: now, updatedAt: now });
    }
    return true;
  });
}
