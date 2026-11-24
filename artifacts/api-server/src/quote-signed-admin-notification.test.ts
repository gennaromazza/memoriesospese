import { describe, expect, it } from "vitest";
import type { FieldValue, Firestore } from "firebase-admin/firestore";
import { ensureQuoteSignedAdminNotification } from "./quote-signed-admin-notification.js";

function makeStore(initial: Record<string, Record<string, unknown>> = {}) {
  const documents = new Map(Object.entries(initial));
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => `${name}/${id}`,
    }),
    runTransaction: async (callback: (transaction: any) => Promise<unknown>) =>
      callback({
        get: async (ref: string) => ({
          exists: documents.has(ref),
          data: () => documents.get(ref),
        }),
        create: (ref: string, data: Record<string, unknown>) => {
          if (documents.has(ref)) throw new Error(`Document already exists: ${ref}`);
          documents.set(ref, data);
        },
      }),
  };

  return { db: db as unknown as Firestore, documents };
}

const notificationInput = {
  quoteId: "quote-123",
  jobId: "job-456",
  clientName: "Cliente Test",
  eventName: "Matrimonio",
  total: 1250,
};
const timestamp = { sentinel: "server-timestamp" } as unknown as FieldValue;

describe("ensureQuoteSignedAdminNotification", () => {
  it("creates an unread notification with a stable job link", async () => {
    const { db, documents } = makeStore();

    const created = await ensureQuoteSignedAdminNotification(db, timestamp, notificationInput);

    expect(created).toBe(true);
    expect(documents.get("adminNotifications/quote-signed-quote-123")).toMatchObject({
      type: "quote_signed",
      title: "Preventivo firmato",
      description: "Cliente Test · Matrimonio (€1250.00)",
      clientName: "Cliente Test",
      jobId: "job-456",
      quoteId: "quote-123",
      isRead: false,
      createdAt: timestamp,
      deepLink: "/admin/dashboard?tab=lavori&job=job-456",
    });
  });

  it("does not replace an existing notification or reset its read state on retry", async () => {
    const existing = { ...notificationInput, isRead: true, title: "Already read" };
    const { db, documents } = makeStore({
      "adminNotifications/quote-signed-quote-123": existing,
    });

    const created = await ensureQuoteSignedAdminNotification(db, timestamp, notificationInput);

    expect(created).toBe(false);
    expect(documents.get("adminNotifications/quote-signed-quote-123")).toBe(existing);
  });
});
