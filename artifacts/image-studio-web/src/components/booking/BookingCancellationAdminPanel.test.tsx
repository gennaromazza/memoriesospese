// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BookingCancellationAdminPanel } from './BookingCancellationAdminPanel';
const h = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: h.request }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function setup(overrides = {}) {
  const state = { bookingId: 'one', bookingStatus: 'annullata', amountCents: 2000, status: 'complete',
    refundStatus: 'review', notificationStatus: 'sent', canCancel: false, canRefund: true, paypalDeposit: true,
    canVerifyRefund: false, reason: null, refundId: null, ...overrides };
  h.request.mockImplementation(async (method: string) => ({ json: async () => method === 'GET' ? state : { ...state, refundStatus: 'completed', canRefund: false } }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><BookingCancellationAdminPanel bookingId="one" userId="staff" /></QueryClientProvider>);
  return { client, state };
}
describe('administrative refund consent', () => {
  it('does not move money until a second explicit confirmation, with no editable amount', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Rimborsa l’acconto con PayPal' }));
    expect(screen.getByText(/È un movimento reale di denaro/)).toBeTruthy();
    expect(h.request.mock.calls.filter(call => call[0] === 'POST')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Conferma operazione' }));
    await screen.findByText('Rimborso integrale confermato da PayPal');
    const posts = h.request.mock.calls.filter(call => call[0] === 'POST');
    expect(posts).toHaveLength(1); expect(posts[0][2]).toEqual({ action: 'refund', requestId: expect.any(String), expectedAmountCents: 2000 });
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });
  it('lets the studio back out without requesting a refund', async () => {
    setup(); fireEvent.click(await screen.findByRole('button', { name: 'Rimborsa l’acconto con PayPal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Torna indietro' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Conferma operazione' })).toBeNull());
    expect(h.request.mock.calls.filter(call => call[0] === 'POST')).toHaveLength(0);
  });
  it('blocks a refund if the amount changes after opening its confirmation', async () => {
    const { client, state } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Rimborsa l’acconto con PayPal' }));
    act(() => client.setQueryData(['booking-cancellation', 'staff', 'one'], { ...state, amountCents: 3000 }));
    await screen.findByText('L’importo è cambiato. Torna indietro, controllalo e conferma nuovamente.');
    expect(screen.getByRole('button', { name: 'Conferma operazione' }).hasAttribute('disabled')).toBe(true);
    expect(h.request.mock.calls.filter(call => call[0] === 'POST')).toHaveLength(0);
  });
  it('shows read-only verification instead of another refund for an uncertain payment', async () => {
    setup({ canRefund: false, canVerifyRefund: true, refundStatus: 'unknown' });
    expect(await screen.findByText('Esito PayPal incerto: non rimborsare nuovamente')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rimborsa l’acconto con PayPal' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Verifica esito PayPal' }));
    await waitFor(() => expect(h.request).toHaveBeenCalledWith('POST', '/api/booking/one/cancellation', expect.objectContaining({ action: 'verify_refund' })));
  });
});
