import { createHash, timingSafeEqual } from 'node:crypto';
import type { BookingCheckoutHoldView } from '@workspace/api-zod';
import { checkoutHoldBlocksSlot } from './slot-reservations.js';

export class CheckoutHoldError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export const hashCheckoutToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function authorizeCheckoutHold(data: FirebaseFirestore.DocumentData | undefined, token: string): FirebaseFirestore.DocumentData {
  const candidate = hashCheckoutToken(token);
  if (!data || typeof data.tokenHash !== 'string' || data.tokenHash.length !== candidate.length
    || !timingSafeEqual(Buffer.from(data.tokenHash), Buffer.from(candidate))) {
    throw new CheckoutHoldError(404, 'Checkout non trovato');
  }
  return data;
}
export function activeCheckoutHoldView(bookingId: string, data: FirebaseFirestore.DocumentData): BookingCheckoutHoldView {
  const now = Date.now();
  if (data.status === 'expired') throw new CheckoutHoldError(410, 'Checkout scaduto: scegli nuovamente lo slot');
  if (data.status !== 'active') throw new CheckoutHoldError(409, 'Checkout già chiuso');
  if (!Number.isFinite(data.expiresAt?.toMillis?.())) throw new CheckoutHoldError(503, 'Checkout da verificare con lo studio');
  if (!checkoutHoldBlocksSlot(data, now)) throw new CheckoutHoldError(410, 'Checkout scaduto: scegli nuovamente lo slot');
  return { bookingId, campaignId: data.campaignId, status: 'active', expiresAt: data.expiresAt.toDate(),
    serverTime: new Date(now), depositAmountCents: data.depositAmountCents, currency: 'EUR' };
}
