/**
 * Firebase Admin SDK - Helper Centralizzato
 * 
 * Usa il pattern MODULARE raccomandato per Firebase Admin v13+
 * Pattern: import { initializeApp, cert } from 'firebase-admin/app'
 * 
 * RISOLVE: Errore "Cannot read properties of undefined (reading 'cert')"
 * causato dall'import namespace legacy che non funziona con tsx runtime
 */

import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

/**
 * Inizializza Firebase Admin SDK (singleton)
 * Valida credenziali prima di chiamare cert()
 */
function initializeFirebaseAdmin(): App {
  // Verifica se già inizializzato (singleton pattern)
  const existingApps = getApps();
  if (existingApps.length > 0) {
    console.log('✅ Firebase Admin già inizializzato');
    return existingApps[0];
  }

  console.log('🔧 Inizializzazione Firebase Admin SDK...');

  // Leggi credenziali da environment variable
  const serviceAccountBase64 = process.env.FIREBASE_ADMIN_CREDENTIALS;
  
  if (!serviceAccountBase64) {
    const errorMsg = '❌ FIREBASE_ADMIN_CREDENTIALS environment variable non configurato';
    console.error(errorMsg);
    throw new Error('FIREBASE_ADMIN_CREDENTIALS non configurato');
  }

  try {
    // Decodifica e parsa JSON
    const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf-8');
    const serviceAccount = JSON.parse(serviceAccountJson);

    // 🔒 VALIDAZIONE ROBUSTA: Verifica campi obbligatori PRIMA di usare cert()
    if (!serviceAccount?.client_email || !serviceAccount?.private_key || !serviceAccount?.project_id) {
      console.error('❌ Firebase Admin service account malformato:', {
        hasClientEmail: !!serviceAccount?.client_email,
        hasPrivateKey: !!serviceAccount?.private_key,
        hasProjectId: !!serviceAccount?.project_id
      });
      throw new Error('FIREBASE_ADMIN_CREDENTIALS non valido: mancano client_email, private_key o project_id');
    }

    console.log('✅ Service account validato per progetto:', serviceAccount.project_id);
    
    // Inizializza con pattern modulare
    const app = initializeApp({
      credential: cert(serviceAccount)
    });
    
    console.log('✅ Firebase Admin SDK inizializzato correttamente');
    return app;
    
  } catch (error: any) {
    console.error('❌ Errore inizializzazione Firebase Admin:', error.message);
    throw new Error(`Errore inizializzazione Firebase Admin: ${error.message}`);
  }
}

// Inizializza al primo import
const app = initializeFirebaseAdmin();

// Esporta Firestore database pronto all'uso
export const db: Firestore = getFirestore(app);

// Esporta FieldValue e Timestamp per operazioni speciali (serverTimestamp, delete, etc.)
export { FieldValue, Timestamp };

// Esporta anche l'app se necessario
export { app };
