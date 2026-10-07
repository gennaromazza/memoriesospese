import { convertFirestoreTimestamp } from '@/lib/firebase';
import type { PrintShopFulfillmentStatus, PrintShopPaymentStatus } from '@shared/print-shop-types';

export const PRINT_ORDER_STATUS_LABELS: Record<PrintShopFulfillmentStatus, string> = {
  draft: 'Bozza',
  awaiting_payment: 'In attesa del pagamento',
  submitted: 'Ordine ricevuto',
  files_check: 'Controllo delle foto',
  ready_to_print: 'Pronto per la produzione',
  sent_to_laboratory: 'Inviato al laboratorio',
  printing: 'In stampa',
  ready_for_pickup: 'Pronto per il ritiro',
  delivered: 'Consegnato',
  cancelled: 'Annullato',
};

export const PRINT_PAYMENT_STATUS_LABELS: Record<PrintShopPaymentStatus | 'deferred', string> = {
  deferred: 'Pagamento alla consegna — da incassare',
  pending: 'Da pagare',
  paid: 'Pagato',
  failed: 'Pagamento non riuscito',
  expired: 'Pagamento scaduto',
  paid_action_required: 'Pagamento acquisito: contatta l’assistenza',
  partially_refunded: 'Rimborso parziale',
  refunded: 'Rimborsato',
};

export function printPaymentStatusLabel(status: string | null | undefined): string {
  if (status && Object.prototype.hasOwnProperty.call(PRINT_PAYMENT_STATUS_LABELS, status)) {
    return PRINT_PAYMENT_STATUS_LABELS[status as PrintShopPaymentStatus | 'deferred'];
  }
  return 'Stato non disponibile';
}

export function printOrderTotalLabel(status: string | null | undefined): string {
  return status === 'paid' ? 'Totale pagato' : status === 'deferred' ? 'Totale da incassare' : 'Totale ordine';
}

export function printOrderStatusTone(status: PrintShopFulfillmentStatus): string {
  if (status === 'ready_for_pickup') return 'border-emerald-200 bg-emerald-100 text-emerald-900';
  if (status === 'delivered') return 'border-sage/20 bg-sage/15 text-dark-sage';
  if (status === 'cancelled') return 'border-red-200 bg-red-100 text-red-800';
  if (status === 'draft' || status === 'awaiting_payment') return 'border-amber-200 bg-amber-100 text-amber-900';
  return 'border-sky-200 bg-sky-100 text-sky-900';
}

export function printPaymentStatusTone(status: string | null | undefined): string {
  if (status === 'paid') return 'text-emerald-700';
  if (status === 'paid_action_required' || status === 'failed') return 'text-red-700';
  if (status === 'expired') return 'text-gray-600';
  if (status === 'partially_refunded' || status === 'refunded') return 'text-sky-700';
  if (status === 'pending' || status === 'deferred') return 'text-amber-700';
  return 'text-gray-600';
}

export function formatPrintOrderDate(value: unknown): string {
  const date = convertFirestoreTimestamp(value);
  if (!date) return 'Data non disponibile';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  }).format(date);
}

export interface PrintPaymentAmounts { totalCents: number; collectedCents: number; dueCents: number }

/** Totale, incassato e residuo restano separati; un pagamento differito non vale incasso. */
export function printPaymentAmounts(order: {
  totals?: { totalCents?: number };
  payment?: { status?: string; collectedCents?: number; dueCents?: number };
}): PrintPaymentAmounts {
  const totalCents = order.totals?.totalCents ?? 0;
  const status = order.payment?.status;
  const collectedCents = typeof order.payment?.collectedCents === 'number'
    ? order.payment.collectedCents : status === 'paid' ? totalCents : 0;
  const dueCents = typeof order.payment?.dueCents === 'number'
    ? order.payment.dueCents : Math.max(0, totalCents - collectedCents);
  return { totalCents, collectedCents, dueCents };
}

export const MANUAL_PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Contanti', card: 'Carta / POS', bank_transfer: 'Bonifico', other: 'Altro', pay_on_delivery: 'Pagamento alla consegna', paypal: 'PayPal',
};
