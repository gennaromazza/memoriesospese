// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PrintShopOrdersManager from './PrintShopOrdersManager';
import { draftOrder } from './deferred-payment.test-fixtures';

const mocks = vi.hoisted(() => ({ request: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: mocks.request }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/firebase', () => ({ convertFirestoreTimestamp: () => null }));
vi.mock('@/lib/labs', () => ({ getAllLabs: async () => [] }));
vi.mock('wouter', () => ({ useLocation: () => ['/', vi.fn()] }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState({}, '', '/?printOrderId=offline-draft');
});

function mount(order = draftOrder(), failAuthorization = false) {
  let current: any = order;
  let fail = failAuthorization;
  mocks.request.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST' && url.endsWith('/accept-draft')) {
      current = { ...current, fulfillment: { ...current.fulfillment, status: 'awaiting_payment' },
        printShop: { ...current.printShop, adminAcceptance: { note: 'Richiesta telefonica', acceptedAt: '2026-11-17' } },
        manualAcceptanceEligibility: { canAccept: false },
        deferredPaymentEligibility: { canAuthorize: true } };
    } else if (method === 'POST' && url.endsWith('/deferred-payment')) {
      if (fail) { fail = false; throw new Error('Provider temporaneamente non disponibile'); }
      current = { ...current, payment: { status: 'deferred', method: 'pay_on_delivery', collectedCents: 0, dueCents: 1500 },
        fulfillment: { ...current.fulfillment, status: 'submitted' },
        deferredPaymentEligibility: { canAuthorize: false } };
    }
    return { json: async () => url.includes('lab-shipments') ? { shipments: [] }
      : url.includes('?limit=') ? { orders: [current] } : { order: current } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><PrintShopOrdersManager /></QueryClientProvider>);
  return client;
}

async function fromLab() {
  fireEvent.click(await screen.findByRole('button', { name: 'Prepara invio' }));
  fireEvent.click(await screen.findByRole('button', { name: /Apri gestione pagamento|Vai all’azione di pagamento/ }));
}

async function confirm() {
  fireEvent.change(screen.getByTestId('input-deferred-note'), { target: { value: 'Richiesta telefonica, saldo al ritiro' } });
  if (!(screen.getByTestId('checkbox-confirm-deferred') as HTMLInputElement).checked) {
    fireEvent.click(screen.getByTestId('checkbox-confirm-deferred'));
  }
  await waitFor(() => expect((screen.getByTestId('button-confirm-deferred-action') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByTestId('button-confirm-deferred-action'));
}

describe('Laboratorio → pagamento con i dialoghi reali', () => {
  it('apre il comando pertinente per la bozza 15 €/50 stampe e conserva saldo e stato alla riapertura', async () => {
    mount();
    await fromLab();
    expect(await screen.findByRole('dialog', { name: 'Accettare l’ordine su richiesta del cliente?' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Prepara il laboratorio' })).toBeNull();
    expect(screen.getByTestId('manual-acceptance-summary').textContent).toContain('50 copie');
    await confirm();
    await waitFor(() => expect(screen.queryByTestId('input-deferred-note')).toBeNull());
    fireEvent.click(screen.getByTestId('button-authorize-deferred'));
    await confirm();
    await waitFor(() => expect(screen.getByTestId('text-payment-status').textContent).toContain('Pagamento alla consegna'));
    const panel = screen.getByTestId('panel-payment');
    expect(within(panel).getByText('Incassato').nextElementSibling?.textContent).toContain('0,00');
    expect(within(panel).getByText('Da incassare').nextElementSibling?.textContent).toContain('15,00');
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'ST-TEST-50' }), { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Apri ordine' }));
    expect(await screen.findByTestId('text-payment-status')).toBeTruthy();
    expect(screen.getByTestId('text-payment-status').textContent).toContain('Pagamento alla consegna');
    fireEvent.click(screen.getByRole('button', { name: 'Prepara invio' }));
    expect(screen.queryByTestId('lab-payment-required')).toBeNull();
    expect(mocks.request.mock.calls.filter(([method]) => method === 'POST').map(([, url]) => url.split('/').pop()))
      .toEqual(['accept-draft', 'deferred-payment']);
  });

  it('recupera un errore di autorizzazione senza ripetere l’accettazione', async () => {
    mount(draftOrder(), true);
    await fromLab();
    await screen.findByTestId('input-deferred-note');
    await confirm();
    await waitFor(() => expect(screen.queryByTestId('input-deferred-note')).toBeNull());
    await fromLab();
    await screen.findByRole('dialog', { name: 'Autorizzare il pagamento alla consegna?' });
    await confirm();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Provider temporaneamente'));
    expect(screen.getByTestId('text-admin-acceptance')).toBeTruthy();
    expect(screen.queryByTestId('button-accept-draft')).toBeNull();
    await confirm();
    await waitFor(() => expect(screen.getByTestId('text-payment-status').textContent).toContain('Pagamento alla consegna'));
    expect(mocks.request.mock.calls.filter(([, url]) => url.endsWith('/accept-draft'))).toHaveLength(1);
  });

  it('mantiene anche il comando combinato e recupera il secondo passo senza una nuova accettazione', async () => {
    mount(draftOrder(), true);
    fireEvent.click(await screen.findByTestId('button-accept-and-defer'));
    await confirm();
    await screen.findByRole('dialog', { name: 'Autorizzare il pagamento alla consegna?' });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('non è stato autorizzato'));
    await waitFor(() => expect(screen.queryByTestId('button-accept-draft')).toBeNull());
    await confirm();
    await waitFor(() => expect(screen.getByTestId('text-payment-status').textContent).toContain('Pagamento alla consegna'));
    expect(mocks.request.mock.calls.filter(([method]) => method === 'POST').map(([, url]) => url.split('/').pop()))
      .toEqual(['accept-draft', 'deferred-payment', 'deferred-payment']);
  });

  it('spiega il blocco reale senza invitare a un comando inesistente', async () => {
    const order = draftOrder();
    order.manualAcceptanceEligibility.canAccept = false;
    order.deferredPaymentEligibility.reason = 'File scaduti: è necessario un nuovo ordine.';
    mount(order);
    fireEvent.click(await screen.findByRole('button', { name: 'Prepara invio' }));
    expect(screen.getByTestId('lab-payment-required').textContent).toContain('File scaduti');
    expect(screen.queryByRole('button', { name: 'Vai all’azione di pagamento' })).toBeNull();
  });
});
