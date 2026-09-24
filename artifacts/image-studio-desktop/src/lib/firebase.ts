import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';

// Standard Firebase config relying on env variables, or safe fallbacks if not provided
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyA4mw3dKOvcDBxgIJOo-r-4yUmyv0knxME",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "wedding-gallery-397b6.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "wedding-gallery-397b6",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "wedding-gallery-397b6.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1072998290999",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1072998290999:web:8e0d19440d86d15f4f11b2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

export { app, auth };
