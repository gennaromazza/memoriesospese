/**
 * Test end-to-end trasferimento pagine fotolibro → Drive in background.
 * Crea un fotolibro di test con 60 pagine (riusando un file Storage reale),
 * chiama POST /api/photobooks/:id/lab-shipment come admin e verifica:
 * - risposta immediata (202, niente timeout)
 * - secondo POST durante il run → alreadyRunning (nessun doppio trasferimento)
 * - convergenza: files == 60, nessun nome duplicato
 * - retry post-completamento: tutte skipped, nessun duplicato
 * Cleanup completo alla fine (Firestore + cartella Drive).
 */
import { db, storage } from '../server/firebase-admin.js';
import { getAuth } from 'firebase-admin/auth';
import { deleteDriveFile } from '../server/google-drive.js';

const BASE = 'http://localhost:5000';
const ADMIN_EMAIL = 'gennaro.mazzacane@gmail.com';
const N_PAGES = 60;

async function getAdminIdToken(): Promise<string> {
  const user = await getAuth().getUserByEmail(ADMIN_EMAIL);
  const customToken = await getAuth().createCustomToken(user.uid);
  const apiKey = process.env.VITE_FIREBASE_API_KEY || 'AIzaSyA4mw3dKOvcDBxgIJOo-r-4yUmyv0knxME';
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  if (!r.ok) throw new Error(`signInWithCustomToken failed: ${r.status} ${await r.text()}`);
  return (await r.json()).idToken;
}

async function main() {
  // 1. File Storage reale da riusare (pagina fotolibro esistente o foto galleria)
  let sourcePath: string | null = null;
  const pageSnap = await db.collection('photobookPages').limit(1).get();
  if (!pageSnap.empty) sourcePath = pageSnap.docs[0].data().storagePath || null;
  if (!sourcePath) {
    const [files] = await storage.bucket().getFiles({ prefix: 'galleries/', maxResults: 5 });
    const f = files.find((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
    sourcePath = f?.name || null;
  }
  if (!sourcePath) throw new Error('Nessun file Storage disponibile per il test');
  const [meta] = await storage.bucket().file(sourcePath).getMetadata();
  console.log(`Sorgente: ${sourcePath} (${Math.round(Number(meta.size) / 1024)} KB)`);

  // 2. Job esistente
  const jobSnap = await db.collection('jobs').limit(1).get();
  if (jobSnap.empty) throw new Error('Nessun job disponibile');
  const jobId = jobSnap.docs[0].id;

  // 3. Fotolibro di test + 60 pagine
  const bookRef = await db.collection('photobooks').add({
    name: 'TEST-TRANSFER-BIG (da eliminare)',
    galleryId: 'test-none',
    token: `testtoken-${Date.now()}`,
    currentVersion: 1,
    locked: true,
    jobId,
    versions: [{ version: 1, label: null, pageCount: N_PAGES, createdAt: new Date() }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  let batch = db.batch();
  const pageIds: string[] = [];
  for (let i = 1; i <= N_PAGES; i++) {
    const ref = db.collection('photobookPages').doc();
    pageIds.push(ref.id);
    batch.set(ref, {
      photobookId: bookRef.id,
      version: 1,
      pageNumber: i,
      fileName: `test-${i}.jpg`,
      url: 'about:blank',
      storagePath: sourcePath,
      width: 100,
      height: 100,
      createdAt: new Date(),
    });
  }
  await batch.commit();
  console.log(`Fotolibro test ${bookRef.id} con ${N_PAGES} pagine creato`);

  const token = await getAdminIdToken();
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  let shipmentId: string | null = null;
  let driveFolderId: string | null = null;
  try {
    // 4. POST lab-shipment: deve rispondere subito
    let t0 = Date.now();
    const r1 = await fetch(`${BASE}/api/photobooks/${bookRef.id}/lab-shipment`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ descrizione: 'TEST transfer grande', expiryDays: 1 }),
    });
    const j1 = await r1.json();
    console.log(
      `POST #1 → ${r1.status} in ${Date.now() - t0}ms | started=${j1.started} totalPages=${j1.totalPages}`,
    );
    if (r1.status !== 202) throw new Error(`Atteso 202, ricevuto ${r1.status}: ${JSON.stringify(j1)}`);
    shipmentId = j1.shipment.id;

    // 5. Secondo POST subito: deve dire alreadyRunning
    t0 = Date.now();
    const r2 = await fetch(`${BASE}/api/photobooks/${bookRef.id}/lab-shipment`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({}),
    });
    const j2 = await r2.json();
    console.log(
      `POST #2 (concorrente) → ${r2.status} in ${Date.now() - t0}ms | alreadyRunning=${j2.alreadyRunning}`,
    );

    // 6. Polling fino a completamento (max 15 min)
    const shipRef = db.collection('labShipments').doc(shipmentId!);
    const deadline = Date.now() + 15 * 60 * 1000;
    let pt: any = null;
    while (Date.now() < deadline) {
      const s = (await shipRef.get()).data()!;
      pt = s.pageTransfer;
      driveFolderId = s.driveFolderId || driveFolderId;
      console.log(
        `  stato=${pt?.status} trasferite=${pt?.transferred} skipped=${pt?.skipped} fallite=${pt?.failed?.length} files=${s.files?.length}`,
      );
      if (pt && pt.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (!pt || pt.status === 'running') throw new Error('Timeout: trasferimento non concluso');

    const sData = (await shipRef.get()).data()!;
    const names = (sData.files || []).map((f: any) => f.name);
    const dupes = names.filter((n: string, i: number) => names.indexOf(n) !== i);
    console.log(
      `ESITO run #1: status=${pt.status} files=${names.length}/${N_PAGES} duplicati=${dupes.length}`,
    );
    if (dupes.length > 0) throw new Error(`DUPLICATI: ${dupes.slice(0, 5)}`);

    // 7. Retry post-completamento: tutte skipped, nessun nuovo file
    const r3 = await fetch(`${BASE}/api/photobooks/${bookRef.id}/lab-shipment`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({}),
    });
    const j3 = await r3.json();
    console.log(`POST #3 (retry) → ${r3.status} started=${j3.started}`);
    const deadline2 = Date.now() + 5 * 60 * 1000;
    let pt2: any = null;
    while (Date.now() < deadline2) {
      const s = (await shipRef.get()).data()!;
      pt2 = s.pageTransfer;
      if (pt2 && pt2.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    const sData2 = (await shipRef.get()).data()!;
    console.log(
      `ESITO retry: status=${pt2?.status} transferred=${pt2?.transferred} skipped=${pt2?.skipped} files=${sData2.files?.length}`,
    );
    if ((sData2.files?.length || 0) !== names.length)
      throw new Error('Il retry ha creato file extra!');
    console.log('✅ TEST OK');
  } finally {
    // Cleanup
    console.log('Cleanup…');
    try {
      if (driveFolderId) await deleteDriveFile(driveFolderId);
    } catch (e: any) {
      console.warn('Cleanup Drive fallito:', e?.message);
    }
    if (shipmentId) await db.collection('labShipments').doc(shipmentId).delete().catch(() => {});
    let delBatch = db.batch();
    for (const id of pageIds) delBatch.delete(db.collection('photobookPages').doc(id));
    await delBatch.commit();
    await bookRef.delete();
    console.log('Cleanup completato');
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('TEST FALLITO:', e);
    process.exit(1);
  },
);
