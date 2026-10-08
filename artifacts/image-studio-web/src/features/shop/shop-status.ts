import type { ShopOrderDto } from '@shared/shop-types';

export type ShopStatusTone = 'neutral' | 'wait' | 'ok' | 'bad';

export interface ShopStatusInfo {
  label: string;
  tone: ShopStatusTone;
}

/** Stato dell'ordine in parole semplici, per chi ha comprato. */
export function shopStatusInfo(order: Pick<ShopOrderDto, 'fulfillmentStatus' | 'paymentStatus'>): ShopStatusInfo {
  if (order.paymentStatus === 'refunded') return { label: 'Rimborsato', tone: 'bad' };
  if (order.paymentStatus === 'paid_action_required') return { label: 'Da verificare con lo studio', tone: 'wait' };
  switch (order.fulfillmentStatus) {
    case 'draft':
      return { label: 'Da completare', tone: 'neutral' };
    case 'awaiting_payment':
      return { label: 'In attesa di pagamento', tone: 'wait' };
    case 'awaiting_photos':
      return { label: 'Mancano delle foto', tone: 'wait' };
    case 'photos_received':
      return { label: 'Foto ricevute', tone: 'ok' };
    case 'in_production':
      return { label: 'In lavorazione', tone: 'ok' };
    case 'ready_for_pickup':
      return { label: 'Pronto per il ritiro', tone: 'ok' };
    case 'shipped':
      return { label: 'Spedito', tone: 'ok' };
    case 'delivered':
      return { label: 'Consegnato', tone: 'ok' };
    case 'cancelled':
      return { label: 'Annullato', tone: 'bad' };
  }
}

/** Che cosa deve fare ancora il cliente, se qualcosa. */
export function shopNextStep(order: Pick<ShopOrderDto, 'fulfillmentStatus' | 'paymentStatus' | 'photosMissing' | 'canUploadPhotos' | 'canEdit'>): string | null {
  if (order.canEdit) return 'Completa l\u2019ordine e paga per confermarlo.';
  if (order.canUploadPhotos && order.photosMissing > 0) {
    return order.photosMissing === 1 ? 'Carica la foto che manca.' : `Carica le ${order.photosMissing} foto che mancano.`;
  }
  return null;
}
