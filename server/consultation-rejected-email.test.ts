/**
 * Test: pulsante "Scegli un nuovo orario" nelle email di rifiuto consulenza.
 *
 * Copre entrambi i punti d'ingresso:
 * 1. PATCH /api/consultations/:id/reject (URL riprenotazione costruito da
 *    jobType + templateId della consulenza, dati trusted server-side)
 * 2. POST /api/email/send-consultation-rejected (URL costruito server-side
 *    da jobType + templateId nel body)
 *
 * Il template createConsultationRejectedEmailHTML è usato REALE; vengono
 * mockati solo Firestore Admin, googleapis (invio Gmail) e le fetch esterne.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

const h = vi.hoisted(() => ({
  sentRaw: [] as string[],
  consultation: null as any,
  updates: [] as any[],
  template: null as any,
}));

// --- Firestore Admin fake (solo la superficie usata: emailLogs.add) ---
vi.mock("./firebase-admin.js", () => ({
  db: {
    collection: (_name: string) => ({
      add: async () => ({ id: "log-1" }),
    }),
  },
  Timestamp: {
    now: () => ({ toDate: () => new Date() }),
    fromDate: (d: Date) => ({ toDate: () => d }),
  },
  FieldValue: { serverTimestamp: () => ({ __ts: true }) },
  storage: {},
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => ({ __ts: true }) },
  Timestamp: { fromDate: (d: Date) => ({ toDate: () => d }) },
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({}),
}));

// --- googleapis fake: cattura il messaggio raw inviato via Gmail ---
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    gmail: () => ({
      users: {
        messages: {
          send: async ({ requestBody }: any) => {
            h.sentRaw.push(requestBody.raw);
            return { data: { id: "msg-1" } };
          },
        },
      },
    }),
  },
}));

// --- Dipendenze pesanti di consultation-routes non rilevanti per il test ---
vi.mock("./google-calendar.js", () => ({
  createEvent: async () => ({}),
  deleteEvent: async () => {},
  createEuropeRomeDate: (d: string, t: string) => new Date(`${d}T${t}:00Z`),
}));
vi.mock("./storage-download-url.js", () => ({
  saveWithDownloadToken: async () => "",
}));
vi.mock("./services/consultations.js", () => ({
  getConsultationById: async () => h.consultation,
  updateConsultation: async (_id: string, data: any) => {
    h.updates.push(data);
  },
  getTemplateById: async () => h.template,
}));

// --- Stub fetch esterne (token connector, verifica auth, Firestore REST) ---
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  const u = String(url);
  if (u.includes("/api/v2/connection")) {
    return new Response(
      JSON.stringify({
        items: [
          {
            settings: {
              access_token: "fake-token",
              expires_at: Date.now() + 3600_000,
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  if (u.includes("identitytoolkit")) {
    return new Response(
      JSON.stringify({
        users: [{ localId: "admin-uid", email: "gennaro.mazzacane@gmail.com" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  if (u.includes("firestore.googleapis.com")) {
    // getStudioContactInfo → fallback ai default
    return new Response("{}", { status: 404 });
  }
  return realFetch(url, init);
}) as any;

process.env.REPL_IDENTITY = process.env.REPL_IDENTITY || "test-identity";

const { default: emailRouter, createConsultationRejectedEmailHTML } =
  await import("./email-routes.js");
const { default: consultationRouter } = await import(
  "./consultation-routes.js"
);

const app = express();
app.use(express.json());
app.use("/api/email", emailRouter);
app.use("/api/consultations", consultationRouter);
const server = app.listen(0);
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

afterAll(() => {
  server.close();
  globalThis.fetch = realFetch;
});

function decodeLastEmail(): string {
  const raw = h.sentRaw[h.sentRaw.length - 1];
  return Buffer.from(
    raw.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
}

beforeEach(() => {
  h.sentRaw.length = 0;
  h.updates.length = 0;
  h.template = { id: "tpl123", jobType: "Matrimonio", attiva: true };
});

describe("createConsultationRejectedEmailHTML", () => {
  const args = [
    "Mario Rossi",
    "Matrimonio",
    "lunedì 1 settembre 2026",
    "10:00 - 11:00",
    null,
  ] as const;

  it("mostra il pulsante CTA quando rebookUrl è presente", () => {
    const html = createConsultationRejectedEmailHTML(
      ...args,
      undefined,
      "https://example.com/consulenze/Matrimonio/tpl123/prenota",
    );
    expect(html).toContain("Scegli un nuovo orario");
    expect(html).toContain(
      'href="https://example.com/consulenze/Matrimonio/tpl123/prenota"',
    );
  });

  it("mantiene il fallback 'contattaci' senza rebookUrl", () => {
    const html = createConsultationRejectedEmailHTML(...args);
    expect(html).not.toContain("Scegli un nuovo orario");
    expect(html).toContain("contattaci direttamente");
  });
});

describe("PATCH /api/consultations/:id/reject", () => {
  it("invia l'email con il pulsante e l'URL costruito da jobType+templateId", async () => {
    h.consultation = {
      id: "c1",
      stato: "in_attesa",
      jobType: "Matrimonio",
      templateId: "tpl123",
      note: "",
      cliente: { nome: "Mario", cognome: "Rossi", email: "mario@example.com" },
      dataConsulenza: { seconds: Math.floor(Date.now() / 1000) },
      orarioInizio: "10:00",
      orarioFine: "11:00",
    };

    const res = await realFetch(`${base}/api/consultations/c1/reject`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fake-id-token",
      },
      body: JSON.stringify({ motivo: "Slot non disponibile" }),
    });
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(body.emailStatus).toBe("sent");

    const email = decodeLastEmail();
    expect(email).toContain("Scegli un nuovo orario");
    expect(email).toContain("/consulenze/Matrimonio/tpl123/prenota");
  });

  it("omette il pulsante se il template è stato disattivato", async () => {
    h.template = { id: "tpl123", jobType: "Matrimonio", attiva: false };
    h.consultation = {
      id: "c2",
      stato: "in_attesa",
      jobType: "Matrimonio",
      templateId: "tpl123",
      note: "",
      cliente: { nome: "Mario", cognome: "Rossi", email: "mario@example.com" },
      dataConsulenza: { seconds: Math.floor(Date.now() / 1000) },
      orarioInizio: "10:00",
      orarioFine: "11:00",
    };

    const res = await realFetch(`${base}/api/consultations/c2/reject`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fake-id-token",
      },
      body: JSON.stringify({ motivo: "Slot non disponibile" }),
    });
    expect(res.status).toBe(200);

    const email = decodeLastEmail();
    expect(email).not.toContain("Scegli un nuovo orario");
    expect(email).toContain("contattaci direttamente");
  });

  it("omette il pulsante se il template è stato eliminato", async () => {
    h.template = null;
    h.consultation = {
      id: "c3",
      stato: "in_attesa",
      jobType: "Matrimonio",
      templateId: "tpl123",
      note: "",
      cliente: { nome: "Mario", cognome: "Rossi", email: "mario@example.com" },
      dataConsulenza: { seconds: Math.floor(Date.now() / 1000) },
      orarioInizio: "10:00",
      orarioFine: "11:00",
    };

    const res = await realFetch(`${base}/api/consultations/c3/reject`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fake-id-token",
      },
      body: JSON.stringify({ motivo: "Slot non disponibile" }),
    });
    expect(res.status).toBe(200);

    const email = decodeLastEmail();
    expect(email).not.toContain("Scegli un nuovo orario");
    expect(email).toContain("contattaci direttamente");
  });
});

describe("POST /api/email/send-consultation-rejected (validazione template)", () => {
  it("omette il pulsante se il template è disattivato", async () => {
    h.template = { id: "tpl123", jobType: "Matrimonio", attiva: false };
    const res = await realFetch(
      `${base}/api/email/send-consultation-rejected`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: "mario@example.com",
          clienteName: "Mario Rossi",
          jobType: "Matrimonio",
          consultationDate: "lunedì 1 settembre 2026",
          consultationTime: "10:00 - 11:00",
          templateId: "tpl123",
        }),
      },
    );
    expect(res.status).toBe(200);

    const email = decodeLastEmail();
    expect(email).not.toContain("Scegli un nuovo orario");
    expect(email).toContain("contattaci direttamente");
  });

  it("omette il pulsante se il template non esiste più", async () => {
    h.template = null;
    const res = await realFetch(
      `${base}/api/email/send-consultation-rejected`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: "mario@example.com",
          clienteName: "Mario Rossi",
          jobType: "Matrimonio",
          consultationDate: "lunedì 1 settembre 2026",
          consultationTime: "10:00 - 11:00",
          templateId: "tpl123",
        }),
      },
    );
    expect(res.status).toBe(200);

    const email = decodeLastEmail();
    expect(email).not.toContain("Scegli un nuovo orario");
    expect(email).toContain("contattaci direttamente");
  });
});

describe("POST /api/email/send-consultation-rejected", () => {
  it("costruisce l'URL riprenotazione server-side dal templateId", async () => {
    const res = await realFetch(
      `${base}/api/email/send-consultation-rejected`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: "mario@example.com",
          clienteName: "Mario Rossi",
          jobType: "Matrimonio",
          consultationDate: "lunedì 1 settembre 2026",
          consultationTime: "10:00 - 11:00",
          rejectionReason: "Slot non disponibile",
          templateId: "tpl123",
        }),
      },
    );
    expect(res.status).toBe(200);

    const email = decodeLastEmail();
    expect(email).toContain("Scegli un nuovo orario");
    expect(email).toContain("/consulenze/Matrimonio/tpl123/prenota");
  });

  it("senza templateId mantiene il fallback senza pulsante", async () => {
    const res = await realFetch(
      `${base}/api/email/send-consultation-rejected`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: "mario@example.com",
          clienteName: "Mario Rossi",
          jobType: "Matrimonio",
          consultationDate: "lunedì 1 settembre 2026",
          consultationTime: "10:00 - 11:00",
        }),
      },
    );
    expect(res.status).toBe(200);

    const email = decodeLastEmail();
    expect(email).not.toContain("Scegli un nuovo orario");
    expect(email).toContain("contattaci direttamente");
  });
});
