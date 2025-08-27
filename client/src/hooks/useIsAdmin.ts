import { useMemo } from 'react';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';

// Lista email admin (importata da auth service)
const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

/**
 * Hook centralizzato per verificare se l'utente corrente è admin
 * Elimina i controlli multipli sparsi nel codice
 */
export function useIsAdmin(): boolean {
  const { userProfile, user } = useFirebaseAuth();
  
  const isAdmin = useMemo(() => {
    // Check multipli con priorità - controlli di fallback robusti
    const result = (
      // Check localStorage per compatibilità con vecchio sistema
      localStorage.getItem('isAdmin') === 'true' ||
      // Check ruolo nel profilo Firebase
      userProfile?.role === 'admin' ||
      // Check email nella lista admin (dal profilo)
      (userProfile?.email && ADMIN_EMAILS.includes(userProfile.email)) ||
      // Check email nella lista admin (dall'utente Firebase diretto)
      (user?.email && ADMIN_EMAILS.includes(user.email)) ||
      // Check hardcoded admin per sicurezza
      (user?.email === 'gennaro.mazzacane@gmail.com') ||
      (userProfile?.email === 'gennaro.mazzacane@gmail.com')
    );
    
    return Boolean(result);
  }, [userProfile, user]);
  
  return isAdmin;
}