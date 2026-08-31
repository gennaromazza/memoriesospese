/**
 * Nuovo Context per gestire autenticazione Firebase unificata
 * Sostituisce il doppio sistema di autenticazione esistente
 */

import React, { createContext, useCallback, useContext, useEffect, useState, useMemo, useRef, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { AuthService, GoogleAccountLinkRequiredError, GoogleSignInResult, UserProfile } from '../lib/auth';

interface FirebaseAuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGoogleAuthenticated: boolean;
  isAdmin: boolean;
  showProfileWelcome: boolean;
  googleLinkRequest: GoogleAccountLinkRequiredError | null;
  login: (email: string, password: string, galleryId?: string) => Promise<User>;
  loginWithGoogle: () => Promise<GoogleSignInResult>;
  linkGoogleAccount: (password: string) => Promise<User>;
  register: (email: string, password: string, displayName: string, galleryId?: string) => Promise<User>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshUserProfile: () => Promise<void>;
  setShowProfileWelcome: (show: boolean) => void;
}

const FirebaseAuthContext = createContext<FirebaseAuthContextType | null>(null);

export function useFirebaseAuth() {
  const context = useContext(FirebaseAuthContext);
  if (!context) {
    throw new Error('useFirebaseAuth must be used within a FirebaseAuthProvider');
  }
  return context;
}

interface FirebaseAuthProviderProps {
  children: ReactNode;
}

export function FirebaseAuthProvider({ children }: FirebaseAuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGoogleAuthenticated, setIsGoogleAuthenticated] = useState(false);
  const [showProfileWelcome, setShowProfileWelcome] = useState(false);
  const [googleLinkRequest, setGoogleLinkRequest] = useState<GoogleAccountLinkRequiredError | null>(null);
  const authSyncVersionRef = useRef(0);

  /**
   * Aggiorna in un solo punto tutto lo stato derivato dall'utente Firebase.
   * È richiamato sia dal listener globale sia dal risultato esplicito del
   * redirect Google: sui browser mobili il redirect ricrea completamente la
   * pagina e non possiamo affidarci al solo evento del listener.
   */
  const applyAuthenticatedUser = useCallback(async (firebaseUser: User | null) => {
    const syncVersion = ++authSyncVersionRef.current;
    setUser(firebaseUser);

    if (!firebaseUser) {
      setUserProfile(null);
      setIsGoogleAuthenticated(false);
      setIsLoading(false);
      return;
    }

    const [googleSession, profile] = await Promise.all([
      AuthService.isGoogleSession(firebaseUser).catch(() => false),
      AuthService.ensureUserProfile(firebaseUser).catch((error) => {
        console.error('Errore recupero profilo utente:', error);
        return null;
      }),
    ]);

    // Ignora una risposta lenta appartenente a una sessione ormai sostituita.
    if (syncVersion !== authSyncVersionRef.current) return;
    setUser(firebaseUser);
    setIsGoogleAuthenticated(googleSession);
    setUserProfile(profile);
    setIsLoading(false);
  }, []);

  // Inizializza stato autenticazione
  useEffect(() => {
    let active = true;
    const unsubscribe = AuthService.onAuthStateChange((firebaseUser) => {
      if (active) void applyAuthenticatedUser(firebaseUser);
    });

    // Al ritorno dal redirect mobile applichiamo esplicitamente il risultato.
    // Questo chiude la race in cui Firebase ha effettuato il login ma la UI è
    // rimasta sul gate di accesso fino a un successivo ricaricamento.
    void AuthService.completeGoogleRedirectSignIn()
      .then((redirectUser) => {
        if (active && redirectUser) return applyAuthenticatedUser(redirectUser);
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof GoogleAccountLinkRequiredError) {
          setGoogleLinkRequest(error);
          setIsLoading(false);
          return;
        }
        console.error('Errore completamento accesso Google:', error);
        setIsLoading(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [applyAuthenticatedUser]);

  const login = async (email: string, password: string, galleryId?: string) => {
    setIsLoading(true);
    try {
      const user = await AuthService.loginUser(email, password);
      if (galleryId) {
        await AuthService.updateLastLogin(user, galleryId);
      }
      await applyAuthenticatedUser(user);
      return user;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, displayName: string, galleryId?: string) => {
    setIsLoading(true);
    try {
      const user = await AuthService.registerUser(email, password, displayName, galleryId);
      await applyAuthenticatedUser(user);
      
      // Show profile welcome modal for new users after a brief delay
      setTimeout(() => {
        setShowProfileWelcome(true);
      }, 1500);
      
      return user;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    setIsLoading(true);
    try {
      const result = await AuthService.loginWithGoogle();
      setGoogleLinkRequest(null);
      if (result.user) await applyAuthenticatedUser(result.user);
      return result;
    } catch (error) {
      if (error instanceof GoogleAccountLinkRequiredError) setGoogleLinkRequest(error);
      throw error;
    } finally {
      // In caso di redirect la pagina verrà sostituita; negli altri casi
      // liberiamo subito la UI, senza attendere un secondo evento auth.
      setIsLoading(false);
    }
  };

  const linkGoogleAccount = async (password: string) => {
    setIsLoading(true);
    try {
      const linkedUser = await AuthService.linkPendingGoogleAccount(password);
      setGoogleLinkRequest(null);
      await applyAuthenticatedUser(linkedUser);
      return linkedUser;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await AuthService.logoutUser();
      setIsGoogleAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    await AuthService.resetPassword(email);
  };

  const refreshUserProfile = async () => {
    if (user) {
      try {
        const profile = await AuthService.getUserProfile(user.uid);
        setUserProfile(profile);
      } catch (error) {
        console.error('Errore refresh profilo utente:', error);
        throw error;
      }
    } else {
      console.warn('No user available for profile refresh');
    }
  };

  // Calcola isAdmin in modo reattivo quando user cambia
  // Fix per race condition: ora si aggiorna automaticamente quando user è disponibile
  const isAdmin = useMemo(() => {
    if (!user?.email) return false;
    return AuthService.isAdmin(user.email);
  }, [user]);

  const value: FirebaseAuthContextType = {
    user,
    userProfile,
    isLoading,
    isAuthenticated: !!user,
    isGoogleAuthenticated,
    isAdmin,
    showProfileWelcome,
    googleLinkRequest,
    login,
    loginWithGoogle,
    linkGoogleAccount,
    register,
    logout,
    resetPassword,
    refreshUserProfile,
    setShowProfileWelcome
  };

  return (
    <FirebaseAuthContext.Provider value={value}>
      {children}
    </FirebaseAuthContext.Provider>
  );
}

export default FirebaseAuthProvider;
