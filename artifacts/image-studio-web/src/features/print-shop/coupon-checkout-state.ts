import type { PrintShopQuote } from '@shared/print-shop-types';

export interface CouponCheckoutSnapshot {
  quote: PrintShopQuote | null;
  couponCode: string;
  couponDraft: string;
}

export interface CouponCheckoutFailure extends CouponCheckoutSnapshot {
  message: string;
  isError: true;
  needsMorePrints: boolean;
}

export interface CouponCheckoutSuccess extends CouponCheckoutSnapshot {
  message: string;
  isError: false;
  needsMorePrints: false;
}

export function couponDraftDiffersFromApplied(appliedCode: string, draft: string): boolean {
  return Boolean(appliedCode) && draft.trim().toUpperCase() !== appliedCode.trim().toUpperCase();
}

export function applyCouponQuote(
  current: CouponCheckoutSnapshot,
  serverQuote: PrintShopQuote,
): CouponCheckoutSuccess {
  const appliedCode = serverQuote.coupon?.code || '';

  return {
    ...current,
    quote: serverQuote,
    couponCode: appliedCode,
    couponDraft: appliedCode,
    message: appliedCode ? `Coupon ${appliedCode} applicato.` : 'Coupon rimosso.',
    isError: false,
    needsMorePrints: false,
  };
}

export function preserveCouponCheckoutOnFailure(
  current: CouponCheckoutSnapshot,
  message: string,
  errorCode?: string,
): CouponCheckoutFailure {
  return {
    ...current,
    message,
    isError: true,
    needsMorePrints: errorCode === 'coupon_min_quantity_not_met',
  };
}
