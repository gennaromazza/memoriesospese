/**
 * URL di download stabili per Firebase Storage, NON legati alla chiave del
 * service account.
 *
 * Perché: i signed URL (query GoogleAccessId/Signature) diventano tutti 403
 * se la chiave del service account viene ruotata o revocata (successo ad
 * agosto 2026: ~12.000 foto irraggiungibili). Il token
 * `firebaseStorageDownloadTokens` invece vive nei metadata dell'oggetto e
 * sopravvive a qualsiasi rotazione di chiave.
 *
 * Pattern identico a quello già usato in server/thumbnails.ts.
 */

import { randomUUID } from 'node:crypto';

type Bucket = import('@google-cloud/storage').Bucket;

/**
 * Salva un buffer su Storage con un download token nei metadata e ritorna
 * l'URL stabile firebasestorage.googleapis.com (?alt=media&token=...).
 */
export async function saveWithDownloadToken(
  bucket: Bucket,
  storagePath: string,
  buffer: Buffer,
  contentType: string,
  customMetadata: Record<string, string> = {}
): Promise<string> {
  const token = randomUUID();
  const file = bucket.file(storagePath);

  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType,
      metadata: {
        ...customMetadata,
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  return buildDownloadUrl(bucket.name, storagePath, token);
}

/**
 * Garantisce che un oggetto Storage esistente abbia un token
 * `firebaseStorageDownloadTokens` nei metadata (riusa quello esistente se
 * presente, altrimenti ne genera uno nuovo) e lo ritorna.
 * Ritorna null se l'oggetto non esiste.
 */
export async function ensureDownloadToken(
  bucket: Bucket,
  storagePath: string
): Promise<string | null> {
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) return null;

  const [meta] = await file.getMetadata();
  const existing = (meta.metadata as Record<string, string> | undefined)
    ?.firebaseStorageDownloadTokens;
  if (existing && String(existing).trim()) {
    // Il campo può contenere più token separati da virgola: usa il primo
    return String(existing).split(',')[0].trim();
  }

  const token = randomUUID();
  await file.setMetadata({
    metadata: { firebaseStorageDownloadTokens: token },
  });
  return token;
}

/** True se l'URL è un signed URL legato alla chiave del service account. */
export function isSignedUrl(url: string): boolean {
  return typeof url === 'string' && url.includes('GoogleAccessId');
}

/** Costruisce l'URL di download Firebase per un oggetto con token noto. */
export function buildDownloadUrl(bucketName: string, storagePath: string, token: string): string {
  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/` +
    `${encodeURIComponent(storagePath)}?alt=media&token=${token}`
  );
}
