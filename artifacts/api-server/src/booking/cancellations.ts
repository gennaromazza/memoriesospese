import { createHash, randomUUID } from 'node:crypto';
import { Timestamp, FieldValue, type Firestore, type DocumentData } from 'firebase-admin/firestore';
import { bookingPaymentMillis } from '@shared/booking-payment-state';
import { deleteEvent, resolveCalendarId } from '../google-calendar.js';
import { authorizeBookingManagement, MANAGEMENT_ACCESS, managementAccessMatches, BookingManagementError } from './management-access.js';
import { cancellationView, bookingDepositCents, CANCELLATION_JOBS } from './cancellation-policy.js';
import { deliverCancellationEmail } from './cancellation-email.js';
import { logger } from '../lib/logger.js';

export async function requestBookingCancellation(db: Firestore, id: string,
  input: { requestId: string; token?: string; expectedStartsAt?: string | Date },
  admin?: { actor: string; decision: 'none' | 'refund' | 'reschedule'; expectedAmountCents?: number }) {
  if (!admin) await authorizeBookingManagement(db, id, input.token!);
  const ref = db.collection('bookings').doc(id), jobRef = db.collection(CANCELLATION_JOBS).doc(id);
  return db.runTransaction(async tx => {
    const holdRef = db.collection('bookingCheckoutHolds').doc(id);
    const [snap, old, access, hold] = await Promise.all([tx.get(ref), tx.get(jobRef), tx.get(db.collection(MANAGEMENT_ACCESS).doc(id)), tx.get(holdRef)]);
    const root = snap.data(), job = old.data();
    if (!root) throw new BookingManagementError(404, 'Prenotazione non trovata.');
    if (admin?.expectedAmountCents !== undefined && admin.expectedAmountCents !== bookingDepositCents(root)) {
      throw new BookingManagementError(409, 'L’importo è cambiato: aggiorna e conferma nuovamente.');
    }
    if (!admin && !managementAccessMatches(access.data(), root, createHash('sha256').update(input.token!).digest('hex'))) {
      throw new BookingManagementError(404, 'Link non valido o revocato.');
    }
    if (job && job.epoch === (root.managementAccessEpoch || null)) {
      if (job.requestId === input.requestId || ['pending', 'working', 'complete', 'blocked'].includes(job.status)) return;
    }
    if (admin) {
      if (!['confermata', 'in_attesa'].includes(root.stato) || root.paymentReviewRequired
        || root.automaticConfirmationError || ['pending', 'blocked'].includes(root.customerReschedule?.status)) {
        throw new BookingManagementError(409, 'Prenotazione da verificare prima di annullare.');
      }
      if (bookingDepositCents(root) > 0 && !['refund', 'reschedule'].includes(admin.decision)) {
        throw new BookingManagementError(409, 'Scegli rimborso integrale o riprogrammazione concordata per l’acconto versato.');
      }
    } else {
      const view = cancellationView(root);
      if (!view.canCancel) throw new BookingManagementError(409, view.reason!);
      if (bookingPaymentMillis(root.dataShootingInizio) !== new Date(input.expectedStartsAt!).getTime()) {
        throw new BookingManagementError(409, 'La data è cambiata: aggiorna la prenotazione prima di annullare.');
      }
    }
    const now = Timestamp.now();
    tx.set(jobRef, { requestId: input.requestId, epoch: root.managementAccessEpoch || null,
      email: String(root.cliente?.email || '').trim().toLowerCase(), status: 'pending', attempts: 0, emailStatus: 'pending',
      originalStart: root.dataShootingInizio, eventId: root.googleCalendarEventId || null,
      dataShootingInizio: root.dataShootingInizio, dataShootingFine: root.dataShootingFine,
      calendarId: root.googleCalendarId || resolveCalendarId('primary'),
      actor: admin?.actor || 'customer', decision: admin?.decision || 'review',
      refundAmountCents: admin?.decision === 'refund' ? bookingDepositCents(root) : null, createdAt: now });
    tx.update(ref, { stato: 'cancellation_pending', updatedAt: now,
      bookingCancellation: { requestId: input.requestId, status: 'pending', emailStatus: 'pending', requestedAt: now,
        actor: admin?.actor || 'customer', decision: admin?.decision || 'review' } });
    if (hold.exists && hold.data()?.status === 'active') tx.update(holdRef, { status: 'cancelled', cancelledAt: now });
  });
}

export async function deliverBookingCancellation(db: Firestore, id: string,
  calendar: (calendarId: string, eventId: string) => Promise<unknown> = deleteEvent,
  email = deliverCancellationEmail) {
  const ref = db.collection(CANCELLATION_JOBS).doc(id), rootRef = db.collection('bookings').doc(id), lease = randomUUID();
  const claimed = await db.runTransaction(async tx => {
    const [jobDoc, rootDoc] = await Promise.all([tx.get(ref), tx.get(rootRef)]);
    const job = jobDoc.data(), root = rootDoc.data();
    if (!job || !['pending', 'working'].includes(job.status) || job.notBefore?.toMillis?.() > Date.now()
      || job.status === 'working' && job.leaseUntil?.toMillis?.() > Date.now()) return null;
    if (!matches(root, job) || (job.attempts || 0) >= 5) {
      tx.update(ref, { status: 'blocked', emailStatus: 'skipped' });
      if (root?.bookingCancellation?.requestId === job.requestId) tx.update(rootRef, { 'bookingCancellation.status': 'blocked', 'bookingCancellation.emailStatus': 'skipped' });
      return null;
    }
    tx.update(ref, { status: 'working', lease, leaseUntil: Timestamp.fromMillis(Date.now() + 180_000), attempts: (job.attempts || 0) + 1 });
    return job;
  });
  if (claimed) {
    try {
      if (claimed.eventId) {
        try { await calendar(claimed.calendarId, claimed.eventId); }
        catch (error) { if (![404, 410].includes(Number((error as any)?.code || (error as any)?.status || (error as any)?.response?.status))) throw error; }
      }
      await db.runTransaction(async tx => {
        const [jobDoc, rootDoc] = await Promise.all([tx.get(ref), tx.get(rootRef)]);
        const job = jobDoc.data(), root = rootDoc.data();
        if (job?.lease !== lease || job.status !== 'working') return;
        if (!matches(root, job)) {
          tx.update(ref, { status: 'blocked', emailStatus: 'skipped' });
          if (root?.bookingCancellation?.requestId === job.requestId) tx.update(rootRef, { 'bookingCancellation.status': 'blocked', 'bookingCancellation.emailStatus': 'skipped' });
          return;
        }
        const now = Timestamp.now();
        tx.update(ref, { status: 'complete', completedAt: now });
        tx.update(rootRef, { stato: 'annullata', googleCalendarEventId: FieldValue.delete(), calendarSyncPending: false,
          cancelledAt: now, updatedAt: now, 'bookingCancellation.status': 'complete',
          ...(bookingDepositCents(root!) > 0 && !root!.bookingRefund ? { bookingRefund: { status: 'review', decision: job.decision } } : {}) });
      });
    } catch {
      await db.runTransaction(async tx => {
        const job = (await tx.get(ref)).data();
        if (job?.lease === lease && job.status === 'working') tx.update(ref, { status: 'pending', notBefore: Timestamp.fromMillis(Date.now() + 60_000) });
      });
    }
  }
  await email(db, id);
  const job = (await ref.get()).data();
  if (job?.status === 'complete' && job.decision === 'refund' && job.actor !== 'customer') {
    try {
      const { approveBookingRefund, processBookingRefund } = await import('./refunds.js');
      if (Number.isSafeInteger(job.refundAmountCents)) {
        await approveBookingRefund(db, id, job.actor, job.refundAmountCents); await processBookingRefund(db, id);
      }
    } catch { logger.warn({ bookingId: id }, 'Annullamento completato; rimborso da verificare nel pannello'); }
  }
}
function matches(root: DocumentData | undefined, job: DocumentData) {
  return root?.stato === 'cancellation_pending' && root.bookingCancellation?.requestId === job.requestId
    && (root.managementAccessEpoch || null) === job.epoch
    && (root.googleCalendarEventId || null) === job.eventId
    && bookingPaymentMillis(root.dataShootingInizio) === bookingPaymentMillis(job.originalStart)
    && String(root.cliente?.email || '').trim().toLowerCase() === job.email;
}

export async function retryBookingCancellation(db: Firestore, id: string) {
  await db.runTransaction(async tx => {
    const ref = db.collection(CANCELLATION_JOBS).doc(id), rootRef = db.collection('bookings').doc(id);
    const job = (await tx.get(ref)).data(), root = (await tx.get(rootRef)).data();
    if (!job || !matches(root, job) || !['pending', 'blocked'].includes(job.status)
      || job.leaseUntil?.toMillis?.() > Date.now()) throw new BookingManagementError(409, 'Annullamento non riprendibile: verifica i dati e l’operazione in corso.');
    tx.update(ref, { status: 'pending', attempts: 0, notBefore: Timestamp.fromMillis(0), emailStatus: 'pending' });
    tx.update(rootRef, { 'bookingCancellation.status': 'pending', 'bookingCancellation.emailStatus': 'pending' });
  });
  await deliverBookingCancellation(db, id);
}

export function startBookingCancellationWorker(db: Firestore) {
  let running = false;
  const tick = async () => {
    if (running) return; running = true;
    try {
      const [pending, messages] = await Promise.all([
        db.collection(CANCELLATION_JOBS).where('status', 'in', ['pending', 'working']).limit(25).get(),
        db.collection(CANCELLATION_JOBS).where('emailStatus', 'in', ['pending', 'preparing', 'sending']).limit(25).get(),
      ]);
      for (const doc of [...new Map([...pending.docs, ...messages.docs].map(doc => [doc.id, doc])).values()]) {
        await deliverBookingCancellation(db, doc.id);
      }
      const { processBookingRefund } = await import('./refunds.js');
      const refunds = await db.collection('bookingRefunds').where('status', 'in', ['approved', 'processing', 'pending', 'unknown']).limit(25).get();
      for (const doc of refunds.docs) await processBookingRefund(db, doc.id);
    } catch { logger.warn('Annullamenti o rimborsi da riconciliare'); }
    finally { running = false; }
  };
  const timer = setInterval(() => void tick(), 30_000); void tick();
  return () => clearInterval(timer);
}
