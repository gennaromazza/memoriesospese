/**
 * Migration Routes - Migrazione dati legacy
 * Endpoint per migrare foto da sottocollezioni legacy a collezione principale
 */

import express from 'express';
import { db, Timestamp, storage } from './firebase-admin.js';
import { parseStoragePath } from './thumbnails.js';
import {
  ensureDownloadToken,
  buildDownloadUrl,
  isSignedUrl,
} from './storage-download-url.js';
import { getAuth } from 'firebase-admin/auth';
import { authenticateFirebase } from './email-routes.js';

const router = express.Router();

// Lista admin autorizzati
const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

/**
 * Timestamp di fallback per foto importate senza alcuna data affidabile.
 * Valore fisso e deterministico (1 gen 2020) così re-eseguire il backfill
 * produce sempre lo stesso risultato (idempotenza).
 */
const LEGACY_FALLBACK_MS = Date.UTC(2020, 0, 1, 0, 0, 0);

/**
 * Converte un valore data Firestore eterogeneo (Timestamp admin SDK,
 * Date, oppure oggetto serializzato {seconds/_seconds}) in millisecondi.
 * Ritorna null se il valore non è una data interpretabile.
 */
function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  return null;
}

/**
 * Deriva un `createdAt` affidabile per una foto priva di tale campo.
 * Priorità: updatedAt → migratedAt → createdAt galleria → eventDate galleria
 * → fallback fisso. L'offset per-foto (indice) evita collisioni esatte e
 * mantiene un ordine deterministico all'interno della galleria.
 */
function deriveCreatedAt(photoData: any, galleryData: any, indexOffset: number): Timestamp {
  const baseMs =
    toMillis(photoData?.updatedAt) ??
    toMillis(photoData?.migratedAt) ??
    toMillis(galleryData?.createdAt) ??
    toMillis(galleryData?.eventDate) ??
    LEGACY_FALLBACK_MS;
  return Timestamp.fromMillis(baseMs + indexOffset);
}

/**
 * POST /api/migrations/legacy-photos
 * Migra tutte le foto dalle sottocollezioni galleries/{id}/photos alla collezione photos
 * Solo admin autorizzati
 */
router.post('/legacy-photos', authenticateFirebase, async (req: any, res) => {
  try {
    // Verifica autenticazione
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token mancante' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    
    if (!ADMIN_EMAILS.includes(decodedToken.email || '')) {
      return res.status(403).json({ error: 'Non autorizzato - solo admin' });
    }

    console.log('🚀 [Migration] Inizio migrazione foto legacy...');
    
    const stats = {
      galleriesScanned: 0,
      photosFound: 0,
      photosMigrated: 0,
      photosDuplicate: 0,
      errors: [] as string[]
    };

    // 1. Recupera tutte le gallerie
    const galleriesSnapshot = await db.collection('galleries').get();
    stats.galleriesScanned = galleriesSnapshot.docs.length;
    
    console.log(`📊 [Migration] Trovate ${stats.galleriesScanned} gallerie`);

    // 2. Per ogni galleria, controlla se ha sottocollezione photos
    for (const galleryDoc of galleriesSnapshot.docs) {
      const galleryId = galleryDoc.id;
      
      try {
        // Recupera foto dalla sottocollezione legacy
        const legacyPhotosRef = db.collection('galleries').doc(galleryId).collection('photos');
        const legacyPhotosSnapshot = await legacyPhotosRef.get();
        
        if (legacyPhotosSnapshot.empty) {
          continue; // Nessuna foto legacy in questa galleria
        }

        console.log(`📸 [Migration] Galleria ${galleryId}: ${legacyPhotosSnapshot.docs.length} foto legacy`);
        stats.photosFound += legacyPhotosSnapshot.docs.length;

        // 3. Per ogni foto legacy, verifica duplicati e migra
        for (const photoDoc of legacyPhotosSnapshot.docs) {
          const photoData = photoDoc.data();
          const photoName = photoData.name || photoDoc.id;

          // Verifica se esiste già nella collezione principale (duplicato)
          const existingQuery = await db.collection('photos')
            .where('galleryId', '==', galleryId)
            .where('name', '==', photoName)
            .limit(1)
            .get();

          if (!existingQuery.empty) {
            stats.photosDuplicate++;
            console.log(`⏭️  [Migration] Skip duplicato: ${photoName} (galleria ${galleryId})`);
            continue;
          }

          // Migra foto nella collezione principale
          const newPhotoData = {
            galleryId: galleryId,
            name: photoName,
            url: photoData.url || '',
            thumbnailUrl: photoData.thumbnailUrl || null,
            contentType: photoData.contentType || 'image/jpeg',
            size: photoData.size || 0,
            uploaderUid: photoData.uploaderUid || '',
            uploaderEmail: photoData.uploaderEmail || 'legacy@system',
            uploaderName: photoData.uploaderName || 'Legacy System',
            uploadedBy: 'legacy', // Marca come legacy
            likeCount: photoData.likeCount || 0,
            commentCount: photoData.commentCount || 0,
            position: photoData.position || null,
            chapterId: photoData.chapterId || null,
            chapterPosition: photoData.chapterPosition || null,
            createdAt: photoData.createdAt || new Date(),
            updatedAt: photoData.updatedAt || null
          };

          await db.collection('photos').add(newPhotoData);
          stats.photosMigrated++;
          
          if (stats.photosMigrated % 10 === 0) {
            console.log(`✅ [Migration] Migrate ${stats.photosMigrated} foto...`);
          }
        }
        
      } catch (error) {
        const errorMsg = `Errore galleria ${galleryId}: ${error}`;
        console.error(`❌ [Migration] ${errorMsg}`);
        stats.errors.push(errorMsg);
      }
    }

    console.log('🎉 [Migration] Migrazione completata!');
    console.log(`📊 Statistiche finali:`, stats);

    res.json({
      success: true,
      message: 'Migrazione completata',
      stats: stats
    });

  } catch (error) {
    console.error('❌ [Migration] Errore migrazione:', error);
    res.status(500).json({ 
      error: 'Errore durante la migrazione',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/migrations/legacy-photos/preview
 * Anteprima della migrazione senza eseguirla (dry-run)
 */
router.get('/legacy-photos/preview', authenticateFirebase, async (req: any, res) => {
  try {
    // Verifica autenticazione
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token mancante' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    
    if (!ADMIN_EMAILS.includes(decodedToken.email || '')) {
      return res.status(403).json({ error: 'Non autorizzato - solo admin' });
    }

    console.log('📋 [Migration Preview] Scansione gallerie in corso...');

    const preview = {
      galleriesWithLegacyPhotos: 0,
      totalLegacyPhotos: 0,
      potentialDuplicates: 0,
      galleries: [] as any[]
    };

    // Scansiona tutte le gallerie
    const galleriesSnapshot = await db.collection('galleries').get();
    console.log(`📊 [Migration Preview] Trovate ${galleriesSnapshot.docs.length} gallerie totali`);
    
    // Pre-carica tutte le foto esistenti nella collezione principale (ottimizzazione)
    const existingPhotosSnapshot = await db.collection('photos').select('galleryId', 'name').get();
    const existingPhotosMap = new Map<string, Set<string>>();
    
    existingPhotosSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.galleryId && data.name) {
        if (!existingPhotosMap.has(data.galleryId)) {
          existingPhotosMap.set(data.galleryId, new Set());
        }
        existingPhotosMap.get(data.galleryId)!.add(data.name);
      }
    });
    
    console.log(`📸 [Migration Preview] Pre-caricate foto da ${existingPhotosMap.size} gallerie`);
    
    for (const galleryDoc of galleriesSnapshot.docs) {
      const galleryId = galleryDoc.id;
      const galleryData = galleryDoc.data();
      
      const legacyPhotosRef = db.collection('galleries').doc(galleryId).collection('photos');
      const legacyPhotosSnapshot = await legacyPhotosRef.get();
      
      if (legacyPhotosSnapshot.empty) continue;

      preview.galleriesWithLegacyPhotos++;
      preview.totalLegacyPhotos += legacyPhotosSnapshot.docs.length;

      // Conta duplicati usando la mappa pre-caricata (molto più veloce)
      let duplicatesInGallery = 0;
      const existingInGallery = existingPhotosMap.get(galleryId) || new Set();
      
      for (const photoDoc of legacyPhotosSnapshot.docs) {
        const photoData = photoDoc.data();
        const photoName = photoData.name || photoDoc.id;

        if (existingInGallery.has(photoName)) {
          duplicatesInGallery++;
          preview.potentialDuplicates++;
        }
      }

      preview.galleries.push({
        id: galleryId,
        nome: galleryData.nome || 'Senza nome',
        legacyPhotosCount: legacyPhotosSnapshot.docs.length,
        duplicates: duplicatesInGallery
      });
    }

    console.log(`✅ [Migration Preview] Completata: ${preview.totalLegacyPhotos} foto legacy in ${preview.galleriesWithLegacyPhotos} gallerie`);
    res.json(preview);

  } catch (error) {
    console.error('❌ [Migration Preview] Errore:', error);
    res.status(500).json({ 
      error: 'Errore durante la preview',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/migrations/backfill-photo-dates/preview
 * Conta quante foto (collezione moderna + sottocollezioni legacy) sono prive
 * di `createdAt`. Queste foto vengono scartate dalle query paginate
 * `orderBy('createdAt')` e quindi "perse" dalla galleria pubblica (dry-run).
 */
router.get('/backfill-photo-dates/preview', authenticateFirebase, async (req: any, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token mancante' });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    if (!ADMIN_EMAILS.includes(decodedToken.email || '')) {
      return res.status(403).json({ error: 'Non autorizzato - solo admin' });
    }

    console.log('📋 [Backfill Preview] Analisi foto senza createdAt...');

    // Collezione moderna 'photos'
    const modernSnapshot = await db.collection('photos').select('galleryId', 'createdAt').get();
    let modernMissing = 0;
    const galleriesAffected = new Set<string>();
    modernSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (!data.createdAt) {
        modernMissing++;
        if (data.galleryId) galleriesAffected.add(data.galleryId);
      }
    });

    // Sottocollezioni legacy galleries/{id}/photos
    const galleriesSnapshot = await db.collection('galleries').get();
    let legacyMissing = 0;
    for (const galleryDoc of galleriesSnapshot.docs) {
      const legacySnapshot = await galleryDoc.ref.collection('photos').select('createdAt').get();
      if (legacySnapshot.empty) continue;
      legacySnapshot.docs.forEach(doc => {
        if (!doc.data().createdAt) {
          legacyMissing++;
          galleriesAffected.add(galleryDoc.id);
        }
      });
    }

    const preview = {
      modernPhotosTotal: modernSnapshot.docs.length,
      modernPhotosMissingDate: modernMissing,
      legacyPhotosMissingDate: legacyMissing,
      totalMissingDate: modernMissing + legacyMissing,
      galleriesAffected: galleriesAffected.size,
    };

    console.log('✅ [Backfill Preview] Risultato:', preview);
    res.json(preview);
  } catch (error) {
    console.error('❌ [Backfill Preview] Errore:', error);
    res.status(500).json({
      error: 'Errore durante la preview del backfill',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/migrations/backfill-photo-dates
 * Backfill idempotente del campo `createdAt` per tutte le foto che ne sono
 * prive, in ENTRAMBE le collezioni (moderna `photos` e sottocollezioni legacy
 * `galleries/{id}/photos`). La data viene derivata da un campo affidabile
 * (updatedAt/migratedAt) o dalla data della galleria, con fallback fisso.
 * Dopo il backfill la paginazione ordinata include nativamente queste foto e
 * la riconciliazione lato client diventa superflua. Solo admin autorizzati.
 */
router.post('/backfill-photo-dates', authenticateFirebase, async (req: any, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token mancante' });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    if (!ADMIN_EMAILS.includes(decodedToken.email || '')) {
      return res.status(403).json({ error: 'Non autorizzato - solo admin' });
    }

    console.log('🚀 [Backfill] Inizio backfill createdAt foto...');

    const stats = {
      modernUpdated: 0,
      legacyUpdated: 0,
      galleriesProcessed: 0,
      errors: [] as string[],
    };

    // Pre-carica le gallerie (per derivare la data dalle info galleria)
    const galleriesSnapshot = await db.collection('galleries').get();
    const galleryDataMap = new Map<string, any>();
    galleriesSnapshot.docs.forEach(doc => galleryDataMap.set(doc.id, doc.data()));

    const BATCH_LIMIT = 400;

    // 1. Collezione moderna 'photos' — raggruppa per galleria per offset deterministico
    const modernSnapshot = await db.collection('photos').get();
    const missingByGallery = new Map<string, Array<{ ref: FirebaseFirestore.DocumentReference; data: any }>>();
    modernSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.createdAt) return; // già presente → idempotente, salta
      const key = data.galleryId || '__no_gallery__';
      if (!missingByGallery.has(key)) missingByGallery.set(key, []);
      missingByGallery.get(key)!.push({ ref: doc.ref, data });
    });

    let batch = db.batch();
    let opsInBatch = 0;
    const commitIfNeeded = async (force = false) => {
      if (opsInBatch >= BATCH_LIMIT || (force && opsInBatch > 0)) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
    };

    for (const [galleryId, photos] of missingByGallery) {
      const galleryData = galleryDataMap.get(galleryId);
      // Ordine deterministico: position poi nome
      photos.sort((a, b) => {
        const pa = typeof a.data.position === 'number' ? a.data.position : Number.MAX_SAFE_INTEGER;
        const pb = typeof b.data.position === 'number' ? b.data.position : Number.MAX_SAFE_INTEGER;
        if (pa !== pb) return pa - pb;
        return String(a.data.name || '').localeCompare(String(b.data.name || ''));
      });
      for (let i = 0; i < photos.length; i++) {
        const createdAt = deriveCreatedAt(photos[i].data, galleryData, i);
        batch.update(photos[i].ref, { createdAt });
        stats.modernUpdated++;
        opsInBatch++;
        await commitIfNeeded();
      }
    }
    await commitIfNeeded(true);

    // 2. Sottocollezioni legacy galleries/{id}/photos
    for (const galleryDoc of galleriesSnapshot.docs) {
      try {
        const legacySnapshot = await galleryDoc.ref.collection('photos').get();
        if (legacySnapshot.empty) continue;

        const missing = legacySnapshot.docs.filter(d => !d.data().createdAt);
        if (missing.length === 0) continue;

        stats.galleriesProcessed++;
        const galleryData = galleryDataMap.get(galleryDoc.id);

        missing.sort((a, b) => {
          const pa = typeof a.data().position === 'number' ? a.data().position : Number.MAX_SAFE_INTEGER;
          const pb = typeof b.data().position === 'number' ? b.data().position : Number.MAX_SAFE_INTEGER;
          if (pa !== pb) return pa - pb;
          return String(a.data().name || '').localeCompare(String(b.data().name || ''));
        });

        let legacyBatch = db.batch();
        let legacyOps = 0;
        for (let i = 0; i < missing.length; i++) {
          const createdAt = deriveCreatedAt(missing[i].data(), galleryData, i);
          legacyBatch.update(missing[i].ref, { createdAt });
          stats.legacyUpdated++;
          legacyOps++;
          if (legacyOps >= BATCH_LIMIT) {
            await legacyBatch.commit();
            legacyBatch = db.batch();
            legacyOps = 0;
          }
        }
        if (legacyOps > 0) await legacyBatch.commit();
      } catch (error) {
        const errorMsg = `Errore galleria ${galleryDoc.id}: ${error}`;
        console.error(`❌ [Backfill] ${errorMsg}`);
        stats.errors.push(errorMsg);
      }
    }

    console.log('🎉 [Backfill] Completato!', stats);
    res.json({
      success: true,
      message: 'Backfill createdAt completato',
      stats,
    });
  } catch (error) {
    console.error('❌ [Backfill] Errore:', error);
    res.status(500).json({
      error: 'Errore durante il backfill',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Analizza le gallerie e classifica quali possono ereditare il jobType dal
 * lavoro collegato. Logica condivisa tra preview (dry-run) e backfill.
 */
async function analyzeGalleryJobTypes() {
  // Pre-carica i jobType di tutti i lavori
  const jobsSnapshot = await db.collection('jobs').select('jobType').get();
  const jobTypeMap = new Map<string, string | null>();
  jobsSnapshot.docs.forEach(doc => {
    const jt = doc.data().jobType;
    jobTypeMap.set(doc.id, typeof jt === 'string' && jt.trim() !== '' ? jt : null);
  });

  const galleriesSnapshot = await db.collection('galleries').select('jobId', 'jobType', 'name').get();

  const toUpdate: Array<{ ref: FirebaseFirestore.DocumentReference; nome: string; jobType: string }> = [];
  const stats = {
    galleriesTotal: galleriesSnapshot.docs.length,
    alreadyCategorized: 0,
    withoutJobId: 0,
    jobMissing: 0,
    jobWithoutType: 0,
    toUpdate: 0,
  };

  for (const doc of galleriesSnapshot.docs) {
    const data = doc.data();
    const hasJobType = typeof data.jobType === 'string' && data.jobType.trim() !== '';
    if (hasJobType) {
      stats.alreadyCategorized++;
      continue;
    }
    const jobId = typeof data.jobId === 'string' && data.jobId.trim() !== '' ? data.jobId : null;
    if (!jobId) {
      stats.withoutJobId++;
      continue;
    }
    if (!jobTypeMap.has(jobId)) {
      stats.jobMissing++;
      continue;
    }
    const jobType = jobTypeMap.get(jobId);
    if (!jobType) {
      stats.jobWithoutType++;
      continue;
    }
    toUpdate.push({ ref: doc.ref, nome: data.name || 'Senza nome', jobType });
  }

  stats.toUpdate = toUpdate.length;
  return { stats, toUpdate };
}

/**
 * GET /api/migrations/backfill-gallery-jobtypes/preview
 * Dry-run: conta quante gallerie con `jobId` ma senza `jobType` possono
 * ereditare la categoria dal lavoro collegato. Solo admin autorizzati.
 */
router.get('/backfill-gallery-jobtypes/preview', authenticateFirebase, async (req: any, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token mancante' });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    if (!ADMIN_EMAILS.includes(decodedToken.email || '')) {
      return res.status(403).json({ error: 'Non autorizzato - solo admin' });
    }

    console.log('📋 [Gallery JobType Preview] Analisi gallerie senza categoria...');
    const { stats, toUpdate } = await analyzeGalleryJobTypes();

    console.log('✅ [Gallery JobType Preview] Risultato:', stats);
    res.json({
      ...stats,
      galleries: toUpdate.map(g => ({ id: g.ref.id, nome: g.nome, jobType: g.jobType })),
    });
  } catch (error) {
    console.error('❌ [Gallery JobType Preview] Errore:', error);
    res.status(500).json({
      error: 'Errore durante la preview',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/migrations/backfill-gallery-jobtypes
 * Backfill idempotente: per ogni galleria con `jobId` e senza `jobType`,
 * copia il `jobType` (slug) del lavoro collegato. Non tocca le gallerie già
 * categorizzate né quelle il cui lavoro manca o non ha tipo. Solo admin.
 */
router.post('/backfill-gallery-jobtypes', authenticateFirebase, async (req: any, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token mancante' });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    if (!ADMIN_EMAILS.includes(decodedToken.email || '')) {
      return res.status(403).json({ error: 'Non autorizzato - solo admin' });
    }

    console.log('🚀 [Gallery JobType Backfill] Inizio backfill categoria gallerie...');
    const { stats, toUpdate } = await analyzeGalleryJobTypes();

    const BATCH_LIMIT = 400;
    let batch = db.batch();
    let opsInBatch = 0;
    let updated = 0;

    for (const item of toUpdate) {
      batch.update(item.ref, { jobType: item.jobType, updatedAt: Timestamp.now() });
      updated++;
      opsInBatch++;
      if (opsInBatch >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
    }
    if (opsInBatch > 0) await batch.commit();

    const result = {
      galleriesTotal: stats.galleriesTotal,
      updated,
      skippedAlreadyCategorized: stats.alreadyCategorized,
      skippedWithoutJobId: stats.withoutJobId,
      skippedJobMissing: stats.jobMissing,
      skippedJobWithoutType: stats.jobWithoutType,
    };

    console.log('🎉 [Gallery JobType Backfill] Completato!', result);
    res.json({
      success: true,
      message: 'Backfill categoria gallerie completato',
      stats: result,
    });
  } catch (error) {
    console.error('❌ [Gallery JobType Backfill] Errore:', error);
    res.status(500).json({
      error: 'Errore durante il backfill',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * ========================================
 * BACKFILL SIGNED URL → DOWNLOAD TOKEN
 * ========================================
 * I signed URL (query GoogleAccessId/Signature) creati con la chiave del
 * service account revocata ad agosto 2026 sono/diventeranno 403. Questi
 * endpoint riscrivono gli URL residui nel formato stabile
 * firebasestorage.googleapis.com/?alt=media&token=..., impostando (o
 * riusando) il token firebaseStorageDownloadTokens nei metadata dell'oggetto.
 *
 * Campi coperti:
 *  - consultationTemplates.imageUrls[]
 *  - jobs.pdfs[].url (PDF legacy dei job importati)
 */

interface SignedUrlScanItem {
  collection: 'consultationTemplates' | 'jobs';
  docId: string;
  field: string;
  url: string;
}

/** Scandisce Firestore e ritorna tutti gli URL firmati ancora presenti. */
async function scanSignedUrls(): Promise<SignedUrlScanItem[]> {
  const items: SignedUrlScanItem[] = [];

  const templatesSnap = await db.collection('consultationTemplates').get();
  for (const doc of templatesSnap.docs) {
    const imageUrls: unknown = doc.data().imageUrls;
    if (!Array.isArray(imageUrls)) continue;
    imageUrls.forEach((url, i) => {
      if (isSignedUrl(url)) {
        items.push({
          collection: 'consultationTemplates',
          docId: doc.id,
          field: `imageUrls[${i}]`,
          url,
        });
      }
    });
  }

  const jobsSnap = await db.collection('jobs').get();
  for (const doc of jobsSnap.docs) {
    const pdfs: unknown = doc.data().pdfs;
    if (!Array.isArray(pdfs)) continue;
    pdfs.forEach((pdf: any, i: number) => {
      if (pdf && isSignedUrl(pdf.url)) {
        items.push({
          collection: 'jobs',
          docId: doc.id,
          field: `pdfs[${i}].url`,
          url: pdf.url,
        });
      }
    });
  }

  return items;
}

/**
 * GET /api/migrations/signed-urls/preview
 * Dry-run: elenca i documenti che contengono ancora signed URL.
 * Serve anche come query di verifica post-backfill (remaining deve essere 0).
 */
router.get('/signed-urls/preview', authenticateFirebase, async (req: any, res) => {
  try {
    if (!ADMIN_EMAILS.includes(req.user?.email || '')) {
      return res.status(403).json({ error: 'Non autorizzato - solo admin' });
    }

    const items = await scanSignedUrls();
    res.json({
      success: true,
      remaining: items.length,
      items: items.map(({ collection, docId, field }) => ({ collection, docId, field })),
    });
  } catch (error) {
    console.error('❌ [Signed URL Backfill] Errore preview:', error);
    res.status(500).json({
      error: 'Errore durante la preview del backfill signed URL',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/migrations/signed-urls
 * Backfill: per ogni signed URL residuo imposta un token
 * firebaseStorageDownloadTokens sull'oggetto Storage e riscrive l'URL nel
 * documento Firestore. Idempotente: ri-eseguirlo non modifica URL già stabili.
 */
router.post('/signed-urls', authenticateFirebase, async (req: any, res) => {
  try {
    if (!ADMIN_EMAILS.includes(req.user?.email || '')) {
      return res.status(403).json({ error: 'Non autorizzato - solo admin' });
    }

    console.log('🚀 [Signed URL Backfill] Inizio scansione...');
    const items = await scanSignedUrls();
    const bucket = storage.bucket();

    const stats = { found: items.length, fixed: 0, missingObject: 0, unparsable: 0, errors: 0 };
    const failures: Array<{ collection: string; docId: string; field: string; reason: string }> = [];

    // Cache token per storagePath: lo stesso oggetto può comparire più volte
    const tokenCache = new Map<string, string | null>();

    // Raggruppa per documento così ogni doc viene aggiornato una sola volta
    const byDoc = new Map<string, SignedUrlScanItem[]>();
    for (const item of items) {
      const key = `${item.collection}/${item.docId}`;
      if (!byDoc.has(key)) byDoc.set(key, []);
      byDoc.get(key)!.push(item);
    }

    for (const [key, docItems] of Array.from(byDoc.entries())) {
      const { collection, docId } = docItems[0];
      // Mappa vecchio URL -> nuovo URL per questo documento
      const replacements = new Map<string, string>();

      for (const item of docItems) {
        const storagePath = parseStoragePath(item.url);
        if (!storagePath) {
          stats.unparsable++;
          failures.push({ collection, docId, field: item.field, reason: 'URL non interpretabile' });
          continue;
        }
        try {
          let token: string | null;
          if (tokenCache.has(storagePath)) {
            token = tokenCache.get(storagePath)!;
          } else {
            token = await ensureDownloadToken(bucket, storagePath);
            tokenCache.set(storagePath, token);
          }
          if (!token) {
            stats.missingObject++;
            failures.push({ collection, docId, field: item.field, reason: `Oggetto Storage inesistente: ${storagePath}` });
            continue;
          }
          replacements.set(item.url, buildDownloadUrl(bucket.name, storagePath, token));
        } catch (err: any) {
          stats.errors++;
          failures.push({ collection, docId, field: item.field, reason: err?.message || 'Errore Storage' });
        }
      }

      if (replacements.size === 0) continue;

      try {
        const docRef = db.collection(collection).doc(docId);
        // Ri-leggi il documento per applicare le sostituzioni sullo stato attuale
        const snap = await docRef.get();
        if (!snap.exists) continue;
        const data: any = snap.data();

        if (collection === 'consultationTemplates') {
          const imageUrls = (data.imageUrls as string[]).map(
            (u) => replacements.get(u) ?? u
          );
          await docRef.update({ imageUrls, updatedAt: Timestamp.now() });
        } else {
          const pdfs = (data.pdfs as any[]).map((pdf) =>
            pdf && replacements.has(pdf.url) ? { ...pdf, url: replacements.get(pdf.url) } : pdf
          );
          await docRef.update({ pdfs, updatedAt: Timestamp.now() });
        }
        stats.fixed += replacements.size;
      } catch (err: any) {
        stats.errors++;
        failures.push({ collection, docId, field: '*', reason: `Update Firestore fallito: ${err?.message}` });
      }
    }

    console.log('🎉 [Signed URL Backfill] Completato!', stats);
    res.json({ success: stats.errors === 0, stats, failures });
  } catch (error) {
    console.error('❌ [Signed URL Backfill] Errore:', error);
    res.status(500).json({
      error: 'Errore durante il backfill signed URL',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
