import { createHash, randomUUID } from 'node:crypto';
import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import type { calendar_v3 } from 'googleapis';
import { bookingPaymentMillis } from '@shared/booking-payment-state';
import { recoveryCalendar, type RecoveryCalendar } from './calendar-recovery-google.js';

export class CalendarRecoveryError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const normalized = (value: unknown) => String(value || '').trim().toLocaleLowerCase('it-IT').replace(/\s+/g, ' ');
const nameOf = (b: DocumentData) => `${b.cliente?.nome || ''} ${b.cliente?.cognome || ''}`.trim();
const fingerprint = (b: DocumentData) => digest(JSON.stringify([
  b.stato, bookingPaymentMillis(b.dataShootingInizio), bookingPaymentMillis(b.dataShootingFine),
  normalized(b.cliente?.email), normalized(nameOf(b)), b.googleCalendarId || '', b.googleCalendarEventId || '',
]));
function eligible(b?: DocumentData) {
  return !!b && b.stato === 'confermata' && !b.calendarSyncPending && !b.paymentReviewRequired
    && !['pending', 'working', 'blocked'].includes(b.bookingCancellation?.status)
    && !['pending', 'blocked'].includes(b.customerReschedule?.status);
}
function times(b: DocumentData) {
  const start = bookingPaymentMillis(b.dataShootingInizio), end = bookingPaymentMillis(b.dataShootingFine);
  if (start === null || end === null || end <= start) throw new CalendarRecoveryError(409, 'Orario della prenotazione non valido.');
  return { start, end };
}
function sameTime(event: calendar_v3.Schema$Event, start: number, end: number) {
  return event.status !== 'cancelled' && Date.parse(event.start?.dateTime || '') === start
    && Date.parse(event.end?.dateTime || '') === end;
}
function explicitOwnership(event: calendar_v3.Schema$Event, id: string): boolean | null {
  const identifiers: string[] = [];
  const privateFields = event.extendedProperties?.private;
  if (privateFields && Object.hasOwn(privateFields, 'crmBookingId')) {
    identifiers.push(String(privateFields.crmBookingId).trim());
  }
  const description = String(event.description || '');
  const markers = [...description.matchAll(/\[booking:([^\]\r\n]*)\]/g)];
  if ((description.match(/\[booking:/g)?.length || 0) !== markers.length) return false;
  for (const match of markers) {
    identifiers.push(match[1].trim());
  }
  return identifiers.length ? identifiers.every(value => value === id) : null;
}
function owns(event: calendar_v3.Schema$Event, b: DocumentData, id: string) {
  const explicit = explicitOwnership(event, id);
  if (explicit !== null) return explicit;
  // Old events have no machine-readable booking ID: require title AND email,
  // not just the customer's name or a matching time.
  const email = normalized(b.cliente?.email);
  return !!email && normalized(event.summary) === normalized(`Shooting: ${nameOf(b)}`)
    && String(event.description || '').split(/\r?\n/).some(line => normalized(line) === `email: ${email}`);
}
export interface RecoveryInspection {
  action: 'already_linked' | 'link_existing' | 'create' | 'blocked';
  canRecover: boolean;
  message: string;
  calendarId?: string;
  eventId?: string;
  inspectionKey?: string;
  start?: string;
  end?: string;
}
type Plan = RecoveryInspection & { source: DocumentData; fingerprint: string; recoveryEventId?: string };
const LEASE_MS = 180_000;

async function inspect(db: Firestore, id: string, api: RecoveryCalendar): Promise<Plan> {
  const b = (await db.collection('bookings').doc(id).get()).data();
  if (!b) throw new CalendarRecoveryError(404, 'Prenotazione non trovata.');
  const base = { source: b, fingerprint: fingerprint(b) };
  const blocked = (message: string): Plan => ({ ...base, action: 'blocked', canRecover: false, message });
  if (!eligible(b)) return blocked('Il recupero è disponibile solo per prenotazioni confermate senza pagamenti o modifiche da verificare.');
  if (b.calendarRecovery?.status === 'working' && bookingPaymentMillis(b.calendarRecovery.leaseUntil)! > Date.now()) {
    return blocked('Un recupero è già in corso. Attendi prima di riprovare.');
  }
  const { start, end } = times(b), calendarId = await api.target(b.googleCalendarId);
  // Persisted target for an uncertain insert must not silently change after configuration changes.
  if (b.calendarRecovery?.calendarId && b.calendarRecovery.calendarId !== calendarId) {
    return blocked('Il calendario è cambiato dopo un tentativo di recupero. Serve una verifica manuale prima di creare eventi.');
  }
  if (b.calendarRecovery?.fingerprint && b.calendarRecovery.status !== 'done'
    && b.calendarRecovery.fingerprint !== base.fingerprint) {
    return blocked('La prenotazione è cambiata dopo un tentativo di recupero. Verifica prima l’evento precedente.');
  }
  const stableId = `b${digest(`recovery:${id}:${calendarId}:${base.fingerprint}`)}`;
  const recoveryEventId = b.calendarRecovery?.eventId || stableId;
  const knownIds = [...new Set([b.googleCalendarEventId, b.initialCalendarEventId, recoveryEventId].filter(Boolean))] as string[];
  const found = new Map<string, calendar_v3.Schema$Event>();
  for (const eventId of knownIds) {
    const event = await api.read(calendarId, eventId);
    if (!event) continue;
    if (!sameTime(event, start, end) || explicitOwnership(event, id) === false
      || !(eventId === b.googleCalendarEventId || owns(event, b, id))) {
      return blocked('Un evento già identificato ha dati diversi o è stato cancellato: serve una verifica manuale.');
    }
    found.set(eventId, event);
  }
  if (b.googleCalendarEventId && !found.has(b.googleCalendarEventId)) {
    return blocked('La prenotazione ha già un riferimento a un evento non disponibile. Non verrà ricreato automaticamente.');
  }
  const events = await api.scan(calendarId, new Date(start), new Date(end));
  for (const event of events) {
    if (event.status !== 'cancelled' && explicitOwnership(event, id) === false) {
      return blocked('Nell’orario esiste un evento identificato come appartenente a un’altra prenotazione. Verifica manualmente il collegamento.');
    }
    if (event.id && sameTime(event, start, end) && owns(event, b, id)) found.set(event.id, event);
  }
  if (found.size > 1) return blocked('Trovati più appuntamenti compatibili. Controllali su Google prima di recuperare il collegamento.');
  const eventId = found.keys().next().value as string | undefined;
  if (!eventId) {
    if (b.automaticConfirmationError || b.initialCalendarEventId) {
      return blocked('Un precedente invio ha un esito incerto. Nessun nuovo evento sarà creato senza riconciliare quel tentativo.');
    }
    if (events.some(event => event.status !== 'cancelled'
      && (event.start?.date || event.transparency !== 'transparent'))) {
      return blocked('Nell’orario è già presente un appuntamento non identificabile con certezza. Nessun duplicato sarà creato.');
    }
  }
  const action = eventId ? b.googleCalendarEventId === eventId ? 'already_linked' : 'link_existing' : 'create';
  return { ...base, action, canRecover: action !== 'already_linked', calendarId,
    eventId: eventId || recoveryEventId, recoveryEventId,
    start: new Date(start).toISOString(), end: new Date(end).toISOString(),
    inspectionKey: digest(`${base.fingerprint}:${calendarId}:${action}:${eventId || recoveryEventId}`),
    message: action === 'already_linked' ? 'Appuntamento già collegato e verificato.'
      : action === 'link_existing' ? 'Appuntamento già presente: verrà collegato senza crearne un altro.'
        : 'Nessun appuntamento presente nell’orario: puoi creare l’evento mancante.' };
}
const publicPlan = ({ source: _source, fingerprint: _fingerprint, recoveryEventId: _id, ...result }: Plan) => result;
export async function inspectBookingCalendar(db: Firestore, id: string, api = recoveryCalendar): Promise<RecoveryInspection> {
  return publicPlan(await inspect(db, id, api));
}

/** Explicit admin action. Only Calendar references/recovery metadata are written.
 * Stable IDs survive a timeout; a second click cannot insert a second event.
 */
export async function recoverBookingCalendar(
  db: Firestore, id: string, inspectionKey: string, actor: string, api = recoveryCalendar,
): Promise<RecoveryInspection> {
  const plan = await inspect(db, id, api);
  if (plan.action === 'already_linked') return publicPlan(plan);
  if (!plan.canRecover || plan.inspectionKey !== inspectionKey) {
    throw new CalendarRecoveryError(409, 'La verifica è cambiata o il recupero è bloccato. Verifica di nuovo l’appuntamento.');
  }
  const ref = db.collection('bookings').doc(id), operation = randomUUID();
  await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!eligible(current) || fingerprint(current!) !== plan.fingerprint
      || current!.calendarRecovery?.status === 'working' && bookingPaymentMillis(current!.calendarRecovery.leaseUntil)! > Date.now()) {
      throw new CalendarRecoveryError(409, 'Prenotazione modificata o recupero già in corso.');
    }
    tx.update(ref, { calendarRecovery: { status: 'working', operation, calendarId: plan.calendarId!,
      eventId: plan.eventId!, fingerprint: plan.fingerprint, actor, leaseUntil: Timestamp.fromMillis(Date.now() + LEASE_MS) } });
  });
  let created = false, externalWriteStarted = false;
  try {
    let eventId = plan.eventId!;
    if (plan.action === 'create') {
      const current = (await ref.get()).data();
      if (!eligible(current) || fingerprint(current!) !== plan.fingerprint || current!.calendarRecovery?.operation !== operation) {
        throw new CalendarRecoveryError(409, 'Prenotazione modificata prima della creazione dell’appuntamento.');
      }
      externalWriteStarted = true;
      let event: calendar_v3.Schema$Event | null;
      try {
        event = await api.create(plan.calendarId!, { id: eventId, kind: 'booking',
          summary: `Shooting: ${nameOf(plan.source)}`, start: new Date(plan.start!), end: new Date(plan.end!),
          description: `Prenotazione confermata. [booking:${id}]\nEmail: ${plan.source.cliente?.email || ''}`,
          location: 'Studio fotografico' });
        created = true;
      } catch (error) {
        if (Number((error as any)?.code ?? (error as any)?.response?.status) !== 409) throw error;
        event = await api.read(plan.calendarId!, eventId);
      }
      const { start, end } = times(plan.source);
      if (!event || event.id !== eventId || !sameTime(event, start, end) || !owns(event, plan.source, id)) {
        throw new CalendarRecoveryError(409, 'Esito Google da verificare. Nessun nuovo tentativo con un ID diverso verrà eseguito.');
      }
    }
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (!eligible(current) || fingerprint(current!) !== plan.fingerprint || current!.calendarRecovery?.operation !== operation) {
        throw new CalendarRecoveryError(409, 'Prenotazione modificata durante il recupero.');
      }
      tx.update(ref, { googleCalendarEventId: eventId, googleCalendarId: plan.calendarId!,
        calendarSyncedAt: Timestamp.now(), calendarRecovery: { status: 'done', operation,
          eventId, calendarId: plan.calendarId!, actor, completedAt: Timestamp.now() } });
    });
    return { ...publicPlan(plan), action: 'already_linked', canRecover: false, message: 'Appuntamento recuperato. Nessuna email inviata; stato e incassi invariati.' };
  } catch (error) {
    const current = (await ref.get()).data();
    // Only compensate our own successful creation after a concurrent change.
    // Never delete an existing appointment or an event another recovery may adopt.
    let cleaned = false;
    if (created && (!current || (!eligible(current) || fingerprint(current) !== plan.fingerprint)
      && current.calendarRecovery?.operation === operation)) {
      try { await api.remove(plan.calendarId!, plan.eventId!); cleaned = true; } catch { /* retain event ID for explicit review */ }
    }
    await db.runTransaction(async tx => {
      const latest = (await tx.get(ref)).data();
      if (!latest || latest.calendarRecovery?.operation !== operation) return;
      tx.update(ref, { calendarRecovery: { ...latest.calendarRecovery,
        status: cleaned ? 'cancelled' : externalWriteStarted ? 'uncertain' : 'retryable',
        leaseUntil: Timestamp.now() } });
    });
    throw error;
  }
}
