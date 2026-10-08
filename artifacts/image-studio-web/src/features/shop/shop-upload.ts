export class ShopUploadCancelledError extends Error {
  constructor() {
    super('Caricamento annullato.');
    this.name = 'ShopUploadCancelledError';
  }
}

export class ShopUploadTransportError extends Error {
  constructor(message = 'Il caricamento della fotografia non è riuscito.') {
    super(message);
    this.name = 'ShopUploadTransportError';
  }
}

export interface ShopUploadOptions {
  file: File;
  uploadUrl: string;
  signal?: AbortSignal;
  onProgress?: (percentage: number) => void;
}

/**
 * Carica il JPG direttamente nella sessione temporanea emessa dal server: il
 * browser non scrive mai altrove e non dipende dalle regole di Storage.
 */
export function uploadShopPhoto(options: ShopUploadOptions): Promise<void> {
  if (options.signal?.aborted) return Promise.reject(new ShopUploadCancelledError());
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', cancelOnAbort);
      callback();
    };
    const cancelOnAbort = () => {
      request.abort();
      finish(() => reject(new ShopUploadCancelledError()));
    };
    options.signal?.addEventListener('abort', cancelOnAbort, { once: true });
    request.open('PUT', options.uploadUrl, true);
    request.setRequestHeader('Content-Type', 'image/jpeg');
    request.setRequestHeader('Content-Range', `bytes 0-${options.file.size - 1}/${options.file.size}`);
    request.upload.addEventListener('progress', event => {
      if (!event.lengthComputable || event.total <= 0) return;
      options.onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener('load', () => finish(() => {
      if (request.status >= 200 && request.status < 300) {
        options.onProgress?.(100);
        resolve();
        return;
      }
      reject(new ShopUploadTransportError(
        request.status === 412
          ? 'La fotografia risulta già caricata. Premi Riprova per verificarla.'
          : `Caricamento non riuscito (errore ${request.status || 'di rete'}).`,
      ));
    }));
    request.addEventListener('error', () => finish(() => reject(new ShopUploadTransportError())));
    request.addEventListener('abort', () => finish(() => reject(new ShopUploadCancelledError())));
    request.send(options.file);
  });
}

/** Controllo veloce prima di caricare: restituisce il motivo del rifiuto, oppure null se va bene. */
export function validateShopPhotoFile(file: { name: string; type: string; size: number }, maxBytes: number): string | null {
  if (!/\.jpe?g$/i.test(file.name.trim()) || file.type.toLowerCase() !== 'image/jpeg') return 'Carica soltanto fotografie JPG.';
  if (file.size <= 0) return 'La fotografia è vuota.';
  if (file.size > maxBytes) return `La fotografia supera il limite di ${Math.floor(maxBytes / (1024 * 1024))} MB.`;
  return null;
}
