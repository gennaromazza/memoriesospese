import React, { useState, useCallback } from 'react';
import { useToast } from './use-toast';

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
      const { db } = await import('../lib/firebase');
      
      const galleriesRef = collection(db, "galleries");
      const q = query(galleriesRef, where("code", "==", galleryId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error('Galleria non trovata');
      }

      const galleryData = querySnapshot.docs[0].data();
      
      // Per l'accesso diretto alla galleria, richiediamo solo la password
      // La domanda di sicurezza viene usata solo nel flusso di richiesta password
      const accessInfo = {
        requiresPassword: !!galleryData.password,
        requiresSecurityQuestion: false, // Rimossa dal flusso di accesso diretto
        securityQuestion: undefined
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
      const { db } = await import('../lib/firebase');
      
      const galleriesRef = collection(db, "galleries");
      const q = query(galleriesRef, where("code", "==", params.galleryId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error('Galleria non trovata');
      }

      const galleryData = querySnapshot.docs[0].data();
      
      // Per l'accesso diretto alla galleria, verifica solo la password
      // La domanda di sicurezza è utilizzata solo nel flusso di richiesta password
      if (galleryData.password && params.password !== galleryData.password) {
        throw new Error('Password non corretta');
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