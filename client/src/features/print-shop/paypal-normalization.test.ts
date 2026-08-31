import { describe, expect, it } from 'vitest';
import { normalizePaypalCapture } from './paypal-normalization';

describe('normalizePaypalCapture', () => {
  it('riconosce la risposta compatta status/captureId come pagamento riuscito', () => {
    expect(normalizePaypalCapture(
      { success: true, orderId: 'order-1', captureId: 'capture-1', status: 'paid' },
      'fallback-order',
      'paypal-1',
    )).toMatchObject({
      orderId: 'order-1',
      paypalOrderId: 'paypal-1',
      paypalCaptureId: 'capture-1',
      paymentStatus: 'paid',
    });
  });

  it('mantiene compatibilità con la risposta estesa', () => {
    expect(normalizePaypalCapture(
      { order: { orderNumber: 'ST-2026-ABC', paypalCaptureId: 'capture-2', paymentStatus: 'paid' } },
      'order-2',
      'paypal-2',
    )).toMatchObject({
      orderId: 'order-2',
      orderNumber: 'ST-2026-ABC',
      paypalCaptureId: 'capture-2',
      paymentStatus: 'paid',
    });
  });
});
