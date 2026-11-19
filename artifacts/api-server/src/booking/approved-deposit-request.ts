import { vademecumEmailBlock } from '../vademecum-email.js';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Timestamp, type Firestore, type DocumentData } from 'firebase-admin/firestore';
import { CHECKOUT_HOLDS, checkSlotReservation, BookingSlotConflictError } from './slot-reservations.js';
import { CheckoutHoldError, hashCheckoutToken } from './checkout-hold-state.js';
import { createApprovedDepositRequest, unpaidDepositRequestExpired } from './payment-deadlines.js';
import { isApprovedDepositHold, assertApprovedDepositMatchesBooking } from './approved-deposit-state.js';
import { bookingPayPalClient } from './paypal-deposit-orders.js';

type EmailStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'unknown';
interface Studio { name: string; email: string; phone: string; address: string }
export interface ApprovedDepositDependencies {
  signingKey(): string;
  assertPayPalConfigured(): void;
  checkCalendar(start: Date, end: Date, campaign: DocumentData, bookingId: string, db: Firestore): Promise<void>;
  studio(): Promise<Studio>;
  send(to: string, subject: string, html: string, bookingId: string): Promise<void>;
}
const defaults: ApprovedDepositDependencies = {
  signingKey: () => {
    const key = process.env.SESSION_SECRET;
    if (!key || key.length < 32) throw new CheckoutHoldError(503, 'Configurazione del link di pagamento da verificare.');
    return key;
  },
  assertPayPalConfigured: () => bookingPayPalClient().assertCheckoutConfigured(),
  checkCalendar: async (start, end, campaign, bookingId, db) => {
    const { checkFreeBusy } = await import('../google-calendar.js');
    const busy = await checkFreeBusy('primary', start, end);
    for (const period of busy) {
      if (!period.start || !period.end || !Number.isFinite(Date.parse(period.start)) || !Number.isFinite(Date.parse(period.end))) {
        throw new CheckoutHoldError(503, 'Disponibilità calendario non verificabile.');
      }
      if (start < new Date(period.end) && end > new Date(period.start)) {
        throw new CheckoutHoldError(409, 'Lo slot è occupato sul calendario: scegli un altro orario.');
      }
    }
    const [{ validateCampaign, campaignToAvailabilityConfig, getAllExistingBookingEvents },
      { getAvailableSlotsForDate }, { DateTime }] = await Promise.all([
      import('./calendar-adapter.js'), import('../calendar-engine/index.js'), import('luxon'),
    ]);
    if (!validateCampaign(campaign)) throw new CheckoutHoldError(400, 'Configurazione della campagna incompleta.');
    const day = DateTime.fromJSDate(start, { zone: 'Europe/Rome' });
    const events = await getAllExistingBookingEvents(day.startOf('day').toJSDate(), day.endOf('day').toJSDate(), db, bookingId);
    const slots = await getAvailableSlotsForDate(day.startOf('day').toJSDate(), campaignToAvailabilityConfig(campaign), events);
    if (!slots.some(slot => Math.abs(new Date(slot.start).getTime() - start.getTime()) < 1000
      && Math.abs(new Date(slot.end).getTime() - end.getTime()) < 1000)) {
      throw new CheckoutHoldError(409, 'L’orario non è più disponibile secondo le regole della campagna.');
    }
  },
  studio: async () => (await import('../email-routes.js')).getStudioContactInfo(),
  send: async (to, subject, html, bookingId) => {
    await (await import('../email-routes.js')).sendGmailEmail(to, subject, html, undefined,
      { type: 'booking_deposit_request', relatedDocId: bookingId, relatedDocType: 'booking' });
  },
};
const tokenFor = (key: string, id: string, nonce: string) =>
  createHmac('sha256', key).update(`booking-approved-deposit:v1:${id}:${nonce}`).digest('hex');
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
// Verified through the deployment service, not request headers or development domains.
export const APPROVED_PAYMENT_SITE = 'https://imagestudiofotografico.com';
export function approvedDepositEmail(hold: any, campaignName: string, studio: Studio, token: string) {
  const price = (hold.depositAmountCents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  const deadline = hold.expiresAt.toDate().toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'long', timeStyle: 'short' });
  const shooting = hold.dataShootingInizio.toDate().toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'long', timeStyle: 'short' });
  const link = `${APPROVED_PAYMENT_SITE}/prenota/acconto/${encodeURIComponent(hold.bookingId)}#${token}`;
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#293c36">
    <h1 style="font-size:24px">Il tuo orario è stato approvato</h1>
    <p>Ciao ${escape(hold.draft.cliente.nome)}, lo studio ha approvato la richiesta per <strong>${escape(campaignName)}</strong>.</p>
    <p>Appuntamento: <strong>${escape(shooting)}</strong>.</p>
    <p>Per confermarlo versa l’acconto di <strong>${escape(price)}</strong> entro <strong>${escape(deadline)} (ora italiana)</strong>.</p>
    <p>La prenotazione non è ancora confermata. Dopo la scadenza, se l’acconto non risulta pagato, l’orario torna disponibile.</p>
    <p style="margin:28px 0"><a href="${escape(link)}" style="background:#294e42;color:#fff;padding:14px 22px;text-decoration:none;border-radius:6px;display:inline-block">Paga l’acconto con PayPal</a></p>
    <p>Puoi decidere i prodotti in studio. L’acconto non è il prezzo totale del servizio.</p>
    <p>Il link è personale: non inoltrarlo ad altre persone.</p>
    ${vademecumEmailBlock(campaignName)}
    <hr style="border:0;border-top:1px solid #ddd;margin:24px 0">
    <p><strong>Comunicazione automatica</strong><br>Non rispondere a questa email. Per informazioni contatta lo studio:</p>
    <p><strong>${escape(studio.name)}</strong><br>${escape(studio.email)}<br>${escape(studio.phone)}${studio.address ? `<br>${escape(studio.address)}` : ''}</p>
  </div>`;
}
function definitelyRejected(error: unknown) {
  return error instanceof Error && /(?:Gmail API error:\s*|Gmail non autorizzato \()(400|401|403|404|413|422|429)\b/i.test(error.message);
}

/** Null leaves all legacy/no-deposit approval paths untouched. */
export async function approveBookingWithDeposit(db: Firestore, bookingId: string, adminId: string,
  dependencies: Partial<ApprovedDepositDependencies> = {}, options: { resendRequestId?: string } = {}) {
  const deps = { ...defaults, ...dependencies };
  const ref = db.collection('bookings').doc(bookingId), holdRef = db.collection(CHECKOUT_HOLDS).doc(bookingId);
  const original = (await ref.get()).data();
  if (options.resendRequestId && !original?.depositPaymentRequest) throw new CheckoutHoldError(409, 'Nessuna richiesta esistente da reinviare.');
  if (!original) return null;
  const campaignRef = db.collection('booking_campaigns').doc(original.campaignId);
  const originalCampaign = await campaignRef.get(), campaign = originalCampaign.data();
  const prior = original.depositPaymentRequest ? (await holdRef.get()).data() : undefined;
  const resume = prior && isApprovedDepositHold(prior);
  if (original.depositPaymentRequest && !resume) return null; // Never migrate unowned/legacy requests implicitly.
  if (!resume && !(campaign?.richiedeAcconto === true && campaign.richiedeApprovazione !== false)) return null;
  if (unpaidDepositRequestExpired(original)) throw new CheckoutHoldError(410, 'La richiesta di acconto è scaduta. Occorre una nuova prenotazione.');
  try { deps.assertPayPalConfigured(); }
  catch { throw new CheckoutHoldError(503, 'PayPal non è disponibile: verifica la configurazione prima di approvare.'); }
  const key = deps.signingKey();
  const start = original.dataShootingInizio.toDate(), end = original.dataShootingFine.toDate();
  if (!resume) {
    try { await deps.checkCalendar(start, end, { ...campaign, id: original.campaignId }, bookingId, db); }
    catch (error) {
      if (error instanceof CheckoutHoldError) throw error;
      throw new CheckoutHoldError(503, 'Disponibilità calendario non verificabile. Nessuna richiesta di pagamento avviata.');
    }
  }
  const nonce = randomBytes(32).toString('hex');
  const hold = await db.runTransaction(async tx => {
    const [bookSnap, privateSnap, campaignSnap] = await Promise.all([tx.get(ref), tx.get(holdRef), tx.get(campaignRef)]);
    const booking = bookSnap.data(), existing = privateSnap.data(), currentCampaign = campaignSnap.data();
    if (!booking) throw new CheckoutHoldError(404, 'Prenotazione non trovata.');
    if (existing && isApprovedDepositHold(existing)) {
      if (unpaidDepositRequestExpired(booking)) throw new CheckoutHoldError(410, 'La richiesta di acconto è scaduta.');
      assertApprovedDepositMatchesBooking(existing, booking);
      return existing;
    }
    if (existing || booking.depositPaymentRequest || booking.stato !== 'in_attesa' || Number(booking.acconto) > 0
      || booking.depositPayment?.paypalCaptureId) {
      throw new CheckoutHoldError(409, 'Prenotazione già elaborata o con un pagamento da verificare.');
    }
    if (!currentCampaign?.attiva || currentCampaign.richiedeAcconto !== true || currentCampaign.richiedeApprovazione === false) {
      throw new CheckoutHoldError(409, 'Le impostazioni della campagna sono cambiate.');
    }
    if (!originalCampaign.updateTime?.isEqual(campaignSnap.updateTime!)) {
      throw new CheckoutHoldError(409, 'La campagna è cambiata durante la verifica. Aggiorna la pagina prima di approvare.');
    }
    if (booking.dataShootingInizio.toMillis() !== start.getTime() || booking.dataShootingFine.toMillis() !== end.getTime()
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.cliente?.email || '')) {
      throw new CheckoutHoldError(400, 'Verifica l’orario e l’indirizzo email della prenotazione.');
    }
    let request;
    try { request = createApprovedDepositRequest(currentCampaign.accontoImportoCentesimi, start); }
    catch { throw new CheckoutHoldError(400, 'Importo non valido o shooting troppo vicino per concedere un’ora di pagamento.'); }
    let locks;
    try { locks = await checkSlotReservation(tx, db, start, end, bookingId, bookingId); }
    catch (error) {
      if (error instanceof BookingSlotConflictError) throw new CheckoutHoldError(409, 'Lo slot è già occupato.');
      throw error;
    }
    const record = { bookingId, campaignId: booking.campaignId, kind: 'approved_deposit', status: 'active',
      dataShootingInizio: booking.dataShootingInizio, dataShootingFine: booking.dataShootingFine,
      createdAt: request.requestedAt, expiresAt: request.expiresAt, depositAmountCents: request.amountCents, currency: 'EUR',
      approvalNonce: nonce, tokenHash: hashCheckoutToken(tokenFor(key, bookingId, nonce)),
      draft: { cliente: booking.cliente, prodottoId: booking.prodottoId ?? null,
        prodottoNome: booking.prodottoNome ?? null, note: booking.note || '' },
      paymentEmail: { status: 'pending', attempts: 0 } };
    locks(); tx.set(holdRef, record);
    tx.update(ref, { depositPaymentRequest: { ...request, approvedBy: adminId, emailStatus: 'pending' }, updatedAt: Timestamp.now() });
    return record;
  });
  const token = tokenFor(key, bookingId, hold.approvalNonce);
  if (hashCheckoutToken(token) !== hold.tokenHash) throw new CheckoutHoldError(503, 'La chiave del link è cambiata. Richiedi assistenza senza rinnovare la scadenza.');
  const studio = await deps.studio();
  const attemptId = randomUUID();
  const claim = await db.runTransaction(async tx => {
    const [privateSnap, bookingSnap] = await Promise.all([tx.get(holdRef), tx.get(ref)]);
    const fresh = privateSnap.data()!;
    assertApprovedDepositMatchesBooking(fresh, bookingSnap.data());
    const email = fresh.paymentEmail;
    if (!email || !['pending', 'sending', 'sent', 'failed', 'unknown'].includes(email.status)
      || !Number.isSafeInteger(email.attempts) || email.attempts < 0
      || email.resendIds !== undefined && (!Array.isArray(email.resendIds) || email.resendIds.some((value: unknown) => typeof value !== 'string'))) {
      throw new CheckoutHoldError(503, 'Dati dell’invio da verificare. Nessuna nuova email inviata.');
    }
    const resendIds: string[] = email.resendIds || [];
    if (options.resendRequestId && resendIds.includes(options.resendRequestId)) return { send: false, status: email.status as EmailStatus };
    let status: EmailStatus = email.status;
    if (status === 'sending' && email.leaseUntil?.toMillis?.() <= Date.now()) status = 'unknown';
    if (['unknown', 'sending'].includes(status) || status === 'sent' && !options.resendRequestId || email.attempts >= 3) {
      if (status !== email.status) {
        tx.update(holdRef, { 'paymentEmail.status': status });
        tx.update(ref, { 'depositPaymentRequest.emailStatus': status });
      }
      return { send: false, status };
    }
    if (status === 'sent' && !Number.isFinite(email.sentAt?.toMillis?.())) throw new CheckoutHoldError(503, 'Data dell’ultimo invio da verificare.');
    if (email.sentAt?.toMillis?.() + 60_000 > Date.now()) throw new CheckoutHoldError(429, 'Attendi almeno un minuto prima di reinviare il link.');
    tx.update(holdRef, { paymentEmail: { ...email, status: 'sending', attempts: email.attempts + 1, attemptId,
      ...(options.resendRequestId ? { resendIds: [...resendIds, options.resendRequestId] } : {}),
      leaseUntil: Timestamp.fromMillis(Date.now() + 60_000) } });
    tx.update(ref, { 'depositPaymentRequest.emailStatus': 'sending' });
    return { send: true, status: 'sending' as EmailStatus };
  });
  let emailStatus = claim.status;
  if (claim.send) {
    try {
      await deps.send(hold.draft.cliente.email, 'Conferma il tuo shooting: versa l’acconto entro la scadenza',
        approvedDepositEmail(hold, campaign?.nome || 'Servizio fotografico', studio, token), bookingId);
      emailStatus = 'sent';
    } catch (error) { emailStatus = definitelyRejected(error) ? 'failed' : 'unknown'; }
    await db.runTransaction(async tx => {
      const [saved, booking] = await Promise.all([tx.get(holdRef), tx.get(ref)]);
      if (saved.data()?.paymentEmail?.attemptId !== attemptId) return;
      tx.update(holdRef, { 'paymentEmail.status': emailStatus, ...(emailStatus === 'sent' ? { 'paymentEmail.sentAt': Timestamp.now() } : {}) });
      if (booking.exists) tx.update(ref, { 'depositPaymentRequest.emailStatus': emailStatus });
    });
  }
  return { success: true as const, bookingId, paymentRequired: true as const, stato: 'in_attesa_pagamento' as const,
    amountCents: hold.depositAmountCents, currency: 'EUR' as const, expiresAt: hold.expiresAt.toDate(), emailStatus };
}
