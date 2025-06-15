import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { getAnalytics } from "firebase/analytics";

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyA4mw3dKOvcDBxgIJOo-r-4yUmyv0knxME",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "wedding-gallery-397b6.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "wedding-gallery-397b6",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "wedding-gallery-397b6.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1072998290999",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1072998290999:web:8e0d19440d86d15f4f11b2",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-SD38R3LJE6"
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Get Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Initialize Analytics in browser environment only
let analytics: any = null;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}
export { analytics };

export default app;
