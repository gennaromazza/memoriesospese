#!/usr/bin/env node
/**
 * uploader-pc.js — Uploader Gallerie Image Studio
 * ================================================
 * SETUP (una volta sola sul tuo PC Windows):
 *   1. Installa Node.js da https://nodejs.org  (versione LTS, es. 20.x)
 *   2. Apri il terminale (cmd o PowerShell) nella cartella dove hai questo file
 *   3. Esegui:  npm install firebase-admin
 *
 * USO (ogni volta che vuoi caricare foto):
 *   node uploader-pc.js
 *
 * Le credenziali Firebase sono già configurate — non toccare nulla.
 */
'use strict';

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');
const rl    = require('readline');

// ── CREDENZIALI (già configurate, non modificare) ─────────────────────────────
const SERVICE_ACCOUNT = {
  "type": "service_account",
  "project_id": "wedding-gallery-397b6",
  "private_key_id": "6c377c8196aec5f53cd20ad73843d249197915a9",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDDQWBlCeJOfBLM\n5I+wJ5VM0oHZE2syIHVbR/acx4VW7NCLvG5kET1wUQvjdhCnhnutAgjy5wCheDNi\ntBrzjJ8PiveHLUZHVUV0Y26/sg4yHjqBiB8x+t3CqcI6cbdXKYVp7O60+JYAdu0h\nC7JXldi6jtvKRKIGcf1E0pbUHGHG8bCXR7Ey1L6D3NHYA8i3weKmNPoh77gTakBU\nOurmfslEwbHddxsHhLbYIdY3FQqWmoKIXXv+fSdLQj5xMpEE761JnKTpLnh2Vfnr\nJvehQhK8LfeOW9eY/is58qucxOxYgxrCecZfFyJFvAXxjNMYjPb6AbTL43CCwHXK\n6Ei3Cy1lAgMBAAECggEACr7ilfTvDDg2VanfgYeQJyfvpvlzXREdvE4P062EWFYU\nnRgb8Cxlt/Rx5c0F2h5j2I/j27BcX8aMd2pnkE9FIrcYa8tRUpQuDBt7yRd8wgPZ\nXu8VnmvKwA+VJZ/EAgtCMSPtuC51HOXuo3KwGDNiN9QsYuuXiijEUkEPtXExbWAf\nlk/hIPVwc+CQqW6A8taQKa3S+U0t4Ng+3vRv+ejRwaor7/BrX5AWwe1qoViF/Ip7\nQZE5sxRs306h8xuCSbLFID4igf7L68G7l79aNwIUkQmtH85YRvwvm6sgaNoCa1St\nY7GS1eERgstqzwFCWCwybN5T9fVB62SFt7cQ3XsngQKBgQDwVeAuIuncGTJCl4Xg\nWrzOnTcUPUKWhB7Dwz3srOKTj0uC2Zjq82fMeF2tlEE+phR7ei3dE/p1NlvJh6ti\nNWS1WUbIHuK+AbWOIZ+Pr1/k+gsjnPRCNdg24PZfewd/WZdJevELrYksMmDT/k09\n4BQ41GmLlgGALl7/q8TgVmhw5QKBgQDP+1DfyekdxG84G9+HWP2yTIc/VZv1mtsB\nsG1ozzX9WnkRmscCURX0ZgkTBblsJm8CdMSw8MiBhCPjP45uFzVz1H5Wb/RlVNXX\nunxIbDqKhKtp4qS1G9p7ANT4U3c+qJHNPirpeLCx7b4zv3cQGywrE2Nmo7AV3cfS\nVznwA16CgQKBgBSHYVTPiqZQSKjDhJ37YjFL4I6MBQoSUwZpwPpcciYkkVCmAZfg\nHreqeGYBSeluCkXZ090UfcpRUFnQiuUipm2PKKqjaL7OKpHvcU+2rTxD13u9Rmf5\nbXSSlrjlK2jHYFLYe4qB0jvCOd8h07s7Tr7j9fgEYjBuxZKVO4XmG5m5AoGBAMw3\nylajrNoEyux+OgNtd1Z+3IJs7kHAt3E2KogyhqHqF10Y7HYy5mrfUeOyyDoQlwoD\nXCsdktPRy2dVPeaNtXex3AfF0GU7Yup7+5MlamofES1cVTxcSDBlRbk8Q6dr4BZ3\nB63OSzm65vtq8l8HP1xgokbjTYB7D71S1tn8hO2BAoGAfgympPR36HHn7gvX/ixM\nhV6jZn0M4AqlnHxU70pFnVvqqCKKbESPJlw2u6mscvSKqtlYWmAAAxqdr5zN+pOz\nFubiPRoMhH6hlQwWHP9ssuNuDw18Pg7unCw5+Rc28QldflHNBf+IBWIROl0UK9mj\nidHXSZ8SarzPf6Yc/x+jUbg=\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@wedding-gallery-397b6.iam.gserviceaccount.com",
  "client_id": "115446294750232280690",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40wedding-gallery-397b6.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};
const PROJECT_ID      = SERVICE_ACCOUNT.project_id;
const BUCKET          = PROJECT_ID + '.firebasestorage.app';
const GALLERY_URL     = 'https://imagestudiofotografico.com/gallery';
// ─────────────────────────────────────────────────────────────────────────────

const IMG_EXT     = new Set(['.jpg','.jpeg','.png','.gif','.webp','.bmp','.tiff','.tif','.heic','.heif','.avif']);
const MAX_PARALLEL = 3;

// ── Firebase init ─────────────────────────────────────────────────────────────
admin.initializeApp({ credential: admin.credential.cert(SERVICE_ACCOUNT), storageBucket: BUCKET });
const db     = admin.firestore();
const bucket = admin.storage().bucket();

// ── Helpers ───────────────────────────────────────────────────────────────────
function ask(question) {
  const r = rl.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => r.question(question, ans => { r.close(); res(ans.trim()); }));
}

function nanoid(n = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function mime(file) {
  const e = path.extname(file).toLowerCase();
  return { '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif',
           '.webp':'image/webp','.bmp':'image/bmp','.tiff':'image/tiff','.tif':'image/tiff',
           '.heic':'image/heic','.heif':'image/heif','.avif':'image/avif' }[e] || 'image/jpeg';
}

function scanFolder(root) {
  const entries  = fs.readdirSync(root, { withFileTypes: true });
  const subdirs  = entries.filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name));
  const imgFiles = f => IMG_EXT.has(path.extname(f).toLowerCase());
  const rootPhotos = entries.filter(e => e.isFile() && imgFiles(e.name))
                            .map(e => path.join(root, e.name)).sort();
  if (!subdirs.length) {
    return rootPhotos.length ? [{ name: null, ordine: 0, photos: rootPhotos }] : [];
  }
  const chapters = [];
  for (const [i, d] of subdirs.entries()) {
    const photos = fs.readdirSync(path.join(root, d.name))
      .filter(imgFiles).sort().map(f => path.join(root, d.name, f));
    if (photos.length) chapters.push({ name: d.name, ordine: i, photos });
  }
  if (rootPhotos.length) chapters.push({ name: null, ordine: chapters.length, photos: rootPhotos });
  return chapters;
}

async function runPool(jobs, fn, concurrency) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
      while (i < jobs.length) { const job = jobs[i++]; await fn(job); }
    })
  );
}

// ── Upload singola foto ───────────────────────────────────────────────────────
async function uploadPhoto(filePath, galleryId, chapterId, counter) {
  const original     = path.basename(filePath);
  const storageName  = `${Date.now()}_${nanoid(6)}-${original}`;
  const storagePath  = `galleries/${galleryId}/photos/${storageName}`;
  const contentType  = mime(filePath);

  await bucket.upload(filePath, {
    destination: storagePath,
    metadata: { contentType },
  });

  const [url] = await bucket.file(storagePath).getSignedUrl({
    action: 'read', expires: '2099-01-01',
  });

  await db.collection('photos').add({
    galleryId,
    chapterId:     chapterId || null,
    name:          original,
    url,
    size:          fs.statSync(filePath).size,
    contentType,
    uploadedBy:    'admin',
    uploaderUid:   'script-upload',
    uploaderEmail: 'admin@script',
    uploaderName:  'Script Upload',
    likeCount:     0,
    commentCount:  0,
    position:      0,
    createdAt:     admin.firestore.FieldValue.serverTimestamp(),
  });

  counter.done++;
  const label = original.length > 45 ? original.slice(0, 42) + '...' : original.padEnd(45);
  process.stdout.write(`\r  📷 ${String(counter.done).padStart(4)}/${counter.total}  ${label}`);
}

// ── NUOVA GALLERIA ────────────────────────────────────────────────────────────
async function createNewGallery() {
  console.log('\n─── NUOVA GALLERIA ──────────────────────────────────\n');
  const name = await ask('Nome galleria *: ');
  if (!name) { console.error('\nNome obbligatorio.'); process.exit(1); }

  const date     = await ask('Data evento (gg/mm/aaaa, invio per saltare): ');
  const location = await ask('Luogo (invio per saltare): ');
  const folder   = (await ask('Percorso cartella foto *: ')).replace(/^["']|["']$/g, '');

  if (!fs.existsSync(folder)) {
    console.error('\nCartella non trovata: ' + folder);
    process.exit(1);
  }

  const chapters = scanFolder(folder);
  if (!chapters.length) { console.error('\nNessuna immagine trovata nella cartella.'); process.exit(1); }

  const total       = chapters.reduce((s, c) => s + c.photos.length, 0);
  const hasChapters = chapters.some(c => c.name);
  const namedChs    = chapters.filter(c => c.name);

  console.log(`\nTrovate: ${total} foto${hasChapters ? ' in ' + namedChs.length + ' capitoli: ' + namedChs.map(c=>c.name).join(', ') : ''}`);
  const ok = await ask('Procedere con il caricamento? (s/n): ');
  if (ok.toLowerCase() !== 's') { console.log('Annullato.'); process.exit(0); }

  // Crea documento galleria
  const galleryId   = db.collection('galleries').doc().id;
  const galleryCode = nanoid(8);
  const fsChapters  = namedChs.map(c => ({
    id: nanoid(10), titolo: c.name, descrizione: '',
    ordine: c.ordine, createdAt: new Date(), updatedAt: new Date(),
  }));

  await db.collection('galleries').doc(galleryId).set({
    name, code: galleryCode,
    date: date || '', location: location || '', description: '',
    hasPassword: false, active: true,
    photoCount: 0, selectionEnabled: false, unlimitedSelection: false,
    chaptersEnabled: hasChapters,
    chapters: fsChapters,
    userId: 'script-upload',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('gallerySecrets').doc(galleryId).set({
    galleryId, password: null, specialPin: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`\n✓ Galleria creata  (codice: ${galleryCode})`);
  console.log(`\nAvvio upload di ${total} foto...\n`);

  const chapterMap = Object.fromEntries(fsChapters.map(c => [c.titolo, c.id]));
  const jobs       = chapters.flatMap(ch =>
    ch.photos.map(p => ({ path: p, chapterId: ch.name ? chapterMap[ch.name] : null }))
  );
  const counter = { done: 0, total };
  const errors  = [];

  await runPool(jobs, async job => {
    try { await uploadPhoto(job.path, galleryId, job.chapterId, counter); }
    catch (e) { errors.push({ f: path.basename(job.path), err: e.message }); }
  }, MAX_PARALLEL);

  await db.collection('galleries').doc(galleryId).update({
    photoCount: total - errors.length,
    updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`\n\n✅ Upload completato: ${total - errors.length}/${total} foto caricate`);
  if (errors.length) {
    console.log('⚠  Errori su questi file:');
    errors.forEach(e => console.log(`   - ${e.f}: ${e.err}`));
  }
  console.log(`\n🔗 Link galleria: ${GALLERY_URL}/${galleryCode}\n`);
}

// ── GALLERIA ESISTENTE ────────────────────────────────────────────────────────
async function addToExisting() {
  console.log('\n─── AGGIUNGI FOTO A GALLERIA ESISTENTE ──────────────\n');
  console.log('Caricamento gallerie dal database...');

  const snap = await db.collection('galleries').orderBy('createdAt', 'desc').limit(200).get();
  const list = snap.docs.map((d, i) => {
    const dt = d.data();
    return { n: i + 1, id: d.id, name: dt.name, code: dt.code || '', date: dt.date || '', count: dt.photoCount || 0 };
  });

  console.log('');
  list.forEach(g => {
    const label = `${g.name}${g.date ? '  (' + g.date + ')' : ''}`;
    console.log(`  ${String(g.n).padStart(3)}.  ${label.padEnd(50)}  [${g.count} foto]`);
  });

  const numStr = await ask('\nNumero galleria: ');
  const num    = parseInt(numStr, 10);
  if (!num || num < 1 || num > list.length) { console.error('Numero non valido.'); process.exit(1); }
  const gallery = list[num - 1];

  const folder = (await ask('Percorso cartella foto *: ')).replace(/^["']|["']$/g, '');
  if (!fs.existsSync(folder)) { console.error('\nCartella non trovata: ' + folder); process.exit(1); }

  const chapters = scanFolder(folder);
  if (!chapters.length) { console.error('\nNessuna immagine trovata.'); process.exit(1); }

  const total = chapters.reduce((s, c) => s + c.photos.length, 0);
  console.log(`\nGalleria selezionata: "${gallery.name}"`);
  console.log(`Foto da aggiungere: ${total}`);
  const ok = await ask('Procedere? (s/n): ');
  if (ok.toLowerCase() !== 's') { console.log('Annullato.'); process.exit(0); }

  // Gestione capitoli esistenti + nuovi
  const galleryDocData  = (await db.collection('galleries').doc(gallery.id).get()).data();
  const existingChapters = galleryDocData.chapters || [];
  const chapterMap = Object.fromEntries(existingChapters.map(c => [c.titolo, c.id]));
  const newChapters = [];

  for (const ch of chapters.filter(c => c.name)) {
    if (!chapterMap[ch.name]) {
      const newId = nanoid(10);
      chapterMap[ch.name] = newId;
      newChapters.push({
        id: newId, titolo: ch.name, descrizione: '',
        ordine: existingChapters.length + newChapters.length,
        createdAt: new Date(), updatedAt: new Date(),
      });
    }
  }
  if (newChapters.length) {
    await db.collection('galleries').doc(gallery.id).update({
      chapters: [...existingChapters, ...newChapters],
      chaptersEnabled: true,
    });
    console.log(`✓ Aggiunti ${newChapters.length} nuovi capitoli`);
  }

  const jobs = chapters.flatMap(ch =>
    ch.photos.map(p => ({ path: p, chapterId: ch.name ? chapterMap[ch.name] : null }))
  );
  console.log(`\nAvvio upload di ${total} foto...\n`);
  const counter = { done: 0, total };
  const errors  = [];

  await runPool(jobs, async job => {
    try { await uploadPhoto(job.path, gallery.id, job.chapterId, counter); }
    catch (e) { errors.push({ f: path.basename(job.path), err: e.message }); }
  }, MAX_PARALLEL);

  await db.collection('galleries').doc(gallery.id).update({
    photoCount: admin.firestore.FieldValue.increment(total - errors.length),
    updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`\n\n✅ Upload completato: ${total - errors.length}/${total} foto aggiunte a "${gallery.name}"`);
  if (errors.length) {
    console.log('⚠  Errori:');
    errors.forEach(e => console.log(`   - ${e.f}: ${e.err}`));
  }
  console.log(`\n🔗 Link galleria: ${GALLERY_URL}/${gallery.code}\n`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   Image Studio — Uploader Gallerie v2          ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  const choice = await ask('Cosa vuoi fare?\n  1. Crea nuova galleria\n  2. Aggiungi foto a galleria esistente\n\nScelta (1 o 2): ');
  if (choice === '1')      await createNewGallery();
  else if (choice === '2') await addToExisting();
  else { console.error('Scelta non valida.'); process.exit(1); }
  process.exit(0);
}

main().catch(e => {
  console.error('\n❌ Errore imprevisto:', e.message);
  process.exit(1);
});
