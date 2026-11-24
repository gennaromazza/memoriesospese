// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminBookingPayment } from '@workspace/api-client-react';
const api = vi.hoisted(() => ({ getBookingPaymentDetails: vi.fn(), getBookingPaymentCheckouts: vi.fn(),
  verifyBookingDeposit: vi.fn(), resendBookingDeposit: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/bookings', () => api);
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: api.toast }) }));
import { BookingPaymentPanel } from './BookingPaymentPanel';
import { BookingPaymentCheckouts } from './BookingPaymentCheckouts';

let data: AdminBookingPayment, client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  const now = Date.now();
  data = { bookingId: 'test-booking', campaignId: 'camp', campaignName: 'Natale', stage: 'in_attesa_pagamento',
    flow: 'approved', amountCents: 2500, paidAmountCents: null, currency: 'EUR', expiresAt: new Date(now + 3_600_000).toISOString(),
    serverTime: new Date(now).toISOString(), paymentStatus: 'unpaid', method: 'paypal', paypalOrderId: 'ORDER', paypalCaptureId: null,
    paypalFeeCents: null, netCents: null, providerStatus: 'APPROVED', emailStatus: 'sent', canResend: true,
    resendReason: null, resendAvailableAt: null, canVerify: true, payable: true, payabilityReason: null,
    customerName: 'Cliente test', customerEmail: 'cliente@example.test', shootingStart: new Date(now + 7_200_000).toISOString(),
    shootingEnd: new Date(now + 9_000_000).toISOString() };
  api.getBookingPaymentDetails.mockImplementation(async () => data);
  api.getBookingPaymentCheckouts.mockResolvedValue({ items: [], truncated: false });
  api.verifyBookingDeposit.mockImplementation(async () => ({ ...data, providerStatus: 'COMPLETED', paymentStatus: 'paid', stage: 'confermata',
    paidAmountCents: 2500, paypalCaptureId: 'CAPTURE', canResend: false, payable: false }));
  api.resendBookingDeposit.mockImplementation(async () => ({ ...data, canResend: false, resendReason: 'Attendi almeno un minuto dall’ultimo invio.' }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });
const mount = (element = <BookingPaymentPanel bookingId="test-booking" userId="staff" />) =>
  render(<React.StrictMode><QueryClientProvider client={client}>{element}</QueryClientProvider></React.StrictMode>);
describe('admin booking payment panel', () => {
  it('shows amount, deadline, PayPal state and email status without charging or sending on mount', async () => {
    mount();
    expect(await screen.findByTestId('deposit-countdown')).toBeTruthy();
    expect(screen.getByText('25,00 €')).toBeTruthy();
    expect(screen.getByText('Autorizzato, non ancora incassato')).toBeTruthy();
    expect(screen.getByText('Inviata')).toBeTruthy();
    expect(api.verifyBookingDeposit).not.toHaveBeenCalled(); expect(api.resendBookingDeposit).not.toHaveBeenCalled();
  });
  it('verifies only on explicit action and updates the paid transaction', async () => {
    mount(); await screen.findByTestId('booking-payment-panel');
    fireEvent.click(screen.getByRole('button', { name: 'Verifica esito PayPal' }));
    await screen.findByText('CAPTURE');
    expect(api.verifyBookingDeposit).toHaveBeenCalledWith('test-booking');
    expect(api.verifyBookingDeposit).toHaveBeenCalledTimes(1);
    expect(api.resendBookingDeposit).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Reinvia link di pagamento' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('requires explicit confirmation and retains the same resend intent after a network failure', async () => {
    api.resendBookingDeposit.mockRejectedValueOnce(new Error('Connessione interrotta'));
    mount(); await screen.findByTestId('booking-payment-panel');
    fireEvent.click(screen.getByRole('button', { name: 'Reinvia link di pagamento' }));
    expect(api.resendBookingDeposit).not.toHaveBeenCalled();
    expect(screen.getByText(/non concede un’altra ora/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Conferma reinvio' }));
    await waitFor(() => expect(api.resendBookingDeposit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Reinvia link di pagamento' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Reinvia link di pagamento' }));
    fireEvent.click(screen.getByRole('button', { name: 'Conferma reinvio' }));
    await waitFor(() => expect(api.resendBookingDeposit).toHaveBeenCalledTimes(2));
    expect(api.resendBookingDeposit.mock.calls[0][1]).toBe(api.resendBookingDeposit.mock.calls[1][1]);
  });
  it.each(['unknown', 'failed'])('shows email problems and the server explanation for %s', async emailStatus => {
    data = { ...data, emailStatus, canResend: false, resendReason: 'Verificare la Posta inviata prima di procedere.' };
    mount(); await screen.findByTestId('booking-payment-panel');
    expect(screen.getByText(data.resendReason!)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Reinvia link di pagamento' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('blocks resend at expiry even before the next server poll', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    data = { ...data, serverTime: new Date(Date.now()).toISOString(), expiresAt: new Date(Date.now() + 2000).toISOString() };
    mount(); await screen.findByTestId('deposit-countdown');
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText('Tempo scaduto')).toBeTruthy();
    expect(screen.getByText('Scaduta')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Reinvia link di pagamento' }) as HTMLButtonElement).disabled).toBe(true);
    expect(api.resendBookingDeposit).not.toHaveBeenCalled();
  });
  it('does not fetch private payment details before a checkout is opened and excludes duplicate roots', async () => {
    api.getBookingPaymentCheckouts.mockResolvedValue({ items: [{ ...data, bookingId: 'root', customerName: 'Già in elenco' },
      { ...data, flow: 'immediate', customerName: 'Checkout visibile' }], truncated: false });
    api.getBookingPaymentDetails.mockResolvedValue({ ...data, flow: 'immediate', canResend: false });
    mount(<BookingPaymentCheckouts userId="staff" existingIds={['root']} campaignFilter="active" activeCampaignIds={['camp']}
      statusFilter="in_attesa_pagamento" search="" />);
    await screen.findByText('Checkout visibile');
    expect(screen.queryByText('Già in elenco')).toBeNull();
    expect(api.getBookingPaymentDetails).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Dettagli pagamento' }));
    await screen.findByTestId('booking-payment-panel');
    expect(api.getBookingPaymentDetails).toHaveBeenCalledWith('test-booking');
    expect(screen.queryByRole('button', { name: 'Reinvia link di pagamento' })).toBeNull();
  });
});
