/**
 * Nuovo Context per gestire autenticazione Firebase unificata
 * Sostituisce il doppio sistema di autenticazione esistente
 */

import React, { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react';
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

  // Inizializza stato autenticazione
  useEffect(() => {
    // getRedirectResult completa il flusso iniziato su mobile. Il listener
    // sottostante resta la fonte unica dello stato UI.
    AuthService.completeGoogleRedirectSignIn().catch((error) => {
      if (error instanceof GoogleAccountLinkRequiredError) {
        setGoogleLinkRequest(error);
        return;
      }
      console.error('Errore completamento accesso Google:', error);
    });

    const unsubscribe = AuthService.onAuthStateChange(async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        const googleSession = await AuthService.isGoogleSession(firebaseUser).catch(() => false);
        setIsGoogleAuthenticated(googleSession);
        // Fetch profilo utente da Firestore
        try {
          const profile = await AuthService.ensureUserProfile(firebaseUser);
          setUserProfile(profile);
        } catch (error) {
          console.error('Errore recupero profilo utente:', error);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
        setIsGoogleAuthenticated(false);
      }

      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string, galleryId?: string) => {
    setIsLoading(true);
    try {
      const user = await AuthService.loginUser(email, password);
      if (galleryId) {
        await AuthService.updateLastLogin(user, galleryId);
      }
      return user;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, displayName: string, galleryId?: string) => {
    setIsLoading(true);
    try {
      const user = await AuthService.registerUser(email, password, displayName, galleryId);
      setUserProfile(await AuthService.getUserProfile(user.uid));
      
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
      if (result.user) setIsGoogleAuthenticated(await AuthService.isGoogleSession(result.user).catch(() => false));
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
      setIsGoogleAuthenticated(await AuthService.isGoogleSession(linkedUser).catch(() => false));
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
