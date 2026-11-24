import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

// Audit 19/11/2026 punto 5: approve-with-override cancellava gli eventi in conflitto PRIMA di
// creare il nuovo evento e salvare la conferma, e approvava anche con conflitti non risolti.
const h = vi.hoisted(() => ({
  consultation: null as any,
  trace: [] as string[],
  confirmCalls: [] as any[],
  createError: null as Error | null,
  reservationError: null as Error | null,
  deleteErrors: new Set<string>(),
  conflictStart: new Date("2026-09-17T15:30:00Z"),
  conflictEnd: new Date("2026-09-17T17:00:00Z"),
  withConflict: true,
}));

vi.mock("./firebase-admin.js", () => ({
  db: {
    collection: () => ({ doc: () => ({ update: async () => {} }), add: async () => ({ id: "audit" }), get: async () => ({ docs: [] }) }),
  },
  FieldValue: { serverTimestamp: () => ({ __serverTimestamp: true }), delete: () => ({ __delete: true }) },
  Timestamp: { now: () => ({ __timestamp: true }), fromDate: (date: Date) => ({ __timestamp: true, date }) },
  storage: {},
}));
vi.mock("./email-routes.js", () => ({
  authenticateFirebase: (req: any, _res: any, next: any) => {
    req.user = { uid: "admin-uid", email: "gennaro.mazzacane@gmail.com" };
    next();
  },
  sendGmailEmail: async () => {},
  getStudioContactInfo: async () => ({ name: "Studio", phone: "1", address: "Via Test" }),
  createConsultationApprovedEmailHTML: () => "email",
  generateGoogleCalendarLink: () => "https://calendar.example/event",
}));
vi.mock("./services/consultations.js", () => ({
  getConsultationById: async () => h.consultation,
  getTemplateById: async () => ({ id: "t" }),
  updateConsultation: async () => {},
}));
vi.mock("./google-calendar.js", () => ({
  createEuropeRomeDate: (date: string, time: string) => new Date(`${date}T${time}:00+02:00`),
  createEvent: async () => {
    h.trace.push("create");
    if (h.createError) throw h.createError;
    return { id: "new-event" };
  },
  deleteEvent: async (_c: string, id: string) => {
    h.trace.push(`delete:${id}`);
    if (h.deleteErrors.has(id)) throw new Error("Google non disponibile");
  },
  getEventById: async () => null,
  updateEvent: async () => ({}),
  getEventsWithDetailsAllCalendars: async () => (h.withConflict
    ? [{ start: h.conflictStart.toISOString(), end: h.conflictEnd.toISOString(), calendarId: "primary", calendarName: "Studio", eventId: "conf-1", summary: "Altro" }]
    : []),
}));
vi.mock("./booking/consultation-reservation.js", () => ({
  ConsultationNotPendingError: class ConsultationNotPendingError extends Error {},
  confirmConsultationReservation: async (...args: any[]) => {
    h.trace.push("confirm");
    h.confirmCalls.push(args);
    if (h.reservationError) throw h.reservationError;
  },
}));
vi.mock("./consultations/calendar-adapter.js", () => ({
  consultationTemplateToAvailabilityConfig: () => ({}),
  validateConsultationTemplate: () => true,
  getAllExistingEvents: async () => (h.withConflict
    ? [{ start: h.conflictStart, end: h.conflictEnd, allDay: false, title: "Altro", source: "google-calendar" }] : []),
}));
vi.mock("./calendar-engine/conflicts.js", () => ({ hasConflict: () => h.withConflict }));

const { default: consultationRouter } = await import("./consultation-routes.js");
const app = express();
app.use(express.json());
app.use("/api/consultations", consultationRouter);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => server.close());

beforeEach(() => {
  h.consultation = {
    id: "c1", stato: "in_attesa", templateId: "t", jobType: "Visione Foto",
    cliente: { nome: "Iolanda", cognome: "Amatrude", email: "i@example.com", whatsapp: "1" },
    dataConsulenza: { seconds: 1789666200, nanoseconds: 0 }, orarioInizio: "17:30", orarioFine: "19:00", note: "",
  };
  h.trace = []; h.confirmCalls = []; h.createError = null; h.reservationError = null; h.deleteErrors = new Set(); h.withConflict = true;
});

async function override(body: Record<string, unknown>) {
  const response = await fetch(`${base}/api/consultations/v2/c1/approve-with-override`, {
    method: "POST", headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "Cliente storico", ...body }),
  });
  return { status: response.status, body: await response.json() as any };
}

describe("POST /v2/:id/approve-with-override", () => {
  it("crea il nuovo evento, conferma su Firestore e SOLO DOPO cancella il conflitto selezionato", async () => {
    const { status } = await override({ overrideConflicts: false, deleteEventIds: ["conf-1"] });
    expect(status).toBe(200);
    expect(h.trace).toEqual(["create", "confirm", "delete:conf-1"]);
    expect(h.confirmCalls[0][4]).toMatchObject({ stato: "confermata", googleCalendarEventId: "new-event", confermataDa: "admin-uid" });
    expect(h.confirmCalls[0][5]).toMatchObject({ force: false });
  });

  it("senza override e con conflitti non selezionati risponde 409 senza toccare nulla", async () => {
    const { status, body } = await override({ overrideConflicts: false, deleteEventIds: [] });
    expect(status).toBe(409);
    expect(body.error).toBe("Conflitti non risolti");
    expect(h.trace).toEqual([]);
  });

  it("se la creazione del nuovo evento fallisce non cancella nulla e risponde 503", async () => {
    h.createError = Object.assign(new Error("429"), { code: "CALENDAR_UNAVAILABLE" });
    const { status, body } = await override({ overrideConflicts: false, deleteEventIds: ["conf-1"] });
    expect(status).toBe(503);
    expect(body.code).toBe("CALENDAR_UNAVAILABLE");
    expect(h.trace).toEqual(["create"]);
  });

  it("se il salvataggio fallisce rimuove il nuovo evento e lascia intatti i conflitti", async () => {
    h.reservationError = new Error("Firestore non disponibile");
    const { status } = await override({ overrideConflicts: false, deleteEventIds: ["conf-1"] });
    expect(status).toBe(500);
    expect(h.trace).toEqual(["create", "confirm", "delete:new-event"]);
  });

  it("se lo slot e' stato occupato nel frattempo rimuove il nuovo evento e risponde 409", async () => {
    const { BookingSlotConflictError } = await import("./booking/slot-reservations.js");
    h.reservationError = new BookingSlotConflictError("Slot non più disponibile");
    const { status } = await override({ overrideConflicts: false, deleteEventIds: ["conf-1"] });
    expect(status).toBe(409);
    expect(h.trace).toEqual(["create", "confirm", "delete:new-event"]);
  });

  it("con override approva anche con conflitti non risolti, senza controllo di sovrapposizione", async () => {
    const { status } = await override({ overrideConflicts: true });
    expect(status).toBe(200);
    expect(h.trace).toEqual(["create", "confirm"]);
    expect(h.confirmCalls[0][5]).toMatchObject({ force: true });
  });

  it("un errore nella cancellazione del conflitto non annulla l'approvazione gia' salvata", async () => {
    h.deleteErrors.add("conf-1");
    const { status } = await override({ overrideConflicts: false, deleteEventIds: ["conf-1"] });
    expect(status).toBe(200);
    expect(h.trace).toEqual(["create", "confirm", "delete:conf-1"]);
  });
});
