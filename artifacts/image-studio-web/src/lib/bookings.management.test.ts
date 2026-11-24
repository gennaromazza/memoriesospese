import { beforeEach, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest: request }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
import { BookingRequestError, changeBookingManagementLink, getBookingManagementLinkDetails } from './bookings';
beforeEach(() => { request.mockReset(); });
it('reads metadata through the authenticated transport, not a raw anonymous fetch', async () => {
  const result = { status: 'active', version: 1, canIssue: true, canRevoke: true, reason: null };
  request.mockResolvedValue({ json: async () => result });
  expect(await getBookingManagementLinkDetails('one')).toEqual(result);
  expect(request).toHaveBeenCalledWith('GET', '/api/booking/one/management-link');
});
it('sends exactly the versioned intent and encodes path identifiers', async () => {
  const intent = { action: 'rotate' as const, requestId: 'f4eac28e-d62e-4e23-9d20-a9ce2a56cae1', expectedVersion: 7 };
  request.mockResolvedValue({ json: async () => ({ status: 'active', version: 8, url: 'test' }) });
  await changeBookingManagementLink('one/two', intent);
  expect(request).toHaveBeenCalledWith('POST', '/api/booking/one%2Ftwo/management-link', intent);
});
it('preserves conflict status for safe refresh without replacing the useful error message', async () => {
  request.mockRejectedValue(new Error('409: {"error":"Il link è cambiato"}'));
  await expect(changeBookingManagementLink('one', { action: 'revoke', requestId: 'test', expectedVersion: 1 }))
    .rejects.toMatchObject({ message: 'Il link è cambiato', status: 409, name: 'BookingRequestError' });
  expect(new BookingRequestError('Test', 409)).toBeInstanceOf(Error);
});
