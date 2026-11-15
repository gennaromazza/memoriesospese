import React from 'react';
import { BookingPaymentCheckouts } from '../../src/components/booking/BookingPaymentCheckouts';
import { BookingPaymentPanel } from '../../src/components/booking/BookingPaymentPanel';

const storageKey = 'booking-deposit-browser-harness';
const ids = {
  active: 'checkout-active-test',
  review: 'checkout-review-test',
  approved: 'booking-approved-test',
  expired: 'booking-expired-test',
  paid: 'booking-paid-test',
};

function payment(bookingId: string, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  const base = {
    bookingId,
    campaignId: 'campaign-recovery-test',
    campaignName: 'Campagna di prova',
    stage: 'in_attesa_pagamento',
    flow: 'immediate',
    amountCents: 2500,
    paidAmountCents: null,
    currency: 'EUR',
    expiresAt: new Date(now + 3_600_000).toISOString(),
    serverTime: new Date(now).toISOString(),
    paymentStatus: 'unpaid',
    method: 'paypal',
    paypalOrderId: `ORDER-${bookingId}`,
    paypalCaptureId: null,
    paypalFeeCents: null,
    netCents: null,
    providerStatus: 'APPROVED',
    emailStatus: null,
    canResend: false,
    resendReason: 'Il checkout immediato non prevede un’email di richiesta acconto.',
    resendAvailableAt: null,
    canVerify: true,
    payable: true,
    payabilityReason: null,
    customerName: bookingId.includes('review') ? 'Cliente con pagamento da riconciliare' : 'Cliente con checkout aperto',
    customerEmail: `${bookingId}@example.test`,
    shootingStart: '2030-12-01T09:00:00.000Z',
    shootingEnd: '2030-12-01T09:30:00.000Z',
  };
  return { ...base, ...overrides };
}

function ensureFixtures() {
  const saved = window.localStorage.getItem(storageKey);
  const existing = saved ? JSON.parse(saved) : {};
  if (existing.recoveryCheckouts) return;

  const active = payment(ids.active);
  const review = payment(ids.review, {
    stage: 'pagamento_da_verificare',
    flow: 'approved',
    paymentStatus: 'review',
    paidAmountCents: 2500,
    paypalCaptureId: 'CAPTURE-LATE-TEST',
    paypalFeeCents: 100,
    netCents: 2400,
    providerStatus: 'COMPLETED',
    canResend: false,
    resendReason: 'Incasso o dati della richiesta da riconciliare. Non chiedere un altro pagamento.',
  });
  const approved = payment(ids.approved, {
    flow: 'approved',
    emailStatus: 'sent',
    canResend: true,
    resendReason: null,
  });
  const expired = payment(ids.expired, {
    stage: 'scaduta',
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
    emailStatus: 'sent',
    flow: 'approved',
    canResend: false,
    resendReason: 'La richiesta è scaduta. Occorre una nuova prenotazione.',
  });
  const paid = payment(ids.paid, {
    stage: 'confermata',
    paymentStatus: 'paid',
    paidAmountCents: 2500,
    paypalCaptureId: 'CAPTURE-PAID-TEST',
    paypalFeeCents: 100,
    netCents: 2400,
    providerStatus: 'COMPLETED',
    emailStatus: 'sent',
    flow: 'approved',
    canResend: false,
    resendReason: 'L’acconto è già stato ricevuto.',
  });
  window.localStorage.setItem(storageKey, JSON.stringify({
    ...existing,
    scenario: 'admin-recovery',
    calls: [],
    recoveryCheckouts: [active, review],
    adminPayments: {
      [ids.active]: active,
      [ids.review]: review,
      [ids.approved]: approved,
      [ids.expired]: expired,
      [ids.paid]: paid,
    },
  }));
}

export default function AdminPaymentRecoveryHarness() {
  ensureFixtures();
  const params = new URLSearchParams(window.location.search);
  const caseName = params.get('case');
  const selectedId = caseName && caseName in ids ? ids[caseName as keyof typeof ids] : null;
  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">Recupero pagamenti di prova</h1>
      {selectedId
        ? <BookingPaymentPanel key={selectedId} bookingId={selectedId} userId="staff-test" />
        : <BookingPaymentCheckouts
            userId="staff-test"
            existingIds={[]}
            campaignFilter="all"
            activeCampaignIds={['campaign-recovery-test']}
            statusFilter="all"
            search=""
          />}
    </main>
  );
}
