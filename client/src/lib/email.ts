/**
 * Email Service usando Firebase Cloud Functions
 * Sostituisce completamente il backend Express per l'invio email
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from './firebase';
import { collection, getDocs, query, where, addDoc } from 'firebase/firestore';

const functions = getFunctions();

export interface EmailNotificationData {
  galleryName: string;
  newPhotosCount: number;
  uploaderName: string;
  galleryUrl: string;
  recipients: string[];
}

export interface GalleryPasswordData {
  recipientEmail: string;
  galleryName: string;
  galleryCode: string;
  galleryPassword?: string;
}

// Cloud Functions per email
export const testEmailConfiguration = httpsCallable(functions, 'testEmailConfiguration');
export const sendNewPhotosNotification = httpsCallable(functions, 'sendNewPhotosNotification');
export const sendGalleryPassword = httpsCallable(functions, 'sendGalleryPassword');
export const sendWelcomeEmail = httpsCallable(functions, 'sendWelcomeEmail');

/**
 * Notifica automatica quando vengono caricate nuove foto
 */
export async function notifyNewPhotos(galleryId: string, galleryName: string, uploaderName: string, newPhotosCount: number) {
  try {
    console.log(`🔔 Iniziando notifica per ${newPhotosCount} nuove foto in "${galleryName}"`);

    // 1. Recupera tutti i subscribers della galleria
    const subscriptionsRef = collection(db, 'subscriptions');
    const q = query(
      subscriptionsRef,
      where('galleryId', '==', galleryId),
      where('active', '==', true)
    );

    const snapshot = await getDocs(q);
    const subscribers = snapshot.docs.map(doc => doc.data().email);

    if (subscribers.length === 0) {
      console.log('📭 Nessun subscriber trovato per questa galleria');
      return { success: true, notified: 0 };
    }

    // 2. Crea URL galleria
    const galleryUrl = `${window.location.origin}/gallery/${galleryId}`;

    // 3. Invia notifiche tramite Brevo API
    try {
      const brevoApiKey = import.meta.env.VITE_BREVO_API_KEY;
      if (!brevoApiKey) {
        console.warn('⚠️ VITE_BREVO_API_KEY non configurata, salvo notifiche per processamento futuro');
        // Fallback: salva in Firestore per processamento futuro
        const notificationQueue = collection(db, 'emailQueue');
        const queueData = {
          type: 'new_photos_notification',
          galleryId,
          galleryName,
          newPhotosCount,
          uploaderName,
          galleryUrl,
          recipients: subscribers,
          status: 'pending',
          createdAt: new Date()
        };
        await addDoc(notificationQueue, queueData);
        return { success: true, notified: 0, method: 'queued' };
      }

      // Invia tramite Brevo API
      const emailData = {
        sender: {
          name: "Wedding Gallery",
          email: "noreply@gennaromazzacane.it"
        },
        to: subscribers.map(email => ({ email })),
        subject: `Nuove foto in "${galleryName}"`,
        htmlContent: `
          <h2>Nuove foto aggiunte alla galleria!</h2>
          <p><strong>${uploaderName}</strong> ha aggiunto <strong>${newPhotosCount}</strong> nuove foto alla galleria <strong>"${galleryName}"</strong>.</p>
          <p><a href="${galleryUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Vedi le foto</a></p>
          <p>Grazie per essere iscritto alle notifiche!</p>
        `
      };

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': brevoApiKey
        },
        body: JSON.stringify(emailData)
      });

      if (response.ok) {
        console.log(`✅ Notifiche inviate tramite Brevo a ${subscribers.length} subscribers`);
        return { 
          success: true, 
          notified: subscribers.length,
          method: 'brevo',
          message: 'Notifiche inviate tramite Brevo'
        };
      } else {
        throw new Error(`Brevo API error: ${response.status}`);
      }

    } catch (error) {
      console.error('❌ Errore invio tramite Brevo:', error);
      // Fallback: salva in Firestore
      const notificationQueue = collection(db, 'emailQueue');
      const queueData = {
        type: 'new_photos_notification',
        galleryId,
        galleryName,
        newPhotosCount,
        uploaderName,
        galleryUrl,
        recipients: subscribers,
        status: 'pending',
        createdAt: new Date(),
        error: error.message
      };
      await addDoc(notificationQueue, queueData);
      return { success: true, notified: 0, method: 'queued_after_error' };
    }

  } catch (error) {
    console.error('❌ Errore invio notifiche:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Iscrivi utente alle notifiche di una galleria
 */
export async function subscribeToGallery(galleryId: string, galleryName: string, email: string) {
  try {
    // 1. Aggiungi subscription a Firestore
    const subscriptionsRef = collection(db, 'subscriptions');
    await addDoc(subscriptionsRef, {
      galleryId,
      galleryName,
      email: email.toLowerCase(),
      active: true,
      subscribedAt: new Date(),
      lastNotified: null
    });

    // 2. Invia email di benvenuto tramite Brevo
    try {
      const brevoApiKey = import.meta.env.VITE_BREVO_API_KEY;
      if (brevoApiKey) {
        const emailData = {
          sender: {
            name: "Wedding Gallery",
            email: "noreply@gennaromazzacane.it"
          },
          to: [{ email: email }],
          subject: `Benvenuto nella galleria "${galleryName}"`,
          htmlContent: `
            <h2>Benvenuto nella galleria "${galleryName}"!</h2>
            <p>Grazie per esserti iscritto alle notifiche della galleria <strong>"${galleryName}"</strong>.</p>
            <p>Riceverai una email ogni volta che verranno aggiunte nuove foto.</p>
            <p>Grazie per far parte dei nostri momenti speciali!</p>
            <hr>
            <p><small>Se non vuoi più ricevere queste notifiche, puoi disiscriverti in qualsiasi momento.</small></p>
          `
        };

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': brevoApiKey
          },
          body: JSON.stringify(emailData)
        });

        if (response.ok) {
          console.log(`✅ Email di benvenuto inviata tramite Brevo a ${email}`);
        } else {
          throw new Error(`Brevo API error: ${response.status}`);
        }
      } else {
        console.warn('⚠️ VITE_BREVO_API_KEY non configurata per email di benvenuto');
      }
    } catch (emailError) {
      console.warn('⚠️ Impossibile inviare email di benvenuto tramite Brevo:', emailError);
      // L'iscrizione è comunque riuscita, solo l'email non è stata inviata
    }

    console.log(`✅ ${email} iscritto alle notifiche di "${galleryName}"`);
    return { success: true };

  } catch (error) {
    console.error('❌ Errore iscrizione:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Test sistema email
 */
export async function testEmailSystem() {
  try {
    const result = await testEmailConfiguration({
      testRecipient: 'gennaro.mazzacane@gmail.com'
    });

    console.log('✅ Test email inviato:', result.data);
    return result.data;

  } catch (error) {
    console.error('❌ Errore test email:', error);
    throw error;
  }
}


export class EmailService {
  /**
   * Invia notifica di nuove foto caricate
   */
  static async sendNewPhotosNotification(data: EmailNotificationData): Promise<boolean> {
    try {
      const sendNotification = httpsCallable(functions, 'sendNewPhotosNotification');
      const result = await sendNotification(data);
      return (result.data as any)?.success || false;
    } catch (error) {
      console.error('Errore invio notifica nuove foto:', error);
      return false;
    }
  }

  /**
   * Invia password/codice di accesso galleria
   */
  static async sendGalleryPassword(data: GalleryPasswordData): Promise<boolean> {
    try {
      const sendPassword = httpsCallable(functions, 'sendGalleryPassword');
      const result = await sendPassword(data);
      return (result.data as any)?.success || false;
    } catch (error) {
      console.error('Errore invio password galleria:', error);
      return false;
    }
  }

  /**
   * Test configurazione email
   */
  static async testEmailConfiguration(): Promise<boolean> {
    try {
      const testEmail = httpsCallable(functions, 'testEmailConfiguration');
      const result = await testEmail({
        testRecipient: 'gennaro.mazzacane@gmail.com'
      });
      return (result.data as any)?.success || false;
    } catch (error) {
      console.error('Errore test configurazione email:', error);
      return false;
    }
  }

  /**
   * Invia email di benvenuto per nuova iscrizione
   */
  static async sendWelcomeEmail(email: string, galleryName: string): Promise<boolean> {
    try {
      const sendWelcome = httpsCallable(functions, 'sendWelcomeEmail');
      const result = await sendWelcome({
        recipientEmail: email,
        galleryName
      });
      return (result.data as any)?.success || false;
    } catch (error) {
      console.error('Errore invio email benvenuto:', error);
      return false;
    }
  }
}