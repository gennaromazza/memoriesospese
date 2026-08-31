import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DateTime } from "luxon";
import type { ConsultationTemplate } from "../../shared/consultation-types.js";

// ---------------------------------------------------------------------------
// Mutable holder shared with the hoisted google-sync mock. Each test reassigns
// `h.googleEvents` to control which Google Calendar busy periods are "fetched".
// Everything else (slot generation, lead computation, day-after-all-day rule)
// runs the REAL Calendar Engine V2 logic so the test exercises the production
// path end-to-end. Firestore is an empty in-memory fake (events come from
// Google) — this still drives the real consultations/bookings/jobs query code.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  googleEvents: [] as Array<{
    start: Date;
    end: Date;
    allDay: boolean;
    title?: string;
    source?: string;
  }>,
}));

vi.mock("../calendar-engine/google-sync", () => ({
  checkGoogleCalendarBusyPeriods: vi.fn(async () => h.googleEvents),
}));

// Import AFTER the mock is registered.
import { getConsultationUnavailableDates } from "./calendar-adapter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Empty Firestore fake: chainable .collection().where()...get() → no docs.
// (consultations / bookings / jobs all resolve to empty snapshots.)
function makeEmptyDb() {
  const emptySnap = { docs: [] as any[], size: 0 };
  const chain: any = {
    where: () => chain,
    get: async () => emptySnap,
  };
  return { collection: () => chain };
}

// Build a Date at a given Europe/Rome wall-clock time.
function rome(iso: string): Date {
  return DateTime.fromISO(iso, { zone: "Europe/Rome" }).toJSDate();
}

// All-day Google event covering exactly `dateStr` (Rome). Google all-day events
// end at next-day midnight (exclusive), which is how the adapter expects them.
function allDayEvent(dateStr: string) {
  return {
    start: rome(`${dateStr}T00:00`),
    end: DateTime.fromISO(`${dateStr}T00:00`, { zone: "Europe/Rome" })
      .plus({ days: 1 })
      .toJSDate(),
    allDay: true,
    title: "All-day block",
    source: "google-calendar",
  };
}

// Timed Google event (busy) within a single Rome day.
function timedEvent(dateStr: string, startTime: string, endTime: string) {
  return {
    start: rome(`${dateStr}T${startTime}`),
    end: rome(`${dateStr}T${endTime}`),
    allDay: false,
    title: "Timed busy",
    source: "google-calendar",
  };
}

// Template: Mon–Sat 09:00–17:00 (no break), Sunday closed, 60-min slots.
function makeTemplate(
  overrides: Partial<ConsultationTemplate> = {},
): ConsultationTemplate {
  const customWorkingHours = [0, 1, 2, 3, 4, 5, 6].map((giornoSettimana) => ({
    giornoSettimana,
    apertura: "09:00",
    chiusura: "17:00",
    attivo: giornoSettimana !== 0, // Sunday closed
  }));
  return {
    id: "tpl-test",
    nome: "Consulenza Test",
    durataMinuti: 60,
    customWorkingHours,
    ...overrides,
  } as unknown as ConsultationTemplate;
}

// "now" = Monday 2026-06-15 09:00 Europe/Rome (07:00 UTC, CEST = UTC+2).
const NOW = new Date("2026-06-15T07:00:00Z");

describe("getConsultationUnavailableDates", () => {
  beforeEach(() => {
    h.googleEvents = [];
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks a past day as unavailable", async () => {
    // Range Sat 2026-06-13 .. Mon 2026-06-15. Sat & Sun are in the past; Mon is today.
    const result = await getConsultationUnavailableDates(
      makeTemplate(),
      "2026-06-13",
      "2026-06-15",
      makeEmptyDb(),
    );
    expect(result).toContain("2026-06-13"); // past
    expect(result).toContain("2026-06-14"); // past (also Sunday)
    expect(result).not.toContain("2026-06-15"); // today, available
  // Prima invocazione: il percorso production carica pigramente Luxon,
  // firebase-admin, Google Calendar e Calendar Engine. Nella suite parallela
  // completa il cold import puo superare 15 s per contesa CPU; isolato il test
  // chiude in meno di 2 s. Il timeout mirato conserva un limite finito senza
  // trasformare un cold-start legittimo in un falso negativo.
  }, 45_000);

  it("marks days before the earliest-bookable date (postproduction lead) as unavailable", async () => {
    // lead = 2 working days. now = Mon 06-15 → count Tue16(1), Wed17(2) → earliest = Thu 18.
    const result = await getConsultationUnavailableDates(
      makeTemplate({ giorniPostproduzione: 2 }),
      "2026-06-16",
      "2026-06-18",
      makeEmptyDb(),
    );
    expect(result).toContain("2026-06-16"); // before earliest
    expect(result).toContain("2026-06-17"); // before earliest
    expect(result).not.toContain("2026-06-18"); // earliest bookable → available
  });

  it("blocks the day AFTER an all-day event when the template enables it", async () => {
    // All-day event on Wed 06-17. With blockDayAfterAllDayEvent, Thu 06-18 is blocked
    // purely by the rule; Fri 06-19 (two days after) stays available.
    h.googleEvents = [allDayEvent("2026-06-17")];
    const result = await getConsultationUnavailableDates(
      makeTemplate({ bloccaGiornoDopoEventoGiornataIntera: true }),
      "2026-06-18",
      "2026-06-19",
      makeEmptyDb(),
    );
    expect(result).toContain("2026-06-18"); // day-after-all-day → blocked
    expect(result).not.toContain("2026-06-19"); // available
  });

  it("marks a day fully covered by an all-day event as unavailable", async () => {
    // All-day event on Thu 06-18 covers the whole day → zero slots.
    h.googleEvents = [allDayEvent("2026-06-18")];
    const result = await getConsultationUnavailableDates(
      makeTemplate(),
      "2026-06-18",
      "2026-06-18",
      makeEmptyDb(),
    );
    expect(result).toContain("2026-06-18");
  });

  it("marks a sold-out day (all slots taken by timed events) as unavailable", async () => {
    // A single busy event spanning the whole working day 09:00–17:00 on Fri 06-19.
    h.googleEvents = [timedEvent("2026-06-19", "09:00", "17:00")];
    const result = await getConsultationUnavailableDates(
      makeTemplate(),
      "2026-06-18",
      "2026-06-19",
      makeEmptyDb(),
    );
    expect(result).toContain("2026-06-19"); // sold out
    expect(result).not.toContain("2026-06-18"); // free → available
  });

  it("leaves a normal working day with no events available", async () => {
    // Thu 06-18 .. Sat 06-20: all working days, no events. Sunday excluded if present.
    const result = await getConsultationUnavailableDates(
      makeTemplate(),
      "2026-06-18",
      "2026-06-20",
      makeEmptyDb(),
    );
    expect(result).not.toContain("2026-06-18");
    expect(result).not.toContain("2026-06-19");
    expect(result).not.toContain("2026-06-20");
  });

  it("marks a closed weekday (Sunday) as unavailable", async () => {
    // Sun 06-21 is closed in the template → no slots.
    const result = await getConsultationUnavailableDates(
      makeTemplate(),
      "2026-06-20",
      "2026-06-21",
      makeEmptyDb(),
    );
    expect(result).toContain("2026-06-21"); // Sunday closed
    expect(result).not.toContain("2026-06-20"); // Saturday open
  });
});
