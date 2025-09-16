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
export const functions = getFunctions(app);

// ======================
// Auto-rilevamento emulatori solo in sviluppo (FIX ERR_CONNECTION_REFUSED)
// ======================
if (import.meta.env.DEV) {
  const connectIfAvailable = async (
    service: string,
    port: number,
    connectFn: () => void,
  ) => {
    try {
      // Timeout rapido per evitare warning e blocchi
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        if (!controller.signal.aborted) {
          controller.abort();
        }
      }, 200);

      const response = await fetch(`http://localhost:${port}`, {
        method: "HEAD",
        signal: controller.signal,
      });

      clearTimeout(timeout);
      
      // Verifica che la risposta sia valida
      if (response.ok || response.status === 404) {
        connectFn();
        console.log(`✅ ${service}: connesso all'emulatore (${port})`);
        return true;
      }
      
      return false;
    } catch (error) {
      // Ignora specificamente gli AbortError da timeout
      if (error instanceof Error && error.name === 'AbortError') {
        return false;
      }
      // Ignora altri errori di connessione (ECONNREFUSED, etc.)
      return false;
    }
  };

  Promise.all([
    connectIfAvailable("Firestore", 8080, () =>
      connectFirestoreEmulator(db, "localhost", 8080),
    ),
    connectIfAvailable("Auth", 9099, () =>
      connectAuthEmulator(auth, "http://localhost:9099", {
        disableWarnings: true,
      }),
    ),
    connectIfAvailable("Storage", 9199, () =>
      connectStorageEmulator(storage, "localhost", 9199),
    ),
    connectIfAvailable("Functions", 5001, () =>
      connectFunctionsEmulator(functions, "localhost", 5001),
    ),
  ]).then((results) => {
    const usingEmulators = results.some(Boolean);
    if (!usingEmulators) {
      console.log(
        "🚀 Modalità sviluppo: nessun emulatore rilevato, uso produzione",
      );
      console.log("📋 Questionari e token validation: produzione Firebase");
    }
  });
} else {
  console.log("🚀 Produzione: connessione diretta ai servizi Firebase");
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
 * Risolve la data dell'evento con priorità: couple.eventDate > gallery.eventDate
 */
export function resolveEventDate(couple?: any, gallery?: any): Date | null {
  // Priorità a couple.eventDate
  if (couple?.eventDate) {
    if (
      couple.eventDate.toDate &&
      typeof couple.eventDate.toDate === "function"
    ) {
      return couple.eventDate.toDate();
    }
    if (couple.eventDate instanceof Date) {
      return couple.eventDate;
    }
    if (typeof couple.eventDate === "string") {
      const parsed = new Date(couple.eventDate);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }

  // Fallback a gallery.eventDate
  if (gallery?.eventDate) {
    if (
      gallery.eventDate.toDate &&
      typeof gallery.eventDate.toDate === "function"
    ) {
      return gallery.eventDate.toDate();
    }
    if (gallery.eventDate instanceof Date) {
      return gallery.eventDate;
    }
    if (typeof gallery.eventDate === "string") {
      const parsed = new Date(gallery.eventDate);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }

  return null;
}
