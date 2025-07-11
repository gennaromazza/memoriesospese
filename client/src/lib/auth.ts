/**
 * Firebase Authentication Service
 * Gestisce autenticazione utenti, profili e controllo accessi admin
 */

import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  User
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  serverTimestamp, 
  collection, 
  query, 
  where, 
  getDocs,
  arrayUnion 
} from 'firebase/firestore';
import { auth, db } from './firebase';

// Lista admin (migrata da server/middleware/auth.ts)
const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  profileImageUrl?: string;
  role: 'admin' | 'user';
  galleries: string[];
  createdAt: any;
  lastLoginAt: any;
  updatedAt?: any;
}

export class AuthService {
  /**
   * Login utente esistente
   */
  static async loginUser(email: string, password: string): Promise<User> {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await this.updateLastLogin(credential.user);
    return credential.user;
  }

  /**
   * Registrazione nuovo utente
   */
  static async registerUser(email: string, password: string, displayName: string, galleryId?: string): Promise<User> {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName });
    
    // Crea profilo utente in Firestore
    await this.createUserProfile(credential.user, displayName, galleryId);
    return credential.user;
  }

  /**
   * Crea profilo utente in Firestore
   */
  static async createUserProfile(user: User, displayName: string, galleryId?: string): Promise<void> {
    const userRef = doc(db, 'users', user.uid);
    const userData: Omit<UserProfile, 'uid'> = {
      email: user.email!,
      displayName,
      role: ADMIN_EMAILS.includes(user.email!) ? 'admin' : 'user',
      galleries: galleryId ? [galleryId] : [],
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    };

    await setDoc(userRef, userData);
  }

  /**
   * Aggiorna ultimo login
   */
  static async updateLastLogin(user: User, galleryId?: string): Promise<void> {
    try {
      const userRef = doc(db, 'users', user.uid);
      const updateData: any = { 
        lastLoginAt: serverTimestamp() 
      };

      // Se fornito galleryId, aggiungilo alla lista gallerie
      if (galleryId) {
        updateData.galleries = arrayUnion(galleryId);
      }

      await updateDoc(userRef, updateData);
    } catch (error) {
      console.warn('Errore aggiornamento ultimo login:', error);
      // Non bloccare il login per questo errore
    }
  }

  /**
   * Ottieni profilo utente
   */
  static async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        return { uid, ...userDoc.data() } as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('Errore recupero profilo utente:', error);
      return null;
    }
  }

  /**
   * Aggiorna profilo utente
   */
  static async updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<void> {
    const userRef = doc(db, 'users', uid);
    
    // Rimuovi campi non aggiornabili
    const { uid: _, createdAt, ...allowedUpdates } = updates;
    
    await updateDoc(userRef, {
      ...allowedUpdates,
      updatedAt: serverTimestamp()
    });
  }

  /**
   * Controlla se un utente è admin
   */
  static isAdmin(email: string): boolean {
    return ADMIN_EMAILS.includes(email);
  }

  /**
   * Controlla se l'utente corrente è admin
   */
  static isCurrentUserAdmin(): boolean {
    const user = auth.currentUser;
    return user ? this.isAdmin(user.email!) : false;
  }

  /**
   * Logout utente
   */
  static async logoutUser(): Promise<void> {
    await signOut(auth);
  }

  /**
   * Reset password
   */
  static async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email);
  }

  /**
   * Aggiorna immagine profilo utente
   */
  static async updateProfileImage(uid: string, imageUrl: string): Promise<void> {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      profileImageUrl: imageUrl,
      updatedAt: serverTimestamp()
    });
  }

  /**
   * Ascolta cambiamenti stato autenticazione
   */
  static onAuthStateChange(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
  }

  /**
   * Cerca utente per email (admin only)
   */
  static async getUserByEmail(email: string): Promise<UserProfile | null> {
    try {
      const usersQuery = query(
        collection(db, 'users'),
        where('email', '==', email)
      );
      const snapshot = await getDocs(usersQuery);
      
      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];
        return { uid: userDoc.id, ...userDoc.data() } as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('Errore ricerca utente per email:', error);
      return null;
    }
  }

  /**
   * Ottieni tutti gli utenti (admin only)
   */
  static async getAllUsers(): Promise<UserProfile[]> {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
    } catch (error) {
      console.error('Errore recupero tutti gli utenti:', error);
      return [];
    }
  }
}

export default AuthService;