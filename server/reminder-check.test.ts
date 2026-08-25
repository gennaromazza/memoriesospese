import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';

const h = vi.hoisted(() => ({
  bookings: {} as Record<string, any>,
  consultations: {} as Record<string, any>,
  emails: [] as any[][],
  failEmails: false,
}));

vi.mock('./firebase-admin.js', () => ({
  db: {
    collection: (name: string) => collection(name),
    runTransaction: async (fn: (transaction: any) => Promise<unknown>) =>
      fn({
        get: async (ref: any) => ({ exists: !!store(ref.collection, ref.id), data: () => store(ref.collection, ref.id) }),
        update: (ref: any, update: any) => Object.assign(store(ref.collection, ref.id), update),
      }),
  },
  Timestamp: { now: () => ({ __timestamp: true }) },
  FieldValue: {},
}));

vi.mock('./email-routes.js', () => ({
  sendGmailEmail: async (...args: any[]) => {
    h.emails.push(args);
    if (h.failEmails) throw new Error('SMTP non disponibile');
  },
  getStudioContactInfo: async () => ({ name: 'Studio', email: 'studio@example.com', phone: '+390000', address: 'Via Test 1' }),
  createConsultationReminderEmailHTML: () => '<html />',
  generateGoogleCalendarLink: () => 'https://calendar.example/event',
  getSiteBaseUrl: () => 'https://example.com',
  authenticateFirebase: () => {},
}));

function store(collectionName: string, id: string) {
  return (collectionName === 'bookings' ? h.bookings : h.consultations)[id];
}

function collection(name: string): any {
  const records = name === 'bookings' ? h.bookings : name === 'consultations' ? h.consultations : {};
  const query = {
    where: () => query,
    get: async () => {
      const docs = Object.entries(records)
        .filter(([, data]) => name === 'galleries' || data.stato === 'confermata')
        .map(([id, data]) => ({ id, data: () => data }));
      return { docs, size: docs.length };
    },
  };
  return {
    where: () => query,
    doc: (id: string) => ({
      id,
      collection: name,
      update: async (update: any) => Object.assign(store(name, id), update),
    }),
  };
}

import { runReminderCheck } from './reminder-routes.js';

const NOW = new Date('2026-09-16T08:00:00.000Z'); // 10:00 Europe/Rome
const timestamp = (date: Date) => ({ toDate: () => date });

beforeEach(() => {
  h.bookings = {};
  h.consultations = {};
  h.emails = [];
  h.failEmails = false;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

describe('runReminderCheck', () => {
  it('invia reminder per booking e consulenza nella finestra 20–28 ore e salva i marker', async () => {
    const appointment = DateTime.fromJSDate(NOW).plus({ hours: 24 }).toJSDate();
    h.bookings.booking1 = {
      stato: 'confermata', dataShootingInizio: timestamp(appointment), dataShootingFine: timestamp(DateTime.fromJSDate(appointment).plus({ hours: 1 }).toJSDate()),
      cliente: { nome: 'Mario', cognome: 'Rossi', email: 'mario@example.com' },
    };
    h.consultations.consultation1 = {
      stato: 'confermata', dataConsulenza: timestamp(appointment), orarioInizio: '10:00', orarioFine: '11:00', jobType: 'Visione Foto',
      cliente: { nome: 'Anna', cognome: 'Bianchi', email: 'anna@example.com' },
    };

    const result = await runReminderCheck();

    expect(result.bookings.sent).toBe(1);
    expect(result.consultations.sent).toBe(1);
    expect(h.bookings.booking1.reminderEmailSent).toBe(true);
    expect(h.consultations.consultation1.reminderEmailSent).toBe(true);
    expect(h.consultations.consultation1.reminderSentAt).toBeTruthy();
    expect(h.emails).toHaveLength(3); // booking, cliente consulenza, admin
  });

  it('è idempotente: una seconda esecuzione non reinvia email', async () => {
    const appointment = DateTime.fromJSDate(NOW).plus({ hours: 24 }).toJSDate();
    h.bookings.booking1 = {
      stato: 'confermata', dataShootingInizio: timestamp(appointment), dataShootingFine: timestamp(appointment),
      cliente: { nome: 'Mario', cognome: 'Rossi', email: 'mario@example.com' },
    };

    await runReminderCheck();
    const second = await runReminderCheck();

    expect(second.bookings.sent).toBe(0);
    expect(second.bookings.skipped).toBe(1);
    expect(h.emails).toHaveLength(1);
  });

  it('rimuove il marker per consentire il retry se l’email fallisce', async () => {
    const appointment = DateTime.fromJSDate(NOW).plus({ hours: 24 }).toJSDate();
    h.failEmails = true;
    h.consultations.consultation1 = {
      stato: 'confermata', dataConsulenza: timestamp(appointment), orarioInizio: '10:00', orarioFine: '11:00', jobType: 'Visione Foto',
      cliente: { nome: 'Anna', cognome: 'Bianchi', email: 'anna@example.com' },
    };

    const result = await runReminderCheck();

    expect(result.consultations.sent).toBe(0);
    expect(result.consultations.errors).toHaveLength(1);
    expect(h.consultations.consultation1.reminderEmailSent).toBe(false);
    expect(h.consultations.consultation1.reminderSentAt).toBeNull();
  });
});
