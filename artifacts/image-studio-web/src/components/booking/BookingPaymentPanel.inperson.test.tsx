// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({ getBookingPaymentDetails: vi.fn(), verifyBookingDeposit: vi.fn(), resendBookingDeposit: vi.fn(),
  recordInPersonBookingDeposit: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/bookings', () => api);
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: api.toast }) }));
import { BookingPaymentPanel } from './BookingPaymentPanel';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null, client: QueryClient, data: any;
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
async function mount() {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  act(() => root!.render(<QueryClientProvider client={client}><BookingPaymentPanel bookingId="b1" userId="staff" /></QueryClientProvider>));
  await flush();
}
const button = (label: RegExp) => [...document.body.querySelectorAll('button')].find(b => label.test(b.textContent || ''));

beforeEach(() => {
  vi.clearAllMocks();
  const now = Date.now();
  data = { bookingId: 'b1', campaignId: 'camp', campaignName: 'Natale', stage: 'in_attesa_pagamento', flow: 'approved',
    amountCents: 5000, paidAmountCents: null, currency: 'EUR', expiresAt: new Date(now + 3_600_000).toISOString(),
    serverTime: new Date(now).toISOString(), paymentStatus: 'unpaid', method: 'paypal', paypalOrderId: 'ORDER', paypalCaptureId: null,
    paypalFeeCents: null, netCents: null, providerStatus: 'APPROVED', emailStatus: 'sent', canResend: true, resendReason: null,
    resendAvailableAt: null, canVerify: true, payable: true, payabilityReason: null, customerName: 'Anna', customerEmail: 'a@example.test',
    shootingStart: new Date(now + 7_200_000).toISOString(), shootingEnd: new Date(now + 9_000_000).toISOString() };
  api.getBookingPaymentDetails.mockImplementation(async () => data);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { if (root) act(() => root!.unmount()); root = null; document.body.innerHTML = ''; client.clear(); });

describe('pannello pagamento: acconto incassato di persona', () => {
  it('offre il comando quando l\'acconto non e\' stato incassato e la richiesta e\' aperta', async () => {
    await mount();
    expect(button(/Acconto incassato di persona/)).toBeTruthy();
    expect(api.recordInPersonBookingDeposit).not.toHaveBeenCalled(); // mai richiamato da solo
  });

  it('apre il dialogo proponendo l\'importo della richiesta, senza registrare nulla', async () => {
    await mount();
    await act(async () => { button(/Acconto incassato di persona/)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    expect(document.body.querySelector('[data-testid="in-person-deposit-dialog"]')).toBeTruthy();
    expect((document.body.querySelector('#in-person-amount') as HTMLInputElement).value).toBe('50,00');
    expect(api.recordInPersonBookingDeposit).not.toHaveBeenCalled();
  });

  it('con un pagamento PayPal incerto spiega come sbloccare l\'incasso di persona', async () => {
    data = { ...data, paymentStatus: 'processing' };
    await mount();
    expect(document.body.textContent).toContain('Verifica esito PayPal');
    expect(document.body.textContent).toContain('10 minuti');
    expect(button(/Acconto incassato di persona/)).toBeUndefined();
  });

  it.each([
    ['gia\' pagato', { paymentStatus: 'paid', stage: 'confermata', paidAmountCents: 2000, payable: false }],
    ['pagamento PayPal in verifica', { paymentStatus: 'processing' }],
    ['da riconciliare', { paymentStatus: 'review', stage: 'pagamento_da_verificare' }],
    ['richiesta scaduta', { stage: 'scaduta' }],
    ['non e\' il flusso con approvazione', { flow: 'immediate' }],
  ])('non offre il comando se %s', async (_label, patch) => {
    data = { ...data, ...patch };
    await mount();
    expect(button(/Acconto incassato di persona/)).toBeUndefined();
  });
});
