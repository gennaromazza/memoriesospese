/**
 * Hook Firebase diretto - IMPLEMENTAZIONE COMPLETA
 * Sostituisce completamente il backend Node.js/Express
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getGalleryById,
  verifyGalleryAccess,
  getGalleryPhotos,
  getTopLikedPhotos,
  togglePhotoLike,
  getPhotoLikeStatus,
  getPhotoComments,
  addPhotoComment,
  getRecentComments,
  getRecentVoiceMemos,
  addVoiceMemo,
  getAllGalleries,
  createGallery,
  updateGallery,
  deleteGallery,
  getCurrentUserEmail,
  getCurrentUserName,
  GalleryData,
  PhotoData,
  CommentData,
  VoiceMemoData
} from '@/lib/firebase-api';
import { useToast } from '@/hooks/use-toast';

// ==================== GALLERY HOOKS ====================

export function useGallery(galleryId: string) {
  return useQuery({
    queryKey: ['gallery', galleryId],
    queryFn: () => getGalleryById(galleryId),
    enabled: !!galleryId
  });
}

export function useGalleryPhotos(galleryId: string, chapterId?: string) {
  return useQuery({
    queryKey: ['gallery-photos', galleryId, chapterId],
    queryFn: () => getGalleryPhotos(galleryId, chapterId),
    enabled: !!galleryId
  });
}

export function useTopLikedPhotos(galleryId: string, limit: number = 10) {
  return useQuery({
    queryKey: ['top-liked-photos', galleryId, limit],
    queryFn: () => getTopLikedPhotos(galleryId, limit),
    enabled: !!galleryId
  });
}

// ==================== LIKES HOOKS ====================

export function usePhotoLikeStatus(galleryId: string, photoId: string, userEmail: string) {
  return useQuery({
    queryKey: ['photo-like-status', galleryId, photoId, userEmail],
    queryFn: () => getPhotoLikeStatus(galleryId, photoId, userEmail),
    enabled: !!galleryId && !!photoId && !!userEmail
  });
}

export function useTogglePhotoLike(galleryId: string, photoId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async () => {
      const userEmail = getCurrentUserEmail();
      if (!userEmail) {
        throw new Error('Devi essere autenticato per mettere like');
      }
      return togglePhotoLike(galleryId, photoId, userEmail);
    },
    onSuccess: (isLiked) => {
      // Invalida le query correlate
      queryClient.invalidateQueries({ queryKey: ['photo-like-status', galleryId, photoId] });
      queryClient.invalidateQueries({ queryKey: ['top-liked-photos', galleryId] });
      
      toast({
        title: isLiked ? "Like aggiunto" : "Like rimosso",
        description: isLiked ? "Hai messo like a questa foto" : "Hai rimosso il like da questa foto"
      });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore nell'aggiunta del like",
        variant: "destructive"
      });
    }
  });
}

// ==================== COMMENTS HOOKS ====================

export function usePhotoComments(galleryId: string, photoId: string) {
  return useQuery({
    queryKey: ['photo-comments', galleryId, photoId],
    queryFn: () => getPhotoComments(galleryId, photoId),
    enabled: !!galleryId && !!photoId
  });
}

export function useRecentComments(galleryId: string, limit: number = 10) {
  return useQuery({
    queryKey: ['recent-comments', galleryId, limit],
    queryFn: () => getRecentComments(galleryId, limit),
    enabled: !!galleryId
  });
}

export function useAddPhotoComment(galleryId: string, photoId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (text: string) => {
      const userEmail = getCurrentUserEmail();
      const userName = getCurrentUserName();
      
      if (!userEmail || !userName) {
        throw new Error('Devi essere autenticato per commentare');
      }
      
      return addPhotoComment(galleryId, photoId, text, userEmail, userName);
    },
    onSuccess: () => {
      // Invalida le query correlate
      queryClient.invalidateQueries({ queryKey: ['photo-comments', galleryId, photoId] });
      queryClient.invalidateQueries({ queryKey: ['recent-comments', galleryId] });
      
      toast({
        title: "Commento aggiunto",
        description: "Il tuo commento è stato aggiunto con successo"
      });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore nell'aggiunta del commento",
        variant: "destructive"
      });
    }
  });
}

// ==================== VOICE MEMOS HOOKS ====================

export function useRecentVoiceMemos(galleryId: string, limit: number = 10) {
  return useQuery({
    queryKey: ['recent-voice-memos', galleryId, limit],
    queryFn: () => getRecentVoiceMemos(galleryId, limit),
    enabled: !!galleryId
  });
}

export function useAddVoiceMemo(galleryId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ duration, audioUrl, unlockTime }: { duration: number; audioUrl: string; unlockTime: Date }) => {
      const userEmail = getCurrentUserEmail();
      const userName = getCurrentUserName();
      
      if (!userEmail || !userName) {
        throw new Error('Devi essere autenticato per aggiungere voice memo');
      }
      
      return addVoiceMemo(galleryId, userEmail, userName, duration, audioUrl, unlockTime);
    },
    onSuccess: () => {
      // Invalida le query correlate
      queryClient.invalidateQueries({ queryKey: ['recent-voice-memos', galleryId] });
      
      toast({
        title: "Voice memo aggiunto",
        description: "Il tuo voice memo è stato aggiunto con successo"
      });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore nell'aggiunta del voice memo",
        variant: "destructive"
      });
    }
  });
}

// ==================== ADMIN HOOKS ====================

export function useAllGalleries() {
  return useQuery({
    queryKey: ['all-galleries'],
    queryFn: getAllGalleries
  });
}

export function useCreateGallery() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: (galleryData: Omit<GalleryData, 'id' | 'createdAt' | 'updatedAt'>) => createGallery(galleryData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-galleries'] });
      toast({
        title: "Galleria creata",
        description: "La galleria è stata creata con successo"
      });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore nella creazione della galleria",
        variant: "destructive"
      });
    }
  });
}

export function useUpdateGallery() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: ({ galleryId, updates }: { galleryId: string; updates: Partial<GalleryData> }) => 
      updateGallery(galleryId, updates),
    onSuccess: (_, { galleryId }) => {
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] });
      queryClient.invalidateQueries({ queryKey: ['all-galleries'] });
      toast({
        title: "Galleria aggiornata",
        description: "La galleria è stata aggiornata con successo"
      });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore nell'aggiornamento della galleria",
        variant: "destructive"
      });
    }
  });
}

export function useDeleteGallery() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: (galleryId: string) => deleteGallery(galleryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-galleries'] });
      toast({
        title: "Galleria eliminata",
        description: "La galleria è stata eliminata con successo"
      });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore nell'eliminazione della galleria",
        variant: "destructive"
      });
    }
  });
}

// ==================== GALLERY ACCESS HOOKS ====================

export function useVerifyGalleryAccess() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: ({ galleryId, password, securityAnswer }: { galleryId: string; password?: string; securityAnswer?: string }) => 
      verifyGalleryAccess(galleryId, password, securityAnswer),
    onError: (error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore nella verifica dell'accesso",
        variant: "destructive"
      });
    }
  });
}