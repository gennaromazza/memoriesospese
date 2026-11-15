import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { CANCELLATION_JOBS, bookingDepositCents } from './cancellation-policy.js';
import { bookingPaymentMillis } from '@shared/booking-payment-state';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export async function prepareCancellationEmail(root: any) {
  const { getStudioContactInfo } = await import('../email-routes.js'), studio = await getStudioContactInfo();
  const date = bookingPaymentMillis(root.dataShootingInizio);
  return { to: String(root.cliente.email).trim().toLowerCase(), subject: 'Annullamento appuntamento — Image Studio',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h1>Appuntamento annullato</h1>
      <p>Ciao ${escape(root.cliente.nome)}, la prenotazione ${escape(root.campaignName || 'del tuo shooting')}
      ${date === null ? '' : `del ${escape(new Date(date).toLocaleString('it-IT', { timeZone: 'Europe/Rome' }))}`} è stata annullata e l’orario è stato liberato.</p>
      ${bookingDepositCents(root) > 0 ? '<p>L’acconto rimane nello storico. Questo messaggio non conferma un rimborso: lo studio ti comunicherà separatamente l’esito della gestione dell’acconto.</p>' : ''}
      <hr><p>Comunicazione automatica: non rispondere a questa email. Per informazioni contatta lo studio:</p>
      <p>${escape(studio.name)}<br>${escape(studio.email)}<br>${escape(studio.phone)}<br>${escape(studio.address)}</p></div>` };
}
/** Ambiguous sends are never blindly repeated. Preparation may retry; sending may not. */
export async function deliverCancellationEmail(db: Firestore, id: string,
  deps = { prepare: prepareCancellationEmail, send: async (message: { to: string; subject: string; html: string }) =>
    (await import('../email-routes.js')).sendGmailEmail(message.to, message.subject, message.html, undefined,
      { type: 'booking_cancellation', relatedDocId: id, relatedDocType: 'booking' }) }) {
  const ref = db.collection(CANCELLATION_JOBS).doc(id), rootRef = db.collection('bookings').doc(id), lease = randomUUID();
  const claim = await db.runTransaction(async tx => {
    const [jobDoc, rootDoc] = await Promise.all([tx.get(ref), tx.get(rootRef)]), job = jobDoc.data(), root = rootDoc.data();
    if (!job || job.status !== 'complete' || !['pending', 'preparing', 'sending'].includes(job.emailStatus)
      || job.emailNotBefore?.toMillis?.() > Date.now() || job.emailLeaseUntil?.toMillis?.() > Date.now()) return null;
    const status = job.emailStatus === 'sending' ? 'unknown'
      : (job.emailAttempts || 0) >= 3 ? 'failed' : !valid(root, job) ? 'skipped' : null;
    if (status) {
      tx.update(ref, { emailStatus: status });
      if (root?.bookingCancellation?.requestId === job.requestId) tx.update(rootRef, { 'bookingCancellation.emailStatus': status });
      return null;
    }
    tx.update(ref, { emailStatus: 'preparing', emailLease: lease, emailLeaseUntil: Timestamp.fromMillis(Date.now() + 180_000),
      emailAttempts: (job.emailAttempts || 0) + 1 });
    return { root: root!, job };
  });
  if (!claim) return;
  let sending = false;
  try {
    const message = await deps.prepare(claim.root);
    const ready = await db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data(), root = (await tx.get(rootRef)).data();
      if (job?.emailLease !== lease || job.emailStatus !== 'preparing') return false;
      if (!valid(root, job) || message.to !== job.email) {
        tx.update(ref, { emailStatus: 'skipped' });
        if (root?.bookingCancellation?.requestId === job.requestId) tx.update(rootRef, { 'bookingCancellation.emailStatus': 'skipped' });
        return false;
      }
      tx.update(ref, { emailStatus: 'sending' }); tx.update(rootRef, { 'bookingCancellation.emailStatus': 'sending' }); return true;
    });
    if (!ready) return;
    sending = true; await deps.send(message);
    await settle('sent');
  } catch { await settle(sending ? 'unknown' : 'pending'); }
  async function settle(status: string) {
    await db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data(), root = (await tx.get(rootRef)).data();
      if (job?.emailLease !== lease) return;
      tx.update(ref, { emailStatus: status, emailLeaseUntil: Timestamp.fromMillis(0),
        emailNotBefore: Timestamp.fromMillis(Date.now() + 60_000) });
      if (root?.bookingCancellation?.requestId === job.requestId) tx.update(rootRef, { 'bookingCancellation.emailStatus': status });
    });
  }
}
const valid = (root: any, job: any) => root?.stato === 'annullata' && root.bookingCancellation?.requestId === job.requestId
  && (root.managementAccessEpoch || null) === job.epoch && String(root.cliente?.email || '').trim().toLowerCase() === job.email;
