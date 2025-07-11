/**
 * Nuovo Context per gestire autenticazione Firebase unificata
 * Sostituisce il doppio sistema di autenticazione esistente
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { AuthService, UserProfile } from '../lib/auth';

interface FirebaseAuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string, galleryId?: string) => Promise<User>;
  register: (email: string, password: string, displayName: string, galleryId?: string) => Promise<User>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshUserProfile: () => Promise<void>;
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

  // Inizializza stato autenticazione
  useEffect(() => {
    const unsubscribe = AuthService.onAuthStateChange(async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Fetch profilo utente da Firestore
        try {
          const profile = await AuthService.getUserProfile(firebaseUser.uid);
          setUserProfile(profile);
        } catch (error) {
          console.error('Errore recupero profilo utente:', error);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
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
      return user;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await AuthService.logoutUser();
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
        console.log('Refreshing user profile for user:', user.uid);
        const profile = await AuthService.getUserProfile(user.uid);
        console.log('Profile data retrieved:', profile);
        setUserProfile(profile);
        console.log('Profile updated successfully in context');
      } catch (error) {
        console.error('Errore refresh profilo utente:', error);
        throw error;
      }
    } else {
      console.warn('No user available for profile refresh');
    }
  };

  const value: FirebaseAuthContextType = {
    user,
    userProfile,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: AuthService.isCurrentUserAdmin(),
    login,
    register,
    logout,
    resetPassword,
    refreshUserProfile
  };

  return (
    <FirebaseAuthContext.Provider value={value}>
      {children}
    </FirebaseAuthContext.Provider>
  );
}

export default FirebaseAuthProvider;