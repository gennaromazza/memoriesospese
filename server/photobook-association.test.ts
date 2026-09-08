import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const h = vi.hoisted(() => ({
  state: {} as Record<string, Record<string, any>>,
  nextId: 1,
}));

const SERVER_TIMESTAMP = Symbol('serverTimestamp');

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function makeDocRef(collectionName: string, id: string) {
  return {
    id,
    get: async () => {
      const value = h.state[collectionName]?.[id];
      return {
        exists: value !== undefined,
        id,
        data: () => (value === undefined ? undefined : clone(value)),
      };
    },
  };
}

function makeCollection(collectionName: string) {
  return {
    doc: (id?: string) => makeDocRef(collectionName, id || `auto-${h.nextId++}`),
    add: async (data: any) => {
      const id = `auto-${h.nextId++}`;
      h.state[collectionName] ||= {};
      h.state[collectionName][id] = {
        ...clone(data),
        createdAt: { _seconds: 1 },
        updatedAt: { _seconds: 1 },
      };
      return makeDocRef(collectionName, id);
    },
  };
}

vi.mock('./firebase-admin.js', () => ({
  db: {
    collection: (name: string) => makeCollection(name),
  },
  storage: {
    bucket: () => ({
      name: 'test-bucket',
    }),
  },
  FieldValue: {
    serverTimestamp: () => SERVER_TIMESTAMP,
  },
}));

vi.mock('./google-drive.js', () => ({
  findOrCreateLabParentFolder: vi.fn(),
  createShipmentFolder: vi.fn(),
  uploadStreamToDriveFolder: vi.fn(),
  deleteDriveFile: vi.fn(),
}));

vi.mock('./email-routes.js', () => ({
  authenticateFirebase: (req: any, _res: any, next: any) => {
    req.user = { email: 'gennaro.mazzacane@gmail.com' };
    next();
  },
  sendGmailEmail: vi.fn(),
  getSiteBaseUrl: vi.fn(() => 'https://example.test'),
}));

vi.mock('./photobook-gallery.js', () => ({
  loadGalleryPhotoDocs: vi.fn(),
  listGalleryPhotosPublic: vi.fn(),
  loadGalleryChapters: vi.fn(),
}));

vi.mock('./lab-shipment-instructions.js', () => ({
  refreshLabShipmentInstructions: vi.fn(),
}));

import photobookRoutes from './photobook-routes.js';

describe('photobook Job-galleria association', () => {
  let server: any;
  let baseUrl: string;

  beforeEach(async () => {
    h.state = {
      galleries: {
        linked: {
          id: 'linked',
          name: 'Galleria collegata',
          clientName: 'Cliente',
        },
        unrelated: {
          id: 'unrelated',
          name: 'Galleria non collegata',
          clientName: 'Cliente',
          jobId: 'other-job',
        },
      },
      jobs: {
        withGalleries: {
          nomeEvento: 'Job con più gallerie',
          galleryIds: ['linked', 'another-linked'],
          clientiIds: [],
        },
        withoutGalleries: {
          nomeEvento: 'Job senza gallerie',
          galleryIds: [],
          clientiIds: [],
        },
      },
      photobooks: {},
    };
    h.nextId = 1;

    const app = express();
    app.use(express.json());
    app.use('/api/photobooks', photobookRoutes);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error: Error | undefined) => (error ? reject(error) : resolve()));
    });
  });

  async function postPhotobook(body: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}/api/photobooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, json: await response.json() };
  }

  it('creates a photobook for a gallery linked to a Job with multiple galleries', async () => {
    const result = await postPhotobook({
      name: 'Fotolibro collegato',
      galleryId: 'linked',
      jobId: 'withGalleries',
    });

    expect(result.status).toBe(200);
    expect(result.json.photobook.galleryId).toBe('linked');
    expect(result.json.photobook.jobId).toBe('withGalleries');
  });

  it('allows a Job without galleries to use a manually selected gallery', async () => {
    const result = await postPhotobook({
      name: 'Fotolibro selezione manuale',
      galleryId: 'linked',
      jobId: 'withoutGalleries',
    });

    expect(result.status).toBe(200);
    expect(result.json.photobook.galleryId).toBe('linked');
    expect(result.json.photobook.jobId).toBe('withoutGalleries');
  });

  it('blocks an unrelated gallery until the explicit mismatch confirmation', async () => {
    const blocked = await postPhotobook({
      name: 'Fotolibro incoerente',
      galleryId: 'unrelated',
      jobId: 'withGalleries',
    });

    expect(blocked.status).toBe(409);
    expect(blocked.json.code).toBe('photobook_association_mismatch');
    expect(blocked.json.warnings).toContain('La galleria è già collegata a un altro lavoro');
    expect(blocked.json.warnings).toContain('La galleria scelta non è tra quelle collegate al lavoro');
    expect(Object.keys(h.state.photobooks)).toHaveLength(0);

    const confirmed = await postPhotobook({
      name: 'Fotolibro incoerente confermato',
      galleryId: 'unrelated',
      jobId: 'withGalleries',
      allowAssociationMismatch: true,
    });

    expect(confirmed.status).toBe(200);
    expect(confirmed.json.photobook.galleryId).toBe('unrelated');
    expect(confirmed.json.photobook.jobId).toBe('withGalleries');
    expect(Object.keys(h.state.photobooks)).toHaveLength(1);
    expect(h.state.galleries.unrelated.jobId).toBe('other-job');
    expect(h.state.jobs.withGalleries.galleryIds).toEqual(['linked', 'another-linked']);
  });
});