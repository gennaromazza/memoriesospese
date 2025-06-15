import { notifySubscribers } from './mailer';

// Store temporaneo in memoria per i subscribers (per semplicità)
// In produzione questo sarà gestito dal client-side Firebase
const subscribersStore: { [galleryId: string]: string[] } = {};

// Simula l'aggiunta di un subscriber (il client gestirà Firebase)
export async function addSubscriber(galleryId: string, email: string): Promise<boolean> {
  try {
    if (!subscribersStore[galleryId]) {
      subscribersStore[galleryId] = [];
    }
    
    if (subscribersStore[galleryId].includes(email)) {
      console.log(`Email ${email} già iscritta alla galleria ${galleryId}`);
      return false;
    }
    
    subscribersStore[galleryId].push(email);
    console.log(`Subscriber ${email} aggiunto alla galleria ${galleryId}`);
    return true;
  } catch (error) {
    console.error('Errore nell\'aggiunta del subscriber:', error);
    return false;
  }
}

export async function removeSubscriber(galleryId: string, email: string): Promise<boolean> {
  try {
    if (!subscribersStore[galleryId]) {
      return false;
    }
    
    const index = subscribersStore[galleryId].indexOf(email);
    if (index === -1) {
      return false;
    }
    
    subscribersStore[galleryId].splice(index, 1);
    console.log(`Subscriber ${email} rimosso dalla galleria ${galleryId}`);
    return true;
  } catch (error) {
    console.error('Errore nella rimozione del subscriber:', error);
    return false;
  }
}

export async function getGallerySubscribers(galleryId: string): Promise<string[]> {
  return subscribersStore[galleryId] || [];
}

// Notifica con lista fornita dal client
export async function notifyGallerySubscribers(
  galleryId: string, 
  galleryName: string, 
  newPhotosCount: number,
  subscribersList?: string[]
): Promise<{ success: number; failed: number }> {
  try {
    const subscribers = subscribersList || subscribersStore[galleryId] || [];
    
    if (subscribers.length === 0) {
      console.log(`Nessun subscriber da notificare per la galleria ${galleryName}`);
      return { success: 0, failed: 0 };
    }

    return await notifySubscribers(galleryId, galleryName, newPhotosCount, subscribers);
  } catch (error) {
    console.error('Errore nella notifica dei subscribers:', error);
    return { success: 0, failed: 0 };
  }
}

export async function getSubscribersStats(galleryId: string): Promise<{
  total: number;
  active: number;
  inactive: number;
}> {
  const subscribers = subscribersStore[galleryId] || [];
  return {
    total: subscribers.length,
    active: subscribers.length,
    inactive: 0
  };
}