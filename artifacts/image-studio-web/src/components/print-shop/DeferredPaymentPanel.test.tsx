// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeferredPaymentPanel, paymentNextStep, type DeferredPanelOrder } from './DeferredPaymentPanel';
import { draftOrder } from './deferred-payment.test-fixtures';

vi.mock('@/lib/queryClient', () => ({ apiRequest: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/firebase', () => ({ convertFirestoreTimestamp: () => null }));
afterEach(cleanup);

describe('Comandi esistenti di pagamento differito', () => {
  it('richiede nota, conferma della richiesta e conferma separata delle foto a bassa risoluzione', () => {
    const order: DeferredPanelOrder = draftOrder();
    order.manualAcceptanceEligibility!.requiresLowResolutionConfirmation = true;
    render(<QueryClientProvider client={new QueryClient()}>
      <DeferredPaymentPanel order={order} onChanged={() => undefined} />
    </QueryClientProvider>);
    fireEvent.click(screen.getByTestId('button-accept-draft'));
    const button = screen.getByTestId('button-confirm-deferred-action') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('input-deferred-note'), { target: { value: 'Richiesta telefonica' } });
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('checkbox-confirm-deferred'));
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('checkbox-accept-low-resolution'));
    expect(button.disabled).toBe(false);
    fireEvent.change(screen.getByTestId('input-deferred-note'), { target: { value: '   ' } });
    expect(button.disabled).toBe(true);
  });

  it.each([
    'Bozza incompleta: scegli formati e quantità.',
    'Originali mancanti: crea un nuovo ordine.',
    'File scaduti: crea un nuovo ordine.',
    'PayPal approvato: riconcilia il pagamento.',
  ])('mantiene il blocco senza inventare un’autorizzazione: %s', reason => {
    const order = draftOrder();
    order.manualAcceptanceEligibility.canAccept = false;
    order.deferredPaymentEligibility.reason = reason;
    expect(paymentNextStep(order)).toEqual({ explanation: reason });
  });

  it('non usa l’accettazione per scavalcare l’annullamento', () => {
    const order = draftOrder();
    order.fulfillment.status = 'cancelled';
    expect(paymentNextStep(order).action).toBeUndefined();
    const restorable = { ...order, deferredPaymentEligibility: { canRestore: true } };
    expect(paymentNextStep(restorable).action).toBe('restore');
  });

  it('disabilita una conferma già aperta se l’aggiornamento rivela un blocco reale', () => {
    const client = new QueryClient();
    const order = draftOrder();
    const view = (value: DeferredPanelOrder) => <QueryClientProvider client={client}>
      <DeferredPaymentPanel order={value} onChanged={() => undefined} />
    </QueryClientProvider>;
    const { rerender } = render(view(order));
    fireEvent.click(screen.getByTestId('button-accept-draft'));
    fireEvent.change(screen.getByTestId('input-deferred-note'), { target: { value: 'Richiesta cliente' } });
    fireEvent.click(screen.getByTestId('checkbox-confirm-deferred'));
    const button = screen.getByTestId('button-confirm-deferred-action') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    rerender(view({ ...order, manualAcceptanceEligibility: { canAccept: false, reason: 'Originali scaduti' } }));
    expect(button.disabled).toBe(true);
    expect(screen.queryByTestId('button-accept-draft')).toBeNull();
  });
});
