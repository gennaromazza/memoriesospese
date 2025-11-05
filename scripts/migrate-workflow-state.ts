/**
 * Script di migrazione: Assegna statoWorkflow iniziale a bookings e orders esistenti
 * 
 * Logica:
 * - Se dataShootingInizio è nel futuro → "shooting_da_svolgere"
 * - Se dataShootingInizio è nel passato e NON c'è galleria collegata → "shooting_svolto"
 * - Se dataShootingInizio è nel passato e c'è galleria collegata → "pronto_consegna"
 * - Se non c'è dataShootingInizio ma c'è galleria → "pronto_consegna"
 * - Altrimenti → "shooting_da_svolgere" (default)
 * 
 * IMPORTANTE: Questo script richiede Firebase Admin SDK
 * Eseguire con: npx tsx scripts/migrate-workflow-state.ts
 */

import * as admin from 'firebase-admin';
import { WorkflowState } from '../shared/booking-types';

// Inizializza Firebase Admin (se non già inizializzato)
if (!admin.apps?.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

interface MigrationStats {
  bookingsProcessed: number;
  bookingsUpdated: number;
  ordersProcessed: number;
  ordersUpdated: number;
  errors: string[];
}

/**
 * Determina lo stato workflow in base ai dati
 */
function determineWorkflowState(
  dataShootingInizio: admin.firestore.Timestamp | undefined,
  hasGallery: boolean
): WorkflowState {
  const now = new Date();

  // Se c'è una data shooting
  if (dataShootingInizio) {
    const shootingDate = dataShootingInizio.toDate();

    // Shooting nel futuro
    if (shootingDate > now) {
      return 'shooting_da_svolgere';
    }

    // Shooting passato con galleria → lavoro completato
    if (hasGallery) {
      return 'pronto_consegna';
    }

    // Shooting passato senza galleria → shooting fatto ma da lavorare
    return 'shooting_svolto';
  }

  // Nessuna data shooting ma c'è galleria → completato
  if (hasGallery) {
    return 'pronto_consegna';
  }

  // Default: da svolgere
  return 'shooting_da_svolgere';
}

/**
 * Migra bookings
 */
async function migrateBookings(stats: MigrationStats): Promise<void> {
  console.log('📋 Migrazione bookings...');

  const bookingsSnap = await db.collection('bookings').get();
  
  for (const doc of bookingsSnap.docs) {
    stats.bookingsProcessed++;
    const data = doc.data();

    // Skip se statoWorkflow già presente
    if (data.statoWorkflow) {
      console.log(`  ⏭️  Booking ${doc.id} ha già statoWorkflow: ${data.statoWorkflow}`);
      continue;
    }

    try {
      // Cerca gallerie collegate (via bookingId)
      const galleriesSnap = await db.collection('galleries')
        .where('bookingId', '==', doc.id)
        .limit(1)
        .get();

      const hasGallery = !galleriesSnap.empty;

      // Determina stato
      const statoWorkflow = determineWorkflowState(
        data.dataShootingInizio,
        hasGallery
      );

      // Aggiorna documento
      await doc.ref.update({
        statoWorkflow,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      stats.bookingsUpdated++;
      console.log(`  ✅ Booking ${doc.id} → ${statoWorkflow}${hasGallery ? ' (con galleria)' : ''}`);

    } catch (error: any) {
      const errorMsg = `Booking ${doc.id}: ${error.message}`;
      stats.errors.push(errorMsg);
      console.error(`  ❌ ${errorMsg}`);
    }
  }
}

/**
 * Migra orders
 */
async function migrateOrders(stats: MigrationStats): Promise<void> {
  console.log('\n📦 Migrazione orders...');

  const ordersSnap = await db.collection('orders').get();
  
  for (const doc of ordersSnap.docs) {
    stats.ordersProcessed++;
    const data = doc.data();

    // Skip se statoWorkflow già presente
    if (data.statoWorkflow) {
      console.log(`  ⏭️  Order ${doc.id} ha già statoWorkflow: ${data.statoWorkflow}`);
      continue;
    }

    try {
      // Cerca gallerie collegate (via orderId)
      const galleriesSnap = await db.collection('galleries')
        .where('orderId', '==', doc.id)
        .limit(1)
        .get();

      let hasGallery = !galleriesSnap.empty;
      let dataShootingInizio = data.dataServizio;

      // Se l'order ha bookingId, recupera data shooting dal booking
      if (data.bookingId) {
        const bookingSnap = await db.collection('bookings').doc(data.bookingId).get();
        if (bookingSnap.exists) {
          const bookingData = bookingSnap.data();
          dataShootingInizio = bookingData?.dataShootingInizio || dataShootingInizio;
        }
      }

      // Determina stato
      const statoWorkflow = determineWorkflowState(
        dataShootingInizio,
        hasGallery
      );

      // Aggiorna documento
      await doc.ref.update({
        statoWorkflow,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      stats.ordersUpdated++;
      console.log(`  ✅ Order ${doc.id} → ${statoWorkflow}${hasGallery ? ' (con galleria)' : ''}`);

    } catch (error: any) {
      const errorMsg = `Order ${doc.id}: ${error.message}`;
      stats.errors.push(errorMsg);
      console.error(`  ❌ ${errorMsg}`);
    }
  }
}

/**
 * Main migration
 */
async function runMigration(): Promise<void> {
  console.log('🚀 Avvio migrazione workflow state...\n');

  const stats: MigrationStats = {
    bookingsProcessed: 0,
    bookingsUpdated: 0,
    ordersProcessed: 0,
    ordersUpdated: 0,
    errors: [],
  };

  try {
    await migrateBookings(stats);
    await migrateOrders(stats);

    // Report finale
    console.log('\n' + '='.repeat(60));
    console.log('📊 REPORT MIGRAZIONE');
    console.log('='.repeat(60));
    console.log(`Bookings processati: ${stats.bookingsProcessed}`);
    console.log(`Bookings aggiornati: ${stats.bookingsUpdated}`);
    console.log(`Orders processati: ${stats.ordersProcessed}`);
    console.log(`Orders aggiornati: ${stats.ordersUpdated}`);
    console.log(`Errori: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\n⚠️  ERRORI RISCONTRATI:');
      stats.errors.forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err}`);
      });
    }

    console.log('='.repeat(60));
    console.log('✅ Migrazione completata!');

  } catch (error: any) {
    console.error('❌ Errore critico durante migrazione:', error);
    process.exit(1);
  }
}

// Esegui migrazione
runMigration()
  .then(() => {
    console.log('\n👋 Script terminato con successo');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script terminato con errore:', error);
    process.exit(1);
  });
