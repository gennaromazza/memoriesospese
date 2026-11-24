import { createHash } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { IN_PERSON_METHODS, IN_PERSON_PROVIDER, type InPersonMethod } from '@shared/booking-deposit-receipt';
import { bookingPaymentMillis } from '@shared/booking-payment-state';
import { syncBookingWorkflowState } from '../../shared/workflow-helpers.js';
import { CheckoutHoldError } from './checkout-hold-state.js';
import { CHECKOUT_HOLDS, BookingSlotConflictError, checkSlotReservation } from './slot-reservations.js';
import { CONFIRMATION_JOBS } from './confirmation-delivery.js';
import { unpaidDepositRequestExpired } from './payment-deadlines.js';

/** Ricevute degli acconti incassati di persona: una per richiesta, mai riscritte. */
export const IN_PERSON_DEPOSITS = 'bookingInPersonDeposits';
export const IN_PERSON_SOURCE = 'booking_in_person_deposit';
/** Tetto di sicurezza contro errori di digitazione (10.000 euro). */
export const MAX_IN_PERSON_DEPOSIT_CENTS = 1_000_000;

export interface InPersonDepositInput {
  amountCents: number;
  method: InPersonMethod;
  /** Identificativo scelto dal chiamante: lo stesso valore ripetuto non registra due volte. */
  requestId: string;
  note?: string;
}
export interface InPersonDepositResult {
  bookingId: string;
  receiptId: string;
  amountCents: number;
  method: InPersonMethod;
  duplicate: boolean;
  stato: 'confermata';
}

const bad = (message: string) => new CheckoutHoldError(400, message);

export function parseInPersonDepositInput(raw: unknown): InPersonDepositInput {
  const value = (raw ?? {}) as Record<string, unknown>;
  if (typeof value.amountCents !== 'number' || !Number.isSafeInteger(value.amountCents) || value.amountCents <= 0) {
    throw bad('Importo non valido: indica un importo in euro maggiore di zero.');
  }
  if (value.amountCents > MAX_IN_PERSON_DEPOSIT_CENTS) throw bad('Importo troppo alto: controlla la cifra.');
  if (typeof value.method !== 'string' || !(IN_PERSON_METHODS as readonly string[]).includes(value.method)) {
    throw bad('Metodo di pagamento non valido.');
  }
  if (typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(value.requestId)) {
    throw bad('Identificativo della richiesta non valido.');
  }
  if (value.note !== undefined && (typeof value.note !== 'string' || value.note.length > 300)) throw bad('Nota non valida.');
  return { amountCents: value.amountCents, method: value.method as InPersonMethod, requestId: value.requestId,
    ...(typeof value.note === 'string' && value.note.trim() ? { note: value.note.trim() } : {}) };
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Acconto pagato di persona (contanti, carta/POS, bonifico) per una prenotazione in attesa.
 * L'importo e' libero. Una sola transazione: conferma la prenotazione, chiude il link PayPal,
 * registra incasso in cassa e ricevuta, accoda calendario ed email di conferma.
 *
 * Non tocca mai PayPal: se un pagamento PayPal e' in corso o gia' incassato si ferma, perche'
 * una seconda registrazione porterebbe a incassare due volte.
 */
export async function recordInPersonDeposit(
  db: Firestore, bookingId: string, rawInput: unknown, actor: string,
): Promise<InPersonDepositResult> {
  const input = parseInPersonDepositInput(rawInput);
  const receiptId = digest(`in-person-deposit:${bookingId}:${input.requestId}`);
  const receiptRef = db.collection(IN_PERSON_DEPOSITS).doc(receiptId);
  const bookingRef = db.collection('bookings').doc(bookingId);
  const holdRef = db.collection(CHECKOUT_HOLDS).doc(bookingId);
  const cashRef = db.collection('cashMovements').doc(`booking_inperson_${receiptId.slice(0, 32)}`);
  const jobRef = db.collection(CONFIRMATION_JOBS).doc(bookingId);

  return db.runTransaction(async tx => {
    const [receiptSnap, bookingSnap, holdSnap] = await Promise.all([tx.get(receiptRef), tx.get(bookingRef), tx.get(holdRef)]);
    const receipt = receiptSnap.data();
    if (receipt) {
      if (receipt.bookingId !== bookingId || receipt.amountCents !== input.amountCents || receipt.method !== input.method) {
        throw new CheckoutHoldError(409, 'Questo identificativo è già stato usato per un altro pagamento.');
      }
      return { bookingId, receiptId, amountCents: receipt.amountCents, method: receipt.method, duplicate: true, stato: 'confermata' as const };
    }
    const booking = bookingSnap.data(), hold = holdSnap.data();
    if (!booking) throw new CheckoutHoldError(404, 'Prenotazione non trovata.');
    if (booking.stato !== 'in_attesa' || booking.paymentReviewRequired || booking.automaticConfirmationError
      || booking.depositPayment || Number(booking.acconto || 0) !== 0) {
      throw new CheckoutHoldError(409, 'La prenotazione non è in attesa o ha già un acconto registrato o da verificare.');
    }
    const request = booking.depositPaymentRequest;
    if (request) {
      if (request.status !== 'pending') throw new CheckoutHoldError(409, 'La richiesta di acconto non è più aperta.');
      if (unpaidDepositRequestExpired(booking, Date.now())) {
        throw new CheckoutHoldError(410, 'La richiesta di acconto è scaduta: occorre una nuova prenotazione.');
      }
    }
    if (hold) {
      const attempt = hold.paypalCaptureAttempt;
      if (hold.depositPayment || (attempt && attempt.state !== 'declined')) {
        throw new CheckoutHoldError(409, 'Un pagamento PayPal è in corso o già incassato: verifica prima il pagamento PayPal.');
      }
    }
    const startMs = bookingPaymentMillis(booking.dataShootingInizio), endMs = bookingPaymentMillis(booking.dataShootingFine);
    if (startMs === null || endMs === null || endMs <= startMs) throw bad('Orario della prenotazione da verificare.');
    if (startMs <= Date.now()) throw bad('Lo shooting è già iniziato: non si può registrare un acconto.');

    const campaign = booking.campaignId ? (await tx.get(db.collection('booking_campaigns').doc(booking.campaignId))).data() : undefined;
    const cash = await tx.get(cashRef);
    let reserve: () => void;
    try {
      reserve = await checkSlotReservation(tx, db, new Date(startMs), new Date(endMs), bookingId, bookingId);
    } catch (error) {
      if (error instanceof BookingSlotConflictError) throw new CheckoutHoldError(409, 'Lo slot è stato occupato da un\'altra prenotazione.');
      throw error;
    }

    const now = Timestamp.fromMillis(Date.now());
    const amount = input.amountCents / 100;
    const customer = booking.cliente || {};
    const line = { tipo: 'acconto', importo: amount, metodo: input.method, data: now, emailInviata: true,
      source: IN_PERSON_SOURCE, receiptId, cashMovementId: cashRef.id, recordedBy: actor,
      ...(input.note ? { note: input.note } : {}) };
    const payment = { provider: IN_PERSON_PROVIDER, status: 'paid', method: input.method, amountCents: input.amountCents,
      currency: 'EUR', paidAt: now, receiptId, recordedBy: actor };

    reserve();
    tx.update(bookingRef, {
      stato: 'confermata', ...syncBookingWorkflowState('confermata', booking.statoWorkflow),
      confermataDa: actor, confermatail: now, acconto: amount, metodoPagamento: input.method,
      transactions: [...(Array.isArray(booking.transactions) ? booking.transactions : []), line],
      depositPayment: payment,
      ...(request ? { depositPaymentRequest: { ...request, status: 'paid', paidAt: now, settledBy: IN_PERSON_PROVIDER } } : {}),
      calendarSyncPending: true, emailConfermataInviata: false, updatedAt: now,
    });
    // Il link PayPal gia' inviato non deve piu' poter incassare: un pagamento tardivo verrebbe
    // comunque registrato in cassa ma segnalato "da verificare", senza una seconda conferma.
    if (hold && hold.status === 'active') {
      tx.update(holdRef, { status: 'cancelled', closedReason: 'in_person_deposit', closedAt: now });
    }
    tx.set(receiptRef, { bookingId, amountCents: input.amountCents, method: input.method, currency: 'EUR',
      recordedBy: actor, createdAt: now, cashMovementId: cashRef.id, ...(input.note ? { note: input.note } : {}) });
    if (!cash.exists) {
      tx.set(cashRef, { tipo: 'entrata', categoria: 'Prenotazioni', importo: amount, data: now,
        descrizione: `Acconto shooting (di persona) ${campaign?.nome || bookingId}`,
        metodoPagamento: input.method, origine: 'booking', origineRef: bookingId, campaignId: booking.campaignId ?? null,
        bookingId, nomeCliente: `${customer.nome || ''} ${customer.cognome || ''}`.trim() || bookingId,
        ...(typeof campaign?.temaStagionale === 'string' ? { origineTema: campaign.temaStagionale } : {}),
        provider: IN_PERSON_PROVIDER, receiptId, createdAt: now, updatedAt: now });
    }
    tx.set(jobRef, { status: 'pending', attempts: 0, captureId: receiptId, amountCents: input.amountCents, createdAt: now, updatedAt: now });
    return { bookingId, receiptId, amountCents: input.amountCents, method: input.method, duplicate: false, stato: 'confermata' as const };
  });
}
