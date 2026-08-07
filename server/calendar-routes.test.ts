import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mutable holder shared with the hoisted module mocks (see testing-setup memo).
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const Timestamp = {
    now: () => ({ toDate: () => new Date(), __ts: true }),
    fromDate: (d: Date) => ({ toDate: () => d, __ts: true }),
  };
  const FieldValue = {
    arrayUnion: (...items: any[]) => ({ __arrayUnion: items }),
    arrayRemove: (...items: any[]) => ({ __arrayRemove: items }),
  };
  return {
    db: null as any,
    updateEventCalls: [] as any[],
    Timestamp,
    FieldValue,
  };
});

vi.mock("./firebase-admin.js", () => ({
  db: new Proxy(
    {},
    {
      get: (_t, prop) => {
        return (...args: any[]) => h.db[prop as string](...args);
      },
    },
  ),
  Timestamp: h.Timestamp,
  FieldValue: h.FieldValue,
}));

vi.mock("./google-calendar.js", () => ({
  getEvents: vi.fn(async () => []),
  createEvent: vi.fn(async () => ({ id: "new-ev" })),
  updateEvent: vi.fn(async (...args: any[]) => {
    h.updateEventCalls.push(args);
    return { id: args[1] };
  }),
  getCalendarConnectionStatus: vi.fn(async () => ({ connected: true })),
  invalidateTokenCache: vi.fn(),
}));

vi.mock("./email-routes.js", () => ({
  authenticateFirebase: (req: any, _res: any, next: any) => {
    req.user = { email: "gennaro.mazzacane@gmail.com" };
    next();
  },
  sendGmailEmail: vi.fn(async () => {}),
  createCalendarEventEmailHTML: () => "",
  getStudioContactInfo: async () => ({
    name: "Studio",
    email: "s@example.com",
    phone: "+39",
    address: "Via Test 1",
  }),
  generateGoogleCalendarLink: () => "",
}));

// Import AFTER mocks are registered.
import express from "express";
import http from "http";
import calendarRouter, { stripJobInfoBlock } from "./calendar-routes";

// ---------------------------------------------------------------------------
// In-memory Firestore fake (only the surface used by PATCH /events/:eventId)
// ---------------------------------------------------------------------------
type FakeJob = { id: string; data: Record<string, any> };

function makeFakeDb(jobs: FakeJob[]) {
  const updates: Array<{ id: string; patch: any }> = [];
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  const docRef = (id: string) => ({
    id,
    get: async () => ({
      exists: jobById.has(id),
      id,
      data: () => jobById.get(id)?.data,
    }),
    update: async (patch: any) => updates.push({ id, patch }),
  });

  const db = {
    collection: (name: string) => {
      if (name !== "jobs") throw new Error(`unexpected collection ${name}`);
      return {
        doc: (id: string) => docRef(id),
        where: (field: string, op: string, value: any) => ({
          get: async () => {
            const matching = jobs.filter((j) =>
              (j.data[field] || []).includes(value),
            );
            return {
              forEach: (cb: (d: any) => void) =>
                matching.forEach((j) =>
                  cb({ id: j.id, ref: docRef(j.id), data: () => j.data }),
                ),
            };
          },
        }),
      };
    },
    batch: () => ({
      update: (ref: any, patch: any) => updates.push({ id: ref.id, patch }),
      commit: async () => {},
    }),
    updates,
  };
  return db;
}

// ---------------------------------------------------------------------------
// Test HTTP server around the real router
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use("/api/calendar", calendarRouter);
const server = http.createServer(app);
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as any).port;
afterAll(() => server.close());

async function patchEvent(eventId: string, body: any) {
  const res = await fetch(
    `http://127.0.0.1:${port}/api/calendar/events/${eventId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return { status: res.status, json: await res.json() };
}

const baseBody = {
  type: "google",
  start: "2026-08-23T10:00:00.000Z",
  end: "2026-08-23T12:00:00.000Z",
  googleEventId: "gev-1",
};

const JOB1 = {
  id: "job1",
  data: {
    nomeEvento: "Matrimonio Rossi",
    jobType: "matrimonio",
    clienti: [{ nome: "Mario", cognome: "Rossi" }],
    linkedCalendarEventIds: [] as string[],
  },
};

beforeEach(() => {
  h.updateEventCalls = [];
});

describe("stripJobInfoBlock", () => {
  it("rimuove il blocco in testo semplice preservando le note utente", () => {
    const desc =
      "Note del fotografo\n\n📋 Lavoro: Matrimonio Rossi (matrimonio)\n👤 Cliente: Mario Rossi\n🔗 Apri scheda lavoro: https://imagestudiofotografico.com/admin/jobs/job1";
    expect(stripJobInfoBlock(desc)).toBe("Note del fotografo");
  });

  it("rimuove il blocco separato da <br> HTML senza toccare le note utente", () => {
    const desc =
      "Portare drone e obiettivo 85mm<br><br>📋 Lavoro: Matrimonio Rossi<br>👤 Cliente: Mario Rossi<br>🔗 Apri scheda lavoro: <a href=\"https://imagestudiofotografico.com/admin/jobs/job1\">link</a>";
    const out = stripJobInfoBlock(desc);
    expect(out).toContain("Portare drone e obiettivo 85mm");
    expect(out).not.toContain("📋");
    expect(out).not.toContain("🔗");
    expect(out).not.toContain("admin/jobs");
  });

  it("gestisce righe avvolte in <div> lasciando intatto il resto", () => {
    const desc =
      "<div>Appunti importanti</div><div>📋 Lavoro: Matrimonio Rossi</div><div>🔗 Apri scheda lavoro: https://x/admin/jobs/job1</div><div>Altra nota utente</div>";
    const out = stripJobInfoBlock(desc);
    expect(out).toContain("Appunti importanti");
    expect(out).toContain("Altra nota utente");
    expect(out).not.toContain("📋");
    expect(out).not.toContain("admin/jobs");
  });

  it("non modifica descrizioni senza blocco lavoro", () => {
    const desc = "Solo note utente<br>con più righe";
    expect(stripJobInfoBlock(desc)).toBe(desc);
  });
});

describe("PATCH /api/calendar/events/:eventId (google) — associazione lavoro", () => {
  it("collega: aggiunge il blocco lavoro alla descrizione e arrayUnion sul job", async () => {
    h.db = makeFakeDb([structuredClone(JOB1)]);
    const { status } = await patchEvent("g-gev-1", {
      ...baseBody,
      description: "Note del fotografo",
      jobId: "job1",
    });
    expect(status).toBe(200);

    const [, googleId, payload] = h.updateEventCalls[0];
    expect(googleId).toBe("gev-1");
    expect(payload.description).toContain("Note del fotografo");
    expect(payload.description).toContain("📋 Lavoro: Matrimonio Rossi (matrimonio)");
    expect(payload.description).toContain("admin/jobs/job1");

    const union = h.db.updates.find((u: any) => u.patch.linkedCalendarEventIds?.__arrayUnion);
    expect(union.id).toBe("job1");
    expect(union.patch.linkedCalendarEventIds.__arrayUnion).toEqual(["gev-1"]);
  });

  it("sposta: arrayRemove dal job precedente, arrayUnion sul nuovo, blocco sostituito", async () => {
    const job0 = {
      id: "job0",
      data: { nomeEvento: "Vecchio Lavoro", linkedCalendarEventIds: ["gev-1"] },
    };
    h.db = makeFakeDb([job0, structuredClone(JOB1)]);
    const { status } = await patchEvent("g-gev-1", {
      ...baseBody,
      description:
        "Note utente\n\n📋 Lavoro: Vecchio Lavoro\n🔗 Apri scheda lavoro: https://imagestudiofotografico.com/admin/jobs/job0",
      jobId: "job1",
    });
    expect(status).toBe(200);

    const [, , payload] = h.updateEventCalls[0];
    expect(payload.description).toContain("Note utente");
    expect(payload.description).not.toContain("Vecchio Lavoro");
    expect(payload.description).not.toContain("jobs/job0");
    expect(payload.description).toContain("Matrimonio Rossi");

    const remove = h.db.updates.find((u: any) => u.patch.linkedCalendarEventIds?.__arrayRemove);
    expect(remove.id).toBe("job0");
    const union = h.db.updates.find((u: any) => u.patch.linkedCalendarEventIds?.__arrayUnion);
    expect(union.id).toBe("job1");
  });

  it("scollega (jobId null): rimuove il blocco (anche HTML) preservando le note e fa arrayRemove", async () => {
    const job0 = {
      id: "job0",
      data: { nomeEvento: "Vecchio Lavoro", linkedCalendarEventIds: ["gev-1"] },
    };
    h.db = makeFakeDb([job0]);
    const { status } = await patchEvent("g-gev-1", {
      ...baseBody,
      description:
        "Note preziose dell'utente<br><br>📋 Lavoro: Vecchio Lavoro<br>🔗 Apri scheda lavoro: https://imagestudiofotografico.com/admin/jobs/job0",
      jobId: null,
    });
    expect(status).toBe(200);

    const [, , payload] = h.updateEventCalls[0];
    expect(payload.description).toContain("Note preziose dell'utente");
    expect(payload.description).not.toContain("📋");
    expect(payload.description).not.toContain("jobs/job0");

    const remove = h.db.updates.find((u: any) => u.patch.linkedCalendarEventIds?.__arrayRemove);
    expect(remove.id).toBe("job0");
    expect(h.db.updates.some((u: any) => u.patch.linkedCalendarEventIds?.__arrayUnion)).toBe(false);
  });

  it("modifica ordinaria (jobId assente): non tocca l'associazione né il blocco descrizione", async () => {
    const job0 = {
      id: "job0",
      data: { nomeEvento: "Lavoro Collegato", linkedCalendarEventIds: ["gev-1"] },
    };
    h.db = makeFakeDb([job0]);
    const description =
      "Note utente\n\n📋 Lavoro: Lavoro Collegato\n🔗 Apri scheda lavoro: https://imagestudiofotografico.com/admin/jobs/job0";
    const { status } = await patchEvent("g-gev-1", {
      ...baseBody,
      title: "Titolo aggiornato",
      description,
      // jobId volutamente assente: l'utente non ha toccato l'associazione
    });
    expect(status).toBe(200);

    // Descrizione passata invariata (nessuno strip del blocco lavoro)
    const [, , payload] = h.updateEventCalls[0];
    expect(payload.description).toBe(description);
    // Nessuna mutazione delle associazioni sui job
    expect(h.db.updates.length).toBe(0);
  });

  it("jobId inesistente: 404 senza toccare l'evento Google", async () => {
    h.db = makeFakeDb([]);
    const { status } = await patchEvent("g-gev-1", {
      ...baseBody,
      description: "Note",
      jobId: "stale-job",
    });
    expect(status).toBe(404);
    expect(h.updateEventCalls.length).toBe(0);
  });
});
