import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn(), snapshot: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: mocks.request }));
vi.mock('firebase/firestore', async importOriginal => ({ ...await importOriginal<typeof import('firebase/firestore')>(),
  collection: (_db: unknown, name: string) => ({ name }), query: (value: unknown) => value,
  orderBy: () => ({}), onSnapshot: mocks.snapshot }));
import { createBooking, approveBooking, getBookingPaymentDetails, getBookingPaymentCheckouts, verifyBookingDeposit, resendBookingDeposit, subscribeBookings } from './bookings';

const input = {
  campaignId: 'test-campaign',
  cliente: { nome: 'Cliente', cognome: 'Test', email: 'cliente@example.com', whatsapp: '+390000000000' },
  dataShootingInizio: new Date('2030-12-01T09:00:00Z'),
  dataShootingFine: new Date('2030-12-01T09:30:00Z'),
  note: '',
};
beforeEach(() => { vi.clearAllMocks(); });
describe('authenticated payment administration transport', () => {
  it('uses one Firestore listener and preserves actual document identifiers', () => {
    const stop = vi.fn(), update = vi.fn(), error = vi.fn();
    mocks.snapshot.mockReturnValue(stop);
    expect(subscribeBookings(update, error)).toBe(stop);
    const args = mocks.snapshot.mock.calls[0];
    expect(args[1]).toEqual({ includeMetadataChanges: true });
    args[2]({ docs: [{ id: 'actual-id', data: () => ({ id: 'stale-id', stato: 'in_attesa' }) }], metadata: { fromCache: false } });
    expect(update).toHaveBeenCalledWith([{ id: 'actual-id', stato: 'in_attesa' }], false);
    expect(args[3]).toBe(error);
    stop();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('uses the existing authenticated bridge and only sends an idempotent resend intent', async () => {
    mocks.request.mockImplementation(async () => new Response('{}'));
    await getBookingPaymentDetails('test');
    await getBookingPaymentCheckouts();
    await verifyBookingDeposit('test');
    await resendBookingDeposit('test', '11111111-1111-4111-8111-111111111111');
    expect(mocks.request.mock.calls).toEqual([
      ['GET', '/api/booking/test/payment'], ['GET', '/api/booking/admin/payment-checkouts'],
      ['POST', '/api/booking/test/payment/verify', {}],
      ['POST', '/api/booking/test/payment/resend', { requestId: '11111111-1111-4111-8111-111111111111' }],
    ]);
  });
  it('preserves a safe server explanation when a request is no longer payable', async () => {
    mocks.request.mockRejectedValueOnce(new Error('410: {"error":"La richiesta è scaduta."}'));
    await expect(resendBookingDeposit('test', 'intent')).rejects.toThrow('La richiesta è scaduta.');
  });
});
describe('esito approvazione con acconto', () => {
  it('preserves the waiting state, email result and server deadline', async () => {
    const result = { success: true, paymentRequired: true, stato: 'in_attesa_pagamento', amountCents: 2500,
      expiresAt: '2030-12-01T09:00:00.000Z', emailStatus: 'sent' };
    mocks.request.mockResolvedValue(new Response(JSON.stringify(result)));
    expect(await approveBooking('test')).toEqual(result);
    expect(mocks.request).toHaveBeenCalledWith('PATCH', '/api/booking/v2/test/approve');
  });
  it('retains existing approval for campaigns without deposits', async () => {
    mocks.request.mockResolvedValue(new Response(JSON.stringify({ success: true })));
    expect(await approveBooking('test')).toEqual({ success: true });
  });
  it.each([
    { success: true, paymentRequired: true, amountCents: 0 },
    { success: true, paymentRequired: true, amountCents: 2500, expiresAt: 'invalid', emailStatus: 'sent' },
    { success: false },
  ])('does not show a successful confirmation for malformed responses %j', async result => {
    mocks.request.mockResolvedValue(new Response(JSON.stringify(result)));
    await expect(approveBooking('test')).rejects.toThrow('Esito dell’approvazione da verificare');
  });
  it('shows the exact safe server error, not a raw JSON or generic slot-conflict message', async () => {
    mocks.request.mockRejectedValue(new Error('409: {"error":"La richiesta è già stata elaborata"}'));
    await expect(approveBooking('test')).rejects.toMatchObject({ status: 409, message: 'La richiesta è già stata elaborata' });
  });
});

describe('risposta della creazione prenotazione', () => {
  it.each(['in_attesa', 'confermata'] as const)('conserva lo stato server %s e le date ISO', async stato => {
    const result = { success: true, bookingId: 'booking-test', stato };
    mocks.request.mockResolvedValue(new Response(JSON.stringify(result), { status: 201 }));
    expect(await createBooking(input)).toEqual(result);
    expect(mocks.request).toHaveBeenCalledWith('POST', '/api/booking/v2/create', expect.objectContaining({
      dataShootingInizio: '2030-12-01T09:00:00.000Z',
      dataShootingFine: '2030-12-01T09:30:00.000Z',
      prodottoId: undefined,
    }));
  });

  it.each([
    { success: true, bookingId: 'test' },
    { success: true, bookingId: 'test', stato: 'annullata' },
    { success: false, bookingId: 'test', stato: 'confermata' },
    { success: true, bookingId: '', stato: 'confermata' },
    null,
  ])('non tratta una risposta incompleta come successo', async response => {
    mocks.request.mockResolvedValue(new Response(JSON.stringify(response), { status: 201 }));
    await expect(createBooking(input)).rejects.toThrow('Non è stato possibile verificare l’esito');
  });

  it('espone il conflitto come errore recuperabile senza JSON grezzo', async () => {
    mocks.request.mockRejectedValue(new Error('409: {"error":"Slot non più disponibile"}'));
    await expect(createBooking(input)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('Scegli un altro orario') });
  });

  it('non presenta la richiesta di checkout obbligatorio come slot occupato', async () => {
    mocks.request.mockRejectedValue(new Error('400: {"code":"CHECKOUT_REQUIRED","error":"Questa campagna richiede il checkout con acconto."}'));
    await expect(createBooking(input)).rejects.toMatchObject({
      status: 400, message: 'Questa campagna richiede il checkout con acconto.',
    });
  });

  it('conserva i messaggi del server e non mostra errori HTML del proxy', async () => {
    mocks.request.mockRejectedValueOnce(new Error('400: {"error":"Campagna non attiva"}'));
    await expect(createBooking(input)).rejects.toMatchObject({ status: 400, message: 'Campagna non attiva' });
    mocks.request.mockRejectedValueOnce(new Error('502: <html>proxy failure</html>'));
    await expect(createBooking(input)).rejects.toMatchObject({
      status: 502, message: expect.stringContaining('prima di riprovare'),
    });
  });

  it('non considera un HTML con HTTP 200 come una prenotazione riuscita', async () => {
    mocks.request.mockResolvedValue(new Response('<html>unexpected page</html>'));
    await expect(createBooking(input)).rejects.toThrow('Non è stato possibile verificare l’esito');
  });
});
