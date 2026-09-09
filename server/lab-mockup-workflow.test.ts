import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { MOCKUP_MODEL } from '../shared/mockup-catalog';
const h = vi.hoisted(() => ({ docs: new Map<string, any>(), sends: 0, failSend: false }));
function ref(path: string): any {
  return { id: path.split('/').pop(), path, get: async () => { const value = h.docs.get(path); return { exists: !!value, id: path.split('/').pop(), ref: ref(path), data: () => value ? { ...value } : undefined }; }, update: async (data: any) => h.docs.set(path, { ...h.docs.get(path), ...data }) };
}
vi.mock('./firebase-admin.js', () => ({ db: {
  collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
  runTransaction: async (run: any) => {
    const writes: (() => void)[] = [];
    const result = await run({ get: (r: any) => r.get(), update: (r: any, data: any) => writes.push(() => { void r.update(data); }) });
    writes.forEach(w => w()); return result;
  },
} }));
vi.mock('./print-shop/auth.js', () => ({ authenticatePrintShop: (req: any, res: any, next: any) => { const role = req.headers['x-test-role']; if (!role) return res.sendStatus(401); req.user = { email: role === 'admin' ? 'gennaro.mazzacane@gmail.com' : 'client@example.test' }; next(); } }));
vi.mock('./email-routes.js', () => ({ sendGmailEmail: async () => { h.sends++; if (h.failSend) throw new Error('Invio incerto'); }, getStudioContactInfo: async () => ({ name: 'Studio', email: 'studio@example.test', phone: '' }), getSiteBaseUrl: () => 'https://example.test' }));
vi.mock('./google-drive.js', () => ({ findOrCreateLabParentFolder: vi.fn(), createShipmentFolder: vi.fn(), createResumableUploadSession: vi.fn(), deleteDriveFile: vi.fn(), revokeShipmentFolderPermission: vi.fn() }));
vi.mock('./lab-shipment-instructions.js', () => ({ refreshLabShipmentInstructions: async (r: any) => (await r.get()).data() }));
import router from './lab-routes';
describe('Catalogo laboratori e protezioni spedizione mockup', () => {
  let server: Server; let base: string;
  beforeEach(async () => {
    h.docs.clear(); h.sends = 0; h.failSend = false;
    h.docs.set('labs/lab', { nome: 'Laboratorio', email: 'lab@example.test', attivo: true });
    h.docs.set('labShipments/shipment', { sourceType: 'photobook', jobId: 'job', photobookId: 'book', labId: 'lab', driveFolderId: 'folder', shareableLink: 'https://drive.google.com/example', status: 'da_inviare', files: [], mockupSnapshot: { labId: 'lab', revision: 3 } });
    h.docs.set('jobs/job', { nomeEvento: 'Lavoro test' });
    const app = express(); app.use(express.json()); app.use(router); server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => new Promise<void>(resolve => server.close(() => resolve())));
  const request = (path: string, method = 'GET', body?: unknown, role = 'admin') => fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(role ? { 'x-test-role': role } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const catalog = { revision: 0, materials: [{ id: MOCKUP_MODEL.variants[0].id, label: 'Tessuto', supplierCode: '01' }], models: [{ id: '33333333-3333-4333-8333-333333333333', name: 'Custodia', rendererId: MOCKUP_MODEL.id, supplierCode: '', active: true, materialIds: [MOCKUP_MODEL.variants[0].id] }] };
  it('riserva lettura e modifica del catalogo all’amministratore', async () => {
    expect((await request('/labs/lab/mockup-catalog', 'GET', undefined, '')).status).toBe(401);
    expect((await request('/labs/lab/mockup-catalog', 'PUT', catalog, 'client')).status).toBe(403);
    expect(await request('/labs/lab/mockup-catalog').then(r => r.json())).toEqual({ revision: 0, materials: [], models: [] });
  });
  it('salva nomi e campionario comuni, rifiuta una revisione obsoleta o materiali estranei', async () => {
    expect((await request('/labs/lab/mockup-catalog', 'PUT', catalog)).status).toBe(200);
    expect((await request('/labs/lab/mockup-catalog', 'PUT', catalog)).status).toBe(409);
    expect(h.docs.get('labs/lab').email).toBe('lab@example.test');
    expect((await request('/labs/lab/mockup-catalog', 'PUT', { ...catalog, revision: 1, materials: [] })).status).toBe(400);
  });
  it('non cambia laboratorio né invia la conferma ad un destinatario diverso', async () => {
    expect((await request('/lab-shipments/shipment', 'PATCH', { labId: 'other' })).status).toBe(409);
    expect((await request('/lab-shipments/shipment/send', 'POST', { labId: 'other' })).status).toBe(409);
    expect(h.sends).toBe(0);
  });
  it.each(['uploading', 'needs_review'])('blocca mutazioni e invio con trasferimento %s', async status => {
    h.docs.get('labShipments/shipment').mockupTransfer = { status };
    expect((await request('/lab-shipments/shipment', 'PATCH', { status: 'inviato' })).status).toBe(409);
    expect((await request('/lab-shipments/shipment/send', 'POST', {})).status).toBe(409);
    expect((await request('/lab-shipments/shipment', 'DELETE')).status).toBe(409);
    expect(h.sends).toBe(0);
  });
  it('conserva il normale invio esplicito della spedizione al laboratorio corretto', async () => {
    expect((await request('/lab-shipments/shipment/send', 'POST', { labId: 'lab' })).status).toBe(200);
    expect(h.sends).toBe(1);
    expect(h.docs.get('labShipments/shipment').status).toBe('inviato');
    expect(h.docs.get('labShipments/shipment').mockupDispatching).toBe(false);
  });
  it('non libera il blocco dopo un errore email potenzialmente post-invio', async () => {
    h.failSend = true;
    expect((await request('/lab-shipments/shipment/send', 'POST', {})).status).toBe(500);
    expect((await request('/lab-shipments/shipment/send', 'POST', {})).status).toBe(409);
    expect(h.sends).toBe(1);
    expect(h.docs.get('labShipments/shipment').mockupDispatching).toBe(true);
  });
});
