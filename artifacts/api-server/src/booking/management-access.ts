import { IN_PERSON_PROVIDER, depositReceiptReference } from '@shared/booking-deposit-receipt';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Timestamp, type Firestore, type DocumentData } from 'firebase-admin/firestore';
import { APPROVED_PAYMENT_SITE } from './approved-deposit-request.js';

export const MANAGEMENT_ACCESS = 'bookingManagementAccess';
export class BookingManagementError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const invalid = () => new BookingManagementError(404, 'Link non valido o non più disponibile. Contatta lo studio.');
const email = (booking: DocumentData) => String(booking.cliente?.email || '').trim().toLowerCase();
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const key = () => {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new BookingManagementError(503, 'Configurazione del link personale da verificare.');
  return value;
};
interface AccessRecord {
  version: number; status: 'active' | 'revoked'; nonce: string; tokenHash: string;
  epoch: string; email: string; issuedAt: Timestamp; updatedAt: Timestamp;
  lastIntent?: string; lastAction?: 'rotate' | 'revoke'; changedBy?: string;
}
function validRecord(record: any): record is AccessRecord {
  return !!record && Number.isSafeInteger(record.version) && record.version > 0
    && ['active', 'revoked'].includes(record.status) && /^[a-f0-9]{64}$/.test(record.nonce)
    && /^[a-f0-9]{64}$/.test(record.tokenHash) && typeof record.epoch === 'string'
    && typeof record.email === 'string';
}
export function managementAccessMatches(record: unknown, booking: DocumentData, tokenHash?: string): boolean {
  return validRecord(record) && record.status === 'active' && record.epoch === booking.managementAccessEpoch
    && record.email === email(booking) && (tokenHash === undefined || record.tokenHash === tokenHash);
}
/** Historic bookings use their own receipt/request, never today's campaign settings. */
export function canIssueManagementLink(booking?: DocumentData, allowCancelled = false): boolean {
  if (!booking || !['confermata', 'completata', ...(allowCancelled ? ['annullata', 'cancellation_pending'] : [])].includes(booking.stato)
    || booking.paymentReviewRequired || booking.automaticConfirmationError || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email(booking))) return false;
  const payment = booking.depositPayment, request = booking.depositPaymentRequest;
  const inPerson = payment?.provider === IN_PERSON_PROVIDER;
  if ((request || payment || booking.confermataDa === 'paypal') && (!payment || payment.status !== 'paid'
    || (inPerson ? !depositReceiptReference(payment)
      : payment.provider !== 'paypal' || !payment.paypalCaptureId || !payment.paypalOrderId)
    || payment.currency !== 'EUR' || !Number.isSafeInteger(payment.amountCents) || payment.amountCents <= 0)) return false;
  // L'acconto di persona puo' avere un importo diverso da quello richiesto via PayPal.
  return !request || (request.status === 'paid' && request.currency === 'EUR' && (inPerson || request.amountCents === payment.amountCents));
}
function tokenFor(id: string, record: AccessRecord, signingKey: string) {
  return createHmac('sha256', signingKey).update(JSON.stringify(['booking-management-v1', id, record.epoch, record.version, record.nonce])).digest('hex');
}
function link(id: string, record: AccessRecord, signingKey: string) {
  const token = tokenFor(id, record, signingKey);
  if (hash(token) !== record.tokenHash) throw new BookingManagementError(409, 'Rigenera il link personale: quello salvato non è ripristinabile.');
  return `${APPROVED_PAYMENT_SITE}/prenota/gestisci/${encodeURIComponent(id)}#${token}`;
}
function summary(booking: DocumentData, record?: AccessRecord) {
  const eligible = canIssueManagementLink(booking);
  const active = record?.status === 'active' && record.email === email(booking) && record.epoch === booking.managementAccessEpoch;
  return { status: record ? active ? 'active' as const : 'revoked' as const : 'not_issued' as const,
    version: record?.version ?? 0, canIssue: eligible, canRevoke: !!active,
    reason: eligible ? null : 'Il link può essere generato solo per una prenotazione confermata, con eventuale acconto verificato.' };
}
async function snapshot(db: Firestore, id: string) {
  const [root, access] = await db.getAll(db.collection('bookings').doc(id), db.collection(MANAGEMENT_ACCESS).doc(id));
  if (!root.exists) throw new BookingManagementError(404, 'Prenotazione non trovata.');
  const record = access.data();
  if (access.exists && !validRecord(record)) throw new BookingManagementError(503, 'Stato del link personale da verificare.');
  return { booking: root.data()!, record: record as AccessRecord | undefined };
}
export async function getManagementLinkSummary(db: Firestore, id: string) {
  const { booking, record } = await snapshot(db, id);
  return summary(booking, record);
}
/** Issuance is idempotent; email retries must never undo an explicit revocation. */
export async function ensureBookingManagementLink(db: Firestore, id: string, signingKey = key(), expectedRecipient?: string): Promise<string> {
  return db.runTransaction(async tx => {
    const rootRef = db.collection('bookings').doc(id), ref = db.collection(MANAGEMENT_ACCESS).doc(id);
    const root = await tx.get(rootRef), old = await tx.get(ref);
    const booking = root.data();
    if (!root.exists || !canIssueManagementLink(booking)) throw new BookingManagementError(409, 'Prenotazione non ancora confermata o pagamento da verificare.');
    if (expectedRecipient !== undefined && expectedRecipient.trim().toLowerCase() !== email(booking!)) {
      throw new BookingManagementError(409, 'Il destinatario della prenotazione è cambiato: aggiorna i dati prima di inviare.');
    }
    if (old.exists) {
      const record = old.data();
      if (!validRecord(record) || record.status !== 'active' || record.email !== email(booking!)
        || record.epoch !== booking!.managementAccessEpoch) throw new BookingManagementError(409, 'Il link personale deve essere rigenerato esplicitamente.');
      return link(id, record, signingKey);
    }
    const now = Timestamp.now();
    const record: AccessRecord = { version: 1, status: 'active', nonce: randomBytes(32).toString('hex'),
      tokenHash: '', epoch: randomUUID(), email: email(booking!), issuedAt: now, updatedAt: now };
    record.tokenHash = hash(tokenFor(id, record, signingKey));
    tx.set(ref, record); tx.update(rootRef, { managementAccessEpoch: record.epoch });
    return link(id, record, signingKey);
  });
}
/** Optimistic version + intent makes retries safe even after a later rotation. */
export async function changeManagementLink(db: Firestore, id: string,
  intent: { action: 'rotate' | 'revoke'; requestId: string; expectedVersion: number }, actor: string, signingKey?: string) {
  return db.runTransaction(async tx => {
    const rootRef = db.collection('bookings').doc(id), ref = db.collection(MANAGEMENT_ACCESS).doc(id);
    const root = await tx.get(rootRef), old = await tx.get(ref), booking = root.data();
    if (!root.exists) throw new BookingManagementError(404, 'Prenotazione non trovata.');
    const record = old.data();
    if (old.exists && !validRecord(record)) throw new BookingManagementError(503, 'Stato del link personale da verificare.');
    if (record?.lastIntent === intent.requestId && record.lastAction === intent.action && record.version === intent.expectedVersion + 1) {
      if (record.status === 'active' && (!managementAccessMatches(record, booking!)
        || !canIssueManagementLink(booking, true))) throw new BookingManagementError(409, 'La prenotazione è cambiata: aggiorna il pannello prima di riprovare.');
      return { ...summary(booking!, record as AccessRecord), url: record.status === 'active' ? link(id, record as AccessRecord, signingKey ?? key()) : null };
    }
    if ((record?.version ?? 0) !== intent.expectedVersion) throw new BookingManagementError(409, 'Il link è cambiato: aggiorna il pannello prima di riprovare.');
    if (intent.action === 'rotate' && !canIssueManagementLink(booking)) throw new BookingManagementError(409, 'Prenotazione non ancora confermata o pagamento da verificare.');
    if (intent.action === 'revoke' && !record) throw new BookingManagementError(409, 'Nessun link da revocare.');
    const now = Timestamp.now();
    const next: AccessRecord = { ...(record as AccessRecord), version: intent.expectedVersion + 1,
      status: intent.action === 'rotate' ? 'active' : 'revoked',
      epoch: booking!.managementAccessEpoch || randomUUID(), email: email(booking!),
      updatedAt: now, lastIntent: intent.requestId, lastAction: intent.action, changedBy: actor };
    if (intent.action === 'rotate') {
      next.nonce = randomBytes(32).toString('hex'); next.issuedAt = now;
      next.tokenHash = hash(tokenFor(id, next, signingKey ?? key()));
    }
    tx.set(ref, next);
    if (booking!.managementAccessEpoch !== next.epoch) tx.update(rootRef, { managementAccessEpoch: next.epoch });
    return { ...summary({ ...booking, managementAccessEpoch: next.epoch }, next),
      url: next.status === 'active' ? link(id, next, signingKey ?? key()) : null };
  });
}
/** Returns trusted server context only. HTTP callers must construct an explicit public DTO. */
export async function authorizeBookingManagement(db: Firestore, id: string, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw invalid();
  const access = await db.collection(MANAGEMENT_ACCESS).doc(id).get(), record = access.data();
  if (!validRecord(record) || record.status !== 'active'
    || !timingSafeEqual(Buffer.from(hash(token), 'hex'), Buffer.from(record.tokenHash, 'hex'))) throw invalid();
  const root = await db.collection('bookings').doc(id).get(), booking = root.data();
  if (!root.exists || !canIssueManagementLink(booking, true) || record.epoch !== booking!.managementAccessEpoch
    || record.email !== email(booking!)) throw invalid();
  return { bookingId: id, booking: booking! };
}
