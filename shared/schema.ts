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
  coverImageUrl?: string; // Mantieni per retrocompatibilità
  coverImageMobile?: string; // Nuovo: copertina per mobile (9:16)
  coverImageDesktop?: string; // Nuovo: copertina per desktop (16:9)
  youtubeUrl?: string; // Mantieni per retrocompatibilità
  youtubeUrls?: string[]; // Nuovo: array di URL YouTube
  photoCount: number;
  active: boolean;
  // Security Question fields
  requiresSecurityQuestion?: boolean;
  securityQuestionType?: SecurityQuestionType;
  securityQuestionCustom?: string;
  securityAnswer?: string;
  // Special Theme fields (seasonal galleries)
  specialTheme?: string; // ID del tema stagionale (es. 'natale2024')
  specialPin?: string; // PIN specifico per galleria speciale
  
  // Photo Selection Mode (Legacy - Single Product)
  selectionEnabled?: boolean; // Modalità selezione foto - permette ai clienti di selezionare foto preferite (default: false per backward compatibility)
  requiredPhotoCount?: number; // LEGACY: Numero di foto che il cliente deve selezionare (es. 50 per album) - usato solo per gallerie mono-prodotto
  selectionStatus?: 'pending' | 'completed'; // Stato selezione cliente
  selectedPhotoIds?: string[]; // LEGACY: Array IDs foto selezionate dal cliente (mono-prodotto) - per multi-prodotto usa photoAssignments
  selectionDeadline?: any; // Firebase Timestamp - Scadenza per completare selezione (opzionale)
  selectionDeadlineEnforced?: boolean; // Se true, blocca selezione dopo deadline (admin può sbloccare)
  
  // Multi-Product Selection Mode (NEW)
  productRequirements?: Array<{
    prodottoId?: string; // ID prodotto dal catalogo (opzionale per custom products)
    prodottoNome: string; // Nome prodotto
    prodottoNumeroFoto: number; // Numero foto richieste per questo prodotto
  }>; // Array prodotti richiesti per questa galleria (per ordini multi-prodotto)
  photoAssignments?: Record<string, string[]>; // Mapping {photoId: [prodottoId1, prodottoId2, ...]} - permette riutilizzo foto tra prodotti
  
  // Booking Integration
  bookingId?: string; // Link a booking se galleria creata da BookingsManager
  userId: string; // UID admin/utente che ha creato la galleria
  
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

// Question key type (flexible q1-q20)
export type QuestionKey = `q${1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20}`;

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
    key: z.string().regex(/^q([1-9]|1[0-9]|20)$/, "Chiave domanda non valida (q1-q20)"),
    text: z.string().min(1, "Il testo della domanda è obbligatorio").max(200, "Massimo 200 caratteri"),
    type: z.enum(["text", "textarea"]).default("textarea")
  })).min(1, "Almeno 1 domanda richiesta").max(20, "Massimo 20 domande consentite")
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
  couple?: CoupleInfo; // Informazioni coppia
  tokens: Record<Role, {
    tokenId: string;
    url: string;
    createdAt: number;
    expiresAt: number;
    revoked?: boolean;
  }>;
  activeTokens: Record<Role, string>; // Track active tokenId per role for atomic management
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


// Validation Session for temporary access (15 min)
export interface ValidationSession {
  id: string;
  galleryId: string;
  questionnaireId: string;
  role: Role;
  tokenId: string;
  validatedAt: number;
  expiresAt: number;
  ipAddress?: string;
  userAgent?: string;
}

// Rate Limiting per IP/identifier
export interface RateLimitEntry {
  id: string;
  identifier: string; // IP address o user identifier
  attempts: number;
  windowStart: number;
  blocked: boolean;
  lastAttempt: number;
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

// Utility to convert various date formats to JS Date object
export const toJSDate = (dateInput: any): Date | null => {
  if (!dateInput) {
    return null;
  }
  if (dateInput instanceof Date) {
    return dateInput;
  }
  if (typeof dateInput === 'number' || (typeof dateInput === 'string' && !isNaN(Number(dateInput)))) {
    // Assume it's a timestamp (milliseconds or seconds)
    const timestamp = Number(dateInput);
    // If it looks like seconds, convert to milliseconds
    if (timestamp < 10000000000) { // Heuristic: if timestamp is less than ~year 2286 in seconds
      return new Date(timestamp * 1000);
    }
    return new Date(timestamp);
  }
  if (typeof dateInput === 'string') {
    // Attempt to parse ISO 8601 or other common formats
    const parsedDate = new Date(dateInput);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }
  console.error("Could not parse date:", dateInput);
  return null;
};

// ====== COUPLE STORY SYSTEM TYPES ======

// Story Chapter interface - represents a chapter with text content
export interface StoryChapter {
  testo: string;
  tema?: string;
  posizione?: string;
  uso?: string;
}

// Story Prologue interface - special type for prologue
export interface StoryPrologue {
  testo: string;
  posizione?: string;
  tema?: string;
}

// Poetic Quote interface
export interface PoeticQuote {
  testo: string;
  uso?: string;
  autore?: string;
  fonte?: string;
}

// Main CoupleStory interface - represents the complete story structure
export interface CoupleStory {
  id: string;
  galleryId: string;
  prologo?: StoryPrologue;
  capitolo_1_lattesa?: StoryChapter[];
  capitolo_2_incontro?: StoryChapter[];
  capitolo_3_festa?: StoryChapter[];
  capitolo_4_promesse?: StoryChapter[];
  capitolo_5_celebrazione?: StoryChapter[];
  capitolo_6_eternita?: StoryChapter[];
  citazioni_poetiche?: PoeticQuote[];
  citazioni_religiose?: PoeticQuote[];
  citazioni_moderne?: PoeticQuote[];
  note_fotografo?: string[];
  metadata?: {
    titolo?: string;
    sottotitolo?: string;
    stile?: string;
    tema?: string;
    colore_principale?: string;
  };
  createdAt: any; // Firebase Timestamp
  updatedAt: any; // Firebase Timestamp
  createdBy?: string; // admin email
  updatedBy?: string; // admin email
}

// Validation schema for story content from ChatGPT JSON
export const insertCoupleStorySchema = z.object({
  galleryId: z.string().min(1, "Gallery ID è obbligatorio"),
  prologo: z.object({
    testo: z.string().min(1, "Testo del prologo è obbligatorio"),
    posizione: z.string().optional(),
    tema: z.string().optional()
  }).optional(),
  capitolo_1_lattesa: z.array(z.object({
    testo: z.string().min(1),
    tema: z.string().optional(),
    posizione: z.string().optional(),
    uso: z.string().optional()
  })).optional(),
  capitolo_2_incontro: z.array(z.object({
    testo: z.string().min(1),
    tema: z.string().optional(),
    posizione: z.string().optional(),
    uso: z.string().optional()
  })).optional(),
  capitolo_3_festa: z.array(z.object({
    testo: z.string().min(1),
    tema: z.string().optional(),
    posizione: z.string().optional(),
    uso: z.string().optional()
  })).optional(),
  capitolo_4_promesse: z.array(z.object({
    testo: z.string().min(1),
    tema: z.string().optional(),
    posizione: z.string().optional(),
    uso: z.string().optional()
  })).optional(),
  capitolo_5_celebrazione: z.array(z.object({
    testo: z.string().min(1),
    tema: z.string().optional(),
    posizione: z.string().optional(),
    uso: z.string().optional()
  })).optional(),
  capitolo_6_eternita: z.array(z.object({
    testo: z.string().min(1),
    tema: z.string().optional(),
    posizione: z.string().optional(),
    uso: z.string().optional()
  })).optional(),
  citazioni_poetiche: z.array(z.object({
    testo: z.string().min(1),
    uso: z.string().optional(),
    autore: z.string().optional(),
    fonte: z.string().optional()
  })).optional(),
  citazioni_religiose: z.array(z.object({
    testo: z.string().min(1),
    uso: z.string().optional(),
    autore: z.string().optional(),
    fonte: z.string().optional()
  })).optional(),
  citazioni_moderne: z.array(z.object({
    testo: z.string().min(1),
    uso: z.string().optional(),
    autore: z.string().optional(),
    fonte: z.string().optional()
  })).optional(),
  note_fotografo: z.array(z.string()).optional(),
  metadata: z.object({
    titolo: z.string().optional(),
    sottotitolo: z.string().optional(),
    stile: z.string().optional(),
    tema: z.string().optional(),
    colore_principale: z.string().optional()
  }).optional()
});

export type InsertCoupleStory = z.infer<typeof insertCoupleStorySchema>;

// Raw JSON validation schema for ChatGPT import
export const importStoryJsonSchema = z.object({
  prologo: z.union([
    z.object({
      testo: z.string(),
      posizione: z.string().optional(),
      tema: z.string().optional()
    }),
    z.string()
  ]).optional(),
  capitolo_1_lattesa: z.union([
    z.array(z.union([
      z.object({
        testo: z.string(),
        tema: z.string().optional(),
        posizione: z.string().optional(),
        uso: z.string().optional()
      }),
      z.string()
    ])),
    z.string()
  ]).optional(),
  capitolo_2_incontro: z.union([
    z.array(z.union([
      z.object({
        testo: z.string(),
        tema: z.string().optional(),
        posizione: z.string().optional(),
        uso: z.string().optional()
      }),
      z.string()
    ])),
    z.string()
  ]).optional(),
  capitolo_3_festa: z.union([
    z.array(z.union([
      z.object({
        testo: z.string(),
        tema: z.string().optional(),
        posizione: z.string().optional(),
        uso: z.string().optional()
      }),
      z.string()
    ])),
    z.string()
  ]).optional(),
  capitolo_4_promesse: z.union([
    z.array(z.union([
      z.object({
        testo: z.string(),
        tema: z.string().optional(),
        posizione: z.string().optional(),
        uso: z.string().optional()
      }),
      z.string()
    ])),
    z.string()
  ]).optional(),
  capitolo_5_celebrazione: z.union([
    z.array(z.union([
      z.object({
        testo: z.string(),
        tema: z.string().optional(),
        posizione: z.string().optional(),
        uso: z.string().optional()
      }),
      z.string()
    ])),
    z.string()
  ]).optional(),
  capitolo_6_eternita: z.union([
    z.array(z.union([
      z.object({
        testo: z.string(),
        tema: z.string().optional(),
        posizione: z.string().optional(),
        uso: z.string().optional()
      }),
      z.string()
    ])),
    z.string()
  ]).optional(),
  citazioni_poetiche: z.union([
    z.array(z.union([
      z.object({
        testo: z.string(),
        uso: z.string().optional(),
        autore: z.string().optional(),
        fonte: z.string().optional()
      }),
      z.string()
    ])),
    z.string()
  ]).optional(),
  citazioni_religiose: z.union([
    z.array(z.union([
      z.object({
        testo: z.string(),
        uso: z.string().optional(),
        autore: z.string().optional(),
        fonte: z.string().optional()
      }),
      z.string()
    ])),
    z.string()
  ]).optional(),
  citazioni_moderne: z.union([
    z.array(z.union([
      z.object({
        testo: z.string(),
        uso: z.string().optional(),
        autore: z.string().optional(),
        fonte: z.string().optional()
      }),
      z.string()
    ])),
    z.string()
  ]).optional(),
  note_fotografo: z.union([
    z.array(z.string()),
    z.string()
  ]).optional(),
  metadata: z.object({
    titolo: z.string().optional(),
    sottotitolo: z.string().optional(),
    stile: z.string().optional(),
    tema: z.string().optional(),
    colore_principale: z.string().optional()
  }).optional()
});

export type ImportStoryJson = z.infer<typeof importStoryJsonSchema>;

// Helper function to normalize imported JSON to proper structure
export const normalizeImportedStory = (rawData: ImportStoryJson): Partial<InsertCoupleStory> => {
  const normalized: Partial<InsertCoupleStory> = {};

  // Normalize prologue
  if (rawData.prologo) {
    if (typeof rawData.prologo === 'string') {
      normalized.prologo = { testo: rawData.prologo };
    } else {
      normalized.prologo = rawData.prologo;
    }
  }

  // Normalize chapters
  const chapters = ['capitolo_1_lattesa', 'capitolo_2_incontro', 'capitolo_3_festa', 'capitolo_4_promesse', 'capitolo_5_celebrazione', 'capitolo_6_eternita'] as const;
  
  chapters.forEach(chapter => {
    const chapterData = rawData[chapter];
    if (chapterData) {
      if (typeof chapterData === 'string') {
        normalized[chapter] = [{ testo: chapterData }];
      } else if (Array.isArray(chapterData)) {
        normalized[chapter] = chapterData.map(item => 
          typeof item === 'string' ? { testo: item } : item
        );
      }
    }
  });

  // Normalize quotes
  const quotes = ['citazioni_poetiche', 'citazioni_religiose', 'citazioni_moderne'] as const;
  
  quotes.forEach(quoteType => {
    const quoteData = rawData[quoteType];
    if (quoteData) {
      if (typeof quoteData === 'string') {
        normalized[quoteType] = [{ testo: quoteData }];
      } else if (Array.isArray(quoteData)) {
        normalized[quoteType] = quoteData.map(item => 
          typeof item === 'string' ? { testo: item } : item
        );
      }
    }
  });

  // Normalize notes
  if (rawData.note_fotografo) {
    if (typeof rawData.note_fotografo === 'string') {
      normalized.note_fotografo = [rawData.note_fotografo];
    } else {
      normalized.note_fotografo = rawData.note_fotografo;
    }
  }

  // Copy metadata as-is
  if (rawData.metadata) {
    normalized.metadata = rawData.metadata;
  }

  return normalized;
};

// ====== SPECIAL THEME SYSTEM TYPES ======

// Special Theme interface - represents a seasonal or special theme
export interface SpecialTheme {
  id: string;
  name: string; // Nome visualizzato (es. "Natale 2024")
  icon: string; // Emoji o icona (es. "🎄")
  description?: string; // Descrizione breve
  active: boolean; // Se il tema è attivo
  colors: {
    primary: string; // Colore principale (hex)
    secondary?: string; // Colore secondario (hex)
    accent?: string; // Colore accent (hex)
  };
  styles: {
    bannerBg: string; // Classe Tailwind per background banner (es. "bg-red-800")
    galleryBg: string; // Classe Tailwind per background galleria (es. "bg-green-50")
    buttonStyle?: string; // Classe Tailwind per pulsanti
    textColor?: string; // Classe Tailwind per testo
  };
  createdAt: any; // Firebase Timestamp
  updatedAt?: any; // Firebase Timestamp
  createdBy?: string; // Admin email
}

// Validation schema for Special Theme
export const insertSpecialThemeSchema = z.object({
  name: z.string().min(3, "Il nome deve contenere almeno 3 caratteri"),
  icon: z.string().min(1, "L'icona è obbligatoria"),
  description: z.string().optional(),
  colors: z.object({
    primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Colore primario non valido"),
    secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Colore secondario non valido").optional(),
    accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Colore accent non valido").optional()
  }),
  styles: z.object({
    bannerBg: z.string().min(1, "Background banner obbligatorio"),
    galleryBg: z.string().min(1, "Background galleria obbligatorio"),
    buttonStyle: z.string().optional(),
    textColor: z.string().optional()
  })
});

export type InsertSpecialTheme = z.infer<typeof insertSpecialThemeSchema>;