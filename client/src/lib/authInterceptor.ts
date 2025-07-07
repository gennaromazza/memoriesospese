import { auth } from '@/lib/firebase';
import { toast } from '@/hooks/use-toast';

// Interceptor per gestire automaticamente errori 401
export class AuthInterceptor {
  private static instance: AuthInterceptor;
  private authDialogCallback: (() => void) | null = null;

  static getInstance(): AuthInterceptor {
    if (!AuthInterceptor.instance) {
      AuthInterceptor.instance = new AuthInterceptor();
    }
    return AuthInterceptor.instance;
  }

  // Registra callback per aprire dialog auth
  setAuthDialogCallback(callback: () => void) {
    this.authDialogCallback = callback;
  }

  // Gestisce errori 401 automaticamente
  handleUnauthorized(error: Error, context?: string) {
    const user = auth.currentUser;
    
    // Se non c'è utente, mostra dialog di login
    if (!user) {
      toast({
        title: 'Accesso richiesto',
        description: 'Effettua il login per continuare',
        variant: 'destructive',
      });
      
      if (this.authDialogCallback) {
        this.authDialogCallback();
      }
      return;
    }

    // Se l'utente è loggato ma riceve 401, problema di sessione
    toast({
      title: 'Sessione scaduta',
      description: 'Rieffettua il login per continuare',
      variant: 'destructive',
    });

    // Logout automatico per forzare nuovo login
    auth.signOut().then(() => {
      if (this.authDialogCallback) {
        this.authDialogCallback();
      }
    });
  }

  // Verifica se l'utente è autenticato per operazioni critiche
  async requireAuth(): Promise<boolean> {
    const user = auth.currentUser;
    
    if (!user) {
      this.handleUnauthorized(new Error('Non autenticato'));
      return false;
    }

    // Verifica che l'utente abbia email e displayName
    if (!user.email) {
      toast({
        title: 'Profilo incompleto',
        description: 'Email mancante nel profilo utente',
        variant: 'destructive',
      });
      return false;
    }

    return true;
  }

  // Ottiene credenziali validate
  async getValidatedCredentials(): Promise<{ userEmail: string; userName: string } | null> {
    const user = auth.currentUser;
    
    if (!user || !user.email) {
      return null;
    }

    return {
      userEmail: user.email,
      userName: user.displayName || user.email.split('@')[0]
    };
  }
}

export const authInterceptor = AuthInterceptor.getInstance();