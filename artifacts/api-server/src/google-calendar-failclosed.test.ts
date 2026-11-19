import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// Regressione audit 19/11/2026: la lettura degli eventi di TUTTI i calendari era
// fail-open (un calendario in errore veniva saltato, lista vuota => []), quindi
// slot occupati risultavano liberi. Ora ogni errore o lista vuota deve lanciare.

const h = vi.hoisted(() => ({
  calendarListGet: vi.fn(),
  calendarListList: vi.fn(),
  calendarListInsert: vi.fn(),
  eventsList: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      JWT: class {
        async authorize() {
          return {};
        }
      },
    },
    calendar: () => ({
      calendarList: {
        get: h.calendarListGet,
        list: h.calendarListList,
        insert: h.calendarListInsert,
      },
      events: { list: h.eventsList },
    }),
  },
}));

vi.mock("./system-alerts.js", () => ({
  notifyCalendarUnavailable: h.notify,
}));

const CALS = [
  { id: "studio", summary: "Studio" },
  { id: "festivi", summary: "Festivi" },
];

const apiError = (status: number, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(`Google API ${status}`), {
    code: status,
    response: { status },
    ...extra,
  });

const timedEvent = (id: string) => ({
  id,
  summary: `Evento ${id}`,
  status: "confirmed",
  start: { dateTime: "2027-02-10T10:00:00+01:00" },
  end: { dateTime: "2027-02-10T11:00:00+01:00" },
});

const T0 = new Date("2027-02-10T00:00:00Z");
const T1 = new Date("2027-02-11T00:00:00Z");

async function load() {
  vi.resetModules();
  return import("./google-calendar.js");
}

/** Esegue la promise lasciando correre i timer finti (backoff dei retry). */
async function settle<T>(p: Promise<T>) {
  const guarded = p.then(
    (v) => ({ ok: true as const, v }),
    (e) => ({ ok: false as const, e }),
  );
  await vi.runAllTimersAsync();
  return guarded;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.calendarListGet.mockReset();
  h.calendarListList.mockReset();
  h.calendarListInsert.mockReset();
  h.eventsList.mockReset();
  h.notify.mockReset();
  h.calendarListList.mockResolvedValue({ data: { items: CALS } });
  process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL = "sa@proj.iam.gserviceaccount.com";
  process.env.GOOGLE_CALENDAR_PRIVATE_KEY =
    "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";
  delete process.env.GOOGLE_CALENDAR_ID;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("getEventsWithDetailsAllCalendars e' fail-closed", () => {
  it("lancia se un calendario fallisce in modo persistente (429) anche senza strict", async () => {
    const { getEventsWithDetailsAllCalendars } = await load();
    h.eventsList.mockImplementation(async ({ calendarId }: any) => {
      if (calendarId === "studio") throw apiError(429);
      return { data: { items: [] } };
    });

    const r = await settle(getEventsWithDetailsAllCalendars(T0, T1));

    expect(r.ok).toBe(false);
    expect((r as any).e.message).toContain("Studio");
    const studioCalls = h.eventsList.mock.calls.filter(([a]) => a.calendarId === "studio");
    expect(studioCalls).toHaveLength(3); // 3 tentativi
  });

  it("recupera da un 429 transitorio e restituisce gli eventi", async () => {
    const { getEventsWithDetailsAllCalendars } = await load();
    let studioCalls = 0;
    h.eventsList.mockImplementation(async ({ calendarId }: any) => {
      if (calendarId === "studio") {
        studioCalls += 1;
        if (studioCalls === 1) throw apiError(429);
        return { data: { items: [timedEvent("a")] } };
      }
      return { data: { items: [timedEvent("b")] } };
    });

    const r = await settle(getEventsWithDetailsAllCalendars(T0, T1));

    expect(r.ok).toBe(true);
    const events = (r as any).v;
    expect(events.map((e: any) => e.eventId).sort()).toEqual(["a", "b"]);
    expect(studioCalls).toBe(2);
  });

  it("lancia con lista calendari vuota", async () => {
    const { getEventsWithDetailsAllCalendars } = await load();
    h.calendarListList.mockResolvedValue({ data: { items: [] } });

    const r = await settle(getEventsWithDetailsAllCalendars(T0, T1));

    expect(r.ok).toBe(false);
    expect(h.eventsList).not.toHaveBeenCalled();
  });

  it("non ritenta errori permanenti (404) e lancia", async () => {
    const { getEventsWithDetailsAllCalendars } = await load();
    h.eventsList.mockImplementation(async ({ calendarId }: any) => {
      if (calendarId === "festivi") throw apiError(404);
      return { data: { items: [] } };
    });

    const r = await settle(getEventsWithDetailsAllCalendars(T0, T1));

    expect(r.ok).toBe(false);
    expect(h.eventsList.mock.calls.filter(([a]) => a.calendarId === "festivi")).toHaveLength(1);
  });

  it("ritenta un 403 rateLimitExceeded ma non un 403 di permessi", async () => {
    const { getEventsWithDetailsAllCalendars } = await load();
    let studioCalls = 0;
    h.eventsList.mockImplementation(async ({ calendarId }: any) => {
      if (calendarId === "studio") {
        studioCalls += 1;
        if (studioCalls === 1)
          throw apiError(403, { errors: [{ reason: "rateLimitExceeded" }] });
        return { data: { items: [] } };
      }
      throw apiError(403, { errors: [{ reason: "forbidden" }] });
    });

    const r = await settle(getEventsWithDetailsAllCalendars(T0, T1));

    expect(r.ok).toBe(false); // festivi: 403 permessi
    expect(studioCalls).toBe(2); // rate limit ritentato
    expect(h.eventsList.mock.calls.filter(([a]) => a.calendarId === "festivi")).toHaveLength(1);
  });

  it("legge i calendari in parallelo con timeout per chiamata", async () => {
    const { getEventsWithDetailsAllCalendars } = await load();
    const order: string[] = [];
    h.eventsList.mockImplementation(async ({ calendarId }: any, opts: any) => {
      order.push(`start:${calendarId}`);
      expect(opts).toMatchObject({ timeout: 15000 });
      await Promise.resolve();
      order.push(`end:${calendarId}`);
      return { data: { items: [] } };
    });

    const r = await settle(getEventsWithDetailsAllCalendars(T0, T1));

    expect(r.ok).toBe(true);
    // parallelo: entrambi partono prima che il primo termini
    expect(order.slice(0, 2)).toEqual(["start:studio", "start:festivi"]);
  });

  it("segue la paginazione di un calendario", async () => {
    const { getEventsWithDetailsAllCalendars } = await load();
    h.calendarListList.mockResolvedValue({ data: { items: [CALS[0]] } });
    h.eventsList
      .mockResolvedValueOnce({ data: { items: [timedEvent("p1")], nextPageToken: "T" } })
      .mockResolvedValueOnce({ data: { items: [timedEvent("p2")] } });

    const r = await settle(getEventsWithDetailsAllCalendars(T0, T1));

    expect(r.ok).toBe(true);
    expect((r as any).v.map((e: any) => e.eventId)).toEqual(["p1", "p2"]);
  });
});

describe("listCalendars / ensureCalendarInList", () => {
  it("ritenta calendarList.list su 503 transitorio", async () => {
    const { listCalendars } = await load();
    h.calendarListList
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce({ data: { items: CALS } });

    const r = await settle(listCalendars());

    expect(r.ok).toBe(true);
    expect((r as any).v).toHaveLength(2);
  });

  it("non marca il calendario come 'ensured' se l'inserimento fallisce", async () => {
    process.env.GOOGLE_CALENDAR_ID = "shared@group.calendar.google.com";
    const { listCalendars } = await load();
    h.calendarListGet.mockRejectedValue(apiError(404));
    h.calendarListInsert.mockRejectedValue(apiError(403));

    await settle(listCalendars());
    await settle(listCalendars());

    // secondo giro: riprova ancora get/insert invece di fidarsi del flag
    expect(h.calendarListGet).toHaveBeenCalledTimes(2);
    expect(h.calendarListInsert).toHaveBeenCalledTimes(2);
  });
});

describe("calendar-engine/google-sync e' fail-closed", () => {
  it("hasAllDayEvent lancia CALENDAR_UNAVAILABLE se Google non e' leggibile", async () => {
    vi.resetModules();
    const sync = await import("./calendar-engine/google-sync.js");
    h.eventsList.mockRejectedValue(apiError(404));

    const r = await settle(sync.hasAllDayEvent(T0));

    expect(r.ok).toBe(false);
    expect((r as any).e.code).toBe("CALENDAR_UNAVAILABLE");
  });

  it("checkGoogleCalendarBusyPeriods non restituisce [] se un calendario manca e avvisa l'admin", async () => {
    vi.resetModules();
    const sync = await import("./calendar-engine/google-sync.js");
    h.eventsList.mockImplementation(async ({ calendarId }: any) => {
      if (calendarId === "studio") throw apiError(429);
      return { data: { items: [] } };
    });

    const r = await settle(sync.checkGoogleCalendarBusyPeriods(T0, T1));

    expect(r.ok).toBe(false);
    expect((r as any).e.code).toBe("CALENDAR_UNAVAILABLE");
    expect(h.notify).toHaveBeenCalled();
  });
});
