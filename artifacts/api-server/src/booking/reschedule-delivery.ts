import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore, type DocumentData } from 'firebase-admin/firestore';
import { bookingPaymentMillis } from '@shared/booking-payment-state';
import { createEvent, updateEvent, getEventById } from '../google-calendar.js';
import { preparePaidBookingConfirmation, type PreparedBookingConfirmation } from './confirmation-email.js';
import { MANAGEMENT_ACCESS, managementAccessMatches, canIssueManagementLink, BookingManagementError } from './management-access.js';
import { assertReservedRescheduleAvailable } from './rescheduling.js';
import { RESCHEDULE_JOBS } from './reschedule-policy.js';
import { logger } from '../lib/logger.js';

export interface RescheduleDependencies {
  calendar(job: DocumentData, booking: DocumentData): Promise<void>;
  prepare: typeof preparePaidBookingConfirmation;
  send(message: PreparedBookingConfirmation, id: string): Promise<void>;
}
const defaults: RescheduleDependencies = {
  calendar: async (job, booking) => {
    const start = job.dataShootingInizio.toDate(), end = job.dataShootingFine.toDate();
    if (job.existingEvent) { await updateEvent(job.calendarId, job.eventId, { start, end }); return; }
    try {
      await createEvent(job.calendarId, { id: job.eventId, start, end,
        summary: `Shooting: ${booking.cliente.nome} ${booking.cliente.cognome}`,
        description: 'Appuntamento confermato e riprogrammato dal cliente', location: 'Studio fotografico' });
    } catch (error) {
      if (Number((error as any)?.code || (error as any)?.response?.status) !== 409) throw error;
      // A 409 means an earlier insert may have succeeded. Any subsequent error
      // is uncertain, never a reason to release the destination reservation.
      const event = await getEventById(job.calendarId, job.eventId).catch(() => { throw new Error('Evento da riconciliare'); });
      if (!event || Date.parse(event.start?.dateTime || '') !== start.getTime()
        || Date.parse(event.end?.dateTime || '') !== end.getTime()) throw new Error('Evento da riconciliare');
    }
  },
  prepare: preparePaidBookingConfirmation,
  send: async (message, id) => {
    await (await import('../email-routes.js')).sendGmailEmail(message.to, message.subject.replace('Confermata', 'Riprogrammata'),
      message.html, undefined, { type: 'booking_confirmation', relatedDocId: id, relatedDocType: 'booking' });
  },
};
const ownerMatches = (root: DocumentData | undefined, job: DocumentData) => root?.stato === 'confermata'
  && canIssueManagementLink(root)
  && root.managementAccessEpoch === job.epoch && String(root.cliente?.email || '').trim().toLowerCase() === job.email
  && root.customerReschedule?.requestId === job.requestId;
const targetMatches = (root: DocumentData | undefined, job: DocumentData) => root
  && bookingPaymentMillis(root.dataShootingInizio) === bookingPaymentMillis(job.dataShootingInizio)
  && bookingPaymentMillis(root.dataShootingFine) === bookingPaymentMillis(job.dataShootingFine);

/** Idempotent patch/stable insert ID: recovery cannot create a second Google event. */
export async function deliverManagedReschedule(db: Firestore, id: string, overrides: Partial<RescheduleDependencies> = {}) {
  const deps = { ...defaults, ...overrides }, ref = db.collection(RESCHEDULE_JOBS).doc(id), rootRef = db.collection('bookings').doc(id);
  const lease = randomUUID();
  const claimed = await db.runTransaction(async tx => {
    const job = (await tx.get(ref)).data(), root = (await tx.get(rootRef)).data();
    if (!job || !['pending', 'syncing'].includes(job.status) || job.notBefore?.toMillis?.() > Date.now()
      || job.status === 'syncing' && job.leaseUntil?.toMillis?.() > Date.now()) return null;
    if (!ownerMatches(root, job) || bookingPaymentMillis(root!.dataShootingInizio) !== bookingPaymentMillis(job.originalStart)
      || bookingPaymentMillis(root!.dataShootingFine) !== bookingPaymentMillis(job.originalEnd) || (root!.customerRescheduleCount ?? 0) !== 0
      || (job.attempts ?? 0) >= 3) {
      const status = job.calendarStarted ? 'blocked' : 'failed';
      tx.update(ref, { status, emailStatus: 'skipped' });
      if (root?.customerReschedule?.requestId === job.requestId) tx.update(rootRef, { 'customerReschedule.status': status });
      return null;
    }
    tx.update(ref, { status: 'syncing', attempts: (job.attempts ?? 0) + 1, lease,
      leaseUntil: Timestamp.fromMillis(Date.now() + 180_000) });
    return { job, root: root!, attempts: (job.attempts ?? 0) + 1 };
  });
  if (claimed) {
    let calendarApplied = false;
    let calendarAttempted = !!claimed.job.calendarStarted;
    try {
      if (!calendarAttempted) {
        await assertReservedRescheduleAvailable(db, id, claimed.job, claimed.root);
        const ready = await db.runTransaction(async tx => {
          const job = (await tx.get(ref)).data();
          if (job?.lease !== lease || job.status !== 'syncing') return false;
          tx.update(ref, { calendarStarted: true }); return true;
        });
        if (!ready) return;
      }
      calendarAttempted = true;
      await deps.calendar(claimed.job, claimed.root);
      calendarApplied = true;
      await db.runTransaction(async tx => {
        const job = (await tx.get(ref)).data(), root = (await tx.get(rootRef)).data();
        if (job?.lease !== lease || job.status !== 'syncing') return;
        if (!ownerMatches(root, job) || bookingPaymentMillis(root!.dataShootingInizio) !== bookingPaymentMillis(job.originalStart)
          || bookingPaymentMillis(root!.dataShootingFine) !== bookingPaymentMillis(job.originalEnd) || (root!.customerRescheduleCount ?? 0) !== 0) {
          tx.update(ref, { status: 'blocked', emailStatus: 'skipped' });
          if (root?.customerReschedule?.requestId === job.requestId) tx.update(rootRef, { 'customerReschedule.status': 'blocked' });
          return;
        }
        tx.update(rootRef, { dataShootingInizio: job.dataShootingInizio, dataShootingFine: job.dataShootingFine,
          googleCalendarEventId: job.eventId, googleCalendarId: job.calendarId, calendarSyncPending: false,
          customerRescheduleCount: 1, customerReschedule: { requestId: job.requestId, status: 'complete', emailStatus: 'pending' },
          updatedAt: Timestamp.now() });
        tx.update(ref, { status: 'complete', completedAt: Timestamp.now() });
      });
    } catch (error) {
      const definite = !calendarAttempted && error instanceof BookingManagementError
        || !calendarApplied && claimed.attempts === 1 && [400, 401, 403, 404, 422].includes(Number((error as any)?.code || (error as any)?.response?.status));
      await db.runTransaction(async tx => {
        const job = (await tx.get(ref)).data(), root = (await tx.get(rootRef)).data();
        if (job?.lease !== lease || job.status !== 'syncing') return;
        tx.update(ref, { status: definite ? 'failed' : 'pending', emailStatus: definite ? 'skipped' : 'pending', notBefore: Timestamp.fromMillis(Date.now() + 60_000) });
        if (root?.customerReschedule?.requestId === job.requestId) tx.update(rootRef, { 'customerReschedule.status': definite ? 'failed' : 'pending' });
      });
      logger.warn({ bookingId: id }, 'Cambio appuntamento non completato; originale conservato e incasso invariato');
    }
  }
  await deliverRescheduleEmail(db, id, deps);
}
async function deliverRescheduleEmail(db: Firestore, id: string, deps: RescheduleDependencies) {
  const ref = db.collection(RESCHEDULE_JOBS).doc(id), rootRef = db.collection('bookings').doc(id), lease = randomUUID();
  const claimed = await db.runTransaction(async tx => {
    const job = (await tx.get(ref)).data(), root = (await tx.get(rootRef)).data();
    if (!job || job.status !== 'complete' || !['pending', 'preparing', 'sending'].includes(job.emailStatus)
      || job.emailNotBefore?.toMillis?.() > Date.now()) return null;
    if (['preparing', 'sending'].includes(job.emailStatus) && job.emailLeaseUntil?.toMillis?.() > Date.now()) return null;
    if (job.emailStatus === 'sending') {
      tx.update(ref, { emailStatus: 'unknown' });
      if (root?.customerReschedule?.requestId === job.requestId) tx.update(rootRef, { 'customerReschedule.emailStatus': 'unknown' });
      return null;
    }
    if (!ownerMatches(root, job) || !targetMatches(root, job) || (job.emailAttempts ?? 0) >= 3) {
      const status = (job.emailAttempts ?? 0) >= 3 ? 'failed' : 'skipped';
      tx.update(ref, { emailStatus: status });
      if (root?.customerReschedule?.requestId === job.requestId) tx.update(rootRef, { 'customerReschedule.emailStatus': status });
      return null;
    }
    tx.update(ref, { emailStatus: 'preparing', emailLease: lease, emailAttempts: (job.emailAttempts ?? 0) + 1,
      emailLeaseUntil: Timestamp.fromMillis(Date.now() + 180_000) });
    return { job, root: root! };
  });
  if (!claimed) return;
  let sending = false;
  try {
    const message = await deps.prepare(db, id, claimed.root);
    const ready = await db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data(), root = (await tx.get(rootRef)).data();
      const access = (await tx.get(db.collection(MANAGEMENT_ACCESS).doc(id))).data();
      if (job?.emailLease !== lease || job.emailStatus !== 'preparing') return false;
      if (!ownerMatches(root, job) || !targetMatches(root, job) || message.to.trim().toLowerCase() !== job.email
        || !managementAccessMatches(access, root!, message.managementTokenHash)) {
        tx.update(ref, { emailStatus: 'pending', emailNotBefore: Timestamp.fromMillis(Date.now() + 60_000) }); return false;
      }
      tx.update(ref, { emailStatus: 'sending' }); return true;
    });
    if (!ready) return;
    sending = true;
    await deps.send(message, id);
    await db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data(), root = (await tx.get(rootRef)).data();
      if (job?.emailLease !== lease || job.emailStatus !== 'sending') return;
      tx.update(ref, { emailStatus: 'sent', emailSentAt: Timestamp.now() });
      if (root?.customerReschedule?.requestId === job.requestId) tx.update(rootRef, { 'customerReschedule.emailStatus': 'sent', emailConfermataInviata: true });
    });
  } catch {
    const status = sending ? 'unknown' : 'pending';
    await db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data(), root = (await tx.get(rootRef)).data();
      if (job?.emailLease !== lease) return;
      tx.update(ref, { emailStatus: status, emailNotBefore: Timestamp.fromMillis(Date.now() + 60_000) });
      if (root?.customerReschedule?.requestId === job.requestId) tx.update(rootRef, { 'customerReschedule.emailStatus': status });
    });
  }
}
export function startBookingRescheduleWorker(db: Firestore) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const [calendar, email] = await Promise.all([
        db.collection(RESCHEDULE_JOBS).where('status', 'in', ['pending', 'syncing']).limit(25).get(),
        db.collection(RESCHEDULE_JOBS).where('emailStatus', 'in', ['pending', 'preparing', 'sending']).limit(25).get(),
      ]);
      for (const id of new Set([...calendar.docs, ...email.docs].map(doc => doc.id))) await deliverManagedReschedule(db, id);
    } catch { logger.warn('Verifica cambi appuntamento temporaneamente non disponibile'); }
    finally { running = false; }
  };
  const timer = setInterval(() => void tick(), 30_000); timer.unref(); void tick();
  return () => clearInterval(timer);
}
