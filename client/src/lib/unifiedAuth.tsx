/**
 * Sistema unificato di autenticazione che elimina le duplicazioni
 * tra Firebase Auth e middleware backend
 */

import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '@shared/logger';
import { errorHandler } from './errorHandler';

export interface AuthState {
  isAuthenticated: boolean;
  userEmail: string | null;
  userName: string | null;
  isAdmin: boolean;
  token?: string;
}

export interface AuthCredentials {
  userEmail: string;
  userName: string;
  galleryId?: string;
  password?: string;
  securityAnswer?: string;
}

class UnifiedAuthService {
  private authState: AuthState = {
    isAuthenticated: false,
    userEmail: null,
    userName: null,
    isAdmin: false
  };

  private authListeners: ((state: AuthState) => void)[] = [];

  constructor() {
    this.initializeAuth();
  }

  private initializeAuth() {
    // Recupera stato da localStorage se disponibile
    const storedEmail = localStorage.getItem('userEmail');
    const storedName = localStorage.getItem('userName');
    const storedAdmin = localStorage.getItem('isAdmin') === 'true';

    if (storedEmail && storedName) {
      this.authState = {
        isAuthenticated: true,
        userEmail: storedEmail,
        userName: storedName,
        isAdmin: storedAdmin
      };
      this.notifyListeners();
    }
  }

  /**
   * Sottoscrivi ai cambiamenti dello stato di autenticazione
   */
  subscribe(listener: (state: AuthState) => void): () => void {
    this.authListeners.push(listener);
    
    // Notifica immediata dello stato attuale
    listener(this.authState);
    
    // Ritorna funzione di cleanup
    return () => {
      const index = this.authListeners.indexOf(listener);
      if (index > -1) {
        this.authListeners.splice(index, 1);
      }
    };
  }

  private notifyListeners() {
    this.authListeners.forEach(listener => listener(this.authState));
  }

  /**
   * Autentica utente con credenziali unified
   */
  async authenticate(credentials: AuthCredentials): Promise<{
    success: boolean;
    requiresSecurityQuestion?: boolean;
    securityQuestion?: string;
    error?: string;
  }> {
    try {
      logger.info('Tentativo di autenticazione unificata', {
        contextName: 'UnifiedAuth',
        userId: credentials.userEmail,
        galleryId: credentials.galleryId
      });

      // Aggiorna stato locale
      this.updateAuthState({
        isAuthenticated: true,
        userEmail: credentials.userEmail,
        userName: credentials.userName,
        isAdmin: this.checkIsAdmin(credentials.userEmail)
      });

      // Salva in localStorage
      localStorage.setItem('userEmail', credentials.userEmail);
      localStorage.setItem('userName', credentials.userName);
      localStorage.setItem('isAdmin', this.authState.isAdmin.toString());

      if (credentials.galleryId) {
        localStorage.setItem(`gallery_auth_${credentials.galleryId}`, 'true');
      }

      return { success: true };

    } catch (error) {
      errorHandler.handleAuthError(error, {
        contextName: 'UnifiedAuth'
      });
      return { 
        success: false, 
        error: 'Errore durante l\'autenticazione' 
      };
    }
  }

  /**
   * Logout completo con pulizia stato
   */
  async logout(): Promise<void> {
    try {
      logger.info('Logout unificato', {
        contextName: 'UnifiedAuth',
        userId: this.authState.userEmail
      });

      // Pulisci localStorage
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('gallery_auth_') || 
            key.startsWith('user_email_') || 
            key.startsWith('user_name_') ||
            key === 'userEmail' ||
            key === 'userName' ||
            key === 'isAdmin') {
          localStorage.removeItem(key);
        }
      });

      // Reset stato interno
      this.updateAuthState({
        isAuthenticated: false,
        userEmail: null,
        userName: null,
        isAdmin: false
      });

    } catch (error) {
      errorHandler.handle(error, {
        component: 'UnifiedAuth',
        action: 'logout'
      });
    }
  }

  /**
   * Verifica se l'utente ha accesso alla galleria
   */
  hasGalleryAccess(galleryId: string): boolean {
    return this.authState.isAuthenticated && 
           localStorage.getItem(`gallery_auth_${galleryId}`) === 'true';
  }

  /**
   * Ottieni credenziali per richieste API
   */
  getApiCredentials(): {
    userEmail: string;
    userName: string;
  } | null {
    if (!this.authState.isAuthenticated) {
      return null;
    }

    return {
      userEmail: this.authState.userEmail!,
      userName: this.authState.userName!
    };
  }

  /**
   * Stato attuale di autenticazione
   */
  get currentState(): AuthState {
    return { ...this.authState };
  }

  /**
   * Verifica se l'utente è admin
   */
  private checkIsAdmin(email: string): boolean {
    const adminEmails = [
      'gennaro.mazzacane@gmail.com',
      'admin@wedgallery.com'
    ];
    return adminEmails.includes(email.toLowerCase());
  }

  private updateAuthState(newState: Partial<AuthState>) {
    this.authState = { ...this.authState, ...newState };
    this.notifyListeners();
  }

  /**
   * Verifica validità autenticazione corrente
   */
  async validateCurrentAuth(): Promise<boolean> {
    try {
      if (!this.authState.isAuthenticated) {
        return false;
      }

      // Verifica che i dati siano ancora in localStorage
      const storedEmail = localStorage.getItem('userEmail');
      const storedName = localStorage.getItem('userName');

      if (!storedEmail || !storedName) {
        await this.logout();
        return false;
      }

      return true;
    } catch (error) {
      logger.warn('Errore validazione autenticazione', {
        contextName: 'UnifiedAuth',
        error: error as Error
      });
      return false;
    }
  }

  /**
   * Rinnova token di autenticazione se necessario
   */
  async refreshToken(): Promise<string | null> {
    try {
      if (!this.authState.isAuthenticated) {
        return null;
      }

      // In un'implementazione reale, qui si farebbe refresh del JWT
      // Per ora ritorniamo un token mock
      return `token_${Date.now()}`;
    } catch (error) {
      errorHandler.handle(error, {
        component: 'UnifiedAuth',
        action: 'refreshToken'
      });
      return null;
    }
  }
}

// Istanza singleton del servizio di autenticazione unificato
export const unifiedAuth = new UnifiedAuthService();

/**
 * Hook React per utilizzare l'autenticazione unificata
 */
export function useUnifiedAuth() {
  const [authState, setAuthState] = useState<AuthState>(unifiedAuth.currentState);

  useEffect(() => {
    const unsubscribe = unifiedAuth.subscribe(setAuthState);
    return unsubscribe;
  }, []);

  const authenticate = useCallback(
    (credentials: AuthCredentials) => unifiedAuth.authenticate(credentials),
    []
  );

  const logout = useCallback(
    () => unifiedAuth.logout(),
    []
  );

  const hasGalleryAccess = useCallback(
    (galleryId: string) => unifiedAuth.hasGalleryAccess(galleryId),
    [authState]
  );

  const getApiCredentials = useCallback(
    () => unifiedAuth.getApiCredentials(),
    [authState]
  );

  return {
    ...authState,
    authenticate,
    logout,
    hasGalleryAccess,
    getApiCredentials,
    validateAuth: unifiedAuth.validateCurrentAuth,
    refreshToken: unifiedAuth.refreshToken
  };
}

/**
 * HOC per componenti che richiedono autenticazione
 */
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  options: {
    requireAdmin?: boolean;
    redirectTo?: string;
  } = {}
) {
  const AuthenticatedComponent = (props: P) => {
    const { isAuthenticated, isAdmin } = useUnifiedAuth();

    if (!isAuthenticated) {
      return <div>Accesso richiesto</div>;
    }

    if (options.requireAdmin && !isAdmin) {
      return <div>Accesso admin richiesto</div>;
    }

    return <Component {...props} />;
  };

  AuthenticatedComponent.displayName = `withAuth(${Component.displayName || Component.name})`;
  return AuthenticatedComponent;
}