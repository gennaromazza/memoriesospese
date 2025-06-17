import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin SDK
function initializeFirebaseAdmin() {
  // Check if Firebase Admin is already initialized
  if (getApps().length === 0) {
    try {
      // For development, we'll use a service account key if available
      // In production, this should use environment variables or service account
      
      // Try to initialize with default credentials (works in Firebase hosting)
      const app = initializeApp({
        // Use default project configuration
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'your-project-id'
      });
      
      console.log('✓ Firebase Admin SDK initialized successfully');
      return app;
    } catch (error) {
      console.error('❌ Failed to initialize Firebase Admin SDK:', error);
      // For development without proper credentials, we'll create a mock
      return null;
    }
  }
  
  return getApps()[0];
}

// Initialize on module load
const adminApp = initializeFirebaseAdmin();

export { getAuth, adminApp };
export default adminApp;