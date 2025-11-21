/**
 * Migration Routes - Migrazione dati legacy
 * Endpoint per migrare foto da sottocollezioni legacy a collezione principale
 */

import express from 'express';
import { db } from './firebase-admin.js';
import { getAuth } from 'firebase-admin/auth';

const router = express.Router();

// Lista admin autorizzati
const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

/**
 * POST /api/migrations/legacy-photos
 * Migra tutte le foto dalle sottocollezioni galleries/{id}/photos alla collezione photos
 * Solo admin autorizzati
 */
router.post('/legacy-photos', async (req, res) => {
  try {
    // Verifica autenticazione
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token mancante' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    
    // Verifica email verificata (sicurezza extra)
    if (!decodedToken.email_verified) {
      return res.status(403).json({ error: 'Email non verificata' });
    }
    
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
router.get('/legacy-photos/preview', async (req, res) => {
  try {
    // Verifica autenticazione
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token mancante' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    
    // Verifica email verificata (sicurezza extra)
    if (!decodedToken.email_verified) {
      return res.status(403).json({ error: 'Email non verificata' });
    }
    
    if (!ADMIN_EMAILS.includes(decodedToken.email || '')) {
      return res.status(403).json({ error: 'Non autorizzato - solo admin' });
    }

    const preview = {
      galleriesWithLegacyPhotos: 0,
      totalLegacyPhotos: 0,
      potentialDuplicates: 0,
      galleries: [] as any[]
    };

    // Scansiona tutte le gallerie
    const galleriesSnapshot = await db.collection('galleries').get();
    
    for (const galleryDoc of galleriesSnapshot.docs) {
      const galleryId = galleryDoc.id;
      const galleryData = galleryDoc.data();
      
      const legacyPhotosRef = db.collection('galleries').doc(galleryId).collection('photos');
      const legacyPhotosSnapshot = await legacyPhotosRef.get();
      
      if (legacyPhotosSnapshot.empty) continue;

      preview.galleriesWithLegacyPhotos++;
      preview.totalLegacyPhotos += legacyPhotosSnapshot.docs.length;

      // Conta duplicati potenziali
      let duplicatesInGallery = 0;
      for (const photoDoc of legacyPhotosSnapshot.docs) {
        const photoData = photoDoc.data();
        const photoName = photoData.name || photoDoc.id;

        const existingQuery = await db.collection('photos')
          .where('galleryId', '==', galleryId)
          .where('name', '==', photoName)
          .limit(1)
          .get();

        if (!existingQuery.empty) {
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

    res.json(preview);

  } catch (error) {
    console.error('❌ [Migration Preview] Errore:', error);
    res.status(500).json({ 
      error: 'Errore durante la preview',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
