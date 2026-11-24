/**
 * Regole Firestore: la passkey obbligatoria (claim `apk`) vale anche per gli
 * accessi diretti dal browser con Admin SDK escluso.
 *
 * Esecuzione: firebase emulators:exec --only firestore "pnpm exec vitest run src/lib/admin-passkey-rules.test.ts"
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const ADMIN_EMAIL = 'gennaro.mazzacane@gmail.com';
const secretPath = ['gallerySecrets', 'gallery-1'] as const;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'admin-passkey-rules-test',
    firestore: {
      host: '127.0.0.1',
      port: Number(process.env.FIRESTORE_RULES_TEST_PORT ?? 8080),
      rules: readFileSync('../../firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), ...secretPath), { password: 'x' });
    await setDoc(doc(context.firestore(), 'adminSecurity', 'admin-uid'), {
      passkeyRequired: true,
      verificationsValidAfter: 1000,
    });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const AUTH_TIME = 1_700_000_000;
const adminWith = (claims: Record<string, unknown>) =>
  env.authenticatedContext('admin-uid', { email: ADMIN_EMAIL, auth_time: AUTH_TIME, ...claims }).firestore();
const valid = () => ({ apk: { req: true, exp: Date.now() + 3600_000, at: 2000, sat: AUTH_TIME } });

async function setState(state: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'adminSecurity', 'admin-uid'), state);
  });
}

async function seedRememberedDevice(id: string, values: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'adminSecurity', 'admin-uid', 'rememberedDevices', id), {
      label: 'Browser test',
      secretHash: 'not-used-by-rules',
      createdAt: Date.now() - 1000,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      lastUsedAt: Date.now(),
      revokedAt: null,
      ...values,
    });
  });
}

describe('admin passkey claim in Firestore rules', () => {
  it('consente prodotti ordinari solo agli admin verificati e nega i formati print_shop al client', async () => {
    const verified = adminWith(valid());
    await assertSucceeds(setDoc(doc(verified, 'products', 'album'), {
      nome: 'Album',
      prezzo: 120,
      sconto: 0,
      prezzoFinale: 120,
      salesChannels: ['admin'],
    }));
    await assertFails(setDoc(doc(verified, 'products', 'formato-shop'), {
      nome: 'Formato stampe',
      salesChannels: ['admin', 'print_shop'],
    }));

    const unverifiedAdmin = adminWith({});
    await assertFails(setDoc(doc(unverifiedAdmin, 'products', 'album-non-verificato'), {
      nome: 'Album',
      prezzo: 120,
      salesChannels: ['admin'],
    }));

    const customer = env.authenticatedContext('customer-uid', { email: 'cliente@example.com' }).firestore();
    await assertFails(setDoc(doc(customer, 'products', 'album-cliente'), {
      nome: 'Album',
      prezzo: 120,
      salesChannels: ['admin'],
    }));
  });

  it('tiene i costi unitari dello shop privati e lascia i prodotti pubblici leggibili', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'products', 'tazza'), { nome: 'Tazza' });
      await setDoc(doc(context.firestore(), 'shopProductCosts', 'tazza'), { costoUnitario: 8.5 });
    });

    const publicDb = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(publicDb, 'products', 'tazza')));
    await assertFails(getDoc(doc(publicDb, 'shopProductCosts', 'tazza')));

    const verifiedAdmin = adminWith(valid());
    await assertSucceeds(getDoc(doc(verifiedAdmin, 'shopProductCosts', 'tazza')));
    await assertSucceeds(updateDoc(doc(verifiedAdmin, 'shopProductCosts', 'tazza'), { costoUnitario: 9 }));

    const customer = env.authenticatedContext('customer-uid', { email: 'cliente@example.com' }).firestore();
    await assertFails(getDoc(doc(customer, 'shopProductCosts', 'tazza')));
    await assertFails(setDoc(doc(customer, 'shopProductCosts', 'altra-tazza'), { costoUnitario: 3 }));
  });

  it('keeps admin access unchanged before the passkey becomes mandatory (server state)', async () => {
    await setState({ passkeyRequired: false });
    await assertSucceeds(getDoc(doc(adminWith({}), ...secretPath)));
    await assertSucceeds(getDoc(doc(adminWith({ apk: { req: false, exp: 0, at: 0, sat: 0 } }), ...secretPath)));
    await env.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), 'adminSecurity', 'admin-uid'));
    });
    await assertSucceeds(getDoc(doc(adminWith({}), ...secretPath)));
  });

  it('enforces the server state even for a token issued before activation', async () => {
    // Token senza claim (emesso prima dell'attivazione): lo stato server prevale.
    await assertFails(getDoc(doc(adminWith({}), ...secretPath)));
    // Claim scritto prima dell'attivazione (req:false, senza sessione): non basta.
    await assertFails(getDoc(doc(adminWith({ apk: { req: false, exp: Date.now() + 3600_000, at: 2000 } }), ...secretPath)));
  });

  it('denies admin access when the verification is missing, expired or revoked', async () => {
    await assertFails(getDoc(doc(adminWith({ apk: { req: true, exp: 0, at: 0, sat: 0 } }), ...secretPath)));
    await assertFails(getDoc(doc(adminWith({ apk: { ...valid().apk, exp: Date.now() - 1000 } }), ...secretPath)));
    // Verifica precedente o contemporanea all'ultima revoca registrata sul server.
    await assertFails(getDoc(doc(adminWith({ apk: { ...valid().apk, at: 500 } }), ...secretPath)));
    // Timestamp uguale alla revoca non deve essere considerato successivo.
    await assertFails(getDoc(doc(adminWith({ apk: { ...valid().apk, at: 1000 } }), ...secretPath)));
    // Anche con date valide, il claim deve dichiarare esplicitamente la verifica.
    await assertFails(getDoc(doc(adminWith({ apk: { ...valid().apk, req: false } }), ...secretPath)));
    await assertFails(getDoc(doc(adminWith({ apk: { exp: Date.now() + 3600_000, at: 2000, sat: AUTH_TIME } }), ...secretPath)));
  });

  it('binds the verification to the login session (auth_time)', async () => {
    await assertFails(getDoc(doc(adminWith({ apk: { ...valid().apk, sat: AUTH_TIME + 1 } }), ...secretPath)));
    await assertFails(getDoc(doc(adminWith({ apk: { req: true, exp: Date.now() + 3600_000, at: 2000 } }), ...secretPath)));
  });

  it('allows admin access with a current passkey verification', async () => {
    await assertSucceeds(getDoc(doc(adminWith(valid()), ...secretPath)));
    await assertSucceeds(setDoc(doc(adminWith(valid()), ...secretPath), { password: 'y' }));
  });

  it('allows independent remembered browser claims only while their server records are active', async () => {
    const firstId = 'A'.repeat(43);
    const secondId = 'B'.repeat(43);
    await setState({ passkeyRequired: true, verificationsValidAfter: 1000, rememberedDevicesValidAfter: 1000 });
    await Promise.all([seedRememberedDevice(firstId), seedRememberedDevice(secondId)]);

    // Two browser sessions carry different signed custom-token claims and remain valid concurrently.
    await assertSucceeds(getDoc(doc(adminWith({ adminDeviceTrust: { id: firstId } }), ...secretPath)));
    await assertSucceeds(getDoc(doc(adminWith({ adminDeviceTrust: { id: secondId } }), ...secretPath)));

    const noRecord = adminWith({ adminDeviceTrust: { id: 'C'.repeat(43) } });
    await assertFails(getDoc(doc(noRecord, ...secretPath)));
    const malformedId = adminWith({ adminDeviceTrust: { id: '../admin-uid' } });
    await assertFails(getDoc(doc(malformedId, ...secretPath)));

    await seedRememberedDevice('D'.repeat(43), { expiresAt: Date.now() - 1 });
    await assertFails(getDoc(doc(adminWith({ adminDeviceTrust: { id: 'D'.repeat(43) } }), ...secretPath)));
    await seedRememberedDevice('E'.repeat(43), { revokedAt: Date.now() });
    await assertFails(getDoc(doc(adminWith({ adminDeviceTrust: { id: 'E'.repeat(43) } }), ...secretPath)));
  });

  it('revokes remembered sessions immediately through the per-device record or account reset marker', async () => {
    const deviceId = 'F'.repeat(43);
    await setState({ passkeyRequired: true, verificationsValidAfter: 1000, rememberedDevicesValidAfter: 1000 });
    await seedRememberedDevice(deviceId);
    const remembered = adminWith({ adminDeviceTrust: { id: deviceId } });
    await assertSucceeds(getDoc(doc(remembered, ...secretPath)));

    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'adminSecurity', 'admin-uid', 'rememberedDevices', deviceId), {
        revokedAt: Date.now(),
      });
    });
    await assertFails(getDoc(doc(remembered, ...secretPath)));

    await seedRememberedDevice(deviceId, { createdAt: Date.now() - 1000, revokedAt: null });
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'adminSecurity', 'admin-uid'), {
        rememberedDevicesValidAfter: Date.now(),
      });
    });
    await assertFails(getDoc(doc(remembered, ...secretPath)));
  });

  it('also closes owner/signed-in write paths for the unverified admin', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'galleries', 'g-admin'), {
        userId: 'admin-uid',
        name: 'Studio',
        selectionEnabled: false,
        selectionStatus: 'pending',
        selectedPhotoIds: [],
      });
    });
    const unverified = adminWith({});
    await assertFails(setDoc(doc(unverified, 'galleries', 'g-new'), { userId: 'admin-uid', name: 'x' }));
    await assertFails(updateDoc(doc(unverified, 'galleries', 'g-admin'), { name: 'tampered' }));
    await assertFails(deleteDoc(doc(unverified, 'galleries', 'g-admin')));

    const verified = adminWith(valid());
    await assertSucceeds(updateDoc(doc(verified, 'galleries', 'g-admin'), { name: 'ok' }));
    await assertSucceeds(deleteDoc(doc(verified, 'galleries', 'g-admin')));

    // Un cliente normale non è toccato dall'obbligo.
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'galleries', 'g-client'), { userId: 'client-1', name: 'Mia' });
    });
    const client = env.authenticatedContext('client-1', { email: 'c@example.com' }).firestore();
    await assertSucceeds(updateDoc(doc(client, 'galleries', 'g-client'), { name: 'Mia 2' }));
  });

  it('never lets a client read or write the admin security state', async () => {
    const verified = adminWith(valid());
    await assertFails(getDoc(doc(verified, 'adminSecurity', 'admin-uid')));
    await assertFails(setDoc(doc(verified, 'adminSecurity', 'admin-uid'), { passkeyRequired: false }));
    const stranger = env.authenticatedContext('u2', { email: 'c@example.com' }).firestore();
    await assertFails(getDoc(doc(stranger, 'adminSecurity', 'admin-uid')));
  });

  it('does not grant a non-admin anything through the claim', async () => {
    const impostor = env
      .authenticatedContext('u3', { email: 'c@example.com', auth_time: AUTH_TIME, ...valid() })
      .firestore();
    await assertFails(getDoc(doc(impostor, ...secretPath)));
  });
});
