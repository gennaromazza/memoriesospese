import {
  ref,
  uploadBytesResumable,
  type UploadMetadata,
  type UploadTask,
} from 'firebase/storage';
import { storage } from '@/lib/firebase';

export interface ResumablePrintUploadOptions {
  file: File;
  storagePath: string;
  orderId: string;
  assetId: string;
  ownerUid: string;
  sha256: string;
  requiredMetadata?: Record<string, string>;
  signal?: AbortSignal;
  onProgress?: (percentage: number) => void;
  maxAttempts?: number;
}

export class PrintUploadCancelledError extends Error {
  constructor() {
    super('Caricamento annullato.');
    this.name = 'PrintUploadCancelledError';
  }
}

function uploadOnce(
  options: ResumablePrintUploadOptions,
  attempt: number,
): Promise<void> {
  const metadata: UploadMetadata = {
    contentType: 'image/jpeg',
    cacheControl: 'private,max-age=0,no-store',
    customMetadata: {
      ...(options.requiredMetadata ?? {}),
      ownerUid: options.ownerUid,
      orderId: options.orderId,
      assetId: options.assetId,
      sha256: options.sha256,
      originalFileName: options.file.name,
      uploadAttempt: String(attempt),
    },
  };
  const task = uploadBytesResumable(ref(storage, options.storagePath), options.file, metadata);

  return new Promise((resolve, reject) => {
    let settled = false;
    const cancelOnAbort = () => task.cancel();
    options.signal?.addEventListener('abort', cancelOnAbort, { once: true });

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', cancelOnAbort);
      callback();
    };

    task.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes <= 0) return;
        options.onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      },
      (error) => finish(() => {
        if (options.signal?.aborted || error.code === 'storage/canceled') {
          reject(new PrintUploadCancelledError());
          return;
        }
        reject(error);
      }),
      () => finish(resolve),
    );
  });
}

function isRetryableStorageError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return true;
  const code = typeof error.code === 'string' ? error.code : '';
  return ![
    'storage/unauthorized',
    'storage/invalid-argument',
    'storage/object-not-found',
    'storage/quota-exceeded',
    'storage/canceled',
  ].includes(code);
}

/**
 * Firebase usa upload resumable a chunk. In più riproviamo fino a tre volte
 * gli errori di rete temporanei, mantenendo visibile il progresso nella coda.
 */
export async function uploadPrintFileResumable(options: ResumablePrintUploadOptions): Promise<void> {
  const attempts = Math.max(1, options.maxAttempts ?? 3);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (options.signal?.aborted) throw new PrintUploadCancelledError();
    try {
      await uploadOnce(options, attempt);
      options.onProgress?.(100);
      return;
    } catch (error) {
      lastError = error;
      if (error instanceof PrintUploadCancelledError || !isRetryableStorageError(error) || attempt === attempts) {
        throw error;
      }
      const retryDelayMs = Math.min(750 * 2 ** (attempt - 1), 3000);
      await new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(resolve, retryDelayMs);
        options.signal?.addEventListener('abort', () => {
          window.clearTimeout(timeoutId);
          reject(new PrintUploadCancelledError());
        }, { once: true });
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Caricamento non riuscito.');
}

export function cancelUploadTask(task: UploadTask): void {
  task.cancel();
}
