import { z } from "zod";

// Gallery validation schema for Firebase
export const insertGallerySchema = z.object({
  name: z.string().min(3, "Il nome deve contenere almeno 3 caratteri"),
  code: z.string().min(3, "Il codice deve contenere almeno 3 caratteri").regex(/^[a-z0-9-]+$/, "Il codice può contenere solo lettere minuscole, numeri e trattini"),
  password: z.string().min(4, "La password deve contenere almeno 4 caratteri"),
  date: z.string().min(1, "La data è obbligatoria"),
  location: z.string().min(1, "Il luogo è obbligatorio"),
});

export type InsertGallery = z.infer<typeof insertGallerySchema>;

// Gallery interface for Firebase documents
export interface Gallery {
  id: string;
  name: string;
  code: string;
  password: string;
  date: string;
  location: string;
  description?: string;
  coverImageUrl?: string;
  youtubeUrl?: string;
  photoCount: number;
  active: boolean;
  createdAt: any; // Firebase Timestamp
  updatedAt?: any; // Firebase Timestamp
}

// Photo schema
export interface Photo {
  id: string;
  name: string;
  url: string;
  size: number;
  contentType: string;
  createdAt: any;
}

// Password Request validation schema for Firebase
export const insertPasswordRequestSchema = z.object({
  galleryId: z.string().min(1, "Gallery ID è obbligatorio"),
  firstName: z.string().min(1, "Nome è obbligatorio"),
  lastName: z.string().min(1, "Cognome è obbligatorio"),
  email: z.string().email("Email non valida"),
  relation: z.string().min(1, "Relazione è obbligatoria"),
  status: z.string().min(1, "Status è obbligatorio"),
});

export type InsertPasswordRequest = z.infer<typeof insertPasswordRequestSchema>;

// Password Request interface for Firebase documents
export interface PasswordRequest {
  id: string;
  galleryId: string;
  firstName: string;
  lastName: string;
  email: string;
  relation: string;
  status: string;
  createdAt: any; // Firebase Timestamp
}

export const insertVoiceMemoSchema = z.object({
  galleryId: z.string().min(1),
  guestName: z.string().min(1),
  audioUrl: z.string().url(),
  message: z.string().optional(),
  unlockDate: z.string().nullish(),
  fileName: z.string().min(1),
  fileSize: z.number().positive(),
  duration: z.number().positive().optional(),
});

export type InsertVoiceMemo = z.infer<typeof insertVoiceMemoSchema>;

export interface VoiceMemo {
  id: string;
  galleryId: string;
  guestName: string;
  audioUrl: string;
  message?: string;
  unlockDate?: string; // ISO string date
  fileName: string;
  fileSize: number;
  duration?: number; // in seconds
  isUnlocked: boolean;
  createdAt: any; // Firebase Timestamp
}

// Like validation schema
export const insertLikeSchema = z.object({
  itemId: z.string().min(1, "Item ID è obbligatorio"),
  itemType: z.enum(["photo", "voice_memo"]),
  galleryId: z.string().min(1, "Gallery ID è obbligatorio"),
  userEmail: z.string().email("Email non valida"),
  userName: z.string().min(1, "Nome utente è obbligatorio"),
});

export type InsertLike = z.infer<typeof insertLikeSchema>;

// Like interface
export interface Like {
  id: string;
  itemId: string;
  itemType: 'photo' | 'voice_memo';
  galleryId: string;
  userEmail: string;
  userName: string;
  createdAt: any; // Firebase Timestamp
}

// Comment validation schema
export const insertCommentSchema = z.object({
  itemId: z.string().min(1, "Item ID è obbligatorio"),
  itemType: z.enum(["photo", "voice_memo"]),
  galleryId: z.string().min(1, "Gallery ID è obbligatorio"),
  userEmail: z.string().email("Email non valida"),
  userName: z.string().min(1, "Nome utente è obbligatorio"),
  content: z.string().min(1, "Il commento non può essere vuoto").max(500, "Il commento non può superare i 500 caratteri"),
});

export type InsertComment = z.infer<typeof insertCommentSchema>;

// Comment interface
export interface Comment {
  id: string;
  itemId: string;
  itemType: 'photo' | 'voice_memo';
  galleryId: string;
  userEmail: string;
  userName: string;
  content: string;
  createdAt: any; // Firebase Timestamp
}

// Interaction stats interface
export interface InteractionStats {
  likesCount: number;
  commentsCount: number;
  hasUserLiked: boolean;
}
