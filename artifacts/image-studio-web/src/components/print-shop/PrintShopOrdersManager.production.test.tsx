// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PrintShopOrdersManager from './PrintShopOrdersManager';
import { apiRequest } from '@/lib/queryClient';

vi.mock('@/lib/queryClient', () => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ convertFirestoreTimestamp: () => null }));
vi.mock('@/lib/labs', () => ({ getAllLabs: async () => [] }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('wouter', () => ({ useLocation: () => ['/admin/dashboard', vi.fn()] }));
vi.mock('./DeferredPaymentPanel', () => ({
  DeferredPaymentPanel: () => null,
  paymentNextStep: () => ({ explanation: '' }),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); window.history.replaceState({}, '', '/'); });

function mountOrder(status = 'ready_to_print', method = 'studio_pickup') {
  window.history.replaceState({}, '', '/?printOrderId=order');
  let currentStatus = status;
  let shipmentSent = false;
  const order = () => ({
    id: 'order', orderNumber: 'ST-TEST', customer: { name: 'Cliente test' },
    payment: { status: 'paid' }, totals: { totalCents: 2500 },
    fulfillment: { status: currentStatus, method },
    printShop: { items: [], assetCount: 100, copyCount: 100 }, assets: [],
  });
  vi.mocked(apiRequest).mockImplementation(async (verb, path, body: any) => {
    if (verb === 'POST' && path.endsWith('/send')) {
      currentStatus = 'sent_to_laboratory'; shipmentSent = true;
    }
    if (verb === 'PATCH' && path.endsWith('/status')) currentStatus = body.status;
    const data = path.endsWith('/lab-shipments')
      ? { shipments: [{
        id: 'shipment', labNome: 'Laboratorio test', status: shipmentSent ? 'inviato' : 'da_inviare',
        transfer: { status: 'completed', total: 100, transferred: 100 },
      }] }
      : path.includes('/orders?') ? { orders: [order()] } : { order: order() };
    return { ok: true, json: async () => data } as Response;
  });
  const client = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: 0 }, mutations: { retry: false },
  } });
  render(<QueryClientProvider client={client}><PrintShopOrdersManager /></QueryClientProvider>);
  return client;
}

describe('Print shop production status flow', () => {
  it('refreshes the order after sending to the lab and offers ready for pickup', async () => {
    const client = mountOrder();
    fireEvent.click(await screen.findByRole('button', { name: 'Invia link' }));
    const ready = await screen.findByRole('button', { name: 'Pronto per il ritiro' });
    expect(client.getQueryData<any>(['/api/print-shop/admin/orders', 'order']).order.fulfillment.status)
      .toBe('sent_to_laboratory');
    fireEvent.click(ready);
    expect(await screen.findByText(/il sistema tenta di inviare al cliente/)).toBeTruthy();
    expect(vi.mocked(apiRequest).mock.calls.some(([verb]) => verb === 'PATCH')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Salva stato' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      'PATCH', '/api/print-shop/admin/orders/order/status', { status: 'ready_for_pickup' },
    ));
    await waitFor(() => expect(client.getQueryData<any>(
      ['/api/print-shop/admin/orders', 'order'],
    ).order.fulfillment.status).toBe('ready_for_pickup'));
  });

  it('uses shipping wording rather than pickup for orders to be shipped', async () => {
    mountOrder('printing', 'shipping');
    expect(await screen.findByRole('button', { name: 'Pronto per la spedizione' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pronto per il ritiro' })).toBeNull();
  });

  it('does not offer ready before production has started', async () => {
    mountOrder('submitted');
    await screen.findByRole('button', { name: 'Aggiorna stato' });
    expect(screen.queryByRole('button', { name: 'Pronto per il ritiro' })).toBeNull();
  });
});
