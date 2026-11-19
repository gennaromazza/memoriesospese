import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { Timestamp } from 'firebase-admin/firestore';
import { CheckoutHoldError } from './booking/checkout-hold-state.js';

const h = vi.hoisted(() => ({ booking: {} as any, reads: 0, approval: vi.fn() }));
vi.mock('./booking/approved-deposit-request.js', () => ({ approveBookingWithDeposit: h.approval }));
vi.mock('./firebase-admin.js', () => ({
  db: { collection: (name: string) => {
    if (name !== 'bookings') throw new Error('Non deve accedere a campagne, cassa o Calendar');
    return { doc: () => ({ get: async () => { h.reads++; return { exists: true, data: () => h.booking }; } }) };
  } }, FieldValue: {},
}));
vi.mock('./google-calendar.js', () => ({ getAvailableSlots: vi.fn(), deleteEvent: vi.fn(), createEvent: vi.fn(), getEventById: vi.fn(), resolveCalendarId: () => 'primary' }));
vi.mock('./email-routes.js', () => ({
  authenticateFirebase: (req: any, _res: unknown, next: () => void) => {
    req.user = { uid: 'test-admin', email: 'gennaro.mazzacane@gmail.com' }; next();
  },
}));
import router from './booking-routes.js';

const now = Date.parse('2030-12-10T08:00:00Z');
const app = express(); app.use(express.json()); app.use('/booking', router);
const server = app.listen(0), base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/booking`;
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  h.reads = 0;
  h.approval.mockReset().mockResolvedValue(null);
  h.booking = { stato: 'in_attesa', depositPaymentRequest: {
    status: 'pending', requestedAt: Timestamp.fromMillis(now - 3_600_000), expiresAt: Timestamp.fromMillis(now),
  } };
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => { server.closeAllConnections(); server.close(); });
it.each(['/v2/test/approve', '/test/approve'])('non riapprova una richiesta scaduta da %s', async path => {
  const response = await fetch(`${base}${path}`, { method: 'PATCH' });
  expect(response.status).toBe(410);
  expect((await response.json() as any).error).toContain('scaduta');
  expect(h.reads).toBe(1);
});
it.each(['/v2/test/approve', '/test/approve'])('non riapre una richiesta già scaduta da %s', async path => {
  h.booking.stato = 'annullata'; h.booking.depositPaymentRequest.status = 'expired';
  expect((await fetch(`${base}${path}`, { method: 'PATCH' })).status).toBe(410);
  expect(h.reads).toBe(1);
});
it.each(['/v2/test/approve', '/test/approve'])('non salta l’acconto riapprovando un millisecondo prima da %s', async path => {
  h.booking.depositPaymentRequest.requestedAt = Timestamp.fromMillis(now - 3_600_000 + 1);
  h.booking.depositPaymentRequest.expiresAt = Timestamp.fromMillis(now + 1);
  const response = await fetch(`${base}${path}`, { method: 'PATCH' });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: 'DEPOSIT_PAYMENT_PENDING' });
  expect(h.booking.depositPaymentRequest.expiresAt.toMillis()).toBe(now + 1);
  expect(h.reads).toBe(1);
});
it.each(['/v2/test/approve', '/test/approve'])('blocca anche una richiesta con data corrotta da %s', async path => {
  delete h.booking.depositPaymentRequest.expiresAt;
  expect((await fetch(`${base}${path}`, { method: 'PATCH' })).status).toBe(400);
  expect(h.reads).toBe(1);
});
it.each(['/v2/test/approve', '/test/approve'])('restituisce la richiesta di pagamento senza conferma finale da %s', async path => {
  h.booking.depositPaymentRequest = { status: 'pending', approvedBy: 'test-admin',
    requestedAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + 3_600_000) };
  h.approval.mockResolvedValue({ success: true, bookingId: 'test', paymentRequired: true,
    stato: 'in_attesa_pagamento', emailStatus: 'sent', amountCents: 2500, expiresAt: new Date(now + 3_600_000) });
  const response = await fetch(`${base}${path}`, { method: 'PATCH' });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ paymentRequired: true, stato: 'in_attesa_pagamento' });
  expect(h.approval).toHaveBeenCalledWith(expect.anything(), 'test', 'test-admin');
  expect(h.booking.stato).toBe('in_attesa');
  expect(h.reads).toBe(1); // no Calendar, final email, or normal-approval path
});
it('preserves a deposit service error instead of falling through to final confirmation', async () => {
  delete h.booking.depositPaymentRequest;
  h.approval.mockRejectedValue(new CheckoutHoldError(409, 'Orario occupato'));
  expect((await fetch(`${base}/v2/test/approve`, { method: 'PATCH' })).status).toBe(409);
  expect(h.booking.stato).toBe('in_attesa');
});
it.each(['confermata', 'completata'])('does not bypass payment through generic status %s', async stato => {
  const response = await fetch(`${base}/test/status`, { method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stato }) });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: 'DEPOSIT_PAYMENT_PENDING' });
  expect(h.booking.stato).toBe('in_attesa');
});
