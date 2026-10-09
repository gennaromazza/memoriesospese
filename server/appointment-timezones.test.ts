import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { DateTime } from "luxon";

const h = vi.hoisted(() => ({
  records: {} as Record<string, Record<string, any>>,
  sent: [] as any[][],
  created: [] as any[],
  updated: [] as any[],
  slots: [] as any[],
  removed: Symbol("delete"),
}));

// Every persistence/provider boundary is fake. Real routes, service, adapter,
// calendar links and HTML templates are exercised without loading credentials.
const timestamp = (date: Date) => ({ toDate: () => date });
function collection(name: string): any {
  const records = h.records[name] ||= {};
  const doc = (id: string): any => ({
    id,
    get: async () => ({ id, exists: !!records[id], data: () => records[id] }),
    update: async (data: any) => {
      for (const [key, value] of Object.entries(data)) {
        if (value === h.removed) delete records[id][key];
        else records[id][key] = value;
      }
    },
    set: async (data: any) => { records[id] = data; },
    delete: async () => { delete records[id]; },
  });
  const query = (filters: any[] = []): any => ({
    where: (...filter: any[]) => query([...filters, filter]),
    orderBy: () => query(filters),
    limit: () => query(filters),
    get: async () => {
      const docs = Object.entries(records).filter(([, data]) => filters.every(([key, op, value]) => {
        const a = data[key]?.toDate?.()?.getTime() ?? data[key];
        const b = value?.toDate?.()?.getTime() ?? value;
        return op === "==" ? a === b : op === "in" ? b.includes(a) : op === ">=" ? a >= b : a <= b;
      })).map(([id, data]) => ({ id, ref: doc(id), data: () => data }));
      return { docs, size: docs.length, empty: !docs.length, forEach: (fn: any) => docs.forEach(fn) };
    },
  });
  return {
    ...query(), doc,
    add: async (data: any) => {
      const id = `new-${Object.keys(records).length}`;
      records[id] = data;
      return doc(id);
    },
  };
}

vi.mock("./firebase-admin.js", () => ({
  db: {
    collection: (name: string) => collection(name),
    runTransaction: async (fn: any) => fn({
      get: (ref: any) => ref.get(),
      update: (ref: any, data: any) => ref.update(data),
    }),
  },
  Timestamp: { now: () => timestamp(new Date()), fromDate: (date: Date) => timestamp(date) },
  FieldValue: {
    serverTimestamp: () => timestamp(new Date()),
    arrayUnion: (...values: any[]) => values,
    delete: () => h.removed,
  },
  storage: {},
}));
vi.mock("firebase-admin/firestore", () => ({
  Timestamp: class {
    static now() { return timestamp(new Date()); }
    static fromDate(date: Date) { return timestamp(date); }
  },
  FieldValue: { serverTimestamp: () => timestamp(new Date()), delete: () => h.removed },
}));
vi.mock("./google-calendar.js", async (importOriginal) => ({
  ...await importOriginal<any>(),
  createEvent: async (_calendar: string, data: any) => {
    h.created.push(data);
    return { id: `event-${h.created.length}` };
  },
  updateEvent: async (_calendar: string, id: string, data: any) => { h.updated.push({ id, ...data }); },
  deleteEvent: vi.fn(),
  checkFreeBusy: async () => [],
  getEventsWithDetailsAllCalendars: async () => [],
}));
vi.mock("./calendar-engine/google-sync", () => ({ checkGoogleCalendarBusyPeriods: async () => [] }));
vi.mock("./booking/calendar-adapter.js", () => ({
  campaignToAvailabilityConfig: () => ({}),
  validateCampaign: () => true,
  getAllExistingBookingEvents: async () => [],
}));
vi.mock("./calendar-engine/index.js", () => ({
  getAvailableSlotsForDate: async () => h.slots,
}));
vi.mock("./email-routes.js", async (importOriginal) => ({
  ...await importOriginal<any>(),
  sendGmailEmail: async (...args: any[]) => { h.sent.push(args); return { success: true }; },
  getStudioContactInfo: async () => ({
    name: "Studio Test", email: "studio@example.invalid", phone: "000", address: "Via Test",
  }),
  authenticateFirebase: (req: any, _res: any, next: any) => {
    req.user = { uid: "test-admin", email: "gennaro.mazzacane@gmail.com" };
    next();
  },
}));
vi.mock("axios", () => ({ default: { post: vi.fn().mockResolvedValue({ data: {} }) } }));

const { default: bookingRouter } = await import("./booking-routes.js");
const { default: consultationRouter } = await import("./consultation-routes.js");
const { default: calendarRouter } = await import("./calendar-routes.js");
const { runReminderCheck } = await import("./reminder-routes.js");
const { getAllExistingEvents } = await import("./consultations/calendar-adapter.js");
const { updateConsultation } = await import("./services/consultations.js");
const { generateClienteIdFromEmail } = await import("./utils/normalize.js");
const { consultationSlot } = await import("./consultations/slot.js");

const app = express();
app.use(express.json());
app.use("/booking", bookingRouter);
app.use("/consultations", consultationRouter);
app.use("/calendar", calendarRouter);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => server.close());
afterEach(() => vi.useRealTimers());

const cliente = { nome: "Test", cognome: "Cliente", email: "test@example.invalid", whatsapp: "000" };
beforeEach(() => {
  h.records = {
    clienti: { [generateClienteIdFromEmail(cliente.email)]: { ...cliente } },
    booking_campaigns: { campaign: { nome: "Test Shooting", attiva: true, prodottiDisponibili: ["product"] } },
    consultationTemplates: {
      template: { nome: "Consulenza", jobType: "Test", attiva: true, durataMinuti: 30, jobDataFields: [],
        customWorkingHours: [{ attivo: true, giornoSettimana: 1, apertura: "00:00", chiusura: "23:59" }] },
    },
  };
  h.sent = [];
  h.created = [];
  h.updated = [];
  h.slots = [];
});

const cases = [
  ["inverno, mezzanotte", "2026-01-15", "00:15", "00:45", "2026-01-14T23:15:00.000Z", "2026-01-14T23:45:00.000Z", "15 gennaio 2026"],
  ["estate, mezzanotte", "2026-07-15", "00:15", "00:45", "2026-07-14T22:15:00.000Z", "2026-07-14T22:45:00.000Z", "15 luglio 2026"],
  ["prima del salto primaverile", "2026-03-29", "01:15", "01:45", "2026-03-29T00:15:00.000Z", "2026-03-29T00:45:00.000Z", "29 marzo 2026"],
  ["dopo il salto primaverile", "2026-03-29", "03:15", "03:45", "2026-03-29T01:15:00.000Z", "2026-03-29T01:45:00.000Z", "29 marzo 2026"],
  ["attraverso il salto primaverile", "2026-03-29", "01:45", "03:15", "2026-03-29T00:45:00.000Z", "2026-03-29T01:15:00.000Z", "29 marzo 2026"],
  ["prima del cambio autunnale", "2026-10-25", "01:15", "01:45", "2026-10-24T23:15:00.000Z", "2026-10-24T23:45:00.000Z", "25 ottobre 2026"],
  ["attraverso l'ora autunnale ripetuta", "2026-10-25", "02:45", "02:15", "2026-10-25T00:45:00.000Z", "2026-10-25T01:15:00.000Z", "25 ottobre 2026"],
  ["dopo il cambio autunnale", "2026-10-25", "03:15", "03:45", "2026-10-25T02:15:00.000Z", "2026-10-25T02:45:00.000Z", "25 ottobre 2026"],
];
async function request(path: string, method: string, body: any = {}) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json() as any;
  expect(response.status, JSON.stringify(result)).toBeLessThan(300);
  return result;
}
function clientHTML() { return h.sent.filter(([to]) => to === cliente.email).at(-1)?.[2] as string; }
function expectEmail(day: string, time: string, start?: Date, end?: Date) {
  const html = clientHTML();
  expect(html).toContain(day);
  expect(html).toContain(time);
  if (start && end) {
    const utc = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(".000", "");
    const dates = html.match(/[?&]dates=([^"&]+)/)?.[1];
    expect(dates).toBeTruthy();
    expect(decodeURIComponent(dates!)).toBe(`${utc(start)}/${utc(end)}`);
  }
}

describe("slot → database → Calendar → email, processo UTC", () => {
  it("runs with a UTC server, not just an Italian locale", () => {
    expect(new Date("2026-07-15T00:00:00Z").getTimezoneOffset()).toBe(0);
  });

  it.each(cases)("prenotazione: %s", async (_label, day, startTime, endTime, startISO, endISO, italianDay) => {
    const start = new Date(startISO), end = new Date(endISO);
    h.slots = [{ start, end }];
    const created = await request("/booking/v2/create", "POST", {
      campaignId: "campaign", cliente, dataShootingInizio: startISO, dataShootingFine: endISO,
      prodottoId: "product", prodottoNome: "Test", note: "",
    });
    const id = created.bookingId;
    expect(h.records.bookings[id].dataShootingInizio.toDate()).toEqual(start);
    expect(h.records.bookings[id].dataShootingFine.toDate()).toEqual(end);
    expectEmail(italianDay, `${startTime} - ${endTime}`);
    await request(`/booking/v2/${id}/approve`, "PATCH");
    expect(h.created.at(-1)).toMatchObject({ start, end });
    expectEmail(italianDay, `${startTime} - ${endTime}`, start, end);
    // The email-change notification used to show both UTC date and UTC time.
    await request(`/booking/${id}/update`, "PATCH", { cliente: { email: cliente.email }, oldEmail: "old@example.invalid" });
    expectEmail(italianDay, startTime);
  });

  it.each(cases)("consulenza: %s", async (_label, day, startTime, endTime, startISO, endISO, italianDay) => {
    const created = await request("/consultations/v2/create", "POST", {
      templateId: "template", cliente, dataConsulenza: day, orarioInizio: startTime, orarioFine: endTime,
    });
    const id = created.id, start = new Date(startISO), end = new Date(endISO);
    expect(h.records.consultations[id].dataConsulenza.toDate()).toEqual(start);
    expectEmail(italianDay, `${startTime} - ${endTime}`);
    await request(`/consultations/v2/${id}/approve`, "PATCH");
    expect(h.created.at(-1)).toMatchObject({ start, end });
    expectEmail(italianDay, `${startTime} - ${endTime}`, start, end);
    const events = await getAllExistingEvents(
      DateTime.fromISO(day, { zone: "Europe/Rome" }).startOf("day").toJSDate(),
      DateTime.fromISO(day, { zone: "Europe/Rome" }).endOf("day").toJSDate(),
      (await import("./firebase-admin.js")).db,
      { includeGoogle: false, includeJobs: false, includeBookings: false },
    );
    expect(events[0]).toMatchObject({ start, end, source: "consultation" });
  });

  it.each(cases)("approvazione prenotazione legacy: %s", async (_label, _day, startTime, endTime, startISO, endISO, italianDay) => {
    const start = new Date(startISO), end = new Date(endISO);
    h.records.bookings = { b: {
      cliente, stato: "in_attesa", campaignId: "campaign",
      dataShootingInizio: timestamp(start), dataShootingFine: timestamp(end),
    } };
    await request("/booking/b/approve", "PATCH");
    expect(h.created.at(-1)).toMatchObject({ start, end });
    expectEmail(italianDay, `${startTime} - ${endTime}`, start, end);
  });

  it.each(cases)("promemoria prenotazione e consulenza legacy: %s", async (_label, day, startTime, endTime, startISO, endISO, italianDay) => {
    const start = new Date(startISO), end = new Date(endISO);
    h.records.bookings = { b: {
      cliente, stato: "confermata", dataShootingInizio: timestamp(start), dataShootingFine: timestamp(end),
    } };
    h.records.consultations = { c: {
      cliente, stato: "confermata", jobType: "Test",
      // Before the fix the creation service stored a date-only UTC midnight.
      dataConsulenza: timestamp(new Date(`${day}T00:00:00Z`)),
      orarioInizio: startTime, orarioFine: endTime,
    } };
    vi.useFakeTimers();
    vi.setSystemTime(new Date(start.getTime() - 24 * 3600_000));
    const results = await runReminderCheck();
    expect(results.bookings.sent).toBe(1);
    expect(results.consultations.sent).toBe(1);
    const messages = h.sent.filter(([to]) => to === cliente.email);
    expect(messages).toHaveLength(2);
    for (const message of messages) {
      h.sent = [message];
      expectEmail(italianDay, startTime, start, end);
    }
  });

  it("il promemoria legacy parte 24 ore prima dell'orario scelto, non 24 ore prima di mezzanotte", async () => {
    h.records.consultations = { c: {
      cliente, stato: "confermata", jobType: "Test",
      dataConsulenza: timestamp(new Date("2026-07-15T00:00Z")),
      orarioInizio: "15:00", orarioFine: "15:30",
    } };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T00:00Z"));
    expect((await runReminderCheck()).consultations.sent).toBe(0);
    expect(h.records.consultations.c.reminderSentAt).toBeUndefined();
    vi.setSystemTime(new Date("2026-07-14T13:00Z"));
    expect((await runReminderCheck()).consultations.sent).toBe(1);
    expectEmail("15 luglio 2026", "15:00 - 15:30", new Date("2026-07-15T13:00Z"), new Date("2026-07-15T13:30Z"));
  });

  it("l'approvazione con override mostra il giorno romano vicino alla mezzanotte", async () => {
    h.records.consultations = { c: {
      cliente, stato: "in_attesa", jobType: "Test", templateId: "template", note: "",
      dataConsulenza: timestamp(new Date("2026-07-14T22:15Z")),
      orarioInizio: "00:15", orarioFine: "00:45",
    } };
    await request("/consultations/v2/c/approve-with-override", "POST", {
      reason: "Test fuso", overrideConflicts: true, deleteEventIds: [],
    });
    expectEmail("15 luglio 2026", "00:15 - 00:45", new Date("2026-07-14T22:15Z"), new Date("2026-07-14T22:45Z"));
  });

  it("riprogrammazione da inverno a estate: aggiorna Calendar, campi orari, email e promemoria", async () => {
    h.records.consultations = { c: {
      cliente, jobType: "Test", stato: "confermata", templateId: "template",
      dataConsulenza: timestamp(new Date("2026-01-15T09:00:00Z")),
      orarioInizio: "10:00", orarioFine: "10:30", googleCalendarEventId: "calendar-c",
      reminderEmailSent: true, reminderSentAt: timestamp(new Date()),
    } };
    const start = new Date("2026-07-14T22:15:00Z"), end = new Date("2026-07-14T22:45:00Z");
    await request("/calendar/events/c-c", "PATCH", {
      type: "consulenza", entityId: "c", start: start.toISOString(), end: end.toISOString(),
    });
    expect(h.records.consultations.c).toMatchObject({ orarioInizio: "00:15", orarioFine: "00:45", reminderEmailSent: false });
    expect(h.records.consultations.c.reminderSentAt).toBeUndefined();
    expect(h.records.consultations.c.dataConsulenza.toDate()).toEqual(start);
    expect(h.updated[0]).toMatchObject({ id: "calendar-c", start, end });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T22:15:00Z"));
    const result = await runReminderCheck();
    expect(result.consultations.sent).toBe(1);
    expectEmail("15 luglio 2026", "00:15 - 00:45", start, end);
  });

  it("aggiornamento servizio: Date coerced, solo data e solo orario, senza dipendere dal fuso server", async () => {
    h.records.consultations = { c: { dataConsulenza: timestamp(new Date("2026-01-15T09:00Z")), orarioInizio: "10:00", orarioFine: "11:00" } };
    await updateConsultation("c", { dataConsulenza: new Date("2026-07-14T22:00Z"), orarioInizio: "00:15", orarioFine: "00:45" });
    expect(h.records.consultations.c.dataConsulenza.toDate().toISOString()).toBe("2026-07-14T22:15:00.000Z");
    await updateConsultation("c", { dataConsulenza: new Date("2026-01-15T00:00Z") });
    expect(h.records.consultations.c.dataConsulenza.toDate().toISOString()).toBe("2026-01-14T23:15:00.000Z");
    await updateConsultation("c", { orarioInizio: "00:20" });
    expect(h.records.consultations.c.dataConsulenza.toDate().toISOString()).toBe("2026-01-14T23:20:00.000Z");
  });

  it("non sposta silenziosamente l'ora inesistente primaverile e preserva entrambe le occorrenze autunnali", async () => {
    expect(() => consultationSlot("2026-03-29", "02:15", "03:45")).toThrow("Europe/Rome");
    for (const iso of ["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z"]) {
      expect(consultationSlot(new Date(iso), "02:30", "03:30").start).toEqual(new Date(iso));
    }
    const response = await fetch(`${base}/consultations/v2/create`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: "template", cliente, dataConsulenza: "2026-03-29", orarioInizio: "02:15", orarioFine: "03:45" }),
    });
    expect(response.status).toBe(400);
    expect(h.records.consultations).toBeUndefined();
    expect(h.sent).toHaveLength(0);
  });

  it.each(["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z"])(
    "conserva l'istante %s nell'ora autunnale ripetuta, anche in Calendar e promemoria", async (iso) => {
      const start = new Date(iso), end = new Date("2026-10-25T02:30:00Z");
      const { id } = await request("/consultations/v2/create", "POST", {
        templateId: "template", cliente, dataConsulenza: iso, orarioInizio: "02:30", orarioFine: "03:30",
      });
      expect(h.records.consultations[id].dataConsulenza.toDate()).toEqual(start);
      await request(`/consultations/v2/${id}/approve`, "PATCH");
      expect(h.created.at(-1)).toMatchObject({ start, end });
      expectEmail("25 ottobre 2026", "02:30 - 03:30", start, end);
      vi.useFakeTimers();
      vi.setSystemTime(new Date(start.getTime() - 24 * 3600_000));
      expect((await runReminderCheck()).consultations.sent).toBe(1);
      expectEmail("25 ottobre 2026", "02:30 - 03:30", start, end);
    },
  );
});
