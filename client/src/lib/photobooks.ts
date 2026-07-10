/**
 * Client API per il Modulo Revisione Fotolibro.
 *
 * - Route admin: /api/photobooks/* (Firebase auth automatica via apiRequest)
 * - Route pubbliche a token: /api/photobooks/by-token/:token/* (nessuna auth)
 * - Upload pagine: body raw JPEG con Authorization esplicito (no JSON)
 */

import { apiRequest } from './queryClient';
import { createUrl } from './config';
import { auth } from './firebase';
import type {
  Photobook,
  PhotobookPage,
  PhotobookSlot,
  PhotobookChangeRequest,
  PhotobookChangeRequestStatus,
  PhotobookGalleryPhoto,
} from '@shared/photobook-types';

export type {
  Photobook,
  PhotobookPage,
  PhotobookSlot,
  PhotobookChangeRequest,
  PhotobookGalleryPhoto,
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
  data: { name?: string; currentVersion?: number },
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

export interface PrepareHashesResponse {
  total: number;
  hashed: number;
  alreadyHashed: number;
  remaining: number;
  failed: number;
}

export async function preparePhotobookHashes(
  id: string,
  limit = 40,
): Promise<PrepareHashesResponse> {
  const res = await apiRequest('POST', `/api/photobooks/${id}/prepare-hashes`, { limit });
  return json<PrepareHashesResponse>(res);
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
  data: { slots?: PhotobookSlot[]; pageNumber?: number },
): Promise<PhotobookPage> {
  const res = await apiRequest('PATCH', `/api/photobooks/${photobookId}/pages/${pageId}`, data);
  return (await json<{ page: PhotobookPage }>(res)).page;
}

export async function deletePhotobookPage(photobookId: string, pageId: string): Promise<void> {
  await apiRequest('DELETE', `/api/photobooks/${photobookId}/pages/${pageId}`);
}

export async function redetectPhotobookPage(
  photobookId: string,
  pageId: string,
): Promise<PhotobookPage> {
  const res = await apiRequest('POST', `/api/photobooks/${photobookId}/pages/${pageId}/redetect`);
  return (await json<{ page: PhotobookPage }>(res)).page;
}

export async function rematchPhotobookPage(
  photobookId: string,
  pageId: string,
): Promise<PhotobookPage> {
  const res = await apiRequest('POST', `/api/photobooks/${photobookId}/pages/${pageId}/rematch`);
  return (await json<{ page: PhotobookPage }>(res)).page;
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

export async function getPhotobookGalleryPhotosByToken(
  token: string,
): Promise<PhotobookGalleryPhoto[]> {
  const res = await fetch(createUrl(`/api/photobooks/by-token/${token}/gallery-photos`));
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return (await json<{ photos: PhotobookGalleryPhoto[] }>(res)).photos;
}

export interface PhotobookClientRequestDraft {
  pageId: string;
  slotId: string;
  type: 'replace' | 'delete' | 'edit';
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
