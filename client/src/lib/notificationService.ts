import { db } from './firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { notifyNewPhotos } from './email';

interface NotificationData {
  galleryId: string;
  galleryName: string;
  newPhotosCount: number;
  uploaderName: string;
  galleryUrl: string;
}

export async function notifySubscribers(data: NotificationData): Promise<{ success: number; failed: number }> {
  try {
    // Usa il servizio email Firebase-Only centralizzato
    const result = await notifyNewPhotos(
      data.galleryId,
      data.galleryName,
      data.uploaderName,
      data.newPhotosCount
    );

    if (result.success) {
      console.log(`✅ Notifiche inviate: ${result.notified} successi`);
      return { success: result.notified || 0, failed: 0 };
    } else {
      console.warn('⚠️ Notifiche non inviate:', result.error);
      return { success: 0, failed: 1 };
    }
    
  } catch (error) {
    console.error('❌ Errore nel servizio di notificazione:', error);
    return { success: 0, failed: 1 };
  }
}

export function createGalleryUrl(galleryId: string): string {
  const baseUrl = window.location.origin;
  return `${baseUrl}/gallery/${galleryId}`;
}