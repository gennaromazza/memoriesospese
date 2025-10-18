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
      // Normalizza il codice: SOLO trim (NO toUpperCase, case-sensitive in DB)
      const normalizedCode = String(galleryCode || '').trim();
      console.log('🔍 Recupero metadata galleria per code:', normalizedCode);
      
      if (!normalizedCode) {
        throw new Error('Codice galleria non valido');
      }
      
      // SICUREZZA: Usa SOLO Cloud Function callable con regione us-central1
      // NO FALLBACK Firestore - previene esposizione password
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { app } = await import('@/lib/firebase');
      
      console.log('📞 Chiamata Cloud Function getGalleryMetadata (us-central1)...');
      const functionsInstance = getFunctions(app, 'us-central1');
      const getGalleryMetadata = httpsCallable(functionsInstance, 'getGalleryMetadata');
      
      // Payload con chiave esatta 'galleryCode'
      const result = await getGalleryMetadata({ galleryCode: normalizedCode });
      
      console.log('✅ Risposta Cloud Function:', result.data);
      
      if (!result.data) {
        throw new Error('Galleria non trovata');
      }

      const metadata = result.data as GalleryInfo;
      setGalleryInfo(metadata);
      return metadata;
    } catch (error: any) {
      console.error('❌ Errore getGalleryInfo:', error);
      
      // Gestione errori tipizzati Firebase Callable
      let errorMessage = 'Errore sconosciuto';
      
      // Estrai il codice errore (può essere error.code o functions/code)
      const errorCode = error?.code?.replace('functions/', '') || error?.code;
      
      switch (errorCode) {
        case 'invalid-argument':
          errorMessage = 'Codice galleria non valido';
          break;
        case 'not-found':
          errorMessage = 'Galleria non trovata';
          break;
        case 'failed-precondition':
          errorMessage = 'Verifica di sicurezza fallita. Ricarica la pagina e riprova.';
          break;
        case 'permission-denied':
          errorMessage = 'Accesso negato';
          break;
        case 'internal':
          errorMessage = 'Errore interno del server. Riprova più tardi.';
          break;
        case 'unauthenticated':
          errorMessage = 'Autenticazione richiesta';
          break;
        case 'unavailable':
          errorMessage = 'Servizio temporaneamente non disponibile. Riprova tra poco.';
          break;
        default:
          errorMessage = error?.message || 'Errore durante il recupero delle informazioni';
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
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
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { app } = await import('@/lib/firebase');
      
      const functionsInstance = getFunctions(app, 'us-central1');
      const sendPasswordEmail = httpsCallable(functionsInstance, 'sendGalleryPassword');
      
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