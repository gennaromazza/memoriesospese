import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const h = vi.hoisted(() => ({
  labs: new Map<string, Record<string, any>>(),
  nextId: 1,
}));

function labDoc(id: string) {
  return {
    id,
    get: async () => {
      const value = h.labs.get(id);
      return { exists: Boolean(value), id, data: () => value };
    },
    update: async (patch: Record<string, any>) => {
      const value = h.labs.get(id);
      if (!value) throw new Error('not found');
      for (const [key, next] of Object.entries(patch)) {
        if (next?.constructor?.name === 'DeleteTransform') delete value[key];
        else value[key] = next;
      }
    },
    delete: async () => h.labs.delete(id),
  };
}

vi.mock('./firebase-admin.js', () => ({
  db: {
    collection: (name: string) => {
      if (name !== 'labs') throw new Error(`unexpected collection: ${name}`);
      return {
        doc: (id: string) => labDoc(id),
        add: async (data: Record<string, any>) => {
          const id = `lab_${h.nextId++}`;
          h.labs.set(id, { ...data });
          return labDoc(id);
        },
        get: async () => ({
          docs: [...h.labs.entries()].map(([id, value]) => ({
            id,
            data: () => value,
          })),
        }),
      };
    },
  },
}));

vi.mock('./email-routes.js', () => ({
  sendGmailEmail: vi.fn(async () => undefined),
  getStudioContactInfo: vi.fn(async () => ({ name: 'Image Studio' })),
  getSiteBaseUrl: vi.fn(() => 'https://example.test'),
}));

vi.mock('./print-shop/auth.js', () => ({
  authenticatePrintShop: (req: any, _res: any, next: () => void) => {
    req.user = { email: 'gennaro.mazzacane@gmail.com' };
    next();
  },
}));

vi.mock('./google-drive.js', () => ({
  findOrCreateLabParentFolder: vi.fn(),
  createShipmentFolder: vi.fn(),
  createResumableUploadSession: vi.fn(),
  deleteDriveFile: vi.fn(),
  revokeShipmentFolderPermission: vi.fn(),
}));

const { default: router } = await import('./lab-routes.js');
const app = express();
app.use(express.json());
app.use('/api', router);
const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

afterAll(() => server.close());

beforeEach(() => {
  h.labs.clear();
  h.nextId = 1;
});

async function request(path: string, method: 'POST' | 'PATCH', body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

describe('laboratory DPA API invariants', () => {
  it('rejects signed without a reference and stamps a valid signature server-side', async () => {
    const rejected = await request('/api/labs', 'POST', {
      nome: 'Lab Uno',
      email: 'lab@example.com',
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementReference: ' ',
    });
    expect(rejected.status).toBe(400);
    expect(h.labs.size).toBe(0);

    const created = await request('/api/labs', 'POST', {
      nome: 'Lab Uno',
      email: 'lab@example.com',
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementReference: '  DPA-2026-04  ',
      dataProcessingAgreementSignedAt: 'client-controlled',
    });
    expect(created.status).toBe(200);
    const stored = h.labs.get(created.body.id);
    expect(stored).toMatchObject({
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementReference: 'DPA-2026-04',
    });
    expect(stored?.dataProcessingAgreementSignedAt?.toMillis()).toBeGreaterThan(0);
    expect(stored?.dataProcessingAgreementSignedAt).not.toBe('client-controlled');
  });

  it('clears signedAt and reference atomically when an agreement returns to pending', async () => {
    const signedAt = { toMillis: () => Date.UTC(2026, 7, 31) };
    h.labs.set('lab_existing', {
      nome: 'Lab Esistente',
      email: 'existing@example.com',
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementReference: 'DPA-OLD',
      dataProcessingAgreementSignedAt: signedAt,
    });

    const result = await request('/api/labs/lab_existing', 'PATCH', {
      dataProcessingAgreementStatus: 'pending',
    });
    expect(result.status).toBe(200);
    expect(h.labs.get('lab_existing')).toMatchObject({
      dataProcessingAgreementStatus: 'pending',
    });
    expect(h.labs.get('lab_existing')).not.toHaveProperty('dataProcessingAgreementReference');
    expect(h.labs.get('lab_existing')).not.toHaveProperty('dataProcessingAgreementSignedAt');
  });
});
