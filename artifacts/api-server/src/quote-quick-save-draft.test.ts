import { jsonFetch } from './test-utils/json-fetch.js';

const fetch = jsonFetch<{ success: boolean; jobId: string; isExisting: boolean }>;

/**
 * Test POST /api/quotes/quick/:token/save-draft (Preventivo Rapido, pubblico).
 *
 * Verifica con Firestore mockato che `quickQuoteCompiledAt` venga impostato:
 * - nel ramo di CREAZIONE di un nuovo job lead
 * - nel ramo di RIUSO di un job lead esistente (anche job vecchi senza il campo)
 * e che venga AGGIORNATO a ogni nuova compilazione (compilazioni ripetute).
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

const h = vi.hoisted(() => ({
  state: {} as Record<string, Record<string, any>>,
  nextId: 1,
  // serverTimestamp() monotono: ogni chiamata produce un valore distinto,
  // così possiamo verificare che compilazioni ripetute AGGIORNINO il campo.
  tsCounter: 0,
}));

const SERVER_TS = () => ({ __serverTs: ++h.tsCounter });

function resolveValues(patch: any): any {
  const out: any = Array.isArray(patch) ? [] : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && (v as any).__isServerTs) {
      out[k] = SERVER_TS();
    } else if (v && typeof v === "object" && Array.isArray((v as any).__arrayUnion)) {
      out[k] = v; // gestito in applyUpdate
    } else if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      out[k] = resolveValues(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function applyUpdate(target: any, patch: Record<string, any>) {
  for (const [k, v] of Object.entries(resolveValues(patch))) {
    if (v && typeof v === "object" && Array.isArray((v as any).__arrayUnion)) {
      const arr = Array.isArray(target[k]) ? target[k].slice() : [];
      for (const item of (v as any).__arrayUnion) if (!arr.includes(item)) arr.push(item);
      target[k] = arr;
    } else {
      target[k] = v;
    }
  }
}

function makeDocRef(col: string, id: string) {
  return {
    id,
    get: async () => {
      const d = h.state[col]?.[id];
      return { exists: !!d, id, data: () => d };
    },
    update: async (patch: Record<string, any>) => {
      const d = h.state[col]?.[id];
      if (!d) throw new Error(`doc non trovato: ${col}/${id}`);
      applyUpdate(d, patch);
    },
  };
}

function makeCollection(col: string) {
  const filters: Array<[string, string, any]> = [];
  const self: any = {
    doc: (id?: string) => makeDocRef(col, id || `auto${h.nextId++}`),
    add: async (data: any) => {
      const id = `auto${h.nextId++}`;
      h.state[col] = h.state[col] || {};
      const stored: any = {};
      applyUpdate(stored, data);
      h.state[col][id] = stored;
      return makeDocRef(col, id);
    },
    where: (f: string, op: string, v: any) => {
      filters.push([f, op, v]);
      return self;
    },
    limit: () => self,
    get: async () => {
      const all = Object.entries(h.state[col] || {});
      const docs = all
        .filter(([, d]) =>
          filters.every(([f, op, v]) =>
            op === "array-contains"
              ? Array.isArray((d as any)[f]) && (d as any)[f].includes(v)
              : (d as any)[f] === v,
          ),
        )
        .map(([id, d]) => ({ id, exists: true, data: () => d }));
      return { docs, empty: docs.length === 0 };
    },
  };
  return self;
}

vi.mock("./firebase-admin.js", () => ({
  db: { collection: (name: string) => makeCollection(name) },
  FieldValue: {
    serverTimestamp: () => ({ __isServerTs: true }),
    arrayUnion: (...items: any[]) => ({ __arrayUnion: items }),
  },
  Timestamp: { now: () => ({ toDate: () => new Date() }) },
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ verifyIdToken: async () => ({ email: "admin@test" }) }),
}));

vi.mock("./email-routes.js", () => ({
  sendGmailEmail: vi.fn(async () => ({ success: true })),
  authenticateFirebase: (_req: any, _res: any, next: () => void) => next(),
  getStudioContactInfo: async () => ({ name: "Studio", email: "s@x.it", phone: "" }),
  createQuoteSignedEmailHTML: () => "",
  createPaymentReminderEmailHTML: () => "",
  createQuoteSentEmailHTML: () => "",
  createAdminQuoteSignedNotificationHTML: () => "",
}));

vi.mock("./job-aggregates.js", () => ({
  recomputeJobQuoteStatus: vi.fn(async () => {}),
}));

vi.mock("./google-calendar.js", () => ({
  createEvent: vi.fn(async () => ({ id: "mock-calendar-event" })),
}));

import quoteRoutes from "./quote-routes.js";
import { sendGmailEmail } from "./email-routes.js";

let server: any;
let baseUrl = "";

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use("/api/quotes", quoteRoutes);
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterAll(() => server?.close());

const TOKEN = "tok-quick-1";

function seed() {
  h.state = {
    quoteTemplates: {
      tpl1: {
        shareableToken: TOKEN,
        attivo: true,
        nome: "Matrimonio Base",
        type: "fisso",
        jobType: "matrimonio",
        defaultProducts: [{ nome: "Servizio", prezzo: 1000 }],
        defaultClauses: [],
      },
    },
    clienti: {},
    jobs: {},
    quotes: {},
  };
  h.nextId = 1;
  h.tsCounter = 0;
}

async function postSaveDraft(overrides: Record<string, any> = {}) {
  const res = await fetch(`${baseUrl}/api/quotes/quick/${TOKEN}/save-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nome: "Mario",
      cognome: "Rossi",
      email: "mario.rossi@test.it",
      nomeEvento: "Matrimonio Mario & Anna",
      dataNonDefinita: true,
      ...overrides,
    }),
  });
  return { status: res.status, json: await res.json() };
}

async function postGenerateToken() {
  const res = await fetch(`${baseUrl}/api/quotes/quick/generate-token/tpl1`, {
    method: 'POST',
    headers: { Authorization: 'Bearer customer-token' },
  });
  return { status: res.status, json: await res.json() };
}

describe("POST /api/quotes/quick/:token/save-draft — quickQuoteCompiledAt", () => {
  beforeEach(async () => {
    seed();
    if (!server) await startServer();
  });

  it("ramo CREAZIONE: il nuovo job lead ha quickQuoteCompiledAt impostato", async () => {
    const { status, json } = await postSaveDraft();
    expect(status).toBe(200);
    expect(json.success).toBe(true);

    const job = h.state.jobs[json.jobId];
    expect(job).toBeDefined();
    expect(job.quickQuoteCompiledAt).toBeDefined();
    expect(job.quickQuoteCompiledAt.__serverTs).toBeGreaterThan(0);
    expect(job.createdAt).toBeDefined();
    expect(job.provenance).toBe("preventivo-rapido");
  });

  it("ramo RIUSO: un job lead vecchio SENZA il campo lo riceve alla compilazione", async () => {
    // Job lead preesistente creato prima dell'introduzione del campo
    h.state.clienti.c1 = { email: "mario.rossi@test.it", nome: "Mario" };
    h.state.jobs.oldLead = {
      nomeEvento: "Vecchio evento",
      clientiIds: ["c1"],
      provenance: "preventivo-rapido",
      status: "lead",
      jobType: "matrimonio",
      quoteIds: [],
      createdAt: { __serverTs: 0 },
      // NIENTE quickQuoteCompiledAt
    };

    const { status, json } = await postSaveDraft();
    expect(status).toBe(200);
    expect(json.jobId).toBe("oldLead");
    expect(json.isExisting).toBe(true);

    const job = h.state.jobs.oldLead;
    expect(job.quickQuoteCompiledAt).toBeDefined();
    expect(job.quickQuoteCompiledAt.__serverTs).toBeGreaterThan(0);
    // Il nome evento viene aggiornato con la nuova compilazione
    expect(job.nomeEvento).toBe("Matrimonio Mario & Anna");
  });

  it("compilazioni RIPETUTE: il campo viene aggiornato a ogni compilazione", async () => {
    const first = await postSaveDraft();
    expect(first.status).toBe(200);
    const jobId = first.json.jobId;
    const firstTs = h.state.jobs[jobId].quickQuoteCompiledAt.__serverTs;
    expect(firstTs).toBeGreaterThan(0);

    // Seconda compilazione dello stesso cliente/template → riusa il lead
    const second = await postSaveDraft({ nomeEvento: "Matrimonio - aggiornato" });
    expect(second.status).toBe(200);
    expect(second.json.jobId).toBe(jobId);
    expect(second.json.isExisting).toBe(true);

    const secondTs = h.state.jobs[jobId].quickQuoteCompiledAt.__serverTs;
    expect(secondTs).toBeGreaterThan(firstTs);

    // Terza compilazione → ancora aggiornato
    const third = await postSaveDraft();
    expect(third.status).toBe(200);
    expect(third.json.jobId).toBe(jobId);
    expect(h.state.jobs[jobId].quickQuoteCompiledAt.__serverTs).toBeGreaterThan(secondTs);

    // Non sono stati creati job duplicati
    expect(Object.keys(h.state.jobs)).toHaveLength(1);
  });

  it('does not let an authenticated non-admin fetch a private quote share token', async () => {
    const { status } = await postGenerateToken();
    expect(status).toBe(403);
  });
});

describe("Preventivo rapido — data evento nelle email in Europe/Rome", () => {
  beforeEach(async () => {
    seed();
    vi.mocked(sendGmailEmail).mockClear();
    if (!server) await startServer();
  });

  function emailOfType(type: string) {
    return vi.mocked(sendGmailEmail).mock.calls.find(
      call => call[4]?.type === type,
    );
  }

  it.each([
    ["inverno", "2026-12-12T23:00:00.000Z", "13 dicembre 2026"],
    ["estate", "2026-07-12T22:00:00.000Z", "13 luglio 2026"],
    ["inizio ora legale", "2026-03-28T23:00:00.000Z", "29 marzo 2026"],
    ["fine ora legale", "2026-10-24T22:00:00.000Z", "25 ottobre 2026"],
    ["cambio anno", "2026-12-31T23:00:00.000Z", "01 gennaio 2027"],
    ["anno bisestile", "2028-02-28T23:00:00.000Z", "29 febbraio 2028"],
  ])("email cliente: conserva il giorno italiano (%s)", async (_, eventDate, expected) => {
    const { status, json } = await postSaveDraft({
      dataNonDefinita: false,
      eventDate,
    });
    expect(status).toBe(200);
    await vi.waitFor(() => {
      expect(emailOfType("quick_quote_link_client")?.[2])
        .toContain(`<strong>Data:</strong> ${expected}`);
    });
    // La correzione riguarda la visualizzazione, non riscrive l'istante salvato.
    expect(h.state.jobs[json.jobId].eventDate.toISOString()).toBe(eventDate);
  });

  it("email cliente: mantiene il giorno anche riutilizzando un lead", async () => {
    await postSaveDraft();
    vi.mocked(sendGmailEmail).mockClear();
    const { status, json } = await postSaveDraft({
      dataNonDefinita: false,
      eventDate: "2026-12-12T23:00:00.000Z",
    });
    expect(status).toBe(200);
    expect(json.isExisting).toBe(true);
    await vi.waitFor(() => {
      expect(emailOfType("quick_quote_link_client")?.[2])
        .toContain("<strong>Data:</strong> 13 dicembre 2026");
    });
  });

  it("email cliente: non inventa una data quando è da definire", async () => {
    expect((await postSaveDraft()).status).toBe(200);
    await vi.waitFor(() => {
      const email = emailOfType("quick_quote_link_client");
      expect(email).toBeDefined();
      expect(email?.[2]).toContain("<strong>Data:</strong> Da definire");
      expect(email?.[2]).not.toContain("Invalid Date");
    });
  });

  it("email amministratore: usa il 13 dicembre anche dopo l'attivazione", async () => {
    const email = "admin-date-check@example.test";
    const post = async (action: string, body: Record<string, any>) => {
      const response = await fetch(`${baseUrl}/api/quotes/quick/${TOKEN}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(200);
      return response.json();
    };
    await post("send-otp", { email, nome: "Mario" });
    const otpHtml = vi.mocked(sendGmailEmail).mock.calls[0][2];
    const code = otpHtml.match(/>\s*(\d{6})\s*</)?.[1];
    expect(code).toBeDefined();
    await post("verify-otp", { email, code });
    await post("activate", {
      nome: "Mario", cognome: "Rossi", email,
      nomeEvento: "Evento di prova",
      dataNonDefinita: false,
      eventDate: "2026-12-12T23:00:00.000Z",
    });
    expect(emailOfType("quick_quote_created_admin")?.[2])
      .toContain("13 dicembre 2026");
  });
});
