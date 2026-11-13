import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { DateTime } from 'luxon';
import type { BookingCheckoutHoldInput, BookingCheckoutHoldView, BookingCheckoutHoldReleaseResult } from '@workspace/api-zod';
import { CHECKOUT_HOLDS, checkSlotReservation, checkoutHoldBlocksSlot } from './slot-reservations.js';
import { validateCampaign, campaignToAvailabilityConfig, getAllExistingBookingEvents } from './calendar-adapter.js';
import { getAvailableSlotsForDate } from '../calendar-engine/index.js';

export const CHECKOUT_HOLD_MS = 10 * 60 * 1000;
export class CheckoutHoldError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function authorize(data: FirebaseFirestore.DocumentData | undefined, token: string): FirebaseFirestore.DocumentData {
  const candidate = hashToken(token);
  if (!data || typeof data.tokenHash !== 'string' || data.tokenHash.length !== candidate.length
    || !timingSafeEqual(Buffer.from(data.tokenHash), Buffer.from(candidate))) {
    throw new CheckoutHoldError(404, 'Checkout non trovato');
  }
  return data;
}

function activeView(bookingId: string, data: FirebaseFirestore.DocumentData): BookingCheckoutHoldView {
  const now = Date.now();
  if (data.status !== 'active') throw new CheckoutHoldError(409, 'Checkout già chiuso');
  if (!Number.isFinite(data.expiresAt?.toMillis?.())) throw new CheckoutHoldError(503, 'Checkout da verificare con lo studio');
  if (!checkoutHoldBlocksSlot(data, now)) throw new CheckoutHoldError(410, 'Checkout scaduto: scegli nuovamente lo slot');
  return {
    bookingId, campaignId: data.campaignId, status: 'active',
    expiresAt: data.expiresAt.toDate(), serverTime: new Date(now),
    depositAmountCents: data.depositAmountCents, currency: 'EUR',
  };
}

/** The private draft reserves the eventual booking ID, without creating an approval request. */
export async function createCheckoutHold(db: Firestore, input: BookingCheckoutHoldInput) {
  const campaignRef = db.collection('booking_campaigns').doc(input.campaignId);
  const campaignDoc = await campaignRef.get();
  if (!campaignDoc.exists) throw new CheckoutHoldError(404, 'Campagna non trovata');
  const campaign = campaignDoc.data()!;
  if (!campaign.attiva || campaign.richiedeApprovazione !== false || campaign.richiedeAcconto !== true) {
    throw new CheckoutHoldError(400, 'Questa campagna non prevede il checkout immediato con acconto');
  }
  if (!Number.isSafeInteger(campaign.accontoImportoCentesimi) || campaign.accontoImportoCentesimi <= 0) {
    throw new CheckoutHoldError(400, 'Importo acconto non valido nella campagna');
  }
  const depositAmountCents: number = campaign.accontoImportoCentesimi;
  const start = new Date(input.dataShootingInizio), end = new Date(input.dataShootingFine);
  const first = DateTime.fromJSDate(campaign.dataInizio.toDate(), { zone: 'Europe/Rome' }).startOf('day');
  const last = DateTime.fromJSDate(campaign.dataFine.toDate(), { zone: 'Europe/Rome' }).endOf('day');
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start
    || start.getTime() <= Date.now() || start < first.toJSDate() || end > last.toJSDate()) {
    throw new CheckoutHoldError(400, 'Data fuori dal periodo prenotabile della campagna');
  }
  if (![input.cliente.nome, input.cliente.cognome, input.cliente.email, input.cliente.whatsapp].every(value => value.trim())) {
    throw new CheckoutHoldError(400, 'Dati cliente incompleti');
  }
  let productName: string | null = null;
  if (input.prodottoId) {
    const ids = (campaign.prodottiDisponibili || []).map((p: any) => typeof p === 'string' ? p : p.id);
    if (!ids.includes(input.prodottoId)) throw new CheckoutHoldError(400, 'Prodotto non disponibile per questa campagna');
    const product = await db.collection('products').doc(input.prodottoId).get();
    if (!product.exists || product.data()?.attivo !== true) throw new CheckoutHoldError(400, 'Prodotto non disponibile');
    productName = product.data()!.nome;
  }
  if (!validateCampaign(campaign)) throw new CheckoutHoldError(400, 'Configurazione campagna non valida');
  const date = DateTime.fromJSDate(start, { zone: 'Europe/Rome' });
  const dayStart = date.startOf('day').toJSDate(), dayEnd = date.endOf('day').toJSDate();
  const events = await getAllExistingBookingEvents(dayStart, dayEnd, db);
  const slots = await getAvailableSlotsForDate(dayStart, campaignToAvailabilityConfig({ ...campaign, id: input.campaignId }), events);
  if (!slots.some(slot => new Date(slot.start).getTime() === start.getTime() && new Date(slot.end).getTime() === end.getTime())) {
    throw new CheckoutHoldError(409, 'Slot non più disponibile');
  }
  const bookingId = db.collection('bookings').doc().id;
  const ref = db.collection(CHECKOUT_HOLDS).doc(bookingId);
  const token = randomBytes(32).toString('hex');
  const draft = {
    cliente: { ...input.cliente, nome: input.cliente.nome.trim(), cognome: input.cliente.cognome.trim(),
      email: input.cliente.email.trim().toLowerCase(), whatsapp: input.cliente.whatsapp.trim() },
    prodottoId: input.prodottoId || null, prodottoNome: productName, note: input.note || '',
  };
  const data = await db.runTransaction(async transaction => {
    const currentCampaign = await transaction.get(campaignRef);
    if (!currentCampaign.exists || currentCampaign.updateTime?.toMillis() !== campaignDoc.updateTime?.toMillis()) {
      throw new CheckoutHoldError(409, 'La campagna è cambiata: aggiorna la pagina prima di riprovare');
    }
    const commitLocks = await checkSlotReservation(transaction, db, start, end);
    const now = Date.now(); // Re-evaluated on every transaction retry.
    if (start.getTime() <= now) throw new CheckoutHoldError(409, 'Lo shooting è già iniziato');
    const record = {
      bookingId, campaignId: input.campaignId, status: 'active',
      dataShootingInizio: Timestamp.fromDate(start), dataShootingFine: Timestamp.fromDate(end),
      createdAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + CHECKOUT_HOLD_MS),
      depositAmountCents, currency: 'EUR',
      tokenHash: hashToken(token), draft,
    };
    commitLocks();
    transaction.set(ref, record);
    return record;
  });
  return { ...activeView(bookingId, data), token };
}

/** Read only: reloads/resumes NEVER renew the original deadline. */
export async function resumeCheckoutHold(db: Firestore, bookingId: string, token: string) {
  const snapshot = await db.collection(CHECKOUT_HOLDS).doc(bookingId).get();
  return activeView(bookingId, authorize(snapshot.data(), token));
}

/** payment_failed is server-only; the public endpoint can only abandon its own checkout. */
export async function releaseCheckoutHold(
  db: Firestore, bookingId: string, token: string, reason: 'cancelled' | 'payment_failed' = 'cancelled',
): Promise<BookingCheckoutHoldReleaseResult> {
  const ref = db.collection(CHECKOUT_HOLDS).doc(bookingId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const data = authorize(snapshot.data(), token);
    if (data.status === 'cancelled' || data.status === 'payment_failed') return { bookingId, status: data.status };
    if (data.status !== 'active') throw new CheckoutHoldError(409, 'Il checkout non può più essere annullato');
    if (!Number.isFinite(data.expiresAt?.toMillis?.())) throw new CheckoutHoldError(503, 'Checkout da verificare con lo studio');
    if (!checkoutHoldBlocksSlot(data)) return { bookingId, status: 'expired' as const };
    transaction.update(ref, { status: reason, releasedAt: Timestamp.now() });
    return { bookingId, status: reason };
  });
}
