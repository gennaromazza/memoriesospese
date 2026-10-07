export interface ResumablePrintUploadOptions {
  file: File;
  uploadUrl: string;
  storagePath: string;
  orderId: string;
  assetId: string;
  ownerUid: string;
  sha256: string;
  requiredMetadata?: Record<string, string>;
  signal?: AbortSignal;
  onProgress?: (percentage: number) => void;
}

export class PrintUploadCancelledError extends Error {
  constructor() {
    super('Caricamento annullato.');
    this.name = 'PrintUploadCancelledError';
  }
}

export class PrintUploadTransportError extends Error {
  constructor(message = 'Il caricamento della fotografia non è riuscito.') {
    super(message);
    this.name = 'PrintUploadTransportError';
  }
}

/**
 * Carica il JPG direttamente nella sessione temporanea emessa dal backend.
 * La sessione è già vincolata al percorso Firebase Storage preparato per
 * l'ordine, quindi il browser non dipende dalle Storage Rules per la scrittura.
 */
export function uploadPrintFileResumable(options: ResumablePrintUploadOptions): Promise<void> {
  if (options.signal?.aborted) return Promise.reject(new PrintUploadCancelledError());

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
      finish(() => reject(new PrintUploadCancelledError()));
    };

    options.signal?.addEventListener('abort', cancelOnAbort, { once: true });
    request.open('PUT', options.uploadUrl, true);
    request.setRequestHeader('Content-Type', 'image/jpeg');
    request.setRequestHeader('Content-Range', `bytes 0-${options.file.size - 1}/${options.file.size}`);
    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      options.onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener('load', () => finish(() => {
      if (request.status >= 200 && request.status < 300) {
        options.onProgress?.(100);
        resolve();
        return;
      }
      reject(new PrintUploadTransportError(
        request.status === 412
          ? 'La fotografia risulta già caricata. Premi Riprova per verificarla.'
          : `Caricamento non riuscito (errore ${request.status || 'di rete'}).`,
      ));
    }));
    request.addEventListener('error', () => finish(() => reject(new PrintUploadTransportError())));
    request.addEventListener('abort', () => finish(() => reject(new PrintUploadCancelledError())));
    request.send(options.file);
  });
}
