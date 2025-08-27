import { z } from "zod";

// Security Question Types
export enum SecurityQuestionType {
  LOCATION = 'location',
  MONTH = 'month', 
  CUSTOM = 'custom'
}

// Gallery validation schema for Firebase
export const insertGallerySchema = z.object({
  name: z.string().min(3, "Il nome deve contenere almeno 3 caratteri"),
  code: z.string().min(3, "Il codice deve contenere almeno 3 caratteri").regex(/^[a-z0-9-]+$/, "Il codice può contenere solo lettere minuscole, numeri e trattini"),
  password: z.string().min(4, "La password deve contenere almeno 4 caratteri"),
  date: z.string().min(1, "La data è obbligatoria"),
  location: z.string().min(1, "Il luogo è obbligatorio"),
  // Security Question fields
  requiresSecurityQuestion: z.boolean().optional(),
  securityQuestionType: z.nativeEnum(SecurityQuestionType).optional(),
  securityQuestionCustom: z.string().optional(),
  securityAnswer: z.string().optional(),
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
  // Security Question fields
  requiresSecurityQuestion?: boolean;
  securityQuestionType?: SecurityQuestionType;
  securityQuestionCustom?: string;
  securityAnswer?: string;
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
  userEmail?: string;
  userProfileImageUrl?: string;
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
  userProfileImageUrl?: string;
  content: string;
  text: string; // Alias for content for backward compatibility
  createdAt: any; // Firebase Timestamp
}

// Interaction stats interface
export interface InteractionStats {
  likesCount: number;
  commentsCount: number;
  hasUserLiked: boolean;
}

// ====== QUESTIONARIO SYSTEM TYPES ======

// Role type for bride/groom
export type Role = "bride" | "groom";

// Question key type (fixed q1-q10)
export type QuestionKey = `q${1|2|3|4|5|6|7|8|9|10}`;

// FAQ Set interface
export interface FaqSet {
  id: string;
  title: string;
  active: boolean;
  version: number;
  questions: Array<{
    key: QuestionKey;
    text: string;
    type: "text" | "textarea";
  }>;
  createdAt: number; // Unix timestamp
  updatedAt: number;
  createdBy?: string; // admin email
  updatedBy?: string; // admin email
}

// FAQ Set validation schema
export const insertFaqSetSchema = z.object({
  title: z.string().min(3, "Il titolo deve contenere almeno 3 caratteri"),
  questions: z.array(z.object({
    key: z.string().regex(/^q[1-9]|q10$/, "Chiave domanda non valida"),
    text: z.string().min(1, "Il testo della domanda è obbligatorio").max(200, "Massimo 200 caratteri"),
    type: z.enum(["text", "textarea"]).default("textarea")
  })).length(10, "Devono essere esattamente 10 domande")
});

export type InsertFaqSet = z.infer<typeof insertFaqSetSchema>;

// Questionnaire Token (stored separately for security)
export interface QuestionnaireToken {
  id: string; // tokenId
  tokenHash: string; // SHA-256 hash
  galleryId: string;
  questionnaireId: string;
  role: Role;
  expiresAt: number; // Unix timestamp
  revoked?: boolean;
  usedAt?: number; // Unix timestamp when first used
  createdAt: number;
}

// Questionnaire main document
export interface Questionnaire {
  id: string;
  galleryId: string;
  faqSetId: string;
  faqVersion: number; // version snapshot
  enabled: boolean;
  tokens: Record<Role, {
    tokenId: string;
    url: string;
    createdAt: number;
    expiresAt: number;
    revoked?: boolean;
  }>;
  status: Record<Role, {
    startedAt?: number;
    completedAt?: number;
    progress?: number; // 0-100
    lastQuestionKey?: QuestionKey;
  }>;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  updatedBy?: string;
}

// Answer Draft (work in progress)
export interface AnswerDraft {
  id: string; // role (bride/groom)
  galleryId: string;
  questionnaireId: string;
  role: Role;
  answers: Partial<Record<QuestionKey, string>>;
  version: number; // optimistic locking
  updatedAt: number;
  completed?: boolean;
}

// Final Answers (submitted)
export interface AnswerSet {
  id: string; // role (bride/groom)
  galleryId: string;
  questionnaireId: string;
  role: Role;
  answers: Record<QuestionKey, string>;
  status: "submitted";
  completedAt: number;
  version: number;
}

// Couple information (extension to Gallery)
export interface CoupleInfo {
  brideName: string;
  groomName: string;
  weddingDate: string; // ISO date string
  emailBride?: string;
  emailGroom?: string;
}

// Extended Gallery interface with questionnaire fields
export interface GalleryWithQuestionnaire extends Gallery {
  couple?: CoupleInfo;
  questionnaire?: {
    enabled: boolean;
    faqVersion: string;
    questionnaireId?: string;
  };
}

// Validation schemas for questionnaire operations
export const insertQuestionnaireSchema = z.object({
  galleryId: z.string().min(1, "Gallery ID obbligatorio"),
  faqSetId: z.string().min(1, "FAQ Set ID obbligatorio"),
  couple: z.object({
    brideName: z.string().min(1, "Nome sposa obbligatorio"),
    groomName: z.string().min(1, "Nome sposo obbligatorio"),
    weddingDate: z.string().min(1, "Data matrimonio obbligatoria"),
    emailBride: z.string().email().optional(),
    emailGroom: z.string().email().optional()
  })
});

export type InsertQuestionnaire = z.infer<typeof insertQuestionnaireSchema>;

export const insertAnswerSchema = z.object({
  questionKey: z.string().regex(/^q[1-9]|q10$/, "Chiave domanda non valida"),
  answer: z.string().max(1500, "Risposta troppo lunga (max 1500 caratteri)")
});

export type InsertAnswer = z.infer<typeof insertAnswerSchema>;

// Utility function for token hashing
export const sha256Hash = async (rawToken: string): Promise<string> => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto API not available');
  }
  
  const encoder = new TextEncoder();
  const data = encoder.encode(rawToken);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Generate secure random token
export const generateSecureToken = (): string => {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('Crypto API not available');
  }
  
  const array = new Uint8Array(32); // 32 bytes = 256 bits
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

// Debounce utility for autosave
export const debounce = <F extends (...args: any[]) => void>(
  fn: F, 
  ms: number
): ((...args: Parameters<F>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<F>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
};
