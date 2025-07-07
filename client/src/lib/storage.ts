/**
 * Firebase Storage Service
 * Gestisce upload e gestione file su Firebase Storage
 */

import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject, 
  listAll,
  getMetadata,
  UploadResult
} from 'firebase/storage';
import { storage } from './firebase';
import { compressImage } from './imageCompression';

export interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'waiting' | 'uploading' | 'compressing' | 'completed' | 'error';
  error?: string;
}

export interface StorageFile {
  name: string;
  url: string;
  size: number;
  contentType: string;
  createdAt: Date;
  path: string;
}

export class StorageService {
  /**
   * Upload singolo file con compressione automatica per immagini
   */
  static async uploadFile(
    file: File,
    path: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ url: string; fileName: string; size: number }> {
    try {
      let processedFile = file;
      
      // Comprimi immagini automaticamente
      if (file.type.startsWith('image/')) {
        onProgress?.({
          fileName: file.name,
          progress: 0,
          status: 'compressing'
        });
        
        processedFile = await compressImage(file);
      }

      onProgress?.({
        fileName: file.name,
        progress: 0,
        status: 'uploading'
      });

      // Genera nome file unico
      const timestamp = Date.now();
      const fileName = `${timestamp}-${file.name}`;
      const fullPath = `${path}/${fileName}`;
      
      // Upload file
      const storageRef = ref(storage, fullPath);
      const uploadResult = await uploadBytes(storageRef, processedFile);
      
      // Ottieni URL di download
      const downloadURL = await getDownloadURL(uploadResult.ref);
      
      onProgress?.({
        fileName: file.name,
        progress: 100,
        status: 'completed'
      });

      return {
        url: downloadURL,
        fileName,
        size: processedFile.size
      };
    } catch (error) {
      console.error('Errore upload file:', error);
      onProgress?.({
        fileName: file.name,
        progress: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Errore upload'
      });
      throw error;
    }
  }

  /**
   * Upload multipli con progress tracking
   */
  static async uploadMultipleFiles(
    files: File[],
    path: string,
    onProgress?: (progress: UploadProgress[]) => void
  ): Promise<Array<{ url: string; fileName: string; size: number }>> {
    try {
      const progressMap = new Map<string, UploadProgress>();
      
      // Inizializza progress
      files.forEach(file => {
        progressMap.set(file.name, {
          fileName: file.name,
          progress: 0,
          status: 'waiting'
        });
      });

      const updateProgress = () => {
        onProgress?.(Array.from(progressMap.values()));
      };

      updateProgress();

      // Upload paralleli con limite
      const maxConcurrent = 3;
      const results: Array<{ url: string; fileName: string; size: number }> = [];
      
      for (let i = 0; i < files.length; i += maxConcurrent) {
        const batch = files.slice(i, i + maxConcurrent);
        
        const batchPromises = batch.map(file => 
          this.uploadFile(file, path, (progress) => {
            progressMap.set(file.name, progress);
            updateProgress();
          })
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          const file = batch[index];
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            progressMap.set(file.name, {
              fileName: file.name,
              progress: 0,
              status: 'error',
              error: result.reason?.message || 'Errore upload'
            });
          }
        });
        
        updateProgress();
      }

      return results;
    } catch (error) {
      console.error('Errore upload multipli:', error);
      throw error;
    }
  }

  /**
   * Upload foto per galleria
   */
  static async uploadGalleryPhotos(
    files: File[],
    galleryId: string,
    onProgress?: (progress: UploadProgress[]) => void
  ): Promise<Array<{ url: string; fileName: string; size: number; contentType: string }>> {
    try {
      const path = `galleries/${galleryId}/photos`;
      const results = await this.uploadMultipleFiles(files, path, onProgress);
      
      return results.map((result, index) => ({
        ...result,
        contentType: files[index].type
      }));
    } catch (error) {
      console.error('Errore upload foto galleria:', error);
      throw error;
    }
  }

  /**
   * Upload voice memo
   */
  static async uploadVoiceMemo(
    audioBlob: Blob,
    galleryId: string,
    userId: string
  ): Promise<{ url: string; fileName: string; size: number }> {
    try {
      const timestamp = Date.now();
      const fileName = `${timestamp}-${userId}.wav`;
      const path = `voice-memos/${galleryId}/${fileName}`;
      
      const storageRef = ref(storage, path);
      const uploadResult = await uploadBytes(storageRef, audioBlob);
      const downloadURL = await getDownloadURL(uploadResult.ref);
      
      return {
        url: downloadURL,
        fileName,
        size: audioBlob.size
      };
    } catch (error) {
      console.error('Errore upload voice memo:', error);
      throw error;
    }
  }

  /**
   * Upload immagine di copertina galleria
   */
  static async uploadGalleryCover(
    file: File,
    galleryId: string
  ): Promise<{ url: string; fileName: string; size: number }> {
    try {
      // Comprimi immagine
      const compressedFile = await compressImage(file);
      
      const path = `galleries/${galleryId}/cover`;
      const fileName = `cover-${Date.now()}.jpg`;
      const fullPath = `${path}/${fileName}`;
      
      const storageRef = ref(storage, fullPath);
      const uploadResult = await uploadBytes(storageRef, compressedFile);
      const downloadURL = await getDownloadURL(uploadResult.ref);
      
      return {
        url: downloadURL,
        fileName,
        size: compressedFile.size
      };
    } catch (error) {
      console.error('Errore upload copertina galleria:', error);
      throw error;
    }
  }

  /**
   * Elimina file da Storage
   */
  static async deleteFile(path: string): Promise<void> {
    try {
      const storageRef = ref(storage, path);
      await deleteObject(storageRef);
    } catch (error) {
      console.error('Errore eliminazione file:', error);
      throw error;
    }
  }

  /**
   * Elimina tutte le foto di una galleria
   */
  static async deleteGalleryFiles(galleryId: string): Promise<void> {
    try {
      const galleryRef = ref(storage, `galleries/${galleryId}`);
      const listResult = await listAll(galleryRef);
      
      // Elimina tutti i file
      const deletePromises = listResult.items.map(item => deleteObject(item));
      await Promise.all(deletePromises);
      
      // Elimina sottocartelle ricorsivamente
      const subFolderPromises = listResult.prefixes.map(async (prefix) => {
        const subList = await listAll(prefix);
        const subDeletePromises = subList.items.map(item => deleteObject(item));
        await Promise.all(subDeletePromises);
      });
      
      await Promise.all(subFolderPromises);
    } catch (error) {
      console.error('Errore eliminazione file galleria:', error);
      throw error;
    }
  }

  /**
   * Ottieni informazioni su un file
   */
  static async getFileInfo(path: string): Promise<StorageFile | null> {
    try {
      const storageRef = ref(storage, path);
      const metadata = await getMetadata(storageRef);
      const downloadURL = await getDownloadURL(storageRef);
      
      return {
        name: metadata.name,
        url: downloadURL,
        size: metadata.size,
        contentType: metadata.contentType || 'application/octet-stream',
        createdAt: new Date(metadata.timeCreated),
        path
      };
    } catch (error) {
      console.error('Errore recupero info file:', error);
      return null;
    }
  }

  /**
   * Ottieni lista file in una cartella
   */
  static async listFiles(path: string): Promise<StorageFile[]> {
    try {
      const storageRef = ref(storage, path);
      const listResult = await listAll(storageRef);
      
      const filePromises = listResult.items.map(async (item) => {
        const metadata = await getMetadata(item);
        const downloadURL = await getDownloadURL(item);
        
        return {
          name: metadata.name,
          url: downloadURL,
          size: metadata.size,
          contentType: metadata.contentType || 'application/octet-stream',
          createdAt: new Date(metadata.timeCreated),
          path: item.fullPath
        };
      });
      
      return await Promise.all(filePromises);
    } catch (error) {
      console.error('Errore lista file:', error);
      return [];
    }
  }

  /**
   * Calcola dimensione totale di una cartella
   */
  static async getFolderSize(path: string): Promise<number> {
    try {
      const files = await this.listFiles(path);
      return files.reduce((total, file) => total + file.size, 0);
    } catch (error) {
      console.error('Errore calcolo dimensione cartella:', error);
      return 0;
    }
  }

  /**
   * Ottieni statistiche Storage per admin
   */
  static async getStorageStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    galleryCount: number;
    voiceMemoCount: number;
    averageFileSize: number;
  }> {
    try {
      // Lista tutte le gallerie
      const galleriesRef = ref(storage, 'galleries');
      const galleriesResult = await listAll(galleriesRef);
      
      let totalFiles = 0;
      let totalSize = 0;
      
      // Analizza ogni galleria
      for (const galleryRef of galleriesResult.prefixes) {
        const galleryFiles = await this.listFiles(galleryRef.fullPath);
        totalFiles += galleryFiles.length;
        totalSize += galleryFiles.reduce((sum, file) => sum + file.size, 0);
      }
      
      // Voice memos
      const voiceMemosRef = ref(storage, 'voice-memos');
      const voiceMemosResult = await listAll(voiceMemosRef);
      let voiceMemoCount = 0;
      
      for (const voiceMemoGalleryRef of voiceMemosResult.prefixes) {
        const voiceMemoFiles = await this.listFiles(voiceMemoGalleryRef.fullPath);
        voiceMemoCount += voiceMemoFiles.length;
        totalFiles += voiceMemoFiles.length;
        totalSize += voiceMemoFiles.reduce((sum, file) => sum + file.size, 0);
      }
      
      const averageFileSize = totalFiles > 0 ? totalSize / totalFiles : 0;
      
      return {
        totalFiles,
        totalSize,
        galleryCount: galleriesResult.prefixes.length,
        voiceMemoCount,
        averageFileSize
      };
    } catch (error) {
      console.error('Errore recupero statistiche storage:', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        galleryCount: 0,
        voiceMemoCount: 0,
        averageFileSize: 0
      };
    }
  }
}

export default StorageService;