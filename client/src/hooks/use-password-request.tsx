import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface GalleryInfo {
  id: string;
  name: string;
  password: string;
  requiresSecurityQuestion: boolean;
  securityQuestion?: string;
}

interface RequestPasswordParams {
  galleryId: string;
  firstName: string;
  lastName: string;
  email: string;
  relation: string;
  securityAnswer?: string;
}

interface PasswordRequestResult {
  success: boolean;
  password?: string;
  requiresSecurityQuestion?: boolean;
  securityQuestion?: string;
  message?: string;
}

export function usePasswordRequest() {
  const [isLoading, setIsLoading] = useState(false);
  const [galleryInfo, setGalleryInfo] = useState<GalleryInfo | null>(null);
  const [error, setError] = useState<string>('');
  const { toast } = useToast();

  const getGalleryInfo = useCallback(async (galleryCode: string) => {
    setIsLoading(true);
    setError('');

    try {
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      
      const galleriesRef = collection(db, "galleries");
      const q = query(galleriesRef, where("code", "==", galleryCode));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error('Galleria non trovata');
      }

      const galleryData = querySnapshot.docs[0].data();
      const galleryId = querySnapshot.docs[0].id;
      
      const info: GalleryInfo = {
        id: galleryId,
        name: galleryData.name,
        password: galleryData.password,
        requiresSecurityQuestion: !!galleryData.requiresSecurityQuestion,
        securityQuestion: galleryData.requiresSecurityQuestion ? getSecurityQuestionText(galleryData) : undefined
      };

      setGalleryInfo(info);
      return info;
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

  const submitPasswordRequest = useCallback(async (params: RequestPasswordParams): Promise<PasswordRequestResult> => {
    setIsLoading(true);
    setError('');

    try {
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      if (!galleryInfo) {
        throw new Error('Informazioni galleria non disponibili');
      }

      // Se la galleria richiede una domanda di sicurezza, verificala
      if (galleryInfo.requiresSecurityQuestion) {
        if (!params.securityAnswer) {
          return {
            success: false,
            requiresSecurityQuestion: true,
            securityQuestion: galleryInfo.securityQuestion,
            message: 'Risposta alla domanda di sicurezza richiesta'
          };
        }

        // Verifica la risposta alla domanda di sicurezza
        const { doc, getDoc } = await import('firebase/firestore');
        const galleryRef = doc(db, "galleries", galleryInfo.id);
        const galleryDoc = await getDoc(galleryRef);
        
        if (galleryDoc.exists()) {
          const galleryData = galleryDoc.data();
          const correctAnswer = galleryData.securityAnswer?.toLowerCase().trim();
          const providedAnswer = params.securityAnswer.toLowerCase().trim();
          
          if (providedAnswer !== correctAnswer) {
            throw new Error('Risposta alla domanda di sicurezza non corretta');
          }
        }
      }

      // Salva la richiesta nel database
      await addDoc(collection(db, "passwordRequests"), {
        galleryId: galleryInfo.id,
        galleryCode: params.galleryId,
        firstName: params.firstName,
        lastName: params.lastName,
        email: params.email,
        relation: params.relation,
        status: "completed",
        createdAt: serverTimestamp(),
        securityQuestionAnswered: galleryInfo.requiresSecurityQuestion
      });

      // Restituisci la password se la verifica è completata
      return {
        success: true,
        password: galleryInfo.password,
        message: 'Richiesta completata con successo'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [galleryInfo]);

  const reset = useCallback(() => {
    setGalleryInfo(null);
    setError('');
    setIsLoading(false);
  }, []);

  return {
    getGalleryInfo,
    submitPasswordRequest,
    reset,
    galleryInfo,
    isLoading,
    error,
  };
}