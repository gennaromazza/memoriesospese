/**
 * Script di migrazione per trasferire password e specialPin da `galleries` a `gallerySecrets`
 * 
 * SICUREZZA: Rimuove campi sensibili dalla collection pubblica `galleries`
 * e li sposta nella collection protetta `gallerySecrets` (admin-only access)
 * 
 * Esegui con: npx tsx scripts/migrate-gallery-passwords.ts
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Inizializza Firebase Admin
const app = initializeApp();
const db = getFirestore(app);

async function migrateGalleryPasswords() {
  console.log('🔄 Inizio migrazione password gallerie...\n');
  
  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  try {
    // Recupera tutte le gallerie
    const galleriesSnapshot = await db.collection('galleries').get();
    console.log(`📊 Trovate ${galleriesSnapshot.size} gallerie da controllare\n`);

    for (const galleryDoc of galleriesSnapshot.docs) {
      const galleryId = galleryDoc.id;
      const galleryData = galleryDoc.data();
      
      // Verifica se ha password o specialPin nel documento pubblico
      const hasPasswordField = galleryData.password !== undefined;
      const hasSpecialPinField = galleryData.specialPin !== undefined;

      if (!hasPasswordField && !hasSpecialPinField) {
        console.log(`⏭️  Galleria ${galleryId}: nessun campo sensibile da migrare`);
        skippedCount++;
        continue;
      }

      try {
        console.log(`\n🔐 Migrazione galleria: ${galleryId} (${galleryData.name})`);
        
        // Prepara i dati per gallerySecrets
        const secretsData: any = {
          updatedAt: new Date()
        };

        if (hasPasswordField) {
          secretsData.password = galleryData.password || null;
          console.log(`  ✅ Password: ${galleryData.password ? 'presente' : 'vuota'}`);
        }

        if (hasSpecialPinField) {
          secretsData.specialPin = galleryData.specialPin || null;
          console.log(`  ✅ Special PIN: ${galleryData.specialPin ? 'presente' : 'vuoto'}`);
        }

        // Scrivi in gallerySecrets (collection protetta admin-only)
        await db.collection('gallerySecrets').doc(galleryId).set(secretsData, { merge: true });
        console.log(`  💾 Salvato in gallerySecrets/${galleryId}`);

        // Prepara aggiornamento documento pubblico
        const publicUpdate: any = {
          hasPassword: !!galleryData.password,
          updatedAt: new Date()
        };

        // Rimuovi i campi sensibili dal documento pubblico
        const fieldsToDelete: any = {};
        if (hasPasswordField) {
          fieldsToDelete.password = FieldValue.delete();
        }
        if (hasSpecialPinField) {
          fieldsToDelete.specialPin = FieldValue.delete();
        }

        // Aggiorna documento pubblico (rimuove password/PIN e aggiunge hasPassword flag)
        await db.collection('galleries').doc(galleryId).update({
          ...publicUpdate,
          ...fieldsToDelete
        });

        console.log(`  🗑️  Campi sensibili rimossi da galleries/${galleryId}`);
        console.log(`  ✅ Migrazione completata`);
        
        migratedCount++;
      } catch (error) {
        console.error(`  ❌ Errore migrazione galleria ${galleryId}:`, error);
        errorCount++;
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RIEPILOGO MIGRAZIONE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Migrate con successo: ${migratedCount}`);
    console.log(`⏭️  Saltate (no campi sensibili): ${skippedCount}`);
    console.log(`❌ Errori: ${errorCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Errore generale durante la migrazione:', error);
    process.exit(1);
  }
}

// Esegui migrazione
migrateGalleryPasswords()
  .then(() => {
    console.log('✅ Migrazione completata con successo');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Errore fatale:', error);
    process.exit(1);
  });
