import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface GalleryInfo {
  id: string;
  name: string;
  code: string;
  requiresSecurityQuestion: boolean;
  securityQuestion?: string;
  securityAnswer?: string; // Solo per validazione client-side security question
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
  emailSent?: boolean;
  recipientEmail?: string;
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
      
      // Verifica più robusta per requiresSecurityQuestion
      const hasSecurityQuestion = galleryData.requiresSecurityQuestion === true && 
                                 galleryData.securityQuestionType && 
                                 galleryData.securityAnswer;
      
      const info: GalleryInfo = {
        id: galleryId,
        name: galleryData.name,
        code: galleryData.code || galleryCode,
        requiresSecurityQuestion: hasSecurityQuestion,
        securityQuestion: hasSecurityQuestion ? getSecurityQuestionText(galleryData) : undefined,
        securityAnswer: hasSecurityQuestion ? galleryData.securityAnswer : undefined
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
      if (!galleryInfo) {
        throw new Error('Informazioni galleria non disponibili');
      }

      // Se la galleria richiede una domanda di sicurezza e non è stata fornita la risposta
      if (galleryInfo.requiresSecurityQuestion && !params.securityAnswer) {
        setIsLoading(false);
        return {
          success: false,
          requiresSecurityQuestion: true,
          securityQuestion: galleryInfo.securityQuestion,
          message: 'Risposta alla domanda di sicurezza richiesta'
        };
      }

      // Se è stata fornita una risposta alla domanda di sicurezza, verificala
      if (galleryInfo.requiresSecurityQuestion && params.securityAnswer) {
        const correctAnswer = galleryInfo.securityAnswer?.toLowerCase().trim();
        const providedAnswer = params.securityAnswer.toLowerCase().trim();
        
        if (providedAnswer !== correctAnswer) {
          throw new Error('Risposta alla domanda di sicurezza non corretta');
        }
      }

      // Salva la richiesta nel database
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

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

      // Invia password via email usando Firebase Function
      // IMPORTANTE: La password viene recuperata server-side dalla Cloud Function
      // Il client NON conosce mai la password per motivi di sicurezza
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('@/lib/firebase');
      
      const sendPasswordEmail = httpsCallable(functions, 'sendGalleryPassword');
      
      // Costruisci URL galleria
      const baseUrl = window.location.origin;
      const basePath = import.meta.env.VITE_BASE_PATH || '';
      const galleryUrl = `${baseUrl}${basePath}/gallery/${galleryInfo.code}`;
      
      // NON inviamo la password - la Cloud Function la recupera da Firestore
      await sendPasswordEmail({
        galleryId: galleryInfo.id, // La function usa questo per recuperare la password
        recipientEmail: params.email,
        galleryName: galleryInfo.name,
        galleryCode: galleryInfo.code,
        firstName: params.firstName,
        lastName: params.lastName,
        galleryUrl: galleryUrl
      });

      // Ritorna successo con conferma email
      return {
        success: true,
        emailSent: true,
        recipientEmail: params.email,
        message: 'Email inviata con successo'
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