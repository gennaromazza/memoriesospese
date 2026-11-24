import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore, type DocumentData } from 'firebase-admin/firestore';
import { logger } from '../lib/logger.js';
import { depositReceiptReference } from '@shared/booking-deposit-receipt';
import { canIssueManagementLink, MANAGEMENT_ACCESS, managementAccessMatches } from './management-access.js';
import { preparePaidBookingConfirmation, type PreparedBookingConfirmation } from './confirmation-email.js';
import { synchronizeInitialBookingCalendar } from './initial-calendar.js';

export const CONFIRMATION_JOBS = 'bookingConfirmationJobs';
const LEASE_MS = 180_000, MAX_ATTEMPTS = 3;
export interface ConfirmationDependencies {
  prepare(db: Firestore, bookingId: string, booking: DocumentData): Promise<PreparedBookingConfirmation>;
  send(message: PreparedBookingConfirmation, bookingId: string): Promise<void>;
}
const defaults: ConfirmationDependencies = {
  prepare: async (db, id) => preparePaidBookingConfirmation(db, id, await synchronizeInitialBookingCalendar(db, id)),
  send: async (message, id) => {
    await (await import('../email-routes.js')).sendGmailEmail(message.to, message.subject, message.html, undefined,
      { type: 'booking_confirmation', relatedDocId: id, relatedDocType: 'booking' });
  },
};
const eligible = (booking: DocumentData | undefined, job: DocumentData) => !!booking
  && canIssueManagementLink(booking) && booking.depositPayment?.status === 'paid'
  && depositReceiptReference(booking.depositPayment) === job.captureId && booking.depositPayment.amountCents === job.amountCents;

/** Operates only on jobs atomically created by a newly verified capture, never a historic scan. */
export async function deliverBookingConfirmation(db: Firestore, id: string, overrides: Partial<ConfirmationDependencies> = {}) {
  const deps = { ...defaults, ...overrides }, ref = db.collection(CONFIRMATION_JOBS).doc(id);
  const rootRef = db.collection('bookings').doc(id), lease = randomUUID();
  const claimed = await db.runTransaction(async tx => {
    const snap = await tx.get(ref), root = await tx.get(rootRef), job = snap.data(), booking = root.data();
    if (!job || !['pending', 'sending'].includes(job.status)) return null;
    if (job.status === 'sending') {
      const until = job.leaseUntil?.toMillis?.();
      if (Number.isFinite(until) && until > Date.now()) return null;
      if (job.phase !== 'preparing') {
        tx.update(ref, { status: 'unknown', updatedAt: Timestamp.now() }); return null;
      }
    }
    if (!eligible(booking, job) || booking!.emailConfermataInviata) {
      tx.update(ref, { status: 'skipped', updatedAt: Timestamp.now() }); return null;
    }
    if (!Number.isSafeInteger(job.attempts) || job.attempts < 0 || job.attempts >= MAX_ATTEMPTS) {
      tx.update(ref, { status: 'failed', updatedAt: Timestamp.now() }); return null;
    }
    if (job.notBefore?.toMillis?.() > Date.now()) return null;
    const attempts = job.attempts + 1;
    tx.update(ref, { status: 'sending', phase: 'preparing', attempts, lease,
      leaseUntil: Timestamp.fromMillis(Date.now() + LEASE_MS), updatedAt: Timestamp.now() });
    return { booking: booking!, job, attempts };
  });
  if (!claimed) return;
  let sending = false;
  try {
    const message = await deps.prepare(db, id, claimed.booking);
    if (message.to.trim().toLowerCase() !== String(claimed.booking.cliente?.email || '').trim().toLowerCase()) throw new Error('Destinatario non corrispondente');
    const ready = await db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data(), root = (await tx.get(rootRef)).data();
      const access = (await tx.get(db.collection(MANAGEMENT_ACCESS).doc(id))).data();
      if (job?.lease !== lease || job.status !== 'sending') return false;
      if (!eligible(root, job) || root!.emailConfermataInviata || !managementAccessMatches(access, root!)
        || String(root!.cliente?.email || '').trim().toLowerCase() !== message.to.trim().toLowerCase()) {
        tx.update(ref, { status: 'skipped', updatedAt: Timestamp.now() }); return false;
      }
      if (!managementAccessMatches(access, root!, message.managementTokenHash)) {
        tx.update(ref, { status: claimed.attempts < MAX_ATTEMPTS ? 'pending' : 'failed',
          notBefore: Timestamp.fromMillis(Date.now() + 60_000), updatedAt: Timestamp.now() }); return false;
      }
      tx.update(ref, { phase: 'email', leaseUntil: Timestamp.fromMillis(Date.now() + LEASE_MS) }); return true;
    });
    if (!ready) return;
    sending = true;
    await deps.send(message, id);
    await db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data(), root = await tx.get(rootRef);
      if (job?.lease !== lease || job.status !== 'sending') return;
      tx.update(ref, { status: 'sent', sentAt: Timestamp.now(), updatedAt: Timestamp.now() });
      if (root.exists) tx.update(rootRef, { emailConfermataInviata: true });
    });
  } catch (error) {
    // A timeout after calling Gmail can be a delivered message. Never retry it automatically.
    const rejected = error instanceof Error && /Gmail API error:\s*(400|401|403|404|413|422|429)\b/.test(error.message);
    await db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data();
      if (job?.lease !== lease || job.status !== 'sending') return;
      const status = sending && !rejected ? 'unknown' : claimed.attempts < MAX_ATTEMPTS ? 'pending' : 'failed';
      tx.update(ref, { status, notBefore: Timestamp.fromMillis(Date.now() + 60_000), updatedAt: Timestamp.now() });
    });
    logger.warn({ bookingId: id }, 'Conferma prenotazione non completata; esito conservato senza modificare l’incasso');
  }
}
export async function runBookingConfirmationDeliveries(db: Firestore, overrides: Partial<ConfirmationDependencies> = {}) {
  const jobs = await db.collection(CONFIRMATION_JOBS).where('status', 'in', ['pending', 'sending']).limit(25).get();
  for (const job of jobs.docs) await deliverBookingConfirmation(db, job.id, overrides);
}
export function startBookingConfirmationWorker(db: Firestore) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runBookingConfirmationDeliveries(db); }
    catch { logger.warn('Controllo delle conferme prenotazioni non disponibile'); }
    finally { running = false; }
  };
  const timer = setInterval(() => void tick(), 30_000); timer.unref();
  void tick();
  return () => clearInterval(timer);
}
