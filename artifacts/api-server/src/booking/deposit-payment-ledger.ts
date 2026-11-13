import { createHash } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { BookingDepositCaptureResult } from '@workspace/api-zod';
import type { CompletedCapture } from '../commerce/paypal-capture.js';
import { syncBookingWorkflowState } from '../../shared/workflow-helpers.js';
import { BOOKING_PAYPAL_ORDERS, BookingDepositOrderError } from './paypal-deposit-orders.js';
import { CHECKOUT_HOLDS, BookingSlotConflictError, checkSlotReservation } from './slot-reservations.js';

export const BOOKING_PAYMENT_CAPTURES = 'bookingPaymentCaptures';
export const BOOKING_PAYMENT_EVENTS = 'bookingPaymentEvents';
export const paymentHash = (value: string) => createHash('sha256').update(value).digest('hex');

export function depositCaptureResult(bookingId: string, payment: any, booking: any, duplicate: boolean): BookingDepositCaptureResult {
  return { bookingId, paypalOrderId: payment.paypalOrderId, paypalCaptureId: payment.paypalCaptureId,
    status: payment.status, amountCents: payment.amountCents, currency: 'EUR', duplicate,
    bookingConfirmed: booking?.stato === 'confermata',
    ...(payment.paypalFeeCents === undefined ? {} : { paypalFeeCents: payment.paypalFeeCents }) };
}

/** Called only with a canonical, verified provider capture. All money writes are atomic. */
export async function recordBookingDeposit(
  db: Firestore, capture: CompletedCapture, eventId?: string,
): Promise<BookingDepositCaptureResult> {
  const orderRef = db.collection(BOOKING_PAYPAL_ORDERS).doc(capture.paypalOrderId);
  const captureRef = db.collection(BOOKING_PAYMENT_CAPTURES).doc(paymentHash(`paypal-capture:${capture.captureId}`));
  const cashRef = db.collection('cashMovements').doc(`booking_paypal_${paymentHash(capture.captureId).slice(0, 32)}`);
  const feeRef = db.collection('cashMovements').doc(`booking_paypal_fee_${paymentHash(capture.captureId).slice(0, 32)}`);
  const eventRef = eventId ? db.collection(BOOKING_PAYMENT_EVENTS).doc(paymentHash(eventId)) : null;
  return db.runTransaction(async tx => {
    const association = (await tx.get(orderRef)).data();
    if (!association?.bookingId) throw new BookingDepositOrderError(409, 'PAYPAL_ORDER_UNKNOWN', 'Pagamento non associato a una prenotazione.');
    const bookingId = association.bookingId as string;
    const holdRef = db.collection(CHECKOUT_HOLDS).doc(bookingId);
    const bookingRef = db.collection('bookings').doc(bookingId);
    const [holdSnap, bookingSnap, capturedSnap, incomeSnap, feeSnap] = await Promise.all([
      tx.get(holdRef), tx.get(bookingRef), tx.get(captureRef), tx.get(cashRef), tx.get(feeRef),
    ]);
    if (eventRef) await tx.get(eventRef);
    const hold = holdSnap.data(), booking = bookingSnap.data(), priorCapture = capturedSnap.data();
    if (!hold || hold.bookingId !== bookingId || hold.paypal?.orderId !== capture.paypalOrderId
      || hold.paypal?.accountKey !== association.accountKey || association.paypalOrderId !== capture.paypalOrderId
      || capture.status.toUpperCase() !== 'COMPLETED' || capture.currency !== 'EUR' || hold.currency !== 'EUR'
      || association.currency !== 'EUR' || !Number.isSafeInteger(capture.amountCents) || capture.amountCents <= 0
      || association.depositAmountCents !== capture.amountCents || hold.depositAmountCents !== capture.amountCents
      || capture.customId !== `booking:${bookingId}` || capture.invoiceId !== `BOOKING-${bookingId}`
      || (hold.depositPayment?.paypalCaptureId && hold.depositPayment.paypalCaptureId !== capture.captureId)
      || (priorCapture && (priorCapture.bookingId !== bookingId || priorCapture.paypalOrderId !== capture.paypalOrderId))) {
      throw new BookingDepositOrderError(409, 'PAYPAL_CAPTURE_MISMATCH', 'Il pagamento non corrisponde all’acconto atteso.');
    }
    const knownFee = hold.depositPayment?.paypalFeeCents;
    if (capture.paypalFeeCents !== undefined && (!Number.isSafeInteger(capture.paypalFeeCents)
      || capture.paypalFeeCents < 0 || capture.paypalFeeCents > capture.amountCents
      || (knownFee !== undefined && knownFee !== capture.paypalFeeCents))) {
      throw new BookingDepositOrderError(409, 'PAYPAL_FEE_MISMATCH', 'Commissione PayPal da riconciliare.');
    }
    for (const snap of [incomeSnap, feeSnap]) {
      if (snap.exists && (snap.data()?.providerTransactionId !== capture.captureId || snap.data()?.bookingId !== bookingId)) {
        throw new BookingDepositOrderError(409, 'PAYPAL_CASH_CONFLICT', 'Movimento finanziario da verificare.');
      }
    }
    const campaign = (await tx.get(db.collection('booking_campaigns').doc(hold.campaignId))).data();
    const now = Timestamp.now();
    const duplicate = capturedSnap.exists;
    const customer = hold.draft?.cliente;
    const customerValid = customer && ['nome', 'cognome', 'email', 'whatsapp'].every(field => typeof customer[field] === 'string');
    let confirm = !duplicate && !bookingSnap.exists && hold.status === 'active'
      && Number.isFinite(hold.expiresAt?.toMillis?.()) && hold.expiresAt.toMillis() > Date.now()
      && hold.dataShootingInizio?.toMillis?.() > Date.now() && !!customerValid;
    let commitLocks: (() => void) | undefined;
    if (confirm) {
      try { commitLocks = await checkSlotReservation(tx, db, hold.dataShootingInizio.toDate(), hold.dataShootingFine.toDate(), bookingId); }
      catch (error) { if (error instanceof BookingSlotConflictError) confirm = false; else throw error; }
    }
    if (confirm && (hold.expiresAt.toMillis() <= Date.now() || hold.dataShootingInizio.toMillis() <= Date.now())) confirm = false;
    const fee = knownFee ?? capture.paypalFeeCents;
    const payment = {
      ...(duplicate ? hold.depositPayment : {}),
      provider: 'paypal', status: duplicate ? priorCapture!.status : confirm ? 'paid' : 'paid_action_required',
      amountCents: capture.amountCents, currency: 'EUR', paypalOrderId: capture.paypalOrderId,
      paypalCaptureId: capture.captureId, paidAt: hold.depositPayment?.paidAt ?? now,
      ...(fee === undefined ? {} : { paypalFeeCents: fee, netCents: capture.amountCents - fee }),
    };
    const transaction = { tipo: 'acconto', importo: capture.amountCents / 100, metodo: 'paypal', data: payment.paidAt,
      emailInviata: false, providerTransactionId: capture.captureId, paypalOrderId: capture.paypalOrderId,
      ...(fee === undefined ? {} : { paypalFeeCents: fee }) };
    const confirmedBooking = confirm ? {
      campaignId: hold.campaignId, cliente: hold.draft.cliente,
      dataShootingInizio: hold.dataShootingInizio, dataShootingFine: hold.dataShootingFine,
      prodottoId: hold.draft.prodottoId ?? null, prodottoNome: hold.draft.prodottoNome ?? null, note: hold.draft.note || '',
      stato: 'confermata', ...syncBookingWorkflowState('confermata'), confermataDa: 'paypal', confermatail: now,
      acconto: capture.amountCents / 100, metodoPagamento: 'paypal', transactions: [transaction], depositPayment: payment,
      emailRicevutaInviata: false, emailConfermataInviata: false, emailAdminInviata: false,
      calendarSyncPending: true, createdAt: hold.createdAt ?? now, updatedAt: now,
    } : booking;
    // Finish every read, including slot guards, before starting any writes.
    if (confirm) {
      commitLocks!();
      tx.set(bookingRef, confirmedBooking!);
    } else if (duplicate && bookingSnap.exists) {
      tx.update(bookingRef, { depositPayment: payment, updatedAt: now,
        transactions: (booking?.transactions || []).map((line: any) => line.providerTransactionId === capture.captureId
          ? { ...line, ...(fee === undefined ? {} : { paypalFeeCents: fee }) } : line) });
    }
    tx.update(holdRef, {
      depositPayment: payment, ...(duplicate ? {} : { status: confirm ? 'consumed' : hold.status }),
      paymentReviewRequired: payment.status === 'paid_action_required',
    });
    tx.update(orderRef, { state: payment.status, captureId: capture.captureId, paidAt: payment.paidAt,
      ...(fee === undefined ? {} : { paypalFeeCents: fee }) });
    const cash = { data: payment.paidAt, metodoPagamento: 'paypal', origine: 'booking', origineRef: bookingId,
      campaignId: hold.campaignId, bookingId, nomeCliente: customerValid ? `${customer.nome} ${customer.cognome}` : bookingId,
      ...(typeof campaign?.temaStagionale === 'string' ? { origineTema: campaign.temaStagionale } : {}),
      provider: 'paypal', providerTransactionId: capture.captureId, createdAt: now, updatedAt: now };
    if (!incomeSnap.exists) tx.set(cashRef, { ...cash, tipo: 'entrata', categoria: 'Prenotazioni',
      importo: capture.amountCents / 100, descrizione: `Acconto shooting ${campaign?.nome || bookingId}` });
    if (fee !== undefined && fee > 0 && !feeSnap.exists) tx.set(feeRef, { ...cash, tipo: 'uscita',
      categoria: 'Commissioni di pagamento', movementRole: 'payment_fee', importo: fee / 100,
      descrizione: `Commissione PayPal acconto ${bookingId}` });
    tx.set(captureRef, { bookingId, paypalOrderId: capture.paypalOrderId, paypalCaptureId: capture.captureId,
      amountCents: capture.amountCents, currency: 'EUR', status: payment.status, paidAt: payment.paidAt,
      cashMovementId: cashRef.id, ...(fee === undefined ? {} : { paypalFeeCents: fee }),
      ...(fee !== undefined && fee > 0 ? { feeCashMovementId: feeRef.id } : {}) });
    if (eventRef) tx.set(eventRef, { providerEventId: eventId, paypalCaptureId: capture.captureId, bookingId, processedAt: now });
    return depositCaptureResult(bookingId, payment, confirmedBooking, duplicate);
  });
}
