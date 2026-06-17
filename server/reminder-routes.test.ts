import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DateTime } from "luxon";

// ---------------------------------------------------------------------------
// Mutable holder shared with the hoisted module mocks. Each test reassigns
// `h.db` and `h.sendGmailEmail` so we exercise the REAL scheduler logic
// (runVisioneAutoInviteCheck) against a configurable in-memory Firestore fake.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  // Timestamp / FieldValue fakes (only the surface used by the scheduler).
  const Timestamp = {
    now: () => ({ toDate: () => new Date(), __ts: true }),
    fromDate: (d: Date) => ({ toDate: () => d, __ts: true }),
  };
  const FieldValue = {
    arrayUnion: (...items: any[]) => ({ __arrayUnion: items }),
  };
  return {
    db: null as any,
    sendGmailEmail: null as any,
    allDayDates: new Set<string>(),
    Timestamp,
    FieldValue,
  };
});

// Aliases for use in test fixtures/assertions.
const Timestamp = h.Timestamp;

vi.mock("./firebase-admin.js", () => ({
  // Proxy forwards every db.* access to the per-test fake in `h.db`.
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

vi.mock("./email-routes.js", () => ({
  sendGmailEmail: (...args: any[]) => h.sendGmailEmail(...args),
  getStudioContactInfo: async () => ({
    name: "Studio",
    email: "studio@example.com",
    phone: "+390000000",
    address: "Via Test 1",
  }),
  getSiteBaseUrl: () => "https://example.com",
  createConsultationReminderEmailHTML: () => "",
  generateGoogleCalendarLink: () => "",
  authenticateFirebase: () => {},
}));

// Avoid pulling in Google Calendar deps via the lazy imports. We mock the
// adapter's all-day lookup (configurable per-test via h.allDayDates) but delegate
// to the REAL computeEarliestBookableDate so the scheduler's date-alignment loop
// (lead postproduzione + blocco giorno-dopo-all-day) is exercised end-to-end.
vi.mock("./consultations/calendar-adapter.js", () => ({
  getAllDayDatesInRange: vi.fn(async () => h.allDayDates),
}));
vi.mock("./calendar-engine/index.js", async () => {
  const slots: any = await vi.importActual("./calendar-engine/slots");
  return { computeEarliestBookableDate: slots.computeEarliestBookableDate };
});

// Import AFTER mocks are registered.
import { runVisioneAutoInviteCheck } from "./reminder-routes";

// ---------------------------------------------------------------------------
// In-memory Firestore fake
// ---------------------------------------------------------------------------
type JobSpec = {
  id: string;
  /** Live document state: returned by doc.get()/tx.get and mutated by updates. */
  data: Record<string, any>;
  /**
   * Optional stale snapshot returned by the jobs *collection query* only.
   * Used to simulate a concurrent change between the initial query and the
   * transactional lock (the query saw clean data, the lock sees fresh data).
   */
  staleQuery?: Record<string, any>;
};

function makeDb(opts: {
  templates: Array<Record<string, any>>;
  jobs: JobSpec[];
  clienti: Record<string, any>;
}) {
  const { templates, jobs, clienti } = opts;

  // Live job store (mutated by updates / transactions).
  const liveJobs: Record<string, Record<string, any>> = {};
  for (const j of jobs) liveJobs[j.id] = { ...j.data };
  const staleById: Record<string, Record<string, any> | undefined> = {};
  for (const j of jobs) staleById[j.id] = j.staleQuery;

  const timelineAdds: any[] = [];

  function applyUpdate(id: string, upd: Record<string, any>) {
    const cur = liveJobs[id] || (liveJobs[id] = {});
    for (const [k, v] of Object.entries(upd)) {
      if (v && typeof v === "object" && Array.isArray((v as any).__arrayUnion)) {
        const arr = Array.isArray(cur[k]) ? cur[k].slice() : [];
        for (const item of (v as any).__arrayUnion) arr.push(item);
        cur[k] = arr;
      } else {
        cur[k] = v;
      }
    }
  }

  function jobDocRef(id: string) {
    return {
      id,
      get: async () => ({
        id,
        exists: !!liveJobs[id],
        data: () => liveJobs[id],
      }),
      update: async (upd: Record<string, any>) => applyUpdate(id, upd),
    };
  }

  // A query object that ignores filters and returns the configured docs.
  function jobsQuery() {
    const q: any = {
      where: () => q,
      get: async () => {
        const docs = jobs.map((j) => {
          const snap = staleById[j.id] ?? { ...liveJobs[j.id] };
          return { id: j.id, exists: true, data: () => snap };
        });
        return { size: docs.length, docs };
      },
    };
    return q;
  }

  const db: any = {
    collection(name: string) {
      if (name === "consultationTemplates") {
        return {
          get: async () => ({
            size: templates.length,
            docs: templates.map((t) => ({ id: t.id, data: () => t })),
          }),
        };
      }
      if (name === "jobs") {
        return {
          where: () => jobsQuery(),
          doc: (id: string) => jobDocRef(id),
        };
      }
      if (name === "clienti") {
        return {
          doc: (id: string) => ({
            get: async () => ({
              exists: !!clienti[id],
              data: () => clienti[id],
            }),
          }),
        };
      }
      if (name === "jobTimeline") {
        return { add: async (obj: any) => timelineAdds.push(obj) };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
    async runTransaction(fn: (tx: any) => Promise<any>) {
      const tx = {
        get: async (docRef: any) => docRef.get(),
        update: (docRef: any, upd: Record<string, any>) => applyUpdate(docRef.id, upd),
      };
      return fn(tx);
    },
  };

  return { db, liveJobs, timelineAdds };
}

// Reusable fixtures -----------------------------------------------------------
const eventDateJs = DateTime.now().setZone("Europe/Rome").startOf("day").toJSDate();

function baseTemplate(overrides: Record<string, any> = {}) {
  return {
    id: "tpl1",
    jobType: "matrimonio",
    nome: "Consulenza Visione",
    attiva: true,
    autoInvioVisioneAttivo: true,
    ordine: 0,
    autoInvioVisioneGiorniDopoEvento: 0,
    giorniPostproduzione: 0,
    bloccaGiornoDopoEventoGiornataIntera: false,
    ...overrides,
  };
}

function baseJobData(overrides: Record<string, any> = {}) {
  return {
    eventDate: { toDate: () => eventDateJs, __ts: true },
    jobType: "matrimonio",
    status: "produzione",
    clientiIds: ["cli1"],
    ...overrides,
  };
}

const clienti = { cli1: { nome: "Mario", email: "mario@example.com" } };

describe("runVisioneAutoInviteCheck — dedup / idempotency", () => {
  beforeEach(() => {
    h.db = null;
    h.sendGmailEmail = null;
    h.allDayDates = new Set<string>();
    vi.useRealTimers();
  });

  it("sends exactly once for an eligible job and persists the marker + timeline", async () => {
    h.sendGmailEmail = vi.fn(async () => {});
    const { db, liveJobs, timelineAdds } = makeDb({
      templates: [baseTemplate()],
      jobs: [{ id: "job1", data: baseJobData() }],
      clienti,
    });
    h.db = db;

    const res = await runVisioneAutoInviteCheck();

    expect(res.sent).toBe(1);
    expect(res.errors).toEqual([]);
    expect(h.sendGmailEmail).toHaveBeenCalledTimes(1);
    // Marker persisted (idempotency lock kept after successful send).
    expect(liveJobs.job1.visioneAutoInviteSentAt).toBeTruthy();
    expect(liveJobs.job1.visioneAutoInviteTemplateId).toBe("tpl1");
    // Timeline persisted best-effort.
    expect(timelineAdds).toHaveLength(1);
    const wfEvents = liveJobs.job1.workflowEvents || [];
    expect(wfEvents.some((e: any) => e.tipo === "consulenza_inviata")).toBe(true);
  });

  it("does NOT resend a job already marked with visioneAutoInviteSentAt", async () => {
    h.sendGmailEmail = vi.fn(async () => {});
    const { db } = makeDb({
      templates: [baseTemplate()],
      jobs: [
        {
          id: "job1",
          data: baseJobData({ visioneAutoInviteSentAt: Timestamp.now() }),
        },
      ],
      clienti,
    });
    h.db = db;

    const res = await runVisioneAutoInviteCheck();

    expect(res.sent).toBe(0);
    expect(res.skipped).toBe(1);
    expect(h.sendGmailEmail).not.toHaveBeenCalled();
  });

  it("does NOT auto-send when a MANUAL send for the same template already exists", async () => {
    h.sendGmailEmail = vi.fn(async () => {});
    const { db } = makeDb({
      templates: [baseTemplate()],
      jobs: [
        {
          id: "job1",
          data: baseJobData({
            workflowEvents: [
              { tipo: "consulenza_inviata", metadata: { templateId: "tpl1" } },
            ],
          }),
        },
      ],
      clienti,
    });
    h.db = db;

    const res = await runVisioneAutoInviteCheck();

    expect(res.sent).toBe(0);
    expect(res.skipped).toBe(1);
    expect(h.sendGmailEmail).not.toHaveBeenCalled();
  });

  it("rolls back the marker ONLY when the email send fails", async () => {
    h.sendGmailEmail = vi.fn(async () => {
      throw new Error("SMTP down");
    });
    const { db, liveJobs, timelineAdds } = makeDb({
      templates: [baseTemplate()],
      jobs: [{ id: "job1", data: baseJobData() }],
      clienti,
    });
    h.db = db;

    const res = await runVisioneAutoInviteCheck();

    expect(res.sent).toBe(0);
    expect(res.errors.length).toBeGreaterThanOrEqual(1);
    expect(h.sendGmailEmail).toHaveBeenCalledTimes(1);
    // Marker rolled back so the next hourly run can retry.
    expect(liveJobs.job1.visioneAutoInviteSentAt).toBeNull();
    expect(liveJobs.job1.visioneAutoInviteTemplateId).toBeNull();
    // No timeline written when the email never went out.
    expect(timelineAdds).toHaveLength(0);
  });

  it("blocks the auto-send inside the lock when a concurrent MANUAL send appears", async () => {
    h.sendGmailEmail = vi.fn(async () => {});
    // The collection query sees a clean job (passes the pre-checks), but the
    // fresh transactional read sees a manual send committed in the meantime.
    const { db } = makeDb({
      templates: [baseTemplate()],
      jobs: [
        {
          id: "job1",
          data: baseJobData({
            workflowEvents: [
              { tipo: "consulenza_inviata", metadata: { templateId: "tpl1" } },
            ],
          }),
          staleQuery: baseJobData(),
        },
      ],
      clienti,
    });
    h.db = db;

    const res = await runVisioneAutoInviteCheck();

    expect(res.sent).toBe(0);
    expect(res.skipped).toBe(1);
    expect(h.sendGmailEmail).not.toHaveBeenCalled();
  });

  it("blocks the auto-send inside the lock when the marker appears concurrently", async () => {
    h.sendGmailEmail = vi.fn(async () => {});
    const { db } = makeDb({
      templates: [baseTemplate()],
      jobs: [
        {
          id: "job1",
          data: baseJobData({ visioneAutoInviteSentAt: Timestamp.now() }),
          staleQuery: baseJobData(),
        },
      ],
      clienti,
    });
    h.db = db;

    const res = await runVisioneAutoInviteCheck();

    expect(res.sent).toBe(0);
    expect(res.skipped).toBe(1);
    expect(h.sendGmailEmail).not.toHaveBeenCalled();
  });

  it("is idempotent across consecutive runs (no double send)", async () => {
    h.sendGmailEmail = vi.fn(async () => {});
    const { db } = makeDb({
      templates: [baseTemplate()],
      jobs: [{ id: "job1", data: baseJobData() }],
      clienti,
    });
    h.db = db;

    const first = await runVisioneAutoInviteCheck();
    const second = await runVisioneAutoInviteCheck();

    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0); // marker now persisted -> skipped
    expect(h.sendGmailEmail).toHaveBeenCalledTimes(1);
  });

  it("only sends for eligible jobs when mixed with an already-sent one", async () => {
    h.sendGmailEmail = vi.fn(async () => {});
    const { db } = makeDb({
      templates: [baseTemplate()],
      jobs: [
        { id: "jobSent", data: baseJobData({ visioneAutoInviteSentAt: Timestamp.now() }) },
        { id: "jobNew", data: baseJobData() },
      ],
      clienti,
    });
    h.db = db;

    const res = await runVisioneAutoInviteCheck();

    expect(res.sent).toBe(1);
    expect(res.skipped).toBe(1);
    expect(h.sendGmailEmail).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Date logic: the link's "earliest bookable date" (dateFrom) must respect the
// postproduction lead AND must never land on a wrong day (Sunday, all-day, or
// — when enabled — the day right after an all-day event).
// ---------------------------------------------------------------------------
describe("runVisioneAutoInviteCheck — dateFrom (giorni giusti)", () => {
  // Frozen "now" = Monday 2026-06-15 10:00 Europe/Rome (CEST, +02:00).
  const FROZEN_NOW = new Date("2026-06-15T10:00:00+02:00");

  beforeEach(() => {
    h.db = null;
    h.sendGmailEmail = null;
    h.allDayDates = new Set<string>();
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // The job event is "today" (matured) under the frozen clock.
  function maturedJob() {
    return {
      id: "job1",
      data: baseJobData({
        eventDate: { toDate: () => new Date("2026-06-15T00:00:00+02:00"), __ts: true },
      }),
    };
  }

  // Extract the dateFrom query param from the email HTML passed to sendGmailEmail.
  function sentDateFrom(): string | null {
    const html: string = (h.sendGmailEmail as any).mock.calls[0][2];
    const m = html.match(/dateFrom=(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }

  it("computes a dateFrom that skips all-day days (postproduction lead > 0)", async () => {
    // lead=1, no day-after rule. all-day on Tue 2026-06-16.
    // computeEarliestBookableDate(Mon 06-15, 1, {06-16}):
    //   +1 Tue 16 (all-day SKIP), +1 Wed 17 (count 1) -> earliest = Thu 18.
    h.allDayDates = new Set(["2026-06-16"]);
    h.sendGmailEmail = vi.fn(async () => {});
    const { db } = makeDb({
      templates: [baseTemplate({ giorniPostproduzione: 1, bloccaGiornoDopoEventoGiornataIntera: false })],
      jobs: [maturedJob()],
      clienti,
    });
    h.db = db;

    const res = await runVisioneAutoInviteCheck();

    expect(res.sent).toBe(1);
    expect(sentDateFrom()).toBe("2026-06-18");
  });

  it("pushes dateFrom past the day-after-all-day when the rule is ENABLED", async () => {
    // lead=1, all-day on Wed 06-17 and Thu 06-18, block-day-after ENABLED.
    // computeEarliestBookableDate(Mon 06-15, 1, {06-17,06-18}):
    //   +1 Tue 16 (count 1) -> earliest = Wed 17.
    // alignment loop:
    //   Wed 17 all-day -> 18; Thu 18 all-day -> 19;
    //   Fri 19 prev(18) all-day & rule ON -> 20; Sat 20 ok -> dateFrom = 2026-06-20.
    h.allDayDates = new Set(["2026-06-17", "2026-06-18"]);
    h.sendGmailEmail = vi.fn(async () => {});
    const { db } = makeDb({
      templates: [baseTemplate({ giorniPostproduzione: 1, bloccaGiornoDopoEventoGiornataIntera: true })],
      jobs: [maturedJob()],
      clienti,
    });
    h.db = db;

    const res = await runVisioneAutoInviteCheck();

    expect(res.sent).toBe(1);
    expect(sentDateFrom()).toBe("2026-06-20");
  });

  it("does NOT push past the day-after-all-day when the rule is DISABLED", async () => {
    // Same all-day set, rule OFF: alignment stops at Fri 19 (prev all-day ignored).
    h.allDayDates = new Set(["2026-06-17", "2026-06-18"]);
    h.sendGmailEmail = vi.fn(async () => {});
    const { db } = makeDb({
      templates: [baseTemplate({ giorniPostproduzione: 1, bloccaGiornoDopoEventoGiornataIntera: false })],
      jobs: [maturedJob()],
      clienti,
    });
    h.db = db;

    const res = await runVisioneAutoInviteCheck();

    expect(res.sent).toBe(1);
    expect(sentDateFrom()).toBe("2026-06-19");
  });

  it("omits dateFrom entirely when lead is 0 (rule disabled)", async () => {
    h.sendGmailEmail = vi.fn(async () => {});
    const { db } = makeDb({
      templates: [baseTemplate({ giorniPostproduzione: 0 })],
      jobs: [maturedJob()],
      clienti,
    });
    h.db = db;

    const res = await runVisioneAutoInviteCheck();

    expect(res.sent).toBe(1);
    expect(sentDateFrom()).toBeNull();
  });
});
