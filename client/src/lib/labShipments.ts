/**
 * LAB SHIPMENTS LIBRARY
 * Gestione spedizioni file verso laboratori di stampa.
 *
 * Upload "resumable" diretto browser → Google Drive:
 * il server conia la sessione (token mai esposto), il browser carica i byte
 * direttamente all'URI di sessione (con progress e ripresa per chunk).
 */

import { apiRequest } from "./queryClient";
import type {
  LabShipment,
  InsertLabShipment,
  UpdateLabShipment,
} from "@shared/lab-types";

/**
 * Converte un valore timestamp (Firestore admin serializzato { _seconds } o ISO/Date)
 * in un oggetto Date, oppure null.
 */
export function tsToDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && typeof value._seconds === "number") {
    return new Date(value._seconds * 1000);
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Calcola i giorni rimanenti alla scadenza (negativo se già scaduto).
 */
export function daysUntilExpiry(expiresAt: any): number | null {
  const d = tsToDate(expiresAt);
  if (!d) return null;
  const diffMs = d.getTime() - Date.now();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

/**
 * Get spedizioni per job
 */
export async function getJobShipments(jobId: string): Promise<LabShipment[]> {
  try {
    const response = await apiRequest("GET", `/api/lab-shipments/job/${jobId}`);
    if (!response.ok) throw new Error("Errore caricamento spedizioni");
    return await response.json();
  } catch (error) {
    console.error("❌ Errore get spedizioni:", error);
    throw error;
  }
}

/**
 * Dettaglio di una singola spedizione (es. spedizione collegata a un fotolibro)
 */
export async function getShipment(id: string): Promise<LabShipment> {
  const response = await apiRequest("GET", `/api/lab-shipments/${id}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Errore caricamento spedizione");
  }
  return await response.json();
}

/**
 * Crea nuova spedizione per un job
 */
export async function createShipment(
  data: InsertLabShipment,
): Promise<LabShipment> {
  try {
    const response = await apiRequest("POST", "/api/lab-shipments", data);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Errore creazione spedizione");
    }
    return await response.json();
  } catch (error) {
    console.error("❌ Errore creazione spedizione:", error);
    throw error;
  }
}

/**
 * Aggiorna campi spedizione (stato, descrizione, lab, giorni scadenza)
 */
export async function updateShipment(
  id: string,
  data: UpdateLabShipment,
): Promise<LabShipment> {
  try {
    const response = await apiRequest("PATCH", `/api/lab-shipments/${id}`, data);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Errore aggiornamento spedizione");
    }
    return await response.json();
  } catch (error) {
    console.error("❌ Errore aggiornamento spedizione:", error);
    throw error;
  }
}

/**
 * Invia il link al laboratorio (imposta stato 'inviato' + scadenza)
 */
export async function sendShipment(
  id: string,
  labId?: string,
): Promise<LabShipment> {
  try {
    const response = await apiRequest("POST", `/api/lab-shipments/${id}/send`, {
      labId,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Errore invio al laboratorio");
    }
    return await response.json();
  } catch (error) {
    console.error("❌ Errore invio spedizione:", error);
    throw error;
  }
}

/**
 * Registra/aggiorna il costo laboratorio (CostoLavoro tipo 'fornitore' sul job)
 */
export async function setShipmentCost(
  id: string,
  importo: number,
): Promise<LabShipment> {
  try {
    const response = await apiRequest("POST", `/api/lab-shipments/${id}/cost`, {
      importo,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Errore registrazione costo");
    }
    return await response.json();
  } catch (error) {
    console.error("❌ Errore costo spedizione:", error);
    throw error;
  }
}

/**
 * Elimina spedizione (rimuove cartella Drive + costo collegato)
 */
export async function deleteShipment(id: string): Promise<void> {
  try {
    const response = await apiRequest("DELETE", `/api/lab-shipments/${id}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Errore eliminazione spedizione");
    }
  } catch (error) {
    console.error("❌ Errore eliminazione spedizione:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Upload resumable browser → Google Drive
// ---------------------------------------------------------------------------

// Chunk multiplo di 256KB come richiesto dalle API Drive resumable.
const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB
const MAX_CHUNK_RETRIES = 4;

interface UploadSessionResponse {
  sessionUrl: string;
  driveFolderId: string;
  shareableLink?: string;
}

/**
 * Richiede al server una sessione di upload resumable.
 */
async function requestUploadSession(
  shipmentId: string,
  file: File,
): Promise<UploadSessionResponse> {
  const response = await apiRequest(
    "POST",
    `/api/lab-shipments/${shipmentId}/upload-session`,
    {
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
    },
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Errore creazione sessione di upload");
  }
  return await response.json();
}

/**
 * Carica un singolo chunk verso l'URI di sessione.
 * Risolve con { status, body } dove status è 308 (continua) o 200/201 (completato).
 */
function putChunk(
  sessionUrl: string,
  chunk: Blob,
  start: number,
  end: number,
  total: number,
  mimeType: string,
  onByteProgress: (uploaded: number) => void,
): Promise<{ status: number; body: any; range: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", sessionUrl, true);
    // NON impostare Authorization: l'URI di sessione è già pre-autorizzato.
    xhr.setRequestHeader(
      "Content-Range",
      `bytes ${start}-${end - 1}/${total}`,
    );
    if (mimeType) xhr.setRequestHeader("Content-Type", mimeType);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onByteProgress(start + e.loaded);
    };

    xhr.onload = () => {
      let body: any = null;
      if (xhr.responseText) {
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = xhr.responseText;
        }
      }
      let range: string | null = null;
      try {
        range = xhr.getResponseHeader("Range");
      } catch {
        range = null;
      }
      resolve({ status: xhr.status, body, range });
    };
    xhr.onerror = () =>
      reject(new Error("Errore di rete durante l'upload del file"));
    xhr.onabort = () => reject(new Error("Upload annullato"));

    xhr.send(chunk);
  });
}

/**
 * Estrae il byte finale ricevuto dall'header Range di Drive ("bytes=0-N").
 * Ritorna l'offset del prossimo byte da inviare, o null se non interpretabile.
 */
function nextOffsetFromRange(range: string | null): number | null {
  if (!range) return null;
  const match = range.match(/bytes=\d+-(\d+)/);
  if (!match) return null;
  const lastByte = parseInt(match[1], 10);
  return Number.isNaN(lastByte) ? null : lastByte + 1;
}

export interface UploadHandle {
  promise: Promise<{ driveFileId: string }>;
}

/**
 * Carica un file verso la spedizione: ottiene la sessione, invia i chunk con
 * ripresa, e notifica il server al termine. onProgress riceve 0..100.
 */
export async function uploadFileToShipment(
  shipmentId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<LabShipment> {
  const session = await requestUploadSession(shipmentId, file);
  const total = file.size;

  const reportProgress = (uploadedBytes: number) => {
    if (onProgress) {
      const pct = total > 0 ? Math.min(99, Math.floor((uploadedBytes / total) * 100)) : 0;
      onProgress(pct);
    }
  };

  let offset = 0;
  let driveFile: any = null;

  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = file.slice(offset, end);

    let attempt = 0;
    let result: { status: number; body: any; range: string | null } | null = null;
    // Retry del singolo chunk su errori di rete o status transitori (5xx/429).
    while (attempt < MAX_CHUNK_RETRIES) {
      try {
        const r = await putChunk(
          session.sessionUrl,
          chunk,
          offset,
          end,
          total,
          file.type || "application/octet-stream",
          reportProgress,
        );
        // Status transitori: ritenta lo stesso chunk con backoff.
        if (r.status === 429 || r.status >= 500) {
          attempt++;
          if (attempt >= MAX_CHUNK_RETRIES) {
            throw new Error(`Upload fallito (HTTP ${r.status}). Riprova.`);
          }
          await new Promise((res) => setTimeout(res, 1000 * attempt));
          continue;
        }
        result = r;
        break;
      } catch (err) {
        attempt++;
        if (attempt >= MAX_CHUNK_RETRIES) throw err;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }

    if (!result) throw new Error("Upload fallito");

    if (result.status === 200 || result.status === 201) {
      driveFile = result.body;
      offset = total;
    } else if (result.status === 308) {
      // Rispetta l'header Range di Drive: riprende dal byte realmente ricevuto.
      const nextOffset = nextOffsetFromRange(result.range);
      offset = nextOffset != null ? nextOffset : end;
    } else {
      throw new Error(
        `Upload fallito (HTTP ${result.status}). Riprova.`,
      );
    }
  }

  const driveFileId = driveFile?.id;
  if (!driveFileId) {
    throw new Error("Upload completato ma ID file Drive mancante");
  }

  // Notifica il server per registrare il file nella spedizione.
  const response = await apiRequest(
    "POST",
    `/api/lab-shipments/${shipmentId}/file-uploaded`,
    {
      driveFileId,
      name: file.name,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
    },
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Errore registrazione file");
  }

  if (onProgress) onProgress(100);
  return await response.json();
}

/**
 * Formatta una dimensione in byte in stringa leggibile.
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
