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

// Log warning if using fallback values
if (!import.meta.env.VITE_FIREBASE_API_KEY) {
  console.warn('Using fallback Firebase configuration. Set environment variables for production.');
}

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Get Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Development emulators (commented out for production deployment)
// Uncomment for local development with Firebase emulators
/*
if (import.meta.env.DEV && typeof window !== 'undefined') {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
    connectFunctionsEmulator(functions, 'localhost', 5001);
  } catch (error) {
    console.log('Firebase emulators already connected or not available');
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
