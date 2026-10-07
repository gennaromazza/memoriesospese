import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { DateTime } from "luxon";

const h = vi.hoisted(() => ({
  template: null as any,
  events: [] as any[],
  createEventError: null as Error | null,
  createEventDelayMs: 0,
  firestoreError: null as Error | null,
  updates: [] as any[],
  createdConsultations: [] as any[],
  deletedConsultationIds: [] as string[],
  deletedEventIds: [] as string[],
  sentEmails: [] as any[],
  calendarEvents: [] as any[],
  calendarLinks: [] as any[],
  emailTemplates: [] as any[],
  signedQuotes: [] as any[],
  manualLocks: new Map<string, any>(),
  transactionTail: Promise.resolve(),
}));

function makeDocumentReference(collectionName: string, id: string) {
  return {
    collectionName,
    id,
    get: async () => {
      const data = h.manualLocks.get(id);
      return {
        exists: collectionName === "manual_consultation_requests" && !!data,
        data: () => data,
      };
    },
    update: async (data: any) => {
      if (collectionName === "consultations" && h.firestoreError) {
        throw h.firestoreError;
      }
      if (collectionName === "manual_consultation_requests") {
        h.manualLocks.set(id, {
          ...(h.manualLocks.get(id) || {}),
          ...data,
        });
        return;
      }
      h.updates.push(data);
    },
    delete: async () => {
      h.manualLocks.delete(id);
    },
  };
}

vi.mock("./firebase-admin.js", () => ({
  db: {
    collection: (collectionName: string) => ({
      doc: (id: string) => makeDocumentReference(collectionName, id),
      where: (_field: string, _operator: string, value: string) => ({
        get: async () => ({
          docs: collectionName === "quotes"
            ? h.signedQuotes.filter((quote) => quote.jobId === value).map((quote) => ({
                id: quote.id,
                data: () => quote,
              }))
            : [],
        }),
      }),
    }),
    runTransaction: async (callback: (transaction: any) => Promise<any>) => {
      let release!: () => void;
      const previous = h.transactionTail;
      h.transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;

      const pendingWrites: Array<{
        type: "set" | "delete";
        ref: any;
        data?: any;
        options?: any;
      }> = [];
      const transaction = {
        get: async (ref: any) => ref.get(),
        set: (ref: any, data: any, options?: any) => {
          pendingWrites.push({ type: "set", ref, data, options });
        },
        delete: (ref: any) => {
          pendingWrites.push({ type: "delete", ref });
        },
      };

      try {
        const result = await callback(transaction);
        for (const write of pendingWrites) {
          if (write.type === "delete") {
            await write.ref.delete();
          } else {
            const current = h.manualLocks.get(write.ref.id) || {};
            h.manualLocks.set(
              write.ref.id,
              write.options?.merge ? { ...current, ...write.data } : write.data,
            );
          }
        }
        return result;
      } finally {
        release();
      }
    },
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
  getSiteBaseUrl: () => "https://imagestudiofotografico.com",
  createConsultationApprovedEmailHTML: (...args: any[]) => {
    h.emailTemplates.push(args);
    return "email";
  },
  generateGoogleCalendarLink: (args: any) => {
    h.calendarLinks.push(args);
    return "https://calendar.example/event";
  },
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
  createEvent: async (_calendarId: string, event: any) => {
    if (h.createEventError) throw h.createEventError;
    if (h.createEventDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, h.createEventDelayMs));
    }
    h.calendarEvents.push(event);
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
  h.createEventDelayMs = 0;
  h.firestoreError = null;
  h.updates = [];
  h.createdConsultations = [];
  h.deletedConsultationIds = [];
  h.deletedEventIds = [];
  h.sentEmails = [];
  h.calendarEvents = [];
  h.calendarLinks = [];
  h.emailTemplates = [];
  h.signedQuotes = [];
  h.manualLocks.clear();
  h.transactionTail = Promise.resolve();
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
    h.signedQuotes = [
      {
        id: "quote-1",
        jobId: "job-1",
        status: "firmato",
        publicToken: "signed-token",
      },
    ];

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
    expect(h.calendarEvents[0].description).toContain(
      "Contratto: https://imagestudiofotografico.com/quote/signed-token",
    );
    expect(h.deletedConsultationIds).toHaveLength(0);
    expect(h.deletedEventIds).toHaveLength(0);
  });

  it.each([
    {
      label: "ora solare",
      date: "2027-01-15",
      startTime: "10:00",
      endTime: "11:00",
      expectedStart: "2027-01-15T09:00:00.000Z",
      expectedEnd: "2027-01-15T10:00:00.000Z",
      expectedStoredDate: "2027-01-14T23:00:00.000Z",
    },
    {
      label: "ora legale",
      date: "2027-07-15",
      startTime: "10:00",
      endTime: "11:00",
      expectedStart: "2027-07-15T08:00:00.000Z",
      expectedEnd: "2027-07-15T09:00:00.000Z",
      expectedStoredDate: "2027-07-14T22:00:00.000Z",
    },
  ])(
    "mantiene data e orari Europe/Rome in $label anche nel Calendar e nel link email",
    async ({
      date,
      startTime,
      endTime,
      expectedStart,
      expectedEnd,
      expectedStoredDate,
    }) => {
      const { status } = await createManual({
        dataConsulenza: `${date}T00:00:00`,
        orarioInizio: startTime,
        orarioFine: endTime,
      });

      expect(status).toBe(201);
      expect(h.createdConsultations[0].dataConsulenza.toISOString()).toBe(
        expectedStoredDate,
      );
      expect(h.calendarEvents[0].start.toISOString()).toBe(expectedStart);
      expect(h.calendarEvents[0].end.toISOString()).toBe(expectedEnd);
      expect(h.calendarLinks[0].startDate.toISOString()).toBe(expectedStart);
      expect(h.calendarLinks[0].endDate.toISOString()).toBe(expectedEnd);
      expect(h.emailTemplates[0][3]).toBe(`${startTime} - ${endTime}`);

      const localStart = DateTime.fromJSDate(h.calendarEvents[0].start, {
        zone: "Europe/Rome",
      });
      expect(localStart.toISO()).toContain(`${date}T${startTime}:00`);
    },
  );

  it("rifiuta un orario che non esiste nel salto primaverile", async () => {
    const { status, body } = await createManual({
      dataConsulenza: "2027-03-28T00:00:00",
      orarioInizio: "02:30",
      orarioFine: "03:30",
    });

    expect(status).toBe(400);
    expect(body).toEqual({
      error: "Orario non esistente",
      message:
        "L'orario 02:30 non esiste in Europe/Rome durante il cambio d'ora. Scegli un altro orario.",
    });
    expect(h.createdConsultations).toHaveLength(0);
    expect(h.calendarEvents).toHaveLength(0);
    expect(h.sentEmails).toHaveLength(0);
  });

  it("usa la seconda occorrenza per un orario ripetuto nel ritorno all'ora solare", async () => {
    const { status } = await createManual({
      dataConsulenza: "2027-10-31T00:00:00",
      orarioInizio: "02:30",
      orarioFine: "03:30",
    });

    expect(status).toBe(201);
    // Policy: 02:30 is interpreted as the second occurrence, in CET, so the
    // configured 60-minute duration ends at the displayed 03:30.
    expect(h.calendarEvents[0].start.toISOString()).toBe(
      "2027-10-31T01:30:00.000Z",
    );
    expect(h.calendarEvents[0].end.toISOString()).toBe(
      "2027-10-31T02:30:00.000Z",
    );
    expect(h.createdConsultations).toHaveLength(1);
    expect(h.sentEmails).toHaveLength(1);
  });

  it("restituisce il risultato esistente senza duplicare eventi per due richieste concorrenti", async () => {
    h.createEventDelayMs = 25;

    const [first, second] = await Promise.all([createManual(), createManual()]);
    const responses = [first, second];
    const alreadyCompleted = await createManual();

    expect(h.createdConsultations).toHaveLength(1);
    expect(h.sentEmails).toHaveLength(1);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)?.body).toMatchObject({
      error: "Richiesta già in elaborazione",
      code: "MANUAL_CONSULTATION_IN_PROGRESS",
    });
    expect(alreadyCompleted.status).toBe(200);
    expect(alreadyCompleted.body).toMatchObject({
        id: "consultation-1",
        googleCalendarEventId: "calendar-event-1",
        emailStatus: "sent",
        alreadyCreated: true,
      });
    expect(h.manualLocks.size).toBe(1);
    expect([...h.manualLocks.values()][0]).toMatchObject({
      status: "completed",
      consultationId: "consultation-1",
    });
  });
});