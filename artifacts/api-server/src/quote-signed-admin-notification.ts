import type { Firestore, FieldValue } from "firebase-admin/firestore";

export interface QuoteSignedAdminNotificationInput {
  quoteId: string;
  jobId: string;
  clientName: string;
  eventName: string;
  total: number;
}

/**
 * Creates one persistent admin notification per signed quote.
 * Retries leave an existing notification (including its read state) untouched.
 */
export async function ensureQuoteSignedAdminNotification(
  db: Firestore,
  createdAt: FieldValue,
  input: QuoteSignedAdminNotificationInput,
): Promise<boolean> {
  const notificationRef = db
    .collection("adminNotifications")
    .doc(`quote-signed-${input.quoteId}`);

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(notificationRef);
    if (existing.exists) return false;

    transaction.create(notificationRef, {
      type: "quote_signed",
      title: "Preventivo firmato",
      description: `${input.clientName} · ${input.eventName} (€${input.total.toFixed(2)})`,
      clientName: input.clientName,
      jobId: input.jobId,
      quoteId: input.quoteId,
      isRead: false,
      createdAt,
      deepLink: `/admin/dashboard?tab=lavori&job=${encodeURIComponent(input.jobId)}`,
    });
    return true;
  });
}
