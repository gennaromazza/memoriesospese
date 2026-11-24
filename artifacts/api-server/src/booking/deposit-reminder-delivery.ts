import { randomUUID } from 'node:crypto';
import { FieldPath, Timestamp, type DocumentData, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { logger } from '../lib/logger.js';
import { approvedDepositReminderEmail, approvedDepositSigningKey, approvedDepositTokenFor } from './approved-deposit-request.js';
import { approvedDepositMatchesBooking } from './approved-deposit-state.js';
import { hashCheckoutToken } from './checkout-hold-state.js';
import { DEPOSIT_REMINDER_JOBS, depositReminderJobId } from './deposit-reminder-queue.js';
import { CHECKOUT_HOLDS } from './slot-reservations.js';

const MINUTE = 60_000;
const LEASE = 3 * MINUTE;
const millis = (value: any): number => value?.toMillis?.() ?? NaN;
const emailValid = (value: unknown): value is string => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const paymentUncertain = (data?: DocumentData) => data && (
  data.depositPayment || data.paymentReviewRequired || data.depositWaiver || data.bookingCancellation
  || data.paypalCaptureAttempt && data.paypalCaptureAttempt.state !== 'declined'
);

async function readContext(tx: Transaction, db: Firestore, id: string, job: DocumentData, now: number) {
  const { bookingId, campaignId, minute } = job;
  const dueAt = millis(job.dueAt), deadline = millis(job.deadline);
  if ((minute !== 30 && minute !== 50) || typeof bookingId !== 'string' || !bookingId || bookingId.includes('/')
    || typeof campaignId !== 'string' || !campaignId || campaignId.includes('/')
    || id !== depositReminderJobId(bookingId, minute) || !Number.isFinite(dueAt)
    || !Number.isFinite(deadline) || dueAt > now || now >= deadline
    // If maintenance missed the first window, send only the final reminder.
    || minute === 30 && now >= dueAt + 20 * MINUTE) return null;
  const [booking, hold, campaign] = await Promise.all([
    tx.get(db.collection('bookings').doc(bookingId)),
    tx.get(db.collection(CHECKOUT_HOLDS).doc(bookingId)),
    tx.get(db.collection('booking_campaigns').doc(campaignId)),
  ]).then(snapshots => snapshots.map(snapshot => snapshot.data()));
  const to = booking?.cliente?.email?.trim?.();
  if (!booking || !hold || hold.status !== 'active' || hold.bookingId !== bookingId || hold.campaignId !== campaignId
    || !approvedDepositMatchesBooking(hold, booking, now) || !booking.depositPaymentRequest.approvedBy
    || !campaign?.attiva || campaign.emailPromemoriaAcconto === false
    || paymentUncertain(booking) || paymentUncertain(hold)
    || deadline !== millis(hold.expiresAt) || dueAt !== millis(hold.createdAt) + minute * MINUTE
    || hold.paymentEmail?.status === 'sending' || !emailValid(to)
    || !/^[a-f0-9]{64}$/.test(hold.approvalNonce || '')) return null;
  return { bookingId, hold, to, minute: minute as 30 | 50, campaignName: String(campaign.nome || 'Servizio fotografico') };
}

interface Dependencies {
  signingKey(): string;
  studio(): Promise<{ name: string; email: string; phone: string; address: string }>;
  send(to: string, subject: string, html: string, id: string): Promise<void>;
}
const defaults: Dependencies = {
  signingKey: approvedDepositSigningKey,
  studio: async () => (await import('../email-routes.js')).getStudioContactInfo(),
  send: async (to, subject, html, id) => {
    await (await import('../email-routes.js')).sendGmailEmail(to, subject, html, undefined,
      { type: 'booking_deposit_reminder', relatedDocId: id, relatedDocType: 'booking' });
  },
};

export async function deliverBookingDepositReminder(db: Firestore, id: string, overrides: Partial<Dependencies> = {}) {
  const deps = { ...defaults, ...overrides };
  const ref = db.collection(DEPOSIT_REMINDER_JOBS).doc(id), lease = randomUUID();
  const claim = await db.runTransaction(async tx => {
    const job = (await tx.get(ref)).data(), now = Date.now();
    if (!job || !['pending', 'preparing', 'sending'].includes(job.status)) return null;
    if (job.status !== 'pending' && millis(job.leaseUntil) > now) return null;
    if (job.status === 'sending') {
      tx.update(ref, { status: 'unknown', updatedAt: Timestamp.fromMillis(now) });
      return null;
    }
    if (Math.max(millis(job.dueAt), millis(job.retryAt) || 0) > now) return null;
    const ctx = await readContext(tx, db, id, job, now);
    const attempts = job.attempts;
    if (!ctx || !Number.isSafeInteger(attempts) || attempts < 0 || attempts >= 3) {
      tx.update(ref, { status: ctx ? 'failed' : 'skipped', updatedAt: Timestamp.fromMillis(now) });
      return null;
    }
    tx.update(ref, { status: 'preparing', lease, leaseUntil: Timestamp.fromMillis(now + LEASE),
      attempts: attempts + 1, updatedAt: Timestamp.fromMillis(now) });
    return { attempts: attempts + 1 };
  });
  if (!claim) return;
  let sending = false;
  try {
    const studio = await deps.studio(), key = deps.signingKey();
    if (!studio.name || !emailValid(studio.email) || !studio.phone) throw new Error('Recapiti studio incompleti');
    const ready = await db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data(), now = Date.now();
      if (job?.status !== 'preparing' || job.lease !== lease) return null;
      // Re-read the booking and its private hold immediately before handing off to Gmail.
      const ctx = await readContext(tx, db, id, job, now);
      const token = ctx && approvedDepositTokenFor(key, ctx.bookingId, ctx.hold.approvalNonce);
      if (!ctx || !token || hashCheckoutToken(token) !== ctx.hold.tokenHash) {
        tx.update(ref, { status: 'skipped', updatedAt: Timestamp.fromMillis(now) });
        return null;
      }
      const message = approvedDepositReminderEmail(ctx.hold, ctx.campaignName, studio, token, ctx.minute);
      tx.update(ref, { status: 'sending', leaseUntil: Timestamp.fromMillis(now + LEASE), updatedAt: Timestamp.fromMillis(now) });
      return { to: ctx.to, bookingId: ctx.bookingId, ...message };
    });
    if (!ready) return;
    sending = true;
    await deps.send(ready.to, ready.subject, ready.html, ready.bookingId);
    await db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data();
      if (job?.status === 'sending' && job.lease === lease) {
        tx.update(ref, { status: 'sent', sentAt: Timestamp.now(), updatedAt: Timestamp.now() });
      }
    });
  } catch {
    logger.error({ reminderId: id, phase: sending ? 'delivery' : 'preparation' }, 'Promemoria acconto non completato');
    await db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data();
      if (job?.lease !== lease || !['preparing', 'sending'].includes(job.status)) return;
      // After Gmail is called, an unconfirmed result cannot authorize a repeat.
      tx.update(ref, { status: sending ? 'unknown' : claim.attempts < 3 ? 'pending' : 'failed',
        ...(sending ? {} : { retryAt: Timestamp.fromMillis(Date.now() + MINUTE) }), updatedAt: Timestamp.now() });
    });
  }
}

export function startBookingDepositReminderWorker(db: Firestore, intervalMs = MINUTE) {
  let running = false, cursor: string | undefined;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void (async () => {
      let query = db.collection(DEPOSIT_REMINDER_JOBS).where('status', 'in', ['pending', 'preparing', 'sending'])
        .orderBy(FieldPath.documentId()).limit(30);
      if (cursor) query = query.startAfter(cursor);
      const batch = await query.get();
      cursor = batch.size === 30 ? batch.docs.at(-1)?.id : undefined;
      for (const doc of batch.docs) await deliverBookingDepositReminder(db, doc.id);
    })().catch(() => logger.error('Controllo promemoria acconto non completato')).finally(() => { running = false; });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
