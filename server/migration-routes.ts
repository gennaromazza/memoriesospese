/**
 * Migration Routes - Migrazione dati legacy
 * Endpoint per migrare foto da sottocollezioni legacy a collezione principale
 */

import express from 'express';
import { db, Timestamp } from './firebase-admin.js';
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

export default router;
