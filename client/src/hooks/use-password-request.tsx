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
      const normalizedCode = String(galleryCode || '').trim();
      if (!normalizedCode) throw new Error('Codice galleria non valido');

      // 1️⃣ tenta la CALLABLE
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { app } = await import('@/lib/firebase');
      const functionsInstance = getFunctions(app, 'us-central1');
      const getGalleryMetadata = httpsCallable(functionsInstance, 'getGalleryMetadata');

      try {
        const res = await getGalleryMetadata({ galleryCode: normalizedCode });
        const metadata = res.data as GalleryInfo;
        if (!metadata) throw new Error('Galleria non trovata');
        setGalleryInfo(metadata);
        return metadata;
      } catch (e: any) {
        const code = e?.code?.replace('functions/', '') || e?.code || '';
        const isLikelyCors = (
          code === 'internal' ||
          /Failed to fetch|ERR_FAILED|CORS|preflight/i.test(e?.message || '')
        );

        if (!isLikelyCors) throw e;

        // 2️⃣ FALLBACK HTTP con CORS
        const resp = await fetch(
          'https://us-central1-wedding-gallery-397b6.cloudfunctions.net/getGalleryMetadataHttp',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ galleryCode: normalizedCode })
          }
        );

        if (!resp.ok) {
          if (resp.status === 404) throw new Error('Galleria non trovata');
          if (resp.status === 400) throw new Error('Codice galleria non valido');
          throw new Error('Errore interno del server. Riprova più tardi.');
        }

        const data = await resp.json() as GalleryInfo;
        setGalleryInfo(data);
        return data;
      }
    } catch (error: any) {
      const errorCode = error?.code?.replace('functions/', '') || error?.code;
      let errorMessage = error?.message || 'Errore durante il recupero delle informazioni';

      switch (errorCode) {
        case 'invalid-argument':
          errorMessage = 'Codice galleria non valido'; break;
        case 'not-found':
          errorMessage = 'Galleria non trovata'; break;
        case 'failed-precondition':
          errorMessage = 'Verifica di sicurezza fallita. Ricarica la pagina e riprova.'; break;
        case 'permission-denied':
          errorMessage = 'Accesso negato'; break;
        case 'unauthenticated':
          errorMessage = 'Autenticazione richiesta'; break;
        case 'unavailable':
          errorMessage = 'Servizio temporaneamente non disponibile. Riprova tra poco.'; break;
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
        galleryCode: galleryInfo.code, // Corretto: usa galleryInfo.code
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