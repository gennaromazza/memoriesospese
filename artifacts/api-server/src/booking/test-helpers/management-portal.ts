import express from 'express';
import type { AddressInfo } from 'node:net';
import { Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { reservationDb } from './reservation-db.js';
import { bookingManagementRouter } from '../management-routes.js';
import { preparePaidBookingConfirmation } from '../confirmation-email.js';
import { changeManagementLink } from '../management-access.js';

/** Real email builder + token issuer + HTTP router; only external services and storage are mocked. */
export async function managementPortalHarness(bookingId = 'one') {
  const store = reservationDb();
  store.seed(`bookings/${bookingId}`, { stato: 'confermata', campaignId: 'campaign',
    cliente: { nome: 'Marta', cognome: 'Test', email: 'customer@example.test' },
    dataShootingInizio: Timestamp.fromDate(new Date('2030-12-10T09:00:00Z')),
    dataShootingFine: Timestamp.fromDate(new Date('2030-12-10T09:30:00Z')),
    prodottoNome: 'Pacchetto test', noteAdmin: 'never-public-internal-note',
    depositPayment: { status: 'paid', provider: 'paypal', amountCents: 2000, currency: 'EUR',
      paypalOrderId: 'private-provider-order', paypalCaptureId: 'private-provider-capture', paypalFeeCents: 95 },
  });
  store.seed('booking_campaigns/campaign', { nome: 'Natale test' });
  const message = await preparePaidBookingConfirmation(store.db, bookingId, store.value(`bookings/${bookingId}`));
  const url = message.html.match(/https:\/\/imagestudiofotografico\.com\/prenota\/gestisci\/[A-Za-z0-9_-]+#[a-f0-9]{64}/)![0];
  const app = express(); app.use(express.json());
  let requests = 0;
  app.use('/api/booking', (_req, _res, next) => { requests++; next(); });
  app.use('/api/booking', bookingManagementRouter(store.db,
    (_req, res) => { res.status(401).end(); }, (_req, res) => { res.status(403).end(); }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  return {
    url, store, bookingId, requests: () => requests, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    revoke: () => changeManagementLink(store.db, bookingId, { action: 'revoke', requestId: randomUUID(), expectedVersion: 1 }, 'staff'),
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
