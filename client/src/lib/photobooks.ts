/**
 * Client API per il Modulo Revisione Fotolibro.
 *
 * - Route admin: /api/photobooks/* (Firebase auth automatica via apiRequest)
 * - Route pubbliche a token: /api/photobooks/by-token/:token/* (nessuna auth)
 * - Upload pagine/snapshot: body raw JPEG (no JSON)
 */

import { apiRequest } from './queryClient';
import { createUrl } from './config';
import { auth } from './firebase';
import type {
  Photobook,
  PhotobookPage,
  PhotobookChangeRequest,
  PhotobookChangeRequestStatus,
  PhotobookGalleryPhoto,
  PhotobookGalleryChapter,
  PhotobookMarkPoint,
} from '@shared/photobook-types';

export type {
  Photobook,
  PhotobookPage,
  PhotobookChangeRequest,
  PhotobookGalleryPhoto,
  PhotobookGalleryChapter,
  PhotobookMarkPoint,
};

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// ---------- Admin ----------

export async function listPhotobooks(): Promise<Photobook[]> {
  const res = await apiRequest('GET', '/api/photobooks');
  return (await json<{ photobooks: Photobook[] }>(res)).photobooks;
}

export async function createPhotobook(data: { name: string; galleryId: string }): Promise<Photobook> {
  const res = await apiRequest('POST', '/api/photobooks', data);
  return (await json<{ photobook: Photobook }>(res)).photobook;
}

export async function getPhotobook(id: string): Promise<Photobook> {
  const res = await apiRequest('GET', `/api/photobooks/${id}`);
  return (await json<{ photobook: Photobook }>(res)).photobook;
}

export async function updatePhotobook(
  id: string,
  data: { name?: string; currentVersion?: number; locked?: boolean },
): Promise<Photobook> {
  const res = await apiRequest('PATCH', `/api/photobooks/${id}`, data);
  return (await json<{ photobook: Photobook }>(res)).photobook;
}

export async function deletePhotobook(id: string): Promise<void> {
  await apiRequest('DELETE', `/api/photobooks/${id}`);
}

export async function createPhotobookVersion(id: string, label?: string): Promise<Photobook> {
  const res = await apiRequest('POST', `/api/photobooks/${id}/versions`, { label });
  return (await json<{ photobook: Photobook }>(res)).photobook;
}

export async function listPhotobookPages(id: string, version?: number): Promise<PhotobookPage[]> {
  const qs = version ? `?version=${version}` : '';
  const res = await apiRequest('GET', `/api/photobooks/${id}/pages${qs}`);
  return (await json<{ pages: PhotobookPage[] }>(res)).pages;
}

export async function listPhotobookGalleryPhotos(id: string): Promise<PhotobookGalleryPhoto[]> {
  const res = await apiRequest('GET', `/api/photobooks/${id}/gallery-photos`);
  return (await json<{ photos: PhotobookGalleryPhoto[] }>(res)).photos;
}

/** Upload di una pagina JPEG: body binario + Authorization Bearer esplicito. */
export async function uploadPhotobookPage(params: {
  photobookId: string;
  version: number;
  pageNumber: number;
  file: File;
}): Promise<PhotobookPage> {
  const { photobookId, version, pageNumber, file } = params;
  const user = auth.currentUser;
  if (!user) throw new Error('Non autenticato');
  const token = await user.getIdToken();

  const url = createUrl(
    `/api/photobooks/${photobookId}/versions/${version}/pages?pageNumber=${pageNumber}&fileName=${encodeURIComponent(file.name)}`,
  );
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'image/jpeg',
      Authorization: `Bearer ${token}`,
    },
    body: file,
  });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return (await json<{ page: PhotobookPage }>(res)).page;
}

export async function updatePhotobookPage(
  photobookId: string,
  pageId: string,
  data: { pageNumber?: number },
): Promise<PhotobookPage> {
  const res = await apiRequest('PATCH', `/api/photobooks/${photobookId}/pages/${pageId}`, data);
  return (await json<{ page: PhotobookPage }>(res)).page;
}

export async function deletePhotobookPage(photobookId: string, pageId: string): Promise<void> {
  await apiRequest('DELETE', `/api/photobooks/${photobookId}/pages/${pageId}`);
}

export async function listPhotobookChangeRequests(): Promise<PhotobookChangeRequest[]> {
  const res = await apiRequest('GET', '/api/photobooks/requests');
  return (await json<{ requests: PhotobookChangeRequest[] }>(res)).requests;
}

export async function updatePhotobookChangeRequest(
  requestId: string,
  status: PhotobookChangeRequestStatus,
): Promise<void> {
  await apiRequest('PATCH', `/api/photobooks/requests/${requestId}`, { status });
}

export interface PhotobookLabTransferResult {
  shipment: { id: string; [key: string]: any };
  /** true se il trasferimento in background è stato avviato ora */
  started: boolean;
  /** true se era già in corso un trasferimento (nessun secondo avvio) */
  alreadyRunning: boolean;
  totalPages: number;
}

/**
 * Crea (o riusa) la spedizione laboratorio del fotolibro e avvia in background
 * il trasferimento server-side delle pagine ORIGINALI della versione corrente
 * su Google Drive. Risponde subito: l'avanzamento si segue leggendo
 * `pageTransfer` sulla spedizione (GET /api/lab-shipments/:id).
 * Idempotente: richiamandola ritrasferisce solo le pagine mancanti.
 */
export async function createPhotobookLabShipment(
  id: string,
  data: { labId?: string; descrizione?: string; expiryDays?: number; jobId?: string },
): Promise<PhotobookLabTransferResult> {
  const res = await apiRequest('POST', `/api/photobooks/${id}/lab-shipment`, data);
  return json<PhotobookLabTransferResult>(res);
}

/** Link cliente completo per un fotolibro. */
export function photobookClientLink(book: Photobook): string {
  return `${window.location.origin}/fotolibro/${book.token}`;
}

// ---------- Pubblico (token) ----------

export interface PhotobookTokenPayload {
  photobook: Photobook;
  version: number;
  pages: PhotobookPage[];
  requests: PhotobookChangeRequest[];
}

export async function getPhotobookByToken(
  token: string,
  version?: number,
): Promise<PhotobookTokenPayload> {
  const qs = version ? `?version=${version}` : '';
  const res = await fetch(createUrl(`/api/photobooks/by-token/${token}${qs}`));
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return json<PhotobookTokenPayload>(res);
}

export interface PhotobookGalleryPhotosPayload {
  photos: PhotobookGalleryPhoto[];
  chapters: PhotobookGalleryChapter[];
}

export async function getPhotobookGalleryPhotosByToken(
  token: string,
): Promise<PhotobookGalleryPhotosPayload> {
  const res = await fetch(createUrl(`/api/photobooks/by-token/${token}/gallery-photos`));
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  const data = await json<{ photos: PhotobookGalleryPhoto[]; chapters?: PhotobookGalleryChapter[] }>(res);
  return { photos: data.photos, chapters: data.chapters || [] };
}

/**
 * Cancella una richiesta già inviata (solo se il fotolibro non è bloccato).
 * `snapshotUrl` è il nuovo snapshot della pagina rigenerato senza la X
 * cancellata, applicato alle richieste rimaste sulla stessa pagina.
 */
export async function deletePhotobookRequestByToken(
  token: string,
  requestId: string,
  snapshotUrl?: string | null,
): Promise<void> {
  const res = await fetch(
    createUrl(`/api/photobooks/by-token/${token}/requests/${requestId}`),
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotUrl: snapshotUrl || null }),
    },
  );
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Upload dello snapshot JPEG di una pagina (pagina + X disegnate).
 * Ritorna l'URL Storage da allegare alle richieste della pagina.
 */
export async function uploadPhotobookSnapshot(
  token: string,
  pageId: string,
  blob: Blob,
): Promise<string> {
  const res = await fetch(
    createUrl(`/api/photobooks/by-token/${token}/pages/${pageId}/snapshot`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: blob,
    },
  );
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return (await json<{ url: string }>(res)).url;
}

export interface PhotobookClientRequestDraft {
  pageId: string;
  type: 'replace' | 'delete' | 'edit';
  markColor: string;
  markStrokes: PhotobookMarkPoint[][];
  snapshotUrl?: string | null;
  replacementPhotoId?: string;
  replacementPhotoName?: string;
  replacementPhotoThumbnailUrl?: string;
  note?: string;
}

export async function submitPhotobookRequests(
  token: string,
  requests: PhotobookClientRequestDraft[],
): Promise<{ ok: boolean; batchId: string; count: number }> {
  const res = await fetch(createUrl(`/api/photobooks/by-token/${token}/requests`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return json(res);
}
