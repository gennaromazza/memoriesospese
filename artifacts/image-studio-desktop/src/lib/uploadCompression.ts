import imageCompression from 'browser-image-compression';

export interface PreparedUploadImage {
  file: File;
  sourceSize: number;
  compressed: boolean;
  warning?: string;
}

/**
 * Match the gallery web uploader (GalleryManagementWorkspace): JPEG output,
 * 1920px long edge, 2MB target, compression in a worker. The web passes a
 * `quality` key too, but browser-image-compression has no such option (it uses
 * `initialQuality`, default 1), so the effective algorithm is the one below.
 * The input File is never modified.
 */
export const GALLERY_COMPRESSION_OPTIONS = {
  maxSizeMB: 2,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: 'image/jpeg',
} as const;

export async function compressGalleryUpload(file: File, signal?: AbortSignal): Promise<PreparedUploadImage> {
  try {
    const compressed = await imageCompression(file, { ...GALLERY_COMPRESSION_OPTIONS, signal });
    return {
      file: new File([compressed], file.name, {
        type: compressed.type || file.type,
        lastModified: Date.now(),
      }),
      sourceSize: file.size,
      compressed: true,
    };
  } catch (error) {
    // A pause/cancel is not a compression failure: let the queue handle it.
    if (signal?.aborted) throw error;
    console.warn('Compressione foto non riuscita; verrà caricato il file originale.', error);
    return {
      file,
      sourceSize: file.size,
      compressed: false,
      warning: 'Compressione non riuscita: caricato il file originale',
    };
  }
}

export async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}