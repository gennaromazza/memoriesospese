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
  attivo: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InsertLab {
  nome: string;
  email: string;
  telefono?: string;
  note?: string;
}

export interface UpdateLab {
  nome?: string;
  email?: string;
  telefono?: string;
  note?: string;
  attivo?: boolean;
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
  mimeType?: string;
  webViewLink?: string;  // link diretto al file (opzionale, lo share è a livello cartella)
  uploadedAt: Timestamp;
}

/**
 * Spedizione di file di stampa verso un laboratorio, collegata a un job.
 * Collezione Firestore: labShipments
 */
export interface LabShipment {
  id: string;
  jobId: string;

  // Laboratorio destinatario (snapshot denormalizzato per storico)
  labId?: string;
  labNome?: string;
  labEmail?: string;

  descrizione?: string;

  // File su Google Drive
  files: LabShipmentFile[];
  driveFolderId?: string;   // sottocartella dedicata alla spedizione
  shareableLink?: string;   // link "chiunque con il link" alla cartella

  // Stato e tempistiche
  status: LabShipmentStatus;
  sentAt?: Timestamp;        // quando il link è stato inviato al lab
  expiryDays: number;        // giorni prima dell'auto-eliminazione (default 20)
  expiresAt?: Timestamp;     // calcolato al momento dell'invio (sentAt + expiryDays)
  deletedFromDrive?: boolean; // true dopo l'auto-eliminazione dei file

  // Costo laboratorio collegato al job (tipo 'fornitore')
  costoId?: string;
  costoImporto?: number;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy?: string;
}

export interface InsertLabShipment {
  jobId: string;
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
