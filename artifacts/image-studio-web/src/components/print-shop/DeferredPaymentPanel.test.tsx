// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { DeferredPaymentPanel } from './DeferredPaymentPanel';

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mountPanel(onChanged = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <DeferredPaymentPanel
        order={{
          id: 'print-order',
          orderNumber: 'ST-TEST-001',
          quoteFingerprint: 'quote-hash',
          manualAcceptanceEligibility: {
            canAccept: true,
            snapshotHash: 'snapshot-hash',
          },
          totals: { totalCents: 1500 },
          payment: { status: 'pending', method: 'paypal' },
          fulfillment: { status: 'draft' },
          printShop: {
            items: [{
              sku: 'PRINT-TEST',
              formatLabel: '10×15 cm',
              productName: 'Stampa fotografica',
              finish: 'glossy',
              copyCount: 30,
            }],
          },
        }}
        onChanged={onChanged}
      />
    </QueryClientProvider>,
  );
  return onChanged;
}

function confirmPickupPayment() {
  fireEvent.click(screen.getByRole('button', { name: 'Accetta e autorizza pagamento al ritiro' }));
  fireEvent.change(screen.getByTestId('input-deferred-note'), {
    target: { value: 'La cliente ha confermato via WhatsApp e pagherà al ritiro.' },
  });
  fireEvent.click(screen.getByTestId('checkbox-confirm-deferred'));
  fireEvent.click(screen.getByRole('button', { name: 'Conferma pagamento al ritiro' }));
}

describe('DeferredPaymentPanel pickup payment flow', () => {
  it('requires a clear admin confirmation and performs acceptance before authorizing unpaid pickup', async () => {
    const onChanged = mountPanel();
    vi.mocked(apiRequest).mockResolvedValue({ ok: true, json: async () => ({ order: {} }) } as Response);

    confirmPickupPayment();

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      'POST',
      '/api/print-shop/admin/orders/print-order/accept-draft',
      expect.objectContaining({
        note: 'La cliente ha confermato via WhatsApp e pagherà al ritiro.',
        confirmed: true,
        expectedQuoteFingerprint: 'quote-hash',
        expectedSnapshotHash: 'snapshot-hash',
        expectedTotalCents: 1500,
      }),
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      'POST',
      '/api/print-shop/admin/orders/print-order/deferred-payment',
      { note: 'La cliente ha confermato via WhatsApp e pagherà al ritiro.', confirmed: true },
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Pagamento al ritiro autorizzato',
      description: expect.stringContaining('15,00 € restano da incassare'),
    }));
  });

  it('refreshes the order and explains when acceptance succeeded but pickup authorization failed', async () => {
    const onChanged = mountPanel();
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockRejectedValueOnce(new Error('PayPal deve ancora essere riconciliato'));

    confirmPickupPayment();

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Ordine accettato, pagamento non autorizzato',
      description: expect.stringContaining('PayPal deve ancora essere riconciliato'),
      variant: 'destructive',
    })));
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });
});
