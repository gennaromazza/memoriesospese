import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface GalleryInfo {
  id: string;
  name: string;
  code: string;
}

interface RequestPasswordParams {
  galleryId: string;
  firstName: string;
  lastName: string;
  email: string;
  relation: string;
}

interface PasswordRequestResult {
  success: boolean;
  emailSent?: boolean;
  recipientEmail?: string;
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
      // Normalizza il codice: solo trim (Firestore query è case-sensitive)
      const normalizedCode = String(galleryCode || '').trim();
      console.log('🔍 Recupero metadata galleria per code:', normalizedCode);
      
      if (!normalizedCode) {
        throw new Error('Codice galleria non valido');
      }
      
      // SICUREZZA: Usa SOLO Cloud Function per metadata sicuri
      // NO FALLBACK Firestore - previene esposizione password
      console.log('📞 Chiamata Cloud Function getGalleryMetadata (HTTP)...');
      
      // Chiamata HTTP POST alla Cloud Function v1 con CORS
      const functionUrl = 'https://us-central1-wedding-gallery-397b6.cloudfunctions.net/getGalleryMetadata';
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          data: { galleryCode: normalizedCode } 
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const responseData = await response.json();
      console.log('✅ Risposta Cloud Function:', responseData);
      
      if (!responseData.result) {
        throw new Error('Galleria non trovata');
      }

      const metadata = responseData.result as GalleryInfo;
      setGalleryInfo(metadata);
      return metadata;
      
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

      // Invia password via email usando Firebase Function (HTTP)
      // SICUREZZA: La password viene recuperata server-side dalla Cloud Function
      
      // Costruisci URL galleria
      const baseUrl = window.location.origin;
      const basePath = import.meta.env.VITE_BASE_PATH || '';
      const galleryUrl = `${baseUrl}${basePath}/gallery/${galleryInfo.code}`;

      // CHIAMATA API LOCALE invece di Cloud Function
      // Il server Express.js ha accesso a connectors-api.replit.com
      const apiUrl = `${baseUrl}/api/email/send-gallery-password`;
      
      console.log('📧 Invio richiesta password via API locale...');
      console.log('📦 Payload:', {
        galleryId: galleryInfo.id,
        recipientEmail: params.email,
        galleryName: galleryInfo.name,
        galleryCode: galleryInfo.code,
      });
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          galleryId: galleryInfo.id,
          recipientEmail: params.email,
          galleryName: galleryInfo.name,
          galleryCode: galleryInfo.code,
          firstName: params.firstName,
          lastName: params.lastName,
          galleryUrl: galleryUrl
        })
      });

      console.log('📡 Response status:', response.status, response.statusText);

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: { message: `HTTP ${response.status}: ${response.statusText}` } };
        }
        console.error('❌ Errore risposta HTTP:', errorData);
        
        // Estrai messaggio di errore user-friendly
        const errorMessage = errorData.error?.message || `HTTP error ${response.status}`;
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('✅ Password inviata con successo:', result);

      // ✅ Salva la richiesta in Firestore SOLO se email inviata con successo
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
        createdAt: serverTimestamp()
      });

      // Ritorna successo con conferma email
      return {
        success: true,
        emailSent: true,
        recipientEmail: params.email,
        message: 'Email inviata con successo'
      };

    } catch (error) {
      console.error('❌ Submit error dettagliato:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        type: typeof error,
        stringified: JSON.stringify(error, Object.getOwnPropertyNames(error))
      });
      
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