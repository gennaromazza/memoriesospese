import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  settings: {
    name: "Studio corrente",
    quoteTheme: { primaryColor: "#123456", secondaryColor: "#ABCDEF" },
  } as Record<string, any> | null,
  createdQuotes: [] as Array<Record<string, any>>,
}));

vi.mock("./firebase", () => ({ db: {}, storage: {} }));

vi.mock("firebase/firestore", () => {
  class MockTimestamp extends Date {
    static now() {
      return new MockTimestamp("2026-10-23T12:00:00.000Z");
    }

    static fromDate(date: Date) {
      return date;
    }
  }

  return {
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDoc: vi.fn(async (ref) => {
    if (ref.collectionName === "settings") {
      return {
        exists: () => h.settings !== null,
        data: () => h.settings,
      };
    }
    return {
      exists: () => true,
      data: () => ({ financials: { totalePreventivato: 0 } }),
    };
  }),
  addDoc: vi.fn(async (_collection, data) => {
    h.createdQuotes.push(data);
    return { id: "quote-created" };
  }),
  updateDoc: vi.fn(async () => {}),
  getDocs: vi.fn(),
  writeBatch: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  Timestamp: MockTimestamp,
  arrayUnion: vi.fn((value) => value),
  increment: vi.fn((value) => value),
  };
});

vi.mock("./jobs", () => ({
  addTimelineEvent: vi.fn(async () => {}),
  updateJobStatus: vi.fn(async () => {}),
  recomputeJobAggregates: vi.fn(async () => {}),
}));

import { createQuote } from "./quotes";

const quoteInput = {
  jobId: "job-1",
  clienteId: "client-1",
  type: "fisso",
  products: [{ nome: "Servizio", prezzo: 500, selectable: false }],
  discountType: undefined,
  discountValue: undefined,
  contractClauses: [],
  theme: {
    primaryColor: "#AA0000",
    secondaryColor: "#BB0000",
    footerText: "Tema vecchio del template",
  },
} as any;

describe("createQuote uses the saved studio quote theme", () => {
  beforeEach(() => {
    h.settings = {
      name: "Studio corrente",
      quoteTheme: { primaryColor: "#123456", secondaryColor: "#ABCDEF" },
    };
    h.createdQuotes.length = 0;
  });

  it("uses saved global colors instead of stale form or template colors", async () => {
    await createQuote(quoteInput, "admin-1");

    expect(h.createdQuotes).toHaveLength(1);
    expect(h.createdQuotes[0].theme).toEqual({
      primaryColor: "#123456",
      secondaryColor: "#ABCDEF",
      footerText: "Studio corrente",
    });
  });

  it("fails before writing a quote when saved studio colors are missing", async () => {
    h.settings = null;

    await expect(createQuote(quoteInput, "admin-1")).rejects.toThrow(/Impostazioni Studio/);

    expect(h.createdQuotes).toHaveLength(0);
  });
});
