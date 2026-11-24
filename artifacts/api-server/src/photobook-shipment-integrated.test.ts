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
import { chromium, expect as browserExpect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import { db, doc, driveObjectKey, services, Timestamp } from './test-utils/photobook-integrated-services';
import { watchPhotobookOperation } from './photobook-operation';

vi.mock('./firebase-admin.js', async () => {
  const { db, storage, FieldValue, Timestamp } = await import('./test-utils/photobook-integrated-services');
  return { db, storage, FieldValue, Timestamp };
});
vi.mock('firebase-admin/firestore', async () => {
  const { FieldValue, Timestamp } = await import('./test-utils/photobook-integrated-services');
  return { FieldValue, Timestamp };
});
vi.mock('./google-drive.js', async () => (await import('./test-utils/photobook-integrated-services')).drive);
vi.mock('./drive-request.js', async importOriginal => {
  const original = await importOriginal<typeof import('./drive-request.js')>();
  const { pageHttp } = await import('./test-utils/photobook-integrated-services');
  return { ...original, boundedDriveRequest: pageHttp.request, driveSessionRequest: pageHttp.sessionRequest };
});
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
import labs, { runLabShipmentExpiryCheck } from './lab-routes';

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

async function ensureShipmentDetailsOpen(scope: Locator) {
  const panel = await scope.getAttribute('data-testid') === 'photobook-shipment-details'
    ? scope
    : scope.getByTestId('photobook-shipment-details');
  await browserExpect(panel).toBeVisible();
  if (!(await panel.evaluate(element => (element as { open: boolean }).open))) {
    await panel.locator('summary').click();
  }
}

async function showPrintQueue(page: Page, expandShipmentDetails = true) {
  const toggle = page.getByTestId('button-toggle-archived');
  // The redesigned manager keeps locked albums in a collapsed print queue.
  await browserExpect(page.getByTestId('button-create-photobook')).toBeVisible();
  if (await toggle.count() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  if (expandShipmentDetails) {
    const panels = await page.getByTestId('photobook-shipment-details').all();
    for (const panel of panels) {
      await ensureShipmentDetailsOpen(panel);
    }
  }
}
async function reloadManager(page: Page) {
  await page.reload();
  await showPrintQueue(page);
}
async function openManager(page: Page, expandShipmentDetails = true) {
  await page.goto(origin);
  await showPrintQueue(page, expandShipmentDetails);
}

function resetIntegratedServices() {
  services.docs.clear();
  services.objects.clear();
  services.drive.clear();
  services.privateDriveFolders.clear();
  services.driveMoveAttempts.length = 0;
  services.beforeMove = null;
  services.afterMove = null;
  services.deletedDriveFolders.length = 0;
  services.driveDeleteAttempts.length = 0;
  services.failDeleteFolderId = null;
  services.uploads.length = 0;
  services.uploadAttempts.length = 0;
  services.driveFileKeys.clear();
  services.driveUpdateAttempts.length = 0;
  services.failInstructionUpdate = false;
  services.failInstructionUploadAfterCommit = false;
  services.driveFileSearchAttempts.length = 0;
  services.folderSequence = 0;
  services.emails.length = 0;
  services.failEmailShipmentId = null;
  services.beforeEmail = null;
  services.failPage = 0;
  services.failFolderId = null;
  services.beforeUpload = null;
  services.userEmail = 'gennaro.mazzacane@gmail.com';
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

function createEmailGate(shipmentIds: string[]) {
  const expectedShipmentIds = new Set(shipmentIds);
  const reachedShipmentIds = new Set<string>();
  const enteredEmails: unknown[][] = [];
  let signalReached!: () => void;
  let release!: () => void;
  const reached = new Promise<void>(resolve => { signalReached = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  return {
    reached,
    release,
    enteredEmails,
    beforeEmail: async (shipmentId: string | undefined, args: unknown[]) => {
      if (!shipmentId || !expectedShipmentIds.has(shipmentId)) return;
      reachedShipmentIds.add(shipmentId);
      enteredEmails.push(args);
      if (reachedShipmentIds.size === expectedShipmentIds.size) signalReached();
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

async function deleteIntegrated(path: string) {
  const response = await fetch(`${origin}${path}`, { method: 'DELETE' });
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

function seedOnePagePhotobook(bookId: string) {
  const oldPath = `photobooks/${bookId}/v1/originale-precedente.jpg`;
  const oldBytes = Buffer.from('originale precedente');
  services.docs.set(`photobooks/${bookId}`, {
    name: `Album ${bookId}`,
    jobId: null,
    galleryId: null,
    currentVersion: 1,
    versions: [{ version: 1, pageCount: 1 }],
  });
  services.docs.set(`photobookPages/${bookId}-page-1`, {
    photobookId: bookId,
    version: 1,
    pageNumber: 1,
    storagePath: oldPath,
  });
  services.objects.set(oldPath, oldBytes);
  return { oldPath, oldBytes };
}

function seedRemoteOriginal(photobookId: string, folderId: string, name: string) {
  const bytes = Buffer.from(`original-${photobookId}`);
  services.objects.set(`photobooks/${photobookId}/v1/pagina.jpg`, bytes);
  const key = driveObjectKey(folderId, name);
  services.drive.set(key, bytes);
  services.driveFileKeys.set(`drive-${folderId}::${name}`, key);
}

it('archivia l’originale sostituito, ripete il trasferimento senza duplicati e non invia email automaticamente', async () => {
  resetIntegratedServices();
  const bookId = 'same-version-replacement';
  const { oldPath, oldBytes } = seedOnePagePhotobook(bookId);
  const started = await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, { labId: 'lab-fixture' });
  expect(started.status).toBe(202);
  const shipmentId = started.json.shipment.id;
  const shipmentPath = `labShipments/${shipmentId}`;
  await waitForIntegratedTransfer(shipmentPath);

  const shipment = services.docs.get(shipmentPath);
  const folderId = shipment.driveFolderId;
  const oldPageFile = shipment.files.find((file: any) => file.kind === 'original');
  expect(oldPageFile).toMatchObject({ sourceStoragePath: oldPath, sourcePageNumber: 1 });
  const attachment = {
    driveFileId: 'drive-supplemental-cover',
    name: 'copertina-aggiuntiva.pdf',
    size: 6,
    kind: 'supplemental',
  };
  shipment.files.push(attachment);
  const attachmentKey = driveObjectKey(folderId, attachment.name);
  services.drive.set(attachmentKey, Buffer.from('cover'));
  services.driveFileKeys.set(attachment.driveFileId, attachmentKey);

  const currentPath = `photobooks/${bookId}/v1/originale-corrente.jpg`;
  const currentBytes = Buffer.from('originale corrente');
  services.objects.set(currentPath, currentBytes);
  services.docs.get(`photobookPages/${bookId}-page-1`).storagePath = currentPath;

  const detail = await getIntegratedShipment(shipmentId);
  expect(detail.status).toBe(200);
  expect(detail.json.obsoletePhotobookPages).toEqual([
    expect.objectContaining({ driveFileId: oldPageFile.driveFileId, name: oldPageFile.name, pageNumber: 1 }),
  ]);
  expect(detail.json.missingPhotobookPages).toEqual([
    expect.objectContaining({ pageNumber: 1, storagePath: currentPath }),
  ]);
  const blockedSend = await postIntegratedJson(`/api/lab-shipments/${shipmentId}/send`, {});
  expect(blockedSend.status).toBe(409);
  expect(services.emails).toHaveLength(0);

  const uploadsBeforeCleanup = services.uploadAttempts.length;
  const blockedRetry = await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, { labId: 'lab-fixture' });
  expect(blockedRetry.status).toBe(409);
  expect(services.uploadAttempts).toHaveLength(uploadsBeforeCleanup);

  let signalMove!: () => void;
  let releaseMove!: () => void;
  const reachedMove = new Promise<void>(resolve => { signalMove = resolve; });
  const moveReleased = new Promise<void>(resolve => { releaseMove = resolve; });
  services.beforeMove = async () => {
    signalMove();
    await moveReleased;
  };
  const archiveRequest = postIntegratedJson(
    `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`,
    { confirm: true },
  );
  await waitForSignal(reachedMove, 'obsolete page move');
  const competingArchive = await postIntegratedJson(
    `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`,
    { confirm: true },
  );
  expect(competingArchive.status).toBe(409);
  releaseMove();
  const archived = await archiveRequest;
  services.beforeMove = null;
  expect(archived.status).toBe(200);
  expect(archived.json.obsoletePhotobookPages).toEqual([]);
  expect(archived.json.missingPhotobookPages).toHaveLength(1);
  expect(services.emails).toHaveLength(0);

  const archiveFolderId = archived.json.photobookPageCleanup.archiveFolderId;
  expect(services.privateDriveFolders.has(archiveFolderId)).toBe(true);
  expect(services.drive.get(driveObjectKey(archiveFolderId, oldPageFile.name))).toEqual(oldBytes);
  expect(services.drive.get(driveObjectKey(folderId, attachment.name))).toEqual(Buffer.from('cover'));
  expect(services.docs.get(shipmentPath).files).not.toContainEqual(expect.objectContaining({ driveFileId: oldPageFile.driveFileId }));
  expect(services.docs.get(shipmentPath).files).toContainEqual(expect.objectContaining({ driveFileId: attachment.driveFileId }));

  const openedArchiveResponse = await fetch(
    `${origin}/api/lab-shipments/${shipmentId}/archived-pages/${encodeURIComponent(oldPageFile.driveFileId)}`,
  );
  expect(openedArchiveResponse.status).toBe(200);
  expect(openedArchiveResponse.headers.get('content-disposition')).toContain('inline');
  expect(Buffer.from(await openedArchiveResponse.arrayBuffer())).toEqual(oldBytes);
  const downloadedArchiveResponse = await fetch(
    `${origin}/api/lab-shipments/${shipmentId}/archived-pages/${encodeURIComponent(oldPageFile.driveFileId)}?download=true`,
  );
  expect(downloadedArchiveResponse.status).toBe(200);
  expect(downloadedArchiveResponse.headers.get('content-disposition')).toContain('attachment');
  expect(Buffer.from(await downloadedArchiveResponse.arrayBuffer())).toEqual(oldBytes);
  expect([...services.docs.keys()].filter(path => path.startsWith(`${shipmentPath}/archivedPageAccess/`))).toHaveLength(2);
  const privateFileAccessDenied = await fetch(
    `${origin}/api/lab-shipments/${shipmentId}/archived-pages/${encodeURIComponent(attachment.driveFileId)}`,
  );
  expect(privateFileAccessDenied.status).toBe(404);
  services.userEmail = 'lab@example.test';
  const nonAdminAccessDenied = await fetch(
    `${origin}/api/lab-shipments/${shipmentId}/archived-pages/${encodeURIComponent(oldPageFile.driveFileId)}`,
  );
  expect(nonAdminAccessDenied.status).toBe(403);
  services.userEmail = 'gennaro.mazzacane@gmail.com';

  const replacementTransfer = await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, { labId: 'lab-fixture' });
  expect(replacementTransfer.status).toBe(202);
  await waitForIntegratedTransfer(shipmentPath);
  const currentFile = services.docs.get(shipmentPath).files.find((file: any) => file.kind === 'original');
  expect(currentFile).toMatchObject({ name: oldPageFile.name, sourceStoragePath: currentPath });
  expect(services.drive.get(driveObjectKey(folderId, currentFile.name))).toEqual(currentBytes);
  expect(services.drive.get(driveObjectKey(archiveFolderId, oldPageFile.name))).toEqual(oldBytes);
  expect(services.docs.get(shipmentPath).files).toContainEqual(expect.objectContaining({ driveFileId: attachment.driveFileId }));

  const attemptsBeforeRetry = services.uploadAttempts.length;
  const retry = await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, { labId: 'lab-fixture' });
  expect(retry.status).toBe(202);
  await waitForIntegratedTransfer(shipmentPath);
  expect(services.docs.get(shipmentPath).pageTransfer).toMatchObject({ status: 'completed', transferred: 0, skipped: 1 });
  expect(services.uploadAttempts).toHaveLength(attemptsBeforeRetry);
  const deliveredPageFiles = [...services.drive.keys()].filter(key =>
    key.startsWith(`${folderId}/pagina-`),
  );
  expect(deliveredPageFiles).toEqual([driveObjectKey(folderId, currentFile.name)]);
  expect(services.emails).toHaveLength(0);

  const manualSend = await postIntegratedJson(`/api/lab-shipments/${shipmentId}/send`, {});
  expect(manualSend.status).toBe(200);
  expect(services.emails).toHaveLength(1);
}, 60_000);

it('recupera un’archiviazione interrotta dopo lo spostamento su Drive e aggiorna istruzioni senza inviare email', async () => {
  resetIntegratedServices();
  const bookId = 'interrupted-page-archive';
  const { oldBytes } = seedOnePagePhotobook(bookId);
  const started = await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, { labId: 'lab-fixture' });
  expect(started.status).toBe(202);
  const shipmentId = started.json.shipment.id;
  const shipmentPath = `labShipments/${shipmentId}`;
  await waitForIntegratedTransfer(shipmentPath);

  const shipment = services.docs.get(shipmentPath);
  const shipmentFolderId = shipment.driveFolderId;
  const oldPageFile = shipment.files.find((file: any) => file.kind === 'original');
  const oldPageKey = driveObjectKey(shipmentFolderId, oldPageFile.name);
  const supplemental = {
    driveFileId: 'drive-interrupted-archive-cover',
    name: 'copertina-produzione.pdf',
    size: 7,
    kind: 'supplemental',
  };
  shipment.files.push(supplemental);
  services.drive.set(driveObjectKey(shipmentFolderId, supplemental.name), Buffer.from('cover'));
  services.driveFileKeys.set(supplemental.driveFileId, driveObjectKey(shipmentFolderId, supplemental.name));

  const currentPath = `photobooks/${bookId}/v1/originale-corrente.jpg`;
  services.objects.set(currentPath, Buffer.from('originale corrente'));
  services.docs.get(`photobookPages/${bookId}-page-1`).storagePath = currentPath;
  const privateArchiveFolderId = `isolated-folder-${services.folderSequence + 1}`;

  let simulatedInterruption = true;
  services.afterMove = async () => {
    if (!simulatedInterruption) return;
    simulatedInterruption = false;
    throw new Error('Interruzione simulata dopo il trasferimento Drive');
  };
  const interrupted = await postIntegratedJson(
    `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`,
    { confirm: true },
  );
  expect(interrupted.status).toBe(503);

  const needsRecovery = services.docs.get(shipmentPath);
  expect(needsRecovery.photobookPageCleanup).toMatchObject({
    status: 'needs_review',
    instructionsUpdated: false,
  });
  expect(needsRecovery.files).toContainEqual(expect.objectContaining({ driveFileId: oldPageFile.driveFileId }));
  expect(needsRecovery.archivedPhotobookPages || []).toHaveLength(0);
  expect(services.privateDriveFolders.has(privateArchiveFolderId)).toBe(true);
  expect(services.drive.has(oldPageKey)).toBe(false);
  expect(services.drive.get(driveObjectKey(privateArchiveFolderId, oldPageFile.name))).toEqual(oldBytes);
  // The completed transfer now already has instructions. A failed archival
  // must leave that prior manifest intact, not delete it prematurely.
  expect(needsRecovery.files.some((file: any) => file.kind === 'manifest')).toBe(true);
  const blockedSend = await postIntegratedJson(`/api/lab-shipments/${shipmentId}/send`, {});
  expect(blockedSend.status).toBe(409);
  expect(blockedSend.json.error).toContain('richiede una verifica');
  expect(services.emails).toHaveLength(0);

  // Reload the real manager while the operation is still interrupted. The
  // recovery action must be clear, stay separate from email sending, and be
  // disabled while the server is processing the recovery.
  services.afterMove = null;
  const page = await context!.newPage();
  await openManager(page);
  await reloadManager(page);
  const recoveryCard = page.getByTestId(`card-photobook-${bookId}`);
  await browserExpect(recoveryCard).toBeVisible();
  await browserExpect(recoveryCard).toContainText('Archiviazione interrotta: puoi riprenderla senza inviare email.');
  const recoverButton = page.getByTestId(`button-archive-obsolete-pages-${bookId}`);
  await browserExpect(recoverButton).toHaveText(/Riprendi archiviazione interrotta/);
  await browserExpect(page.getByTestId('button-send-lab-email')).toBeDisabled();

  let signalRecovery!: () => void;
  let releaseRecovery!: () => void;
  const recoveryReached = new Promise<void>(resolve => { signalRecovery = resolve; });
  const recoveryReleased = new Promise<void>(resolve => { releaseRecovery = resolve; });
  services.beforeMove = async () => {
    signalRecovery();
    await recoveryReleased;
  };
  page.once('dialog', dialog => dialog.accept());
  await recoverButton.click();
  await waitForSignal(recoveryReached, 'browser-triggered archive recovery');
  await browserExpect(recoverButton).toBeDisabled();
  expect(services.emails).toHaveLength(0);
  releaseRecovery();
  services.beforeMove = null;
  await browserExpect(recoveryCard.getByLabel('Originali archiviati')).toBeVisible({ timeout: 15_000 });
  await browserExpect(recoverButton).toHaveCount(0);

  const finalShipment = services.docs.get(shipmentPath);
  expect(finalShipment.photobookPageCleanup).toMatchObject({
    status: 'completed',
    instructionsUpdated: true,
    archivedFileIds: [oldPageFile.driveFileId],
  });
  expect(finalShipment.files).not.toContainEqual(expect.objectContaining({ driveFileId: oldPageFile.driveFileId }));
  expect(finalShipment.archivedPhotobookPages).toContainEqual(expect.objectContaining({
    driveFileId: oldPageFile.driveFileId,
    archiveFolderId: privateArchiveFolderId,
  }));
  expect(services.drive.has(oldPageKey)).toBe(false);
  expect(services.drive.get(driveObjectKey(privateArchiveFolderId, oldPageFile.name))).toEqual(oldBytes);
  expect(services.driveMoveAttempts.filter(attempt => attempt.fileId === oldPageFile.driveFileId)).toHaveLength(2);

  const updatedManifest = finalShipment.files.find((file: any) => file.kind === 'manifest');
  expect(updatedManifest).toBeDefined();
  expect(services.driveFileKeys.get(updatedManifest.driveFileId)).toBe(driveObjectKey(shipmentFolderId, updatedManifest.name));
  const instructionText = services.drive.get(driveObjectKey(shipmentFolderId, updatedManifest.name))?.toString();
  expect(instructionText).toContain(supplemental.name);
  expect(instructionText).toContain('ISTRUZIONI DI STAMPA');
  expect(services.emails).toHaveLength(0);
  await page.close();
}, 60_000);

it('riprende dal browser un trasferimento pagine running con heartbeat scaduto senza inviare email', async () => {
  resetIntegratedServices();
  const bookId = 'abandoned-running-page-transfer';
  seedOnePagePhotobook(bookId);
  const started = await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, { labId: 'lab-fixture' });
  expect(started.status).toBe(202);
  const shipmentId = started.json.shipment.id;
  const shipmentPath = `labShipments/${shipmentId}`;
  await waitForIntegratedTransfer(shipmentPath);

  const shipment = services.docs.get(shipmentPath);
  const shipmentFolderId = shipment.driveFolderId;
  const existingPage = shipment.files.find((file: any) => file.kind === 'original');
  shipment.files = shipment.files.filter((file: any) => file.driveFileId !== existingPage.driveFileId);
  const existingPageKey = services.driveFileKeys.get(existingPage.driveFileId);
  if (existingPageKey) services.drive.delete(existingPageKey);
  services.driveFileKeys.delete(existingPage.driveFileId);

  const staleHeartbeat = Timestamp.fromDate(new Date(Date.now() - 10 * 60 * 1000));
  shipment.pageTransfer = {
    id: `abandoned-transfer-${bookId}`,
    status: 'running',
    total: 1,
    transferred: 0,
    skipped: 0,
    failed: [],
    startedAt: staleHeartbeat,
    heartbeatAt: staleHeartbeat,
  };

  const detail = await getIntegratedShipment(shipmentId);
  expect(detail.status).toBe(200);
  expect(detail.json.photobookRecovery.pageTransferAbandoned).toBe(true);

  const missingConfirmation = await postIntegratedJson(
    `/api/photobooks/${bookId}/lab-shipment`,
    { recoverAbandoned: false },
  );
  expect(missingConfirmation.status).toBe(409);
  expect(missingConfirmation.json.error).toContain('Attendi la conclusione del trasferimento');
  expect(services.docs.get(shipmentPath).pageTransfer).toMatchObject({ status: 'running' });
  expect(services.emails).toHaveLength(0);

  const page = await context!.newPage();
  const recoveryRequests: Array<{ path: string; body: any }> = [];
  const sendRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.method() !== 'POST') return;
    if (url.pathname === `/api/photobooks/${bookId}/lab-shipment`) {
      recoveryRequests.push({ path: url.pathname, body: request.postDataJSON() });
    }
    if (url.pathname === `/api/lab-shipments/${shipmentId}/send`) sendRequests.push(url.pathname);
  });
  await openManager(page);
  const recoveryCard = page.getByTestId(`card-photobook-${bookId}`);
  await browserExpect(recoveryCard).toBeVisible();
  await browserExpect(recoveryCard).toContainText('Trasferimento interrotto: è disponibile il recupero manuale.');
  const recoverButton = page.getByRole('button', { name: 'Recupera trasferimento interrotto' });
  await browserExpect(recoverButton).toBeVisible();

  let signalUpload!: () => void;
  let releaseUpload!: () => void;
  const uploadReached = new Promise<void>(resolve => { signalUpload = resolve; });
  const uploadReleased = new Promise<void>(resolve => { releaseUpload = resolve; });
  services.beforeUpload = async folderId => {
    if (folderId !== shipmentFolderId) return;
    signalUpload();
    await uploadReleased;
  };

  let signalResponse!: () => void;
  let releaseResponse!: () => void;
  let recoveryResponseStatus: number | undefined;
  const responseReached = new Promise<void>(resolve => { signalResponse = resolve; });
  const responseReleased = new Promise<void>(resolve => { releaseResponse = resolve; });
  await page.route(`**/api/photobooks/${bookId}/lab-shipment`, async route => {
    const response = await route.fetch();
    recoveryResponseStatus = response.status();
    signalResponse();
    await responseReleased;
    await route.fulfill({ response });
  });

  try {
    await browserExpect(recoverButton).toBeEnabled();
    page.once('dialog', async dialog => { await dialog.accept(); });
    await recoverButton.click();
    await waitForSignal(responseReached, 'recovery response');
    expect(recoveryResponseStatus).toBe(202);
    expect(recoveryRequests).toEqual([{
      path: `/api/photobooks/${bookId}/lab-shipment`,
      body: { recoverAbandoned: true },
    }]);
    await waitForSignal(uploadReached, 'browser-triggered abandoned page transfer');
    await browserExpect(recoverButton).toBeDisabled();
    expect(recoveryRequests).toEqual([{
      path: `/api/photobooks/${bookId}/lab-shipment`,
      body: { recoverAbandoned: true },
    }]);
    expect(services.docs.get(shipmentPath).pageTransfer).toMatchObject({ status: 'running' });
    expect(sendRequests).toEqual([]);
    expect(services.emails).toHaveLength(0);
  } finally {
    releaseResponse();
    releaseUpload();
    services.beforeUpload = null;
  }

  await waitForIntegratedTransfer(shipmentPath);
  expect(services.docs.get(shipmentPath).pageTransfer).toMatchObject({
    status: 'completed',
    transferred: 1,
    skipped: 0,
  });
  expect(services.emails).toHaveLength(0);
  expect(sendRequests).toEqual([]);
  expect([...new Set(blocked)].filter(host => host !== 'https://fonts.googleapis.com')).toEqual([]);
  await page.close();
}, 60_000);

it('recupera dal browser un’archiviazione running con heartbeat scaduto senza inviare email', async () => {
  resetIntegratedServices();
  const bookId = 'abandoned-running-page-archive';
  const { oldPath, oldBytes } = seedOnePagePhotobook(bookId);
  const started = await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, { labId: 'lab-fixture' });
  expect(started.status).toBe(202);
  const shipmentId = started.json.shipment.id;
  const shipmentPath = `labShipments/${shipmentId}`;
  await waitForIntegratedTransfer(shipmentPath);

  const shipment = services.docs.get(shipmentPath);
  const oldPageFile = shipment.files.find((file: any) => file.kind === 'original');
  const currentPath = `photobooks/${bookId}/v1/originale-corrente.jpg`;
  services.objects.set(currentPath, Buffer.from('originale corrente'));
  services.docs.get(`photobookPages/${bookId}-page-1`).storagePath = currentPath;
  const staleHeartbeat = Timestamp.fromDate(new Date(Date.now() - 10 * 60 * 1000));
  shipment.photobookPageCleanup = {
    id: `abandoned-cleanup-${bookId}`,
    status: 'running',
    startedAt: staleHeartbeat,
    heartbeatAt: staleHeartbeat,
    archiveFolderId: null,
    obsoleteFileIds: [oldPageFile.driveFileId],
    archivedFileIds: [],
    instructionsUpdated: false,
  };

  const detail = await getIntegratedShipment(shipmentId);
  expect(detail.status).toBe(200);
  expect(detail.json.photobookRecovery.pageCleanupAbandoned).toBe(true);
  expect(detail.json.obsoletePhotobookPages).toEqual([
    expect.objectContaining({ driveFileId: oldPageFile.driveFileId }),
  ]);
  const confirmationRequired = await postIntegratedJson(
    `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`,
    { confirm: true },
  );
  expect(confirmationRequired.status).toBe(409);
  expect(confirmationRequired.json.recoverable).toBe(true);
  expect(confirmationRequired.json.error).toContain('Conferma il recupero');
  expect(services.docs.get(shipmentPath).photobookPageCleanup).toMatchObject({ status: 'running' });
  expect(services.emails).toHaveLength(0);

  const page = await context!.newPage();
  const recoveryRequests: Array<{ path: string; body: any }> = [];
  const apiRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return;
    apiRequests.push(url.pathname);
    if (url.pathname === `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`) {
      recoveryRequests.push({ path: url.pathname, body: JSON.parse(request.postData() || '{}') });
    }
  });
  await openManager(page);
  const recoveryCard = page.getByTestId(`card-photobook-${bookId}`);
  await browserExpect(recoveryCard).toBeVisible();
  await browserExpect(recoveryCard).toContainText('Archiviazione interrotta: verifica la cartella privata e recupera l’operazione.');
  const recoverButton = page.getByTestId(`button-archive-obsolete-pages-${bookId}`);
  await browserExpect(recoverButton).toHaveText(/Riprendi archiviazione interrotta/);
  await browserExpect(page.getByTestId('button-send-lab-email')).toBeDisabled();

  let signalRecovery!: () => void;
  let releaseRecovery!: () => void;
  const recoveryReached = new Promise<void>(resolve => { signalRecovery = resolve; });
  const recoveryReleased = new Promise<void>(resolve => { releaseRecovery = resolve; });
  services.beforeMove = async () => {
    signalRecovery();
    await recoveryReleased;
  };
  page.once('dialog', dialog => dialog.accept());
  await recoverButton.click();
  await waitForSignal(recoveryReached, 'browser-triggered abandoned archive recovery');
  await browserExpect(recoverButton).toBeDisabled();
  expect(recoveryRequests).toContainEqual({
    path: `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`,
    body: { confirm: true, confirmSentShipment: false, recoverAbandoned: true },
  });
  expect(apiRequests).not.toContain(`/api/lab-shipments/${shipmentId}/send`);
  expect(services.emails).toHaveLength(0);

  releaseRecovery();
  services.beforeMove = null;
  await browserExpect(recoveryCard.getByLabel('Originali archiviati')).toBeVisible({ timeout: 15_000 });
  await browserExpect(recoverButton).toHaveCount(0);
  const finalShipment = services.docs.get(shipmentPath);
  expect(finalShipment.photobookPageCleanup).toMatchObject({
    status: 'completed',
    instructionsUpdated: true,
    archivedFileIds: [oldPageFile.driveFileId],
  });
  expect(finalShipment.archivedPhotobookPages).toContainEqual(expect.objectContaining({
    driveFileId: oldPageFile.driveFileId,
    archiveFolderId: finalShipment.photobookPageCleanup.archiveFolderId,
  }));
  expect(services.drive.get(driveObjectKey(finalShipment.photobookPageCleanup.archiveFolderId, oldPageFile.name))).toEqual(oldBytes);
  expect(apiRequests).not.toContain(`/api/lab-shipments/${shipmentId}/send`);
  expect(services.emails).toHaveLength(0);
  await page.close();
}, 60_000);

it('rifiuta una conferma di recupero tardiva quando l’archiviazione è tornata attiva', async () => {
  resetIntegratedServices();
  const bookId = 'recovered-before-confirmation-page-archive';
  const { oldBytes } = seedOnePagePhotobook(bookId);
  const started = await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, { labId: 'lab-fixture' });
  expect(started.status).toBe(202);
  const shipmentId = started.json.shipment.id;
  const shipmentPath = `labShipments/${shipmentId}`;
  await waitForIntegratedTransfer(shipmentPath);

  const shipment = services.docs.get(shipmentPath);
  const oldPageFile = shipment.files.find((file: any) => file.kind === 'original');
  const currentPath = `photobooks/${bookId}/v1/originale-corrente.jpg`;
  services.objects.set(currentPath, Buffer.from('originale corrente'));
  services.docs.get(`photobookPages/${bookId}-page-1`).storagePath = currentPath;

  const staleHeartbeat = Timestamp.fromDate(new Date(Date.now() - 10 * 60 * 1000));
  const staleOperationId = `abandoned-cleanup-${bookId}`;
  shipment.photobookPageCleanup = {
    id: staleOperationId,
    status: 'running',
    startedAt: staleHeartbeat,
    heartbeatAt: staleHeartbeat,
    archiveFolderId: null,
    obsoleteFileIds: [oldPageFile.driveFileId],
    archivedFileIds: [],
    instructionsUpdated: false,
  };

  const promptData = await getIntegratedShipment(shipmentId);
  expect(promptData.status).toBe(200);
  expect(promptData.json.photobookRecovery.pageCleanupAbandoned).toBe(true);
  expect(promptData.json.obsoletePhotobookPages).toEqual([
    expect.objectContaining({ driveFileId: oldPageFile.driveFileId }),
  ]);

  // Model another worker resuming the existing claim after the admin saw the
  // stale-recovery prompt, but before its confirmation reaches the route.
  const resumedWorker = watchPhotobookOperation(db, doc(shipmentPath), 'photobookPageCleanup', staleOperationId);
  try {
    await resumedWorker.update();
    const liveClaim = services.docs.get(shipmentPath).photobookPageCleanup;
    expect(liveClaim.id).toBe(staleOperationId);
    const refreshedHeartbeatMs = liveClaim.heartbeatAt instanceof Date
      ? liveClaim.heartbeatAt.getTime()
      : liveClaim.heartbeatAt._seconds * 1_000;
    expect(refreshedHeartbeatMs).toBeGreaterThan(staleHeartbeat._seconds * 1_000);

    const delayedRecovery = await postIntegratedJson(
      `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`,
      { confirm: true, recoverAbandoned: true },
    );
    expect(delayedRecovery.status).toBe(409);
    expect(delayedRecovery.json.error).toContain('È già in corso');

    const unchangedShipment = services.docs.get(shipmentPath);
    expect(unchangedShipment.photobookPageCleanup).toMatchObject({
      id: staleOperationId,
      status: 'running',
      archiveFolderId: null,
      archivedFileIds: [],
    });
    expect(unchangedShipment.files).toContainEqual(expect.objectContaining({ driveFileId: oldPageFile.driveFileId }));
    expect(unchangedShipment.archivedPhotobookPages || []).toHaveLength(0);
    expect(services.drive.get(driveObjectKey(shipment.driveFolderId, oldPageFile.name))).toEqual(oldBytes);
    expect(services.driveMoveAttempts).toHaveLength(0);
    expect(services.emails).toHaveLength(0);
  } finally {
    resumedWorker.stop();
  }
}, 60_000);

it('riprende dopo il fallimento delle istruzioni senza duplicare archivio o file né inviare email prima del refresh', async () => {
  resetIntegratedServices();
  const bookId = 'interrupted-instructions-refresh';
  const { oldBytes } = seedOnePagePhotobook(bookId);
  const started = await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, { labId: 'lab-fixture' });
  expect(started.status).toBe(202);
  const shipmentId = started.json.shipment.id;
  const shipmentPath = `labShipments/${shipmentId}`;
  await waitForIntegratedTransfer(shipmentPath);

  const shipment = services.docs.get(shipmentPath);
  const shipmentFolderId = shipment.driveFolderId;
  const oldPageFile = shipment.files.find((file: any) => file.kind === 'original');
  const manifestId = `drive-${shipmentFolderId}::ISTRUZIONI-DI-STAMPA.txt`;
  const staleInstructions = Buffer.from('RIEPILOGO PRECEDENTE');
  services.docs.get(shipmentPath).files.push({
    driveFileId: manifestId,
    name: 'ISTRUZIONI-DI-STAMPA.txt',
    size: staleInstructions.length,
    kind: 'manifest',
    mimeType: 'text/plain; charset=utf-8',
  });
  services.drive.set(driveObjectKey(shipmentFolderId, 'ISTRUZIONI-DI-STAMPA.txt'), staleInstructions);
  services.driveFileKeys.set(manifestId, driveObjectKey(shipmentFolderId, 'ISTRUZIONI-DI-STAMPA.txt'));

  const currentPath = `photobooks/${bookId}/v1/originale-corrente.jpg`;
  services.objects.set(currentPath, Buffer.from('originale corrente'));
  services.docs.get(`photobookPages/${bookId}-page-1`).storagePath = currentPath;
  services.failInstructionUpdate = true;

  const interrupted = await postIntegratedJson(
    `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`,
    { confirm: true },
  );
  expect(interrupted.status).toBe(503);

  const needsRecovery = services.docs.get(shipmentPath);
  const archiveFolderId = needsRecovery.photobookPageCleanup.archiveFolderId;
  expect(needsRecovery.photobookPageCleanup).toMatchObject({
    status: 'needs_review',
    instructionsUpdated: false,
    archivedFileIds: [oldPageFile.driveFileId],
  });
  expect(needsRecovery.files).not.toContainEqual(expect.objectContaining({ driveFileId: oldPageFile.driveFileId }));
  expect(needsRecovery.files).toContainEqual(expect.objectContaining({ driveFileId: manifestId }));
  expect(needsRecovery.archivedPhotobookPages).toHaveLength(1);
  expect(services.drive.get(driveObjectKey(shipmentFolderId, oldPageFile.name))).toBeUndefined();
  expect(services.drive.get(driveObjectKey(archiveFolderId, oldPageFile.name))).toEqual(oldBytes);
  expect(services.drive.get(driveObjectKey(shipmentFolderId, 'ISTRUZIONI-DI-STAMPA.txt'))).toEqual(staleInstructions);
  expect(services.driveUpdateAttempts).toEqual([manifestId]);

  const blockedSend = await postIntegratedJson(`/api/lab-shipments/${shipmentId}/send`, {});
  expect(blockedSend.status).toBe(409);
  expect(services.emails).toHaveLength(0);

  const page = await context!.newPage();
  const recoveryRequests: Array<{ path: string; body: any }> = [];
  const retryRequests: string[] = [];
  const sendRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.method() !== 'POST') return;
    if (url.pathname === `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`) {
      recoveryRequests.push({ path: url.pathname, body: request.postDataJSON() });
    }
    if (url.pathname === `/api/photobooks/${bookId}/lab-shipment`) retryRequests.push(url.pathname);
    if (url.pathname === `/api/lab-shipments/${shipmentId}/send`) sendRequests.push(url.pathname);
  });
  await openManager(page);
  const recoveryCard = page.getByTestId(`card-photobook-${bookId}`);
  await browserExpect(recoveryCard).toBeVisible();
  await browserExpect(recoveryCard).toContainText('Archiviazione interrotta: puoi riprenderla senza inviare email.');
  const recoverButton = page.getByTestId(`button-archive-obsolete-pages-${bookId}`);
  await browserExpect(recoverButton).toHaveText(/Riprendi archiviazione interrotta/);
  await browserExpect(page.getByTestId('button-send-lab-email')).toBeDisabled();

  services.failInstructionUpdate = false;
  page.once('dialog', dialog => dialog.accept());
  await recoverButton.click();
  await browserExpect(recoveryCard.getByLabel('Originali archiviati')).toBeVisible({ timeout: 15_000 });
  await browserExpect(recoverButton).toHaveCount(0);
  await browserExpect(recoveryCard).toContainText('Trasferimento incompleto · invio email bloccato.');
  await browserExpect(page.getByTestId('button-send-lab-email')).toBeDisabled();
  const retryButton = page.getByTestId(`button-retry-shipment-${bookId}`);
  await browserExpect(retryButton).toBeVisible();
  expect(recoveryRequests).toEqual([{
    path: `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`,
    body: { confirm: true, confirmSentShipment: false, recoverAbandoned: false },
  }]);
  expect(sendRequests).toEqual([]);

  const resumed = services.docs.get(shipmentPath);
  expect(resumed.photobookPageCleanup).toMatchObject({
    status: 'completed',
    instructionsUpdated: true,
    archiveFolderId,
    archivedFileIds: [oldPageFile.driveFileId],
  });
  expect(services.driveMoveAttempts.filter(attempt => attempt.fileId === oldPageFile.driveFileId)).toHaveLength(1);
  expect(resumed.archivedPhotobookPages).toHaveLength(1);
  expect([...services.drive.keys()].filter(key => key.startsWith(`${archiveFolderId}/`))).toEqual([
    driveObjectKey(archiveFolderId, oldPageFile.name),
  ]);
  expect([...services.drive.keys()].filter(key =>
    key.startsWith(`${shipmentFolderId}/`) && key.endsWith('/ISTRUZIONI-DI-STAMPA.txt'),
  )).toHaveLength(1);
  expect(services.docs.get(shipmentPath).files.filter((file: any) => file.kind === 'manifest')).toHaveLength(1);
  expect(services.docs.get(shipmentPath).files.find((file: any) => file.kind === 'manifest').driveFileId).toBe(manifestId);
  const refreshedInstructions = services.drive.get(
    driveObjectKey(shipmentFolderId, 'ISTRUZIONI-DI-STAMPA.txt'),
  )?.toString();
  expect(refreshedInstructions).toContain('ISTRUZIONI DI STAMPA');
  expect(refreshedInstructions).not.toContain('RIEPILOGO PRECEDENTE');
  expect(services.emails).toHaveLength(0);

  await retryButton.click();
  await browserExpect(retryButton).toHaveCount(0, { timeout: 15_000 });
  const sendButton = page.getByTestId('button-send-lab-email');
  await browserExpect(sendButton).toBeEnabled({ timeout: 15_000 });
  expect(retryRequests).toEqual([`/api/photobooks/${bookId}/lab-shipment`]);
  const retransferred = services.docs.get(shipmentPath);
  const currentFile = retransferred.files.find((file: any) => file.kind === 'original');
  expect(currentFile).toMatchObject({
    name: oldPageFile.name,
    sourceStoragePath: currentPath,
  });
  expect(services.drive.get(driveObjectKey(shipmentFolderId, currentFile.name))).toEqual(
    Buffer.from('originale corrente'),
  );
  expect(services.drive.get(driveObjectKey(archiveFolderId, oldPageFile.name))).toEqual(oldBytes);
  expect([...services.drive.keys()].filter(key => key.startsWith(`${shipmentFolderId}/pagina-`))).toEqual([
    driveObjectKey(shipmentFolderId, currentFile.name),
  ]);

  const repeatedRecovery = await postIntegratedJson(
    `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`,
    { confirm: true },
  );
  expect(repeatedRecovery.status).toBe(200);
  expect(services.driveMoveAttempts.filter(attempt => attempt.fileId === oldPageFile.driveFileId)).toHaveLength(1);
  expect(services.docs.get(shipmentPath).archivedPhotobookPages).toHaveLength(1);
  expect([...services.drive.keys()].filter(key => key.startsWith(`${archiveFolderId}/`))).toHaveLength(1);
  expect([...services.drive.keys()].filter(key =>
    key.startsWith(`${shipmentFolderId}/`) && key.endsWith('/ISTRUZIONI-DI-STAMPA.txt'),
  )).toHaveLength(1);
  expect(services.docs.get(shipmentPath).files.filter((file: any) => file.kind === 'manifest')).toHaveLength(1);

  await sendButton.click();
  await browserExpect(recoveryCard).toContainText('Email al laboratorio inviata.', { timeout: 15_000 });
  expect(sendRequests).toEqual([`/api/lab-shipments/${shipmentId}/send`]);
  expect(services.emails).toHaveLength(1);
  expect(services.emails).toHaveLength(1);
  await page.close();
}, 60_000);

it('riusa le istruzioni create da Drive quando la risposta del primo upload viene persa', async () => {
  resetIntegratedServices();
  const bookId = 'lost-instruction-upload-response';
  const { oldBytes } = seedOnePagePhotobook(bookId);
  const started = await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, { labId: 'lab-fixture' });
  expect(started.status).toBe(202);
  const shipmentId = started.json.shipment.id;
  const shipmentPath = `labShipments/${shipmentId}`;
  await waitForIntegratedTransfer(shipmentPath);

  const shipment = services.docs.get(shipmentPath);
  const shipmentFolderId = shipment.driveFolderId;
  const oldPageFile = shipment.files.find((file: any) => file.kind === 'original');
  const manifestKey = driveObjectKey(shipmentFolderId, 'ISTRUZIONI-DI-STAMPA.txt');
  const manifestId = `drive-${shipmentFolderId}::ISTRUZIONI-DI-STAMPA.txt`;
  const manifestUploadsBeforeInterruption = services.uploadAttempts.filter(
    attempt => attempt.name === 'ISTRUZIONI-DI-STAMPA.txt',
  ).length;
  services.docs.get(shipmentPath).files = shipment.files.filter((file: any) => file.kind !== 'manifest');
  services.drive.delete(manifestKey);
  services.driveFileKeys.delete(manifestId);

  const currentPath = `photobooks/${bookId}/v1/originale-corrente.jpg`;
  services.objects.set(currentPath, Buffer.from('originale corrente'));
  services.docs.get(`photobookPages/${bookId}-page-1`).storagePath = currentPath;
  services.failInstructionUploadAfterCommit = true;
  services.driveFileSearchAttempts.length = 0;
  services.driveUpdateAttempts.length = 0;

  const firstAttempt = await postIntegratedJson(
    `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`,
    { confirm: true },
  );
  expect(firstAttempt.status).toBe(503);
  expect(services.drive.get(manifestKey)?.toString()).toContain('ISTRUZIONI DI STAMPA');
  expect(services.docs.get(shipmentPath).files).not.toContainEqual(
    expect.objectContaining({ name: 'ISTRUZIONI-DI-STAMPA.txt' }),
  );
  expect([...services.drive.keys()].filter(key => key === manifestKey)).toHaveLength(1);

  const retry = await postIntegratedJson(
    `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`,
    { confirm: true },
  );
  expect(retry.status).toBe(200);
  expect(services.driveFileSearchAttempts).toEqual([
    { folderId: shipmentFolderId, name: 'ISTRUZIONI-DI-STAMPA.txt' },
    { folderId: shipmentFolderId, name: 'ISTRUZIONI-DI-STAMPA.txt' },
  ]);
  expect(services.driveUpdateAttempts).toEqual([manifestId]);
  expect(services.uploadAttempts.filter(
    attempt => attempt.name === 'ISTRUZIONI-DI-STAMPA.txt',
  )).toHaveLength(manifestUploadsBeforeInterruption + 1);
  expect(services.drive.get(manifestKey)?.toString()).toContain('ISTRUZIONI DI STAMPA');
  expect(services.drive.get(driveObjectKey(shipmentFolderId, oldPageFile.name))).toBeUndefined();
  expect(services.drive.get(driveObjectKey(retry.json.photobookPageCleanup.archiveFolderId, oldPageFile.name)))
    .toEqual(oldBytes);
  expect([...services.drive.keys()].filter(key => key === manifestKey)).toHaveLength(1);
  expect(services.docs.get(shipmentPath).files.filter((file: any) => file.kind === 'manifest')).toEqual([
    expect.objectContaining({ driveFileId: manifestId, name: 'ISTRUZIONI-DI-STAMPA.txt' }),
  ]);
}, 60_000);

it('non modifica una spedizione già inviata senza consenso esplicito', async () => {
  resetIntegratedServices();
  const bookId = 'sent-replacement';
  seedOnePagePhotobook(bookId);
  const started = await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, { labId: 'lab-fixture' });
  expect(started.status).toBe(202);
  const shipmentId = started.json.shipment.id;
  const shipmentPath = `labShipments/${shipmentId}`;
  await waitForIntegratedTransfer(shipmentPath);
  const sent = await postIntegratedJson(`/api/lab-shipments/${shipmentId}/send`, {});
  expect(sent.status).toBe(200);
  const shipment = services.docs.get(shipmentPath);
  const folderId = shipment.driveFolderId;
  const oldPageFile = shipment.files.find((file: any) => file.kind === 'original');
  const currentPath = `photobooks/${bookId}/v1/originale-modificato-dopo-invio.jpg`;
  services.objects.set(currentPath, Buffer.from('nuovo originale'));
  services.docs.get(`photobookPages/${bookId}-page-1`).storagePath = currentPath;
  const fileNamesBefore = [...services.drive.keys()].sort();

  const refused = await postIntegratedJson(
    `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`,
    { confirm: true },
  );
  expect(refused.status).toBe(409);
  expect(services.drive.has(driveObjectKey(folderId, oldPageFile.name))).toBe(true);
  expect([...services.drive.keys()].sort()).toEqual(fileNamesBefore);
  expect(services.docs.get(shipmentPath).files).toContainEqual(expect.objectContaining({ driveFileId: oldPageFile.driveFileId }));

  const page = await context!.newPage();
  const archiveRequests: Array<{ path: string; body: unknown }> = [];
  const sendRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.method() !== 'POST') return;
    if (url.pathname === `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`) {
      archiveRequests.push({ path: url.pathname, body: request.postDataJSON() });
    }
    if (url.pathname === `/api/lab-shipments/${shipmentId}/send`) sendRequests.push(url.pathname);
  });
  await openManager(page);
  const card = page.getByTestId(`card-photobook-${bookId}`);
  await browserExpect(card).toBeVisible();
  await browserExpect(card).toContainText(
    'Questa spedizione è già stata inviata. L’archiviazione cambierà i file visibili nella cartella condivisa e richiede la tua autorizzazione esplicita.',
  );
  const archiveButton = page.getByTestId(`button-archive-obsolete-pages-${bookId}`);
  const originalFileKey = driveObjectKey(folderId, oldPageFile.name);

  let cancelledMessage = '';
  page.once('dialog', async dialog => {
    cancelledMessage = dialog.message();
    await dialog.dismiss();
  });
  await archiveButton.click();
  expect(cancelledMessage).toContain('La spedizione è già stata inviata.');
  expect(cancelledMessage).toContain('Non verrà inviata alcuna email.');
  expect(archiveRequests).toHaveLength(0);
  expect([...services.drive.keys()].sort()).toEqual(fileNamesBefore);
  expect(services.drive.has(originalFileKey)).toBe(true);
  expect(services.docs.get(shipmentPath).files).toContainEqual(
    expect.objectContaining({ driveFileId: oldPageFile.driveFileId }),
  );
  expect(services.emails).toHaveLength(1);

  let acceptedMessage = '';
  page.once('dialog', async dialog => {
    acceptedMessage = dialog.message();
    await dialog.accept();
  });
  await archiveButton.click();
  await browserExpect(card.getByLabel('Originali archiviati')).toBeVisible({ timeout: 15_000 });
  expect(acceptedMessage).toContain('La spedizione è già stata inviata.');
  expect(archiveRequests).toHaveLength(1);
  expect(archiveRequests[0]).toMatchObject({
    path: `/api/lab-shipments/${shipmentId}/archive-obsolete-photobook-pages`,
    body: { confirm: true, confirmSentShipment: true, recoverAbandoned: false },
  });
  expect(sendRequests).toEqual([]);
  expect(services.drive.has(originalFileKey)).toBe(false);
  const archivedShipment = services.docs.get(shipmentPath);
  const archiveFolderId = archivedShipment.photobookPageCleanup.archiveFolderId;
  expect(services.drive.get(driveObjectKey(archiveFolderId, oldPageFile.name))).toBeDefined();
  expect(archivedShipment.files).not.toContainEqual(expect.objectContaining({ driveFileId: oldPageFile.driveFileId }));
  expect(services.emails).toHaveLength(1);
  expect(archivedShipment.status).toBe('inviato');
  expect(services.docs.get(`photobookPages/${bookId}-page-1`).storagePath).toBe(currentPath);
  await page.close();
}, 60_000);

it('autonomo: crea, carica originali, prepara, ritenta solo la pagina mancante e invia email dopo refresh', async () => {
  resetIntegratedServices();
  services.failPage = 2;
  services.failFolderId = 'isolated-folder-1';
  const page = await context!.newPage();
  const responses: Array<{ path: string; status: number }> = [];
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/')) responses.push({ path: url.pathname, status: response.status() });
  });
  await openManager(page);
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
  const shipmentDetails = card.getByTestId('photobook-shipment-details');
  await browserExpect(shipmentDetails).toBeVisible({ timeout: 15_000 });
  await shipmentDetails.locator('summary').click();
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
  await reloadManager(page);
  await browserExpect(card).toBeVisible();
  await ensureShipmentDetailsOpen(card);
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
  await reloadManager(page);
  await browserExpect(card).toBeVisible();
  await browserExpect(card).toContainText(/Email non ancora inviata/i);
  const finalShipmentDetails = card.getByTestId('photobook-shipment-details');
  if (!(await finalShipmentDetails.evaluate(element => (element as { open: boolean }).open))) {
    await finalShipmentDetails.locator('summary').click();
  }
  await browserExpect(card.getByTestId('button-send-lab-email')).toBeVisible();
  await page.getByTestId('button-send-lab-email').click();
  await browserExpect(card).toContainText('Email al laboratorio inviata.');
  expect(services.emails).toHaveLength(1);
  expect(services.emails[0][0]).toBe('lab@example.test');
  expect(services.emails[0][2]).toContain(`https://drive.invalid/${firstDriveFolder}`);
  expect(services.drive.get(driveObjectKey(firstDriveFolder, 'ISTRUZIONI-DI-STAMPA.txt'))?.toString()).toContain('Carta opaca, controllo colore');
  expect(services.docs.get(shipmentPath)).toMatchObject({ status: 'inviato', sentAt: expect.any(Object) });
  await reloadManager(page);
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
  const secondArchivedCard = page
    .getByTestId('section-archived-photobooks')
    .getByTestId(`card-photobook-${secondId}`);
  await browserExpect(secondArchivedCard).toBeVisible({ timeout: 15_000 });
  await ensureShipmentDetailsOpen(secondArchivedCard);
  await browserExpect(secondArchivedCard.getByTestId(`button-retry-shipment-${secondId}`)).toBeVisible();
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
  await reloadManager(page);
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

  await reloadManager(page);
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

  await reloadManager(page);
  await browserExpect(firstCardAfterRefresh).toContainText('Email al laboratorio inviata.');
  await browserExpect(secondCardAfterRefresh).toContainText(/Email non ancora inviata/i);
  await browserExpect(secondCardAfterRefresh.getByTestId('button-send-lab-email')).toBeEnabled();
  await secondCardAfterRefresh.getByTestId('button-send-lab-email').click();
  await browserExpect(secondCardAfterRefresh).toContainText('Email al laboratorio inviata.');
  expect(services.emails).toHaveLength(firstEmailCount + 1);
  expect(services.emails[0][2]).toContain(`https://drive.invalid/${firstDriveFolder}`);
  expect(services.emails[1][2]).toContain(`https://drive.invalid/${secondFolder}`);
  expect(services.docs.get(shipmentPath)).toEqual(firstShipmentSnapshot);
  await reloadManager(page);
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

it('distingue pagine verificate da istruzioni incomplete e le recupera senza ricopiare originali', async () => {
  resetIntegratedServices();
  const bookId = 'instructions-incomplete';
  seedOnePagePhotobook(bookId);
  // Standalone books create their first instruction sheet after copying pages.
  // Fail that actual upload boundary, rather than an update that never occurs.
  services.beforeUpload = async (_folder, name) => {
    if (name === 'ISTRUZIONI-DI-STAMPA.txt') throw new Error('Creazione istruzioni simulata fallita');
  };
  const started = await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, { labId: 'lab-fixture' });
  expect(started.status).toBe(202);
  const id = started.json.shipment.id;
  const path = `labShipments/${id}`;
  const transfer = await waitForIntegratedTransfer(path);
  expect(transfer).toMatchObject({ status: 'completed', transferred: 1, instructionsError: expect.stringContaining('Pagine verificate') });
  expect((await postIntegratedJson(`/api/lab-shipments/${id}/send`, {})).status).toBe(409);
  expect(services.emails).toHaveLength(0);
  const uploads = services.uploads.filter(name => name.startsWith('pagina-')).length;
  services.beforeUpload = null;
  expect((await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, { labId: 'lab-fixture' })).status).toBe(202);
  expect(await waitForIntegratedTransfer(path)).toMatchObject({ status: 'completed', skipped: 1, transferred: 0, instructionsError: null });
  expect(services.uploads.filter(name => name.startsWith('pagina-'))).toHaveLength(uploads);
  expect(services.emails).toHaveLength(0);
});

it('12 pagine: ordine e byte dopo retry, verifica Drive al refresh e blocco email con copie mancanti o duplicate', async () => {
  resetIntegratedServices();
  const bookId = 'ordered-twelve-pages';
  services.docs.set(`photobooks/${bookId}`, {
    name: 'Album dodici pagine', currentVersion: 1, jobId: null, galleryId: null,
    versions: [{ version: 1, pageCount: 12 }],
  });
  for (let number = 12; number >= 1; number--) {
    const storagePath = `photobooks/${bookId}/v1/${13 - number}-nome-originale.jpg`;
    services.docs.set(`photobookPages/${bookId}-${number}`, {
      photobookId: bookId, version: 1, pageNumber: number,
      fileName: `${13 - number}-nome-originale.jpg`, storagePath,
    });
    services.objects.set(storagePath, Buffer.from(`original bytes for page ${number}\0`));
  }
  services.failPage = 5;
  const started = await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, { labId: 'lab-fixture' });
  expect(started.status).toBe(202);
  const id = started.json.shipment.id;
  const path = `labShipments/${id}`;
  expect((await waitForIntegratedTransfer(path)).status).toBe('partial');
  const page = await context!.newPage();
  await openManager(page);
  const card = page.getByTestId(`card-photobook-${bookId}`);
  await browserExpect(card).toBeVisible();
  await browserExpect(card.getByTestId('button-send-lab-email')).toBeDisabled();
  services.failPage = 0;
  const uploadsBefore = services.uploads.length;
  await card.getByTestId(`button-retry-shipment-${bookId}`).click();
  await browserExpect(card.getByTestId('button-send-lab-email')).toBeEnabled({ timeout: 15_000 });
  expect(services.uploads.slice(uploadsBefore).filter(name => name.startsWith('pagina-'))).toEqual([
    expect.stringMatching(/^pagina-005-/),
  ]);
  const shipment = services.docs.get(path);
  const originals = shipment.files.filter((file: any) => file.kind === 'original');
  expect(originals).toHaveLength(12);
  const ordered = [...originals].sort((a: any, b: any) => a.name.localeCompare(b.name));
  expect(ordered.map((file: any) => file.sourcePageNumber)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
  for (const file of ordered) {
    expect(services.drive.get(driveObjectKey(shipment.driveFolderId, file.name))?.equals(services.objects.get(file.sourceStoragePath)!)).toBe(true);
  }
  const instructions = services.drive.get(driveObjectKey(shipment.driveFolderId, 'ISTRUZIONI-DI-STAMPA.txt'))!.toString();
  const positions = ordered.map((file: any) => instructions.indexOf(file.name));
  expect(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1]))).toBe(true);
  await browserExpect(card).toContainText('Su Drive: ordina per Nome');

  // Preserve an unrelated production attachment through reconciliation.
  const attachmentKey = driveObjectKey(shipment.driveFolderId, 'copertina.tif');
  services.drive.set(attachmentKey, Buffer.from('cover original'));
  services.driveFileKeys.set('cover-original', attachmentKey);
  services.docs.get(path).files.push({ driveFileId: 'cover-original', name: 'copertina.tif', kind: 'supplemental' });
  const missing = ordered[4];
  services.drive.delete(driveObjectKey(shipment.driveFolderId, missing.name));
  services.driveFileKeys.delete(missing.driveFileId);
  await reloadManager(page);
  await browserExpect(card).toContainText('Pagina 5 mancante su Drive');
  await browserExpect(card.getByTestId('button-send-lab-email')).toBeDisabled();
  // The server also blocks stale browsers that bypass the disabled button.
  expect((await postIntegratedJson(`/api/lab-shipments/${id}/send`, {})).status).toBe(409);
  expect(services.emails).toHaveLength(0);
  await reloadManager(page);
  await ensureShipmentDetailsOpen(card);
  await card.getByTestId(`button-retry-shipment-${bookId}`).click();
  await browserExpect(card.getByTestId('button-send-lab-email')).toBeEnabled({ timeout: 15_000 });
  expect(services.drive.get(attachmentKey)?.toString()).toBe('cover original');
  expect(services.docs.get(path).files).toContainEqual(expect.objectContaining({ driveFileId: 'cover-original' }));

  const duplicateKey = driveObjectKey(shipment.driveFolderId, ordered[0].name);
  services.driveFileKeys.set('duplicate-copy', duplicateKey);
  await reloadManager(page);
  await browserExpect(card).toContainText('copie duplicate su Drive');
  await browserExpect(card.getByTestId('button-send-lab-email')).toBeDisabled();
  expect((await postIntegratedJson(`/api/lab-shipments/${id}/send`, {})).status).toBe(409);
  expect(services.emails).toHaveLength(0);
  expect(services.driveFileKeys.has('duplicate-copy')).toBe(true); // Never auto-delete.
  await page.close();
}, 60_000);

it('gli invii simultanei mantengono destinatario e stato senza duplicare email per la stessa spedizione', async () => {
  resetIntegratedServices();
  const shipments = [
    {
      id: 'parallel-shipment-a',
      photobookId: 'parallel-book-a',
      labId: 'lab-fixture',
      labNome: 'Laboratorio A',
      labEmail: 'lab@example.test',
      folderId: 'parallel-folder-a',
    },
    {
      id: 'parallel-shipment-b',
      photobookId: 'parallel-book-b',
      labId: 'lab-fixture-b',
      labNome: 'Laboratorio B',
      labEmail: 'lab-b@example.test',
      folderId: 'parallel-folder-b',
    },
  ];
  services.docs.set('labs/lab-fixture-b', {
    nome: 'Laboratorio B',
    email: 'lab-b@example.test',
    attivo: true,
  });

  for (const [index, shipment] of shipments.entries()) {
    const pageDocId = `${shipment.photobookId}-page-1`;
    const pageFileName = `pagina-001-${pageDocId}.jpg`;
    seedRemoteOriginal(shipment.photobookId, shipment.folderId, pageFileName);
    services.docs.set(`photobooks/${shipment.photobookId}`, {
      name: `Fotolibro ${index === 0 ? 'A' : 'B'}`,
      currentVersion: 1,
      versions: [{ version: 1, pageCount: 1 }],
    });
    services.docs.set(`photobookPages/${pageDocId}`, {
      photobookId: shipment.photobookId,
      version: 1,
      pageNumber: 1,
      storagePath: `photobooks/${shipment.photobookId}/v1/pagina.jpg`,
    });
    services.docs.set(`labShipments/${shipment.id}`, {
      sourceType: 'photobook',
      photobookId: shipment.photobookId,
      photobookVersion: 1,
      labId: shipment.labId,
      labNome: shipment.labNome,
      labEmail: shipment.labEmail,
      status: 'da_inviare',
      files: [{ driveFileId: `drive-${shipment.folderId}::${pageFileName}`, name: pageFileName, kind: 'original' }],
      pageTransfer: { status: 'completed', total: 1, transferred: 1, failed: [] },
      driveFolderId: shipment.folderId,
      shareableLink: `https://drive.invalid/${shipment.folderId}`,
      expiryDays: 30,
    });
  }

  const emailGate = createEmailGate(shipments.map(shipment => shipment.id));
  services.beforeEmail = emailGate.beforeEmail;
  const emailRequests = shipments.map(shipment =>
    postIntegratedJson(`/api/lab-shipments/${shipment.id}/send`, {}),
  );

  try {
    await waitForSignal(emailGate.reached, 'both shipment emails to enter the mail service');
    expect(emailGate.enteredEmails).toHaveLength(2);
    expect(emailGate.enteredEmails.map(args => args[4])).toEqual(expect.arrayContaining(
      shipments.map(shipment => expect.objectContaining({ relatedDocId: shipment.id })),
    ));

    // Keep the first delivery in flight and race a repeated request for its
    // shipment. The route must reject it before it reaches the mail provider.
    const duplicateRequest = await postIntegratedJson(`/api/lab-shipments/${shipments[0].id}/send`, {});
    expect(duplicateRequest.status).toBe(409);
    expect(services.docs.get(`labShipments/${shipments[0].id}`)).toMatchObject({
      mockupDispatching: true,
      photobookDispatchUncertain: true,
      photobookDispatch: { phase: 'email' },
      status: 'da_inviare',
    });
    expect(emailGate.enteredEmails).toHaveLength(2);

    for (const args of emailGate.enteredEmails) {
      const shipmentIndex = shipments.findIndex(shipment =>
        (args[4] as { relatedDocId: string }).relatedDocId === shipment.id,
      );
      expect(shipmentIndex).not.toBe(-1);
      expect(args[0]).toBe(shipments[shipmentIndex].labEmail);
      expect(args[2]).toContain(`href="https://drive.invalid/${shipments[shipmentIndex].folderId}"`);
      expect(args[2]).not.toContain(`https://drive.invalid/${shipments[1 - shipmentIndex].folderId}`);
    }
    expect(services.emails).toHaveLength(0);
    expect(shipments.map(shipment => services.docs.get(`labShipments/${shipment.id}`).status))
      .toEqual(['da_inviare', 'da_inviare']);
  } finally {
    emailGate.release();
  }

  const responses = await Promise.all(emailRequests);
  expect(responses.map(response => response.status)).toEqual([200, 200]);
  expect(responses.map(response => response.json)).toEqual(expect.arrayContaining(
    shipments.map(shipment => expect.objectContaining({ id: shipment.id, status: 'inviato' })),
  ));
  expect(services.emails).toHaveLength(2);
  expect(services.emails.filter(args =>
    (args[4] as { relatedDocId?: string } | undefined)?.relatedDocId === shipments[0].id,
  )).toHaveLength(1);

  for (const shipment of shipments) {
    const emailArgs = services.emails.find(args =>
      (args[4] as { relatedDocId?: string } | undefined)?.relatedDocId === shipment.id,
    );
    expect(emailArgs?.[0]).toBe(shipment.labEmail);
    expect(emailArgs?.[2]).toContain(`href="https://drive.invalid/${shipment.folderId}"`);
    expect(emailArgs?.[2]).not.toContain(`https://drive.invalid/${shipments.find(other => other.id !== shipment.id)?.folderId}`);
    expect(services.docs.get(`labShipments/${shipment.id}`)).toMatchObject({
      status: 'inviato',
      labId: shipment.labId,
      labEmail: shipment.labEmail,
      driveFolderId: shipment.folderId,
      shareableLink: `https://drive.invalid/${shipment.folderId}`,
      pageTransfer: { status: 'completed' },
      sentAt: expect.any(Object),
    });
  }
}, 60_000);

it('il fallimento di un invio email simultaneo non altera l’altra spedizione', async () => {
  resetIntegratedServices();
  const shipments = [
    {
      id: 'mixed-shipment-failed',
      photobookId: 'mixed-book-failed',
      labId: 'lab-fixture',
      labNome: 'Laboratorio non raggiungibile',
      labEmail: 'failed-lab@example.test',
      folderId: 'mixed-folder-failed',
    },
    {
      id: 'mixed-shipment-sent',
      photobookId: 'mixed-book-sent',
      labId: 'lab-fixture-sent',
      labNome: 'Laboratorio disponibile',
      labEmail: 'sent-lab@example.test',
      folderId: 'mixed-folder-sent',
    },
  ];
  services.docs.set('labs/lab-fixture', {
    nome: 'Laboratorio non raggiungibile',
    email: 'failed-lab@example.test',
    attivo: true,
  });
  services.docs.set('labs/lab-fixture-sent', {
    nome: 'Laboratorio disponibile',
    email: 'sent-lab@example.test',
    attivo: true,
  });

  for (const [index, shipment] of shipments.entries()) {
    const pageDocId = `${shipment.photobookId}-page-1`;
    const pageFileName = `pagina-001-${pageDocId}.jpg`;
    seedRemoteOriginal(shipment.photobookId, shipment.folderId, pageFileName);
    services.docs.set(`photobooks/${shipment.photobookId}`, {
      name: `Fotolibro misto ${index + 1}`,
      currentVersion: 1,
      versions: [{ version: 1, pageCount: 1 }],
    });
    services.docs.set(`photobookPages/${pageDocId}`, {
      photobookId: shipment.photobookId,
      version: 1,
      pageNumber: 1,
      storagePath: `photobooks/${shipment.photobookId}/v1/pagina.jpg`,
    });
    services.docs.set(`labShipments/${shipment.id}`, {
      sourceType: 'photobook',
      photobookId: shipment.photobookId,
      photobookVersion: 1,
      labId: shipment.labId,
      labNome: shipment.labNome,
      labEmail: shipment.labEmail,
      status: 'da_inviare',
      files: [{ driveFileId: `drive-${shipment.folderId}::${pageFileName}`, name: pageFileName, kind: 'original' }],
      pageTransfer: { status: 'completed', total: 1, transferred: 1, failed: [] },
      driveFolderId: shipment.folderId,
      shareableLink: `https://drive.invalid/${shipment.folderId}`,
      expiryDays: 30,
    });
  }

  const failedShipment = shipments[0];
  const sentShipment = shipments[1];
  services.failEmailShipmentId = failedShipment.id;
  const emailGate = createEmailGate(shipments.map(shipment => shipment.id));
  services.beforeEmail = emailGate.beforeEmail;
  const emailRequests = shipments.map(shipment =>
    postIntegratedJson(`/api/lab-shipments/${shipment.id}/send`, {}),
  );

  try {
    await waitForSignal(emailGate.reached, 'both mixed shipment emails to enter the mail service');
    expect(emailGate.enteredEmails).toHaveLength(2);
    for (const args of emailGate.enteredEmails) {
      const shipment = shipments.find(candidate =>
        (args[4] as { relatedDocId: string }).relatedDocId === candidate.id,
      );
      expect(shipment).toBeDefined();
      expect(args[0]).toBe(shipment!.labEmail);
      expect(args[2]).toContain(`href="https://drive.invalid/${shipment!.folderId}"`);
      expect(args[2]).not.toContain(`https://drive.invalid/${shipments.find(other => other.id !== shipment!.id)!.folderId}`);
    }
    expect(services.emails).toHaveLength(0);
    expect(shipments.map(shipment => services.docs.get(`labShipments/${shipment.id}`).status))
      .toEqual(['da_inviare', 'da_inviare']);
  } finally {
    emailGate.release();
  }

  const responses = await Promise.all(emailRequests);
  expect(responses.map(response => response.status)).toEqual([500, 200]);
  expect(responses[0].json.error).toContain('Esito email simulato come incerto');
  expect(responses[1].json).toMatchObject({ id: sentShipment.id, status: 'inviato' });
  expect(services.emails).toHaveLength(1);

  const sentEmail = services.emails[0];
  expect(sentEmail[0]).toBe(sentShipment.labEmail);
  expect(sentEmail[2]).toContain(`href="https://drive.invalid/${sentShipment.folderId}"`);
  expect(sentEmail[2]).not.toContain(`https://drive.invalid/${failedShipment.folderId}`);
  expect((sentEmail[4] as { relatedDocId?: string }).relatedDocId).toBe(sentShipment.id);

  expect(services.docs.get(`labShipments/${failedShipment.id}`)).toMatchObject({
    status: 'da_inviare',
    labId: failedShipment.labId,
    labEmail: failedShipment.labEmail,
    driveFolderId: failedShipment.folderId,
    shareableLink: `https://drive.invalid/${failedShipment.folderId}`,
    mockupDispatching: true,
    photobookDispatchUncertain: true,
    photobookDispatch: { phase: 'email', settled: true },
  });
  expect(services.docs.get(`labShipments/${failedShipment.id}`).sentAt).toBeUndefined();
  expect(services.docs.get(`labShipments/${sentShipment.id}`)).toMatchObject({
    status: 'inviato',
    labId: sentShipment.labId,
    labEmail: sentShipment.labEmail,
    driveFolderId: sentShipment.folderId,
    shareableLink: `https://drive.invalid/${sentShipment.folderId}`,
    pageTransfer: { status: 'completed' },
    mockupDispatching: false,
    photobookDispatchUncertain: false,
    sentAt: expect.any(Object),
  });
  expect(services.docs.get(`labShipments/${sentShipment.id}`).photobookDispatch).toMatchObject({ phase: 'email' });
  expect(services.docs.get(`labShipments/${sentShipment.id}`).photobookDispatch.settled).toBeUndefined();
}, 60_000);

it('eliminare una spedizione autonoma non tocca cartella, file o record dell’altra', async () => {
  resetIntegratedServices();
  const shipments = [
    { id: 'delete-shipment-a', photobookId: 'delete-book-a', folderId: 'delete-folder-a', fileName: 'pagina-a.jpg' },
    { id: 'delete-shipment-b', photobookId: 'delete-book-b', folderId: 'delete-folder-b', fileName: 'pagina-b.jpg' },
  ];

  for (const [index, shipment] of shipments.entries()) {
    const fileId = `drive-${shipment.folderId}::${shipment.fileName}`;
    const fileKey = driveObjectKey(shipment.folderId, shipment.fileName);
    const fileBytes = Buffer.from(`originale-spedizione-${index}`);
    services.docs.set(`photobooks/${shipment.photobookId}`, {
      name: `Fotolibro autonomo ${index + 1}`,
      jobId: null,
      galleryId: null,
      locked: true,
      labShipmentId: shipment.id,
    });
    services.docs.set(`labShipments/${shipment.id}`, {
      sourceType: 'photobook',
      photobookId: shipment.photobookId,
      jobId: null,
      galleryId: null,
      status: 'da_inviare',
      files: [{ driveFileId: fileId, name: shipment.fileName, kind: 'original' }],
      driveFolderId: shipment.folderId,
      shareableLink: `https://drive.invalid/${shipment.folderId}`,
    });
    services.drive.set(fileKey, fileBytes);
    services.driveFileKeys.set(fileId, fileKey);
  }

  const [deleted, preserved] = shipments;
  const preservedRecord = structuredClone(services.docs.get(`labShipments/${preserved.id}`));
  const preservedBytes = Buffer.from(services.drive.get(driveObjectKey(preserved.folderId, preserved.fileName))!);

  const response = await deleteIntegrated(`/api/lab-shipments/${deleted.id}`);

  expect(response.status).toBe(200);
  expect(response.json).toMatchObject({ success: true });
  expect(services.deletedDriveFolders).toEqual([deleted.folderId]);
  expect(services.docs.has(`labShipments/${deleted.id}`)).toBe(false);
  expect(services.drive.has(driveObjectKey(deleted.folderId, deleted.fileName))).toBe(false);
  expect(services.driveFileKeys.has(`drive-${deleted.folderId}::${deleted.fileName}`)).toBe(false);

  expect(services.docs.get(`labShipments/${preserved.id}`)).toEqual(preservedRecord);
  expect(services.docs.get(`photobooks/${preserved.photobookId}`)).toMatchObject({
    jobId: null,
    galleryId: null,
    locked: true,
    labShipmentId: preserved.id,
  });
  expect(services.drive.get(driveObjectKey(preserved.folderId, preserved.fileName))).toEqual(preservedBytes);
  expect(services.driveFileKeys.get(`drive-${preserved.folderId}::${preserved.fileName}`))
    .toBe(driveObjectKey(preserved.folderId, preserved.fileName));
  expect(services.deletedDriveFolders).not.toContain(preserved.folderId);
});

it('dopo la cancellazione scollega e sblocca il fotolibro, che può ricevere una nuova spedizione', async () => {
  resetIntegratedServices();
  const bookId = 'recreate-after-delete-book';
  const bookPath = `photobooks/${bookId}`;
  const pagePath = `photobookPages/${bookId}-page-1`;
  const storagePath = `photobooks/${bookId}/v1/copertina.jpg`;
  const pageBytes = Buffer.from('pagina originale');
  services.docs.set(bookPath, {
    name: 'Fotolibro da rispedire',
    jobId: null,
    galleryId: null,
    locked: false,
    currentVersion: 1,
    versions: [{ version: 1, pageCount: 1, status: 'draft' }],
  });
  services.docs.set(pagePath, {
    photobookId: bookId,
    version: 1,
    pageNumber: 1,
    fileName: 'copertina.jpg',
    storagePath,
  });
  services.objects.set(storagePath, pageBytes);
  const preservedShipment = {
    id: 'recreate-preserved-shipment',
    photobookId: 'recreate-preserved-book',
  };
  const preservedRecord = {
    sourceType: 'photobook',
    photobookId: preservedShipment.photobookId,
    status: 'da_inviare',
    files: [],
  };
  services.docs.set(`photobooks/${preservedShipment.photobookId}`, {
    locked: true,
    labShipmentId: preservedShipment.id,
  });
  services.docs.set(`labShipments/${preservedShipment.id}`, preservedRecord);

  const firstStart = await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, {
    labId: 'lab-fixture',
    lockPhotobook: true,
  });
  expect(firstStart.status).toBe(202);
  const firstShipmentId = firstStart.json.shipment.id;
  const firstShipmentPath = `labShipments/${firstShipmentId}`;
  await waitForIntegratedTransfer(firstShipmentPath);
  expect(services.docs.get(bookPath)).toMatchObject({
    locked: true,
    labShipmentId: firstShipmentId,
  });

  const deleted = await deleteIntegrated(`/api/lab-shipments/${firstShipmentId}`);
  expect(deleted.status).toBe(200);
  expect(services.docs.has(firstShipmentPath)).toBe(false);
  expect(services.docs.get(bookPath)).toMatchObject({
    locked: false,
    labShipmentId: null,
  });
  expect(services.docs.get(`labShipments/${preservedShipment.id}`)).toEqual(preservedRecord);
  expect(services.docs.get(`photobooks/${preservedShipment.photobookId}`)).toEqual({
    locked: true,
    labShipmentId: preservedShipment.id,
  });

  const secondStart = await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, {
    labId: 'lab-fixture',
    lockPhotobook: true,
  });
  expect(secondStart.status).toBe(202);
  const secondShipmentId = secondStart.json.shipment.id;
  expect(secondShipmentId).not.toBe(firstShipmentId);
  await waitForIntegratedTransfer(`labShipments/${secondShipmentId}`);
  expect(services.docs.get(bookPath)).toMatchObject({
    locked: true,
    labShipmentId: secondShipmentId,
  });
  expect(services.docs.has(firstShipmentPath)).toBe(false);
  expect(services.docs.get(`labShipments/${preservedShipment.id}`)).toEqual(preservedRecord);
  expect(services.docs.get(`photobooks/${preservedShipment.photobookId}`)).toEqual({
    locked: true,
    labShipmentId: preservedShipment.id,
  });
});

it('mantiene la spedizione e i riferimenti se Drive non elimina la cartella, poi consente il retry', async () => {
  resetIntegratedServices();
  const shipment = {
    id: 'delete-retry-shipment',
    photobookId: 'delete-retry-book',
    folderId: 'delete-retry-folder',
    fileName: 'pagina-originale.jpg',
  };
  const fileId = `drive-${shipment.folderId}::${shipment.fileName}`;
  const fileKey = driveObjectKey(shipment.folderId, shipment.fileName);
  const fileBytes = Buffer.from('contenuto originale della pagina');
  services.docs.set(`photobooks/${shipment.photobookId}`, {
    name: 'Fotolibro autonomo per retry',
    jobId: null,
    galleryId: null,
    locked: true,
    labShipmentId: shipment.id,
  });
  const originalRecord = {
    sourceType: 'photobook',
    photobookId: shipment.photobookId,
    jobId: null,
    galleryId: null,
    status: 'da_inviare',
    files: [{ driveFileId: fileId, name: shipment.fileName, kind: 'original' }],
    driveFolderId: shipment.folderId,
    shareableLink: `https://drive.invalid/${shipment.folderId}`,
  };
  services.docs.set(`labShipments/${shipment.id}`, originalRecord);
  services.drive.set(fileKey, fileBytes);
  services.driveFileKeys.set(fileId, fileKey);
  services.failDeleteFolderId = shipment.folderId;

  const failedResponse = await deleteIntegrated(`/api/lab-shipments/${shipment.id}`);

  expect(failedResponse.status).toBe(503);
  expect(failedResponse.json).toMatchObject({ code: 'drive_delete_failed' });
  expect(services.driveDeleteAttempts).toEqual([shipment.folderId]);
  expect(services.deletedDriveFolders).toEqual([]);
  expect(services.docs.get(`labShipments/${shipment.id}`)).toMatchObject({
    ...originalRecord,
    deleteLastError: 'Eliminazione cartella Drive simulata fallita',
    deleteLastAttemptAt: expect.any(Object),
    updatedAt: expect.any(Object),
  });
  expect(services.docs.has(`labShipments/${shipment.id}`)).toBe(true);
  expect(services.docs.get(`labShipments/${shipment.id}`).driveFolderId).toBe(shipment.folderId);
  expect(services.docs.get(`labShipments/${shipment.id}`).shareableLink)
    .toBe(`https://drive.invalid/${shipment.folderId}`);
  expect(services.docs.get(`photobooks/${shipment.photobookId}`).labShipmentId).toBe(shipment.id);
  expect(services.drive.get(fileKey)).toEqual(fileBytes);
  expect(services.driveFileKeys.get(fileId)).toBe(fileKey);

  services.failDeleteFolderId = null;
  const retryResponse = await deleteIntegrated(`/api/lab-shipments/${shipment.id}`);

  expect(retryResponse.status).toBe(200);
  expect(retryResponse.json).toMatchObject({ success: true });
  expect(services.driveDeleteAttempts).toEqual([shipment.folderId, shipment.folderId]);
  expect(services.deletedDriveFolders).toEqual([shipment.folderId]);
  expect(services.docs.has(`labShipments/${shipment.id}`)).toBe(false);
  expect(services.drive.has(fileKey)).toBe(false);
  expect(services.driveFileKeys.has(fileId)).toBe(false);
});

it('lascia ritentabile la pulizia automatica se Drive fallisce e marca la scadenza solo dopo il retry riuscito', async () => {
  resetIntegratedServices();
  const shipment = {
    id: 'expiry-retry-shipment',
    photobookId: 'expiry-retry-book',
    folderId: 'expiry-retry-folder',
    fileName: 'pagina-da-conservare.jpg',
  };
  const fileId = `drive-${shipment.folderId}::${shipment.fileName}`;
  const fileKey = driveObjectKey(shipment.folderId, shipment.fileName);
  const fileBytes = Buffer.from('pagina ancora presente su Drive');
  services.docs.set(`photobooks/${shipment.photobookId}`, {
    name: 'Fotolibro da conservare durante il retry',
    jobId: null,
    galleryId: null,
    locked: true,
    labShipmentId: shipment.id,
  });
  services.docs.set(`labShipments/${shipment.id}`, {
    sourceType: 'photobook',
    photobookId: shipment.photobookId,
    jobId: null,
    galleryId: null,
    status: 'inviato',
    files: [{ driveFileId: fileId, name: shipment.fileName, kind: 'original' }],
    driveFolderId: shipment.folderId,
    shareableLink: `https://drive.invalid/${shipment.folderId}`,
    expiresAt: Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
  });
  services.drive.set(fileKey, fileBytes);
  services.driveFileKeys.set(fileId, fileKey);
  services.failDeleteFolderId = shipment.folderId;

  const failedCheck = await runLabShipmentExpiryCheck();

  expect(failedCheck).toEqual({ expired: 0 });
  expect(services.driveDeleteAttempts).toEqual([shipment.folderId]);
  expect(services.deletedDriveFolders).toEqual([]);
  expect(services.docs.get(`labShipments/${shipment.id}`)).toMatchObject({
    status: 'inviato',
    driveFolderId: shipment.folderId,
    shareableLink: `https://drive.invalid/${shipment.folderId}`,
    expiryDeletionLastAttemptAt: expect.any(Object),
    expiryDeletionLastError: 'Eliminazione cartella Drive simulata fallita',
  });
  expect(services.docs.get(`labShipments/${shipment.id}`).deletedFromDrive).toBeUndefined();
  expect(services.drive.get(fileKey)).toEqual(fileBytes);
  expect(services.driveFileKeys.get(fileId)).toBe(fileKey);

  services.failDeleteFolderId = null;
  const successfulRetry = await runLabShipmentExpiryCheck();

  expect(successfulRetry).toEqual({ expired: 1 });
  expect(services.driveDeleteAttempts).toEqual([shipment.folderId, shipment.folderId]);
  expect(services.deletedDriveFolders).toEqual([shipment.folderId]);
  expect(services.docs.get(`labShipments/${shipment.id}`)).toMatchObject({
    status: 'scaduto',
    deletedFromDrive: true,
    driveFolderId: shipment.folderId,
    shareableLink: `https://drive.invalid/${shipment.folderId}`,
  });
  expect(services.docs.get(`labShipments/${shipment.id}`).expiryDeletionLastError).toBeUndefined();
  expect(services.drive.has(fileKey)).toBe(false);
  expect(services.driveFileKeys.has(fileId)).toBe(false);
});

it('restituisce 503 e consente il retry per spedizioni di un lavoro e di un ordine walk-in', async () => {
  resetIntegratedServices();
  const shipments = [
    {
      id: 'job-delete-retry-shipment',
      sourceType: 'job',
      jobId: 'job-delete-retry',
      folderId: 'job-delete-retry-folder',
    },
    {
      id: 'walk-in-delete-retry-shipment',
      sourceType: 'walk_in',
      orderId: 'walk-in-delete-retry-order',
      folderId: 'walk-in-delete-retry-folder',
    },
  ];

  for (const shipment of shipments) {
    const record = {
      sourceType: shipment.sourceType,
      jobId: 'jobId' in shipment ? shipment.jobId : null,
      orderId: 'orderId' in shipment ? shipment.orderId : null,
      driveFolderId: shipment.folderId,
      shareableLink: `https://drive.invalid/${shipment.folderId}`,
      files: [],
    };
    services.docs.set(`labShipments/${shipment.id}`, record);
    services.failDeleteFolderId = shipment.folderId;

    const failedResponse = await deleteIntegrated(`/api/lab-shipments/${shipment.id}`);

    expect(failedResponse.status).toBe(503);
    expect(failedResponse.json).toMatchObject({
      code: 'drive_delete_failed',
      error: expect.stringContaining('la spedizione è stata mantenuta e puoi riprovare'),
    });
    expect(services.docs.get(`labShipments/${shipment.id}`)).toMatchObject({
      ...record,
      deleteLastError: 'Eliminazione cartella Drive simulata fallita',
      deleteLastAttemptAt: expect.any(Object),
    });
    expect(services.docs.get(`labShipments/${shipment.id}`).driveFolderId).toBe(shipment.folderId);
    expect(services.docs.get(`labShipments/${shipment.id}`).shareableLink)
      .toBe(`https://drive.invalid/${shipment.folderId}`);

    services.failDeleteFolderId = null;
    const retryResponse = await deleteIntegrated(`/api/lab-shipments/${shipment.id}`);

    expect(retryResponse.status).toBe(200);
    expect(retryResponse.json).toMatchObject({ success: true });
    expect(services.docs.has(`labShipments/${shipment.id}`)).toBe(false);
    expect(services.deletedDriveFolders).toContain(shipment.folderId);
  }
});

it('mostra la spedizione compatta e mantiene testo e azioni nei limiti dello schermo mobile', async () => {
  resetIntegratedServices();
  const bookId = 'compact-mobile-shipment';
  seedOnePagePhotobook(bookId);
  const started = await postIntegratedJson(`/api/photobooks/${bookId}/lab-shipment`, {
    labId: 'lab-fixture',
  });
  expect(started.status).toBe(202);
  await waitForIntegratedTransfer(`labShipments/${started.json.shipment.id}`);

  const page = await context!.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await openManager(page, false);

  const card = page.getByTestId(`card-photobook-${bookId}`);
  const panel = card.getByTestId('photobook-shipment-details');
  await browserExpect(panel).toBeVisible();
  expect(await panel.evaluate(element => (element as { open: boolean }).open)).toBe(false);
  await browserExpect(panel.locator('summary')).toContainText('1/1 pagine');
  await browserExpect(panel.locator('summary')).toContainText('Pronta per invio');
  await browserExpect(card.getByTestId('button-send-lab-email')).toBeHidden();

  const summaryBox = await panel.locator('summary').boundingBox();
  expect(summaryBox?.height).toBeLessThan(90);

  await panel.locator('summary').click();
  const sendButton = card.getByTestId('button-send-lab-email');
  await browserExpect(sendButton).toBeVisible();
  await browserExpect(sendButton).toBeEnabled();
  const dimensions = await panel.evaluate(root => {
    const body = root.querySelector('.pb-shipment-panel-body') as unknown as {
      clientWidth: number;
      scrollWidth: number;
    };
    const content = root.querySelector('.pb-shipment-panel-content') as unknown as {
      getBoundingClientRect: () => { left: number; right: number };
    };
    const contentRect = content.getBoundingClientRect();
    const actionRects = [...root.querySelectorAll('.pb-shipment-actions > *')].map(node => {
      const rect = (node as unknown as {
        getBoundingClientRect: () => { left: number; right: number };
      }).getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });
    return {
      width: body.clientWidth,
      scrollWidth: body.scrollWidth,
      actionRects,
      contentLeft: contentRect.left,
      contentRight: contentRect.right,
    };
  });
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.actionRects.every(action =>
    action.left >= dimensions.contentLeft - 1 && action.right <= dimensions.contentRight + 1,
  )).toBe(true);
  await page.close();
});
