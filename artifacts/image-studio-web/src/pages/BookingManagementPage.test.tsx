// @vitest-environment jsdom
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Router } from 'wouter';
vi.mock('../../../api-server/src/firebase-admin.js', () => {
  const db: any = { collection: () => db, doc: () => db, get: async () => ({ exists: false, docs: [] }) };
  return { db, FieldValue: { serverTimestamp: () => 'test-timestamp' } };
});
vi.mock('../../../api-server/src/email-routes.js', async original => ({
  ...await original<Record<string, unknown>>(),
  getStudioContactInfo: vi.fn(async () => ({ name: 'Studio test', email: 'studio@example.test', phone: '+390000000000', address: 'Via test' })),
  sendGmailEmail: vi.fn(() => { throw new Error('A portal read must never send an email'); }),
}));
import BookingManagementPage from './BookingManagementPage';

const nativeFetch = globalThis.fetch;
let harness: any, client: QueryClient;
let sequence = 0;
beforeEach(async () => {
  harness = undefined;
  sessionStorage.clear(); window.history.replaceState({}, '', '/');
  vi.stubEnv('SESSION_SECRET', 'portal-integration-key-not-a-real-secret');
  // Runtime import avoids including Node server implementation in the browser TypeScript project.
  const path = resolve(process.cwd(), '../api-server/src/booking/test-helpers/management-portal.ts');
  harness = await (await import(path)).managementPortalHarness(`portal-${++sequence}`);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://portal.test');
    if (!url.pathname.startsWith('/api/booking/')) throw new Error('Unexpected external request');
    return nativeFetch(harness.base + url.pathname + url.search, init);
  });
});
afterEach(async () => {
  cleanup(); client?.clear(); await harness?.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
function open(url = harness.url) {
  const parsed = new URL(url); window.history.replaceState({}, '', parsed.pathname + parsed.hash);
  return render(<QueryClientProvider client={client}><Router>
    <Route path="/prenota/gestisci/:bookingId" component={BookingManagementPage} />
  </Router></QueryClientProvider>);
}
it('opens the link from the real confirmation HTML and displays only the authorized customer projection', async () => {
  open();
  expect((await screen.findByTestId('customer-booking-status')).textContent).toBe('Prenotazione confermata');
  expect(screen.getByText('Marta Test')).toBeTruthy();
  expect(screen.getByText('Natale test')).toBeTruthy();
  expect(screen.getByText('Pacchetto test')).toBeTruthy();
  expect(screen.getByText(/10 dicembre 2030/)).toBeTruthy();
  expect(screen.getByText(/20,00/)).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/never-public|private-provider/);
  expect(window.location.hash).toBe('');
  expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
  expect(screen.getByRole('link', { name: 'Scrivi allo studio' }).getAttribute('href')).toBe('mailto:studio@example.test');
});
it('lets the same emailed link show the cancellation outcome without offering payment or unsupported actions', async () => {
  const path = `bookings/${harness.bookingId}`;
  harness.store.seed(path, { ...harness.store.value(path), stato: 'annullata' });
  open();
  expect((await screen.findByTestId('customer-booking-status')).textContent).toBe('Prenotazione annullata');
  expect(screen.getByText(/risulta annullata/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Paga|Annulla|Riprogramma/ })).toBeNull();
});
it('does not disclose customer details with a wrong bearer', async () => {
  open(harness.url.replace(/#[a-f0-9]{64}$/, '#' + 'b'.repeat(64)));
  await screen.findByTestId('management-denied');
  expect(screen.queryByText('Marta Test')).toBeNull();
  expect(screen.queryByText('Natale test')).toBeNull();
});
it('does not disclose customer details after explicit revocation', async () => {
  await harness.revoke(); open(); await screen.findByTestId('management-denied');
  expect(screen.queryByTestId('customer-booking')).toBeNull();
});
it('does not call the backend without the personal fragment or cached credential', async () => {
  open(harness.url.split('#')[0]); await screen.findByTestId('management-denied');
  await waitFor(() => expect(harness.requests()).toBe(0));
});
