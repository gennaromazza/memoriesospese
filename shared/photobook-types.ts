/**
 * Tipi condivisi per il Modulo Revisione Fotolibro.
 *
 * Collezioni Firestore:
 *  - `photobooks`            → fotolibro (galleria associata, versioni con storico, token cliente)
 *  - `photobookPages`        → pagine JPEG per versione
 *  - `photobookChangeRequests` → richieste di modifica inviate dal cliente
 *
 * Il cliente accede SOLO tramite link a token (`/fotolibro/:token`), mai dalla
 * galleria pubblica: il fotolibro è invisibile agli ospiti.
 *
 * Revisione "a penna": il cliente disegna una X a mano libera sulla pagina;
 * ogni X (colore auto-assegnato da palette) diventa una richiesta di modifica.
 * All'invio viene salvato uno snapshot JPEG della pagina con le X disegnate.
 */

/** Punto di un tratto, coordinate proporzionali 0–1 rispetto alla pagina. */
export interface PhotobookMarkPoint {
  x: number;
  y: number;
}

/** Segno a mano libera (una X = uno o più tratti) con colore assegnato. */
export interface PhotobookMark {
  /** Colore esadecimale assegnato automaticamente (es. "#e11d48") */
  color: string;
  /** Tratti disegnati: ogni tratto è una sequenza di punti normalizzati 0–1 */
  strokes: PhotobookMarkPoint[][];
}

/** Pagina JPEG di una versione del fotolibro. */
export interface PhotobookPage {
  id: string;
  photobookId: string;
  version: number;
  pageNumber: number;
  fileName: string;
  url: string; // download URL Storage (photobooks/{photobookId}/v{version}/...)
  storagePath: string;
  /** Versione ridotta (~1400px) per la visualizzazione: molto più leggera su mobile */
  displayUrl?: string | null;
  displayStoragePath?: string | null;
  width: number; // pixel originali
  height: number;
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
  /**
   * Blocco "mandato in stampa" (attivato solo manualmente dall'admin):
   * il cliente vede tutto in sola lettura e non può più inviare o
   * cancellare richieste. Definitivo lato cliente (l'admin può riaprire).
   */
  locked?: boolean;
  createdAt: any;
  updatedAt?: any;
}

export type PhotobookChangeRequestType = 'replace' | 'delete' | 'edit';
export type PhotobookChangeRequestStatus = 'pending' | 'done' | 'rejected';

/** Richiesta di modifica inviata dal cliente (una per ogni X disegnata). */
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
  type: PhotobookChangeRequestType;
  /** Colore della X sulla pagina (es. "#e11d48") */
  markColor?: string | null;
  /** Tratti della X, coordinate normalizzate 0–1 */
  markStrokes?: PhotobookMarkPoint[][] | null;
  /** Snapshot JPEG della pagina con le X disegnate (condiviso dal batch) */
  snapshotUrl?: string | null;
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
  /** Campi legacy delle richieste basate su slot (sistema precedente) */
  slotId?: string | null;
  originalPhotoId?: string | null;
  originalPhotoName?: string | null;
  originalPhotoThumbnailUrl?: string | null;
}

/** Foto galleria esposta al client del fotolibro (subset sicuro). */
export interface PhotobookGalleryPhoto {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string | null;
  /** Capitolo della galleria a cui appartiene la foto (se assegnata) */
  chapterId?: string | null;
}

/** Capitolo della galleria (subset sicuro per il picker foto sostitutive). */
export interface PhotobookGalleryChapter {
  id: string;
  titolo: string;
  ordine: number;
}

/**
 * Palette ad alto contrasto per le X: il colore viene assegnato in automatico
 * alla prima X col primo colore non ancora usato sulla pagina (poi cicla).
 * `name` è usato nei testi (pallino colore + "X rossa" nell'elenco copiato).
 */
export const PHOTOBOOK_MARK_PALETTE: ReadonlyArray<{ hex: string; name: string }> = [
  { hex: '#e11d48', name: 'rossa' },
  { hex: '#2563eb', name: 'blu' },
  { hex: '#16a34a', name: 'verde' },
  { hex: '#f59e0b', name: 'arancione' },
  { hex: '#9333ea', name: 'viola' },
  { hex: '#0891b2', name: 'azzurra' },
  { hex: '#db2777', name: 'rosa' },
  { hex: '#65a30d', name: 'lime' },
  { hex: '#7c3aed', name: 'indaco' },
  { hex: '#ea580c', name: 'ambra' },
  { hex: '#0d9488', name: 'petrolio' },
  { hex: '#a16207', name: 'ocra' },
];

/** Nome italiano del colore di una X (fallback: codice esadecimale). */
export function photobookMarkColorName(hex: string | null | undefined): string {
  if (!hex) return '';
  const found = PHOTOBOOK_MARK_PALETTE.find(
    (c) => c.hex.toLowerCase() === hex.toLowerCase(),
  );
  return found ? found.name : hex;
}
