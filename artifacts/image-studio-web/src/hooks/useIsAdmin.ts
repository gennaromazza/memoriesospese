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
    // Controllo rigoroso SOLO basato su email dell'utente Firebase autenticato
    // Non uso localStorage per sicurezza (può essere manipolato)
    const result = (
      // Check email dell'utente Firebase autenticato (primario)
      (user?.email === 'gennaro.mazzacane@gmail.com') ||
      // Check email nel profilo Firebase (backup)
      (userProfile?.email === 'gennaro.mazzacane@gmail.com')
    );
    
    return Boolean(result);
  }, [userProfile, user]);
  
  return isAdmin;
}