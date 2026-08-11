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

/** Costruisce l'URL di download Firebase per un oggetto con token noto. */
export function buildDownloadUrl(bucketName: string, storagePath: string, token: string): string {
  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/` +
    `${encodeURIComponent(storagePath)}?alt=media&token=${token}`
  );
}
