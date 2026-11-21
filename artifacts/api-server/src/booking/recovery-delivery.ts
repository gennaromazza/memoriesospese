import { createHash, randomUUID } from 'node:crypto';
import { FieldPath, Timestamp, type Firestore, type Transaction, type DocumentData } from 'firebase-admin/firestore';
import { logger } from '../lib/logger.js';
import { CHECKOUT_HOLDS, checkoutHoldBlocksSlot } from './slot-reservations.js';
import { approvedDepositDeadline, unpaidDepositRequestExpired } from './payment-deadlines.js';
import { RECOVERY_JOBS, RECOVERY_DELAY_MS, millis, recoveryCampaignOpen } from './recovery-queue.js';
import { bookingRecoveryEmail, type RecoveryStudio } from './recovery-email.js';

const RECOVERY_RECIPIENTS = 'bookingRecoveryRecipients', LEASE_MS = 180_000;
const normalize = (email: unknown) => typeof email === 'string' ? email.trim().toLowerCase() : '';
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/[\r\n]/.test(email);
const uncertain = (source: DocumentData | undefined) => source && (source.depositPayment || source.paymentReviewRequired
  || source.depositWaiver || Number(source.acconto || 0) !== 0 || source.transactions?.length
  || source.paypalCaptureAttempt && source.paypalCaptureAttempt.state !== 'declined'
  || source.customerReschedule || source.bookingCancellation || source.calendarSyncPending || source.automaticConfirmationError);
const contact = (source: DocumentData) => source.cliente || source.draft?.cliente || {};
const sameContact = (first: DocumentData, second: DocumentData) => {
  const phone = (value: unknown) => String(value || '').replace(/\D/g, '');
  const a = contact(first), b = contact(second), number = phone(a.whatsapp);
  return normalize(a.email) === normalize(b.email) || number.length >= 7 && number === phone(b.whatsapp);
};

interface Context { email: string; name: string; campaign: DocumentData }
async function context(tx: Transaction, db: Firestore, id: string, job: DocumentData): Promise<Context | null> {
  if (job.bookingId !== id || typeof job.campaignId !== 'string' || !job.campaignId || job.campaignId.includes('/')) return null;
  const root = (await tx.get(db.collection('bookings').doc(id))).data();
  const hold = (await tx.get(db.collection(CHECKOUT_HOLDS).doc(id))).data();
  const campaign = (await tx.get(db.collection('booking_campaigns').doc(job.campaignId))).data();
  const deadline = millis(job.deadline);
  if (!recoveryCampaignOpen(campaign, deadline) || Date.now() > deadline + 24 * RECOVERY_DELAY_MS
    || uncertain(root) || uncertain(hold)) return null;
  if (root && (root.campaignId !== job.campaignId || root.stato !== 'annullata'
    || root.depositPaymentRequest?.status !== 'expired' || approvedDepositDeadline(root) !== deadline)) return null;
  if (hold && (hold.campaignId !== job.campaignId || hold.status !== 'expired'
    || millis(hold.expiresAt) !== deadline)) return null;
  const source = root || hold;
  if (!source) return null;
  const email = normalize(contact(source).email);
  if (!validEmail(email) || contact(source).unsubscribed === true || contact(source).marketingUnsubscribed === true) return null;
  const bookings = await tx.get(db.collection('bookings').where('campaignId', '==', job.campaignId));
  const holds = await tx.get(db.collection(CHECKOUT_HOLDS).where('campaignId', '==', job.campaignId));
  if (bookings.docs.some(doc => doc.id !== id && sameContact(source, doc.data())
    && (uncertain(doc.data()) || ['confermata', 'completata'].includes(doc.data().stato)
      || !['annullata', 'cancellata'].includes(doc.data().stato)
      && !unpaidDepositRequestExpired(doc.data())))) return null;
  if (holds.docs.some(doc => doc.id !== id && sameContact(source, doc.data())
    && (uncertain(doc.data()) || checkoutHoldBlocksSlot(doc.data())))) return null;
  return { email, name: String(contact(source).nome || ''), campaign: campaign! };
}

export interface RecoveryDependencies {
  studio(): Promise<RecoveryStudio>;
  send(to: string, subject: string, html: string, bookingId: string): Promise<void>;
}
const defaults: RecoveryDependencies = {
  studio: async () => (await import('../email-routes.js')).getStudioContactInfo(),
  send: async (to, subject, html, id) => {
    await (await import('../email-routes.js')).sendGmailEmail(to, subject, html, undefined,
      { type: 'booking_deposit_recovery', relatedDocId: id, relatedDocType: 'booking' });
  },
};

/** One attempt to send. A timeout/crash in the email phase is ambiguous and is never retried automatically. */
export async function deliverBookingRecovery(db: Firestore, id: string, overrides: Partial<RecoveryDependencies> = {}) {
  const deps = { ...defaults, ...overrides }, ref = db.collection(RECOVERY_JOBS).doc(id), lease = randomUUID();
  const claimed = await db.runTransaction(async tx => {
    const job = (await tx.get(ref)).data();
    if (!job || !['pending', 'preparing', 'sending'].includes(job.status)) return null;
    if (job.status !== 'pending' && millis(job.leaseUntil) > Date.now()) return null;
    if (job.status === 'sending') {
      tx.update(ref, { status: 'unknown', updatedAt: Timestamp.now() }); return null;
    }
    const due = millis(job.notBefore);
    if (!Number.isFinite(due) || !Number.isFinite(millis(job.deadline)) || due < millis(job.deadline) + RECOVERY_DELAY_MS) {
      tx.update(ref, { status: 'skipped', reason: 'invalid_deadline', updatedAt: Timestamp.now() }); return null;
    }
    if (due > Date.now()) return null;
    // Hold and root expiry sweeps can be on different pages: wait for the root cancellation.
    const root = (await tx.get(db.collection('bookings').doc(id))).data();
    if (root?.stato === 'in_attesa' && root.depositPaymentRequest?.status === 'pending'
      && unpaidDepositRequestExpired(root) && !uncertain(root)
      && Date.now() <= millis(job.deadline) + 24 * RECOVERY_DELAY_MS) return null;
    const ctx = await context(tx, db, id, job);
    if (!ctx) {
      tx.update(ref, { status: 'skipped', reason: 'no_longer_eligible', updatedAt: Timestamp.now() }); return null;
    }
    const attempts = Number(job.attempts || 0);
    if (!Number.isSafeInteger(attempts) || attempts < 0 || attempts >= 3) {
      tx.update(ref, { status: 'failed', updatedAt: Timestamp.now() }); return null;
    }
    tx.update(ref, { status: 'preparing', lease, attempts: attempts + 1,
      leaseUntil: Timestamp.fromMillis(Date.now() + LEASE_MS), updatedAt: Timestamp.now() });
    return { ctx, job, attempts: attempts + 1 };
  });
  if (!claimed) return;
  let sending = false;
  try {
    const studio = await deps.studio();
    if (!studio.name || !validEmail(studio.email) || !studio.phone) throw new Error('Recapiti studio incompleti');
    const message = bookingRecoveryEmail(claimed.ctx.name, claimed.ctx.campaign.nome, claimed.ctx.campaign.code, studio);
    const recipientKey = createHash('sha256').update(`${claimed.job.campaignId}\n${claimed.ctx.email}`).digest('hex');
    const recipientRef = db.collection(RECOVERY_RECIPIENTS).doc(recipientKey);
    const ready = await db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data();
      if (job?.status !== 'preparing' || job.lease !== lease) return false;
      const ctx = await context(tx, db, id, job);
      const recipient = (await tx.get(recipientRef)).data();
      if (!ctx || recipient || ctx.email !== claimed.ctx.email || ctx.campaign.nome !== claimed.ctx.campaign.nome
        || ctx.campaign.code !== claimed.ctx.campaign.code) {
        tx.update(ref, { status: 'skipped', reason: recipient ? 'already_contacted' : 'changed_before_send', updatedAt: Timestamp.now() });
        return false;
      }
      tx.set(recipientRef, { bookingId: id, campaignId: job.campaignId, status: 'sending', createdAt: Timestamp.now() });
      tx.update(ref, { status: 'sending', leaseUntil: Timestamp.fromMillis(Date.now() + LEASE_MS), updatedAt: Timestamp.now() });
      return true;
    });
    if (!ready) return;
    sending = true;
    await deps.send(claimed.ctx.email, message.subject, message.html, id);
    // Never release the recipient guard if persistence fails after the provider accepted the email.
    await db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data();
      if (job?.lease !== lease || job.status !== 'sending') return;
      tx.update(ref, { status: 'sent', sentAt: Timestamp.now(), updatedAt: Timestamp.now() });
      tx.update(recipientRef, { status: 'sent', sentAt: Timestamp.now() });
    });
  } catch {
    logger.error({ bookingId: id, phase: sending ? 'email' : 'preparing' }, 'Email recupero prenotazione non completata');
    await db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data();
      if (job?.lease !== lease || !['preparing', 'sending'].includes(job.status)) return;
      tx.update(ref, { status: sending ? 'unknown' : claimed.attempts < 3 ? 'pending' : 'failed',
        ...(sending ? {} : { notBefore: Timestamp.fromMillis(Date.now() + 60_000) }), updatedAt: Timestamp.now() });
    });
  }
}

export function startBookingRecoveryWorker(db: Firestore, intervalMs = 60_000) {
  let running = false, cursor: string | undefined;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void (async () => {
      let query = db.collection(RECOVERY_JOBS).where('status', 'in', ['pending', 'preparing', 'sending'])
        .orderBy(FieldPath.documentId()).limit(20);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      cursor = page.size === 20 ? page.docs.at(-1)!.id : undefined;
      for (const doc of page.docs) await deliverBookingRecovery(db, doc.id);
    })().catch(() => logger.error('Controllo email recupero prenotazioni non completato'))
      .finally(() => { running = false; });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
