import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: mocks.request }));
import { createBooking } from './bookings';

const input = {
  campaignId: 'test-campaign',
  cliente: { nome: 'Cliente', cognome: 'Test', email: 'cliente@example.com', whatsapp: '+390000000000' },
  dataShootingInizio: new Date('2030-12-01T09:00:00Z'),
  dataShootingFine: new Date('2030-12-01T09:30:00Z'),
  note: '',
};
beforeEach(() => { vi.clearAllMocks(); });

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
