import { beforeEach, describe, expect, it, vi } from "vitest";

// Audit 19/11/2026 punto 6: un evento cancellato su Google resta leggibile con status "cancelled".
// ensureJobCalendarEvent lo considerava esistente ("verified") e non lo ricreava mai.
const h = vi.hoisted(() => ({
  job: null as any,
  existing: null as any,
  updates: [] as any[],
  created: [] as any[],
  updated: [] as any[],
}));

vi.mock("./firebase-admin.js", () => {
  const doc = (collection: string, id: string) => ({
    get: async () => collection === "jobs"
      ? { exists: !!h.job, data: () => h.job }
      : { exists: false, data: () => undefined },
    update: async (data: any) => {
      h.updates.push(data);
      if (collection === "jobs") h.job = { ...h.job, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, (v as any)?.__delete ? undefined : v])) };
    },
  });
  return {
    db: { collection: (name: string) => ({ doc: (id: string) => doc(name, id) }) },
    FieldValue: { serverTimestamp: () => "TS", delete: () => ({ __delete: true }) },
    Timestamp: { now: () => "now", fromDate: (d: Date) => d },
  };
});
vi.mock("./google-calendar.js", () => ({
  getEvents: vi.fn(),
  createEvent: async (_c: string, data: any) => { h.created.push(data); return { id: "new-event" }; },
  updateEvent: async (_c: string, id: string, data: any) => { h.updated.push({ id, data }); return {}; },
  getEventById: async () => h.existing,
  createEuropeRomeDate: (date: string, time: string) => new Date(`${date}T${time}:00+01:00`),
}));
vi.mock("./email-routes.js", () => ({
  sendGmailEmail: vi.fn(), getStudioContactInfo: vi.fn(), getSiteBaseUrl: () => "https://example.test",
  authenticateFirebase: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("./job-aggregates.js", () => ({ recomputeJobAggregates: vi.fn() }));

const { ensureJobCalendarEvent } = await import("./job-routes.js");

beforeEach(() => {
  h.job = {
    nomeEvento: "Matrimonio", jobType: "Matrimonio", status: "confermato", allDay: true,
    eventDate: { toDate: () => new Date("2027-05-20T10:00:00Z") }, googleCalendarEventId: "old-event",
  };
  h.existing = null; h.updates = []; h.created = []; h.updated = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("ensureJobCalendarEvent", () => {
  it("lascia l'evento esistente e lo aggiorna", async () => {
    h.existing = { id: "old-event", status: "confirmed" };
    const result = await ensureJobCalendarEvent("job-1");
    expect(result).toMatchObject({ success: true, action: "verified", eventId: "old-event" });
    expect(h.created).toHaveLength(0);
  });

  it("ricrea l'evento se Google restituisce null (404/410)", async () => {
    h.existing = null;
    const result = await ensureJobCalendarEvent("job-1");
    expect(result).toMatchObject({ success: true, action: "recreated", eventId: "new-event" });
    expect(h.created).toHaveLength(1);
  });

  it("ricrea l'evento se Google lo restituisce con stato cancelled", async () => {
    h.existing = { id: "old-event", status: "cancelled" };
    const result = await ensureJobCalendarEvent("job-1");
    expect(result).toMatchObject({ success: true, action: "recreated", eventId: "new-event" });
    expect(h.created).toHaveLength(1);
    expect(h.updated).toHaveLength(0); // non si "aggiorna" un evento cancellato
  });
});
