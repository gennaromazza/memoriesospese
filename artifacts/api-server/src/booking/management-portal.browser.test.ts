import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
const external = vi.hoisted(() => ({ events: [] as any[] }));
vi.mock('../firebase-admin.js', async () => ({
  db: (await import('./test-helpers/reservation-db.js')).reservationDb().db,
  FieldValue: { serverTimestamp: () => 'test-timestamp' },
}));
vi.mock('../email-routes.js', async original => ({
  ...await original<typeof import('../email-routes.js')>(),
  getStudioContactInfo: vi.fn(async () => ({ name: 'Studio test', email: 'studio@example.test', phone: '+390000000000', address: 'Via test' })),
  sendGmailEmail: vi.fn(async () => undefined),
}));
vi.mock('../google-calendar.js', async original => ({
  ...await original<typeof import('../google-calendar.js')>(),
  resolveCalendarId: () => 'studio-calendar',
  getEventsWithDetailsAllCalendars: vi.fn(async () => external.events),
  updateEvent: vi.fn(async () => ({ id: 'browser-event' })),
  createEvent: vi.fn(async (_calendar: string, event: any) => ({ id: event.id })),
}));
vi.mock('../consultations/calendar-adapter.js', () => ({ getAllExistingEvents: vi.fn(async () => []) }));
import { getStudioContactInfo, sendGmailEmail } from '../email-routes.js';
import { updateEvent, createEvent } from '../google-calendar.js';
import { Timestamp } from 'firebase-admin/firestore';
import { managementPortalHarness } from './test-helpers/management-portal.js';

let browser: Browser, context: BrowserContext, page: Page;
let harness: Awaited<ReturnType<typeof managementPortalHarness>>;
const errors: string[] = [];
const origin = 'http://127.0.0.1:80';
let holdRead: (() => Promise<void>) | undefined;
let releaseRead: (() => void) | undefined;
let readCaptured = false;
// Requires the managed web workflow. Keep live-browser checks out of the default
// server unit suite; explicitly run with BOOKING_PORTAL_BROWSER_E2E=1.
describe.runIf(process.env.BOOKING_PORTAL_BROWSER_E2E === '1')('customer portal in the actual application', () => {
beforeAll(async () => {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      || (existsSync('/repl/tools/bin/chromium') ? '/repl/tools/bin/chromium' : undefined),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}, 30_000);
beforeEach(async () => {
  vi.clearAllMocks(); external.events = [];
  holdRead = undefined; releaseRead = undefined; readCaptured = false;
  errors.length = 0;
  vi.stubEnv('SESSION_SECRET', 'browser-portal-test-key-not-a-real-secret');
  vi.mocked(getStudioContactInfo).mockResolvedValue({ name: 'Studio test', email: 'studio@example.test', phone: '+390000000000', address: 'Via test', whatsapp: '' });
  harness = await managementPortalHarness();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    locale: 'it-IT', timezoneId: 'America/New_York', serviceWorkers: 'block' });
  // The real application and its assets load locally. Only its booking API is bridged
  // to the actual router backed by fake storage. No cloud/Firebase/payment request escapes.
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith('/api/booking/')) {
      const response = await fetch(harness.base + url.pathname + url.search, {
        method: request.method(), headers: { 'Content-Type': 'application/json' }, body: request.postData() || undefined,
      });
      const body = await response.text();
      if (url.pathname.endsWith('/management/access') && holdRead) {
        const hold = holdRead; holdRead = undefined; readCaptured = true; await hold();
      }
      await route.fulfill({ status: response.status, contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store' }, body }); return;
    }
    if (url.pathname.startsWith('/api/')) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Isolated browser fixture"}' }); return;
    }
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) { await route.abort(); return; }
    await route.continue();
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
});
afterEach(async () => {
  releaseRead?.();
  await context?.close(); await harness?.close(); vi.unstubAllEnvs();
});
afterAll(async () => browser?.close());
async function open(url = harness.url) {
  const link = new URL(url);
  await page.goto(origin + link.pathname + link.hash);
}
async function dismissCookies() {
  const button = page.getByRole('button', { name: 'Solo Necessari', exact: true });
  if (await button.isVisible()) await button.click();
}
it('opens the emailed link on a real phone viewport, keeps Italian time and usable contact/refresh controls', async () => {
  const root = `bookings/${harness.bookingId}`;
  harness.store.seed(root, { ...harness.store.value(root),
    prodottoNome: 'Pacchetto fotografico natalizio con galleria digitale e prodotti personalizzati per tutta la famiglia' });
  await open();
  await page.getByTestId('customer-booking-status').waitFor();
  await dismissCookies();
  expect(await page.getByTestId('customer-booking-status').textContent()).toBe('Prenotazione confermata');
  expect(await page.getByTestId('customer-booking').textContent()).toContain('10:00');
  expect(await page.getByText('Marta Test').isVisible()).toBe(true);
  expect(await page.getByRole('link', { name: 'Scrivi allo studio' }).getAttribute('href')).toBe('mailto:studio@example.test');
  expect(await page.getByRole('link', { name: 'Chiama lo studio' }).getAttribute('href')).toBe('tel:+390000000000');
  expect(new URL(page.url()).hash).toBe('');
  expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex');
  expect(await page.locator('meta[property="og:image"]').count()).toBe(1);
  expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
  const before = harness.requests();
  await page.getByRole('button', { name: 'Aggiorna i dati' }).click();
  await vi.waitFor(() => expect(harness.requests()).toBeGreaterThan(before));
  await page.getByTestId('customer-booking-status').waitFor();
  await page.screenshot({ path: '/tmp/booking-management-mobile.jpg', fullPage: true, type: 'jpeg' });
  expect(errors).toEqual([]);
}, 60_000);
it('shows a subsequent cancellation and immediately denies another refresh after revocation', async () => {
  await open(); await page.getByTestId('customer-booking-status').waitFor(); await dismissCookies();
  const root = `bookings/${harness.bookingId}`;
  harness.store.seed(root, { ...harness.store.value(root), stato: 'annullata' });
  await page.getByRole('button', { name: 'Aggiorna i dati' }).click();
  await vi.waitFor(async () => expect(await page.getByTestId('customer-booking-status').textContent()).toBe('Prenotazione annullata'));
  await harness.revoke();
  await page.getByRole('button', { name: 'Aggiorna i dati' }).click();
  await page.getByTestId('management-denied').waitFor();
  expect(await page.getByText('Marta Test').count()).toBe(0);
  expect(await page.getByTestId('customer-booking').count()).toBe(0);
  expect(errors).toEqual([]);
}, 60_000);
it('rejects a different booking ID on a desktop viewport without revealing the customer', async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(harness.url.replace(`/gestisci/${harness.bookingId}`, '/gestisci/another-booking'));
  await page.getByTestId('management-denied').waitFor();
  expect(await page.getByText('Marta Test').count()).toBe(0);
  expect(await page.getByText('Natale test', { exact: true }).count()).toBe(0);
  expect(errors).toEqual([]);
}, 60_000);
it('offers a working retry after a temporary server failure without requesting payment', async () => {
  let unavailable = true;
  // The dev app uses StrictMode: model an outage, not a single request failure
  // that could be consumed by the initial effect's duplicate read.
  vi.mocked(getStudioContactInfo).mockImplementation(async () => {
    if (unavailable) throw new Error('Temporary studio settings outage');
    return { name: 'Studio test', email: 'studio@example.test', phone: '+390000000000', address: 'Via test', whatsapp: '' };
  });
  await open();
  await page.getByRole('button', { name: 'Riprova', exact: true }).waitFor(); await dismissCookies();
  unavailable = false;
  await page.getByRole('button', { name: 'Riprova', exact: true }).click();
  await page.getByTestId('customer-booking-status').waitFor();
  expect(await page.getByTestId('customer-booking-status').textContent()).toBe('Prenotazione confermata');
  expect(await page.getByRole('button', { name: /Paga|PayPal/ }).count()).toBe(0);
  expect(errors).toEqual([]);
}, 60_000);
it('lets a customer pick a real available slot on mobile, preserves the deposit and confirms the result', async () => {
  const root = `bookings/${harness.bookingId}`;
  harness.store.seed(root, { ...harness.store.value(root), googleCalendarEventId: 'browser-event' });
  harness.store.seed('booking_campaigns/campaign', { nome: 'Natale test', attiva: true,
    dataInizio: Timestamp.fromDate(new Date('2030-12-01')), dataFine: Timestamp.fromDate(new Date('2030-12-20')),
    orarioApertura: '09:00', orarioChiusura: '18:00', durataShootingMinuti: 30 });
  await open(); await page.getByTestId('customer-booking-status').waitFor(); await dismissCookies();
  await page.getByTestId('button-open-reschedule').click();
  await page.getByTestId('input-reschedule-date').fill('2030-12-11');
  await page.getByTestId('button-find-reschedule-slots').click();
  await page.getByRole('button', { name: '10:00 – 10:30', exact: true }).click();
  expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
  await page.screenshot({ path: '/tmp/booking-reschedule-picker.jpg', fullPage: true, type: 'jpeg' });
  // A slow manual refresh must not overwrite the successful mutation with old dates.
  const delayed = new Promise<void>(resolve => { releaseRead = resolve; });
  holdRead = () => delayed;
  await page.getByRole('button', { name: 'Aggiorna i dati' }).click();
  await vi.waitFor(() => expect(readCaptured).toBe(true));
  await page.getByTestId('button-confirm-reschedule').click();
  await page.getByText('Ti abbiamo inviato la conferma con la nuova data.').waitFor();
  const oldResponse = page.waitForResponse(response => response.url().endsWith('/management/access'));
  releaseRead!(); await (await oldResponse).finished();
  await page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  expect(await page.getByTestId('customer-booking').textContent()).toContain('11 dicembre 2030');
  expect(await page.getByText('20,00 €', { exact: true }).isVisible()).toBe(true);
  expect(await page.getByTestId('button-open-reschedule').count()).toBe(0);
  expect(harness.store.value(root).depositPayment.paypalCaptureId).toBe('private-provider-capture');
  expect(updateEvent).toHaveBeenCalledTimes(1); expect(createEvent).not.toHaveBeenCalled();
  expect(sendGmailEmail).toHaveBeenCalledTimes(1);
  await page.screenshot({ path: '/tmp/booking-rescheduled-mobile.jpg', fullPage: true, type: 'jpeg' });
  await page.reload(); await page.getByTestId('customer-booking-status').waitFor();
  expect(await page.getByTestId('customer-booking').textContent()).toContain('11 dicembre 2030');
  expect(await page.getByTestId('button-open-reschedule').count()).toBe(0);
  expect(errors).toEqual([]);
}, 60_000);
it('recovers in the mobile chooser when another booking occupies the selected slot', async () => {
  harness.store.seed('booking_campaigns/campaign', { nome: 'Natale test', attiva: true,
    dataInizio: Timestamp.fromDate(new Date('2030-12-01')), dataFine: Timestamp.fromDate(new Date('2030-12-20')),
    orarioApertura: '09:00', orarioChiusura: '18:00', durataShootingMinuti: 30 });
  await open(); await page.getByTestId('customer-booking-status').waitFor(); await dismissCookies();
  await page.getByTestId('button-open-reschedule').click();
  await page.getByTestId('input-reschedule-date').fill('2030-12-11');
  await page.getByTestId('button-find-reschedule-slots').click();
  await page.getByRole('button', { name: '10:00 – 10:30', exact: true }).click();
  harness.store.seed('bookings/competing', { stato: 'confermata',
    dataShootingInizio: Timestamp.fromDate(new Date('2030-12-11T09:00:00Z')),
    dataShootingFine: Timestamp.fromDate(new Date('2030-12-11T09:30:00Z')) });
  await page.getByTestId('button-confirm-reschedule').click();
  await page.getByRole('alert').filter({ hasText: 'Questo orario non è più disponibile' }).waitFor();
  expect(harness.store.value(`bookings/${harness.bookingId}`).customerRescheduleCount).toBeUndefined();
  expect(updateEvent).not.toHaveBeenCalled(); expect(sendGmailEmail).not.toHaveBeenCalled();
  await page.getByTestId('button-find-reschedule-slots').click();
  await page.getByRole('button', { name: '11:00 – 11:30', exact: true }).click();
  expect(await page.getByRole('button', { name: '10:00 – 10:30', exact: true }).count()).toBe(0);
  await page.getByTestId('button-confirm-reschedule').click();
  await page.getByText('Ti abbiamo inviato la conferma con la nuova data.').waitFor();
  expect(harness.store.value(`bookings/${harness.bookingId}`).customerRescheduleCount).toBe(1);
  expect(errors).toEqual([]);
}, 60_000);
});
