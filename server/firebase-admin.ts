/**
 * Firebase Admin SDK Configuration
 * Usato dal server Express per accesso autenticato a Firestore
 */

import * as admin from 'firebase-admin';

let firebaseApp: admin.app.App | null = null;

/**
 * Inizializza Firebase Admin SDK
 * Usa Application Default Credentials in produzione
 * o credenziali esplicite se configurate
 */
export function initializeFirebaseAdmin(): admin.app.App {
  if (firebaseApp) {
    return firebaseApp;
  }

  try {
    // Inizializza con Project ID (le credenziali vengono gestite automaticamente)
    firebaseApp = admin.initializeApp({
      projectId: 'wedding-gallery-397b6',
    });

    console.log('✅ Firebase Admin SDK initialized');
    return firebaseApp;
  } catch (error) {
    console.error('❌ Firebase Admin SDK initialization failed:', error);
    throw error;
  }
}

/**
 * Ottiene istanza Firestore autenticata
 */
export function getFirestore(): admin.firestore.Firestore {
  if (!firebaseApp) {
    initializeFirebaseAdmin();
  }
  return admin.firestore();
}

/**
 * Ottiene istanza Auth
 */
export function getAuth(): admin.auth.Auth {
  if (!firebaseApp) {
    initializeFirebaseAdmin();
  }
  return admin.auth();
}
