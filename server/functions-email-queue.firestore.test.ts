import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const h = vi.hoisted(() => ({
  db: null as any,
  sendGmailEmail: vi.fn(),
}));

vi.mock("../functions/src/firebase-admin", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, property: string) => (...args: any[]) =>
        h.db[property](...args),
    },
  ),
}));

vi.mock("../functions/src/gmail", () => ({
  sendGmailEmail: (...args: any[]) => h.sendGmailEmail(...args),
}));

vi.mock("firebase-functions", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { EmailQueue } from "../functions/src/email-queue";
import { sendGmailEmail } from "../functions/src/gmail";

const firestoreIntegration = process.env.FIRESTORE_EMULATOR_HOST
  ? describe
  : describe.skip;

firestoreIntegration("EmailQueue — Firestore transaction integration", () => {
  const projectId = process.env.GCLOUD_PROJECT ?? "print-shop-rules-test";
  const app = getApps()[0] ?? initializeApp({ projectId });
  const db = getFirestore(app);

  beforeAll(() => {
    h.db = db;
  });

  afterAll(async () => {
    if (!db) return;

    const snapshot = await db.collection("emailQueue").get();
    await Promise.all(snapshot.docs.map((doc: any) => doc.ref.delete()));
    await db.doc("locks/emailQueue").delete().catch(() => undefined);
  });

  it("non recupera né reinvia quando il worker originale rinnova la lease concorrente", async () => {
    const now = Date.now();
    const workerId = "worker-originale";
    const docRef = db.collection("emailQueue").doc("firestore-race");
    const staleLease = new Date(now - 1_000);
    const renewedLease = new Date(now + 15 * 60 * 1_000);

    await docRef.set({
      to: ["cliente@example.com"],
      subject: "Race Firestore",
      htmlContent: "<p>Test</p>",
      from: "Memorie Sospese <memoriesospese@gennaromazzacane.it>",
      priority: "normal",
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(now - 20 * 60 * 1_000),
      scheduledFor: new Date(now - 20 * 60 * 1_000),
      status: "processing",
      processingStartedAt: new Date(now - 16 * 60 * 1_000),
      processingLeaseUntil: staleLease,
      processingWorkerId: workerId,
    });

    let releaseOriginalRead!: () => void;
    const originalReadReleased = new Promise<void>((resolve) => {
      releaseOriginalRead = resolve;
    });
    let originalReadStarted!: () => void;
    const originalReadReady = new Promise<void>((resolve) => {
      originalReadStarted = resolve;
    });

    const originalRunTransaction = db.runTransaction.bind(db);
    let transactionNumber = 0;
    db.runTransaction = (updateFunction: (transaction: any) => Promise<any>) => {
      const currentTransactionNumber = ++transactionNumber;
      let readWasHeld = false;

      return originalRunTransaction(async (transaction: any) => {
        const instrumentedTransaction = new Proxy(transaction, {
          get(target, property, receiver) {
            if (property === "get") {
              return async (...args: any[]) => {
                const snapshot = await target.get(...args);

                if (!readWasHeld && currentTransactionNumber === 1) {
                  readWasHeld = true;
                  originalReadStarted();
                  await originalReadReleased;
                }

                return snapshot;
              };
            }

            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });

        return updateFunction(instrumentedTransaction);
      });
    };

    const originalCollection = db.collection.bind(db);
    db.collection = (path: string) => {
      const collection = originalCollection(path);
      if (path !== "emailQueue") return collection;

      const originalWhere = collection.where.bind(collection);
      collection.where = (...args: any[]) => {
        const query = originalWhere(...args);
        const isProcessingQuery =
          args[0] === "status" &&
          args[1] === "==" &&
          args[2] === "processing";
        if (!isProcessingQuery) return query;

        const originalGet = query.get.bind(query);
        query.get = async (...getArgs: any[]) => {
          const snapshot = await originalGet(...getArgs);
          recoveryQueryRead();
          await recoveryQueryReadReleased;
          return snapshot;
        };
        return query;
      };

      return collection;
    };

    let releaseRecoveryQuery!: () => void;
    const recoveryQueryReadReleased = new Promise<void>((resolve) => {
      releaseRecoveryQuery = resolve;
    });
    let recoveryQueryRead!: () => void;
    const recoveryQueryReadReady = new Promise<void>((resolve) => {
      recoveryQueryRead = () => resolve();
    });

    const internals = EmailQueue as {
      updateOwnedEmail: (
        ref: any,
        worker: string,
        updates: Record<string, any>,
      ) => Promise<boolean>;
      recoverStaleProcessing: (timestamp: number) => Promise<number>;
    };

    const renewal = internals.updateOwnedEmail(docRef, workerId, {
      processingStartedAt: new Date(now),
      processingLeaseUntil: renewedLease,
    });
    await originalReadReady;

    const recovery = internals.recoverStaleProcessing(now);
    await recoveryQueryReadReady;

    // The recovery query saw the expired lease while the original worker's
    // transaction was still open. Let the original worker renew first; the
    // recovery transaction must then reject its stale query result.
    releaseOriginalRead();
    expect(await renewal).toBe(true);
    releaseRecoveryQuery();

    expect(await recovery).toBe(0);

    const current = await docRef.get();
    expect(current.data()).toMatchObject({
      status: "processing",
      processingWorkerId: workerId,
    });
    expect(current.data().processingLeaseUntil.toMillis()).toBeGreaterThan(now);

    h.sendGmailEmail.mockResolvedValue(undefined);
    await sendGmailEmail(
      current.data().to,
      current.data().subject,
      current.data().htmlContent,
      current.data().from,
    );
    expect(
      await internals.updateOwnedEmail(docRef, workerId, {
        status: "sent",
        processedAt: new Date(),
        processingStartedAt: null,
        processingLeaseUntil: null,
        processingWorkerId: null,
      }),
    ).toBe(true);

    // A completed document cannot be reclaimed by a later recovery pass.
    expect(await internals.recoverStaleProcessing(Date.now() + 20 * 60 * 1_000)).toBe(0);
    expect((await docRef.get()).data().status).toBe("sent");
    expect(h.sendGmailEmail).toHaveBeenCalledTimes(1);
  });
});