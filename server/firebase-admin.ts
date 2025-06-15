import admin from 'firebase-admin';

// Inizializza Firebase Admin se non è già stato fatto
if (!admin.apps.length) {
  // Per deployment in produzione, userai le credenziali dal file di servizio
  // Per sviluppo, usiamo la configurazione tramite variabili d'ambiente
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
  });
}

export const db = admin.firestore();
export const auth = admin.auth();
export default admin;