import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredEmail = Record<string, any>;

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

function makeDb() {
  const emails = new Map<string, StoredEmail>();
  let nextId = 1;
  let lock: StoredEmail | null = null;

  const getQuery = (filters: Array<[string, string, any]>, limit?: number) => {
    let entries = [...emails.entries()].filter(([, email]) =>
      filters.every(([field, operator, expected]) => {
        const actual = email[field];
        if (operator === "==") return actual === expected;
        if (operator === ">=") return actual >= expected;
        if (operator === "<=") return actual <= expected;
        return false;
      }),
    );

    entries.sort(([, left], [, right]) => {
      const leftDate = left.scheduledFor instanceof Date ? left.scheduledFor.getTime() : 0;
      const rightDate = right.scheduledFor instanceof Date ? right.scheduledFor.getTime() : 0;
      return leftDate - rightDate;
    });

    if (limit !== undefined) entries = entries.slice(0, limit);

    const docs = entries.map(([id, data]) => ({
      id,
      data: () => ({ ...data }),
      ref: {
        update: async (updates: StoredEmail) => {
          Object.assign(data, updates);
        },
      },
    }));

    return {
      get: async () => ({
        empty: docs.length === 0,
        size: docs.length,
        docs,
      }),
    };
  };

  const collection = {
    add: async (data: StoredEmail) => {
      const id = `email-${nextId++}`;
      emails.set(id, { ...data });
      return { id };
    },
    where: (field: string, operator: string, expected: any) => {
      const filters: Array<[string, string, any]> = [[field, operator, expected]];
      let limit: number | undefined;
      const query: any = {
        where: (nextField: string, nextOperator: string, nextExpected: any) => {
          filters.push([nextField, nextOperator, nextExpected]);
          return query;
        },
        orderBy: () => query,
        limit: (nextLimit: number) => {
          limit = nextLimit;
          return query;
        },
        get: async () => getQuery(filters, limit).get(),
      };
      return query;
    },
  };

  const db = {
    collection: () => collection,
    doc: () => ({
      get: async () => ({
        exists: lock !== null,
        data: () => lock,
      }),
      set: async (data: StoredEmail) => {
        lock = { ...data };
      },
      delete: async () => {
        lock = null;
      },
    }),
  };

  return {
    db,
    emails,
    getEmail: (id: string) => emails.get(id),
  };
}

describe("EmailQueue", () => {
  beforeEach(() => {
    h.db = makeDb().db;
    h.sendGmailEmail.mockReset();
  });

  it("accoda con enqueue e mantiene l'adapter legacy", async () => {
    const store = makeDb();
    h.db = store.db;
    const id = await EmailQueue.enqueue({
      to: "cliente@example.com",
      subject: "Nuove foto",
      htmlContent: "<p>Ciao</p>",
      priority: "high",
      metadata: { type: "new_photos" },
    });
    const legacyId = await EmailQueue.addEmailToQueue(
      "legacy@example.com",
      "Legacy",
      "<p>Legacy</p>",
    );

    expect(id).toBe("email-1");
    expect(legacyId).toBe("email-2");
    expect(store.getEmail(id)).toMatchObject({
      to: ["cliente@example.com"],
      subject: "Nuove foto",
      htmlContent: "<p>Ciao</p>",
      priority: "high",
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      metadata: { type: "new_photos" },
    });
    expect(store.getEmail(legacyId)).toMatchObject({
      to: ["legacy@example.com"],
      subject: "Legacy",
      htmlContent: "<p>Legacy</p>",
      priority: "normal",
      status: "pending",
    });
  });

  it("rischedula gli errori e processa con successo il retry", async () => {
    const store = makeDb();
    h.db = store.db;
    const id = await EmailQueue.enqueue({
      to: ["cliente@example.com"],
      subject: "Test retry",
      htmlContent: "<p>Test</p>",
    });
    h.sendGmailEmail
      .mockImplementationOnce(async () => {
        expect(store.getEmail(id)?.status).toBe("processing");
        throw new Error("temporary failure");
      })
      .mockImplementationOnce(async () => {
        expect(store.getEmail(id)?.status).toBe("processing");
      });

    await EmailQueue.processQueue();

    const queued = store.getEmail(id)!;
    expect(queued.status).toBe("pending");
    expect(queued.attempts).toBe(1);
    expect(queued.errorMessage).toBe("temporary failure");
    expect(queued.scheduledFor.getTime()).toBeGreaterThan(Date.now());

    queued.scheduledFor = new Date(Date.now() - 1);
    await EmailQueue.processQueue();

    expect(queued.status).toBe("sent");
    expect(queued.attempts).toBe(1);
    expect(queued.processedAt).toBeInstanceOf(Date);
    expect(h.sendGmailEmail).toHaveBeenCalledTimes(2);
  });
});