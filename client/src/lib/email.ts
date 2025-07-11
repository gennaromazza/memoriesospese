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

    // 3. Invia notifiche tramite Firebase Functions (Brevo già configurato)
    try {
      const result = await sendNewPhotosNotification({
        galleryName,
        newPhotosCount,
        uploaderName,
        galleryUrl,
        recipients: subscribers
      });

      console.log(`✅ Notifiche inviate tramite Firebase Functions a ${subscribers.length} subscribers`);
      return { 
        success: true, 
        notified: subscribers.length,
        method: 'firebase_functions',
        details: result.data 
      };

    } catch (error) {
      console.warn('⚠️ Firebase Functions non disponibili, salvo notifiche per processamento futuro:', error);
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
      return { success: true, notified: 0, method: 'queued_after_functions_error' };
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
    const normalizedEmail = email.toLowerCase();
    
    // 1. Controlla se l'utente è già iscritto
    const subscriptionsRef = collection(db, 'subscriptions');
    const existingSubscription = await getDocs(
      query(
        subscriptionsRef,
        where('galleryId', '==', galleryId),
        where('email', '==', normalizedEmail)
      )
    );

    if (!existingSubscription.empty) {
      console.log(`ℹ️ ${email} è già iscritto alle notifiche di "${galleryName}"`);
      return { success: true, alreadySubscribed: true };
    }

    // 2. Salva nuova iscrizione in Firestore
    await addDoc(subscriptionsRef, {
      galleryId,
      galleryName,
      email: normalizedEmail,
      active: true,
      subscribedAt: new Date(),
      lastNotified: null
    });

    // 3. Invia email di benvenuto (con gestione errori robusta)
    Promise.resolve().then(async () => {
      try {
        await sendWelcomeEmail(email, galleryName);
        console.log(`✅ Email di benvenuto inviata a ${email}`);
      } catch (emailError) {
        console.warn('⚠️ Email di benvenuto non inviata (Firebase Functions non disponibili)');
        // L'iscrizione è comunque riuscita, solo l'email non è stata inviata
      }
    }).catch(() => {
      // Gestione silent per evitare unhandledrejection
    });

    console.log(`✅ ${email} iscritto alle notifiche di "${galleryName}"`);
    return { success: true, alreadySubscribed: false };

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
    
    // In sviluppo, Firebase Functions non sono disponibili
    if (error.code === 'functions/internal') {
      console.log('ℹ️ Firebase Functions non disponibili in sviluppo - test simulato');
      return { 
        success: false, 
        message: 'Firebase Functions non disponibili in ambiente di sviluppo',
        developmentMode: true 
      };
    }
    
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