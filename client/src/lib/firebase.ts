import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getAnalytics } from "firebase/analytics";

// Firebase configuration from environment variables with fallbacks
const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    "AIzaSyA4mw3dKOvcDBxgIJOo-r-4yUmyv0knxME",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    "wedding-gallery-397b6.firebaseapp.com",
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID || "wedding-gallery-397b6",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    "wedding-gallery-397b6.firebasestorage.app",
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1072998290999",
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    "1:1072998290999:web:8e0d19440d86d15f4f11b2",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-SD38R3LJE6",
};

// Log warning only in development when using fallback values
if (!import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.DEV) {
  console.warn(
    "Using fallback Firebase configuration. Set environment variables for production.",
  );
}

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Get Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Functions SEMPRE con regione us-central1 per compatibilità callable
export const functions = getFunctions(app, 'us-central1');

// ======================
// Firebase Services - Produzione di default; emulatore Firestore SOLO se
// esplicitamente richiesto via VITE_FIRESTORE_EMULATOR_HOST (test e2e in dev).
// La variabile è opt-in e non è mai impostata in produzione.
// ======================
const firestoreEmulatorHost = import.meta.env.DEV
  ? (import.meta.env.VITE_FIRESTORE_EMULATOR_HOST as string | undefined)
  : undefined;
if (firestoreEmulatorHost) {
  const [host, port] = firestoreEmulatorHost.split(":");
  connectFirestoreEmulator(db, host, parseInt(port, 10));
  console.warn(`🧪 Firebase: Firestore EMULATORE su ${firestoreEmulatorHost}`);
} else {
  console.log("🚀 Firebase: connessione diretta ai servizi produzione");
  console.log("📋 Questionari e token validation: produzione Firebase");
}

// Initialize Analytics in browser environment only
let analytics: any = null;
if (typeof window !== "undefined") {
  analytics = getAnalytics(app);
}
export { analytics };

// Type definitions for Firebase
export type FirebaseTimestamp = any;

export default app;

/**
 * Converte un Firestore Timestamp in Date nativa JavaScript
 * Gestisce: Timestamp Firebase, oggetti {seconds, nanoseconds}, oggetti {_seconds, _nanoseconds}, Date, string ISO
 */
export function convertFirestoreTimestamp(timestamp: any): Date | null {
  if (!timestamp) return null;

  // Firestore Timestamp con metodo toDate()
  if (timestamp.toDate && typeof timestamp.toDate === "function") {
    return timestamp.toDate();
  }

  // Oggetto {seconds, nanoseconds} (da Firestore SDK)
  if (timestamp.seconds !== undefined) {
    return new Date(timestamp.seconds * 1000);
  }

  // Oggetto {_seconds, _nanoseconds} (da serializzazione HTTP/JSON)
  if (timestamp._seconds !== undefined) {
    return new Date(timestamp._seconds * 1000);
  }

  // Già una Date
  if (timestamp instanceof Date) {
    return timestamp;
  }

  // String ISO
  if (typeof timestamp === "string") {
    const parsed = new Date(timestamp);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

/**
 * Risolve la data dell'evento con priorità: couple.eventDate > gallery.eventDate
 */
export function resolveEventDate(couple?: any, gallery?: any): Date | null {
  // Priorità a couple.eventDate
  if (couple?.eventDate) {
    const date = convertFirestoreTimestamp(couple.eventDate);
    if (date) return date;
  }

  // Fallback a gallery.eventDate
  if (gallery?.eventDate) {
    const date = convertFirestoreTimestamp(gallery.eventDate);
    if (date) return date;
  }

  return null;
}
