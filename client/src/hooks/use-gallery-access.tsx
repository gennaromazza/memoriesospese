import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface AccessInfo {
  requiresPassword: boolean;
  requiresSecurityQuestion: boolean;
  securityQuestion?: string;
}

interface VerifyAccessParams {
  galleryId: string;
  password?: string;
  securityAnswer?: string;
}

export function useGalleryAccess() {
  const [isLoading, setIsLoading] = useState(false);
  const [accessInfo, setAccessInfo] = useState<AccessInfo | null>(null);
  const [error, setError] = useState<string>('');
  const { toast } = useToast();

  const getAccessInfo = useCallback(async (galleryId: string) => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/galleries/${galleryId}/access-info`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Galleria non trovata');
        }
        throw new Error('Errore nel recupero informazioni accesso');
      }

      const data = await response.json();
      setAccessInfo(data);
      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verifyAccess = useCallback(async (params: VerifyAccessParams) => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/galleries/${params.galleryId}/verify-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: params.password,
          securityAnswer: params.securityAnswer,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        if (response.status === 403) {
          if (errorData.requiresPassword) {
            throw new Error('Password non corretta');
          }
          if (errorData.requiresSecurityQuestion) {
            throw new Error('Risposta alla domanda di sicurezza non corretta');
          }
        }
        
        throw new Error(errorData.error || 'Errore nella verifica accesso');
      }

      const result = await response.json();
      
      toast({
        title: "Accesso autorizzato",
        description: "Benvenuto nella galleria!",
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const reset = useCallback(() => {
    setAccessInfo(null);
    setError('');
    setIsLoading(false);
  }, []);

  return {
    getAccessInfo,
    verifyAccess,
    reset,
    accessInfo,
    isLoading,
    error,
  };
}