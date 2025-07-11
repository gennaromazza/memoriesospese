import { useLocation } from 'wouter';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { useToast } from '@/hooks/use-toast';

/**
 * Hook centralizzato per gestire il logout
 * Elimina duplicazioni di codice e standardizza il processo di logout
 */
export function useLogout() {
  const { logout } = useFirebaseAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const handleLogout = async () => {
    try {
      // Logout Firebase
      await logout();
      
      // Pulizia localStorage centralizzata
      const keysToRemove = [
        'isAdmin',
        'userEmail', 
        'userName',
        ...Object.keys(localStorage).filter(key => 
          key.startsWith('gallery_auth_') || 
          key.startsWith('user_email_') || 
          key.startsWith('user_name_')
        )
      ];
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      // Redirect appropriato basato sul percorso corrente
      if (window.location.pathname.includes('/admin')) {
        navigate('/admin');
      } else {
        // Torna alla home dopo logout
        navigate('/');
      }
      
      toast({
        title: "Logout effettuato",
        description: "A presto!",
      });
    } catch (error) {
      console.error('Errore durante il logout:', error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il logout",
        variant: "destructive"
      });
    }
  };
  
  return { handleLogout };
}