import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ request: vi.fn(), getDoc: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: h.request }));
vi.mock('firebase/firestore', async original => ({ ...await original<typeof import('firebase/firestore')>(),
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'), getDoc: h.getDoc }));
import { deleteBooking, deleteBookingCascade } from './bookings';
import { requiresBookingCancellationPanel } from './booking-deletion';
const booking = { stato: 'confermata', cliente: { nome: 'Cliente', cognome: 'Test', email: 'cliente@example.test' },
  campaignId: 'campaign', dataShootingInizio: new Date('2030-12-10T09:00:00Z') };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('fetch', h.fetch);
  h.getDoc.mockResolvedValue({ exists: () => true, data: () => booking });
  h.request.mockResolvedValue(new Response('{}'));
  h.fetch.mockResolvedValue(new Response('{}'));
});
afterEach(() => vi.unstubAllGlobals());
describe('delete is not a paid booking cancellation', () => {
  it.each([{ acconto: 20 }, { depositPayment: { status: 'paid_action_required' } }, { depositPaymentRequest: { status: 'pending' } },
    { bookingCancellation: { status: 'pending' } }, { customerReschedule: { status: 'blocked' } }])(
    'routes protected bookings to management instead of destructive deletion: %j', source => {
      expect(requiresBookingCancellationPanel(source)).toBe(true);
    });
  it('blocks a paid deletion locally without sending an email or requesting deletion', async () => {
    h.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ ...booking, acconto: 20 }) });
    await expect(deleteBooking('one')).rejects.toThrow('Annullamento e acconto');
    expect(h.fetch).not.toHaveBeenCalled(); expect(h.request).not.toHaveBeenCalled();
  });
  it.each([409, 500])('never emails when the authoritative server rejects deletion with %s, even with a stale unpaid snapshot', async status => {
    h.request.mockRejectedValueOnce(new Error(`${status}: deletion blocked`));
    await expect(deleteBooking('one')).rejects.toThrow('deletion blocked');
    expect(h.request).toHaveBeenCalledWith('DELETE', '/api/booking/one/delete');
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.getDoc).toHaveBeenCalledTimes(1);
  });
  it('only sends the legacy unpaid notification after confirmed server deletion', async () => {
    const order: string[] = [];
    h.request.mockImplementationOnce(async () => { order.push('deleted'); return new Response('{}'); });
    h.fetch.mockImplementationOnce(async () => { order.push('email'); return new Response('{}'); });
    await deleteBooking('one');
    expect(order).toEqual(['deleted', 'email']);
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });
  it('blocks a paid cascade before touching associated galleries, orders or notification', async () => {
    h.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ ...booking, acconto: 20 }) });
    await expect(deleteBookingCascade({ bookingId: 'one' })).rejects.toThrow('nessun file collegato è stato eliminato');
    expect(h.fetch).not.toHaveBeenCalled(); expect(h.request).not.toHaveBeenCalled();
  });
});
