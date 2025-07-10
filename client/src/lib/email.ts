
/**
 * Email Service usando Firebase Cloud Functions
 * Sostituisce completamente il backend Express per l'invio email
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

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
