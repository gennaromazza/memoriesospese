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
      // Prima controlla se la galleria esiste su Firebase
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      
      const galleriesRef = collection(db, "galleries");
      const q = query(galleriesRef, where("code", "==", galleryId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error('Galleria non trovata');
      }

      const galleryData = querySnapshot.docs[0].data();
      
      // Determina i requisiti di accesso
      const accessInfo = {
        requiresPassword: !!galleryData.password,
        requiresSecurityQuestion: !!galleryData.requiresSecurityQuestion,
        securityQuestion: galleryData.requiresSecurityQuestion ? getSecurityQuestionText(galleryData) : undefined
      };

      setAccessInfo(accessInfo);
      return accessInfo;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getSecurityQuestionText = (galleryData: any): string => {
    if (!galleryData.requiresSecurityQuestion) return '';
    
    const questionType = galleryData.securityQuestionType;
    
    switch (questionType) {
      case 'location':
        return "Qual è il nome della location dell'evento?";
      case 'month':
        return "In che mese si è svolto l'evento?";
      case 'custom':
        return galleryData.securityQuestionCustom || 'Domanda personalizzata';
      default:
        return 'Domanda di sicurezza';
    }
  };

  const verifyAccess = useCallback(async (params: VerifyAccessParams) => {
    setIsLoading(true);
    setError('');

    try {
      // Verifica tramite Firebase
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      
      const galleriesRef = collection(db, "galleries");
      const q = query(galleriesRef, where("code", "==", params.galleryId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error('Galleria non trovata');
      }

      const galleryData = querySnapshot.docs[0].data();
      
      // Verifica password se richiesta
      if (galleryData.password && params.password !== galleryData.password) {
        throw new Error('Password non corretta');
      }
      
      // Verifica domanda di sicurezza se richiesta
      if (galleryData.requiresSecurityQuestion) {
        if (!params.securityAnswer) {
          throw new Error('Risposta alla domanda di sicurezza richiesta');
        }
        
        const correctAnswer = galleryData.securityAnswer;
        const providedAnswer = params.securityAnswer.toLowerCase().trim();
        const expectedAnswer = correctAnswer.toLowerCase().trim();
        
        if (providedAnswer !== expectedAnswer) {
          throw new Error('Risposta alla domanda di sicurezza non corretta');
        }
      }
      
      toast({
        title: "Accesso autorizzato",
        description: "Benvenuto nella galleria!",
      });

      return { success: true, galleryId: params.galleryId };
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