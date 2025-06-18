import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  User,
  onAuthStateChanged,
  UserCredential
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'guest';
  createdAt: any;
  lastLoginAt: any;
  galleryAccess: string[]; // Array of gallery IDs the user has access to
}

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  displayName: string;
  role?: 'admin' | 'guest';
}

export interface LoginData {
  email: string;
  password: string;
}

class AuthService {
  private currentUser: User | null = null;
  private authStateCallbacks: ((user: User | null) => void)[] = [];

  constructor() {
    // Listen to auth state changes
    onAuthStateChanged(auth, (user) => {
      this.currentUser = user;
      this.authStateCallbacks.forEach(callback => callback(user));
    });
  }

  // Register new user
  async register(data: RegisterData): Promise<AuthResult> {
    try {
      const { email, password, displayName, role = 'guest' } = data;
      
      // Create user with email and password
      const userCredential: UserCredential = await createUserWithEmailAndPassword(
        auth, 
        email, 
        password
      );
      
      const user = userCredential.user;
      
      // Update user profile
      await updateProfile(user, {
        displayName: displayName
      });
      
      // Create user document in Firestore
      const userProfile: UserProfile = {
        uid: user.uid,
        email: user.email!,
        displayName: displayName,
        role: role,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        galleryAccess: []
      };
      
      await setDoc(doc(db, 'users', user.uid), userProfile);
      
      return {
        success: true,
        user: user
      };
    } catch (error: any) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: this.getErrorMessage(error)
      };
    }
  }

  // Login user
  async login(data: LoginData): Promise<AuthResult> {
    try {
      const { email, password } = data;
      
      const userCredential: UserCredential = await signInWithEmailAndPassword(
        auth, 
        email, 
        password
      );
      
      const user = userCredential.user;
      
      // Update last login time
      await setDoc(doc(db, 'users', user.uid), {
        lastLoginAt: serverTimestamp()
      }, { merge: true });
      
      return {
        success: true,
        user: user
      };
    } catch (error: any) {
      console.error('Login error:', error);
      return {
        success: false,
        error: this.getErrorMessage(error)
      };
    }
  }

  // Logout user
  async logout(): Promise<AuthResult> {
    try {
      await signOut(auth);
      return {
        success: true
      };
    } catch (error: any) {
      console.error('Logout error:', error);
      return {
        success: false,
        error: this.getErrorMessage(error)
      };
    }
  }

  // Send password reset email
  async resetPassword(email: string): Promise<AuthResult> {
    try {
      await sendPasswordResetEmail(auth, email);
      return {
        success: true
      };
    } catch (error: any) {
      console.error('Password reset error:', error);
      return {
        success: false,
        error: this.getErrorMessage(error)
      };
    }
  }

  // Get current user
  getCurrentUser(): User | null {
    return this.currentUser;
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  // Get user profile from Firestore
  async getUserProfile(uid?: string): Promise<UserProfile | null> {
    try {
      const userId = uid || this.currentUser?.uid;
      if (!userId) return null;
      
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        return userDoc.data() as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  }

  // Grant gallery access to user
  async grantGalleryAccess(galleryId: string, userId?: string): Promise<boolean> {
    try {
      const uid = userId || this.currentUser?.uid;
      if (!uid) return false;
      
      const userProfile = await this.getUserProfile(uid);
      if (!userProfile) return false;
      
      const galleryAccess = userProfile.galleryAccess || [];
      if (!galleryAccess.includes(galleryId)) {
        galleryAccess.push(galleryId);
        
        await setDoc(doc(db, 'users', uid), {
          galleryAccess: galleryAccess
        }, { merge: true });
      }
      
      return true;
    } catch (error) {
      console.error('Error granting gallery access:', error);
      return false;
    }
  }

  // Check if user has access to gallery
  async hasGalleryAccess(galleryId: string, userId?: string): Promise<boolean> {
    try {
      const uid = userId || this.currentUser?.uid;
      if (!uid) return false;
      
      const userProfile = await this.getUserProfile(uid);
      if (!userProfile) return false;
      
      return userProfile.galleryAccess?.includes(galleryId) || false;
    } catch (error) {
      console.error('Error checking gallery access:', error);
      return false;
    }
  }

  // Subscribe to auth state changes
  onAuthStateChange(callback: (user: User | null) => void): () => void {
    this.authStateCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.authStateCallbacks.indexOf(callback);
      if (index > -1) {
        this.authStateCallbacks.splice(index, 1);
      }
    };
  }

  // Helper to format error messages
  private getErrorMessage(error: any): string {
    switch (error.code) {
      case 'auth/email-already-in-use':
        return 'Questa email è già registrata. Prova ad accedere.';
      case 'auth/weak-password':
        return 'La password deve essere di almeno 6 caratteri.';
      case 'auth/invalid-email':
        return 'Indirizzo email non valido.';
      case 'auth/user-not-found':
        return 'Nessun account trovato con questa email.';
      case 'auth/wrong-password':
        return 'Password errata.';
      case 'auth/too-many-requests':
        return 'Troppi tentativi. Riprova più tardi.';
      case 'auth/network-request-failed':
        return 'Errore di connessione. Controlla la tua connessione internet.';
      default:
        return error.message || 'Si è verificato un errore imprevisto.';
    }
  }
}

// Export singleton instance
export const authService = new AuthService();
export default authService;