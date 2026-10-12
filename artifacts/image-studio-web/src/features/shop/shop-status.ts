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

// ---------------------------------------------------------------------------
// Testi per lo studio
// ---------------------------------------------------------------------------

export const ADMIN_STATUS_LABELS: Record<ShopOrderDto['fulfillmentStatus'], string> = {
  draft: 'Bozza',
  awaiting_payment: 'In attesa di pagamento',
  awaiting_photos: 'Mancano le foto',
  photos_received: 'Da lavorare',
  in_production: 'In lavorazione',
  ready_for_pickup: 'Pronto per il ritiro',
  shipped: 'Spedito',
  delivered: 'Consegnato',
  cancelled: 'Annullato',
};

export const ADMIN_ACTION_LABELS: Record<'in_production' | 'ready_for_pickup' | 'shipped' | 'delivered' | 'cancelled', string> = {
  in_production: 'Inizia la lavorazione',
  ready_for_pickup: 'Segna pronto per il ritiro',
  shipped: 'Segna come spedito',
  delivered: 'Segna come consegnato',
  cancelled: 'Annulla l\u2019ordine',
};

export const MAIL_KIND_LABELS: Record<string, string> = {
  order_confirmed: 'Conferma ordine',
  photos_reminder: 'Promemoria foto',
  photos_received: 'Foto ricevute',
  photo_rejected: 'Foto da sostituire',
  ready_for_pickup: 'Pronto per il ritiro',
  shipped: 'Spedito',
  delivered: 'Consegnato',
  cancelled: 'Annullato',
  refunded: 'Rimborsato',
  admin_new_order: 'Avviso nuovo ordine (a te)',
  admin_photos_complete: 'Avviso foto complete (a te)',
  admin_photos_overdue: 'Avviso foto in ritardo (a te)',
  admin_refund_after_shipping: 'Avviso rimborso dopo spedizione (a te)',
  admin_reconcile: 'Avviso pagamento da controllare (a te)',
};

export function mailKindLabel(kind: string): string {
  if (MAIL_KIND_LABELS[kind]) return MAIL_KIND_LABELS[kind];
  const base = kind.replace(/_\d+$/, '');
  return MAIL_KIND_LABELS[base] ?? kind;
}
