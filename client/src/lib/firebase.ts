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

// TEMPORANEO: In sviluppo usa la produzione per testare i questionari
// Gli emulatori richiederebbero configurazione separata
if (import.meta.env.DEV) {
  console.log('🚀 Modalità sviluppo: collegato direttamente alla produzione Firebase');
  console.log('📋 Questionari e token validation funzioneranno correttamente');
}

// Configurazione emulatori (commentata per ora)
/*
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
  try {
    if (!('_delegate' in db)) {
      connectFirestoreEmulator(db, 'localhost', 8080);
      console.log('🔥 Connected to Firestore emulator');
    }
    if (!('_delegate' in auth)) {
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      console.log('🔐 Connected to Auth emulator');
    }
    if (!('_delegate' in storage)) {
      connectStorageEmulator(storage, 'localhost', 9199);
      console.log('📦 Connected to Storage emulator');
    }
    if (!('_delegate' in functions)) {
      connectFunctionsEmulator(functions, 'localhost', 5001);
      console.log('⚡ Connected to Functions emulator');
    }
  } catch (error) {
    console.warn('⚠️ Firebase emulators not running, using production:', error);
  }
}
*/


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