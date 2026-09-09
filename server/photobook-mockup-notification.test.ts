import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { SavedMockup } from '../shared/mockup-types';

const h = vi.hoisted(() => ({ notify: null as null | ((book: { id: string; data: () => Record<string, unknown> }, saved: SavedMockup) => Promise<void>), email: vi.fn() }));
vi.mock('./firebase-admin.js', () => ({ db: {}, storage: {}, FieldValue: {} }));
vi.mock('./google-drive.js', () => ({ findOrCreateLabParentFolder: vi.fn(), createShipmentFolder: vi.fn(), uploadStreamToDriveFolder: vi.fn(), deleteDriveFile: vi.fn() }));
vi.mock('./email-routes.js', () => ({ authenticateFirebase: (_req: unknown, _res: unknown, next: () => void) => next(), sendGmailEmail: h.email, getSiteBaseUrl: () => 'https://studio.test' }));
vi.mock('./photobook-gallery.js', () => ({ loadGalleryPhotoDocs: vi.fn(), listGalleryPhotosPublic: vi.fn(), loadGalleryChapters: vi.fn() }));
vi.mock('./lab-shipment-instructions.js', () => ({ refreshLabShipmentInstructions: vi.fn() }));
vi.mock('./photobook-mockup-routes.js', () => ({ createPhotobookMockupRouter: (_resolve: unknown, admin: boolean, notify: typeof h.notify) => { if (!admin) h.notify = notify; return express.Router(); } }));
await import('./photobook-routes.js');

describe('Notifica reale collegata al router fotolibri', () => {
  it('invia allo studio una mail con riferimento alla revisione e link admin, senza HTML cliente o token', async () => {
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
});
