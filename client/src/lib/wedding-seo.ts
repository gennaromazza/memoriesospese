import { apiRequest } from './queryClient';
import { createUrl } from './config';
import type {
  PublicWeddingStory,
  PublicWeddingStoryPreview,
  WeddingSeoStory,
  WeddingStoryEditorContext,
  WeddingVendorReview,
} from '@shared/wedding-seo-types';

async function responseJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

export function isWeddingJobType(jobType?: string): boolean {
  const normalized = String(jobType || '').trim().toLowerCase();
  return normalized === 'matrimonio' || normalized === 'wedding';
}

export const WEDDING_PHOTO_PAGE_SIZE = 60;

// Non usare mai l'originale come fallback nella griglia editoriale: per le
// foto legacy senza miniatura mostriamo un segnaposto mentre il workspace
// avvia la generazione best-effort delle thumbnail.
const MISSING_THUMBNAIL =
  'data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22160%22 viewBox=%220 0 160 160%22%3E%3Crect width=%22160%22 height=%22160%22 fill=%22%23f1f1ee%22/%3E%3Cpath d=%22M42 112l25-29 17 18 13-14 22 25H42z%22 fill=%22%23b7bcb3%22/%3E%3Ccircle cx=%2259%22 cy=%2260%22 r=%2210%22 fill=%22%23b7bcb3%22/%3E%3C/svg%3E';

export function weddingPhotoPreview(photo: { thumbnailUrl?: string; url: string }): string {
  return photo.thumbnailUrl || MISSING_THUMBNAIL;
}

export function visibleWeddingPhotos<T extends { position?: number }>(photos: T[], count: number): T[] {
  return [...photos]
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER))
    .slice(0, Math.max(0, count));
}

export async function getWeddingStoryEditor(galleryId: string): Promise<WeddingStoryEditorContext> {
  const response = await apiRequest('GET', `/api/wedding-seo/gallery/${encodeURIComponent(galleryId)}`);
  return responseJson<WeddingStoryEditorContext>(response);
}

export async function saveWeddingStory(
  galleryId: string,
  payload: Partial<WeddingSeoStory> & { status: 'draft' | 'published' },
): Promise<WeddingSeoStory> {
  const response = await apiRequest('PUT', `/api/wedding-seo/gallery/${encodeURIComponent(galleryId)}`, payload);
  const data = await responseJson<{ story: WeddingSeoStory }>(response);
  return data.story;
}

export async function saveWeddingStorySelection(
  galleryId: string,
  selectedPhotoIds: string[],
  coverPhotoId?: string,
): Promise<{ selectedPhotoIds: string[]; coverPhotoId?: string }> {
  const response = await apiRequest(
    'PUT',
    `/api/wedding-seo/gallery/${encodeURIComponent(galleryId)}/selection`,
    { selectedPhotoIds, coverPhotoId },
  );
  return responseJson<{ selectedPhotoIds: string[]; coverPhotoId?: string }>(response);
}

export async function generateWeddingStoryDraft(
  galleryId: string,
  selectedSourceIds: string[],
  selectedPhotoIds: string[],
): Promise<Pick<WeddingSeoStory, 'title' | 'excerpt' | 'story' | 'seoTitle' | 'seoDescription'> & {
  vendorReviews: WeddingVendorReview[];
}> {
  const response = await apiRequest(
    'POST',
    `/api/wedding-seo/gallery/${encodeURIComponent(galleryId)}/generate`,
    { selectedSourceIds, selectedPhotoIds },
  );
  const data = await responseJson<{
    draft: Pick<WeddingSeoStory, 'title' | 'excerpt' | 'story' | 'seoTitle' | 'seoDescription'>;
    vendorReviews?: WeddingVendorReview[];
  }>(response);
  return { ...data.draft, vendorReviews: data.vendorReviews || [] };
}

export async function getPublicWeddingStory(slug: string): Promise<PublicWeddingStory | null> {
  const response = await fetch(createUrl(`/api/wedding-seo/public/${encodeURIComponent(slug)}`));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Impossibile caricare la storia');
  return responseJson<PublicWeddingStory>(response);
}

export async function getPublicWeddingStoryPreviews(limit = 24): Promise<PublicWeddingStoryPreview[]> {
  const response = await fetch(createUrl(`/api/wedding-seo/public?limit=${Math.min(Math.max(limit, 1), 50)}`));
  if (!response.ok) throw new Error('Impossibile caricare le storie');
  const data = await responseJson<{ stories: PublicWeddingStoryPreview[] }>(response);
  return data.stories;
}
