import imageCompression from 'browser-image-compression';

/**
 * Opzioni per la compressione delle immagini
 */
export interface ImageCompressionOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  useWebWorker?: boolean;
  preserveExif?: boolean;
}

/**
 * Opzioni predefinite per la compressione delle immagini
 */
const defaultOptions: ImageCompressionOptions = {
  maxSizeMB: 1, // Dimensione massima in MB
  maxWidthOrHeight: 1920, // Ridimensiona l'immagine a una larghezza o altezza massima di 1920px
  useWebWorker: true, // Utilizza WebWorker per non bloccare il thread principale
  preserveExif: true, // Mantiene i metadati EXIF dell'immagine
};

/**
 * Comprime un'immagine utilizzando browser-image-compression
 * @param file - Il file immagine da comprimere
 * @param customOptions - Opzioni personalizzate per la compressione
 * @returns Promise con il file compresso
 */
export async function compressImage(
  file: File,
  customOptions?: Partial<ImageCompressionOptions>
): Promise<File> {
  try {
    // Verifica se il file è un'immagine
    if (!file.type.startsWith('image/')) {
      
      return file;
    }

    // Se l'immagine è già più piccola di maxSizeMB MB, saltare la compressione
    const options = { ...defaultOptions, ...customOptions };
    if (file.size <= (options.maxSizeMB || 1) * 1024 * 1024) {
      
      return file;
    }

    
    

    const compressedFile = await imageCompression(file, options);
    
    console.log(`✅ Compressione completata: ${file.name}`);
    console.log(`📊 Dimensioni: ${(file.size / 1024).toFixed(2)} KB → ${(compressedFile.size / 1024).toFixed(2)} KB`);
    
    return compressedFile;
  } catch (error) {
    console.error('❌ Errore compressione immagine:', error);
    console.log(`⚠️ Usando file originale per: ${file.name}`);
    return file; // In caso di errore, restituisci il file originale
  }
}

/**
 * Comprime un array di file immagine
 * @param files - Array di file da comprimere
 * @param customOptions - Opzioni personalizzate per la compressione
 * @returns Promise con array di file compressi
 */
export async function compressImages(
  files: File[],
  customOptions?: Partial<ImageCompressionOptions>
): Promise<File[]> {
  try {
    const compressPromises = files.map(file => compressImage(file, customOptions));
    return await Promise.all(compressPromises);
  } catch (error) {
    
    return files; // In caso di errore, restituisci i file originali
  }
}