/**
 * Tipi TypeScript rigorosi per sostituire i tipi 'any' problematici
 * Fornisce type safety completa per tutta l'applicazione
 */

import { SecurityQuestionType } from './schema';

// ==================== FIREBASE TYPES ====================

export interface FirebaseTimestamp {
  seconds: number;
  nanoseconds: number;
  toDate(): Date;
}

export type FirebaseDocument<T> = T & {
  id: string;
  createdAt: FirebaseTimestamp;
  updatedAt?: FirebaseTimestamp;
};

// ==================== GALLERY TYPES ====================

export interface GalleryData {
  id: string;
  name: string;
  code: string;
  date: string;
  location: string;
  description?: string;
  password: string;
  coverImageUrl?: string;
  youtubeUrl?: string;
  photoCount: number;
  active: boolean;
  requiresSecurityQuestion?: boolean;
  securityQuestionType?: SecurityQuestionType;
  securityQuestionCustom?: string;
  securityAnswer?: string;
  createdAt: FirebaseTimestamp;
  updatedAt?: FirebaseTimestamp;
}

// ==================== PHOTO TYPES ====================

export interface PhotoData {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  galleryId: string;
  uploadedBy: 'admin' | 'guest';
  uploaderName?: string;
  uploaderEmail?: string;
  chapterId?: string;
  chapterPosition?: number;
  createdAt: FirebaseTimestamp;
}

export interface ChapterData {
  id: string;
  title: string;
  description?: string;
  position: number;
  photoCount: number;
}

export interface PhotoUploadMetadata {
  file: File;
  folderPath?: string;
  chapterId?: string;
  chapterPosition?: number;
}

// ==================== CHAPTER ORGANIZATION ====================

export interface ChapterStructure {
  id: string;
  title: string;
  description?: string;
  position: number;
  photos: PhotoData[];
}

export interface PhotoWithChapterInfo extends PhotoData {
  chapterTitle?: string;
  chapterPosition?: number;
}

// ==================== USER TYPES ====================

export interface UserData {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  profileImageUrl?: string;
  createdAt: FirebaseTimestamp;
  lastLoginAt?: FirebaseTimestamp;
}

export interface AdminUser extends UserData {
  isAdmin: true;
  permissions: AdminPermission[];
}

export type AdminPermission = 
  | 'gallery_create'
  | 'gallery_edit'
  | 'gallery_delete'
  | 'user_manage'
  | 'analytics_view';

// ==================== INTERACTION TYPES ====================

export interface LikeData {
  id: string;
  itemId: string;
  itemType: 'photo' | 'voice_memo';
  galleryId: string;
  userEmail: string;
  userName: string;
  createdAt: FirebaseTimestamp;
}

export interface CommentData {
  id: string;
  itemId: string;
  itemType: 'photo' | 'voice_memo';
  galleryId: string;
  userEmail: string;
  userName: string;
  content: string;
  createdAt: FirebaseTimestamp;
}

export interface VoiceMemoData {
  id: string;
  galleryId: string;
  guestName: string;
  audioUrl: string;
  message?: string;
  unlockDate?: string;
  fileName: string;
  fileSize: number;
  duration?: number;
  isUnlocked: boolean;
  createdAt: FirebaseTimestamp;
}

// ==================== REQUEST TYPES ====================

export interface PasswordRequestData {
  id: string;
  galleryId: string;
  firstName: string;
  lastName: string;
  email: string;
  relation: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: FirebaseTimestamp;
}

export interface SubscriberData {
  id: string;
  galleryId: string;
  email: string;
  name?: string;
  createdAt: FirebaseTimestamp;
}

// ==================== ANALYTICS TYPES ====================

export interface GalleryStats {
  photoCount: number;
  totalLikes: number;
  totalComments: number;
  totalVoiceMemos: number;
  uniqueVisitors: number;
  totalSubscribers: number;
}

export interface InteractionStats {
  likesCount: number;
  commentsCount: number;
  hasUserLiked: boolean;
}

export interface AdminDashboardStats {
  totalGalleries: number;
  totalPhotos: number;
  totalUsers: number;
  totalInteractions: number;
  recentActivity: ActivityEntry[];
}

export interface ActivityEntry {
  id: string;
  type: 'photo_upload' | 'comment' | 'like' | 'gallery_create' | 'user_register';
  galleryId?: string;
  galleryName?: string;
  userName: string;
  userEmail: string;
  description: string;
  createdAt: FirebaseTimestamp;
}

// ==================== FORM TYPES ====================

export interface GalleryFormData {
  name: string;
  date: string;
  location: string;
  description?: string;
  password: string;
  coverImageUrl?: string;
  youtubeUrl?: string;
  requiresSecurityQuestion?: boolean;
  securityQuestionType?: SecurityQuestionType;
  securityQuestionCustom?: string;
  securityAnswer?: string;
}

export interface UserFormData {
  name: string;
  email: string;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export interface CommentFormData {
  content: string;
  userEmail: string;
  userName: string;
}

export interface VoiceMemoFormData {
  guestName: string;
  message?: string;
  unlockDate?: string;
  audioBlob: Blob;
}

// ==================== API RESPONSE TYPES ====================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiError {
  error: string;
  message?: string;
  statusCode?: number;
  code?: string;
}

// ==================== UPLOAD TYPES ====================

export interface UploadProgressInfo {
  file: File;
  progress: number;
  state: 'waiting' | 'running' | 'paused' | 'error' | 'success' | 'retry' | 'canceled';
  uploadedBytes: number;
  totalBytes: number;
  attempt?: number;
  error?: string;
}

export interface UploadSummary {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  waiting: number;
  avgProgress: number;
  overallProgress: number;
  totalSize: number;
  uploadedSize: number;
}

export interface UploadedPhoto {
  name: string;
  url: string;
  size: number;
  contentType: string;
  createdAt: FirebaseTimestamp;
  thumbnailUrl?: string;
}

// ==================== UTILITY TYPES ====================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = 
  Pick<T, Exclude<keyof T, Keys>> & 
  { [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>> }[Keys];

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

// ==================== ERROR TYPES ====================

export interface ErrorDetails {
  code?: string;
  statusCode?: number;
  context?: string;
  metadata?: Record<string, unknown>;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

// ==================== NAVIGATION TYPES ====================

export interface NavigationItem {
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
  isActive?: boolean;
  requiredRole?: 'admin' | 'user';
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

// ==================== THEME TYPES ====================

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeConfig {
  mode: ThemeMode;
  primaryColor: string;
  accentColor: string;
}

// ==================== SEARCH TYPES ====================

export interface SearchResult {
  id: string;
  type: 'gallery' | 'photo' | 'user';
  title: string;
  description?: string;
  thumbnailUrl?: string;
  relevanceScore: number;
}

export interface SearchFilters {
  type?: 'gallery' | 'photo' | 'user';
  dateRange?: {
    from: Date;
    to: Date;
  };
  location?: string;
  tags?: string[];
}