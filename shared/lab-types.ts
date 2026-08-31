/**
 * LABORATORIO / STAMPA - Types & Interfaces
 * Anagrafica laboratori di stampa + tracce operative di consegna file (spedizioni)
 *
 * Traccia operativa INDIPENDENTE dal sistema gallerie:
 * - i file vivono su Google Drive (cartella dedicata, separata dai backup e dalle gallerie)
 * - sono transitori: auto-eliminati dopo la scadenza configurabile
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Laboratorio di stampa salvato in anagrafica
 */
export interface Lab {
  id: string;
  nome: string;
  email: string;
  telefono?: string;
  note?: string;
  /** Stato del contratto da responsabile del trattamento (GDPR art. 28). */
  dataProcessingAgreementStatus?: 'pending' | 'signed';
  dataProcessingAgreementSignedAt?: Timestamp;
  dataProcessingAgreementReference?: string;
  attivo: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InsertLab {
  nome: string;
  email: string;
  telefono?: string;
  note?: string;
  dataProcessingAgreementStatus?: 'pending' | 'signed';
  dataProcessingAgreementSignedAt?: Timestamp;
  dataProcessingAgreementReference?: string;
}

export interface UpdateLab {
  nome?: string;
  email?: string;
  telefono?: string;
  note?: string;
  attivo?: boolean;
  dataProcessingAgreementStatus?: 'pending' | 'signed';
  dataProcessingAgreementSignedAt?: Timestamp | null;
  dataProcessingAgreementReference?: string | null;
}

/**
 * Stati della spedizione al laboratorio (traccia operativa, NON stato commerciale del job)
 */
export type LabShipmentStatus =
  | 'da_inviare'   // file caricati, link non ancora inviato
  | 'inviato'      // link inviato al laboratorio
  | 'in_stampa'    // laboratorio sta stampando
  | 'ricevuto'     // stampe ricevute
  | 'scaduto';     // file auto-eliminati da Drive dopo scadenza

/**
 * Metadati di un singolo file caricato su Drive per la spedizione
 */
export interface LabShipmentFile {
  driveFileId: string;
  name: string;
  size: number;          // byte
  /** Per spedizioni shop collega il file all'asset privato dell'ordine. */
  assetId?: string;
  /** Distinta CSV oppure originale JPG; assente sui documenti legacy. */
  kind?: 'manifest' | 'original' | 'other';
  mimeType?: string;
  webViewLink?: string;  // link diretto al file (opzionale, lo share è a livello cartella)
  uploadedAt: Timestamp;
}

/**
 * Stato del trasferimento pagine fotolibro → Drive eseguito in background
 * sul server (fotolibri grandi: la copia può durare minuti).
 * - running: in corso (heartbeat aggiornato ad ogni pagina)
 * - completed: tutte le pagine trasferite
 * - partial: concluso ma con alcune pagine fallite (retry idempotente)
 * - failed: errore fatale prima/durante il ciclo
 */
export type LabShipmentPageTransferStatus = 'running' | 'completed' | 'partial' | 'failed';

export interface LabShipmentPageTransfer {
  status: LabShipmentPageTransferStatus;
  total: number;
  transferred: number;
  skipped: number;
  failed: Array<{ pageNumber: number; error: string }>;
  error?: string;
  startedAt?: Timestamp;
  finishedAt?: Timestamp | null;
  heartbeatAt?: Timestamp;
}

/** Trasferimento generico Storage → Drive, usato dagli ordini print_shop. */
export interface LabShipmentTransfer {
  status: 'pending' | 'running' | 'completed' | 'partial' | 'failed';
  total: number;
  transferred: number;
  failed: Array<{ assetId?: string; error: string }>;
  lastError?: string;
  startedAt?: Timestamp;
  finishedAt?: Timestamp;
  heartbeatAt?: Timestamp;
}

export interface LabShipmentSendState {
  status: 'sending' | 'sent' | 'failed';
  claimToken?: string;
  attempts: number;
  attemptedAt: Timestamp;
  sentAt?: Timestamp;
  failedAt?: Timestamp;
  lastError?: string;
  /** L'email è partita, ma lo stato ordine non è stato regredito dopo un cambio concorrente. */
  orderAdvanceSkipped?: boolean;
}

/**
 * Spedizione di file di stampa verso un laboratorio, collegata a un job.
 * Collezione Firestore: labShipments
 */
export interface LabShipment {
  id: string;
  /** Legacy/job e fotolibri usano jobId; lo shop usa orderId. */
  jobId?: string;
  orderId?: string;
  orderNumber?: string;
  sourceType?: 'job' | 'photobook' | 'print_shop';

  // Laboratorio destinatario (snapshot denormalizzato per storico)
  labId?: string;
  labNome?: string;
  labEmail?: string;

  descrizione?: string;

  // File su Google Drive
  files: LabShipmentFile[];
  driveFolderId?: string;   // sottocartella dedicata alla spedizione
  shareableLink?: string;   // URL Drive; nello shop richiede l'account nominativo del lab
  /** Permission Drive nominativa usata dallo shop (mai `anyone`). */
  drivePermissionId?: string;
  drivePermissionEmail?: string;
  drivePermissionRevokedAt?: Timestamp;

  // Stato e tempistiche
  status: LabShipmentStatus;
  sentAt?: Timestamp;        // quando il link è stato inviato al lab
  expiryDays: number;        // giorni prima dell'auto-eliminazione (default 20)
  expiresAt?: Timestamp;     // calcolato al momento dell'invio (sentAt + expiryDays)
  deletedFromDrive?: boolean; // true dopo l'auto-eliminazione dei file
  expiryDeletionLastAttemptAt?: Timestamp;
  expiryDeletionLastError?: string;
  sendState?: LabShipmentSendState;

  // Costo laboratorio collegato al job (tipo 'fornitore')
  costoId?: string;
  costoImporto?: number;

  // Trasferimento pagine fotolibro in background (solo spedizioni da fotolibro)
  pageTransfer?: LabShipmentPageTransfer;
  photobookId?: string;
  transfer?: LabShipmentTransfer;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy?: string;
}

export interface InsertLabShipment {
  jobId?: string;
  orderId?: string;
  sourceType?: 'job' | 'photobook' | 'print_shop';
  descrizione?: string;
  labId?: string;
  expiryDays?: number;
}

export interface UpdateLabShipment {
  descrizione?: string;
  labId?: string;
  status?: LabShipmentStatus;
  expiryDays?: number;
}

export const LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS = 20;

export const LAB_SHIPMENT_STATUS_LABELS: Record<LabShipmentStatus, string> = {
  da_inviare: 'Da inviare',
  inviato: 'Inviato',
  in_stampa: 'In stampa',
  ricevuto: 'Ricevuto',
  scaduto: 'Scaduto',
};
