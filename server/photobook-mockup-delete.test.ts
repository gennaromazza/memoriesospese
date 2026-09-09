import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
const h = vi.hoisted(() => ({ deleted: [] as string[], prefixes: [] as string[] }));
function document(path: string): any {
  return { id: path.split('/').pop(), ref: reference(path), exists: true, data: () => ({}) };
}
function reference(path: string): any {
  return { id: path.split('/').pop(), path, get: async () => document(path), collection: (name: string) => collection(`${path}/${name}`) };
}
function collection(path: string): any {
  return { doc: (id: string) => reference(`${path}/${id}`), where: () => collection(path), get: async () => ({ size: 1, docs: [document(`${path}/record`)] }) };
}
vi.mock('./firebase-admin.js', () => ({
  db: { collection, batch: () => ({ delete: (ref: any) => h.deleted.push(ref.path), commit: async () => {} }) },
  storage: { bucket: () => ({ deleteFiles: async ({ prefix }: { prefix: string }) => { h.prefixes.push(prefix); } }) },
  FieldValue: { serverTimestamp: vi.fn() },
}));
vi.mock('./email-routes.js', () => ({ authenticateFirebase: (req: any, _res: any, next: any) => { req.user = { email: 'gennaro.mazzacane@gmail.com' }; next(); }, sendGmailEmail: vi.fn(), getSiteBaseUrl: vi.fn() }));
vi.mock('./google-drive.js', () => ({ findOrCreateLabParentFolder: vi.fn(), createShipmentFolder: vi.fn(), uploadStreamToDriveFolder: vi.fn(), deleteDriveFile: vi.fn() }));
vi.mock('./photobook-gallery.js', () => ({ loadGalleryPhotoDocs: vi.fn(), listGalleryPhotosPublic: vi.fn(), loadGalleryChapters: vi.fn() }));
vi.mock('./lab-shipment-instructions.js', () => ({ refreshLabShipmentInstructions: vi.fn() }));
import router from './photobook-routes';

describe('Cancellazione esplicita fotolibro con mockup', () => {
  it('include configurazioni e copie del solo fotolibro richiesto nella cascata esistente', async () => {
    const app = express(); app.use(router);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    try {
      const result = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/book`, { method: 'DELETE' });
      expect(result.status).toBe(200);
      expect(h.deleted).toEqual(expect.arrayContaining(['photobooks/book/mockups/record','photobooks/book/mockupAssets/record','photobooks/book/mockupOffers/record','photobooks/book/mockupHistory/record','photobooks/book/mockupAttachments/record','photobooks/book']));
      expect(h.prefixes).toEqual(['photobooks/book/','photobook-mockups/book/']);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
