import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getAnalytics } from "firebase/analytics";

// Firebase configuration from environment variables with fallbacks
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyA4mw3dKOvcDBxgIJOo-r-4yUmyv0knxME",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "wedding-gallery-397b6.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "wedding-gallery-397b6",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "wedding-gallery-397b6.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1072998290999",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1072998290999:web:8e0d19440d86d15f4f11b2",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-SD38R3LJE6"
};

// Log warning only in development when using fallback values
if (!import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.DEV) {
  console.warn('Using fallback Firebase configuration. Set environment variables for production.');
}

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Get Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Auto-rilevamento emulatori in sviluppo
if (import.meta.env.DEV) {
  let usingEmulators = false;
  
  try {
    // Verifica se gli emulatori sono disponibili
    const checkEmulator = async (host: string, port: number): Promise<boolean> => {
      try {
        const response = await fetch(`http://${host}:${port}`, { method: 'HEAD', mode: 'no-cors' });
        return true;
      } catch {
        return false;
      }
    };
    
    // Tenta connessione agli emulatori solo se disponibili
    Promise.all([
      checkEmulator('localhost', 8080), // Firestore
      checkEmulator('localhost', 9099), // Auth  
      checkEmulator('localhost', 9199), // Storage
      checkEmulator('localhost', 5001)  // Functions
    ]).then(([firestoreOk, authOk, storageOk, functionsOk]) => {
      
      if (firestoreOk || authOk || storageOk || functionsOk) {
        console.log('🔍 Emulatori Firebase rilevati, connessione in corso...');
        
        try {
          // Connetti solo agli emulatori disponibili
          if (firestoreOk && !('_delegate' in db)) {
            connectFirestoreEmulator(db, 'localhost', 8080);
            console.log('🔥 Firestore: connesso all\'emulatore');
            usingEmulators = true;
          }
          
          if (authOk && !('_delegate' in auth)) {
            connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
            console.log('🔐 Auth: connesso all\'emulatore');
            usingEmulators = true;
          }
          
          if (storageOk && !('_delegate' in storage)) {
            connectStorageEmulator(storage, 'localhost', 9199);
            console.log('📦 Storage: connesso all\'emulatore');
            usingEmulators = true;
          }
          
          if (functionsOk && !('_delegate' in functions)) {
            connectFunctionsEmulator(functions, 'localhost', 5001);
            console.log('⚡ Functions: connesso all\'emulatore');
            usingEmulators = true;
          }
          
        } catch (error) {
          console.warn('⚠️ Errore connessione emulatori, fallback a produzione:', error);
        }
      }
      
      if (!usingEmulators) {
        console.log('🚀 Modalità sviluppo: nessun emulatore rilevato, uso produzione');
        console.log('📋 Questionari e token validation: produzione Firebase');
      }
    });
    
  } catch (error) {
    console.log('🚀 Modalità sviluppo: connesso alla produzione Firebase');
    console.log('📋 Questionari e token validation funzioneranno correttamente');
  }
}


// Initialize Analytics in browser environment only
let analytics: any = null;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}
export { analytics };

// Type definitions for Firebase
export type FirebaseTimestamp = any;

export default app;

/**
 * Risolve la data dell'evento con priorità: couple.eventDate > gallery.eventDate
 */
export function resolveEventDate(couple?: any, gallery?: any): Date | null {
  // Priorità a couple.eventDate
  if (couple?.eventDate) {
    if (couple.eventDate.toDate && typeof couple.eventDate.toDate === 'function') {
      return couple.eventDate.toDate();
    }
    if (couple.eventDate instanceof Date) {
      return couple.eventDate;
    }
    if (typeof couple.eventDate === 'string') {
      const parsed = new Date(couple.eventDate);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }

  // Fallback a gallery.eventDate
  if (gallery?.eventDate) {
    if (gallery.eventDate.toDate && typeof gallery.eventDate.toDate === 'function') {
      return gallery.eventDate.toDate();
    }
    if (gallery.eventDate instanceof Date) {
      return gallery.eventDate;
    }
    if (typeof gallery.eventDate === 'string') {
      const parsed = new Date(gallery.eventDate);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }

  return null;
}