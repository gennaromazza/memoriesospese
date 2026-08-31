import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const state: Record<string, Record<string, any>> = {};
let nextId = 1;

function documentRef(collectionName: string, id: string) {
  return {
    id,
    collectionName,
    async get() {
      const value = state[collectionName]?.[id];
      return { exists: value !== undefined, id, data: () => value };
    },
  };
}

function collection(name: string) {
  return {
    doc: (id?: string) => documentRef(name, id || `auto-${nextId++}`),
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
  sendGmailEmail: async () => undefined,
}));

vi.mock('./utils/timezone.js', () => ({
  nowRome: () => new Date('2026-08-31T12:00:00.000Z'),
  formatRomeDateLocale: () => '31 agosto 2026',
}));

import collaboratoriRoutes from './collaboratori-routes.js';

let server: any;
let baseUrl = '';

beforeEach(async () => {
  for (const collectionName of Object.keys(state)) delete state[collectionName];
  nextId = 1;
  Object.assign(state, {
    jobCollaboratoreAssignments: {
      assignment1: {
        collaboratoreId: 'collaboratore1',
        jobId: 'job1',
        ruoloInJob: 'videomaker',
        compenso: 500,
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

    const body = await response.json();
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
