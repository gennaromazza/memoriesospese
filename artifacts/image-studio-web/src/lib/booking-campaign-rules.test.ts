/**
 * Verifica che solo il server possa creare campagne e che i codici restino
 * immutabili per i client, senza interrompere la lettura dei documenti legacy.
 *
 * Esecuzione: FIRESTORE_RULES_TEST_PORT=8089 firebase emulators:exec --config ../../firebase.job-cost-payment-e2e.json --only firestore "pnpm exec vitest run src/lib/booking-campaign-rules.test.ts"
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const legacyCampaign = ['booking_campaigns', 'legacy-random-id'] as const;
const adminEmail = 'gennaro.mazzacane@gmail.com';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'booking-campaign-rules-test',
    firestore: {
      host: '127.0.0.1',
      port: Number(process.env.FIRESTORE_RULES_TEST_PORT ?? 8080),
      rules: readFileSync('../../firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), ...legacyCampaign), {
      code: 'OLD12345',
      nome: 'Campagna storica',
    });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('regole Firestore per le campagne booking', () => {
  it('mantiene leggibile la campagna storica tramite il suo ID casuale', async () => {
    const publicDb = env.unauthenticatedContext().firestore();
    const snapshot = await getDoc(doc(publicDb, ...legacyCampaign));

    expect(snapshot.exists()).toBe(true);
    expect(snapshot.data()?.code).toBe('OLD12345');
  });

  it('nega le creazioni dirette anche agli amministratori', async () => {
    const adminDb = env.authenticatedContext('admin-uid', { email: adminEmail }).firestore();

    await assertFails(setDoc(doc(adminDb, 'booking_campaigns', 'NEW12345'), {
      code: 'NEW12345',
      nome: 'Nuova campagna',
    }));
  });

  it('consente le modifiche admin ai dati ma non al codice esistente', async () => {
    const adminDb = env.authenticatedContext('admin-uid', { email: adminEmail }).firestore();
    const campaignRef = doc(adminDb, ...legacyCampaign);

    await assertFails(updateDoc(campaignRef, { code: 'NEW12345' }));
    await assertSucceeds(updateDoc(campaignRef, { nome: 'Campagna aggiornata' }));
  });
});
