import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const Timestamp = {
    now: () => new Date(),
    fromDate: (date: Date) => ({ toDate: () => date }),
  };
  const FieldValue = {
    arrayUnion: (...items: any[]) => ({ __arrayUnion: items }),
    delete: () => ({ __delete: true }),
    serverTimestamp: () => ({ __serverTimestamp: true }),
  };
  return {
    db: null as any,
    sendGmailEmail: null as any,
    Timestamp,
    FieldValue,
  };
});

vi.mock("./firebase-admin.js", () => ({
  db: new Proxy({}, {
    get: (_target, property) => (...args: any[]) => h.db[property as string](...args),
  }),
  Timestamp: h.Timestamp,
  FieldValue: h.FieldValue,
}));

vi.mock("./email-routes.js", () => ({
  authenticateFirebase: () => (_req: any, _res: any, next: () => void) => next(),
  sendGmailEmail: (...args: any[]) => h.sendGmailEmail(...args),
}));

import {
  getFollowUpDashboard,
  recordFollowUpEvent,
  runFollowUpCheck,
} from "./follow-up-routes.js";

type StoredCollections = Record<string, Record<string, Record<string, any>>>;

function makeDb(initial: StoredCollections = {}) {
  const collections: StoredCollections = {};
  for (const [name, docs] of Object.entries(initial)) {
    collections[name] = Object.fromEntries(
      Object.entries(docs).map(([id, data]) => [id, { ...data }]),
    );
  }
  let transactionTail = Promise.resolve();
  let generatedId = 0;

  function materialize(value: any): any {
    if (value?.__serverTimestamp) return new Date();
    if (value?.toDate && typeof value.toDate === "function") return value;
    return value;
  }

  function applyUpdate(collectionName: string, id: string, update: Record<string, any>) {
    const collection = (collections[collectionName] ||= {});
    const current = (collection[id] ||= {});
    for (const [key, value] of Object.entries(update)) {
      if ((value as any)?.__delete) {
        delete current[key];
      } else if (Array.isArray((value as any)?.__arrayUnion)) {
        const values = Array.isArray(current[key]) ? current[key] : [];
        current[key] = [...values, ...(value as any).__arrayUnion.filter((item: any) => !values.includes(item))];
      } else {
        current[key] = materialize(value);
      }
    }
  }

  function snapshot(collectionName: string, id: string) {
    const data = collections[collectionName]?.[id];
    return {
      id,
      exists: Boolean(data),
      data: () => data,
    };
  }

  function docRef(collectionName: string, id: string) {
    return {
      id,
      get: async () => snapshot(collectionName, id),
      set: async (data: Record<string, any>, options?: { merge?: boolean }) => {
        const current = collections[collectionName]?.[id];
        if (options?.merge && current) {
          applyUpdate(collectionName, id, data);
        } else {
          collections[collectionName] ||= {};
          collections[collectionName][id] = Object.fromEntries(
            Object.entries(data).map(([key, value]) => [key, materialize(value)]),
          );
        }
      },
      update: async (data: Record<string, any>) => applyUpdate(collectionName, id, data),
    };
  }

  function queryRef(collectionName: string, filters: Array<[string, string, any]> = []) {
    let max: number | undefined;
    const query: any = {
      where: (field: string, op: string, value: any) => {
        filters.push([field, op, value]);
        return query;
      },
      limit: (value: number) => {
        max = value;
        return query;
      },
      get: async () => {
        let entries = Object.entries(collections[collectionName] || {}).filter(([, data]) =>
          filters.every(([field, op, value]) => op === "==" && data[field] === value),
        );
        if (max !== undefined) entries = entries.slice(0, max);
        return {
          docs: entries.map(([id]) => snapshot(collectionName, id)),
          size: entries.length,
        };
      },
    };
    return query;
  }

  const db = {
    collection(name: string) {
      return {
        doc: (id: string) => docRef(name, id),
        add: async (data: Record<string, any>) => {
          const id = `generated-${++generatedId}`;
          await docRef(name, id).set(data);
          return { id };
        },
        where: (field: string, op: string, value: any) => queryRef(name, [[field, op, value]]),
        limit: (value: number) => queryRef(name).limit(value),
        get: async () => queryRef(name).get(),
      };
    },
    runTransaction: async (callback: (transaction: any) => Promise<void>) => {
      const result = transactionTail.then(async () => {
        const transaction = {
          get: async (ref: any) => ref.get(),
          set: (ref: any, data: Record<string, any>, options?: { merge?: boolean }) =>
            ref.set(data, options),
          update: (ref: any, data: Record<string, any>) => ref.update(data),
        };
        await callback(transaction);
      });
      transactionTail = result.then(() => undefined, () => undefined);
      return result;
    },
  };

  return { db, collections };
}

function followUpSequence() {
  return {
    id: "default",
    name: "Test",
    serviceType: "*",
    enabled: true,
    mode: "automatic",
    steps: [{ step: 1, delayDays: 0, templateId: "step-1", enabled: true }],
  };
}

function followUpTemplate() {
  return {
    id: "step-1",
    name: "Test",
    serviceType: "*",
    step: 1,
    active: true,
    subject: "Promemoria",
    bodyHtml: "<p>Ciao [nome cliente]</p>",
    cta: "none",
    version: 1,
  };
}

function quoteData(overrides: Record<string, any> = {}) {
  return {
    jobId: "job-1",
    status: "inviato",
    sentAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    publicToken: "public-token",
    totalAfterDiscount: 1200,
    ...overrides,
  };
}

function jobData(overrides: Record<string, any> = {}) {
  return {
    nomeEvento: "Matrimonio",
    jobType: "matrimonio",
    status: "lead",
    clientiIds: ["client-1"],
    eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

function baseDb(overrides: {
  quote?: Record<string, any>;
  job?: Record<string, any>;
  client?: Record<string, any>;
  extraQuotes?: Record<string, Record<string, any>>;
  bookings?: Record<string, Record<string, any>>;
  state?: Record<string, any>;
} = {}) {
  return makeDb({
    followUpSequences: { default: followUpSequence() },
    followUpTemplates: { "step-1": followUpTemplate() },
    quotes: {
      "quote-1": quoteData(overrides.quote),
      ...(overrides.extraQuotes || {}),
    },
    jobs: { "job-1": jobData(overrides.job) },
    clienti: { "client-1": { nome: "Mario", cognome: "Rossi", email: "mario@example.com", ...(overrides.client || {}) } },
    bookings: overrides.bookings || {},
    ...(overrides.state ? { quoteFollowUps: { "quote-1": overrides.state } } : {}),
  });
}

describe("runFollowUpCheck — invii idempotenti", () => {
  beforeEach(() => {
    vi.useRealTimers();
    h.db = null;
    h.sendGmailEmail = vi.fn(async () => undefined);
  });

  it("invii concorrenti sullo stesso preventivo producono un solo messaggio e un solo evento", async () => {
    const { db, collections } = baseDb();
    h.db = db;
    let releaseSend!: () => void;
    let sendStarted!: () => void;
    const sendGate = new Promise<void>((resolve) => { releaseSend = resolve; });
    const started = new Promise<void>((resolve) => { sendStarted = resolve; });
    h.sendGmailEmail = vi.fn(async () => {
      sendStarted();
      await sendGate;
    });

    const first = runFollowUpCheck();
    await started;
    const second = runFollowUpCheck();
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseSend();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.sent + secondResult.sent).toBe(1);
    expect(firstResult.skipped + secondResult.skipped).toBe(1);
    expect(h.sendGmailEmail).toHaveBeenCalledTimes(1);
    const events = Object.values(collections.followUpEvents || {});
    expect(events.filter((event) => event.type === "quote_sent")).toHaveLength(1);
    expect(events.filter((event) => event.type === "followup_due")).toHaveLength(1);
    expect(events.filter((event) => event.type === "followup_sent")).toHaveLength(1);
    expect(collections.quoteFollowUps?.["quote-1"].sentSteps).toEqual([1]);
    expect(collections.quoteFollowUps?.["quote-1"].sendingLock).toBeUndefined();
  });

  it("rilascia il lock se Gmail fallisce e consente il ritentativo successivo", async () => {
    const { db, collections } = baseDb();
    h.db = db;
    h.sendGmailEmail = vi.fn()
      .mockRejectedValueOnce(new Error("Gmail non disponibile"))
      .mockResolvedValueOnce(undefined);

    const failed = await runFollowUpCheck();
    expect(failed.sent).toBe(0);
    expect(failed.errors).toEqual(["quote-1"]);
    expect(collections.quoteFollowUps?.["quote-1"].sendingLock).toBeUndefined();
    expect(collections.quoteFollowUps?.["quote-1"].sentSteps).toEqual([]);

    const retried = await runFollowUpCheck();
    expect(retried.sent).toBe(1);
    expect(h.sendGmailEmail).toHaveBeenCalledTimes(2);
    const events = Object.values(collections.followUpEvents || {});
    expect(events.filter((event) => event.type === "followup_sent")).toHaveLength(1);
  });

  it.each([
    ["firma", { quote: { signature: { signedAt: new Date() } } }, {}],
    ["booking", {}, { bookings: { "booking-1": { jobId: "job-1", stato: "confermata" } } }],
    ["preventivo più recente", { extraQuotes: { "quote-2": quoteData({ jobId: "job-1", sentAt: new Date(), status: "bozza" }) } }, {}],
    ["evento passato", { job: { eventDate: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, {}],
    ["email non valida", { client: { email: "non-valida" } }, {}],
  ] as const)("si ferma quando il preventivo ha %s", async (_reason, fixture, extra) => {
    const { db } = baseDb({ ...fixture, ...extra });
    h.db = db;

    const result = await runFollowUpCheck();

    expect(result.checked).toBe(0);
    expect(result.sent).toBe(0);
    expect(h.sendGmailEmail).not.toHaveBeenCalled();
  });
});

describe("follow-up events e valore assistito", () => {
  beforeEach(() => {
    h.db = null;
  });

  it("conta una sola volta il valore di un preventivo firmato anche con eventi duplicati", async () => {
    const { db, collections } = baseDb({
      state: {
        quoteId: "quote-1",
        jobId: "job-1",
        status: "active",
        sentSteps: [1],
        quoteSentAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
    });
    h.db = db;

    await recordFollowUpEvent("quote-1", "quote_signed", { value: 1200 });
    await recordFollowUpEvent("quote-1", "quote_signed", { value: 1200 });
    const dashboard = await getFollowUpDashboard();

    const events = Object.values(collections.followUpEvents || {});
    expect(events.filter((event) => event.type === "quote_signed")).toHaveLength(2);
    expect(collections.quoteFollowUps?.["quote-1"].signedValue).toBe(1200);
    expect(collections.quoteFollowUps?.["quote-1"].status).toBe("converted");
    expect(dashboard.stats.sentByStep).toEqual({ "1": 1 });
    expect(dashboard.stats.assistedValue).toBe(1200);
  });
});