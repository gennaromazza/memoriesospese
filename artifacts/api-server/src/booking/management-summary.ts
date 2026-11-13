import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import type { BookingManagementView } from '@workspace/api-zod';
import { bookingPaymentMillis } from '@shared/booking-payment-state';

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const date = (value: unknown) => {
  const millis = bookingPaymentMillis(value);
  return millis !== null && Number.isFinite(new Date(millis).getTime()) ? new Date(millis) : null;
};
/** Explicit customer projection. Never spread the trusted Firestore document into this DTO. */
export async function bookingManagementView(db: Firestore, bookingId: string, booking: DocumentData): Promise<BookingManagementView> {
  const { getStudioContactInfo } = await import('../email-routes.js');
  const studio = await getStudioContactInfo();
  const campaign = typeof booking.campaignId === 'string' && booking.campaignId
    ? (await db.collection('booking_campaigns').doc(booking.campaignId).get()).data() : undefined;
  const statuses: Record<string, BookingManagementView['status']> = {
    confermata: 'confirmed', completata: 'completed', annullata: 'cancelled', cancellation_pending: 'cancellation_pending',
  };
  const receipt = booking.depositPayment;
  const manualCents = typeof booking.acconto === 'number' && Number.isFinite(booking.acconto) && booking.acconto >= 0
    ? Math.round(booking.acconto * 100) : null;
  const paid = receipt?.status === 'paid' && receipt.currency === 'EUR' && Number.isSafeInteger(receipt.amountCents)
    ? receipt.amountCents : manualCents;
  const email = text(studio.email), phone = text(studio.phone);
  return {
    success: true, bookingId, status: statuses[booking.stato],
    campaignName: text(booking.campaignName) || text(campaign?.nome),
    startsAt: date(booking.dataShootingInizio), endsAt: date(booking.dataShootingFine),
    customerName: [text(booking.cliente?.nome), text(booking.cliente?.cognome)].filter(Boolean).join(' ') || null,
    productName: text(booking.prodottoNome), depositPaidCents: paid,
    studio: { name: text(studio.name), address: text(studio.address),
      email: email && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email) ? email : null,
      phone: phone && /^\+?[0-9][0-9 ().-]{4,30}$/.test(phone) ? phone : null },
  };
}
