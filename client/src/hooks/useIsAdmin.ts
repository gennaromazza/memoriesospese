import { useMemo } from 'react';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';

// Lista email admin (importata da auth service)
const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

/**
 * Hook centralizzato per verificare se l'utente corrente è admin
 * Elimina i controlli multipli sparsi nel codice
 */
export function useIsAdmin(): boolean {
  const { userProfile } = useFirebaseAuth();
  
  const isAdmin = useMemo(() => {
    // Check multipli con priorità
    const result = (
      // Check localStorage per compatibilità con vecchio sistema
      localStorage.getItem('isAdmin') === 'true' ||
      // Check ruolo nel profilo Firebase
      userProfile?.role === 'admin' ||
      // Check email nella lista admin
      (userProfile?.email && ADMIN_EMAILS.includes(userProfile.email))
    );
    
    return Boolean(result);
  }, [userProfile]);
  
  return isAdmin;
}