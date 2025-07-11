/**
 * Service per gestire immagini profilo utente
 * Upload su Firebase Storage con compressione automatica
 */

import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';
import { compressImage } from './imageCompression';
import { AuthService } from './auth';

export class ProfileImageService {
  /**
   * Upload immagine profilo utente
   */
  static async uploadProfileImage(userId: string, file: File): Promise<string> {
    try {
      // Comprimi l'immagine prima dell'upload
      const compressedFile = await compressImage(file, {
        maxSizeMB: 0.5, // Max 500KB per immagini profilo
        maxWidthOrHeight: 400, // Dimensione massima 400px
        useWebWorker: true
      });

      // Crea riferimento Firebase Storage
      const imageRef = ref(storage, `profile-images/${userId}/${Date.now()}-${compressedFile.name}`);
      
      // Upload file
      const snapshot = await uploadBytes(imageRef, compressedFile);
      const downloadURL = await getDownloadURL(snapshot.ref);

      // Aggiorna profilo utente con nuova immagine
      await AuthService.updateProfileImage(userId, downloadURL);

      return downloadURL;
    } catch (error) {
      console.error('Errore upload immagine profilo:', error);
      throw new Error('Errore durante il caricamento dell\'immagine profilo');
    }
  }

  /**
   * Elimina immagine profilo esistente
   */
  static async deleteProfileImage(userId: string, imageUrl: string): Promise<void> {
    try {
      // Estrai path dal URL
      const urlParts = imageUrl.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const path = `profile-images/${userId}/${fileName}`;

      // Elimina da Firebase Storage
      const imageRef = ref(storage, path);
      await deleteObject(imageRef);

      // Rimuovi URL dal profilo utente
      await AuthService.updateProfileImage(userId, '');
    } catch (error) {
      console.error('Errore eliminazione immagine profilo:', error);
      throw new Error('Errore durante l\'eliminazione dell\'immagine profilo');
    }
  }

  /**
   * Genera URL immagine profilo placeholder
   */
  static getPlaceholderImageUrl(displayName: string): string {
    const initials = displayName
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&size=128&background=8FA68E&color=ffffff&bold=true`;
  }

  /**
   * Ottieni URL immagine profilo (con fallback)
   */
  static getProfileImageUrl(profileImageUrl?: string, displayName?: string): string {
    if (profileImageUrl) {
      return profileImageUrl;
    }
    
    return this.getPlaceholderImageUrl(displayName || 'User');
  }
}

export default ProfileImageService;