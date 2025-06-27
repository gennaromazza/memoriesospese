import { db } from './firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { apiRequest } from './queryClient';

interface NotificationData {
  galleryId: string;
  galleryName: string;
  newPhotosCount: number;
  uploaderName: string;
  galleryUrl: string;
}

export async function notifySubscribers(data: NotificationData): Promise<{ success: number; failed: number }> {
  try {
    // Recupera tutti i subscribers attivi per questa galleria
    const subscriptionsRef = collection(db, 'subscriptions');
    const q = query(
      subscriptionsRef,
      where('galleryId', '==', data.galleryId),
      where('active', '==', true)
    );
    
    const querySnapshot = await getDocs(q);
    const subscriberEmails = querySnapshot.docs.map(doc => doc.data().email);
    
    if (subscriberEmails.length === 0) {
      console.log('Nessun subscriber da notificare per questa galleria');
      return { success: 0, failed: 0 };
    }

    // Invia richiesta al backend per inviare le email usando apiRequest centralizzato
    const response = await apiRequest('POST', `/api/galleries/${data.galleryId}/notify`, {
      galleryName: data.galleryName,
      newPhotosCount: data.newPhotosCount,
      uploaderName: data.uploaderName,
      galleryUrl: data.galleryUrl,
      subscribers: subscriberEmails
    });

    const result = await response.json();
    console.log(`Notifiche inviate: ${result.success} successi, ${result.failed} errori`);
    return { success: result.success, failed: result.failed };
    
  } catch (error) {
    console.error('Errore nel servizio di notificazione:', error);
    return { success: 0, failed: 0 };
  }
}

export function createGalleryUrl(galleryId: string): string {
  const baseUrl = window.location.origin;
  return `${baseUrl}/gallery/${galleryId}`;
}