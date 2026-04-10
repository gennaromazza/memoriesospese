import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import { serverTimestamp } from 'firebase/firestore';
import { compressImage, generateThumbnail } from './imageCompression';

export interface UploadProgressInfo {
  file: File;
  progress: number;
  state: 'running' | 'paused' | 'error' | 'success' | 'waiting' | 'retry' | 'canceled';
  uploadedBytes: number;
  totalBytes: number;
  attempt?: number;
}

export interface UploadedPhoto {
  name: string;
  url: string;
  size: number;
  contentType: string;
  createdAt: any;
  thumbnailUrl?: string;
  contentHash?: string;
}

/**
 * Calcola un fingerprint SHA-256 del file usando:
 * - Primi 128KB del contenuto
 * - Dimensione del file (come extra entropy)
 * Abbastanza veloce anche per batch di centinaia di file, e praticamente
 * immune a collisioni per foto reali.
 */
export async function computeFileHash(file: File): Promise<string> {
  const SAMPLE_SIZE = 128 * 1024;
  const slice = file.slice(0, SAMPLE_SIZE);
  const contentBuffer = await slice.arrayBuffer();
  const sizeBuffer = new ArrayBuffer(8);
  new DataView(sizeBuffer).setFloat64(0, file.size);
  const combined = new Uint8Array(contentBuffer.byteLength + sizeBuffer.byteLength);
  combined.set(new Uint8Array(contentBuffer), 0);
  combined.set(new Uint8Array(sizeBuffer), contentBuffer.byteLength);
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface UploadSummary {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  waiting: number;
  avgProgress: number;
  overallProgress: number;
  totalSize: number;
  uploadedSize: number;
}

// Costanti
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const UPLOAD_TIMEOUT_MS = 60000;
const BULK_THRESHOLD = 50; // >50 file = modalità bulk (salta thumbnail, concorrenza maggiore)
const PROGRESS_THROTTLE_MS = 400; // Aggiorna UI al massimo ogni 400ms

/**
 * Carica un singolo file su Firebase Storage con supporto per i ritentativi automatici
 */
export const uploadSinglePhoto = async (
  galleryId: string,
  file: File,
  progressCallback?: (progress: UploadProgressInfo) => void,
  attempt: number = 1,
  skipThumbnail: boolean = false
): Promise<UploadedPhoto> => {
  return new Promise(async (resolve, reject) => {
    try {
      // Comprimi l'immagine
      let compressedFile: File;
      try {
        compressedFile = await compressImage(file);
      } catch {
        compressedFile = file;
      }

      if (!compressedFile.name || !compressedFile.type || compressedFile.size === undefined) {
        compressedFile = new File([compressedFile], file.name, {
          type: compressedFile.type || file.type,
          lastModified: file.lastModified
        });
      }

      const safeFileName = (compressedFile.name || file.name).replace(/[#$]/g, '_');
      const fileId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const storagePath = `galleries/${galleryId}/${fileId}-${safeFileName}`;

      // Calcola hash del contenuto per rilevamento duplicati anche con nomi diversi
      let contentHash: string | undefined;
      try {
        contentHash = await computeFileHash(file);
      } catch {
        // Non bloccante: se fallisce, il controllo duplicati sarà solo per nome
      }

      if (progressCallback) {
        progressCallback({ file: compressedFile, progress: 0, state: 'running', uploadedBytes: 0, totalBytes: compressedFile.size, attempt });
      }

      if (!storage) throw new Error('Firebase Storage non configurato correttamente');

      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, compressedFile);

      const timeoutId = setTimeout(() => {
        console.warn(`⏰ Timeout upload per ${file.name}`);
        uploadTask.cancel();
      }, UPLOAD_TIMEOUT_MS);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (progressCallback) {
            progressCallback({
              file,
              progress,
              state: snapshot.state as UploadProgressInfo['state'],
              uploadedBytes: snapshot.bytesTransferred,
              totalBytes: snapshot.totalBytes,
              attempt
            });
          }
        },
        async (error) => {
          clearTimeout(timeoutId);
          if (attempt < MAX_RETRY_ATTEMPTS) {
            if (progressCallback) progressCallback({ file, progress: 0, state: 'retry', uploadedBytes: 0, totalBytes: file.size, attempt });
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            try {
              resolve(await uploadSinglePhoto(galleryId, file, progressCallback, attempt + 1, skipThumbnail));
            } catch (e) { reject(e); }
          } else {
            reject(error);
          }
        },
        async () => {
          try {
            clearTimeout(timeoutId);
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

            // Thumbnail: salta in modalità bulk (velocizza enormemente il caricamento)
            let thumbnailUrl: string | undefined;
            if (!skipThumbnail) {
              try {
                const thumbFile = await generateThumbnail(file);
                const thumbPath = `thumbnails/${galleryId}/${fileId}-thumb-${safeFileName}`;
                const thumbRef = ref(storage, thumbPath);
                const thumbTask = uploadBytesResumable(thumbRef, thumbFile);
                await new Promise<void>((res, rej) => {
                  thumbTask.on('state_changed', null,
                    (err) => { console.warn('⚠️ Thumbnail upload error:', err); rej(err); },
                    () => res()
                  );
                });
                thumbnailUrl = await getDownloadURL(thumbTask.snapshot.ref);
              } catch {
                // thumbnail non critica: fallback su url principale
              }
            }

            const photoData: UploadedPhoto = {
              name: safeFileName,
              url: downloadUrl,
              thumbnailUrl,
              size: file.size,
              contentType: file.type,
              createdAt: serverTimestamp(),
              contentHash,
            };

            if (progressCallback) {
              progressCallback({ file, progress: 100, state: 'success', uploadedBytes: file.size, totalBytes: file.size, attempt });
            }

            resolve(photoData);
          } catch (error) {
            clearTimeout(timeoutId);
            reject(error);
          }
        }
      );
    } catch (uploadError: any) {
      if (attempt < MAX_RETRY_ATTEMPTS) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        try {
          resolve(await uploadSinglePhoto(galleryId, file, progressCallback, attempt + 1, skipThumbnail));
        } catch (e) { reject(e); }
      } else {
        reject(uploadError);
      }
    }
  });
};

export const calculateUploadSummary = (progressMap: { [filename: string]: UploadProgressInfo }): UploadSummary => {
  const summary: UploadSummary = {
    total: 0, completed: 0, failed: 0, inProgress: 0, waiting: 0,
    avgProgress: 0, overallProgress: 0, totalSize: 0, uploadedSize: 0
  };
  const entries = Object.values(progressMap);
  if (entries.length === 0) return summary;
  summary.total = entries.length;
  let totalProgress = 0;
  entries.forEach(entry => {
    summary.totalSize += entry.totalBytes;
    summary.uploadedSize += entry.uploadedBytes;
    switch (entry.state) {
      case 'success': summary.completed++; totalProgress += 100; break;
      case 'error': summary.failed++; break;
      case 'running': case 'retry': summary.inProgress++; totalProgress += entry.progress; break;
      case 'waiting': summary.waiting++; break;
    }
  });
  summary.avgProgress = totalProgress / summary.total;
  summary.overallProgress = totalProgress / summary.total;
  return summary;
};

/**
 * Carica più file con concorrenza adattiva, throttle UI, e callback progressivo per salvataggio Firestore
 * 
 * @param onPhotoCompleted - Callback chiamata appena ogni foto è caricata su Storage.
 *   Permette di salvare su Firestore in modo progressivo senza aspettare la fine di tutto.
 */
export const uploadPhotos = async (
  galleryId: string,
  files: File[],
  concurrency: number = 3,
  progressCallback?: (info: { [filename: string]: UploadProgressInfo }) => void,
  summaryCallback?: (summary: UploadSummary) => void,
  onPhotoCompleted?: (photo: UploadedPhoto) => Promise<void>
): Promise<UploadedPhoto[]> => {
  const isBulk = files.length > BULK_THRESHOLD;

  // Concorrenza adattiva: più upload simultanei per batch grandi
  const adaptiveConcurrency = concurrency > 0
    ? Math.min(concurrency, 5)
    : files.length > 100 ? 4
    : files.length > 50  ? 3
    : 2;

  const progressMap: { [filename: string]: UploadProgressInfo } = {};
  const uploadedPhotos: UploadedPhoto[] = [];
  let successfulUploads = 0;
  let failedUploads = 0;

  // Throttle: accumula gli aggiornamenti e li invia al massimo ogni PROGRESS_THROTTLE_MS
  let lastProgressUpdate = 0;
  let pendingProgressUpdate = false;
  const flushProgress = () => {
    pendingProgressUpdate = false;
    lastProgressUpdate = Date.now();
    if (progressCallback) progressCallback({ ...progressMap });
    if (summaryCallback) summaryCallback(calculateUploadSummary(progressMap));
  };
  const throttledUpdate = () => {
    const now = Date.now();
    if (now - lastProgressUpdate >= PROGRESS_THROTTLE_MS) {
      flushProgress();
    } else if (!pendingProgressUpdate) {
      pendingProgressUpdate = true;
      setTimeout(flushProgress, PROGRESS_THROTTLE_MS - (now - lastProgressUpdate));
    }
  };

  // Inizializza progress map
  files.forEach((file, index) => {
    progressMap[`${index}-${file.name}`] = {
      file, progress: 0, state: 'waiting', uploadedBytes: 0, totalBytes: file.size
    };
  });
  throttledUpdate();

  const queue = files.map((f, i) => ({ file: f, index: i }));
  const activeUploads = new Map<string, Promise<any>>();

  const startNext = () => {
    while (queue.length > 0 && activeUploads.size < adaptiveConcurrency) {
      const item = queue.shift()!;
      const { file, index } = item;
      const key = `${index}-${file.name}`;

      progressMap[key] = { file, progress: 0, state: 'running', uploadedBytes: 0, totalBytes: file.size };

      const p = uploadSinglePhoto(
        galleryId,
        file,
        (info) => {
          progressMap[key] = info;
          throttledUpdate();
        },
        1,
        isBulk // skipThumbnail in bulk mode
      ).then(async (photoData) => {
        successfulUploads++;
        uploadedPhotos.push(photoData);
        activeUploads.delete(key);
        // Callback progressivo: permette al chiamante di salvare subito su Firestore
        if (onPhotoCompleted) {
          try { await onPhotoCompleted(photoData); } catch (e) { console.warn('⚠️ onPhotoCompleted error:', e); }
        }
        startNext(); // avvia il prossimo appena si libera uno slot
      }).catch((error) => {
        failedUploads++;
        progressMap[key] = { file, progress: 0, state: 'error', uploadedBytes: 0, totalBytes: file.size };
        activeUploads.delete(key);
        console.error(`❌ Upload fallito: ${file.name}`, error);
        throttledUpdate();
        startNext();
      });

      activeUploads.set(key, p);
    }
  };

  startNext();

  // Aspetta che tutti gli upload attivi finiscano
  const waitForAll = () => new Promise<void>((resolve) => {
    const check = () => {
      if (activeUploads.size === 0 && queue.length === 0) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });

  await waitForAll();
  flushProgress(); // Aggiornamento finale garantito

  if (isBulk) {
    console.log(`📦 Modalità bulk (${files.length} file): thumbnail saltate per velocità. Saranno generate al prossimo accesso.`);
  }
  console.log(`📈 Upload completato: ${successfulUploads} successi, ${failedUploads} errori su ${files.length} file`);

  return uploadedPhotos;
};
