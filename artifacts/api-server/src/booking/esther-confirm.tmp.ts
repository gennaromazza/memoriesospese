import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { DateTime } from 'luxon';
import { db } from '../firebase-admin.js';
import { createEvent, deleteEvent, getEventById, checkFreeBusy, resolveCalendarId } from '../google-calendar.js';
import { campaignToAvailabilityConfig, getAllExistingBookingEvents } from './calendar-adapter.js';
import { getAvailableSlotsForDate } from '../calendar-engine/index.js';
import { checkAdminConfirmation, commitAdminConfirmation, isExpiredUnpaidDepositCancellation } from './admin-status-confirmation.js';
import { syncBookingWorkflowState } from '../../shared/workflow-helpers.js';
import { ensureBookingManagementLink } from './management-access.js';
import { createBookingConfirmedEmailHTML, generateGoogleCalendarLink, getStudioContactInfo, sendGmailEmail } from '../email-routes.js';

const id = 'cXjMQyCUMFUw1A8Td0QH', campaignId = 'QDjUJFzRpOwe7Rbc6i0b', name = 'Ester Orabona';
async function main() {
  const ref = db.collection('bookings').doc(id), booking = (await ref.get()).data();
  const campaign = (await db.collection('booking_campaigns').doc(campaignId).get()).data();
  const actionRef = db.collection('bookingAdminActions').doc(`confirm_without_deposit_${id}`);
  if (!booking || `${booking.cliente?.nome} ${booking.cliente?.cognome}`.trim() !== name
    || booking.campaignId !== campaignId || !isExpiredUnpaidDepositCancellation(booking)
    || !campaign?.attiva || campaign.nome !== 'Natale 2026' || (await actionRef.get()).exists)
    throw new Error('Prenotazione non più eleggibile o operazione già eseguita.');
  await checkAdminConfirmation(db, id, booking, true);
  const start = booking.dataShootingInizio.toDate(), end = booking.dataShootingFine.toDate();
  const day = DateTime.fromJSDate(start, { zone: 'Europe/Rome' });
  const busy = await checkFreeBusy('primary', start, end);
  const events = await getAllExistingBookingEvents(day.startOf('day').toJSDate(), day.endOf('day').toJSDate(), db, id);
  const slots = await getAvailableSlotsForDate(day.startOf('day').toJSDate(), campaignToAvailabilityConfig(campaign), events);
  if (busy.some(p => start < new Date(p.end) && end > new Date(p.start))
    || !slots.some(s => Math.abs(new Date(s.start).getTime() - start.getTime()) < 1000
      && Math.abs(new Date(s.end).getTime() - end.getTime()) < 1000))
    throw new Error('Slot non più disponibile.');
  const calendarId = await resolveCalendarId('primary');
  const eventId = createHash('sha256').update(`authorized-manual-confirmation:${id}`).digest('hex');
  await actionRef.create({ bookingId: id, action: 'confirm_without_deposit', status: 'preparing',
    authorizedBy: 'owner_chat', createdAt: Timestamp.now(), calendarId, calendarEventId: eventId });
  await createEvent(calendarId, { id: eventId, kind: 'booking', summary: `Shooting: ${name}`,
    description: `Prenotazione ${id} confermata manualmente dallo studio senza acconto. Pagamento in studio.`,
    start, end, location: 'Studio fotografico' });
  try {
    await commitAdminConfirmation(db, id, booking, { stato: 'confermata',
      ...syncBookingWorkflowState('confermata', booking.statoWorkflow), googleCalendarEventId: eventId,
      googleCalendarId: calendarId, confermataDa: 'owner_chat', confermatail: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp() }, 'owner_chat');
  } catch (error) {
    const current = (await ref.get()).data();
    if (current?.stato !== 'confermata' || current.googleCalendarEventId !== eventId) {
      await deleteEvent(calendarId, eventId);
      await actionRef.update({ status: 'failed', updatedAt: Timestamp.now() });
      throw error;
    }
  }
  await actionRef.update({ status: 'confirmed', updatedAt: Timestamp.now() });
  const current = (await ref.get()).data()!;
  if (current.stato !== 'confermata' || current.depositPayment || !current.depositWaiver)
    throw new Error('Verifica stato confermato non riuscita.');
  if (!(await getEventById(calendarId, eventId))) throw new Error('Evento Calendar non verificabile.');
  const studio = await getStudioContactInfo();
  const url = new URL(await ensureBookingManagementLink(db, id, undefined, booking.cliente.email));
  if (url.origin !== 'https://imagestudiofotografico.com') throw new Error('Link personale non sul dominio ufficiale.');
  const date = start.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', timeZone: 'Europe/Rome' });
  const time = (d: Date) => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
  const calendarLink = generateGoogleCalendarLink({ title: `Shooting ${campaign.nome} - ${name}`,
    startDate: start, endDate: end, location: studio.address || 'Studio fotografico' });
  const html = createBookingConfirmedEmailHTML(name, campaign.nome, date, `${time(start)} - ${time(end)}`,
    Math.round((end.getTime() - start.getTime()) / 60_000), booking.prodottoNome, booking.note, studio, calendarLink,
    undefined, url.toString()) + `<p>Pagamento in studio, senza acconto online.<br><strong>Comunicazione automatica: non rispondere.</strong>
    Per assistenza: ${studio.email} — ${studio.phone}</p>`;
  await actionRef.update({ emailStatus: 'sending', emailAttemptedAt: Timestamp.now() });
  try {
    await sendGmailEmail(booking.cliente.email, `Prenotazione Confermata - ${campaign.nome}`, html, undefined,
      { type: 'booking_confirmation', relatedDocId: id, relatedDocType: 'booking', clientName: name });
  } catch (error) {
    await actionRef.update({ emailStatus: 'unknown', updatedAt: Timestamp.now() });
    throw error;
  }
  await ref.update({ emailConfermataInviata: true });
  await actionRef.update({ emailStatus: 'sent', updatedAt: Timestamp.now() });
  const log = (await db.collection('emailLogs').where('relatedDocId', '==', id)
    .where('type', '==', 'booking_confirmation').get()).docs.at(-1)?.data();
  if (log?.status !== 'sent') throw new Error('Conferma registrata, ma log email non verificato: non ripetere l’invio.');
  console.log('CONFIRMED', JSON.stringify({ name, appointment: start.toLocaleString('it-IT',
    { timeZone: 'Europe/Rome' }), noDeposit: !current.depositPayment, calendarEvent: true,
    confirmationEmail: log.status, productionManagementLink: true }));
}
main().catch(error => { console.error('ESTHER_ACTION_STOPPED', error.code || error.name, error.message); process.exitCode = 1; })
  .finally(() => db.terminate());
