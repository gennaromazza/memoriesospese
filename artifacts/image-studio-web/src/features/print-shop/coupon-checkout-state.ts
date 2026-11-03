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

export function couponDraftDiffersFromApplied(appliedCode: string, draft: string): boolean {
  return Boolean(appliedCode) && draft.trim().toUpperCase() !== appliedCode.trim().toUpperCase();
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
