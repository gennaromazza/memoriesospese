import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import { serverTimestamp } from 'firebase/firestore';

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
}

export interface UploadSummary {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  waiting: number;
  avgProgress: number;
  totalSize: number;
  uploadedSize: number;
}

// Costanti per la configurazione
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const DEFAULT_CONCURRENCY = 6; // Upload paralleli
const CHUNK_SIZE = 200; // Numero di file da processare in un chunk (aumentato per gestire gallery di 800+ foto)

/**
 * Carica un singolo file su Firebase Storage con supporto per i ritentativi automatici
 * @param galleryId ID della galleria 
 * @param file File da caricare
 * @param progressCallback Callback per il progresso dell'upload
 * @param attempt Tentativo corrente (per ritentativi)
 * @returns Promise con i dati della foto caricata
 */
export const uploadSinglePhoto = async (
  galleryId: string,
  file: File,
  progressCallback?: (progress: UploadProgressInfo) => void,
  attempt: number = 1
): Promise<UploadedPhoto> => {
  return new Promise((resolve, reject) => {
    // Utilizza un identificatore univoco per evitare collisioni di nomi
    const safeFileName = file.name.replace(/[#$]/g, '_'); // Caratteri problematici in Firebase Storage
    const fileId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const storagePath = `galleries/${galleryId}/${fileId}-${safeFileName}`;

    // Notifica lo stato iniziale
    if (progressCallback) {
      progressCallback({
        file,
        progress: 0,
        state: 'running',
        uploadedBytes: 0,
        totalBytes: file.size,
        attempt
      });
    }

    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        // Calcola e riporta il progresso
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (progressCallback) {
          progressCallback({
            file,
            progress,
            state: snapshot.state as 'running' | 'paused' | 'error' | 'success' | 'waiting' | 'retry' | 'canceled',
            uploadedBytes: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
            attempt
          });
        }
      },
      async (error) => {
        

        // Gestione automatica dei ritentativi
        if (attempt < MAX_RETRY_ATTEMPTS) {
          if (progressCallback) {
            progressCallback({
              file,
              progress: 0,
              state: 'retry',
              uploadedBytes: 0,
              totalBytes: file.size,
              attempt
            });
          }

          // Attendi un po' prima di riprovare
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));

          try {
            // Ritenta il caricamento
            const result = await uploadSinglePhoto(galleryId, file, progressCallback, attempt + 1);
            resolve(result);
          } catch (retryError) {
            reject(retryError);
          }
        } else {
          // Troppi tentativi falliti
          reject(error);
        }
      },
      async () => {
        try {
          // Upload completato con successo, ottieni l'URL di download
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

          const photoData: UploadedPhoto = {
            name: safeFileName,
            url: downloadUrl,
            size: file.size,
            contentType: file.type,
            createdAt: serverTimestamp()
          };

          // Notifica che l'upload è stato completato con successo
          if (progressCallback) {
            progressCallback({
              file,
              progress: 100,
              state: 'success',
              uploadedBytes: file.size,
              totalBytes: file.size,
              attempt
            });
          }

          resolve(photoData);
        } catch (error) {
          
          reject(error);
        }
      }
    );
  });
};

/**
 * Calcola un riepilogo dello stato di avanzamento degli upload
 * @param progressMap Mappa dei progressi di upload
 * @returns Riepilogo dello stato di avanzamento
 */
export const calculateUploadSummary = (progressMap: { [filename: string]: UploadProgressInfo }): UploadSummary => {
  const summary: UploadSummary = {
    total: 0,
    completed: 0,
    failed: 0,
    inProgress: 0,
    waiting: 0,
    avgProgress: 0,
    totalSize: 0,
    uploadedSize: 0
  };

  const entries = Object.values(progressMap);
  if (entries.length === 0) return summary;

  summary.total = entries.length;

  let totalProgress = 0;

  entries.forEach(entry => {
    summary.totalSize += entry.totalBytes;
    summary.uploadedSize += entry.uploadedBytes;

    switch (entry.state) {
      case 'success':
        summary.completed++;
        totalProgress += 100;
        break;
      case 'error':
        summary.failed++;
        break;
      case 'running':
      case 'retry':
        summary.inProgress++;
        totalProgress += entry.progress;
        break;
      case 'waiting':
        summary.waiting++;
        break;
      default:
        break;
    }
  });

  summary.avgProgress = totalProgress / summary.total;

  return summary;
};

/**
 * Carica più file contemporaneamente con controllo della concorrenza e gestione ottimizzata della memoria
 * @param galleryId ID della galleria
 * @param files Array di file da caricare
 * @param concurrency Numero massimo di upload simultanei
 * @param progressCallback Callback per il progresso degli upload
 * @param summaryCallback Callback per il riepilogo dello stato di avanzamento
 * @returns Promise con array di dati delle foto caricate
 */
export const uploadPhotos = async (
  galleryId: string,
  files: File[],
  concurrency: number = DEFAULT_CONCURRENCY,
  progressCallback?: (info: { [filename: string]: UploadProgressInfo }) => void,
  summaryCallback?: (summary: UploadSummary) => void
): Promise<UploadedPhoto[]> => {
  // Adatta la concorrenza in base al numero di file
  const adaptiveConcurrency = files.length > 400 
    ? Math.min(8, concurrency) // Aumenta per volumi elevati
    : files.length > 200 
      ? concurrency 
      : Math.max(3, concurrency - 2); // Riduce per piccoli volumi

  

  // Per tenere traccia del progresso di tutti i file
  const progressMap: { [filename: string]: UploadProgressInfo } = {};

  // Timestamp di inizio per statistiche
  const startTime = Date.now();

  // Inizializza il progress map
  files.forEach((file, index) => {
    const uniqueKey = `${index}-${file.name}`;
    progressMap[uniqueKey] = {
      file,
      progress: 0,
      state: 'waiting', // All files start in waiting state
      uploadedBytes: 0,
      totalBytes: file.size
    };
  });

  // Funzione che aggiorna il progress map e chiama i callback
  const updateProgress = (info: UploadProgressInfo, fileIndex: number) => {
    const uniqueKey = `${fileIndex}-${info.file.name}`;
    progressMap[uniqueKey] = info;

    if (progressCallback) {
      progressCallback({...progressMap});
    }

    if (summaryCallback) {
      const summary = calculateUploadSummary(progressMap);
      summaryCallback(summary);
    }
  };

  // Divide i file in chunk per gestire meglio la memoria
  const uploadedPhotos: UploadedPhoto[] = [];
  const totalFiles = files.length;

  // Statistiche per monitorare le prestazioni
  let totalUploadTime = 0;
  let successfulUploads = 0;
  let failedUploads = 0;

  // Elabora i file in chunk per gestire meglio la memoria
  for (let chunkStart = 0; chunkStart < totalFiles; chunkStart += CHUNK_SIZE) {
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, totalFiles);
    

    const fileChunk = files.slice(chunkStart, chunkEnd);
    const queue = [...fileChunk];
    const activeUploads = new Map();

    // Timestamp di inizio per questo chunk
    const chunkStartTime = Date.now();

    while (queue.length > 0 || activeUploads.size > 0) {
      // Avvia nuovi upload fino al limite di concorrenza
      while (queue.length > 0 && activeUploads.size < adaptiveConcurrency) {
        const file = queue.shift()!;
        const fileIndex = chunkStart + fileChunk.indexOf(file);

        // Aggiorna lo stato prima di avviare l'upload
        updateProgress({
          file,
          progress: 0,
          state: 'running',
          uploadedBytes: 0,
          totalBytes: file.size
        }, fileIndex);

        const uploadPromise = uploadSinglePhoto(
          galleryId, 
          file,
          (progress) => updateProgress(progress, fileIndex)
        )
        .then(photoData => {
          uploadedPhotos.push(photoData);
          activeUploads.delete(file.name);
          // Incrementa il contatore dei successi
          successfulUploads++;
          return photoData;
        })
        .catch(error => {
          
          updateProgress({
            file,
            progress: 0,
            state: 'error',
            uploadedBytes: 0,
            totalBytes: file.size
          }, fileIndex);
          activeUploads.delete(file.name);
          // Incrementa il contatore degli errori
          failedUploads++;
          // Non blocchiamo il processo complessivo per errori su singoli file
          return null;
        });

        activeUploads.set(file.name, uploadPromise);
      }

      // Attendi che almeno un upload finisca prima di continuare
      if (activeUploads.size > 0) {
        await Promise.race(activeUploads.values());
      }
    }

    // Calcola le statistiche per questo chunk
    const chunkEndTime = Date.now();
    const chunkDuration = chunkEndTime - chunkStartTime;
    totalUploadTime += chunkDuration;

    // Calcola la velocità di upload per questo chunk
    const chunkFiles = fileChunk.length;
    const filesPerSecond = (chunkFiles / (chunkDuration / 1000)).toFixed(2);

    

    // Libera memoria dopo ogni chunk
    if (chunkEnd < totalFiles) {
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Calcola le statistiche finali
  const endTime = Date.now();
  const totalDuration = (endTime - startTime) / 1000; // in secondi
  const averageSpeed = (successfulUploads / totalDuration).toFixed(2);

  
  
  
  
  
  
  
  

  // Filtra eventuali null (file che hanno fallito l'upload)
  return uploadedPhotos.filter(Boolean) as UploadedPhoto[];
};