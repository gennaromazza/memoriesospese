import { paypalValueToCents, type PayPalOrderResponse } from '../print-shop/paypal-orders.js';
import { cleanText } from './text.js';

/** Pagamento PayPal completato, come lo leggiamo da una risposta o da un webhook. */
export interface CompletedCapture {
  captureId: string;
  paypalOrderId: string;
  amountCents: number;
  currency: string;
  status: string;
  customId?: string;
  invoiceId?: string;
  merchantId?: string;
  payerEmail?: string;
  paypalFeeCents?: number;
  raw?: unknown;
}

function paypalFeeFields(breakdown: any, captureCurrency: unknown, currency: string): { paypalFeeCents?: number } {
  const fee = paypalValueToCents(breakdown?.paypal_fee?.value);
  if (fee === null || fee <= 0 || String(breakdown?.paypal_fee?.currency_code || captureCurrency || '') !== currency) {
    return {};
  }
  return { paypalFeeCents: fee };
}

/** La prima cattura completata di un ordine PayPal, oppure null. */
export function extractCompletedCapture(response: PayPalOrderResponse, currency = 'EUR'): CompletedCapture | null {
  for (const unit of response.purchase_units || []) {
    for (const capture of unit.payments?.captures || []) {
      const amountCents = paypalValueToCents(capture.amount?.value);
      if (typeof capture.id !== 'string' || String(capture.status || '').toUpperCase() !== 'COMPLETED' || amountCents === null) {
        continue;
      }
      return {
        captureId: capture.id,
        paypalOrderId: response.id,
        amountCents,
        currency: String(capture.amount?.currency_code || ''),
        status: String(capture.status),
        customId: cleanText(unit.custom_id, 200),
        invoiceId: cleanText(unit.invoice_id, 200),
        merchantId: cleanText(unit.payee?.merchant_id || capture.payee?.merchant_id, 200),
        payerEmail: cleanText(response.payer?.email_address, 254),
        ...paypalFeeFields(capture.seller_receivable_breakdown, capture.amount?.currency_code, currency),
        raw: response,
      };
    }
  }
  return null;
}

/** La cattura descritta da un evento webhook (completata, rifiutata, ...), oppure null se incompleto. */
export function captureFromWebhook(event: any, currency = 'EUR'): CompletedCapture | null {
  const resource = event?.resource || {};
  const amountCents = paypalValueToCents(resource.amount?.value);
  const captureId = cleanText(resource.id, 200);
  const paypalOrderId = cleanText(resource.supplementary_data?.related_ids?.order_id, 200);
  if (!captureId || !paypalOrderId || amountCents === null) return null;
  return {
    captureId,
    paypalOrderId,
    amountCents,
    currency: String(resource.amount?.currency_code || ''),
    status: String(resource.status || ''),
    customId: cleanText(resource.custom_id, 200),
    invoiceId: cleanText(resource.invoice_id, 200),
    merchantId: cleanText(resource.payee?.merchant_id, 200),
    payerEmail: cleanText(resource.payer?.email_address, 254),
    ...paypalFeeFields(resource.seller_receivable_breakdown, resource.amount?.currency_code, currency),
    raw: event,
  };
}
