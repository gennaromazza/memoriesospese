import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

const h = vi.hoisted(() => ({
  template: null as any,
  events: [] as any[],
  createEventError: null as Error | null,
  firestoreError: null as Error | null,
  updates: [] as any[],
  createdConsultations: [] as any[],
  deletedConsultationIds: [] as string[],
  deletedEventIds: [] as string[],
  sentEmails: [] as any[],
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
  },
  Timestamp: {
    now: () => ({ __timestamp: true }),
  },
  storage: {},
}));

vi.mock("./email-routes.js", () => ({
  authenticateFirebase: (req: any, _res: any, next: any) => {
    req.user = { uid: "admin-uid", email: "gennaro.mazzacane@gmail.com" };
    next();
  },
  sendGmailEmail: async (...args: any[]) => {
    h.sentEmails.push(args);
  },
  getStudioContactInfo: async () => ({
    name: "Studio",
    email: "studio@example.com",
    phone: "123",
    address: "Via Test",
  }),
  createConsultationApprovedEmailHTML: () => "email",
  generateGoogleCalendarLink: () => "https://calendar.example/event",
}));

vi.mock("./services/consultations.js", () => ({
  getTemplateById: async () => h.template,
  createConsultation: async (data: any) => {
    h.createdConsultations.push(data);
    return "consultation-1";
  },
  deleteConsultation: async (id: string) => {
    h.deletedConsultationIds.push(id);
  },
}));

vi.mock("./google-calendar.js", () => ({
  createEvent: async () => {
    if (h.createEventError) throw h.createEventError;
    return { id: "calendar-event-1" };
  },
  deleteEvent: async (_calendarId: string, eventId: string) => {
    h.deletedEventIds.push(eventId);
  },
  createEuropeRomeDate: (date: string, time: string) =>
    new Date(`${date}T${time}:00+02:00`),
}));

vi.mock("./consultations/calendar-adapter.js", () => ({
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

beforeEach(() => {
  h.template = {
    id: "template-1",
    nome: "Consulenza matrimonio",
    jobType: "Matrimonio",
    durataMinuti: 60,
    attiva: true,
    customWorkingHours: [{}],
  };
  h.events = [];
  h.createEventError = null;
  h.firestoreError = null;
  h.updates = [];
  h.createdConsultations = [];
  h.deletedConsultationIds = [];
  h.deletedEventIds = [];
  h.sentEmails = [];
});

async function createManual(overrides: Record<string, unknown> = {}) {
  const response = await fetch(`${base}/api/consultations/v2/create-manual`, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      templateId: "template-1",
      jobId: "job-1",
      cliente: {
        nome: "Iolanda",
        cognome: "Amatrude",
        email: "iolanda@example.com",
        whatsapp: "123",
      },
      dataConsulenza: "2099-07-10T00:00:00",
      orarioInizio: "10:00",
      orarioFine: "11:00",
      note: "Concordata su WhatsApp",
      ...overrides,
    }),
  });

  return {
    status: response.status,
    body: (await response.json()) as any,
  };
}

describe("POST /api/consultations/v2/create-manual", () => {
  it("rifiuta uno slot sovrapposto senza creare consulenza o evento", async () => {
    h.events = [
      {
        id: "existing-event",
        start: new Date("2099-07-10T08:30:00.000Z"),
        end: new Date("2099-07-10T10:30:00.000Z"),
      },
    ];

    const { status, body } = await createManual();

    expect(status).toBe(409);
    expect(body).toMatchObject({
      error: "Slot non disponibile",
    });
    expect(h.createdConsultations).toHaveLength(0);
    expect(h.deletedEventIds).toHaveLength(0);
    expect(h.sentEmails).toHaveLength(0);
  });

  it("esegue il rollback della consulenza se Calendar non crea l'evento", async () => {
    h.createEventError = Object.assign(new Error("Calendar non disponibile"), {
      code: "CALENDAR_UNAVAILABLE",
    });

    const { status, body } = await createManual();

    expect(status).toBe(503);
    expect(body).toMatchObject({
      error: "Errore Google Calendar",
      code: "CALENDAR_UNAVAILABLE",
    });
    expect(h.createdConsultations).toHaveLength(1);
    expect(h.deletedConsultationIds).toEqual(["consultation-1"]);
    expect(h.updates).toHaveLength(0);
    expect(h.sentEmails).toHaveLength(0);
  });

  it("cancella l'evento e la consulenza se il salvataggio Firestore fallisce", async () => {
    h.firestoreError = new Error("Firestore non disponibile");

    const { status, body } = await createManual();

    expect(status).toBe(500);
    expect(body).toMatchObject({
      error: "Errore conferma consulenza",
    });
    expect(h.deletedEventIds).toEqual(["calendar-event-1"]);
    expect(h.deletedConsultationIds).toEqual(["consultation-1"]);
    expect(h.sentEmails).toHaveLength(0);
  });

  it("crea la consulenza confermata, collega il job e registra l'email inviata", async () => {
    const { status, body } = await createManual();

    expect(status).toBe(201);
    expect(body).toMatchObject({
      id: "consultation-1",
      googleCalendarEventId: "calendar-event-1",
      emailStatus: "sent",
    });
    expect(h.createdConsultations).toHaveLength(1);
    expect(h.createdConsultations[0]).toMatchObject({
      linkedJobId: "job-1",
      orarioInizio: "10:00",
      orarioFine: "11:00",
      cliente: {
        email: "iolanda@example.com",
      },
    });
    expect(h.updates).toHaveLength(2);
    expect(h.updates[0]).toMatchObject({
      stato: "confermata",
      googleCalendarEventId: "calendar-event-1",
      confermataDa: "admin-uid",
    });
    expect(h.updates[1]).toMatchObject({
      emailConfermataInviata: true,
    });
    expect(h.sentEmails).toHaveLength(1);
    expect(h.deletedConsultationIds).toHaveLength(0);
    expect(h.deletedEventIds).toHaveLength(0);
  });
});