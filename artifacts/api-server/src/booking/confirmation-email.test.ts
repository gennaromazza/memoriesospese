import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { reservationDb } from './test-helpers/reservation-db.js';
vi.mock('../google-calendar.js', async original => ({
  ...await original<typeof import('../google-calendar.js')>(),
  resolveCalendarId: () => 'fake-studio-calendar',
  getEventById: vi.fn(async () => null),
  createEvent: vi.fn(async (_calendar, event) => ({ id: event.id, description: event.description,
    start: { dateTime: event.start.toISOString() }, end: { dateTime: event.end.toISOString() } })),
}));
vi.mock('../firebase-admin.js', async () => ({
  db: (await import('./test-helpers/reservation-db.js')).reservationDb().db,
  FieldValue: { serverTimestamp: () => 'test-timestamp' },
}));
vi.mock('../email-routes.js', async original => ({
  ...await original<typeof import('../email-routes.js')>(),
  getStudioContactInfo: vi.fn(async () => ({ name: 'Studio test', email: 'studio@example.test', phone: '+390000000000', address: 'Via test', whatsapp: '' })),
  sendGmailEmail: vi.fn(async () => undefined),
}));
import { sendGmailEmail } from '../email-routes.js';
import { preparePaidBookingConfirmation } from './confirmation-email.js';
import { authorizeBookingManagement } from './management-access.js';
import { CONFIRMATION_JOBS, deliverBookingConfirmation } from './confirmation-delivery.js';

let store: ReturnType<typeof reservationDb>;
const root = () => ({ stato: 'confermata', campaignId: 'campaign', cliente: { nome: 'Cliente', cognome: 'Test', email: 'customer@example.test' },
  dataShootingInizio: Timestamp.fromDate(new Date('2030-12-10T09:00:00Z')), dataShootingFine: Timestamp.fromDate(new Date('2030-12-10T09:30:00Z')),
  depositPayment: { status: 'paid', provider: 'paypal', amountCents: 3000, currency: 'EUR', paypalCaptureId: 'capture-test', paypalOrderId: 'order-test' },
  emailConfermataInviata: false, calendarSyncPending: true });
beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'confirmation-test-key-not-a-real-secret'); vi.clearAllMocks();
  store = reservationDb(); store.seed('bookings/one', root()); store.seed('booking_campaigns/campaign', { nome: 'Campagna test' });
});
afterEach(() => vi.unstubAllEnvs());
it('composes the real final HTML with a usable personal link, studio contacts and automatic-email notice', async () => {
  const message = await preparePaidBookingConfirmation(store.db, 'one', root());
  expect(message.to).toBe('customer@example.test');
  expect(message.html).toContain('Visualizza la tua prenotazione');
  expect(message.html).toContain('Comunicazione automatica');
  expect(message.html).toContain('studio@example.test');
  const token = /\/prenota\/gestisci\/one#([a-f0-9]{64})/.exec(message.html)![1];
  await expect(authorizeBookingManagement(store.db, 'one', token)).resolves.toMatchObject({ bookingId: 'one' });
  expect(sendGmailEmail).not.toHaveBeenCalled();
});
it('delivers the real paid-confirmation pipeline once through a mocked Gmail boundary', async () => {
  store.seed(`${CONFIRMATION_JOBS}/one`, { status: 'pending', attempts: 0, amountCents: 3000, captureId: 'capture-test' });
  await deliverBookingConfirmation(store.db, 'one'); await deliverBookingConfirmation(store.db, 'one');
  expect(sendGmailEmail).toHaveBeenCalledOnce();
  expect(vi.mocked(sendGmailEmail).mock.calls[0][2]).toContain('/prenota/gestisci/one#');
  expect(store.value('bookings/one')).toMatchObject({ emailConfermataInviata: true, calendarSyncPending: false,
    googleCalendarId: 'fake-studio-calendar' });
});
it('does not compose a management link for a pending or unpaid request', async () => {
  const unpaid = { ...root(), depositPayment: undefined, depositPaymentRequest: { status: 'pending', currency: 'EUR', amountCents: 3000 } };
  store.seed('bookings/one', unpaid);
  await expect(preparePaidBookingConfirmation(store.db, 'one', unpaid)).rejects.toMatchObject({ status: 409 });
  expect(sendGmailEmail).not.toHaveBeenCalled();
});
