import { useMemo } from 'react';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';

export interface UserInfo {
  email: string;
  displayName: string;
  profileImageUrl: string;
  isAuthenticated: boolean;
  role: string;
}

/**
 * Hook centralizzato per ottenere informazioni utente consolidate
 * Elimina pattern ripetuti di recupero dati utente con fallback
 */
export function useUserInfo(): UserInfo {
  const { user, userProfile, isAuthenticated } = useFirebaseAuth();
  
  const userInfo = useMemo(() => ({
    email: user?.email || localStorage.getItem('userEmail') || '',
    displayName: userProfile?.displayName || user?.displayName || localStorage.getItem('userName') || '',
    profileImageUrl: userProfile?.profileImageUrl || user?.photoURL || '',
    isAuthenticated,
    role: userProfile?.role || 'guest'
  }), [user, userProfile, isAuthenticated]);
  
  return userInfo;
}