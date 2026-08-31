import { describe, expect, it, vi } from 'vitest';
import {
  PayPalConfigurationError,
  PayPalOrdersClient,
  loadPayPalOrdersConfig,
  paypalPublicConfig,
  paypalRequestId,
  paypalValueToCents,
} from './paypal-orders.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('PayPal Orders v2 adapter', () => {
  it('enables checkout without a webhook ID while reporting webhook readiness separately', async () => {
    const config = loadPayPalOrdersConfig({
      PAYPAL_ENVIRONMENT: 'sandbox',
      PAYPAL_CLIENT_ID: 'public-client-id',
      PAYPAL_CLIENT_SECRET: 'private-secret',
    } as NodeJS.ProcessEnv);
    expect(paypalPublicConfig(config)).toEqual({
      enabled: true,
      checkoutEnabled: true,
      webhookReady: false,
      environment: 'sandbox',
      clientId: 'public-client-id',
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'PAYPAL-ORDER-123',
        status: 'CREATED',
        links: [],
      }));
    const client = new PayPalOrdersClient(config, fetchMock as typeof fetch);
    const requestId = paypalRequestId('print-shop', 'create', 'order_1');
    const created = await client.createOrder({
      internalOrderId: 'order_1',
      orderNumber: 'ST-2026-ORDER1',
      amountCents: 1234,
    }, requestId);

    expect(created.id).toBe('PAYPAL-ORDER-123');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const createCall = fetchMock.mock.calls[1];
    expect(createCall[0]).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders');
    expect(createCall[1].headers['PayPal-Request-Id']).toBe(requestId);
    expect(JSON.parse(createCall[1].body)).toMatchObject({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: 'order_1',
        custom_id: 'order_1',
        invoice_id: 'ST-2026-ORDER1',
        amount: { currency_code: 'EUR', value: '12.34' },
      }],
    });

    await expect(client.verifyWebhook({}, {})).rejects.toBeInstanceOf(
      PayPalConfigurationError,
    );
  });

  it('fails closed for live checkout until a webhook is configured', () => {
    const config = loadPayPalOrdersConfig({
      PAYPAL_ENVIRONMENT: 'live',
      PAYPAL_CLIENT_ID: 'public-client-id',
      PAYPAL_CLIENT_SECRET: 'private-secret',
    } as NodeJS.ProcessEnv);
    expect(paypalPublicConfig(config)).toEqual({
      enabled: false,
      checkoutEnabled: false,
      webhookReady: false,
      environment: 'live',
      clientId: null,
    });
    const client = new PayPalOrdersClient(config, vi.fn() as any);
    expect(() => client.assertCheckoutConfigured()).toThrow(PayPalConfigurationError);
  });

  it('verifies webhook signatures only with all transmission fields and webhook ID', async () => {
    const config = loadPayPalOrdersConfig({
      PAYPAL_ENVIRONMENT: 'live',
      PAYPAL_CLIENT_ID: 'client',
      PAYPAL_CLIENT_SECRET: 'secret',
      PAYPAL_WEBHOOK_ID: 'WH-123',
    } as NodeJS.ProcessEnv);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ verification_status: 'SUCCESS' }));
    const client = new PayPalOrdersClient(config, fetchMock as typeof fetch);
    expect(await client.verifyWebhook({
      transmissionId: 'tx',
      transmissionTime: 'time',
      certUrl: 'https://paypal.test/cert',
      authAlgo: 'SHA256withRSA',
      transmissionSig: 'sig',
    }, { id: 'event' })).toBe(true);
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api-m.paypal.com/v1/notifications/verify-webhook-signature',
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      webhook_id: 'WH-123',
      transmission_id: 'tx',
      webhook_event: { id: 'event' },
    });
  });

  it('rejects invalid environments and parses monetary values without floats', () => {
    expect(() => loadPayPalOrdersConfig({
      PAYPAL_ENVIRONMENT: 'production',
    } as NodeJS.ProcessEnv)).toThrow(PayPalConfigurationError);
    expect(paypalValueToCents('10.01')).toBe(1001);
    expect(paypalValueToCents('10.1')).toBeNull();
    expect(paypalValueToCents('not-money')).toBeNull();
  });
});
