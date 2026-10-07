import { PRINT_SHOP_MAX_JPEG_BYTES } from '@shared/print-shop-types';

export class PrintFileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrintFileValidationError';
  }
}
export interface InspectedJpeg {
  sha256: string;
  widthPx: number;
  heightPx: number;
}

function hasJpegExtension(name: string): boolean {
  return /\.jpe?g$/i.test(name.trim());
}

function hasJpegSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export async function sha256Hex(file: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    // Vecchi browser: fingerprint deterministico sufficiente per la UI. Il
    // backend continuerà comunque a validare gli asset dell'ordine.
    const fallbackFile = file as File;
    return `fallback-${fallbackFile.name ?? 'file'}-${file.size}-${fallbackFile.lastModified ?? 0}`;
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readImageDimensions(file: File): Promise<{ widthPx: number; heightPx: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    try {
      return { widthPx: bitmap.width, heightPx: bitmap.height };
    } finally {
      bitmap.close();
    }
  }

  return new Promise((resolve, reject) => {
    const previewUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(previewUrl);
      resolve({ widthPx: image.naturalWidth, heightPx: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(previewUrl);
      reject(new PrintFileValidationError('Il file JPG non è leggibile. Esportalo di nuovo e riprova.'));
    };
    image.src = previewUrl;
  });
}

/** Controllo reale del file: estensione, MIME, firma JPEG e decodifica immagine. */
export async function inspectJpegFile(file: File): Promise<InspectedJpeg> {
  if (!hasJpegExtension(file.name)) {
    throw new PrintFileValidationError(`${file.name}: puoi caricare solo file JPG o JPEG.`);
  }
  if (file.type && file.type !== 'image/jpeg') {
    throw new PrintFileValidationError(`${file.name}: il file non è un'immagine JPG.`);
  }
  if (file.size === 0) {
    throw new PrintFileValidationError(`${file.name}: il file è vuoto.`);
  }
  if (file.size > PRINT_SHOP_MAX_JPEG_BYTES) {
    throw new PrintFileValidationError(`${file.name}: supera il limite di 50 MB.`);
  }

  const signature = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  if (!hasJpegSignature(signature)) {
    throw new PrintFileValidationError(`${file.name}: l'estensione è JPG, ma il contenuto non è un JPEG valido.`);
  }

  const [{ widthPx, heightPx }, sha256] = await Promise.all([
    readImageDimensions(file),
    sha256Hex(file),
  ]);
  if (widthPx < 1 || heightPx < 1) {
    throw new PrintFileValidationError(`${file.name}: non riesco a leggere le dimensioni della foto.`);
  }
  return { sha256, widthPx, heightPx };
}

export function acceptedJpegLabel(): string {
  return 'Solo JPG o JPEG, massimo 50 MB per foto';
}
