import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: mocks.request }));
import { createBooking, approveBooking } from './bookings';

const input = {
  campaignId: 'test-campaign',
  cliente: { nome: 'Cliente', cognome: 'Test', email: 'cliente@example.com', whatsapp: '+390000000000' },
  dataShootingInizio: new Date('2030-12-01T09:00:00Z'),
  dataShootingFine: new Date('2030-12-01T09:30:00Z'),
  note: '',
};
beforeEach(() => { vi.clearAllMocks(); });
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
    await expect(createBooking(input)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('Scegli un altro slot') });
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
