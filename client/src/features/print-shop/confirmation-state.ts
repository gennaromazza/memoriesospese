import type { PrintShopOrderListItem } from './types';

/**
 * Dall'URL accettiamo solo l'identificativo necessario a interrogare il
 * backend. Stato del pagamento e numero ordine arrivano esclusivamente dalla
 * risposta owner-authenticated di GET /orders/:id.
 */
export function readPrintShopConfirmationLocation(search: string): { orderId: string | null } {
  return { orderId: new URLSearchParams(search).get('orderId') };
}

export function printShopConfirmationFromOrder(order: PrintShopOrderListItem | null): {
  paid: boolean;
  actionRequired: boolean;
  orderNumber: string | null;
} {
  return {
    paid: order?.payment?.status === 'paid',
    actionRequired: order?.payment?.status === 'paid_action_required',
    orderNumber: order?.orderNumber || null,
  };
}
