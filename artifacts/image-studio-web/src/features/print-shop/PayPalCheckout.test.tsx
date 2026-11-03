// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrintShopQuote } from '@shared/print-shop-types';
import type { PaypalCaptureResult, PrintShopOrderListItem } from './types';

const api = vi.hoisted(() => ({
  getPaypalConfig: vi.fn(),
  createPaypalOrder: vi.fn(),
  capturePaypalOrder: vi.fn(),
  getOrder: vi.fn(),
}));

vi.mock('./print-shop-api', () => ({ printShopApi: api }));

import { PayPalCheckout } from './PayPalCheckout';

type ButtonOptions = Parameters<NonNullable<Window['paypal']>['Buttons']>[0];
let buttonOptions: ButtonOptions | null = null;
let nextClientId = 0;

const quote = {
  totals: { totalCents: 450 },
} as PrintShopQuote;

const captureResult: PaypalCaptureResult = {
  orderId: 'order-mobile',
  orderNumber: 'PS-MOBILE-001',
  paypalOrderId: 'paypal-order-mobile',
  paypalCaptureId: 'paypal-capture-mobile',
  paymentStatus: 'paid',
};

function renderCheckout() {
  return render(
    <PayPalCheckout
      orderId="order-mobile"
      enabled
      legalConsents={{ termsAccepted: true, privacyAccepted: true, personalizedProductionAccepted: true }}
      prepareOrder={vi.fn().mockResolvedValue(quote)}
      onQuoteReviewRequired={vi.fn()}
      onCaptured={vi.fn()}
    />,
  );
}

async function loadSdk(isEligible: boolean) {
  await waitFor(() => {
    expect(document.querySelector<HTMLScriptElement>('script[data-print-shop-paypal="true"]')).not.toBeNull();
  });
  const fakeSdk = {
    Buttons: vi.fn((options: ButtonOptions) => {
      buttonOptions = options;
      return {
        isEligible: () => isEligible,
        render: async (element: HTMLElement) => {
          const button = document.createElement('button');
          button.textContent = 'PayPal';
          button.type = 'button';
          element.append(button);
        },
        close: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
  window.paypal = fakeSdk;
  await act(async () => {
    document.querySelector<HTMLScriptElement>('script[data-print-shop-paypal="true"]')!
      .dispatchEvent(new Event('load'));
  });
  return fakeSdk;
}

describe('PayPal mobile checkout callbacks', () => {
  beforeEach(() => {
    buttonOptions = null;
    api.getPaypalConfig.mockResolvedValue({
      enabled: true,
      clientId: `sandbox-fixture-${++nextClientId}`,
      currency: 'EUR',
      environment: 'sandbox',
    });
    api.createPaypalOrder.mockResolvedValue({ paypalOrderId: 'paypal-order-mobile', orderId: 'order-mobile' });
    api.capturePaypalOrder.mockResolvedValue(captureResult);
    api.getOrder.mockResolvedValue(null as unknown as PrintShopOrderListItem);
  });

  afterEach(() => {
    cleanup();
    delete window.paypal;
    document.querySelectorAll('script[data-print-shop-paypal="true"]').forEach((script) => script.remove());
    vi.clearAllMocks();
  });

  it('renders the SDK button when PayPal reports the browser eligible and labels sandbox checkout', async () => {
    renderCheckout();
    await loadSdk(true);

    expect(await screen.findByRole('button', { name: 'PayPal' })).toBeTruthy();
    expect(screen.getByText('Ambiente di prova PayPal: nessun addebito reale.')).toBeTruthy();
    expect(buttonOptions).not.toBeNull();
  });

  it('clearly reports when the SDK says the browser is not eligible', async () => {
    renderCheckout();
    await loadSdk(false);

    expect((await screen.findByRole('alert')).textContent).toContain('PayPal non è supportato in questo browser.');
    expect(screen.queryByRole('button', { name: 'PayPal' })).toBeNull();
  });

  it('shares in-flight create and approval callbacks so one handoff produces one capture and confirmation', async () => {
    const onCaptured = vi.fn();
    render(
      <PayPalCheckout
        orderId="order-mobile"
        enabled
        legalConsents={{ termsAccepted: true, privacyAccepted: true, personalizedProductionAccepted: true }}
        prepareOrder={vi.fn().mockResolvedValue(quote)}
        onQuoteReviewRequired={vi.fn()}
        onCaptured={onCaptured}
      />,
    );
    await loadSdk(true);

    const callbacks = buttonOptions!;
    const [firstOrder, secondOrder] = await Promise.all([
      callbacks.createOrder(),
      callbacks.createOrder(),
    ]);
    expect(firstOrder).toBe('paypal-order-mobile');
    expect(secondOrder).toBe(firstOrder);
    expect(api.createPaypalOrder).toHaveBeenCalledTimes(1);

    await act(async () => {
      await Promise.all([
        callbacks.onApprove({ orderID: firstOrder }),
        callbacks.onApprove({ orderID: firstOrder }),
      ]);
    });
    expect(api.capturePaypalOrder).toHaveBeenCalledTimes(1);
    expect(onCaptured).toHaveBeenCalledTimes(1);
    expect(onCaptured).toHaveBeenCalledWith(captureResult);
  });
});
