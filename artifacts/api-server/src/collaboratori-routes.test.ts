import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { DateTime } from 'luxon';

const state: Record<string, Record<string, any>> = {};
let nextId = 1;
const { sendGmailEmailMock } = vi.hoisted(() => ({
  sendGmailEmailMock: vi.fn(),
}));

function documentRef(collectionName: string, id: string) {
  return {
    id,
    collectionName,
    async get() {
      const value = state[collectionName]?.[id];
      return { exists: value !== undefined, id, data: () => value };
    },
    async update(data: any) {
      state[collectionName] ??= {};
      state[collectionName][id] = { ...(state[collectionName][id] || {}), ...data };
    },
  };
}

function queryRef(
  collectionName: string,
  filters: Array<{ field: string; operator: string; value: unknown }> = [],
  maxResults?: number,
) {
  return {
    where(field: string, operator: string, value: unknown) {
      return queryRef(collectionName, [...filters, { field, operator, value }], maxResults);
    },
    orderBy() {
      return this;
    },
    limit(limit: number) {
      return queryRef(collectionName, filters, limit);
    },
    async get() {
      const normalize = (value: any) => {
        const resolved = value?.toDate?.() ?? value;
        return resolved instanceof Date ? resolved.getTime() : resolved;
      };
      const matches = (actual: any, operator: string, expected: any) => {
        const normalizedActual = normalize(actual);
        const normalizedExpected = normalize(expected);
        switch (operator) {
          case '==':
            return normalizedActual === normalizedExpected;
          case 'in':
            return Array.isArray(expected) && expected.some((item) => normalize(item) === normalizedActual);
          case '>=':
            return normalizedActual >= normalizedExpected;
          case '<=':
            return normalizedActual <= normalizedExpected;
          default:
            return false;
        }
      };
      const matchingDocs = Object.entries(state[collectionName] || {})
        .filter(([, value]) => filters.every(({ field, operator, value: expected }) =>
          matches(value[field], operator, expected)))
        .map(([id, value]) => ({
          id,
          exists: true,
          data: () => value,
        }));
      const docs = maxResults === undefined ? matchingDocs : matchingDocs.slice(0, maxResults);
      return { docs, empty: docs.length === 0 };
    },
  };
}

function collection(name: string) {
  return {
    doc: (id?: string) => documentRef(name, id || `auto-${nextId++}`),
    where: (field: string, operator: string, value: unknown) =>
      queryRef(name).where(field, operator, value),
    async get() {
      return queryRef(name).get();
    },
    async add(data: any) {
      const id = `auto-${nextId++}`;
      state[name] ??= {};
      state[name][id] = data;
      return { id };
    },
  };
}

function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(hasUndefined);
  if (value && typeof value === 'object') {
    return Object.values(value).some(hasUndefined);
  }
  return false;
}

async function runTransaction<T>(callback: (transaction: any) => Promise<T>): Promise<T> {
  const writes: Array<{ type: 'create' | 'update'; ref: ReturnType<typeof documentRef>; data: any }> = [];
  const result = await callback({
    get: (ref: ReturnType<typeof documentRef>) => ref.get(),
    create: (ref: ReturnType<typeof documentRef>, data: any) => {
      writes.push({ type: 'create', ref, data });
    },
    update: (ref: ReturnType<typeof documentRef>, data: any) => {
      writes.push({ type: 'update', ref, data });
    },
  });

  for (const write of writes) {
    if (hasUndefined(write.data)) {
      throw new Error('Firestore non accetta valori undefined');
    }
    state[write.ref.collectionName] ??= {};
    if (write.type === 'create' && state[write.ref.collectionName][write.ref.id]) {
      throw new Error('Documento già esistente');
    }
  }

  for (const write of writes) {
    const current = state[write.ref.collectionName][write.ref.id] || {};
    state[write.ref.collectionName][write.ref.id] = write.type === 'update'
      ? { ...current, ...write.data }
      : write.data;
  }

  return result;
}

vi.mock('./firebase-admin.js', () => ({
  db: { collection, runTransaction },
  Timestamp: {
    now: () => ({ toDate: () => new Date('2026-08-31T12:00:00.000Z') }),
    fromDate: (date: Date) => ({ toDate: () => date }),
  },
}));

vi.mock('./email-routes.js', () => ({
  authenticateFirebase: (req: any, _res: any, next: any) => {
    req.user = { uid: 'admin-1', email: 'gennaro.mazzacane@gmail.com' };
    next();
  },
  getStudioContactInfo: async () => ({ name: 'Studio Test' }),
  getSiteBaseUrl: () => 'https://example.test',
  sendGmailEmail: sendGmailEmailMock,
}));

vi.mock('./utils/timezone.js', () => ({
  nowRome: () => new Date('2026-08-31T12:00:00.000Z'),
  formatRomeDateLocale: () => '31 agosto 2026',
}));

import collaboratoriRoutes from './collaboratori-routes.js';

let server: any;
let baseUrl = '';

beforeEach(async () => {
  sendGmailEmailMock.mockReset();
  for (const collectionName of Object.keys(state)) delete state[collectionName];
  nextId = 1;
  Object.assign(state, {
    jobCollaboratoreAssignments: {
      assignment1: {
        collaboratoreId: 'collaboratore1',
        jobId: 'job1',
        ruoloInJob: 'videomaker',
        compenso: 500,
        prodottiAssegnati: [{ orderItemId: 'item-1', label: 'Drone', qty: 1 }],
        mansioniAssegnate: ['Dato storico da ignorare'],
        isPagato: false,
        pagamenti: [],
        saldoResiduo: 500,
      },
    },
    collaboratori: {
      collaboratore1: {
        nome: 'Mario',
        cognome: 'Rossi',
        email: 'mario.rossi@example.test',
        dashboardToken: 'dashboard-token',
      },
    },
    jobs: {
      job1: { nomeEvento: 'Matrimonio Test' },
    },
    cashMovements: {},
  });

  const app = express();
  app.use(express.json());
  app.use('/api', collaboratoriRoutes);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(resolve));
});

describe('POST /api/collaboratori/assignments/:id/add-payment', () => {
  it('registra un acconto senza scrivere dataPagamento undefined', async () => {
    const response = await fetch(`${baseUrl}/api/collaboratori/assignments/assignment1/add-payment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        importo: 200,
        tipo: 'acconto',
        metodo: 'bonifico',
        data: '2026-08-31',
      }),
    });

    const body: any = await response.json();
    const assignment = state.jobCollaboratoreAssignments.assignment1;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, saldoResiduo: 300, isPagato: false });
    expect(assignment.pagamenti).toHaveLength(1);
    expect(assignment.pagamenti[0]).toMatchObject({
      tipo: 'acconto', importo: 200, metodo: 'bonifico', cashMovementId: body.cashMovementId,
    });
    expect(assignment).not.toHaveProperty('dataPagamento');
    expect(state.cashMovements[body.cashMovementId]).toMatchObject({
      tipo: 'uscita', importo: 200, metodoPagamento: 'bonifico',
    });
    expect(hasUndefined(state)).toBe(false);
  });
});

describe('PATCH /api/collaboratori/assignments/:id/products', () => {
  it('aggiorna i prodotti, conserva i dati storici e non li restituisce', async () => {
    const prodottiAssegnati = [{ orderItemId: 'item-2', label: 'Trailer', qty: 2 }];
    const response = await fetch(`${baseUrl}/api/collaboratori/assignments/assignment1/products`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prodottiAssegnati,
        mansioniAssegnate: ['Non salvare questo nuovo valore'],
      }),
    });

    const body: any = await response.json();
    const assignment = state.jobCollaboratoreAssignments.assignment1;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ id: 'assignment1', prodottiAssegnati });
    expect(body).not.toHaveProperty('mansioniAssegnate');
    expect(assignment.prodottiAssegnati).toEqual(prodottiAssegnati);
    expect(assignment.mansioniAssegnate).toEqual(['Dato storico da ignorare']);
  });
});

describe('GET /api/collaboratori/assignments/job/:jobId', () => {
  it('non espone i dati storici e mantiene ruolo e prodotti', async () => {
    const response = await fetch(`${baseUrl}/api/collaboratori/assignments/job/job1`);
    const body: any = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 'assignment1',
      ruoloInJob: 'videomaker',
      prodottiAssegnati: [{ orderItemId: 'item-1', label: 'Drone', qty: 1 }],
    });
    expect(body[0]).not.toHaveProperty('mansioniAssegnate');
  });
});

describe('GET /api/collaboratori/dashboard/:token', () => {
  it('non espone i dati storici ma mantiene i prodotti nella dashboard', async () => {
    const response = await fetch(`${baseUrl}/api/collaboratori/dashboard/dashboard-token`);
    const body: any = await response.json();

    expect(response.status).toBe(200);
    expect(body.assignments).toHaveLength(1);
    expect(body.assignments[0]).toMatchObject({
      id: 'assignment1',
      prodottiAssegnati: [{ orderItemId: 'item-1', label: 'Drone', qty: 1 }],
    });
    expect(body.assignments[0]).not.toHaveProperty('mansioniAssegnate');
  });
});

describe('POST /api/collaboratori/assign-to-job', () => {
  it('salva i prodotti ma ignora le mansioni inviate da client non aggiornati', async () => {
    const prodottiAssegnati = [{ orderItemId: 'item-3', label: 'Album', qty: 1 }];
    const response = await fetch(`${baseUrl}/api/collaboratori/assign-to-job`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jobId: 'job1',
        collaboratoreId: 'collaboratore1',
        ruoloInJob: 'videomaker',
        compenso: 250,
        tipoPagamento: 'forfait',
        prodottiAssegnati,
        mansioniAssegnate: ['Non salvare'],
      }),
    });

    const body: any = await response.json();
    const assignment = state.jobCollaboratoreAssignments[body.id];

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ prodottiAssegnati });
    expect(body).not.toHaveProperty('mansioniAssegnate');
    expect(assignment.prodottiAssegnati).toEqual(prodottiAssegnati);
    expect(assignment).not.toHaveProperty('mansioniAssegnate');
  });
});

describe('POST /api/collaboratori/send-reminders', () => {
  it('ignora le mansioni storiche nel promemoria senza modificarle', async () => {
    const assignment = state.jobCollaboratoreAssignments.assignment1;
    const noteAdmin = 'Presentati alle 9:00 con l’attrezzatura.';
    assignment.status = 'accepted';
    assignment.noteAdmin = noteAdmin;
    state.jobs.job1.eventDate = DateTime.now()
      .setZone('Europe/Rome')
      .plus({ days: 1 })
      .startOf('day')
      .plus({ hours: 12 })
      .toJSDate();

    const response = await fetch(`${baseUrl}/api/collaboratori/send-reminders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body: any = await response.json();
    const [, subject, html] = sendGmailEmailMock.mock.calls[0] as [string, string, string];

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, reminders_sent: 1, total_assignments: 1 });
    expect(sendGmailEmailMock).toHaveBeenCalledOnce();
    expect(subject).toContain('Matrimonio Test');
    expect(html).toContain('Ruolo:</td>');
    expect(html).toContain('Videomaker');
    expect(html).toContain('Prodotti:</td>');
    expect(html).toContain('Drone');
    expect(html).toContain('Note:</td>');
    expect(html).toContain(noteAdmin);
    expect(html).not.toContain('Dato storico da ignorare');
    expect(html).not.toMatch(/mansioni/i);
    expect(assignment.mansioniAssegnate).toEqual(['Dato storico da ignorare']);
  });
});
