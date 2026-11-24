import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { DateTime } from 'luxon';

const state: Record<string, Record<string, any>> = {};
const documentVersions = new Map<string, number>();
let nextId = 1;
let transactionCommitQueue = Promise.resolve();
let concurrentAssignmentReadBarrier: {
  remaining: number;
  promise: Promise<void>;
  release: () => void;
} | null = null;
const { sendGmailEmailMock } = vi.hoisted(() => ({
  sendGmailEmailMock: vi.fn(),
}));

function documentKey(collectionName: string, id: string): string {
  return `${collectionName}/${id}`;
}

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
      const key = documentKey(collectionName, id);
      documentVersions.set(key, (documentVersions.get(key) || 0) + 1);
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
      const key = documentKey(name, id);
      documentVersions.set(key, (documentVersions.get(key) || 0) + 1);
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
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const readVersions = new Map<string, number>();
    const writes: Array<{ type: 'create' | 'update'; ref: ReturnType<typeof documentRef>; data: any }> = [];
    const result = await callback({
      get: async (ref: ReturnType<typeof documentRef>) => {
        const key = documentKey(ref.collectionName, ref.id);
        const version = documentVersions.get(key) || 0;
        const snapshot = await ref.get();
        readVersions.set(key, version);
        if (
          ref.collectionName === 'jobCollaboratoreAssignments'
          && concurrentAssignmentReadBarrier
          && concurrentAssignmentReadBarrier.remaining > 0
        ) {
          const barrier = concurrentAssignmentReadBarrier;
          barrier.remaining -= 1;
          if (barrier.remaining === 0) barrier.release();
          await barrier.promise;
        }
        return snapshot;
      },
      create: (ref: ReturnType<typeof documentRef>, data: any) => {
        writes.push({ type: 'create', ref, data });
      },
      update: (ref: ReturnType<typeof documentRef>, data: any) => {
        writes.push({ type: 'update', ref, data });
      },
    });

    let releaseCommitQueue: (() => void) | undefined;
    const previousCommit = transactionCommitQueue;
    transactionCommitQueue = new Promise<void>((resolve) => {
      releaseCommitQueue = resolve;
    });
    await previousCommit;

    try {
      const hasConflict = [...readVersions].some(([key, version]) =>
        (documentVersions.get(key) || 0) !== version);
      if (hasConflict) continue;

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
        const key = documentKey(write.ref.collectionName, write.ref.id);
        documentVersions.set(key, (documentVersions.get(key) || 0) + 1);
      }

      return result;
    } finally {
      releaseCommitQueue?.();
    }
  }

  throw new Error('Firestore transaction retry limit exceeded');
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
  documentVersions.clear();
  transactionCommitQueue = Promise.resolve();
  concurrentAssignmentReadBarrier = null;
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
        idempotencyKey: 'payment-attempt-1',
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

  it('rifiuta un acconto oltre il residuo senza creare pagamenti o movimenti', async () => {
    const previousPayment = {
      id: 'previous-payment',
      idempotencyKey: 'previous-payment-key',
      tipo: 'acconto',
      importo: 400,
      metodo: 'bonifico',
      cashMovementId: 'previous-cash-movement',
    };
    state.jobCollaboratoreAssignments.assignment1.pagamenti = [previousPayment];
    state.jobCollaboratoreAssignments.assignment1.saldoResiduo = 100;
    state.cashMovements['previous-cash-movement'] = {
      tipo: 'uscita',
      importo: 400,
      metodoPagamento: 'bonifico',
    };

    const response = await fetch(`${baseUrl}/api/collaboratori/assignments/assignment1/add-payment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        importo: 100.01,
        tipo: 'saldo',
        metodo: 'bonifico',
        data: '2026-08-31',
        idempotencyKey: 'over-limit-payment',
      }),
    });
    const body: any = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      code: 'PAYMENT_EXCEEDS_COMPENSATION',
      maxImporto: 100,
    });
    expect(body.error).toContain('€100.00');
    expect(state.jobCollaboratoreAssignments.assignment1.pagamenti).toEqual([previousPayment]);
    expect(Object.keys(state.cashMovements)).toEqual(['previous-cash-movement']);
    expect(sendGmailEmailMock).not.toHaveBeenCalled();
  });

  it('accetta un pagamento che porta esattamente al compenso concordato', async () => {
    const previousPayment = {
      id: 'previous-payment',
      idempotencyKey: 'previous-payment-key',
      tipo: 'acconto',
      importo: 300.25,
      metodo: 'bonifico',
      cashMovementId: 'previous-cash-movement',
    };
    state.jobCollaboratoreAssignments.assignment1.pagamenti = [previousPayment];
    state.jobCollaboratoreAssignments.assignment1.saldoResiduo = 199.75;
    state.cashMovements['previous-cash-movement'] = {
      tipo: 'uscita',
      importo: 300.25,
      metodoPagamento: 'bonifico',
    };

    const response = await fetch(`${baseUrl}/api/collaboratori/assignments/assignment1/add-payment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        importo: 199.75,
        tipo: 'saldo',
        metodo: 'bonifico',
        data: '2026-08-31',
        idempotencyKey: 'exact-balance-payment',
      }),
    });
    const body: any = await response.json();
    const assignment = state.jobCollaboratoreAssignments.assignment1;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, saldoResiduo: 0, isPagato: true });
    expect(assignment.pagamenti).toHaveLength(2);
    expect(assignment.pagamenti[1]).toMatchObject({
      idempotencyKey: 'exact-balance-payment',
      importo: 199.75,
      cashMovementId: body.cashMovementId,
    });
    expect(assignment.saldoResiduo).toBe(0);
    expect(assignment.isPagato).toBe(true);
    expect(assignment.dataPagamento).toBeDefined();
    expect(Object.keys(state.cashMovements)).toHaveLength(2);
    expect(state.cashMovements[body.cashMovementId]).toMatchObject({
      tipo: 'uscita',
      importo: 199.75,
      metodoPagamento: 'bonifico',
    });
  });

  it('reuses the committed payment when the response was lost and the request is retried', async () => {
    const url = `${baseUrl}/api/collaboratori/assignments/assignment1/add-payment`;
    const request = () => fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        importo: 200,
        tipo: 'acconto',
        metodo: 'bonifico',
        data: '2026-08-31',
        idempotencyKey: 'payment-after-timeout',
      }),
    });

    // The first request commits, but its response is treated as lost by the client.
    const ignoredFirstResponse = await request();
    expect(ignoredFirstResponse.status).toBe(200);

    const retryResponse = await request();
    const retryBody: any = await retryResponse.json();

    expect(retryResponse.status).toBe(200);
    expect(retryBody).toMatchObject({
      success: true,
      saldoResiduo: 300,
      isPagato: false,
    });
    expect(state.jobCollaboratoreAssignments.assignment1.pagamenti).toHaveLength(1);
    expect(state.jobCollaboratoreAssignments.assignment1.pagamenti[0].idempotencyKey)
      .toBe('payment-after-timeout');
    expect(Object.keys(state.cashMovements)).toHaveLength(1);
    expect(retryBody.cashMovementId).toBe(
      state.jobCollaboratoreAssignments.assignment1.pagamenti[0].cashMovementId,
    );
    expect(sendGmailEmailMock).toHaveBeenCalledTimes(1);
  });

  it('records a new payment when it has a new idempotency key', async () => {
    const url = `${baseUrl}/api/collaboratori/assignments/assignment1/add-payment`;
    const sendPayment = (idempotencyKey: string) => fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        importo: 100,
        tipo: 'acconto',
        metodo: 'bonifico',
        data: '2026-08-31',
        idempotencyKey,
      }),
    });

    const firstResponse = await sendPayment('new-payment-1');
    const secondResponse = await sendPayment('new-payment-2');

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(state.jobCollaboratoreAssignments.assignment1.pagamenti).toHaveLength(2);
    expect(Object.keys(state.cashMovements)).toHaveLength(2);
  });

  it('accepts at most one simultaneous payment when their total exceeds the remaining compensation', async () => {
    const url = `${baseUrl}/api/collaboratori/assignments/assignment1/add-payment`;
    let releaseAssignmentReads: (() => void) | undefined;
    const assignmentReadsReady = new Promise<void>((resolve) => {
      releaseAssignmentReads = resolve;
    });
    concurrentAssignmentReadBarrier = {
      remaining: 2,
      promise: assignmentReadsReady,
      release: () => releaseAssignmentReads?.(),
    };
    const sendPayment = (idempotencyKey: string) => fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        importo: 300,
        tipo: 'acconto',
        metodo: 'bonifico',
        data: '2026-08-31',
        idempotencyKey,
      }),
    });

    const responses = await Promise.all([
      sendPayment('simultaneous-payment-1'),
      sendPayment('simultaneous-payment-2'),
    ]);
    const results = await Promise.all(responses.map(async (response) => ({
      status: response.status,
      body: await response.json() as Record<string, any>,
    })));
    const accepted = results.filter(({ status }) => status === 200);
    const rejected = results.filter(({ status }) => status === 409);
    const assignment = state.jobCollaboratoreAssignments.assignment1;
    const payments = assignment.pagamenti;
    const cashMovements = Object.entries(state.cashMovements);

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].body).toMatchObject({
      code: 'PAYMENT_EXCEEDS_COMPENSATION',
      maxImporto: 200,
    });
    expect(assignment.compenso).toBe(500);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      importo: 300,
      cashMovementId: accepted[0].body.cashMovementId,
    });
    expect(assignment.saldoResiduo).toBe(200);
    expect(assignment.isPagato).toBe(false);
    expect(cashMovements).toHaveLength(1);
    expect(cashMovements[0][0]).toBe(payments[0].cashMovementId);
    expect(cashMovements[0][1]).toMatchObject({ tipo: 'uscita', importo: 300 });
    expect(sendGmailEmailMock).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH /api/collaboratori/assignments/:id/compenso', () => {
  const getUrl = () => `${baseUrl}/api/collaboratori/assignments/assignment1/compenso`;

  it('rifiuta un compenso inferiore agli acconti già pagati senza toccare pagamenti o cassa', async () => {
    const previousPayments = [
      { id: 'payment-1', tipo: 'acconto', importo: 200, cashMovementId: 'cash-1' },
      { id: 'payment-2', tipo: 'acconto', importo: 100.25, cashMovementId: 'cash-2' },
    ];
    state.jobCollaboratoreAssignments.assignment1.pagamenti = previousPayments;
    state.jobCollaboratoreAssignments.assignment1.saldoResiduo = 199.75;
    state.cashMovements['cash-1'] = { tipo: 'uscita', importo: 200 };
    state.cashMovements['cash-2'] = { tipo: 'uscita', importo: 100.25 };

    const response = await fetch(getUrl(), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ compenso: 300.24, sendEmail: false }),
    });
    const body: any = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      code: 'COMPENSATION_BELOW_PAID',
      totalePagato: 300.25,
    });
    expect(body.error).toContain('€300.25');
    expect(state.jobCollaboratoreAssignments.assignment1).toMatchObject({
      compenso: 500,
      saldoResiduo: 199.75,
      pagamenti: previousPayments,
    });
    expect(Object.keys(state.cashMovements)).toEqual(['cash-1', 'cash-2']);
    expect(sendGmailEmailMock).not.toHaveBeenCalled();
  });

  it('consente un compenso pari al totale pagato senza duplicare i movimenti di cassa', async () => {
    const previousPayments = [
      { id: 'payment-1', tipo: 'acconto', importo: 200, cashMovementId: 'cash-1' },
      { id: 'payment-2', tipo: 'acconto', importo: 100.25, cashMovementId: 'cash-2' },
    ];
    state.jobCollaboratoreAssignments.assignment1.pagamenti = previousPayments;
    state.jobCollaboratoreAssignments.assignment1.saldoResiduo = 199.75;
    state.cashMovements['cash-1'] = { tipo: 'uscita', importo: 200 };
    state.cashMovements['cash-2'] = { tipo: 'uscita', importo: 100.25 };

    const response = await fetch(getUrl(), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ compenso: 300.25, sendEmail: false }),
    });
    const body: any = await response.json();
    const assignment = state.jobCollaboratoreAssignments.assignment1;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ compenso: 300.25, saldoResiduo: 0, isPagato: true });
    expect(assignment.pagamenti).toEqual(previousPayments);
    expect(Object.keys(state.cashMovements)).toEqual(['cash-1', 'cash-2']);
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

describe('PATCH /api/collaboratori/assignments/:id/respond', () => {
  it('lets an admin confirm an assignment and returns the updated status', async () => {
    state.jobCollaboratoreAssignments.assignment1.status = 'pending';
    const response = await fetch(`${baseUrl}/api/collaboratori/assignments/assignment1/respond`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    const body: any = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ id: 'assignment1', status: 'accepted' });
    expect(state.jobCollaboratoreAssignments.assignment1.status).toBe('accepted');
  });

  it('rejects invalid acceptance states', async () => {
    const response = await fetch(`${baseUrl}/api/collaboratori/assignments/assignment1/respond`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    expect(response.status).toBe(400);
  });

  it('clears the response date and rejection note when an assignment returns to pending', async () => {
    Object.assign(state.jobCollaboratoreAssignments.assignment1, {
      status: 'accepted',
      dataRisposta: { previous: true },
      noteRifiuto: 'Motivo precedente',
    });
    const response = await fetch(`${baseUrl}/api/collaboratori/assignments/assignment1/respond`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'pending' }),
    });

    expect(response.status).toBe(200);
    expect(state.jobCollaboratoreAssignments.assignment1).toMatchObject({
      status: 'pending',
      dataRisposta: null,
      noteRifiuto: null,
    });
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
