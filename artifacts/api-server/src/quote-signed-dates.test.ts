import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const h = vi.hoisted(() => ({
  docs: {} as Record<string, Record<string, any>>,
  sendEmail: vi.fn(async (..._args: any[]) => ({ success: true })),
}));

vi.mock("./firebase-admin.js", () => ({
  db: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({
          id,
          exists: !!h.docs[name]?.[id],
          data: () => h.docs[name]?.[id],
        }),
      }),
    }),
  },
  FieldValue: {},
}));
vi.mock("firebase-admin/auth", () => ({ getAuth: vi.fn() }));
vi.mock("./job-aggregates.js", () => ({ recomputeJobQuoteStatus: vi.fn() }));
vi.mock("./email-routes.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./email-routes.js")>(),
  sendGmailEmail: h.sendEmail,
  getStudioContactInfo: async () => ({
    name: "Studio Test", email: "studio@example.test", phone: "", address: "",
  }),
}));

import quoteRoutes from "./quote-routes.js";
import { createQuoteSignedEmailHTML, createAdminQuoteSignedNotificationHTML } from "./email-routes.js";
import { formatQuotePortalDate } from "../client/src/lib/quote-portal-date";

// Instants just after midnight in Rome; UTC is still on the previous day.
const cases = [
  { iso: "2026-01-14T23:05:00Z", day: "15 gennaio 2026", previous: "14 gennaio 2026" },
  { iso: "2026-07-14T22:05:00Z", day: "15 luglio 2026", previous: "14 luglio 2026" },
  { iso: "2026-12-31T23:05:00Z", day: "01 gennaio 2027", previous: "31 dicembre 2026" },
  { iso: "2026-07-31T22:05:00Z", day: "01 agosto 2026", previous: "31 luglio 2026" },
];
const timestamp = (iso: string) => ({ toDate: () => new Date(iso) });
let server: Server;
let base: string;

beforeAll(async () => {
  // Run this suite with TZ=UTC: changing only the locale must not change the zone.
  expect(new Date(cases[0].iso).getTimezoneOffset()).toBe(0);
  const app = express();
  app.use(express.json());
  app.use("/api/quotes", quoteRoutes);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
});
beforeEach(() => {
  h.docs = {};
  h.sendEmail.mockClear();
});

describe.each(cases)("standard signed quote: $iso (TZ=UTC)", ({ iso, day, previous }) => {
  it.each(["fisso", "variabile"])("shows the Rome signature date and deadlines for %s quotes", (type) => {
    const date = new Date(iso);
    const payment = { importo: 100, dataScadenza: date, descrizione: "Acconto test" };
    const html = createQuoteSignedEmailHTML("Cliente Test", type, "Evento Test", 500,
      date, "https://example.test/quote/token", payment, [payment]);
    expect(html.match(new RegExp(day, "g"))).toHaveLength(3);
    expect(html).not.toContain(previous);
    expect(html).not.toContain("Invalid Date");
    expect(date.toISOString()).toBe(iso.replace("Z", ".000Z"));
  });

  it("shows the Rome signature day and time in the admin heading", () => {
    const html = createAdminQuoteSignedNotificationHTML("Cliente Test", "variabile",
      "Evento Test", 500, new Date(iso), "https://example.test/job/test");
    expect(html).toContain(`${Number(day.slice(0, 2))}${day.slice(2)} · ore 00:05`);
    expect(html).not.toContain(previous);
  });

  it("keeps the portal contract and payment dates aligned with email, including ISO API serialization", () => {
    expect(formatQuotePortalDate(iso)).toBe(day);
    expect(formatQuotePortalDate(new Date(iso))).toBe(day);
    expect(formatQuotePortalDate(timestamp(iso))).toBe(day);
    // A visitor's browser may be outside Italy; the studio date must not change.
    const utcBrowserDate = new Date(iso).toLocaleDateString("it-IT", {
      timeZone: "UTC", day: "2-digit", month: "long", year: "numeric",
    });
    expect(utcBrowserDate).toBe(previous);
  });

  it("passes Firestore dates unchanged through the client notification route", async () => {
    h.docs = {
      quotes: { test: {
        status: "firmato", type: "fisso", publicToken: "test-token",
        signature: { clientName: "Cliente Test", signedAt: timestamp(iso) },
        clientiInfo: [{ email: "client@example.test" }],
        jobInfo: { nomeEvento: "Evento Test" }, totalAfterDiscount: 500,
        paymentScheduleIds: ["schedule-test"],
      } },
      paymentSchedules: { "schedule-test": {
        payments: [{ stato: "atteso", importo: 100, dataScadenza: timestamp(iso) }],
      } },
    };
    const response = await fetch(`${base}/api/quotes/quote-signed-notification`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId: "test" }),
    });
    expect(response.status).toBe(200);
    expect(h.sendEmail).toHaveBeenCalledOnce();
    const html = h.sendEmail.mock.calls[0][2] as string;
    expect(html.match(new RegExp(day, "g"))).toHaveLength(2);
    expect(html).not.toContain("Invalid Date");
    expect(html).not.toContain(previous);
    expect(h.docs.quotes.test.signature.signedAt.toDate().toISOString()).toBe(iso.replace("Z", ".000Z"));
  });

  it("uses the same Rome day in the standard admin notification route", async () => {
    h.docs = { quotes: { test: {
      status: "firmato", type: "variabile", publicToken: "test-token",
      signature: { clientName: "Cliente Test", signedAt: timestamp(iso) },
      totaleSelezionato: 500, jobInfo: { nomeEvento: "Evento Test" },
    } } };
    const response = await fetch(`${base}/api/quotes/admin-quote-signed-notification`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId: "test" }),
    });
    expect(response.status).toBe(200);
    expect(h.sendEmail).toHaveBeenCalledOnce();
    const html = h.sendEmail.mock.calls[0][2] as string;
    expect(html).toContain(day);
    expect(html).not.toContain(previous);
  });
});

it("keeps the portal fallback for missing or invalid dates", () => {
  for (const date of [null, undefined, "", "invalid", new Date(NaN)]) {
    expect(formatQuotePortalDate(date)).toBe("-");
  }
});
