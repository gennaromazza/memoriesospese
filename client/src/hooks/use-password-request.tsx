import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface GalleryInfo {
  id: string;
  name: string;
  code: string;
  requiresSecurityQuestion: boolean;
  securityQuestion?: string;
  // ❌ securityAnswer rimosso - validazione ora server-side
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
      // SICUREZZA: Usa SOLO Cloud Function per metadata sicuri
      // NO FALLBACK Firestore - previene esposizione password
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('@/lib/firebase');
      
      const getGalleryMetadata = httpsCallable(functions, 'getGalleryMetadata');
      const result = await getGalleryMetadata({ galleryCode });
      
      if (!result.data) {
        throw new Error('Galleria non trovata');
      }

      const metadata = result.data as GalleryInfo;
      setGalleryInfo(metadata);
      return metadata;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

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

      // ❌ RIMOSSA validazione client-side security question
      // ✅ La validazione è ora server-side in sendGalleryPassword
      // Il server verificherà la risposta e ritornerà errore se incorretta

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
      // SICUREZZA: La password viene recuperata server-side dalla Cloud Function
      // VALIDAZIONE: Security question validata server-side (se presente)
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('@/lib/firebase');
      
      const sendPasswordEmail = httpsCallable(functions, 'sendGalleryPassword');
      
      // Costruisci URL galleria
      const baseUrl = window.location.origin;
      const basePath = import.meta.env.VITE_BASE_PATH || '';
      const galleryUrl = `${baseUrl}${basePath}/gallery/${galleryInfo.code}`;
      
      // Payload sicuro: NO password, security answer validata server-side
      await sendPasswordEmail({
        galleryId: galleryInfo.id, // Function recupera password da Firestore
        recipientEmail: params.email,
        galleryName: galleryInfo.name,
        galleryCode: galleryInfo.code,
        firstName: params.firstName,
        lastName: params.lastName,
        galleryUrl: galleryUrl,
        securityAnswer: params.securityAnswer // Validazione server-side
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