import type { PrintShopPublicPromotion } from './print-shop-types';

export const PRINT_PROMOTION_ROUTE_PREFIX = '/stampa-foto-aversa/offerte';
export const PRINT_PROMOTION_OG_IMAGE = '/images/print-service/print-promotions-og.jpg';

export function printPromotionPath(code: string): string {
  const normalizedCode = String(code || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,32}$/.test(normalizedCode)) {
    throw new Error('Codice promozione non valido');
  }
  return `${PRINT_PROMOTION_ROUTE_PREFIX}/${encodeURIComponent(normalizedCode)}`;
}

export function formatPrintPromotionOffer(promotion: PrintShopPublicPromotion): string {
  const euro = (cents: number) => new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Math.max(0, cents) / 100);

  if (promotion.discountType === 'percentage') return `${promotion.value}% di sconto`;
  if (promotion.discountType === 'fixed_total') {
    return `${promotion.minPrintQuantity} stampe a ${euro(promotion.value)}`;
  }
  return `${euro(promotion.value)} di sconto`;
}
