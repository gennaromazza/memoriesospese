import { describe, expect, it } from 'vitest';
import { captureFromWebhook, extractCompletedCapture } from './paypal-capture.js';

const order = (captures: any[], extra: Record<string, unknown> = {}) => ({
  id: 'PP-ORDER-1',
  status: 'COMPLETED',
  payer: { email_address: 'payer@example.com' },
  purchase_units: [
    {
      custom_id: 'order_1',
      invoice_id: 'SH-2026-ABCDEFGH-A1',
      payee: { merchant_id: 'MERCH' },
      payments: { captures },
      ...extra,
    },
  ],
});

const capture = (patch: Record<string, unknown> = {}) => ({
  id: 'CAP-1',
  status: 'COMPLETED',
  amount: { value: '20.90', currency_code: 'EUR' },
  seller_receivable_breakdown: { paypal_fee: { value: '0.95', currency_code: 'EUR' } },
  ...patch,
});

describe('extractCompletedCapture', () => {
  it('legge importo, riferimenti, commissione e pagante', () => {
    expect(extractCompletedCapture(order([capture()]))).toMatchObject({
      captureId: 'CAP-1',
      paypalOrderId: 'PP-ORDER-1',
      amountCents: 2090,
      currency: 'EUR',
      status: 'COMPLETED',
      customId: 'order_1',
      invoiceId: 'SH-2026-ABCDEFGH-A1',
      merchantId: 'MERCH',
      payerEmail: 'payer@example.com',
      paypalFeeCents: 95,
    });
  });

  it('ignora catture non completate o senza importo e prende la prima valida', () => {
    expect(extractCompletedCapture(order([capture({ status: 'PENDING' })]))).toBeNull();
    expect(extractCompletedCapture(order([capture({ amount: undefined })]))).toBeNull();
    expect(extractCompletedCapture(order([]))).toBeNull();
    expect(extractCompletedCapture({ id: 'x' })).toBeNull();
    const result = extractCompletedCapture(order([capture({ status: 'DECLINED' }), capture({ id: 'CAP-2' })]));
    expect(result?.captureId).toBe('CAP-2');
  });

  it('la commissione manca se non è in euro o non è positiva', () => {
    const usd = capture({ seller_receivable_breakdown: { paypal_fee: { value: '1.00', currency_code: 'USD' } } });
    expect(extractCompletedCapture(order([usd]))?.paypalFeeCents).toBeUndefined();
    const zero = capture({ seller_receivable_breakdown: { paypal_fee: { value: '0.00', currency_code: 'EUR' } } });
    expect(extractCompletedCapture(order([zero]))?.paypalFeeCents).toBeUndefined();
    expect(extractCompletedCapture(order([capture({ seller_receivable_breakdown: undefined })]))?.paypalFeeCents).toBeUndefined();
  });
});

describe('captureFromWebhook', () => {
  const event = (resource: Record<string, unknown>) => ({ id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource });

  it('legge una cattura da un evento webhook', () => {
    const result = captureFromWebhook(event({
      id: 'CAP-9',
      status: 'COMPLETED',
      amount: { value: '15.00', currency_code: 'EUR' },
      custom_id: 'order_9',
      invoice_id: 'INV-9',
      supplementary_data: { related_ids: { order_id: 'PP-ORDER-9' } },
      seller_receivable_breakdown: { paypal_fee: { value: '0.80', currency_code: 'EUR' } },
    }));
    expect(result).toMatchObject({ captureId: 'CAP-9', paypalOrderId: 'PP-ORDER-9', amountCents: 1500, customId: 'order_9', invoiceId: 'INV-9', paypalFeeCents: 80 });
  });

  it('restituisce null se mancano cattura, ordine PayPal o importo', () => {
    expect(captureFromWebhook(event({ amount: { value: '1.00' }, supplementary_data: { related_ids: { order_id: 'x' } } }))).toBeNull();
    expect(captureFromWebhook(event({ id: 'c', amount: { value: '1.00' } }))).toBeNull();
    expect(captureFromWebhook(event({ id: 'c', supplementary_data: { related_ids: { order_id: 'x' } } }))).toBeNull();
    expect(captureFromWebhook(undefined)).toBeNull();
  });
});
