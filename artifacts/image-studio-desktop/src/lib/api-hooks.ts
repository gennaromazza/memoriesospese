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
  mobileFocalPoint?: { x: number, y: number };
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
  /** Legacy fields kept for interoperability with the web editor. */
  code?: string;
  productRequirements?: Array<{ prodottoId?: string; prodottoNome?: string; prodottoNumeroFoto?: number; nome?: string; numeroFoto?: number }>;
  selectionSnapshots?: Array<{ label?: string; timestamp?: string; selectedCount?: number }>;
}

export interface Photo {
  id: string;
  galleryId: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  chapterId?: string | null;
  order: number;
  hash?: string;
  size: number;
  createdAt: string;
}

export interface Chapter {
  id: string;
  titolo: string;
  descrizione?: string;
  ordine: number;
  coverPhotoId?: string;
  coverPhotoUrl?: string;
  coverPhotoPosition?: { x: number; y: number };
}

export interface SelectionSummary {
  mode: 'like' | 'dislike';
  requiredCount: number;
  selectedCount: number;
  deadline?: string;
  locked: boolean;
  products?: any[];
  snapshots?: any[];
  unlimited?: boolean;
  enabled?: boolean;
  productRequirements?: Array<{ prodottoId?: string; prodottoNome?: string; prodottoNumeroFoto?: number }>;
}

export interface GalleryOption { id: string; name?: string; email?: string; title?: string; }
export function useClients() {
  return useQuery({ queryKey: ['clients'], queryFn: () => fetchApi<any>('/clients').then(r => r.clients || r.data || r) });
}
export function useJobs() {
  return useQuery({ queryKey: ['jobs'], queryFn: () => fetchApi<any>('/jobs').then(r => r.jobs || r.data || r) });
}
export function useProducts() {
  return useQuery({ queryKey: ['products'], queryFn: () => fetchApi<any>('/products').then(r => r.products || r.data || r) });
}
export function useSelectionResults(galleryId: string) {
  return useQuery({ queryKey: ['gallery', galleryId, 'selection-results'], queryFn: () => fetchApi<any>(`/galleries/${galleryId}/selection-results`).then(r => r.results || r), enabled: !!galleryId });
}
export function useSelectionHistory(galleryId: string) {
  return useQuery({ queryKey: ['gallery', galleryId, 'selection-history'], queryFn: () => fetchApi<any>(`/galleries/${galleryId}/history`).then(r => r.history || r), enabled: !!galleryId });
}
export function useUpdateGallerySecrets(galleryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { accessMode: 'open' | 'password' | 'pin'; password?: string | null; specialPin?: string | null }) =>
      fetchApi<{ success: boolean }>(`/galleries/${galleryId}/secrets`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gallery', galleryId] }); }
  });
}
export function useShareGallery(galleryId: string) {
  return useMutation({
    mutationFn: (data: { to: string; subject?: string; html?: string }) =>
      fetchApi<{ success: boolean; shareUrl?: string }>(`/galleries/${galleryId}/share`, { method: 'POST', body: JSON.stringify(data) }),
  });
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
    mutationFn: (data: { titolo: string; descrizione?: string }) => fetchApi<{ chapter: Chapter }>(`/galleries/${galleryId}/chapters`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gallery', galleryId] }); qc.invalidateQueries({ queryKey: ['gallery', galleryId, 'chapters'] }); }
  });
}
export function useGalleryOrganization(galleryId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['gallery', galleryId] });
    qc.invalidateQueries({ queryKey: ['gallery', galleryId, 'chapters'] });
    qc.invalidateQueries({ queryKey: ['gallery', galleryId, 'photos'] });
  };
  const mutation = <T,>(path: string, method: string = 'POST') => useMutation({
    mutationFn: (body: T) => fetchApi<{ success: boolean }>(`/galleries/${galleryId}${path}`, { method, body: JSON.stringify(body) }),
    onSuccess: refresh,
  });
  return {
    updateChapter: useMutation({ mutationFn: ({ id, ...body }: { id: string; titolo: string; descrizione: string }) =>
      fetchApi(`/galleries/${galleryId}/chapters/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), onSuccess: refresh }),
    deleteChapter: useMutation({ mutationFn: (id: string) =>
      fetchApi(`/galleries/${galleryId}/chapters/${id}`, { method: 'DELETE', body: JSON.stringify({ confirm: true }) }), onSuccess: refresh }),
    reorder: mutation<{ chapterIds: string[] }>('/chapters/reorder'),
    assign: mutation<{ photoIds: string[]; chapterId: string | null }>('/photos/assign'),
    chapterCover: useMutation({ mutationFn: ({ id, photoId, position }: { id: string; photoId: string | null; position?: { x: number; y: number } }) =>
      fetchApi(`/galleries/${galleryId}/chapters/${id}/cover`, { method: 'POST', body: JSON.stringify({ photoId, position }) }), onSuccess: refresh }),
    galleryCover: mutation<{ kind: 'desktop' | 'mobile'; photoId: string | null; position: { x: number; y: number } }>('/cover', 'PATCH'),
    refresh,
  };
}
export function useDeletePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ galleryId, photoId }: { galleryId: string, photoId: string }) => fetchApi<{ success: boolean }>(`/galleries/${galleryId}/photos/${photoId}`, { method: 'DELETE', body: JSON.stringify({ confirm: true }) }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['gallery', variables.galleryId, 'photos'] });
      qc.invalidateQueries({ queryKey: ['gallery', variables.galleryId] });
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
      enabled: r.selectionEnabled === true,
      unlimited: r.unlimitedSelection === true,
      selectedPhotoIds: r.selectedPhotoIds || [],
      products: r.products || r.productRequirements || [],
      productRequirements: r.productRequirements || r.products || [],
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
        selectionEnabled: data.enabled ?? true,
        selectionMode: data.mode,
        requiredPhotoCount: data.requiredCount,
        unlimitedSelection: data.unlimited ?? false,
        productRequirements: data.productRequirements,
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
