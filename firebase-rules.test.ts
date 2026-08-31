import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  deleteObject,
  getBytes,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'print-shop-rules-test';
const ADMIN_EMAIL = 'gennaro.mazzacane@gmail.com';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: readFileSync('storage.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await Promise.all([testEnv.clearFirestore(), testEnv.clearStorage()]);
});

afterAll(async () => {
  await testEnv.cleanup();
});

function adminFirestore() {
  return testEnv.authenticatedContext('admin-uid', { email: ADMIN_EMAIL }).firestore();
}

function userFirestore(uid = 'user-1', email = 'cliente@example.com') {
  return testEnv.authenticatedContext(uid, { email }).firestore();
}

async function seedPrintUpload(options: {
  uid?: string;
  orderId?: string;
  assetId?: string;
  paymentStatus?: 'pending' | 'paid';
} = {}) {
  const uid = options.uid ?? 'user-1';
  const orderId = options.orderId ?? 'order-1';
  const assetId = options.assetId ?? 'asset-1';
  const storagePath = `print-orders/${uid}/${orderId}/${assetId}/original.jpg`;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await setDoc(doc(database, 'orders', orderId), {
      orderType: 'print_shop',
      ownerUid: uid,
      payment: { status: options.paymentStatus ?? 'pending' },
      fulfillment: { status: 'draft' },
    });
    await setDoc(doc(database, 'orders', orderId, 'assets', assetId), {
      orderId,
      ownerUid: uid,
      storagePath,
      status: 'prepared',
      createdAt: serverTimestamp(),
    });
  });
  return { uid, orderId, assetId, storagePath };
}

function jpegMetadata(uid: string, orderId: string, assetId: string) {
  return {
    contentType: 'image/jpeg',
    customMetadata: { ownerUid: uid, orderId, assetId },
  };
}

describe('Firestore rules — privilegi e compatibilità ordini', () => {
  it('permette all’unico admin gli ordini legacy senza orderType', async () => {
    const database = adminFirestore();
    const orderRef = doc(database, 'orders', 'legacy-order');
    await assertSucceeds(setDoc(orderRef, { stato: 'bozza', totale: 10 }));
    await assertSucceeds(updateDoc(orderRef, { stato: 'confermato' }));
    await assertSucceeds(deleteDoc(orderRef));
  });

  it('impedisce anche all’admin client di mutare ordini print_shop', async () => {
    const database = adminFirestore();
    await assertFails(setDoc(doc(database, 'orders', 'new-print'), {
      orderType: 'print_shop',
      ownerUid: 'user-1',
    }));

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'orders', 'existing-print'), {
        orderType: 'print_shop',
        ownerUid: 'user-1',
      });
    });
    const existing = doc(database, 'orders', 'existing-print');
    await assertFails(updateDoc(existing, { stato: 'consegnato' }));
    await assertFails(deleteDoc(existing));
  });

  it('protegge il listino print_shop ma mantiene i prodotti legacy modificabili', async () => {
    const database = adminFirestore();
    const legacy = doc(database, 'products', 'servizio-legacy');
    await assertSucceeds(setDoc(legacy, { nome: 'Servizio', prezzo: 100 }));
    await assertSucceeds(updateDoc(legacy, { prezzo: 120 }));

    const printProduct = doc(database, 'products', 'print-100x150');
    await assertFails(setDoc(printProduct, {
      nome: 'Stampa 10×15',
      salesChannels: ['admin', 'print_shop'],
    }));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'products', 'print-100x150'), {
        nome: 'Stampa 10×15',
        salesChannels: ['admin', 'print_shop'],
      });
    });
    await assertFails(updateDoc(printProduct, { prezzo: 0.01 }));
    await assertFails(deleteDoc(printProduct));
    await assertFails(updateDoc(legacy, { salesChannels: ['print_shop'] }));
  });

  it('non usa role o localStorage come fonte di privilegi', async () => {
    const attacker = userFirestore('attacker', 'attacker@example.com');
    await assertFails(setDoc(doc(attacker, 'users', 'attacker'), {
      uid: 'attacker',
      role: 'admin',
    }));
    await assertFails(setDoc(doc(attacker, 'orders', 'legacy-order'), {
      stato: 'bozza',
    }));
  });

  it('consente il profilo ordinario ma rende role immutabile', async () => {
    const database = userFirestore();
    const profile = doc(database, 'users', 'user-1');
    await assertSucceeds(setDoc(profile, {
      uid: 'user-1',
      role: 'user',
      displayName: 'Cliente',
    }));
    await assertSucceeds(updateDoc(profile, { profileImageUrl: 'https://example.com/me.jpg' }));
    await assertFails(updateDoc(profile, { role: 'admin' }));
    await assertFails(getDoc(doc(userFirestore('other'), 'users', 'user-1')));
    await assertSucceeds(getDoc(doc(adminFirestore(), 'users', 'user-1')));
  });
});

describe('Storage rules — originali privati dello shop', () => {
  it('nega ogni scrittura diretta: gli upload passano dalla sessione temporanea del backend', async () => {
    const seeded = await seedPrintUpload();
    const storage = testEnv.authenticatedContext(seeded.uid, {
      email: 'cliente@example.com',
    }).storage();
    const objectRef = ref(storage, seeded.storagePath);
    await assertFails(uploadBytes(
      objectRef,
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      jpegMetadata(seeded.uid, seeded.orderId, seeded.assetId),
    ));
    await assertFails(deleteObject(objectRef));
  });

  it('nega proprietario, metadati, MIME o stato pagamento non coerenti', async () => {
    const seeded = await seedPrintUpload();
    const ownerStorage = testEnv.authenticatedContext(seeded.uid, {
      email: 'cliente@example.com',
    }).storage();
    const objectRef = ref(ownerStorage, seeded.storagePath);

    await assertFails(uploadBytes(objectRef, new Uint8Array([1, 2, 3]), {
      contentType: 'image/png',
      customMetadata: {
        ownerUid: seeded.uid,
        orderId: seeded.orderId,
        assetId: seeded.assetId,
      },
    }));
    await assertFails(uploadBytes(
      objectRef,
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      jpegMetadata(seeded.uid, seeded.orderId, 'wrong-asset'),
    ));

    const strangerStorage = testEnv.authenticatedContext('other', {
      email: 'other@example.com',
    }).storage();
    await assertFails(uploadBytes(
      ref(strangerStorage, seeded.storagePath),
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      jpegMetadata(seeded.uid, seeded.orderId, seeded.assetId),
    ));

    const paid = await seedPrintUpload({ orderId: 'paid-order', assetId: 'paid-asset', paymentStatus: 'paid' });
    await assertFails(uploadBytes(
      ref(ownerStorage, paid.storagePath),
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      jpegMetadata(paid.uid, paid.orderId, paid.assetId),
    ));
  });

  it('mantiene la lettura privata al proprietario o all’admin verificato', async () => {
    const seeded = await seedPrintUpload();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(
        ref(context.storage(), seeded.storagePath),
        new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
        jpegMetadata(seeded.uid, seeded.orderId, seeded.assetId),
      );
    });

    const owner = testEnv.authenticatedContext(seeded.uid, { email: 'cliente@example.com' }).storage();
    const admin = testEnv.authenticatedContext('admin-uid', { email: ADMIN_EMAIL }).storage();
    const stranger = testEnv.authenticatedContext('other', { email: 'other@example.com' }).storage();
    await assertSucceeds(getBytes(ref(owner, seeded.storagePath)));
    await assertSucceeds(getBytes(ref(admin, seeded.storagePath)));
    await assertFails(getBytes(ref(stranger, seeded.storagePath)));
    await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(), seeded.storagePath)));
  });
});
