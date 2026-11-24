import { createHash } from 'node:crypto';
import { Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';

export const DEPOSIT_REMINDER_JOBS = 'bookingDepositReminderJobs';
export const DEPOSIT_REMINDER_MINUTES = [30, 50] as const;

export function depositReminderJobId(bookingId: string, minute: number) {
  return createHash('sha256').update(`${bookingId}\n${minute}`).digest('hex');
}

/** Schedule the two reminders in the approval transaction; repeated approvals cannot duplicate them. */
export async function enqueueBookingDepositReminders(
  tx: Transaction,
  db: Firestore,
  bookingId: string,
  campaignId: string,
  request: { requestedAt: Timestamp; expiresAt: Timestamp },
  enabled: boolean,
) {
  if (!enabled || request.expiresAt.toMillis() - request.requestedAt.toMillis() < 50 * 60_000) return;
  const jobs = DEPOSIT_REMINDER_MINUTES.map(minute => {
    const ref = db.collection(DEPOSIT_REMINDER_JOBS).doc(depositReminderJobId(bookingId, minute));
    return { minute, ref, dueAt: Timestamp.fromMillis(request.requestedAt.toMillis() + minute * 60_000) };
  });
  const existing = await Promise.all(jobs.map(job => tx.get(job.ref)));
  jobs.forEach((job, index) => {
    if (!existing[index].exists) {
      tx.set(job.ref, {
        bookingId,
        campaignId,
        minute: job.minute,
        dueAt: job.dueAt,
        deadline: request.expiresAt,
        status: 'pending',
        attempts: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }
  });
}
