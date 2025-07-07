/**
 * Client API unificato che gestisce automaticamente i fallback per hosting Netsons
 * Sostituisce le chiamate dirette fetch con gestione robusta degli errori
 */

// Firebase diretto - nessuna API REST necessaria
import { 
  getGalleryById,
  verifyGalleryAccess,
  getGalleryPhotos,
  getTopLikedPhotos,
  getPhotoStats,
  togglePhotoLike,
  addPhotoComment,
  getPhotoComments,
  getRecentComments,
  getRecentVoiceMemos,
  addVoiceMemo,
  checkVoiceMemoUnlocks
} from './firebase-api';

export const apiClient = {
  galleries: {
    getById: getGalleryById,
    verifyAccess: verifyGalleryAccess,
    getPhotos: getGalleryPhotos,
    getTopLiked: getTopLikedPhotos,
    getStats: getPhotoStats,
  },
  photos: {
    toggleLike: togglePhotoLike,
    addComment: addPhotoComment,
    getComments: getPhotoComments,
  },
  voiceMemos: {
    getRecent: getRecentVoiceMemos,
    add: addVoiceMemo,
    checkUnlocks: checkVoiceMemoUnlocks,
  },
  comments: {
    getRecent: getRecentComments,
  }
};