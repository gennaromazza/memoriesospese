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
import { driveObjectKey, services } from './test-utils/photobook-integrated-services';

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
    // The real API serializes in-memory Storage objects as Firebase-style
    // URLs. Serve those bytes locally rather than letting the browser reach
    // Firebase or recording a blocked external request.
    if (url.hostname === 'firebasestorage.googleapis.com' && url.pathname.includes('/o/')) {
      const storagePath = decodeURIComponent(url.pathname.split('/o/')[1]);
      const image = services.objects.get(storagePath);
      if (image) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: image });
    }
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

function resetIntegratedServices() {
  services.docs.clear();
  services.objects.clear();
  services.drive.clear();
  services.uploads.length = 0;
  services.uploadAttempts.length = 0;
  services.driveFileKeys.clear();
  services.folderSequence = 0;
  services.emails.length = 0;
  services.failEmailShipmentId = null;
  services.failPage = 0;
  services.failFolderId = null;
  services.beforeUpload = null;
  services.nextId = 1;
  services.docs.set('labs/lab-fixture', {
    nome: 'Laboratorio isolato', email: 'lab@example.test', attivo: true,
  });
}

function createUploadGate(folderIds: string[]) {
  const expectedFolders = new Set(folderIds);
  const reachedFolders = new Set<string>();
  let signalReached!: () => void;
  let release!: () => void;
  const reached = new Promise<void>(resolve => { signalReached = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  return {
    reached,
    release,
    beforeUpload: async (folderId: string) => {
      if (!expectedFolders.has(folderId)) return;
      reachedFolders.add(folderId);
      if (reachedFolders.size === expectedFolders.size) signalReached();
      await released;
    },
  };
}

async function waitForSignal(signal: Promise<void>, label: string, timeoutMs = 10_000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      signal,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout waiting for ${label}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function postIntegratedJson(path: string, body: unknown) {
  const response = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() as any };
}

async function getIntegratedShipment(shipmentId: string) {
  const response = await fetch(`${origin}/api/lab-shipments/${shipmentId}`);
  return { status: response.status, json: await response.json() as any };
}

async function waitForIntegratedTransfer(shipmentPath: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const transfer = services.docs.get(shipmentPath)?.pageTransfer;
    if (transfer && transfer.status !== 'running') return transfer;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Timeout waiting for transfer ${shipmentPath}`);
}

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

  // Use the actual editor route and file control. Deliberately provide files
  // in a different order from their numbered names to verify the visible order.
  const selectedFiles = [
    { name: '03-terza.jpg', number: 3 },
    { name: '01-copertina.jpg', number: 1 },
    { name: '02-interno.jpg', number: 2 },
  ];
  const originals = new Map<number, Buffer>();
  const uploads = [];
  for (const { name, number } of selectedFiles) {
    const buffer = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: number * 50, g: 70, b: 100 } },
    }).jpeg({ quality: 95 }).toBuffer();
    originals.set(number, buffer);
    uploads.push({ name, mimeType: 'image/jpeg', buffer });
  }
  await page.evaluate(async authPath => {
    // Keep the browser Firebase stub import out of Vitest's server-side transform.
    const browserImport = new Function('url', 'return import(url)');
    const { auth } = await browserImport('/@fs' + authPath);
    auth.currentUser = { getIdToken: async () => 'isolated-admin-not-a-real-token' };
  }, fileURLToPath(new URL('../../image-studio-web/e2e/campaign-product-selection-harness/stubs/firebase.ts', import.meta.url)));
  expect(await page.getByTestId('input-upload-pages').count()).toBe(1);
  await page.getByTestId('input-upload-pages').setInputFiles(uploads);
  await browserExpect(page.getByTestId('card-page-1')).toContainText('01-copertina.jpg', { timeout: 15_000 });
  await browserExpect(page.getByTestId('card-page-2')).toContainText('02-interno.jpg');
  await browserExpect(page.getByTestId('card-page-3')).toContainText('03-terza.jpg');
  const visiblePageOrder = await page.locator('[data-testid^="card-page-"]').evaluateAll(cards =>
    cards.map(card => card.getAttribute('data-testid')),
  );
  expect(visiblePageOrder).toEqual([
    'card-page-1', 'card-page-2', 'card-page-3',
  ]);
  expect([...services.docs.keys()].filter(path => path.startsWith('photobookPages/'))).toHaveLength(3);
  expect(services.docs.get(bookPath).versions[0].pageCount).toBe(3);
  const pageDocuments = [...services.docs]
    .filter(([path]) => path.startsWith('photobookPages/'))
    .map(([, document]) => document)
    .sort((a, b) => a.pageNumber - b.pageNumber);
  expect(pageDocuments.map(({ pageNumber, fileName }) => [pageNumber, fileName])).toEqual([
    [1, '01-copertina.jpg'],
    [2, '02-interno.jpg'],
    [3, '03-terza.jpg'],
  ]);
  await page.getByTestId('button-back-to-photobooks').click();
  await browserExpect(page.getByTestId(`card-photobook-${id}`)).toBeVisible();
  const card = page.getByTestId(`card-photobook-${id}`);
  await page.getByTestId(`button-lock-${id}`).click();
  await page.getByTestId('select-shipment-lab').click();
  await page.getByRole('option', { name: 'Laboratorio isolato' }).click();
  await page.getByTestId('textarea-shipment-lab-note').fill('Carta opaca, controllo colore');
  await page.getByTestId('button-confirm-lock').click();
  await browserExpect(page.getByTestId(`button-retry-shipment-${id}`)).toBeVisible({ timeout: 15_000 });
  const shipmentId = services.docs.get(bookPath).labShipmentId;
  const shipmentPath = `labShipments/${shipmentId}`;
  const firstDriveFolder = `isolated-folder-${services.folderSequence}`;
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
  const shipmentFiles = shipment.files.filter((file: any) => file.kind === 'original');
  expect(shipmentFiles).toHaveLength(3);
  expect(new Set(shipmentFiles.map((file: any) => file.driveFileId)).size).toBe(3);
  shipmentFiles.forEach((file: any) => {
    const number = Number(file.name.match(/^pagina-(\d+)-/)[1]);
    expect(services.drive.get(driveObjectKey(firstDriveFolder, file.name))).toEqual(originals.get(number));
  });
  expect(services.emails).toHaveLength(0);
  await page.reload();
  await browserExpect(card).toBeVisible();
  await browserExpect(card).toContainText(/Email non ancora inviata/i);
  await page.getByTestId('button-send-lab-email').click();
  await browserExpect(card).toContainText('Email al laboratorio inviata.');
  expect(services.emails).toHaveLength(1);
  expect(services.emails[0][0]).toBe('lab@example.test');
  expect(services.emails[0][2]).toContain(`https://drive.invalid/${firstDriveFolder}`);
  expect(services.drive.get(driveObjectKey(firstDriveFolder, 'ISTRUZIONI-DI-STAMPA.txt'))?.toString()).toContain('Carta opaca, controllo colore');
  expect(services.docs.get(shipmentPath)).toMatchObject({ status: 'inviato', sentAt: expect.any(Object) });
  await page.reload();
  await browserExpect(card).toBeVisible();
  await browserExpect(card).toContainText('Email al laboratorio inviata.');
  expect(services.emails).toHaveLength(1);

  // Create a second standalone album through the same UI. Its source page names
  // match the first book, but its image bytes deliberately have different colors.
  const firstShipmentSnapshot = structuredClone(services.docs.get(shipmentPath));
  const firstFolderContents = new Map(
    [...services.drive.entries()].filter(([key]) => key.startsWith(`${firstDriveFolder}/`)),
  );
  const firstEmailCount = services.emails.length;
  const secondPageContents = new Map<number, Buffer>();

  await page.getByTestId('button-create-photobook').click();
  await page.getByTestId('button-photobook-mode-standalone').click();
  await page.getByTestId('input-photobook-name').fill('Secondo album autonomo integrato');
  await page.getByTestId('button-confirm-create-photobook').click();
  await browserExpect(page.getByText('Secondo album autonomo integrato', { exact: true })).toBeVisible();

  const secondBookEntry = [...services.docs].find(([path, book]) =>
    path.startsWith('photobooks/') && book.name === 'Secondo album autonomo integrato');
  expect(secondBookEntry).toBeDefined();
  const [secondBookPath, secondBook] = secondBookEntry!;
  const secondId = secondBookPath.split('/')[1];
  expect(secondBook).toMatchObject({ jobId: null, galleryId: null, currentVersion: 1 });

  const secondUploads = [];
  for (const { name, number } of selectedFiles) {
    const buffer = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 20, g: number * 60, b: 210 } },
    }).jpeg({ quality: 95 }).toBuffer();
    secondPageContents.set(number, buffer);
    secondUploads.push({ name, mimeType: 'image/jpeg', buffer });
  }
  await page.evaluate(async authPath => {
    const browserImport = new Function('url', 'return import(url)');
    const { auth } = await browserImport('/@fs' + authPath);
    auth.currentUser = { getIdToken: async () => 'isolated-admin-not-a-real-token' };
  }, fileURLToPath(new URL('../../image-studio-web/e2e/campaign-product-selection-harness/stubs/firebase.ts', import.meta.url)));
  await page.getByTestId('input-upload-pages').setInputFiles(secondUploads);
  await browserExpect(page.getByTestId('card-page-1')).toContainText('01-copertina.jpg', { timeout: 15_000 });
  await browserExpect(page.getByTestId('card-page-2')).toContainText('02-interno.jpg');
  await browserExpect(page.getByTestId('card-page-3')).toContainText('03-terza.jpg');
  const secondPageDocuments = [...services.docs]
    .filter(([path, document]) => path.startsWith('photobookPages/') && document.photobookId === secondId)
    .map(([, document]) => document)
    .sort((a, b) => a.pageNumber - b.pageNumber);
  expect(secondPageDocuments.map(({ pageNumber, fileName }) => [pageNumber, fileName])).toEqual(
    pageDocuments.map(({ pageNumber, fileName }) => [pageNumber, fileName]),
  );
  expect(secondPageContents.get(1)).not.toEqual(originals.get(1));
  await page.getByTestId('button-back-to-photobooks').click();
  const secondCard = page.getByTestId(`card-photobook-${secondId}`);
  await browserExpect(secondCard).toBeVisible();

  // Only the second shipment's page 2 fails. Both albums have identical
  // original filenames, so folder-scoped assertions detect cross-book writes.
  services.failPage = 2;
  services.failFolderId = `isolated-folder-${services.folderSequence + 1}`;
  await page.getByTestId(`button-lock-${secondId}`).click();
  await page.getByTestId('select-shipment-lab').click();
  await page.getByRole('option', { name: 'Laboratorio isolato' }).click();
  await page.getByTestId('button-confirm-lock').click();
  await browserExpect(page.getByTestId(`button-retry-shipment-${secondId}`)).toBeVisible({ timeout: 15_000 });
  const secondShipmentId = services.docs.get(secondBookPath).labShipmentId;
  const secondShipmentPath = `labShipments/${secondShipmentId}`;
  const secondFolder = `isolated-folder-${services.folderSequence}`;
  expect(secondShipmentId).not.toBe(shipmentId);
  expect(secondFolder).not.toBe(firstDriveFolder);
  expect(services.docs.get(secondShipmentPath).pageTransfer).toMatchObject({
    status: 'partial', total: 3, failed: [expect.objectContaining({ pageNumber: 2 })],
  });
  expect(services.docs.get(shipmentPath)).toEqual(firstShipmentSnapshot);
  expect(services.docs.get(bookPath).labShipmentId).toBe(shipmentId);
  expect(services.emails).toHaveLength(firstEmailCount);
  for (const [key, content] of firstFolderContents) expect(services.drive.get(key)).toEqual(content);
  await page.reload();
  const firstCardAfterRefresh = page.getByTestId(`card-photobook-${id}`);
  const secondCardAfterRefresh = page.getByTestId(`card-photobook-${secondId}`);
  await browserExpect(firstCardAfterRefresh).toBeVisible();
  await browserExpect(firstCardAfterRefresh).toContainText('Email al laboratorio inviata.');
  await browserExpect(secondCardAfterRefresh).toBeVisible();
  await browserExpect(page.getByTestId(`button-retry-shipment-${secondId}`)).toBeVisible();

  const secondRetryStart = services.uploadAttempts.length;
  services.failPage = 0;
  services.failFolderId = null;
  await page.getByTestId(`button-retry-shipment-${secondId}`).click();
  await browserExpect(secondCardAfterRefresh.getByTestId('button-send-lab-email')).toBeEnabled({ timeout: 15_000 });
  const secondShipment = services.docs.get(secondShipmentPath);
  expect(secondShipment.pageTransfer).toMatchObject({ status: 'completed', transferred: 1, skipped: 2, failed: [] });
  expect(services.uploadAttempts.slice(secondRetryStart).filter(attempt => attempt.name.startsWith('pagina-'))).toEqual([
    { folderId: secondFolder, name: expect.stringMatching(/^pagina-002-/) },
  ]);

  const firstFiles = services.docs.get(shipmentPath).files.filter((file: any) => file.kind === 'original');
  const secondFiles = secondShipment.files.filter((file: any) => file.kind === 'original');
  expect(firstFiles).toHaveLength(3);
  expect(secondFiles).toHaveLength(3);
  for (const file of firstFiles) {
    const number = Number(file.name.match(/^pagina-(\d+)-/)[1]);
    expect(services.drive.get(driveObjectKey(firstDriveFolder, file.name))).toEqual(originals.get(number));
  }
  for (const file of secondFiles) {
    const number = Number(file.name.match(/^pagina-(\d+)-/)[1]);
    expect(services.drive.get(driveObjectKey(secondFolder, file.name))).toEqual(secondPageContents.get(number));
  }
  expect(services.docs.get(shipmentPath)).toEqual(firstShipmentSnapshot);
  expect(services.docs.get(bookPath).labShipmentId).toBe(shipmentId);
  expect(services.emails).toHaveLength(firstEmailCount);

  // The first shipment was delivered successfully. The second email transport
  // now fails ambiguously; its reconciliation marker must not leak to the first.
  services.failEmailShipmentId = secondShipmentId;
  const uncertainEmail = await postIntegratedJson(`/api/lab-shipments/${secondShipmentId}/send`, {});
  expect(uncertainEmail.status).toBe(500);
  expect(uncertainEmail.json.error).toContain('Esito email simulato come incerto');
  expect(services.emails).toHaveLength(firstEmailCount);
  expect(services.docs.get(shipmentPath)).toEqual(firstShipmentSnapshot);
  expect(services.docs.get(secondShipmentPath)).toMatchObject({
    mockupDispatching: true,
    photobookDispatchUncertain: true,
    photobookDispatch: { settled: true },
  });

  await page.reload();
  const [firstAfterAmbiguousRefresh, secondAfterAmbiguousRefresh] = await Promise.all([
    getIntegratedShipment(shipmentId),
    getIntegratedShipment(secondShipmentId),
  ]);
  expect(firstAfterAmbiguousRefresh.json.photobookRecovery).toMatchObject({ dispatchAbandoned: false });
  expect(secondAfterAmbiguousRefresh.json.photobookRecovery).toMatchObject({ dispatchAbandoned: true });
  await browserExpect(firstCardAfterRefresh).toContainText('Email al laboratorio inviata.');
  await browserExpect(secondCardAfterRefresh).toContainText('Invio interrotto o con esito incerto: verifica manuale necessaria.');
  await browserExpect(secondCardAfterRefresh.getByTestId('button-send-lab-email')).toBeDisabled();
  await browserExpect(secondCardAfterRefresh.getByRole('button', { name: 'Ho verificato: email non inviata' })).toBeVisible();

  const resolvedAsNotDelivered = await postIntegratedJson(
    `/api/lab-shipments/${secondShipmentId}/resolve-photobook-send`,
    { delivered: false },
  );
  expect(resolvedAsNotDelivered.status).toBe(200);
  expect(resolvedAsNotDelivered.json).toMatchObject({
    id: secondShipmentId,
    mockupDispatching: false,
    photobookDispatchUncertain: false,
    photobookDispatch: null,
  });
  expect(services.docs.get(shipmentPath)).toEqual(firstShipmentSnapshot);
  expect(services.emails).toHaveLength(firstEmailCount);

  await page.reload();
  await browserExpect(firstCardAfterRefresh).toContainText('Email al laboratorio inviata.');
  await browserExpect(secondCardAfterRefresh).toContainText(/Email non ancora inviata/i);
  await browserExpect(secondCardAfterRefresh.getByTestId('button-send-lab-email')).toBeEnabled();
  await secondCardAfterRefresh.getByTestId('button-send-lab-email').click();
  await browserExpect(secondCardAfterRefresh).toContainText('Email al laboratorio inviata.');
  expect(services.emails).toHaveLength(firstEmailCount + 1);
  expect(services.emails[0][2]).toContain(`https://drive.invalid/${firstDriveFolder}`);
  expect(services.emails[1][2]).toContain(`https://drive.invalid/${secondFolder}`);
  expect(services.docs.get(shipmentPath)).toEqual(firstShipmentSnapshot);
  await page.reload();
  await browserExpect(firstCardAfterRefresh).toContainText('Email al laboratorio inviata.');
  await browserExpect(secondCardAfterRefresh).toContainText('Email al laboratorio inviata.');
  expect(services.docs.get(shipmentPath)).toEqual(firstShipmentSnapshot);

  // Shared CSS tries to load Google Fonts. Those requests are aborted too;
  // no Firebase, Drive or mail transport may even be attempted by the browser.
  expect([...new Set(blocked)].filter(host => host !== 'https://fonts.googleapis.com')).toEqual([]);
  expect(responses.filter(response => response.status >= 400)).toEqual([
    { path: `/api/lab-shipments/${shipmentId}/send`, status: 409 },
  ]);
  expect(responses.filter(response => response.path === `/api/photobooks/${id}/lab-shipment`).map(response => response.status)).toEqual([202, 202]);
}, 60_000);

it('due spedizioni autonome sovrapposte isolano cartelle, retry, email e stato', async () => {
  resetIntegratedServices();

  const books = [
    { id: 'concurrent-book-a', name: 'Album concorrente A', color: { r: 190, g: 35, b: 55 } },
    { id: 'concurrent-book-b', name: 'Album concorrente B', color: { r: 25, g: 145, b: 210 } },
  ];
  const originalNames = ['01-copertina.jpg', '02-interno.jpg', '03-terza.jpg'];
  const originals = new Map<string, Map<number, Buffer>>();
  for (const book of books) {
    services.docs.set(`photobooks/${book.id}`, {
      name: book.name,
      jobId: null,
      galleryId: null,
      currentVersion: 1,
      versions: [{ version: 1, pageCount: originalNames.length }],
    });
    const bookOriginals = new Map<number, Buffer>();
    for (const [index, name] of originalNames.entries()) {
      const pageNumber = index + 1;
      const storagePath = `photobooks/${book.id}/v1/${name}`;
      const buffer = await sharp({
        create: {
          width: 600,
          height: 400,
          channels: 3,
          background: {
            r: (book.color.r + pageNumber * 11) % 255,
            g: (book.color.g + pageNumber * 17) % 255,
            b: (book.color.b + pageNumber * 23) % 255,
          },
        },
      }).jpeg({ quality: 95 }).toBuffer();
      bookOriginals.set(pageNumber, buffer);
      services.objects.set(storagePath, buffer);
      services.docs.set(`photobookPages/${book.id}-page-${pageNumber}`, {
        photobookId: book.id,
        version: 1,
        pageNumber,
        fileName: name,
        storagePath,
      });
    }
    originals.set(book.id, bookOriginals);
  }

  expect(originals.get(books[0].id)?.get(1)).not.toEqual(originals.get(books[1].id)?.get(1));
  for (const book of books) {
    const uploadedOriginalNames = [...services.docs]
      .filter(([path, page]) => path.startsWith('photobookPages/') && page.photobookId === book.id)
      .map(([, page]) => page.fileName)
      .sort();
    expect(uploadedOriginalNames).toEqual([...originalNames].sort());
  }
  const initialFolders = ['isolated-folder-1', 'isolated-folder-2'];
  const initialGate = createUploadGate(initialFolders);
  services.beforeUpload = initialGate.beforeUpload;

  const [firstStart, secondStart] = await Promise.all(books.map(book =>
    postIntegratedJson(`/api/photobooks/${book.id}/lab-shipment`, {
      labId: 'lab-fixture',
      lockPhotobook: true,
      labNote: `Istruzioni per ${book.name}`,
    }),
  ));
  expect([firstStart.status, secondStart.status]).toEqual([202, 202]);
  const startedShipments = [firstStart.json.shipment, secondStart.json.shipment];
  const shipmentIds = startedShipments.map(shipment => shipment.id);
  const shipmentPaths = shipmentIds.map(id => `labShipments/${id}`);
  const shipmentFolders = shipmentPaths.map(path => services.docs.get(path).driveFolderId);
  expect(new Set(shipmentIds).size).toBe(2);
  expect(new Set(shipmentFolders)).toEqual(new Set(initialFolders));

  await waitForSignal(initialGate.reached, 'both first-page uploads to enter Drive');
  const [firstRunning, secondRunning] = await Promise.all(shipmentIds.map(getIntegratedShipment));
  expect([firstRunning.status, secondRunning.status]).toEqual([200, 200]);
  expect(firstRunning.json.pageTransfer).toMatchObject({ status: 'running', total: 3 });
  expect(secondRunning.json.pageTransfer).toMatchObject({ status: 'running', total: 3 });
  expect(services.docs.get(`photobooks/${books[0].id}`)).toMatchObject({
    jobId: null, galleryId: null, locked: true, labShipmentId: shipmentIds[0],
  });
  expect(services.docs.get(`photobooks/${books[1].id}`)).toMatchObject({
    jobId: null, galleryId: null, locked: true, labShipmentId: shipmentIds[1],
  });
  expect(services.uploadAttempts).toEqual(expect.arrayContaining([
    { folderId: shipmentFolders[0], name: expect.stringMatching(/^pagina-001-/) },
    { folderId: shipmentFolders[1], name: expect.stringMatching(/^pagina-001-/) },
  ]));
  expect(services.emails).toHaveLength(0);

  services.failPage = 2;
  services.failFolderId = initialFolders[0];
  initialGate.release();
  const [firstPartial, secondCompleted] = await Promise.all(
    shipmentPaths.map(path => waitForIntegratedTransfer(path)),
  );
  expect(firstPartial).toMatchObject({
    status: 'partial', total: 3, transferred: 2, failed: [expect.objectContaining({ pageNumber: 2 })],
  });
  expect(secondCompleted).toMatchObject({ status: 'completed', total: 3, transferred: 3, failed: [] });

  const [firstShipment, secondShipment] = shipmentPaths.map(path => services.docs.get(path));
  expect(firstShipment.driveFolderId).toBe(shipmentFolders[0]);
  expect(secondShipment.driveFolderId).toBe(shipmentFolders[1]);
  expect(firstShipment.shareableLink).toContain(shipmentFolders[0]);
  expect(secondShipment.shareableLink).toContain(shipmentFolders[1]);
  expect(firstShipment.files.filter((file: any) => file.kind === 'original')).toHaveLength(2);
  expect(secondShipment.files.filter((file: any) => file.kind === 'original')).toHaveLength(3);
  for (const [index, book] of books.entries()) {
    const folder = shipmentFolders[index];
    for (const file of services.docs.get(shipmentPaths[index]).files.filter((entry: any) => entry.kind === 'original')) {
      const pageNumber = Number(file.name.match(/^pagina-(\d+)-/)[1]);
      expect(services.drive.get(driveObjectKey(folder, file.name))).toEqual(originals.get(book.id)?.get(pageNumber));
    }
  }
  expect([...services.drive.keys()].every(key =>
    initialFolders.some(folder => key.startsWith(`${folder}/`)),
  )).toBe(true);

  // Retry A while holding its missing page in Drive; B must remain complete
  // and can send its own folder link without altering A's in-progress state.
  services.failPage = 0;
  services.failFolderId = null;
  const retryGate = createUploadGate([shipmentFolders[0]]);
  services.beforeUpload = retryGate.beforeUpload;
  const retryStartIndex = services.uploadAttempts.length;
  const retryStart = await postIntegratedJson(`/api/photobooks/${books[0].id}/lab-shipment`, {
    labId: 'lab-fixture',
    lockPhotobook: true,
  });
  expect(retryStart.status).toBe(202);
  expect(retryStart.json.shipment.id).toBe(shipmentIds[0]);
  await waitForSignal(retryGate.reached, 'first shipment retry upload');

  const [firstRetryRunning, secondStillCompleted] = await Promise.all(shipmentIds.map(getIntegratedShipment));
  expect(firstRetryRunning.json.pageTransfer.status).toBe('running');
  expect(secondStillCompleted.json.pageTransfer.status).toBe('completed');
  expect(services.uploadAttempts.slice(retryStartIndex)).toEqual([
    { folderId: shipmentFolders[0], name: expect.stringMatching(/^pagina-002-/) },
  ]);

  const secondEmail = await postIntegratedJson(`/api/lab-shipments/${shipmentIds[1]}/send`, {});
  expect(secondEmail.status).toBe(200);
  expect(secondEmail.json).toMatchObject({ id: shipmentIds[1], status: 'inviato' });
  expect(services.docs.get(shipmentPaths[0]).pageTransfer.status).toBe('running');
  expect(services.docs.get(shipmentPaths[1])).toMatchObject({ status: 'inviato', driveFolderId: shipmentFolders[1] });
  expect(services.emails).toHaveLength(1);
  expect(services.emails[0][2]).toContain(`https://drive.invalid/${shipmentFolders[1]}`);
  expect(services.emails[0][2]).not.toContain(`https://drive.invalid/${shipmentFolders[0]}`);

  retryGate.release();
  const firstCompleted = await waitForIntegratedTransfer(shipmentPaths[0]);
  expect(firstCompleted).toMatchObject({ status: 'completed', transferred: 1, skipped: 2, failed: [] });
  expect(services.docs.get(shipmentPaths[0]).files.filter((file: any) => file.kind === 'original')).toHaveLength(3);
  for (const [index, book] of books.entries()) {
    const folder = initialFolders[index];
    for (const file of services.docs.get(shipmentPaths[index]).files.filter((entry: any) => entry.kind === 'original')) {
      const pageNumber = Number(file.name.match(/^pagina-(\d+)-/)[1]);
      expect(services.drive.get(driveObjectKey(folder, file.name))).toEqual(originals.get(book.id)?.get(pageNumber));
    }
  }

  services.beforeUpload = null;
  const firstEmail = await postIntegratedJson(`/api/lab-shipments/${shipmentIds[0]}/send`, {});
  expect(firstEmail.status).toBe(200);
  expect(firstEmail.json).toMatchObject({ id: shipmentIds[0], status: 'inviato' });
  expect(services.emails).toHaveLength(2);
  expect(services.emails[1][2]).toContain(`https://drive.invalid/${shipmentFolders[0]}`);
  expect(services.emails[1][2]).not.toContain(`https://drive.invalid/${shipmentFolders[1]}`);
  expect(services.docs.get(shipmentPaths[0])).toMatchObject({
    status: 'inviato', driveFolderId: shipmentFolders[0], pageTransfer: { status: 'completed' },
  });
  expect(services.docs.get(shipmentPaths[1])).toMatchObject({
    status: 'inviato', driveFolderId: shipmentFolders[1], pageTransfer: { status: 'completed' },
  });
}, 60_000);
