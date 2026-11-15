// @vitest-environment jsdom
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const api = vi.hoisted(() => ({ getBookingManagementLinkDetails: vi.fn(), changeBookingManagementLink: vi.fn(), toast: vi.fn(), copy: vi.fn() }));
vi.mock('@/lib/bookings', () => ({ ...api, BookingRequestError: class extends Error { constructor(message: string, readonly status?: number) { super(message); } } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: api.toast }) }));
import { BookingRequestError } from '@/lib/bookings';
import { BookingManagementLinkPanel } from './BookingManagementLinkPanel';

let client: QueryClient;
const active = { status: 'active' as const, version: 1, canIssue: true, canRevoke: true, reason: null };
const url = `https://imagestudiofotografico.com/prenota/gestisci/one#${'a'.repeat(64)}`;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  api.getBookingManagementLinkDetails.mockResolvedValue(active);
  api.changeBookingManagementLink.mockReset().mockResolvedValue({ ...active, version: 2, url });
  api.copy.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: api.copy } });
});
afterEach(() => { cleanup(); client.clear(); Reflect.deleteProperty(navigator, 'clipboard'); });
function wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
async function openRotate() {
  fireEvent.click(await screen.findByTestId('button-management-rotate'));
  return screen.findByTestId('button-management-confirm');
}
it('loads only with an admin identity and does not rotate on opening the detail', async () => {
  const view = render(<BookingManagementLinkPanel bookingId="one" userId="" />, { wrapper });
  expect(api.getBookingManagementLinkDetails).not.toHaveBeenCalled();
  view.rerender(<BookingManagementLinkPanel bookingId="one" userId="staff" />);
  await screen.findByTestId('status-management-link');
  expect(api.changeBookingManagementLink).not.toHaveBeenCalled();
});
it('requires confirmation, sends the real versioned contract, and shows the new URL without caching it', async () => {
  render(<BookingManagementLinkPanel bookingId="one" userId="staff" />, { wrapper });
  const confirm = await openRotate();
  expect(api.changeBookingManagementLink).not.toHaveBeenCalled();
  fireEvent.click(confirm);
  const input = await screen.findByTestId('input-management-link');
  expect((input as HTMLInputElement).value).toBe(url);
  expect(api.changeBookingManagementLink.mock.calls[0]).toEqual(['one', {
    action: 'rotate', expectedVersion: 1, requestId: expect.any(String),
  }]);
  expect(client.getQueryData(['booking-management-link', 'staff', 'one'])).toEqual({ ...active, version: 2 });
  fireEvent.click(screen.getByTestId('button-management-copy'));
  await waitFor(() => expect(api.copy).toHaveBeenCalledWith(url));
});
it('retries an uncertain network result with the same intent instead of rotating twice', async () => {
  api.changeBookingManagementLink.mockRejectedValueOnce(new Error('network disconnected'));
  render(<BookingManagementLinkPanel bookingId="one" userId="staff" />, { wrapper });
  fireEvent.click(await openRotate());
  await waitFor(() => expect(api.toast).toHaveBeenCalled());
  fireEvent.click(screen.getByTestId('button-management-confirm'));
  await screen.findByTestId('input-management-link');
  expect(api.changeBookingManagementLink).toHaveBeenCalledTimes(2);
  expect(api.changeBookingManagementLink.mock.calls[0]).toEqual(api.changeBookingManagementLink.mock.calls[1]);
});
it('refreshes a stale version before allowing a new explicit attempt', async () => {
  api.changeBookingManagementLink.mockRejectedValueOnce(new BookingRequestError('Aggiorna il pannello', 409));
  render(<BookingManagementLinkPanel bookingId="one" userId="staff" />, { wrapper });
  const confirm = await openRotate();
  api.getBookingManagementLinkDetails.mockResolvedValue({ ...active, version: 2 });
  fireEvent.click(confirm);
  await waitFor(() => expect(client.getQueryData(['booking-management-link', 'staff', 'one'])).toEqual({ ...active, version: 2 }));
  await waitFor(() => expect((screen.getByTestId('button-management-confirm') as HTMLButtonElement).disabled).toBe(false));
  api.changeBookingManagementLink.mockResolvedValue({ ...active, version: 3, url });
  fireEvent.click(screen.getByTestId('button-management-confirm'));
  await waitFor(() => expect(api.changeBookingManagementLink).toHaveBeenCalledTimes(2));
  expect(api.changeBookingManagementLink.mock.calls[1][1].expectedVersion).toBe(2);
  expect(api.changeBookingManagementLink.mock.calls[1][1].requestId).not.toBe(api.changeBookingManagementLink.mock.calls[0][1].requestId);
});
it('revokes only after confirmation and updates the visible state', async () => {
  api.changeBookingManagementLink.mockResolvedValue({ ...active, status: 'revoked', version: 2, canRevoke: false, url: null });
  render(<BookingManagementLinkPanel bookingId="one" userId="staff" />, { wrapper });
  fireEvent.click(await screen.findByTestId('button-management-revoke'));
  expect(screen.getByText(/La prenotazione e il pagamento non vengono modificati/)).toBeTruthy();
  fireEvent.click(screen.getByTestId('button-management-confirm'));
  await waitFor(() => expect(screen.getByTestId('status-management-link').textContent).toContain('revocato'));
  expect(screen.queryByTestId('button-management-revoke')).toBeNull();
});
it('does not allow new issuance before confirmation or payment', async () => {
  api.getBookingManagementLinkDetails.mockResolvedValue({ status: 'not_issued', version: 0, canIssue: false, canRevoke: false, reason: 'Non confermata' });
  render(<BookingManagementLinkPanel bookingId="one" userId="staff" />, { wrapper });
  await waitFor(() => expect(api.getBookingManagementLinkDetails).toHaveBeenCalledOnce());
  expect(screen.queryByTestId('button-management-rotate')).toBeNull();
});
