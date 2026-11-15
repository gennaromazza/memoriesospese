import React, { useState } from 'react';
import type { BookingApprovalResult } from '@workspace/api-client-react';
import { BookingApprovalButton } from '../../src/components/booking/BookingApprovalButton';
import { BookingPaymentPanel } from '../../src/components/booking/BookingPaymentPanel';
import { approveBooking } from '../../src/lib/bookings';

const bookingId = 'booking-browser-approved';
const campaignId = 'campaign-browser-approved';
const token = 'c'.repeat(64);
const storageKey = 'booking-deposit-browser-harness';
const scenario = new URLSearchParams(window.location.search).get('scenario') || 'success';

export default function AdminApprovalHarness() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<BookingApprovalResult | null>(null);
  const [error, setError] = useState('');

  const approve = async () => {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const approval = await approveBooking(bookingId);
      setResult(approval);
      if (approval.paymentRequired && approval.expiresAt && approval.amountCents) {
        const serverTime = new Date().toISOString();
        const approvedBookingId = approval.bookingId ?? bookingId;
        window.localStorage.setItem(storageKey, JSON.stringify({
          scenario,
          calls: [{ name: 'admin-approval', detail: { bookingId: approvedBookingId, amountCents: approval.amountCents, expiresAt: approval.expiresAt } }],
          bookingId: approvedBookingId,
          campaignId,
          flow: 'approved',
          status: 'unpaid',
          emailStatus: approval.emailStatus,
          adminPayment: {
            bookingId: approvedBookingId,
            campaignId,
            campaignName: 'Campagna di prova',
            stage: 'in_attesa_pagamento',
            flow: 'approved',
            amountCents: approval.amountCents,
            paidAmountCents: null,
            currency: approval.currency ?? 'EUR',
            expiresAt: approval.expiresAt,
            serverTime,
            paymentStatus: 'unpaid',
            method: 'paypal',
            paypalOrderId: null,
            paypalCaptureId: null,
            paypalFeeCents: null,
            netCents: null,
            providerStatus: null,
            emailStatus: approval.emailStatus,
            canResend: true,
            resendReason: null,
            resendAvailableAt: null,
            canVerify: false,
            payable: true,
            payabilityReason: null,
            customerName: 'Cliente di prova',
            customerEmail: 'cliente@example.test',
            shootingStart: '2030-12-01T09:00:00.000Z',
            shootingEnd: '2030-12-01T09:30:00.000Z',
          },
          hold: {
            bookingId: approvedBookingId,
            campaignId,
            flow: 'approved',
            status: 'active',
            depositAmountCents: approval.amountCents,
            currency: approval.currency ?? 'EUR',
            expiresAt: approval.expiresAt,
            serverTime,
            dataShootingInizio: '2030-12-01T09:00:00.000Z',
            dataShootingFine: '2030-12-01T09:30:00.000Z',
            token,
          },
          payment: null,
          released: false,
          resolveCapture: false,
        }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Approvazione non riuscita');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl space-y-5 p-6">
      <h1 className="text-2xl font-semibold">Prenotazione da approvare</h1>
      <dl className="space-y-2 rounded-lg border p-4">
        <div><dt className="text-sm text-muted-foreground">Cliente</dt><dd>Cliente di prova</dd></div>
        <div><dt className="text-sm text-muted-foreground">Stato</dt><dd data-testid="admin-booking-status">{result ? 'In attesa di pagamento' : 'Da approvare'}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Acconto</dt><dd>25,00 €</dd></div>
      </dl>
      {!result && <BookingApprovalButton
        bookingId={bookingId}
        requiresDeposit
        placement="detail"
        isPending={pending}
        onApprove={() => { void approve(); }}
      />}
      {result?.paymentRequired && <>
        <p data-testid="approved-deadline">Scadenza invariata: {result.expiresAt}</p>
        <p data-testid="admin-approval-email-status">Richiesta email: {result.emailStatus}</p>
        <BookingPaymentPanel bookingId={result.bookingId ?? bookingId} userId="staff-test" />
        {result.emailStatus === 'sent' && <section className="rounded-lg border bg-muted p-4">
          <h2 className="font-medium">Posta inviata simulata</h2>
          <p className="my-2 text-sm">La mail contiene il link personale per completare l’acconto.</p>
          <a data-testid="simulated-deposit-email-link"
            className="underline"
            href={`/prenota/acconto/${result.bookingId ?? bookingId}#${token}`}>
            Apri il link della mail di prova
          </a>
        </section>}
      </>}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
