import { Timestamp, type Firestore, type Transaction, type DocumentData } from 'firebase-admin/firestore';
import { DateTime } from 'luxon';
export const RECOVERY_JOBS = 'bookingRecoveryJobs';
export const RECOVERY_DELAY_MS = 3_600_000;
export const millis = (value: any): number => value?.toMillis?.() ?? NaN;

export function recoveryCampaignOpen(campaign: DocumentData | undefined, deadline: number, now = Date.now()) {
  return !!campaign && campaign.attiva === true && campaign.richiedeAcconto === true
    && campaign.emailRecuperoAcconto === true && Number.isFinite(deadline)
    && Number.isFinite(millis(campaign.recuperoAccontoAttivatoIl))
    && deadline >= millis(campaign.recuperoAccontoAttivatoIl)
    && DateTime.fromMillis(millis(campaign.dataFine), { zone: 'Europe/Rome' }).endOf('day').toMillis() > now
    && typeof campaign.code === 'string' && /^[A-Za-z0-9]{1,8}$/.test(campaign.code);
}

/** Called before the expiry transaction's writes. No historic backfill, no email here. */
export async function enqueueBookingRecovery(tx: Transaction, db: Firestore, id: string,
  campaignId: unknown, deadline: number) {
  if (typeof campaignId !== 'string' || !campaignId || campaignId.includes('/')) return;
  const campaign = (await tx.get(db.collection('booking_campaigns').doc(campaignId))).data();
  if (!recoveryCampaignOpen(campaign, deadline) || Date.now() > deadline + 24 * RECOVERY_DELAY_MS) return;
  const ref = db.collection(RECOVERY_JOBS).doc(id);
  if ((await tx.get(ref)).exists) return;
  tx.set(ref, { bookingId: id, campaignId, deadline: Timestamp.fromMillis(deadline),
    notBefore: Timestamp.fromMillis(deadline + RECOVERY_DELAY_MS), status: 'pending', attempts: 0,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
}
