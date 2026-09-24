import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './api';

// Models
export interface Gallery {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'archived';
  archived: boolean;
  eventDate?: string;
  location?: string;
  description?: string;
  category?: string;
  clientIds?: string[];
  clientNames?: string[];
  jobId?: string;
  photoCount: number;
  chapterCount: number;
  coverUrl?: string;
  mobileCoverUrl?: string;
  focalPoint?: { x: number, y: number };
  headerStyle?: string;
  publicUrl?: string;
  accessMode?: 'open' | 'password' | 'pin';
  passwordEnabled: boolean;
  pinEnabled: boolean;
  specialTheme?: string;
  selectionMode?: 'like' | 'dislike';
  selectionRequiredCount?: number;
  selectionDeadline?: string;
  selectionLocked: boolean;
  updatedAt: string;
}

export interface Photo {
  id: string;
  galleryId: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  chapterId?: string;
  order: number;
  hash?: string;
  size: number;
  createdAt: string;
}

export interface Chapter {
  id: string;
  galleryId: string;
  title: string;
  order: number;
  coverPhotoId?: string;
  photoCount: number;
}

export interface SelectionSummary {
  mode: 'like' | 'dislike';
  requiredCount: number;
  selectedCount: number;
  deadline?: string;
  locked: boolean;
  products?: any[];
  snapshots?: any[];
}

// Hooks
export function useGalleries(search?: string, status?: string) {
  return useQuery({
    queryKey: ['galleries', search, status],
    queryFn: () => fetchApi<{ galleries: Gallery[] }>(`/galleries?search=${search || ''}&status=${status || ''}`).then(r => r.galleries),
    refetchInterval: 10000, // Live refresh
  });
}

export function useGallery(id: string) {
  return useQuery({
    queryKey: ['gallery', id],
    queryFn: () => fetchApi<Gallery>(`/galleries/${id}`),
    enabled: !!id && id !== 'new',
  });
}

export function useCreateGallery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Gallery>) => fetchApi<{ id: string }>('/galleries', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['galleries'] })
  });
}

export function useUpdateGallery(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Gallery>) => fetchApi<{ success: boolean }>(`/galleries/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gallery', id] });
      qc.invalidateQueries({ queryKey: ['galleries'] });
    }
  });
}

export function useDeleteGallery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchApi<{ success: boolean }>(`/galleries/${id}`, { method: 'DELETE', body: JSON.stringify({ confirm: true, permanent: true }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['galleries'] })
  });
}

export function useGalleryPhotos(galleryId: string) {
  return useQuery({
    queryKey: ['gallery', galleryId, 'photos'],
    queryFn: () => fetchApi<{ photos: Photo[] }>(`/galleries/${galleryId}/photos`).then(r => r.photos),
    enabled: !!galleryId,
  });
}

export function useGalleryChapters(galleryId: string) {
  return useQuery({
    queryKey: ['gallery', galleryId, 'chapters'],
    queryFn: () => fetchApi<{ chapters: Chapter[], order?: string[] }>(`/galleries/${galleryId}/chapters`).then(r => r.chapters),
    enabled: !!galleryId,
  });
}

export function useCreateChapter(galleryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Chapter>) => fetchApi<{ id: string }>(`/galleries/${galleryId}/chapters`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gallery', galleryId, 'chapters'] })
  });
}
export function useDeletePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ galleryId, photoId }: { galleryId: string, photoId: string }) => fetchApi<{ success: boolean }>(`/galleries/${galleryId}/photos/${photoId}`, { method: 'DELETE', body: JSON.stringify({ confirm: true }) }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['gallery', variables.galleryId, 'photos'] });
    }
  });
}

export function useCustomerSelection(galleryId: string) {
  return useQuery({
    queryKey: ['gallery', galleryId, 'selection'],
    queryFn: () => fetchApi<any>(`/galleries/${galleryId}/customer-selection`).then(r => ({
      mode: r.selectionMode,
      requiredCount: r.requiredPhotoCount || 0,
      selectedCount: r.selectedPhotoIds?.length || 0,
      deadline: r.selectionDeadline,
      locked: r.selectionLocked === true,
      products: r.products || [],
      snapshots: r.snapshots || [],
    })),
    enabled: !!galleryId,
  });
}

export function useConfigureSelection(galleryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SelectionSummary>) => fetchApi<{ success: boolean }>(`/galleries/${galleryId}/customer-selection`, {
      method: 'PUT',
      body: JSON.stringify({
        selectionEnabled: true,
        selectionMode: data.mode,
        requiredPhotoCount: data.requiredCount,
        selectionDeadline: data.deadline,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gallery', galleryId, 'selection'] });
      qc.invalidateQueries({ queryKey: ['gallery', galleryId] });
    }
  });
}

export function useUnlockSelection(galleryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fetchApi<{ success: boolean }>(`/galleries/${galleryId}/customer-selection/unlock`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gallery', galleryId, 'selection'] });
      qc.invalidateQueries({ queryKey: ['gallery', galleryId] });
    }
  });
}

export function useResetSelection(galleryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fetchApi<{ success: boolean }>(`/galleries/${galleryId}/customer-selection/reset`, { method: 'POST', body: JSON.stringify({ confirm: true }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gallery', galleryId, 'selection'] });
      qc.invalidateQueries({ queryKey: ['gallery', galleryId] });
    }
  });
}
