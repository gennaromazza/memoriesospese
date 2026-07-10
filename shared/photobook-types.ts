/**
 * Tipi condivisi per il Modulo Revisione Fotolibro.
 *
 * Collezioni Firestore:
 *  - `photobooks`            → fotolibro (galleria associata, versioni con storico, token cliente)
 *  - `photobookPages`        → pagine JPEG per versione (slot embedded, coordinate proporzionali 0–1)
 *  - `photobookChangeRequests` → richieste di modifica inviate dal cliente
 *
 * Il cliente accede SOLO tramite link a token (`/fotolibro/:token`), mai dalla
 * galleria pubblica: il fotolibro è invisibile agli ospiti.
 */

/** Slot fotografico riconosciuto (o creato manualmente) su una pagina. Coordinate proporzionali 0–1. */
export interface PhotobookSlot {
  id: string;
  x: number; // 0–1, bordo sinistro
  y: number; // 0–1, bordo superiore
  width: number; // 0–1
  height: number; // 0–1
  rotation: number; // gradi, default 0
  /** Foto galleria associata (match automatico o correzione manuale) */
  photoId?: string | null;
  photoName?: string | null;
  photoThumbnailUrl?: string | null;
  /** Percentuale di affidabilità del match automatico (0–100) */
  confidence?: number | null;
  /** Origine dell'associazione */
  matchStatus: 'auto' | 'manual' | 'none';
}

export type PhotobookPageDetectionStatus = 'pending' | 'processing' | 'done' | 'failed';

/** Pagina JPEG di una versione del fotolibro. */
export interface PhotobookPage {
  id: string;
  photobookId: string;
  version: number;
  pageNumber: number;
  fileName: string;
  url: string; // download URL Storage (photobooks/{photobookId}/v{version}/...)
  storagePath: string;
  width: number; // pixel originali
  height: number;
  slots: PhotobookSlot[];
  detectionStatus: PhotobookPageDetectionStatus;
  detectionError?: string | null;
  createdAt: any;
  updatedAt?: any;
}

/** Versione del fotolibro (storico mantenuto). */
export interface PhotobookVersion {
  version: number;
  label?: string;
  pageCount: number;
  createdAt: any;
}

export interface Photobook {
  id: string;
  name: string;
  galleryId: string;
  galleryName?: string;
  clientName?: string;
  /** Token univoco per l'accesso cliente a /fotolibro/:token */
  token: string;
  /** Versione attualmente visibile al cliente */
  currentVersion: number;
  versions: PhotobookVersion[];
  createdAt: any;
  updatedAt?: any;
}

export type PhotobookChangeRequestType = 'replace' | 'delete' | 'edit';
export type PhotobookChangeRequestStatus = 'pending' | 'done' | 'rejected';

/** Richiesta di modifica inviata dal cliente per un singolo slot. */
export interface PhotobookChangeRequest {
  id: string;
  photobookId: string;
  photobookName: string;
  galleryId: string;
  galleryName?: string;
  clientName?: string;
  version: number;
  pageId: string;
  pageNumber: number;
  slotId: string;
  type: PhotobookChangeRequestType;
  /** Foto originale nello slot (se riconosciuta) */
  originalPhotoId?: string | null;
  originalPhotoName?: string | null;
  originalPhotoThumbnailUrl?: string | null;
  /** Solo per type === 'replace' */
  replacementPhotoId?: string | null;
  replacementPhotoName?: string | null;
  replacementPhotoThumbnailUrl?: string | null;
  /** Nota del cliente (obbligatoria per type === 'edit') */
  note?: string | null;
  status: PhotobookChangeRequestStatus;
  /** Id batch di invio: tutte le richieste inviate insieme condividono lo stesso batch */
  batchId: string;
  createdAt: any;
  updatedAt?: any;
}

/** Foto galleria esposta al client del fotolibro (subset sicuro). */
export interface PhotobookGalleryPhoto {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string | null;
}
