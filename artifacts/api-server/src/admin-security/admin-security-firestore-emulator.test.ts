import { afterAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

const testEnabled = process.env.ADMIN_SECURITY_FIRESTORE_EMULATOR_TEST === '1';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const localFirestoreHost = /^(127\.0\.0\.1|localhost):8089$/.test(emulatorHost);
const DEMO_PROJECT_ID = 'demo-admin-passkey-race';

if (testEnabled && !localFirestoreHost) {
  throw new Error(
    'Passkey Firestore race test requires the local Firestore emulator at 127.0.0.1:8089.',
  );
}

const h = vi.hoisted(() => ({
  db: null as any,
  fieldValue: null as any,
  uid: '',
  authTime: 1_700_000_000,
  enrollmentReadBarrier: null as null | {
    path: string;
    reads: number;
    promise: Promise<void>;
    release: () => void;
  },
}));

vi.mock('../firebase-admin.js', () => ({
  db: h.db,
  FieldValue: h.fieldValue,
}));

// Authenticate only through a local test token; Firestore remains the real emulator client.
vi.mock('../email-routes.js', () => ({
  authenticateFirebase: (req: any, res: any, next: any) => {
    if (req.headers.authorization !== 'Bearer local-firestore-race-test') {
      res.status(401).json({ error: 'Test token required', code: 'unauthorized' });
      return;
    }
    req.user = {
      uid: h.uid,
      email: 'gennaro.mazzacane@gmail.com',
      claims: { auth_time: h.authTime },
    };
    next();
  },
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async () => ({
      uid: h.uid,
      email: 'gennaro.mazzacane@gmail.com',
      auth_time: h.authTime,
    }),
    getUser: async () => ({ customClaims: {} }),
    setCustomUserClaims: async () => undefined,
  }),
}));

vi.mock('@simplewebauthn/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simplewebauthn/server')>();
  return {
    ...actual,
    verifyAuthenticationResponse: async () => ({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    }),
    verifyRegistrationResponse: async () => ({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'new-emulator-device-credential',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ['internal'],
        },
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
      },
    }),
  };
});

const docTargets = new WeakMap<object, object>();

function wrapDocumentReference(reference: any): any {
  const wrapped = new Proxy(reference, {
    get(target, property) {
      if (property === 'get') {
        return async () => {
          const snapshot = await target.get();
          const barrier = h.enrollmentReadBarrier;
          if (barrier && barrier.path === target.path && barrier.reads < 2) {
            barrier.reads += 1;
            if (barrier.reads === 2) barrier.release();
            await barrier.promise;
          }
          return snapshot;
        };
      }
      if (property === 'collection') {
        return (name: string) => wrapCollectionReference(target.collection(name));
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  docTargets.set(wrapped, reference);
  return wrapped;
}

function wrapCollectionReference(reference: any): any {
  return new Proxy(reference, {
    get(target, property) {
      if (property === 'doc') {
        return (...args: unknown[]) => wrapDocumentReference(target.doc(...args));
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function wrapFirestoreForConcurrentReads(database: Firestore): Firestore {
  return new Proxy(database, {
    get(target, property) {
      if (property === 'collection') {
        return (name: string) => wrapCollectionReference(target.collection(name));
      }
      if (property === 'runTransaction') {
        return (callback: (transaction: any) => Promise<unknown>, options?: unknown) =>
          target.runTransaction((transaction) => {
            const wrappedTransaction = new Proxy(transaction, {
              get(tx, method) {
                if (['get', 'set', 'update', 'delete'].includes(String(method))) {
                  return (reference: object, ...args: unknown[]) => {
                    const unwrapped = docTargets.get(reference) ?? reference;
                    return (tx as any)[method](unwrapped, ...args);
                  };
                }
                const value = Reflect.get(tx, method, tx);
                return typeof value === 'function' ? value.bind(tx) : value;
              },
            });
            return callback(wrappedTransaction);
          }, options as any);
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Firestore;
}

let emulatorApp: App | null = null;
let emulatorDb: Firestore | null = null;
if (testEnabled) {
  emulatorApp = initializeApp(
    { projectId: DEMO_PROJECT_ID },
    `admin-security-firestore-race-${process.pid}`,
  );
  emulatorDb = getFirestore(emulatorApp);
}
h.db = emulatorDb ? wrapFirestoreForConcurrentReads(emulatorDb) : null;
h.fieldValue = FieldValue;

const { default: securityRouter } = await import('./admin-security-routes.js');
const store = await import('./admin-security-store.js');

const app = express();
app.use(express.json());
app.use('/api/admin/security', securityRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const serverAddress = server.address();
if (!serverAddress || typeof serverAddress === 'string') {
  throw new Error('Unable to bind the local passkey test server.');
}
const baseUrl = `http://127.0.0.1:${(serverAddress as AddressInfo).port}`;

const verifier = 'E'.repeat(43);
const verifierHash = createHash('sha256').update(verifier).digest('base64url');

function call(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: 'Bearer local-firestore-race-test',
      Origin: 'https://imagestudiofotografico.com',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function removeTestData(uid: string) {
  if (!emulatorDb) return;
  const root = emulatorDb.collection('adminSecurity').doc(uid);
  for (const collectionName of ['passkeys', 'events', 'deviceEnrollments']) {
    const snapshot = await root.collection(collectionName).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }
  await root.delete();
}

afterAll(async () => {
  if (h.uid) await removeTestData(h.uid);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (emulatorApp) await deleteApp(emulatorApp);
});

describe.skipIf(!testEnabled)('registrazione passkey QR su Firestore Emulator', () => {
  it('salva una sola nuova passkey quando arrivano due verifiche concorrenti', async () => {
    if (!emulatorDb) throw new Error('Firestore emulator database was not initialized.');
    h.uid = `admin-passkey-race-${process.pid}-${randomUUID()}`;
    h.authTime = 1_700_000_000;

    await store.savePasskey(h.uid, {
      id: 'trusted-device-credential',
      publicKey: 'AQID',
      counter: 0,
      transports: ['internal'],
      rpId: 'imagestudiofotografico.com',
      label: 'Dispositivo fidato',
      deviceType: 'multiDevice',
      backedUp: true,
      createdAt: Date.now(),
      lastUsedAt: null,
    });
    await store.updateState(h.uid, { passkeyRequired: true });

    const startedResponse = await call('/api/admin/security/device-enrollment/start', {
      method: 'POST',
      body: JSON.stringify({ verifierHash, deviceLabel: 'Nuovo dispositivo' }),
    });
    expect(startedResponse.status).toBe(200);
    const started = await startedResponse.json() as { enrollmentId: string };

    const approvalOptions = await call(
      `/api/admin/security/device-enrollment/${started.enrollmentId}/authentication/options`,
      { method: 'POST' },
    );
    expect(approvalOptions.status).toBe(200);
    const approvalResponse = await call(
      `/api/admin/security/device-enrollment/${started.enrollmentId}/authentication/verify`,
      {
        method: 'POST',
        body: JSON.stringify({ response: { id: 'trusted-device-credential' } }),
      },
    );
    expect(approvalResponse.status).toBe(200);

    const registrationOptions = await call(
      `/api/admin/security/device-enrollment/${started.enrollmentId}/registration/options`,
      { method: 'POST', body: JSON.stringify({ verifier }) },
    );
    expect(registrationOptions.status).toBe(200);

    let releaseBothReads: () => void = () => undefined;
    const bothReadsFinished = new Promise<void>((resolve) => {
      releaseBothReads = resolve;
    });
    h.enrollmentReadBarrier = {
      path: `adminSecurity/${h.uid}/deviceEnrollments/${started.enrollmentId}`,
      reads: 0,
      promise: bothReadsFinished,
      release: releaseBothReads,
    };

    // Make both requests observe "approved" before either consumes the challenge.
    let registrationResponses: Response[];
    try {
      const registrationPath =
        `/api/admin/security/device-enrollment/${started.enrollmentId}/registration/verify`;
      const body = JSON.stringify({
        verifier,
        response: { id: 'new-emulator-device-credential' },
      });
      registrationResponses = await Promise.all([
        call(registrationPath, { method: 'POST', body }),
        call(registrationPath, { method: 'POST', body }),
      ]);
    } finally {
      h.enrollmentReadBarrier = null;
    }

    expect(registrationResponses.map((response) => response.status).sort()).toEqual([200, 400]);
    const results = await Promise.all(
      registrationResponses.map((response) => response.json()),
    ) as any[];
    expect(results.filter((result: any) => result.passkey)).toHaveLength(1);
    expect(results.find((result: any) => result.code)?.code).toBe('challenge_expired');

    const passkeys = await store.listPasskeys(h.uid);
    expect(passkeys.map((passkey) => passkey.id).sort()).toEqual([
      'new-emulator-device-credential',
      'trusted-device-credential',
    ]);
    await expect(store.getDeviceEnrollment(h.uid, started.enrollmentId)).resolves.toMatchObject({
      status: 'registered',
      registrationChallenge: null,
    });
  }, 30_000);
});
