import { db } from './firebase-admin';
import { notifySubscribers } from './mailer';

// Interfaccia per i subscribers
export interface Subscriber {
  email: string;
  subscribedAt: Date;
  active: boolean;
}

// Aggiungi un subscriber a una galleria
export async function addSubscriber(galleryId: string, email: string): Promise<boolean> {
  try {
    const galleryRef = db.collection('galleries').doc(galleryId);
    const galleryDoc = await galleryRef.get();
    
    if (!galleryDoc.exists) {
      console.error(`Galleria ${galleryId} non trovata`);
      return false;
    }

    const subscribersRef = galleryRef.collection('subscribers');
    
    // Verifica se l'email è già iscritta
    const existingSubscriber = await subscribersRef.where('email', '==', email).get();
    
    if (!existingSubscriber.empty) {
      console.log(`Email ${email} già iscritta alla galleria ${galleryId}`);
      return false;
    }

    // Aggiungi il nuovo subscriber
    await subscribersRef.add({
      email,
      subscribedAt: new Date(),
      active: true
    });

    console.log(`Subscriber ${email} aggiunto alla galleria ${galleryId}`);
    return true;
  } catch (error) {
    console.error('Errore nell\'aggiunta del subscriber:', error);
    return false;
  }
}

// Rimuovi un subscriber da una galleria
export async function removeSubscriber(galleryId: string, email: string): Promise<boolean> {
  try {
    const subscribersRef = db.collection('galleries').doc(galleryId).collection('subscribers');
    const subscriberDocs = await subscribersRef.where('email', '==', email).get();
    
    if (subscriberDocs.empty) {
      console.log(`Email ${email} non trovata tra i subscribers della galleria ${galleryId}`);
      return false;
    }

    // Rimuovi tutti i documenti corrispondenti (dovrebbe essere solo uno)
    const batch = db.batch();
    subscriberDocs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    console.log(`Subscriber ${email} rimosso dalla galleria ${galleryId}`);
    return true;
  } catch (error) {
    console.error('Errore nella rimozione del subscriber:', error);
    return false;
  }
}

// Ottieni tutti i subscribers attivi di una galleria
export async function getGallerySubscribers(galleryId: string): Promise<string[]> {
  try {
    const subscribersRef = db.collection('galleries').doc(galleryId).collection('subscribers');
    const subscribersSnapshot = await subscribersRef.where('active', '==', true).get();
    
    const emails: string[] = [];
    subscribersSnapshot.forEach((doc: any) => {
      const data = doc.data();
      if (data.email) {
        emails.push(data.email);
      }
    });

    return emails;
  } catch (error) {
    console.error('Errore nel recupero dei subscribers:', error);
    return [];
  }
}

// Notifica tutti i subscribers quando vengono aggiunte nuove foto
export async function notifyGallerySubscribers(
  galleryId: string, 
  galleryName: string, 
  newPhotosCount: number
): Promise<{ success: number; failed: number }> {
  try {
    const subscribers = await getGallerySubscribers(galleryId);
    
    if (subscribers.length === 0) {
      console.log(`Nessun subscriber da notificare per la galleria ${galleryName}`);
      return { success: 0, failed: 0 };
    }

    return await notifySubscribers(galleryId, galleryName, newPhotosCount, subscribers);
  } catch (error) {
    console.error('Errore nella notifica dei subscribers:', error);
    return { success: 0, failed: subscribers.length };
  }
}

// Ottieni statistiche sui subscribers di una galleria
export async function getSubscribersStats(galleryId: string): Promise<{
  total: number;
  active: number;
  inactive: number;
}> {
  try {
    const subscribersRef = db.collection('galleries').doc(galleryId).collection('subscribers');
    const allSubscribers = await subscribersRef.get();
    const activeSubscribers = await subscribersRef.where('active', '==', true).get();
    
    return {
      total: allSubscribers.size,
      active: activeSubscribers.size,
      inactive: allSubscribers.size - activeSubscribers.size
    };
  } catch (error) {
    console.error('Errore nel recupero delle statistiche subscribers:', error);
    return { total: 0, active: 0, inactive: 0 };
  }
}