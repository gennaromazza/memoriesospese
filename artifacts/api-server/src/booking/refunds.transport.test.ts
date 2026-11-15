import { describe, it, expect, vi } from 'vitest';
import { PayPalOrdersClient } from '../print-shop/paypal-orders.js';
describe('PayPal refund transport', () => {
  it('uses a short stable idempotency key, full fixed EUR amount and GET-only verification', async () => {
    const transport = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(
      String(url).includes('/oauth2/token') ? { access_token: 'fake-token', expires_in: 3600 } : { id: 'REFUND12345', status: 'COMPLETED' }
    ), { status: 200 }));
    const client = new PayPalOrdersClient({ environment: 'sandbox', clientId: 'fake', clientSecret: 'fake', webhookId: 'fake' }, transport);
    await client.refundCapture('CAPTURE12345', 2000, 'a'.repeat(32));
    await client.getRefund('REFUND12345');
    const calls = transport.mock.calls as unknown as [string, RequestInit][];
    expect(calls[1][0]).toBe('https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE12345/refund');
    expect(calls[1][1].headers).toMatchObject({ 'PayPal-Request-Id': 'a'.repeat(32), Prefer: 'return=representation' });
    expect(JSON.parse(calls[1][1].body as string)).toMatchObject({ amount: { value: '20.00', currency_code: 'EUR' }, custom_id: 'a'.repeat(32) });
    expect(calls[2][1].method).toBe('GET');
    await expect(client.refundCapture('CAPTURE12345', -1, 'a'.repeat(32))).rejects.toThrow();
    await expect(client.getRefund('../another')).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(3);
  });
});
