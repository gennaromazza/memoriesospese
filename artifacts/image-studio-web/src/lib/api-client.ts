/**
 * Client API unificato che gestisce automaticamente i fallback per hosting Netsons
 * Sostituisce le chiamate dirette fetch con gestione robusta degli errori
 */

import { createUrl } from './basePath';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

class ApiClient {
  private baseUrl: string;
  private isProduction: boolean;

  constructor() {
    this.baseUrl = '';
    this.isProduction = import.meta.env.PROD;
  }

  private async makeRequest<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T | null> {
    try {
      const url = createUrl(endpoint);
      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      if (!response.ok) {
        if (response.status === 404) {
          // In produzione, non logghiamo errori 404 per non spammare la console
          if (!this.isProduction) {
            console.warn(`Endpoint ${endpoint} non trovato (404)`);
          }
          return null;
        }

        const errorData = await response.json().catch(() => ({ error: 'Errore sconosciuto' }));
        throw new Error(errorData.error || `Errore HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.success ? data.data : data;
    } catch (error) {
      if (!this.isProduction) {
        console.warn(`Errore nella richiesta a ${endpoint}:`, error);
      }
      return null;
    }
  }

  // ==================== STATISTICS ====================

  async getPhotoStats(galleryId: string, photoId: string, userEmail?: string): Promise<{
    likesCount: number;
    commentsCount: number;
    hasUserLiked: boolean;
  }> {
    const endpoint = `/api/galleries/${galleryId}/stats/photo/${photoId}${userEmail ? `?userEmail=${encodeURIComponent(userEmail)}` : ''}`;
    const stats = await this.makeRequest(endpoint);

    // Fallback a valori predefiniti se l'API non è disponibile
    if (!stats || typeof stats !== 'object') {
      return {
        likesCount: 0,
        commentsCount: 0,
        hasUserLiked: false
      };
    }
    
    return {
      likesCount: (stats as any).likesCount || 0,
      commentsCount: (stats as any).commentsCount || 0,
      hasUserLiked: (stats as any).hasUserLiked || false
    };
  }

  // ==================== LIKES ====================

  async togglePhotoLike(galleryId: string, photoId: string, userEmail: string, userName: string): Promise<{
    action: 'added' | 'removed';
    message: string;
  } | null> {
    const endpoint = `/api/galleries/${galleryId}/likes/photo/${photoId}`;
    
    return await this.makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({ userEmail, userName })
    });
  }

  // ==================== COMMENTS ====================

  async getPhotoComments(galleryId: string, photoId: string): Promise<any[]> {
    const endpoint = `/api/galleries/${galleryId}/comments/photo/${photoId}`;
    const comments = await this.makeRequest(endpoint);
    
    if (!comments || !Array.isArray(comments)) {
      return [];
    }
    return comments;
  }

  async addPhotoComment(galleryId: string, photoId: string, content: string, userEmail: string, userName: string): Promise<any | null> {
    const endpoint = `/api/galleries/${galleryId}/comments/photo/${photoId}`;
    
    return await this.makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({ content, userEmail, userName })
    });
  }

  // ==================== VOICE MEMOS ====================

  async getRecentVoiceMemos(galleryId: string, limit: number = 10): Promise<any[]> {
    const endpoint = `/api/galleries/${galleryId}/voice-memos/recent?limit=${limit}`;
    const memos = await this.makeRequest(endpoint);
    
    return Array.isArray(memos) ? memos : [];
  }

  async uploadVoiceMemo(galleryId: string, memoData: any): Promise<any | null> {
    const endpoint = `/api/galleries/${galleryId}/voice-memos`;
    
    return await this.makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(memoData)
    });
  }

  // ==================== RECENT ACTIVITY ====================

  async getRecentComments(galleryId: string, limit: number = 10): Promise<any[]> {
    const endpoint = `/api/galleries/${galleryId}/comments/recent?limit=${limit}`;
    const comments = await this.makeRequest(endpoint);
    
    return Array.isArray(comments) ? comments : [];
  }

  async getTopLikedPhotos(galleryId: string, limit: number = 10): Promise<any[]> {
    const endpoint = `/api/galleries/${galleryId}/photos/top-liked?limit=${limit}`;
    const photos = await this.makeRequest(endpoint);
    
    return Array.isArray(photos) ? photos : [];
  }

  // ==================== GALLERY ACCESS ====================

  async getGalleryAccessInfo(galleryId: string): Promise<any | null> {
    const endpoint = `/api/galleries/${galleryId}/access-info`;
    
    return await this.makeRequest(endpoint);
  }

  async verifyGalleryAccess(galleryId: string, password?: string, securityAnswer?: string): Promise<any | null> {
    const endpoint = `/api/galleries/${galleryId}/verify-access`;
    
    return await this.makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({ password, securityAnswer })
    });
  }

  // ==================== ADMIN ====================

  async getAllGalleries(): Promise<any[]> {
    const endpoint = '/api/galleries';
    const galleries = await this.makeRequest(endpoint);
    
    return Array.isArray(galleries) ? galleries : [];
  }

  async createGallery(galleryData: any): Promise<any | null> {
    const endpoint = '/api/galleries';
    
    return await this.makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(galleryData)
    });
  }

  async updateGallery(galleryId: string, updates: any): Promise<any | null> {
    const endpoint = `/api/galleries/${galleryId}`;
    
    return await this.makeRequest(endpoint, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }

  async deleteGallery(galleryId: string): Promise<any | null> {
    const endpoint = `/api/galleries/${galleryId}`;
    
    return await this.makeRequest(endpoint, {
      method: 'DELETE'
    });
  }

  // ==================== EMAIL ====================

  async sendWelcomeEmail(email: string, galleryName: string): Promise<boolean> {
    const endpoint = '/api/send-welcome-email';
    const result = await this.makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({ email, galleryName })
    });
    
    return !!result;
  }

  async notifySubscribers(galleryId: string, notificationData: any): Promise<boolean> {
    const endpoint = `/api/galleries/${galleryId}/notify`;
    const result = await this.makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(notificationData)
    });
    
    return !!result;
  }

  // ==================== TEST EMAIL ====================

  async testEmail(): Promise<boolean> {
    const endpoint = '/api/test-email';
    const result = await this.makeRequest(endpoint, {
      method: 'POST'
    });
    
    return !!result;
  }
}

// Esporta istanza singleton
export const apiClient = new ApiClient();

// Esporta anche le funzioni per compatibilità
export const {
  getPhotoStats,
  togglePhotoLike,
  getPhotoComments,
  addPhotoComment,
  getRecentVoiceMemos,
  uploadVoiceMemo,
  getRecentComments,
  getTopLikedPhotos,
  getGalleryAccessInfo,
  verifyGalleryAccess,
  getAllGalleries,
  createGallery,
  updateGallery,
  deleteGallery,
  sendWelcomeEmail,
  notifySubscribers,
  testEmail
} = apiClient;