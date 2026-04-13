#!/usr/bin/env node
/**
 * uploader-pc.js — Uploader Gallerie Image Studio  v3
 * ====================================================
 * SETUP (una volta sola sul tuo PC Windows):
 *   1. Installa Node.js da https://nodejs.org  (versione LTS, es. 20.x)
 *   2. Copia nella stessa cartella:
 *        uploader-pc.js
 *        package-uploader.json  →  rinominalo in  package.json
 *   3. Apri il terminale (cmd o PowerShell) nella cartella
 *   4. Esegui:  npm install
 *
 * USO:
 *   node uploader-pc.js
 *
 * CONVENZIONE COPERTINE (opzionale):
 *   Metti nella cartella delle foto (o nella sottocartella capitolo) un file
 *   il cui nome inizia con  "_copertina"  (es. _copertina.jpg)
 *   → verrà caricato come foto normale E impostato come copertina.
 *
 * Le credenziali Firebase sono già integrate — non toccare nulla.
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

const IMG_EXT      = new Set(['.jpg','.jpeg','.png','.gif','.webp','.bmp','.tiff','.tif','.heic','.heif','.avif']);
const MAX_PARALLEL = 3;
const SIGNED_URL_EXPIRY = '2099-01-01';

const THEMES = [
  { id: 'natale',        label: '🎄 Natale' },
  { id: 'carnevale',     label: '🎭 Carnevale' },
  { id: 'san-valentino', label: '💕 San Valentino' },
  { id: 'pasqua',        label: '🐰 Pasqua' },
  { id: 'halloween',     label: '🎃 Halloween' },
];

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
  return ({
    '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif',
    '.webp':'image/webp','.bmp':'image/bmp','.tiff':'image/tiff','.tif':'image/tiff',
    '.heic':'image/heic','.heif':'image/heif','.avif':'image/avif',
  })[path.extname(file).toLowerCase()] || 'image/jpeg';
}

function isImage(file) {
  return IMG_EXT.has(path.extname(file).toLowerCase());
}

function isCover(file) {
  return path.basename(file).toLowerCase().startsWith('_copertina');
}

/** Scansiona una cartella e restituisce capitoli con foto e cover */
function scanFolder(root) {
  const entries  = fs.readdirSync(root, { withFileTypes: true });
  const subdirs  = entries.filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name));
  const rootFiles = entries.filter(e => e.isFile() && isImage(e.name)).map(e => path.join(root, e.name)).sort();
  const rootCover  = rootFiles.find(f => isCover(f)) || null;
  const rootPhotos = rootFiles.filter(f => !isCover(f));

  if (!subdirs.length) {
    return rootPhotos.length || rootCover
      ? [{ name: null, ordine: 0, photos: rootPhotos, cover: rootCover }]
      : [];
  }

  const chapters = [];
  for (const [i, d] of subdirs.entries()) {
    const files  = fs.readdirSync(path.join(root, d.name)).filter(isImage).sort()
                     .map(f => path.join(root, d.name, f));
    const cover  = files.find(f => isCover(f)) || null;
    const photos = files.filter(f => !isCover(f));
    if (photos.length || cover) chapters.push({ name: d.name, ordine: i, photos, cover });
  }
  // File nella radice (tra le sottocartelle) = senza capitolo
  if (rootPhotos.length || rootCover) {
    chapters.push({ name: null, ordine: chapters.length, photos: rootPhotos, cover: rootCover });
  }
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

// ── Upload foto ───────────────────────────────────────────────────────────────
async function uploadPhoto(filePath, galleryId, chapterId, counter) {
  const original    = path.basename(filePath);
  const storageName = `${Date.now()}_${nanoid(6)}-${original}`;
  const storagePath = `galleries/${galleryId}/photos/${storageName}`;
  const contentType = mime(filePath);

  await bucket.upload(filePath, { destination: storagePath, metadata: { contentType } });
  const [url] = await bucket.file(storagePath).getSignedUrl({ action: 'read', expires: SIGNED_URL_EXPIRY });

  const ref = await db.collection('photos').add({
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

  if (counter) {
    counter.done++;
    const label = original.length > 45 ? original.slice(0, 42) + '...' : original.padEnd(45);
    process.stdout.write(`\r  📷 ${String(counter.done).padStart(4)}/${counter.total}  ${label}`);
  }
  return { id: ref.id, url };
}

// ── Upload copertina galleria ─────────────────────────────────────────────────
async function uploadGalleryCover(filePath, galleryId) {
  const storagePath = `galleries/${galleryId}/cover/cover-${Date.now()}.jpg`;
  const contentType = mime(filePath);
  await bucket.upload(filePath, { destination: storagePath, metadata: { contentType } });
  const [url] = await bucket.file(storagePath).getSignedUrl({ action: 'read', expires: SIGNED_URL_EXPIRY });
  return url;
}

// ── Ricerca cliente per nome ──────────────────────────────────────────────────
async function searchCliente(query) {
  const snap = await db.collection('clienti').limit(200).get();
  const q = query.toLowerCase();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => {
      const full = `${c.nome || ''} ${c.cognome || ''} ${c.email || ''}`.toLowerCase();
      return full.includes(q);
    })
    .slice(0, 8);
}

// ── Wizard: seleziona cliente ─────────────────────────────────────────────────
async function selectCliente() {
  console.log('\n  Ricerca cliente (invio per saltare):');
  const q = await ask('  Nome / cognome / email: ');
  if (!q) return null;
  const results = await searchCliente(q);
  if (!results.length) { console.log('  Nessun cliente trovato.'); return null; }
  results.forEach((c, i) =>
    console.log(`  ${i + 1}. ${c.nome || ''} ${c.cognome || ''}${c.email ? '  <' + c.email + '>' : ''}`)
  );
  const n = parseInt(await ask('  Numero cliente (invio per saltare): '), 10);
  if (!n || n < 1 || n > results.length) return null;
  return results[n - 1];
}

// ── Wizard: seleziona job ─────────────────────────────────────────────────────
async function selectJob() {
  console.log('\n  Ricerca job (invio per saltare):');
  const snap = await db.collection('jobs').orderBy('createdAt', 'desc').limit(150).get();
  const list = snap.docs.map((d, i) => {
    const dt = d.data();
    return { n: i + 1, id: d.id, titolo: dt.title || dt.nome || d.id, data: dt.date || dt.eventDate || '' };
  });
  list.forEach(j =>
    console.log(`  ${String(j.n).padStart(3)}. ${j.titolo}${j.data ? '  (' + j.data + ')' : ''}`)
  );
  const n = parseInt(await ask('  Numero job (invio per saltare): '), 10);
  if (!n || n < 1 || n > list.length) return null;
  return list[n - 1];
}

// ── Wizard: opzioni selezione foto ────────────────────────────────────────────
async function askSelectionOptions() {
  const enableStr = await ask('\nAbilitare selezione foto per il cliente? (s/n, invio=no): ');
  if (!['s', 'si', 'sì'].includes(enableStr.toLowerCase())) {
    return { selectionEnabled: false };
  }

  const opts = { selectionEnabled: true, selectionMode: 'like', unlimitedSelection: false, requiredPhotoCount: 0, selectionDeadline: null };

  const modeStr = await ask('  Modalità: (1) Like ✅  (2) Dislike ❌  [invio=Like]: ');
  if (modeStr === '2') opts.selectionMode = 'dislike';

  const liberaStr = await ask('  Selezione libera senza limite? (s/n, invio=no): ');
  if (['s', 'si', 'sì'].includes(liberaStr.toLowerCase())) {
    opts.unlimitedSelection = true;
  } else {
    const countStr = await ask('  Numero foto da selezionare (invio=0 per illimitato): ');
    opts.requiredPhotoCount = parseInt(countStr, 10) || 0;
  }

  const deadlineStr = await ask('  Scadenza selezione (gg/mm/aaaa, invio per saltare): ');
  if (deadlineStr) {
    const parts = deadlineStr.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts.map(Number);
      const dt = new Date(y, m - 1, d, 23, 59, 59);
      if (!isNaN(dt.getTime())) opts.selectionDeadline = dt;
    }
  }

  return opts;
}

// ── Wizard: opzioni accesso ───────────────────────────────────────────────────
async function askAccessOptions() {
  console.log('\nAccesso galleria:');
  console.log('  1. Pubblica (senza protezione)');
  console.log('  2. Protetta da password');
  console.log('  3. Tema speciale + PIN (Natale, San Valentino, ecc.)');
  const choice = await ask('Scelta (1/2/3, invio=pubblica): ');

  if (choice === '2') {
    const password = await ask('  Password: ');
    return { mode: 'password', password: password.trim(), specialTheme: null, specialPin: null };
  }

  if (choice === '3') {
    console.log('\n  Temi disponibili:');
    THEMES.forEach((t, i) => console.log(`    ${i + 1}. ${t.label}`));
    const tn = parseInt(await ask('  Numero tema: '), 10);
    if (!tn || tn < 1 || tn > THEMES.length) {
      console.log('  Tema non valido, galleria pubblica.');
      return { mode: 'public', password: null, specialTheme: null, specialPin: null };
    }
    const theme = THEMES[tn - 1];

    // Verifica unicità PIN in Firestore
    let pin = '';
    let pinOk = false;
    while (!pinOk) {
      pin = await ask(`  PIN per ${theme.label} (min 4 caratteri alfanumerici): `);
      if (!pin || pin.length < 4 || !/^[a-zA-Z0-9]+$/.test(pin)) {
        console.log('  PIN non valido. Deve essere almeno 4 caratteri alfanumerici.');
        continue;
      }
      process.stdout.write('  Verifica unicità PIN...');
      const snap = await db.collection('gallerySecrets').where('specialPin', '==', pin).limit(1).get();
      if (!snap.empty) {
        const existing = await db.collection('galleries').doc(snap.docs[0].id).get();
        const existingName = existing.data()?.name || snap.docs[0].id;
        console.log(`\n  ⚠ PIN già usato dalla galleria "${existingName}". Scegli un PIN diverso.`);
      } else {
        console.log(' ✓');
        pinOk = true;
      }
    }
    return { mode: 'theme', password: null, specialTheme: theme.id, specialPin: pin };
  }

  return { mode: 'public', password: null, specialTheme: null, specialPin: null };
}

// ── Wizard: URL YouTube ───────────────────────────────────────────────────────
async function askYoutubeUrls() {
  const addStr = await ask('\nAggiungere video YouTube? (s/n, invio=no): ');
  if (!['s', 'si', 'sì'].includes(addStr.toLowerCase())) return [];
  const urls = [];
  while (true) {
    const url = await ask(`  URL video ${urls.length + 1} (invio per finire): `);
    if (!url) break;
    if (/youtu/i.test(url)) urls.push(url.trim());
    else console.log('  URL non riconosciuto come YouTube, saltato.');
  }
  return urls;
}

// ── Costruisce galleryData + secretsData ──────────────────────────────────────
function buildGalleryData(fields) {
  const {
    name, date, location, description, userId, code,
    access, selection, youtubeUrls, clienteId, clientEmail, clientName, jobId,
  } = fields;

  const galleryData = {
    name:            name.trim(),
    code,
    date:            date || '',
    location:        location.trim(),
    description:     description.trim(),
    hasPassword:     access.mode === 'password' && !!access.password,
    userId,
    photoCount:      0,
    active:          true,
    selectionEnabled: selection.selectionEnabled,
    chaptersEnabled:  false, // aggiornato dopo
    chapters:         [],
    createdAt:        admin.firestore.FieldValue.serverTimestamp(),
    updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
  };

  if (access.specialTheme) galleryData.specialTheme = access.specialTheme;
  if (clientEmail)         galleryData.clientEmail   = clientEmail;
  if (clientName)          galleryData.clientName    = clientName;
  if (clienteId)           galleryData.clienteId     = clienteId;
  if (jobId)               galleryData.jobId         = jobId;
  if (youtubeUrls.length)  galleryData.youtubeUrls   = youtubeUrls;

  if (selection.selectionEnabled) {
    if (selection.selectionMode === 'dislike') galleryData.selectionMode = 'dislike';
    galleryData.selectionStatus    = 'pending';
    galleryData.selectedPhotoIds   = [];
    if (selection.unlimitedSelection) {
      galleryData.unlimitedSelection  = true;
      galleryData.requiredPhotoCount  = 0;
    } else if (selection.requiredPhotoCount > 0) {
      galleryData.requiredPhotoCount  = selection.requiredPhotoCount;
    }
    if (selection.selectionDeadline) {
      galleryData.selectionDeadline         = admin.firestore.Timestamp.fromDate(selection.selectionDeadline);
      galleryData.selectionDeadlineEnforced = true;
    }
  }

  const secretsData = {
    password:   access.mode === 'password' ? (access.password || null) : null,
    specialPin: access.mode === 'theme'    ? (access.specialPin || null) : null,
    createdAt:  admin.firestore.FieldValue.serverTimestamp(),
    updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
  };

  return { galleryData, secretsData };
}

// ── Carica foto + copertine per ogni capitolo ─────────────────────────────────
async function uploadChapters(chapters, galleryId, fsChapters) {
  const chapterMap = Object.fromEntries(fsChapters.map(c => [c.titolo, c]));
  const total      = chapters.reduce((s, c) => s + c.photos.length + (c.cover ? 1 : 0), 0);
  const counter    = { done: 0, total };
  const errors     = [];
  const coverUpdates = []; // { chapterId, photoId, url }

  for (const ch of chapters) {
    const fsChapter = ch.name ? chapterMap[ch.name] : null;
    const chapterId = fsChapter?.id || null;

    // Carica copertina capitolo (se presente)
    if (ch.cover) {
      try {
        const { id, url } = await uploadPhoto(ch.cover, galleryId, chapterId, counter);
        if (chapterId) coverUpdates.push({ chapterId, photoId: id, url });
      } catch (e) {
        errors.push({ f: path.basename(ch.cover), err: e.message });
      }
    }

    // Carica foto normali
    const jobs = ch.photos.map(p => ({ path: p, chapterId }));
    await runPool(jobs, async job => {
      try { await uploadPhoto(job.path, galleryId, job.chapterId, counter); }
      catch (e) { errors.push({ f: path.basename(job.path), err: e.message }); }
    }, MAX_PARALLEL);
  }

  return { photoCount: counter.done - errors.length, errors, coverUpdates };
}

// ── Applica copertine capitoli al documento galleria ─────────────────────────
function applyChapterCovers(fsChapters, coverUpdates) {
  for (const upd of coverUpdates) {
    const ch = fsChapters.find(c => c.id === upd.chapterId);
    if (ch) {
      ch.coverPhotoId  = upd.photoId;
      ch.coverPhotoUrl = upd.url;
    }
  }
  return fsChapters;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NUOVA GALLERIA
// ═══════════════════════════════════════════════════════════════════════════════
async function createNewGallery() {
  console.log('\n─── NUOVA GALLERIA ──────────────────────────────────\n');

  const name = await ask('Nome galleria *: ');
  if (!name) { console.error('\nNome obbligatorio.'); process.exit(1); }

  const date     = await ask('Data evento (gg/mm/aaaa, invio per saltare): ');
  const location = await ask('Luogo (invio per saltare): ');
  const description = await ask('Descrizione (invio per saltare): ');

  // Associazione cliente
  let clienteId = '', clientEmail = '', clientName = '';
  const cliente = await selectCliente();
  if (cliente) {
    clienteId   = cliente.id;
    clientEmail = cliente.email || '';
    clientName  = `${cliente.nome || ''} ${cliente.cognome || ''}`.trim();
    console.log(`  ✓ Cliente: ${clientName}`);
  } else {
    clientEmail = await ask('  Email cliente per notifiche (invio per saltare): ');
    if (clientEmail) clientName = await ask('  Nome cliente: ');
  }

  // Associazione job
  let jobId = '';
  const useJob = await ask('\nAssociare a un Job? (s/n, invio=no): ');
  if (['s', 'si', 'sì'].includes(useJob.toLowerCase())) {
    const job = await selectJob();
    if (job) { jobId = job.id; console.log(`  ✓ Job: ${job.titolo}`); }
  }

  // Accesso
  const access = await askAccessOptions();

  // Selezione foto
  const selection = await askSelectionOptions();

  // YouTube
  const youtubeUrls = await askYoutubeUrls();

  // Cartella foto
  console.log('');
  const folderRaw = await ask('Percorso cartella foto *: ');
  const folder    = folderRaw.replace(/^["']|["']$/g, '');
  if (!fs.existsSync(folder)) { console.error('\nCartella non trovata: ' + folder); process.exit(1); }

  const chapters    = scanFolder(folder);
  const galleryCoverFile = chapters.find(c => c.name === null)?.cover
    || (fs.readdirSync(folder).find(f => isCover(f)) ? path.join(folder, fs.readdirSync(folder).find(f => isCover(f))) : null);

  if (!chapters.length && !galleryCoverFile) {
    console.error('\nNessuna immagine trovata nella cartella.'); process.exit(1);
  }

  const totalPhotos  = chapters.reduce((s, c) => s + c.photos.length, 0);
  const hasChapters  = chapters.some(c => c.name !== null);
  const namedChapters = chapters.filter(c => c.name);
  const coverCount   = chapters.filter(c => c.cover).length + (galleryCoverFile ? 1 : 0);

  console.log(`\nRiepilogo:`);
  console.log(`  📷 ${totalPhotos} foto`);
  if (hasChapters) console.log(`  📂 ${namedChapters.length} capitoli: ${namedChapters.map(c => c.name).join(', ')}`);
  if (coverCount)  console.log(`  🖼  ${coverCount} copertina/e rilevata/e`);
  if (access.mode === 'password')  console.log(`  🔒 Password: ${access.password}`);
  if (access.mode === 'theme')     console.log(`  🎨 Tema: ${access.specialTheme}  PIN: ${access.specialPin}`);
  if (selection.selectionEnabled)  console.log(`  ✅ Selezione foto abilitata`);
  if (youtubeUrls.length)          console.log(`  🎬 ${youtubeUrls.length} video YouTube`);

  const ok = await ask('\nProcedere? (s/n): ');
  if (ok.toLowerCase() !== 's') { console.log('Annullato.'); process.exit(0); }

  // Crea documento galleria
  const galleryId = db.collection('galleries').doc().id;
  const code      = nanoid(8);

  const fsChapters = namedChapters.map((c, i) => ({
    id: nanoid(10), titolo: c.name, descrizione: '',
    ordine: i, createdAt: new Date(), updatedAt: new Date(),
  }));

  const { galleryData, secretsData } = buildGalleryData({
    name, date, location, description,
    userId:      'script-upload',
    code,
    access, selection, youtubeUrls,
    clienteId, clientEmail, clientName, jobId,
  });
  galleryData.chapters        = fsChapters;
  galleryData.chaptersEnabled = hasChapters;

  // Salva galleria + secrets
  await db.collection('galleries').doc(galleryId).set(galleryData);
  await db.collection('gallerySecrets').doc(galleryId).set(secretsData);

  // Sync job
  if (jobId) {
    await db.collection('jobs').doc(jobId).update({
      galleryIds: admin.firestore.FieldValue.arrayUnion(galleryId),
    }).catch(() => {});
  }

  console.log(`\n✓ Galleria creata  (codice: ${code})`);

  // Carica copertina galleria (dalla radice)
  const rootCoverFile = chapters.find(c => c.name === null)?.cover || null;
  if (rootCoverFile) {
    process.stdout.write('  📸 Upload copertina galleria...');
    try {
      const coverUrl = await uploadGalleryCover(rootCoverFile, galleryId);
      await db.collection('galleries').doc(galleryId).update({
        coverImageUrl:     coverUrl,
        coverImageMobile:  coverUrl,
        coverImageDesktop: coverUrl,
      });
      console.log(' ✓');
    } catch (e) {
      console.log(' ⚠ Errore copertina: ' + e.message);
    }
  }

  // Upload foto
  const totalCount = chapters.reduce((s, c) => s + c.photos.length + (c.cover ? 1 : 0), 0);
  if (totalCount === 0) {
    console.log('\nNessuna foto da caricare (solo copertina galleria).');
  } else {
    console.log(`\nAvvio upload di ${totalCount} foto...\n`);
    const { photoCount, errors, coverUpdates } = await uploadChapters(chapters, galleryId, fsChapters);

    // Applica copertine capitoli
    if (coverUpdates.length) {
      const updatedChapters = applyChapterCovers(fsChapters, coverUpdates);
      await db.collection('galleries').doc(galleryId).update({ chapters: updatedChapters });
    }

    await db.collection('galleries').doc(galleryId).update({
      photoCount: photoCount,
      updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`\n\n✅ Upload completato: ${photoCount}/${totalCount} foto caricate`);
    if (errors.length) {
      console.log('⚠  Errori:');
      errors.forEach(e => console.log(`   - ${e.f}: ${e.err}`));
    }
  }

  console.log(`\n🔗 Link galleria: ${GALLERY_URL}/${code}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGGIUNGI FOTO A GALLERIA ESISTENTE
// ═══════════════════════════════════════════════════════════════════════════════
async function addToExisting() {
  console.log('\n─── AGGIUNGI FOTO A GALLERIA ESISTENTE ──────────────\n');
  console.log('Caricamento gallerie...');

  const snap = await db.collection('galleries').orderBy('createdAt', 'desc').limit(200).get();
  const list = snap.docs.map((d, i) => {
    const dt = d.data();
    return { n: i + 1, id: d.id, name: dt.name, code: dt.code || '', date: dt.date || '', count: dt.photoCount || 0 };
  });

  console.log('');
  list.forEach(g => {
    const label = `${g.name}${g.date ? '  (' + g.date + ')' : ''}`;
    console.log(`  ${String(g.n).padStart(3)}.  ${label.padEnd(52)}  [${g.count} foto]`);
  });

  const numStr  = await ask('\nNumero galleria: ');
  const num     = parseInt(numStr, 10);
  if (!num || num < 1 || num > list.length) { console.error('Numero non valido.'); process.exit(1); }
  const gallery = list[num - 1];

  const folderRaw = await ask('Percorso cartella foto *: ');
  const folder    = folderRaw.replace(/^["']|["']$/g, '');
  if (!fs.existsSync(folder)) { console.error('\nCartella non trovata: ' + folder); process.exit(1); }

  const chapters  = scanFolder(folder);
  if (!chapters.length) { console.error('\nNessuna immagine trovata.'); process.exit(1); }

  const total      = chapters.reduce((s, c) => s + c.photos.length + (c.cover ? 1 : 0), 0);
  const coverCount = chapters.filter(c => c.cover).length;
  console.log(`\nGalleria: "${gallery.name}"`);
  console.log(`Foto da aggiungere: ${total}${coverCount ? ' + ' + coverCount + ' copertina/e capitoli' : ''}`);
  const ok = await ask('Procedere? (s/n): ');
  if (ok.toLowerCase() !== 's') { console.log('Annullato.'); process.exit(0); }

  // Aggiorna copertina galleria (radice)
  const rootCoverFile = chapters.find(c => c.name === null)?.cover || null;
  if (rootCoverFile) {
    process.stdout.write('\n  📸 Aggiornamento copertina galleria...');
    try {
      const coverUrl = await uploadGalleryCover(rootCoverFile, gallery.id);
      await db.collection('galleries').doc(gallery.id).update({
        coverImageUrl:     coverUrl,
        coverImageMobile:  coverUrl,
        coverImageDesktop: coverUrl,
      });
      console.log(' ✓');
    } catch (e) { console.log(' ⚠ ' + e.message); }
  }

  // Gestione capitoli esistenti + nuovi
  const galleryDocData   = (await db.collection('galleries').doc(gallery.id).get()).data();
  const existingChapters = galleryDocData.chapters || [];
  const chapterMap       = Object.fromEntries(existingChapters.map(c => [c.titolo, c]));
  const newChapters      = [];

  for (const ch of chapters.filter(c => c.name)) {
    if (!chapterMap[ch.name]) {
      const newCh = {
        id: nanoid(10), titolo: ch.name, descrizione: '',
        ordine: existingChapters.length + newChapters.length,
        createdAt: new Date(), updatedAt: new Date(),
      };
      chapterMap[ch.name] = newCh;
      newChapters.push(newCh);
    }
  }

  const allChapters = [...existingChapters, ...newChapters];
  if (newChapters.length) {
    await db.collection('galleries').doc(gallery.id).update({
      chapters: allChapters, chaptersEnabled: true,
    });
    console.log(`✓ Aggiunti ${newChapters.length} nuovi capitoli`);
  }

  console.log(`\nAvvio upload di ${total} file...\n`);
  const { photoCount, errors, coverUpdates } = await uploadChapters(chapters, gallery.id, allChapters);

  if (coverUpdates.length) {
    const updatedChapters = applyChapterCovers(allChapters, coverUpdates);
    await db.collection('galleries').doc(gallery.id).update({ chapters: updatedChapters });
  }

  await db.collection('galleries').doc(gallery.id).update({
    photoCount: admin.firestore.FieldValue.increment(photoCount),
    updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`\n\n✅ Upload completato: ${photoCount}/${total} foto aggiunte a "${gallery.name}"`);
  if (errors.length) {
    console.log('⚠  Errori:');
    errors.forEach(e => console.log(`   - ${e.f}: ${e.err}`));
  }
  console.log(`\n🔗 Link galleria: ${GALLERY_URL}/${gallery.code}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   Image Studio — Uploader Gallerie  v3           ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
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
