import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { bookingPaymentMillis } from '@shared/booking-payment-state';
import { ensureBookingManagementLink } from './management-access.js';

export interface PreparedBookingConfirmation { to: string; subject: string; html: string; managementTokenHash: string }
/** Compose before claiming the provider send: failures here cannot have delivered an email. */
export async function preparePaidBookingConfirmation(db: Firestore, id: string, booking: DocumentData): Promise<PreparedBookingConfirmation> {
  const start = bookingPaymentMillis(booking.dataShootingInizio), end = bookingPaymentMillis(booking.dataShootingFine);
  if (start === null || end === null || end <= start) throw new Error('Orario della prenotazione da verificare');
  const { createBookingConfirmedEmailHTML, getStudioContactInfo, generateGoogleCalendarLink } = await import('../email-routes.js');
  const campaign = (await db.collection('booking_campaigns').doc(booking.campaignId).get()).data();
  const studio = await getStudioContactInfo(), url = await ensureBookingManagementLink(db, id, undefined, booking.cliente.email);
  const name = `${booking.cliente.nome} ${booking.cliente.cognome}`, campaignName = String(campaign?.nome || 'Servizio fotografico');
  const begin = new Date(start), finish = new Date(end);
  const date = begin.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });
  const time = (value: Date) => value.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
  const calendarLink = generateGoogleCalendarLink({ title: `Shooting ${campaignName} - ${name}`,
    location: studio.address || 'Studio fotografico', startDate: begin, endDate: finish });
  return { to: booking.cliente.email, subject: `Prenotazione Confermata - ${campaignName}`,
    managementTokenHash: createHash('sha256').update(new URL(url).hash.slice(1)).digest('hex'),
    html: createBookingConfirmedEmailHTML(name, campaignName, date, `${time(begin)} - ${time(finish)}`,
      Math.round((end - start) / 60_000), booking.prodottoNome, booking.note, studio, calendarLink, undefined, url) };
}
