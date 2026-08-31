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
  type User,
  GoogleAuthProvider,
  type OAuthCredential,
  fetchSignInMethodsForEmail,
  getRedirectResult,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  type UserCredential,
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
  arrayUnion,
  runTransaction,
} from 'firebase/firestore';
import { auth, db } from './firebase';

// Lista admin (migrata da server/middleware/auth.ts)
const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  profileImageUrl?: string;
  watermarkUrl?: string;
  role: 'admin' | 'user';
  galleries: string[];
  createdAt: any;
  lastLoginAt: any;
  updatedAt?: any;
}

/**
 * Firebase non può collegare automaticamente Google a un account password senza
 * prima verificare la password del proprietario. Conserviamo la credenziale
 * Google solo in memoria e chiediamo la password nel punto in cui serve.
 */
export class GoogleAccountLinkRequiredError extends Error {
  readonly code = 'auth/google-account-link-required';

  constructor(
    readonly email: string,
    readonly signInMethods: string[],
  ) {
    super(
      signInMethods.includes('password')
        ? 'Questa email ha già un account. Inserisci la password una sola volta per collegare Google.'
        : 'Questa email usa già un altro metodo di accesso. Accedi con quel metodo per collegare Google.',
    );
    this.name = 'GoogleAccountLinkRequiredError';
  }
}

export interface GoogleSignInResult {
  /** Utente autenticato; null quando il browser sta passando al redirect Google. */
  user: User | null;
  redirecting: boolean;
}

const GOOGLE_REDIRECT_FLAG = 'print_shop_google_redirect';

function firebaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function firebaseErrorEmail(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('customData' in error)) return undefined;
  const customData = error.customData;
  if (typeof customData !== 'object' || customData === null || !('email' in customData)) return undefined;
  return typeof customData.email === 'string' ? customData.email : undefined;
}

function shouldUseGoogleRedirect(): boolean {
  if (typeof navigator === 'undefined') return false;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return mobileUserAgent || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
}

export class AuthService {
  private static pendingGoogleCredential: OAuthCredential | null = null;
  private static pendingGoogleEmail: string | null = null;
  private static pendingGoogleSignInMethods: string[] = [];

  private static async rememberGoogleAccountCollision(error: unknown): Promise<GoogleAccountLinkRequiredError | null> {
    if (firebaseErrorCode(error) !== 'auth/account-exists-with-different-credential') return null;
    const email = firebaseErrorEmail(error);
    const googleCredential = GoogleAuthProvider.credentialFromError(
      error as Parameters<typeof GoogleAuthProvider.credentialFromError>[0],
    );
    if (!email || !googleCredential) return null;

    this.pendingGoogleCredential = googleCredential;
    this.pendingGoogleEmail = email;
    this.pendingGoogleSignInMethods = await fetchSignInMethodsForEmail(auth, email).catch(() => [] as string[]);
    return new GoogleAccountLinkRequiredError(email, this.pendingGoogleSignInMethods);
  }

  private static createGoogleProvider(): GoogleAuthProvider {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
  }

  /** Il backend shop accetta solo token emessi da una sessione Google attiva. */
  static async isGoogleSession(user: User): Promise<boolean> {
    if (!user.emailVerified) return false;
    const token = await user.getIdTokenResult();
    return token.signInProvider === 'google.com';
  }

  private static async ensureGoogleSession(credential: UserCredential): Promise<UserCredential> {
    if (await this.isGoogleSession(credential.user).catch(() => false)) return credential;
    const googleCredential = GoogleAuthProvider.credentialFromResult(credential);
    if (!googleCredential) {
      throw new Error('Google è stato collegato, ma la sessione non è stata confermata. Premi di nuovo “Continua con Google”.');
    }
    return signInWithCredential(auth, googleCredential);
  }

  /**
   * Crea o completa users/{uid} senza sovrascrivere ruolo, gallerie o campi
   * gestionali già presenti. La transazione è sicura anche se viene richiamata
   * sia dal redirect sia dal listener globale di autenticazione.
   */
  static async ensureUserProfile(user: User): Promise<UserProfile | null> {
    if (!user.email) return null;

    const userRef = doc(db, 'users', user.uid);
    const displayName = user.displayName?.trim() || user.email.split('@')[0];

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(userRef);
      if (!snapshot.exists()) {
        transaction.set(userRef, {
          email: user.email,
          displayName,
          role: ADMIN_EMAILS.includes(user.email!) ? 'admin' : 'user',
          galleries: [],
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
        });
        return;
      }

      const current = snapshot.data();
      transaction.set(userRef, {
        email: user.email,
        lastLoginAt: serverTimestamp(),
        ...(!current.displayName && displayName ? { displayName } : {}),
      }, { merge: true });
    });

    return this.getUserProfile(user.uid);
  }

  /**
   * Accesso Google con popup su desktop e redirect sui dispositivi mobili o
   * quando il browser blocca il popup. Se l'utente è già autenticato, collega
   * Google allo stesso UID invece di creare un secondo profilo.
   */
  static async loginWithGoogle(): Promise<GoogleSignInResult> {
    // Il redirect mobile può essere tornato con una collisione account. La
    // credenziale OAuth vive solo in memoria: chiediamo subito la password,
    // senza riaprire Google e senza serializzare token in sessionStorage.
    if (this.pendingGoogleCredential && this.pendingGoogleEmail) {
      throw new GoogleAccountLinkRequiredError(
        this.pendingGoogleEmail,
        this.pendingGoogleSignInMethods,
      );
    }

    const provider = this.createGoogleProvider();
    const currentUser = auth.currentUser;
    const alreadyLinked = currentUser?.providerData.some(({ providerId }) => providerId === 'google.com');
    const googleSession = currentUser
      ? await this.isGoogleSession(currentUser).catch(() => false)
      : false;

    if (googleSession && currentUser) {
      await this.ensureUserProfile(currentUser);
      return { user: currentUser, redirecting: false };
    }

    const shouldLinkGoogle = Boolean(currentUser && !alreadyLinked);

    if (shouldUseGoogleRedirect()) {
      sessionStorage.setItem(GOOGLE_REDIRECT_FLAG, '1');
      if (currentUser && shouldLinkGoogle) {
        await linkWithRedirect(currentUser, provider);
      } else {
        await signInWithRedirect(auth, provider);
      }
      return { user: null, redirecting: true };
    }

    try {
      const credential = currentUser && shouldLinkGoogle
        ? await linkWithPopup(currentUser, provider)
        : await signInWithPopup(auth, provider);
      const googleSessionCredential = shouldLinkGoogle
        ? await this.ensureGoogleSession(credential)
        : credential;
      this.pendingGoogleCredential = null;
      this.pendingGoogleEmail = null;
      this.pendingGoogleSignInMethods = [];
      await this.ensureUserProfile(googleSessionCredential.user);
      return { user: googleSessionCredential.user, redirecting: false };
    } catch (error) {
      const code = firebaseErrorCode(error);
      if (code === 'auth/account-exists-with-different-credential') {
        const linkError = await this.rememberGoogleAccountCollision(error);
        if (linkError) throw linkError;
      }

      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment' || code === 'auth/web-storage-unsupported') {
        sessionStorage.setItem(GOOGLE_REDIRECT_FLAG, '1');
        if (currentUser && shouldLinkGoogle) {
          await linkWithRedirect(currentUser, provider);
        } else {
          await signInWithRedirect(auth, provider);
        }
        return { user: null, redirecting: true };
      }

      throw error;
    }
  }

  /** Completa il redirect Google, se questa pagina ne ha appena avviato uno. */
  static async completeGoogleRedirectSignIn(): Promise<User | null> {
    try {
      const credential = await getRedirectResult(auth);
      if (!credential) return auth.currentUser;
      const googleSessionCredential = await this.ensureGoogleSession(credential);
      await this.ensureUserProfile(googleSessionCredential.user);
      return googleSessionCredential.user;
    } catch (error) {
      const linkError = await this.rememberGoogleAccountCollision(error);
      if (linkError) throw linkError;
      throw error;
    } finally {
      sessionStorage.removeItem(GOOGLE_REDIRECT_FLAG);
    }
  }

  static isGoogleRedirectPending(): boolean {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(GOOGLE_REDIRECT_FLAG) === '1';
  }

  /**
   * Collega la credenziale Google sospesa dopo aver verificato la password
   * dell'account esistente. La credenziale OAuth non viene mai salvata su disco.
   */
  static async linkPendingGoogleAccount(password: string): Promise<User> {
    const email = this.pendingGoogleEmail;
    const googleCredential = this.pendingGoogleCredential;
    if (!email || !googleCredential) {
      throw new Error('La richiesta di collegamento è scaduta. Riprova con Google.');
    }

    const passwordCredential = await signInWithEmailAndPassword(auth, email, password);
    if (!passwordCredential.user.providerData.some(({ providerId }) => providerId === 'google.com')) {
      await linkWithCredential(passwordCredential.user, googleCredential);
    }
    const googleSessionCredential = await signInWithCredential(auth, googleCredential);
    this.pendingGoogleCredential = null;
    this.pendingGoogleEmail = null;
    this.pendingGoogleSignInMethods = [];
    await this.ensureUserProfile(googleSessionCredential.user);
    return googleSessionCredential.user;
  }

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
      await this.ensureUserProfile(user);
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
    const { uid: _, createdAt, role: _role, ...allowedUpdates } = updates;
    
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
    if (!user?.email) return false;
    return this.isAdmin(user.email);
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
    try {
      const userRef = doc(db, 'users', uid);
      
      // Controlla se il documento esiste
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        console.log('User document does not exist, creating it...');
        // Se non esiste, crea il documento
        await setDoc(userRef, {
          uid: uid,
          role: 'user',
          profileImageUrl: imageUrl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        console.log('User document exists, updating...');
        // Se esiste, aggiorna
        await updateDoc(userRef, {
          profileImageUrl: imageUrl,
          updatedAt: serverTimestamp()
        });
      }
      
      console.log('Profile image updated successfully for user:', uid);
    } catch (error) {
      console.error('Error updating profile image:', error);
      throw error;
    }
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
