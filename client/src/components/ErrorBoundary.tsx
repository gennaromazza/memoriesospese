import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { createUrl } from '@/lib/config';
import { logger } from '@shared/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary per gestione errori globale React
 * Cattura errori JavaScript non gestiti e mostra UI di fallback
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Log strutturato dell'errore
    logger.error('React Error Boundary catturato errore', {
      error,
      contextName: 'ErrorBoundary',
      metadata: {
        componentStack: errorInfo.componentStack,
        errorBoundary: this.constructor.name
      }
    });

    // Callback personalizzata se fornita
    this.props.onError?.(error, errorInfo);
  }

  private handleReload = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  private handleGoHome = () => {
    window.location.href = createUrl('/');
  };

  render() {
    if (this.state.hasError) {
      // Usa fallback personalizzato se fornito
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // UI di fallback predefinita
      return (
        <div className="min-h-screen bg-gradient-to-br from-rose-50 to-pink-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <CardTitle className="text-xl font-semibold text-gray-900">
                Oops! Qualcosa è andato storto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600 text-center">
                Si è verificato un errore imprevisto. Puoi provare a ricaricare la pagina o tornare alla home.
              </p>
              
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="bg-gray-50 p-3 rounded text-xs">
                  <summary className="cursor-pointer font-medium">Dettagli errore (solo sviluppo)</summary>
                  <pre className="mt-2 text-red-600 whitespace-pre-wrap">
                    {this.state.error.toString()}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              )}

              <div className="flex gap-2 pt-2">
                <Button 
                  onClick={this.handleReload}
                  className="flex-1"
                  variant="outline"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Ricarica
                </Button>
                <Button 
                  onClick={this.handleGoHome}
                  className="flex-1"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook per creare Error Boundary con context specifico
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
}

/**
 * Error Boundary specializzato per componenti di galleria
 */
export function GalleryErrorBoundary({ 
  children, 
  galleryId 
}: { 
  children: ReactNode;
  galleryId?: string;
}) {
  const handleError = (error: Error, errorInfo: ErrorInfo) => {
    logger.error('Errore nella galleria', {
      error,
      contextName: 'GalleryErrorBoundary',
      galleryId,
      metadata: {
        componentStack: errorInfo.componentStack
      }
    });
  };

  return (
    <ErrorBoundary onError={handleError}>
      {children}
    </ErrorBoundary>
  );
}

/**
 * Error Boundary specializzato per l'admin dashboard
 */
export function AdminErrorBoundary({ 
  children 
}: { 
  children: ReactNode;
}) {
  const handleError = (error: Error, errorInfo: ErrorInfo) => {
    logger.error('Errore nell\'admin dashboard', {
      error,
      contextName: 'AdminErrorBoundary',
      metadata: {
        componentStack: errorInfo.componentStack,
        isAdmin: true
      }
    });
  };

  return (
    <ErrorBoundary onError={handleError}>
      {children}
    </ErrorBoundary>
  );
}