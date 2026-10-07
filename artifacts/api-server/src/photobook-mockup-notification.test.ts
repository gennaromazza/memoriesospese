import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { SavedMockup } from '../shared/mockup-types';

const h = vi.hoisted(() => ({ notify: null as null | ((book: { id: string; data: () => Record<string, unknown> }, saved: SavedMockup) => Promise<void>), adminNotify: null as null | ((book: any, saved: SavedMockup, event: 'confirmed' | 'changes_requested') => Promise<void>), email: vi.fn(), data: {} as Record<string, any>, clientEmail: '' }));
vi.mock('./firebase-admin.js', () => ({ db: {
  collection: (name: string) => ({ doc: (_id: string) => ({ get: async () => ({ exists: name === 'galleries', data: () => ({ clientEmail: h.clientEmail }) }) }) }),
  runTransaction: async (run: any) => run({ get: async () => ({ exists: true, data: () => structuredClone(h.data) }), update: (_ref: any, value: Record<string, any>) => { for (const [key, item] of Object.entries(value)) { const [parent, child] = key.split('.'); h.data[parent] ||= {}; h.data[parent][child] = item; } } }),
}, storage: {}, FieldValue: {} }));
vi.mock('./google-drive.js', () => ({ findOrCreateLabParentFolder: vi.fn(), createShipmentFolder: vi.fn(), uploadStreamToDriveFolder: vi.fn(), deleteDriveFile: vi.fn() }));
vi.mock('./email-routes.js', () => ({ authenticateFirebase: (_req: unknown, _res: unknown, next: () => void) => next(), sendGmailEmail: h.email, getSiteBaseUrl: () => 'https://studio.test' }));
vi.mock('./photobook-gallery.js', () => ({ loadGalleryPhotoDocs: vi.fn(), listGalleryPhotosPublic: vi.fn(), loadGalleryChapters: vi.fn() }));
vi.mock('./lab-shipment-instructions.js', () => ({ refreshLabShipmentInstructions: vi.fn() }));
vi.mock('./photobook-mockup-routes.js', () => ({ createPhotobookMockupRouter: (_resolve: unknown, admin: boolean, notify: typeof h.notify, adminNotify: typeof h.adminNotify) => { if (!admin) h.notify = notify; else h.adminNotify = adminNotify; return express.Router(); } }));
await import('./photobook-routes.js');

describe('Notifica reale collegata al router fotolibri', () => {
  it('invia allo studio una mail con riferimento alla revisione e link admin, senza HTML cliente o token', async () => {
    h.email.mockClear();
    expect(h.notify).toBeTypeOf('function');
    // Il notificatore usa solo i metadati del salvataggio, non renderer/foto.
    const saved = { version: 2, revision: 7, option: { name: '<img src=x>', labName: 'A & B' } } as SavedMockup;
    await h.notify!({ id: 'book-id', data: () => ({ name: 'Album <script>', clientName: 'Cliente "<b>"', token: 'TOKEN_PRIVATO' }) }, saved);
    expect(h.email).toHaveBeenCalledTimes(1);
    const [to, subject, html, , metadata] = h.email.mock.calls[0];
    expect(to).toBe('gennaro.mazzacane@gmail.com');
    expect(subject).toContain('(v2, r7)');
    expect(html).toContain('https://studio.test/admin/photobooks/book-id');
    expect(html).toContain('&lt;img src=x&gt;'); expect(html).toContain('A &amp; B');
    expect(html).not.toContain('<script>'); expect(html).not.toContain('TOKEN_PRIVATO');
    expect(metadata).toMatchObject({ type: 'photobook_mockup_submitted', relatedDocId: 'book-id' });
  });
  it('alla conferma studio avvisa il cliente una sola volta, risolvendo la galleria e conservando il link token', async () => {
    h.email.mockReset().mockResolvedValue(undefined);
    h.clientEmail = 'cliente@example.test';
    h.data = { galleryId: 'gallery', currentVersion: 2, approval: { version: 2 }, token: 'token-privato', name: 'Album', mockupPath: 'studio', mockupNotifications: {} };
    const ref = { update: async (updates: Record<string, any>) => { for (const [key, value] of Object.entries(updates)) h.data.mockupNotifications[key.split('.')[1]] = value; } };
    const book = { id: 'book-id', ref, data: () => h.data };
    const saved = { version: 2, revision: 5, status: 'confirmed' } as SavedMockup;
    await Promise.all([h.adminNotify!(book, saved, 'confirmed'), h.adminNotify!(book, saved, 'confirmed').catch(() => undefined)]);
    expect(h.email).toHaveBeenCalledTimes(1);
    expect(h.email.mock.calls[0][0]).toBe('cliente@example.test');
    expect(h.email.mock.calls[0][2]).toContain('https://studio.test/fotolibro/token-privato');
    expect(h.email.mock.calls[0][2]).toContain('contatta lo studio');
    expect(h.email.mock.calls[0][2]).not.toContain('inviare una nuova revisione');
    expect(h.data.mockupNotifications.confirmed_v2_r5.state).toBe('sent');
  });
  it('senza indirizzo registra il mancato invio e può riprovare senza doppioni dopo la correzione', async () => {
    h.email.mockReset().mockResolvedValue(undefined);
    h.clientEmail = '';
    h.data = { galleryId: 'gallery', currentVersion: 1, approval: { version: 1 }, token: 'token-privato', mockupPath: 'studio', mockupNotifications: {} };
    const book = { id: 'book-id', ref: { update: async (updates: Record<string, any>) => { for (const [key, value] of Object.entries(updates)) h.data.mockupNotifications[key.split('.')[1]] = value; } }, data: () => h.data };
    const saved = { version: 1, revision: 2, status: 'confirmed' } as SavedMockup;
    await h.adminNotify!(book, saved, 'confirmed');
    expect(h.data.mockupNotifications.confirmed_v1_r2.state).toBe('missing-email');
    expect(h.email).not.toHaveBeenCalled();
    h.clientEmail = 'cliente@example.test';
    await h.adminNotify!(book, saved, 'confirmed');
    await h.adminNotify!(book, saved, 'confirmed');
    expect(h.email).toHaveBeenCalledTimes(1);
  });
});
