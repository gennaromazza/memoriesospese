import { toast } from '@/hooks/use-toast';
import { logger } from '@shared/logger';

/**
 * Sistema centralizzato di gestione errori con toast notifications
 * Sostituisce console.error sparsi con gestione unificata
 */

export interface ErrorContext {
  userId?: string;
  galleryId?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, any>;
}

export interface ErrorHandlerOptions {
  showToast?: boolean;
  logLevel?: 'error' | 'warn' | 'info';
  userMessage?: string;
  retryAction?: () => void;
}

class ErrorHandler {
  /**
   * Gestisce errori con logging e notifica utente appropriata
   */
  handle(
    error: Error | unknown,
    context: ErrorContext,
    options: ErrorHandlerOptions = {}
  ): void {
    const {
      showToast = true,
      logLevel = 'error',
      userMessage,
      retryAction
    } = options;

    // Estrai informazioni dall'errore
    const errorInfo = this.extractErrorInfo(error);
    
    // Log strutturato
    logger[logLevel](errorInfo.message, {
      error: errorInfo.originalError,
      contextName: context.component,
      userId: context.userId,
      galleryId: context.galleryId,
      metadata: {
        action: context.action,
        ...context.metadata,
        errorType: errorInfo.type,
        statusCode: errorInfo.statusCode
      }
    });

    // Mostra toast all'utente se richiesto
    if (showToast) {
      this.showUserNotification(errorInfo, userMessage, retryAction);
    }
  }

  /**
   * Estrae informazioni strutturate dall'errore
   */
  private extractErrorInfo(error: Error | unknown): {
    message: string;
    type: string;
    statusCode?: number;
    originalError?: Error;
  } {
    if (error instanceof Error) {
      return {
        message: error.message,
        type: error.constructor.name,
        originalError: error
      };
    }

    if (typeof error === 'object' && error !== null) {
      const errorObj = error as any;
      
      // Gestione errori HTTP
      if (errorObj.status || errorObj.statusCode) {
        return {
          message: errorObj.message || 'Errore di rete',
          type: 'HttpError',
          statusCode: errorObj.status || errorObj.statusCode
        };
      }

      // Gestione errori Firebase
      if (errorObj.code) {
        return {
          message: this.getFirebaseErrorMessage(errorObj.code),
          type: 'FirebaseError'
        };
      }
    }

    return {
      message: String(error) || 'Errore sconosciuto',
      type: 'UnknownError'
    };
  }

  /**
   * Traduce codici errore Firebase in messaggi user-friendly
   */
  private getFirebaseErrorMessage(code: string): string {
    const messages: Record<string, string> = {
      'auth/user-not-found': 'Utente non trovato',
      'auth/wrong-password': 'Password non corretta',
      'auth/too-many-requests': 'Troppi tentativi, riprova più tardi',
      'auth/network-request-failed': 'Errore di connessione',
      'permission-denied': 'Accesso negato',
      'not-found': 'Risorsa non trovata',
      'already-exists': 'Elemento già esistente',
      'resource-exhausted': 'Limite di utilizzo raggiunto'
    };

    return messages[code] || `Errore: ${code}`;
  }

  /**
   * Mostra notifica appropriata all'utente
   */
  private showUserNotification(
    errorInfo: { message: string; type: string; statusCode?: number },
    userMessage?: string,
    retryAction?: () => void
  ): void {
    const message = userMessage || this.getUserFriendlyMessage(errorInfo);
    
    toast({
      title: 'Si è verificato un errore',
      description: message,
      variant: 'destructive'
    });
  }

  /**
   * Genera messaggio user-friendly basato sul tipo di errore
   */
  private getUserFriendlyMessage(errorInfo: {
    message: string;
    type: string;
    statusCode?: number;
  }): string {
    // Errori di rete
    if (errorInfo.statusCode) {
      switch (errorInfo.statusCode) {
        case 401:
          return 'Sessione scaduta, effettua di nuovo l\'accesso';
        case 403:
          return 'Non hai i permessi per questa operazione';
        case 404:
          return 'La risorsa richiesta non è stata trovata';
        case 429:
          return 'Troppi tentativi, riprova più tardi';
        case 500:
          return 'Errore del server, riprova più tardi';
        default:
          return 'Si è verificato un errore di rete';
      }
    }

    // Errori Firebase già tradotti
    if (errorInfo.type === 'FirebaseError') {
      return errorInfo.message;
    }

    // Messaggio generico per altri errori
    return 'Si è verificato un errore imprevisto, riprova più tardi';
  }

  /**
   * Gestisce errori di caricamento con retry automatico
   */
  handleLoadingError(
    error: Error | unknown,
    context: ErrorContext,
    retryFunction: () => void
  ): void {
    this.handle(error, context, {
      userMessage: 'Errore nel caricamento dei dati',
      retryAction: retryFunction
    });
  }

  /**
   * Gestisce errori di upload con informazioni specifiche
   */
  handleUploadError(
    error: Error | unknown,
    context: ErrorContext & { fileName?: string },
    retryFunction?: () => void
  ): void {
    const message = context.fileName 
      ? `Errore nell'upload di ${context.fileName}`
      : 'Errore nell\'upload del file';

    this.handle(error, context, {
      userMessage: message,
      retryAction: retryFunction
    });
  }

  /**
   * Gestisce errori di autenticazione
   */
  handleAuthError(
    error: Error | unknown,
    context: ErrorContext
  ): void {
    this.handle(error, context, {
      userMessage: 'Errore di autenticazione, riprova ad accedere'
    });
  }

  /**
   * Gestisce errori di validazione form
   */
  handleValidationError(
    error: Error | unknown,
    context: ErrorContext
  ): void {
    this.handle(error, context, {
      logLevel: 'warn',
      userMessage: 'Controlla i dati inseriti e riprova'
    });
  }
}

export const errorHandler = new ErrorHandler();

// Utility per creare error handler con context predefinito
export function createContextErrorHandler(defaultContext: ErrorContext) {
  return {
    handle: (
      error: Error | unknown, 
      additionalContext: Partial<ErrorContext> = {},
      options?: ErrorHandlerOptions
    ) => errorHandler.handle(error, { ...defaultContext, ...additionalContext }, options),
    
    loading: (error: Error | unknown, retryFunction: () => void) => 
      errorHandler.handleLoadingError(error, defaultContext, retryFunction),
    
    upload: (error: Error | unknown, fileName?: string, retryFunction?: () => void) => 
      errorHandler.handleUploadError(error, { ...defaultContext, fileName }, retryFunction),
    
    auth: (error: Error | unknown) => 
      errorHandler.handleAuthError(error, defaultContext),
    
    validation: (error: Error | unknown) => 
      errorHandler.handleValidationError(error, defaultContext)
  };
}