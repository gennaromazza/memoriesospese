import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const h = vi.hoisted(() => ({
  submission: null as any,
  updates: [] as any[],
  notifications: [] as any[],
}));

vi.mock('./firebase-admin.js', () => ({
  db: {
    collection: (name: string) => {
      if (name === 'infoFormSubmissions') {
        return {
          where: () => ({ limit: () => ({ get: async () => ({ empty: !h.submission, docs: h.submission ? [h.submission] : [] }) }) }),
        };
      }
      if (name === 'infoFormNotifications') return { add: async (data: any) => h.notifications.push(data) };
      throw new Error(`collezione inattesa: ${name}`);
    },
  },
  FieldValue: { serverTimestamp: () => ({ __serverTimestamp: true }) },
}));

vi.mock('./email-routes.js', () => ({ sendGmailEmail: vi.fn(async () => {}) }));

const { default: router } = await import('./info-form-routes.js');
const app = express();
app.use(express.json());
app.use('/api/info-forms', router);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => server.close());

beforeEach(() => {
  h.updates = [];
  h.notifications = [];
  h.submission = {
    id: 'submission-1',
    ref: { update: async (data: any) => h.updates.push(data) },
    data: () => ({
      jobId: 'job-1', clientName: 'Mario Rossi', clientEmail: 'mario@example.com', templateName: 'Logistica',
      status: 'pending',
      templateFields: [
        { id: 'telefono', label: 'Telefono', type: 'text', required: true },
        { id: 'menu', label: 'Menu', type: 'select', required: false, options: ['Carne', 'Pesce'] },
      ],
    }),
  };
});

async function submit(answers: unknown) {
  const response = await fetch(`${base}/api/info-forms/by-token/12345678-token/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }),
  });
  return { status: response.status, body: await response.json() as any };
}

describe('POST /api/info-forms/by-token/:token/submit', () => {
  it('accetta le risposte previste, completa il modulo e crea una sola notifica', async () => {
    const result = await submit({ telefono: '3331234567', menu: 'Pesce' });
    expect(result.status).toBe(200);
    expect(h.updates[0]).toMatchObject({ status: 'completed', answers: { telefono: '3331234567', menu: 'Pesce' } });
    expect(h.notifications).toHaveLength(1);
  });

  it('rifiuta campi estranei e non modifica Firestore', async () => {
    const result = await submit({ telefono: '3331234567', ruolo: 'admin' });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/campo non valido/);
    expect(h.updates).toHaveLength(0);
  });

  it('rifiuta un campo obbligatorio mancante', async () => {
    const result = await submit({ menu: 'Carne' });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/obbligatorio/);
    expect(h.updates).toHaveLength(0);
  });
});
