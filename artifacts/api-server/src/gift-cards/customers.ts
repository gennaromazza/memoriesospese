import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { generateClienteIdFromEmail, normalizeEmail } from '../utils/normalize.js';

export interface GiftCustomerInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

/**
 * Salva chi compra una gift card nell'anagrafica clienti, come fanno le
 * prenotazioni: stesso identificativo ricavato dall'email, quindi nessun
 * doppione. Un cliente già presente non viene sovrascritto: si completa solo
 * il telefono se mancava.
 */
export async function upsertGiftCustomer(db: Firestore, input: GiftCustomerInput, now: Date): Promise<string | null> {
  const email = normalizeEmail(input.email || '');
  if (!email) return null;
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const phone = input.phone?.trim() || '';

  let ref = db.collection('clienti').doc(generateClienteIdFromEmail(email));
  if (!(await ref.get()).exists) {
    // Clienti storici con un identificativo diverso: si cerca per email.
    const legacy = await db.collection('clienti').where('email', '==', email).limit(1).get();
    if (!legacy.empty) ref = legacy.docs[0].ref;
  }

  const ts = Timestamp.fromDate(now);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, {
        nome: firstName,
        cognome: lastName,
        email,
        ...(phone ? { cellulare1: phone, whatsapp: phone } : {}),
        tags: [],
        sourceRefs: { bookingIds: [], orderIds: [], galleryIds: [], passwordRequestIds: [], userIds: [] },
        lifecycle: { firstContactAt: ts, lastInteractionAt: ts, status: 'cliente_attivo' },
        financials: { totalRevenue: 0, outstandingBalance: 0, totalOrders: 0 },
        createdAt: ts,
        updatedAt: ts,
      });
      return;
    }
    const current = snap.data() as any;
    const patch: Record<string, unknown> = { 'lifecycle.lastInteractionAt': ts, updatedAt: ts };
    if (phone && !current.cellulare1) patch.cellulare1 = phone;
    if (phone && !current.whatsapp) patch.whatsapp = phone;
    tx.update(ref, patch);
  });
  return ref.id;
}
