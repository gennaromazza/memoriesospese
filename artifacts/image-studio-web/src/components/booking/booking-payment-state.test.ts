import { describe, expect, it } from 'vitest';
import { bookingPaymentDeadline, bookingPaymentMillis, bookingPaymentStage, bookingPaymentStageLabel, matchesBookingPaymentFilter } from '@shared/booking-payment-state';

const now = Date.parse('2030-12-01T08:00:00Z');
const request = { status: 'pending', amountCents: 2500, requestedAt: new Date(now), expiresAt: new Date(now + 3_600_000) };
describe('booking payment presentation and filters', () => {
  it.each([
    [{ stato: 'in_attesa' }, 'in_attesa'],
    [{ stato: 'in_attesa', depositPaymentRequest: request }, 'in_attesa_pagamento'],
    [{ stato: 'in_attesa', depositPaymentRequest: { ...request, status: 'expired' } }, 'scaduta'],
    [{ stato: 'annullata', paymentReviewRequired: true }, 'pagamento_da_verificare'],
    [{ stato: 'confermata' }, 'confermata'],
    [{ stato: 'completata' }, 'completata'],
    [{ stato: 'annullata' }, 'annullata'],
    [{ stato: 'cancellata' }, 'annullata'],
    [{ stato: 'cancellation_pending' }, 'cancellation_pending'],
  ])('distinguishes %j as %s without modifying persisted states', (booking, expected) => {
    expect(bookingPaymentStage(booking, now)).toBe(expected);
    expect(matchesBookingPaymentFilter(booking, expected, now)).toBe(true);
    expect(bookingPaymentStageLabel(expected)).not.toBe('');
  });
  it('changes the filter at the exact deadline, without waiting for the worker', () => {
    const booking = { stato: 'in_attesa', depositPaymentRequest: request };
    expect(matchesBookingPaymentFilter(booking, 'in_attesa_pagamento', now + 3_599_999)).toBe(true);
    expect(matchesBookingPaymentFilter(booking, 'scaduta', now + 3_600_000)).toBe(true);
    expect(matchesBookingPaymentFilter(booking, 'all', now + 3_600_000)).toBe(false);
  });
  it('keeps reconciliation cases visible even if the root booking was cancelled', () => {
    expect(matchesBookingPaymentFilter({ stato: 'annullata', paymentReviewRequired: true }, 'all')).toBe(true);
    expect(matchesBookingPaymentFilter({ stato: 'cancellata' }, 'annullata')).toBe(true);
    expect(matchesBookingPaymentFilter({ stato: 'cancellation_pending' }, 'all')).toBe(false);
  });
  it('never expires an already verified paid booking', () => {
    expect(bookingPaymentStage({ stato: 'confermata', depositPaymentRequest: request,
      depositPayment: { status: 'paid', paypalCaptureId: 'CAPTURE' } }, now + 7_200_000)).toBe('confermata');
  });
  it.each([
    { ...request, expiresAt: 'not-a-date' }, { ...request, amountCents: 0 }, { ...request, status: 'paid' },
  ])('requires review for corrupt or unverified payment data %j', depositPaymentRequest => {
    expect(bookingPaymentStage({ stato: 'in_attesa', depositPaymentRequest }, now)).toBe('pagamento_da_verificare');
  });
  it('does not request another charge after a manual payment', () => {
    expect(bookingPaymentStage({ stato: 'in_attesa', acconto: 25, depositPaymentRequest: request }, now)).toBe('pagamento_da_verificare');
    expect(bookingPaymentStage({ stato: 'annullata', acconto: 25, depositPaymentRequest: { ...request, status: 'expired' } }, now + 7_200_000)).toBe('pagamento_da_verificare');
  });
  it.each([new Date(now), new Date(now).toISOString(), { toMillis: () => now }, { seconds: now / 1000 }, { _seconds: now / 1000 }])(
    'accepts SDK and REST timestamps %j', input => expect(bookingPaymentMillis(input)).toBe(now));
  it('does not extend the approved hour when a stored expiry is longer', () => {
    expect(bookingPaymentDeadline({ depositPaymentRequest: { ...request, expiresAt: new Date(now + 7_200_000) } })).toBe(now + 3_600_000);
    expect(bookingPaymentMillis({ toMillis: () => { throw new Error(); } })).toBeNull();
  });
  it('preserves nanoseconds in serialized SDK timestamps instead of expiring up to a second early', () => {
    expect(bookingPaymentMillis({ _seconds: now / 1000, _nanoseconds: 123_000_000 })).toBe(now + 123);
    expect(bookingPaymentMillis({ seconds: now / 1000, nanoseconds: 456_000_000 })).toBe(now + 456);
  });
});
