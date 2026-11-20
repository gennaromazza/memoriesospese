import { db } from './firebase-admin.js';

/** Non-secret studio destination. Existing deployment configuration remains authoritative. */
export function environmentCalendarId(): string | null {
  const id = process.env.GOOGLE_CALENDAR_ID?.trim();
  return id && id !== 'primary' ? id : null;
}

async function destinationRef() {
  return { db, ref: db.collection('integrationSettings').doc('studioCalendar') };
}

export async function getStudioCalendarId(): Promise<string | null> {
  const configured = environmentCalendarId();
  if (configured) return configured;
  const { ref } = await destinationRef();
  return (await ref.get()).data()?.calendarId || null;
}

/** Set-once transaction: concurrent admins cannot replace each other's choice. */
export async function confirmStudioCalendarId(calendarId: string, actor: string): Promise<void> {
  const configured = environmentCalendarId();
  if (configured) {
    if (configured !== calendarId) throw new CalendarDestinationConflict();
    return;
  }
  const { db, ref } = await destinationRef();
  await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data()?.calendarId;
    if (current && current !== calendarId) throw new CalendarDestinationConflict();
    if (!current) tx.set(ref, { calendarId, confirmedBy: actor, confirmedAt: new Date() });
  });
}

export class CalendarDestinationConflict extends Error {
  constructor() {
    super('Esiste già un calendario di destinazione diverso. Per proteggere i lavori esistenti, questa procedura non può sostituirlo.');
  }
}
