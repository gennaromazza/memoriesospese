import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { VITE_FIREBASE_CONFIG } from '@/config';

// Inizializza Firebase
const app = initializeApp(VITE_FIREBASE_CONFIG);

// Esporta i servizi Firebase
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

export default app;