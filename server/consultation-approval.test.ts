import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

const h = vi.hoisted(() => ({
  consultation: null as any,
  template: null as any,
  events: [] as any[],
  createEventError: null as Error | null,
  firestoreError: null as Error | null,
  emailError: null as Error | null,
  updates: [] as any[],
  deletedEventIds: [] as string[],
}));

vi.mock("./firebase-admin.js", () => ({
  db: {
    collection: () => ({
      doc: () => ({
        update: async (data: any) => {
          if (h.firestoreError) throw h.firestoreError;
          h.updates.push(data);
        },
      }),
    }),
  },
  FieldValue: {
    serverTimestamp: () => ({ __serverTimestamp: true }),
    delete: () => ({ __delete: true }),
  },
  Timestamp: { now: () => ({ __timestamp: true }) },
  storage: {},
}));

vi.mock("./email-routes.js", () => ({
  authenticateFirebase: (req: any, _res: any, next: any) => {
    req.user = { uid: "admin-uid", email: "gennaro.mazzacane@gmail.com" };
    next();
  },
  sendGmailEmail: async () => {
    if (h.emailError) throw h.emailError;
  },
  getStudioContactInfo: async () => ({ name: "Studio", phone: "123", address: "Via Test" }),
  createConsultationApprovedEmailHTML: () => "email",
  generateGoogleCalendarLink: () => "https://calendar.example/event",
}));

vi.mock("./services/consultations.js", () => ({
  getConsultationById: async () => h.consultation,
  getTemplateById: async () => h.template,
  updateConsultation: async () => {},
}));

vi.mock("./google-calendar.js", () => ({
  createEuropeRomeDate: (date: string, time: string) => new Date(`${date}T${time}:00+02:00`),
  createEvent: async () => {
    if (h.createEventError) throw h.createEventError;
    return { id: "calendar-event-1" };
  },
  deleteEvent: async (_calendarId: string, eventId: string) => h.deletedEventIds.push(eventId),
  getEventsWithDetailsAllCalendars: async () => [],
}));

vi.mock("./consultations/calendar-adapter.js", () => ({
  consultationTemplateToAvailabilityConfig: () => ({}),
  validateConsultationTemplate: () => true,
  getAllExistingEvents: async () => h.events,
}));

vi.mock("./calendar-engine/conflicts.js", () => ({
  hasConflict: () => h.events.length > 0,
}));

const { default: consultationRouter } = await import("./consultation-routes.js");

const app = express();
app.use(express.json());
app.use("/api/consultations", consultationRouter);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

afterAll(() => server.close());

function pendingConsultation(overrides: Record<string, unknown> = {}) {
  return {
    id: "consultation-1",
    stato: "in_attesa",
    templateId: "template-1",
    jobType: "Visione Foto",
    cliente: { nome: "Iolanda", cognome: "Amatrude", email: "iolanda@example.com", whatsapp: "123" },
    dataConsulenza: { seconds: 1789666200, nanoseconds: 0 },
    orarioInizio: "17:30",
    orarioFine: "19:00",
    note: "",
    ...overrides,
  };
}

beforeEach(() => {
  h.consultation = pendingConsultation();
  h.template = { id: "template-1", nome: "Visione Foto", durataMinuti: 90, customWorkingHours: [{}] };
  h.events = [];
  h.createEventError = null;
  h.firestoreError = null;
  h.emailError = null;
  h.updates = [];
  h.deletedEventIds = [];
});

async function approve() {
  const response = await fetch(`${base}/api/consultations/v2/consultation-1/approve`, {
    method: "PATCH",
    headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "untrusted-browser-value" }),
  });
  return { status: response.status, body: await response.json() as any };
}

describe("PATCH /api/consultations/v2/:id/approve", () => {
  it("conferma, crea l'evento e salva tutti i dati in una sola scrittura Firestore", async () => {
    const { status, body } = await approve();
    expect(status).toBe(200);
    expect(body.googleCalendarEventId).toBe("calendar-event-1");
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]).toMatchObject({
      stato: "confermata",
      googleCalendarEventId: "calendar-event-1",
      confermataDa: "admin-uid",
    });
    expect(h.updates[0].confermatail).toEqual({ __serverTimestamp: true });
  });

  it("non crea né conferma quando il Calendar segnala una sovrapposizione", async () => {
    h.events = [{ start: new Date(), end: new Date(), allDay: false }];
    const { status, body } = await approve();
    expect(status).toBe(409);
    expect(body.error).toBe("Slot non più disponibile");
    expect(h.updates).toHaveLength(0);
  });

  it("restituisce un errore Calendar esplicito senza modificare Firestore", async () => {
    h.createEventError = Object.assign(new Error("token Google scaduto"), { code: "CALENDAR_UNAVAILABLE" });
    const { status, body } = await approve();
    expect(status).toBe(503);
    expect(body).toMatchObject({ error: "Errore Google Calendar", code: "CALENDAR_UNAVAILABLE" });
    expect(h.updates).toHaveLength(0);
  });

  it("cancella l'evento Calendar se il salvataggio Firestore fallisce", async () => {
    h.firestoreError = new Error("Firestore non disponibile");
    const { status } = await approve();
    expect(status).toBe(500);
    expect(h.deletedEventIds).toEqual(["calendar-event-1"]);
  });

  it("mantiene la consulenza confermata se fallisce solo l'email", async () => {
    h.emailError = new Error("SMTP non disponibile");
    const { status, body } = await approve();
    expect(status).toBe(200);
    expect(body.emailStatus).toBe("failed");
    expect(h.updates).toHaveLength(1);
  });

  it("rifiuta una consulenza già processata senza creare eventi", async () => {
    h.consultation = pendingConsultation({ stato: "confermata" });
    const { status, body } = await approve();
    expect(status).toBe(400);
    expect(body.error).toBe("Consultation già processata");
    expect(h.updates).toHaveLength(0);
  });
});
