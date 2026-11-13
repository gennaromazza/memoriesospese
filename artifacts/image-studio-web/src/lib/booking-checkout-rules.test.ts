/**
 * Run only against the local emulator with a demo project:
 * FIRESTORE_RULES_TEST_PORT=8089 firebase emulators:exec --project demo-booking-checkout-rules
 * --config ../../firebase.job-cost-payment-e2e.json --only firestore
 * "pnpm exec vitest run --config vitest.config.ts src/lib/booking-checkout-rules.test.ts"
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const data = {
  campaignId: 'campaign-test', stato: 'confermata',
  dataShootingInizio: new Date('2030-12-10T09:00:00Z'),
  dataShootingFine: new Date('2030-12-10T09:30:00Z'),
};
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-booking-checkout-rules',
    firestore: {
      host: '127.0.0.1', port: Number(process.env.FIRESTORE_RULES_TEST_PORT ?? 8089),
      rules: readFileSync('../../firestore.rules', 'utf8'),
    },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'bookings', 'server-booking'), data);
    await setDoc(doc(db, 'bookingCheckoutHolds', 'active-hold'), { status: 'active' });
    await setDoc(doc(db, 'bookingSlotLocks', '2030-12-10'), { version: 1 });
    await setDoc(doc(db, 'bookingPayPalOrders', 'ORDER-TEST123'), { bookingId: 'server-booking' });
    await setDoc(doc(db, 'bookingPaymentCaptures', 'CAPTURE-TEST123'), { bookingId: 'server-booking' });
    await setDoc(doc(db, 'bookingPaymentEvents', 'EVENT-TEST123'), { bookingId: 'server-booking' });
  });
});
afterAll(async () => { await env?.cleanup(); });

describe('nessun client può aggirare le riserve checkout', () => {
  it.each(['public', 'customer', 'admin'])('nega l’eliminazione diretta di una prenotazione al client %s', async actor => {
    const db = actor === 'public' ? env.unauthenticatedContext().firestore()
      : env.authenticatedContext(actor, { email: actor === 'admin' ? 'gennaro.mazzacane@gmail.com' : 'cliente@example.com' }).firestore();
    await assertFails(deleteDoc(doc(db, 'bookings', 'server-booking')));
  });
  it('impedisce a un vecchio client admin di cambiare lo slot durante la sincronizzazione Calendar', async () => {
    await env.withSecurityRulesDisabled(async context => {
      await updateDoc(doc(context.firestore(), 'bookings', 'server-booking'), { calendarSyncPending: true });
    });
    const db = env.authenticatedContext('admin', { email: 'gennaro.mazzacane@gmail.com' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'bookings', 'server-booking')));
    await assertFails(updateDoc(doc(db, 'bookings', 'server-booking'), { stato: 'annullata' }));
    await assertFails(updateDoc(doc(db, 'bookings', 'server-booking'), { dataShootingInizio: new Date() }));
    await assertFails(updateDoc(doc(db, 'bookings', 'server-booking'), { calendarSyncPending: false }));
  });
  it.each(['public', 'customer', 'admin'])('nega la creazione diretta di prenotazioni al client %s', async actor => {
    const db = actor === 'public' ? env.unauthenticatedContext().firestore()
      : env.authenticatedContext(actor, { email: actor === 'admin' ? 'gennaro.mazzacane@gmail.com' : 'cliente@example.com' }).firestore();
    await assertFails(setDoc(doc(db, 'bookings', 'forged-booking'), data));
  });
  it.each(['public', 'customer', 'admin'])('nega letture e scritture dirette su riserve e guardie al client %s', async actor => {
    const db = actor === 'public' ? env.unauthenticatedContext().firestore()
      : env.authenticatedContext(actor, { email: actor === 'admin' ? 'gennaro.mazzacane@gmail.com' : 'cliente@example.com' }).firestore();
    for (const [collection, id] of [
      ['bookingCheckoutHolds', 'active-hold'], ['bookingSlotLocks', '2030-12-10'], ['bookingPayPalOrders', 'ORDER-TEST123'],
      ['bookingPaymentCaptures', 'CAPTURE-TEST123'], ['bookingPaymentEvents', 'EVENT-TEST123'],
    ]) {
      await assertFails(getDoc(doc(db, collection, id)));
      await assertFails(setDoc(doc(db, collection, 'forged'), { status: 'active', version: 99 }));
      await assertFails(updateDoc(doc(db, collection, id), { status: 'cancelled', version: 99 }));
    }
  });
  it('mantiene la gestione admin delle prenotazioni create dal server', async () => {
    const adminDb = env.authenticatedContext('admin', { email: 'gennaro.mazzacane@gmail.com' }).firestore();
    await assertSucceeds(getDoc(doc(adminDb, 'bookings', 'server-booking')));
    await assertSucceeds(updateDoc(doc(adminDb, 'bookings', 'server-booking'), { statoWorkflow: 'shooting_fatto' }));
    const publicDb = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(publicDb, 'bookings', 'server-booking')));
    await assertFails(updateDoc(doc(publicDb, 'bookings', 'server-booking'), { stato: 'confermata' }));
  });
});
