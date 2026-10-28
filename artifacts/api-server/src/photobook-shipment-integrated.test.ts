/**
 * Real manager + real client helpers + real Express routes, in one process.
 * Only external boundaries are replaced. Never import the application entrypoint.
 * Run from artifacts/api-server:
 * pnpm exec vitest run --config vitest.config.ts src/photobook-shipment-integrated.test.ts
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Socket } from 'node:net';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { chromium, expect as browserExpect, type Browser, type BrowserContext } from '@playwright/test';
import sharp from 'sharp';
import { services } from './test-utils/photobook-integrated-services';

vi.mock('./firebase-admin.js', async () => {
  const { db, storage, FieldValue, Timestamp } = await import('./test-utils/photobook-integrated-services');
  return { db, storage, FieldValue, Timestamp };
});
vi.mock('firebase-admin/firestore', async () => {
  const { FieldValue, Timestamp } = await import('./test-utils/photobook-integrated-services');
  return { FieldValue, Timestamp };
});
vi.mock('./google-drive.js', async () => (await import('./test-utils/photobook-integrated-services')).drive);
vi.mock('./email-routes.js', async () => (await import('./test-utils/photobook-integrated-services')).email);
vi.mock('./print-shop/auth.js', async () => ({
  authenticatePrintShop: (await import('./test-utils/photobook-integrated-services')).authenticate,
}));
vi.mock('./photobook-gallery.js', () => ({
  loadGalleryPhotoDocs: vi.fn(() => { throw new Error('Unexpected gallery access'); }),
  listGalleryPhotosPublic: vi.fn(() => { throw new Error('Unexpected gallery access'); }),
  loadGalleryChapters: vi.fn(() => { throw new Error('Unexpected gallery access'); }),
}));
import photobooks from './photobook-routes';
import labs from './lab-routes';

let server: Server | undefined;
let vite: ViteDevServer | undefined;
let browser: Browser | undefined;
let context: BrowserContext | undefined;
let origin: string;
const blocked: string[] = [];
let restoreNetwork: (() => void) | undefined;

beforeAll(async () => {
  // Fail closed even if a future route starts using an unmocked HTTP client.
  // Vite and the browser may only connect to local test servers.
  const connect = Socket.prototype.connect;
  const guard = vi.spyOn(Socket.prototype, 'connect').mockImplementation(function (this: Socket, ...args: any[]) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const host = typeof first === 'object' ? first?.host : typeof args[1] === 'string' ? args[1] : undefined;
    if (host && !['127.0.0.1', 'localhost', '::1'].includes(host)) {
      throw new Error(`External network forbidden in isolated shipment test: ${host}`);
    }
    return connect.apply(this, args as Parameters<typeof connect>);
  });
  restoreNetwork = () => guard.mockRestore();
  services.docs.set('labs/lab-fixture', {
    nome: 'Laboratorio isolato', email: 'lab@example.test', attivo: true,
  });
  const app = express();
  app.use(express.json());
  app.use('/api/photobooks', photobooks);
  app.use('/api', labs);
  // An unknown API must fail, not accidentally receive the Vite HTML fallback.
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Unknown test endpoint' }); });
  vite = await createServer({
    configFile: fileURLToPath(new URL('../../image-studio-web/e2e/photobook-shipment-harness/vite.config.ts', import.meta.url)),
    resolve: { alias: [{
      // Unlike the browser-only harness, use the production laboratory client.
      find: '@/lib/labs',
      replacement: fileURLToPath(new URL('../../image-studio-web/src/lib/labs.ts', import.meta.url)),
    }] },
    server: { middlewareMode: true, hmr: false },
  });
  app.use(vite.middlewares);
  server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch({
    headless: true,
    ...(existsSync('/repl/tools/bin/chromium') ? { executablePath: '/repl/tools/bin/chromium' } : {}),
  });
  context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    blocked.push(url.origin);
    return route.abort('blockedbyclient');
  });
}, 60_000);

afterAll(async () => {
  await context?.close();
  await browser?.close();
  await vite?.close();
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve();
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
  restoreNetwork?.();
});

it('autonomo: crea, carica originali, prepara, ritenta solo la pagina mancante e invia email dopo refresh', async () => {
  const page = await context!.newPage();
  const responses: Array<{ path: string; status: number }> = [];
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/')) responses.push({ path: url.pathname, status: response.status() });
  });
  await page.goto(origin);
  await page.getByTestId('button-create-photobook').click();
  await page.getByTestId('button-photobook-mode-standalone').click();
  await page.getByTestId('input-photobook-name').fill('Album autonomo integrato');
  await page.getByTestId('button-confirm-create-photobook').click();
  await browserExpect(page.getByText('Album autonomo integrato', { exact: true })).toBeVisible();
  const entries = [...services.docs].filter(([path]) => path.startsWith('photobooks/'));
  expect(entries).toHaveLength(1);
  const [bookPath, book] = entries[0];
  const id = bookPath.split('/')[1];
  expect(book).toMatchObject({ jobId: null, galleryId: null, currentVersion: 1 });

  // Use the production upload client, not seeded page documents or fabricated
  // responses. The manager's editor is a separate page, outside this harness.
  const originals: Buffer[] = [];
  for (let number = 1; number <= 3; number++) {
    const buffer = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: number * 50, g: 70, b: 100 } },
    }).jpeg({ quality: 95 }).toBuffer();
    originals.push(buffer);
    await page.evaluate(async ({ id, number, bytes, clientPath, authPath }) => {
      // Keep browser imports out of Vitest's server-side import transform.
      const browserImport = new Function('url', 'return import(url)');
      const { auth } = await browserImport('/@fs' + authPath);
      auth.currentUser = { getIdToken: async () => 'isolated-admin-not-a-real-token' };
      const { uploadPhotobookPage } = await browserImport('/@fs' + clientPath);
      const file = new File([new Uint8Array(bytes)], `originale-${number}.jpg`, { type: 'image/jpeg' });
      await uploadPhotobookPage({ photobookId: id, version: 1, pageNumber: number, file });
    }, {
      id, number, bytes: [...buffer],
      clientPath: fileURLToPath(new URL('../../image-studio-web/src/lib/photobooks.ts', import.meta.url)),
      authPath: fileURLToPath(new URL('../../image-studio-web/e2e/campaign-product-selection-harness/stubs/firebase.ts', import.meta.url)),
    });
  }
  expect([...services.docs.keys()].filter(path => path.startsWith('photobookPages/'))).toHaveLength(3);
  expect(services.docs.get(bookPath).versions[0].pageCount).toBe(3);
  await page.reload();
  const card = page.getByTestId(`card-photobook-${id}`);
  await browserExpect(card).toBeVisible();
  await page.getByTestId(`button-lock-${id}`).click();
  await page.getByTestId('select-shipment-lab').click();
  await page.getByRole('option', { name: 'Laboratorio isolato' }).click();
  await page.getByTestId('textarea-shipment-lab-note').fill('Carta opaca, controllo colore');
  await page.getByTestId('button-confirm-lock').click();
  await browserExpect(page.getByTestId(`button-retry-shipment-${id}`)).toBeVisible({ timeout: 15_000 });
  const shipmentId = services.docs.get(bookPath).labShipmentId;
  const shipmentPath = `labShipments/${shipmentId}`;
  expect(services.docs.get(shipmentPath).pageTransfer).toMatchObject({
    status: 'partial', total: 3, transferred: 2, failed: [expect.objectContaining({ pageNumber: 2 })],
  });
  expect(services.docs.get(bookPath)).toMatchObject({ locked: true, jobId: null, galleryId: null });
  expect(services.emails).toHaveLength(0);
  await browserExpect(page.getByTestId('button-send-lab-email')).toBeDisabled();
  // Both layers enforce the same readiness contract, even if a caller bypasses the disabled button.
  const rejectedSend = await page.evaluate(async id => {
    const response = await fetch(`/api/lab-shipments/${id}/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    return response.status;
  }, shipmentId);
  expect(rejectedSend).toBe(409);
  expect(services.emails).toHaveLength(0);
  await page.reload();
  await browserExpect(card).toBeVisible();
  await browserExpect(page.getByTestId('button-send-lab-email')).toBeDisabled();

  services.failPage = 0;
  const beforeRetry = services.uploads.length;
  await page.getByTestId(`button-retry-shipment-${id}`).click();
  await browserExpect(page.getByTestId('button-send-lab-email')).toBeEnabled({ timeout: 15_000 });
  const shipment = services.docs.get(shipmentPath);
  expect(shipment.pageTransfer).toMatchObject({ status: 'completed', transferred: 1, skipped: 2, failed: [] });
  expect(services.uploads.slice(beforeRetry).filter(name => name.startsWith('pagina-'))).toEqual([
    expect.stringMatching(/^pagina-002-/),
  ]);
  expect(services.docs.get(bookPath).labShipmentId).toBe(shipmentId);
  expect([...services.docs.keys()].filter(path => path.startsWith('labShipments/'))).toHaveLength(1);
  const files = shipment.files.filter((file: any) => file.kind === 'original');
  expect(files).toHaveLength(3);
  expect(new Set(files.map((file: any) => file.driveFileId)).size).toBe(3);
  files.forEach((file: any) => {
    const number = Number(file.name.match(/^pagina-(\d+)-/)[1]);
    expect(services.drive.get(file.name)).toEqual(originals[number - 1]);
  });
  expect(services.emails).toHaveLength(0);
  await page.reload();
  await browserExpect(card).toBeVisible();
  await browserExpect(card).toContainText(/Email non ancora inviata/i);
  await page.getByTestId('button-send-lab-email').click();
  await browserExpect(card).toContainText('Email al laboratorio inviata.');
  expect(services.emails).toHaveLength(1);
  expect(services.emails[0][0]).toBe('lab@example.test');
  expect(services.emails[0][2]).toContain('https://drive.invalid/isolated-folder');
  expect(services.drive.get('ISTRUZIONI-DI-STAMPA.txt')?.toString()).toContain('Carta opaca, controllo colore');
  expect(services.docs.get(shipmentPath)).toMatchObject({ status: 'inviato', sentAt: expect.any(Object) });
  await page.reload();
  await browserExpect(card).toBeVisible();
  await browserExpect(card).toContainText('Email al laboratorio inviata.');
  expect(services.emails).toHaveLength(1);
  // Shared CSS tries to load Google Fonts. Those requests are aborted too;
  // no Firebase, Drive or mail transport may even be attempted by the browser.
  expect([...new Set(blocked)].filter(host => host !== 'https://fonts.googleapis.com')).toEqual([]);
  expect(responses.filter(response => response.status >= 400)).toEqual([
    { path: `/api/lab-shipments/${shipmentId}/send`, status: 409 },
  ]);
  expect(responses.filter(response => response.path === `/api/photobooks/${id}/lab-shipment`).map(response => response.status)).toEqual([202, 202]);
}, 60_000);
