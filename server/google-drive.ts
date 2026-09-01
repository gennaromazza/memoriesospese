/**
 * Google Drive Integration - Server-side only
 * Gestisce upload backup e consegne laboratorio su Google Drive.
 *
 * Integrazione: connection:conn_google-drive_01KDCREACZ40HAZ64454G0GCCA
 * Tutte le chiamate passano dal proxy dei connettori Replit
 * (@replit/connectors-sdk): il token OAuth non transita mai da questo modulo.
 */

import { ReplitConnectors } from '@replit/connectors-sdk';
import { Readable } from 'stream';

export interface DriveConnectionStatus {
  connected: boolean;
  email?: string;
  needsReconnection: boolean;
  error?: string;
}

// Non cachare il client: l'SDK gestisce identità e refresh internamente,
// l'istanza è comunque leggera e senza stato di sessione.
function getConnectors(): ReplitConnectors {
  return new ReplitConnectors();
}

/**
 * Fetch autenticata verso l'API Google Drive via proxy connettori.
 * Converte gli errori di autorizzazione nel messaggio standard di riconnessione.
 */
async function driveFetch(
  path: string,
  options?: { method?: string; headers?: Record<string, string>; body?: any },
): Promise<Response> {
  const response = await getConnectors().proxy('google-drive', path, options);
  if (response.status === 401 || response.status === 403) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `GOOGLE_DRIVE_RECONNECTION_NEEDED: Google Drive non connesso o autorizzazione scaduta (${response.status}) ${text.slice(0, 200)}`,
    );
  }
  return response;
}

/** Come driveFetch ma lancia anche sugli altri errori HTTP e fa il parse JSON. */
async function driveJson<T = any>(
  path: string,
  options?: { method?: string; headers?: Record<string, string>; body?: any },
): Promise<T> {
  const response = await driveFetch(path, options);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Google Drive API error: ${response.status} ${text.slice(0, 300)}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function getDriveConnectionStatus(): Promise<DriveConnectionStatus> {
  try {
    const data = await driveJson<{ user?: { emailAddress?: string } }>(
      '/drive/v3/about?fields=user',
    );
    return {
      connected: true,
      email: data.user?.emailAddress,
      needsReconnection: false,
    };
  } catch (error: any) {
    return {
      connected: false,
      needsReconnection: true,
      error: error.message,
    };
  }
}

/** Trova (o crea) una cartella per nome nella root del Drive. */
async function findOrCreateFolder(folderName: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const search = await driveJson<{ files?: Array<{ id: string; name: string }> }>(
    `/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`,
  );
  if (search.files && search.files.length > 0) {
    console.log(`📁 Found existing folder "${folderName}": ${search.files[0].id}`);
    return search.files[0].id;
  }

  const created = await driveJson<{ id: string }>('/drive/v3/files?fields=id', {
    method: 'POST',
    body: { name: folderName, mimeType: 'application/vnd.google-apps.folder' },
  });
  console.log(`📁 Created new folder "${folderName}": ${created.id}`);
  return created.id;
}

export async function findOrCreateBackupFolder(): Promise<string> {
  return findOrCreateFolder('Image Studio Backups');
}

/**
 * Upload multipart (metadata + contenuto) in un'unica richiesta.
 * Adatto a file già in memoria (buffer).
 */
async function uploadMultipart(
  metadata: Record<string, any>,
  content: Buffer,
  contentMimeType: string,
  fields: string,
): Promise<any> {
  const boundary = `imgstudio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${contentMimeType}\r\n\r\n`,
    'utf-8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
  const body = Buffer.concat([head, content, tail]);

  return driveJson(
    `/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=${encodeURIComponent(fields)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
}

export async function uploadBackupToDrive(
  backupData: any,
  filename: string,
): Promise<{ fileId: string; webViewLink?: string }> {
  const folderId = await findOrCreateBackupFolder();
  const buffer = Buffer.from(JSON.stringify(backupData, null, 2), 'utf-8');

  const data = await uploadMultipart(
    { name: filename, mimeType: 'application/json', parents: [folderId] },
    buffer,
    'application/json',
    'id,webViewLink',
  );

  console.log(`✅ Backup uploaded to Google Drive: ${data.id}`);
  return { fileId: data.id, webViewLink: data.webViewLink || undefined };
}

export async function listBackupsFromDrive(): Promise<
  Array<{
    id: string;
    name: string;
    createdTime: string;
    size: string;
    webViewLink?: string;
  }>
> {
  const folderId = await findOrCreateBackupFolder();
  const q = encodeURIComponent(
    `'${folderId}' in parents and mimeType='application/json' and trashed=false`,
  );
  const data = await driveJson<{ files?: any[] }>(
    `/drive/v3/files?q=${q}&fields=${encodeURIComponent('files(id,name,createdTime,size,webViewLink)')}&orderBy=${encodeURIComponent('createdTime desc')}&pageSize=20`,
  );
  return (data.files || []).map((file) => ({
    id: file.id,
    name: file.name,
    createdTime: file.createdTime,
    size: file.size || '0',
    webViewLink: file.webViewLink || undefined,
  }));
}

export async function downloadBackupFromDrive(fileId: string): Promise<any> {
  const response = await driveFetch(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Google Drive API error: ${response.status} ${text.slice(0, 300)}`);
  }
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse backup JSON:', e);
    throw new Error('Invalid backup file format');
  }
}

export async function deleteBackupFromDrive(fileId: string): Promise<void> {
  await driveJson(`/drive/v3/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
  console.log(`🗑️ Backup deleted from Google Drive: ${fileId}`);
}

// ============================================================================
// CONSEGNE LABORATORIO - Upload file di stampa verso laboratori
// Cartella dedicata, separata dai backup. Link "chiunque con il link" (reader).
// File transitori: auto-eliminati dopo la scadenza.
// ============================================================================

const LAB_PARENT_FOLDER_NAME = 'Image Studio - Consegne Laboratorio';

/**
 * Trova o crea la cartella padre dedicata alle consegne laboratorio.
 * Separata dalla cartella backup ('Image Studio Backups').
 */
export async function findOrCreateLabParentFolder(): Promise<string> {
  return findOrCreateFolder(LAB_PARENT_FOLDER_NAME);
}

/**
 * Crea una sottocartella per una spedizione e la rende condivisibile
 * "chiunque con il link" (reader). Ritorna id + link condivisibile.
 */
export async function createShipmentFolder(
  parentId: string,
  name: string,
  metadata?: {
    labShipmentId?: string;
    orderId?: string;
    expiresAt?: string;
    deferPublicAccess?: boolean;
  },
): Promise<{ folderId: string; webViewLink?: string }> {
  const created = await driveJson<{ id: string; webViewLink?: string }>(
    '/drive/v3/files?fields=id,webViewLink',
    {
      method: 'POST',
      body: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
        ...(metadata
          ? {
              appProperties: Object.fromEntries(
                Object.entries(metadata).filter(
                  ([key, value]) => key !== 'deferPublicAccess' && Boolean(value),
                ),
              ),
            }
          : {}),
      },
    },
  );
  const folderId = created.id;
  if (metadata?.deferPublicAccess) {
    console.log(`📁 Created private shipment folder: ${folderId}`);
    return { folderId };
  }
  try {
    const webViewLink = await shareShipmentFolder(folderId);

    console.log(`📁 Created shipment folder: ${folderId}`);
    return {
      folderId,
      webViewLink: webViewLink || created.webViewLink || undefined,
    };
  } catch (error) {
    // Se la condivisione fallisce, non lasciare una cartella orfana.
    await deleteDriveFile(folderId).catch(() => undefined);
    throw error;
  }
}

/** Rende pubblica-by-link una cartella già persistita con scadenza nel gestionale. */
export async function shareShipmentFolder(folderId: string): Promise<string | undefined> {
  const existing = await driveJson<{
    permissions?: Array<{ id?: string; type?: string; role?: string }>;
  }>(`/drive/v3/files/${encodeURIComponent(folderId)}/permissions?fields=permissions(id,type,role)`);
  if (!existing.permissions?.some(permission =>
    permission.type === 'anyone' && permission.role === 'reader')) {
    await driveJson(`/drive/v3/files/${encodeURIComponent(folderId)}/permissions`, {
      method: 'POST',
      body: { role: 'reader', type: 'anyone', allowFileDiscovery: false },
    });
  }
  const got = await driveJson<{ webViewLink?: string }>(
    `/drive/v3/files/${encodeURIComponent(folderId)}?fields=webViewLink`,
  );
  return got.webViewLink || undefined;
}

/**
 * Condivide una cartella shop solo con l'account Google del laboratorio.
 * Eventuali vecchi permessi `anyone` vengono revocati prima di restituire il link.
 */
export async function shareShipmentFolderWithUser(
  folderId: string,
  emailAddress: string,
): Promise<{ webViewLink?: string; permissionId: string }> {
  const normalizedEmail = emailAddress.trim().toLowerCase();
  const permissions = await driveJson<{
    permissions?: Array<{
      id?: string;
      type?: string;
      role?: string;
      emailAddress?: string;
    }>;
  }>(`/drive/v3/files/${encodeURIComponent(folderId)}/permissions?fields=${encodeURIComponent('permissions(id,type,role,emailAddress)')}`);
  for (const permission of permissions.permissions || []) {
    const isStaleReader =
      permission.type === 'user' &&
      permission.role === 'reader' &&
      permission.emailAddress?.trim().toLowerCase() !== normalizedEmail;
    if ((permission.type === 'anyone' || isStaleReader) && permission.id) {
      await revokeShipmentFolderPermission(folderId, permission.id);
    }
  }
  let permissionId = permissions.permissions?.find(permission =>
    permission.type === 'user' &&
    permission.role === 'reader' &&
    permission.emailAddress?.trim().toLowerCase() === normalizedEmail,
  )?.id;
  if (!permissionId) {
    const created = await driveJson<{ id: string }>(
      `/drive/v3/files/${encodeURIComponent(folderId)}/permissions?sendNotificationEmail=false&fields=id`,
      {
        method: 'POST',
        body: {
          role: 'reader',
          type: 'user',
          emailAddress: normalizedEmail,
        },
      },
    );
    permissionId = created.id;
  }
  const got = await driveJson<{ webViewLink?: string }>(
    `/drive/v3/files/${encodeURIComponent(folderId)}?fields=webViewLink`,
  );
  return { permissionId, webViewLink: got.webViewLink || undefined };
}

export async function revokeShipmentFolderPermission(
  folderId: string,
  permissionId: string,
): Promise<void> {
  await driveJson(
    `/drive/v3/files/${encodeURIComponent(folderId)}/permissions/${encodeURIComponent(permissionId)}`,
    { method: 'DELETE' },
  );
}

/** Recupera una cartella shop creata prima di un crash tra Drive e Firestore. */
export async function findShipmentFolderByShipmentId(
  labShipmentId: string,
): Promise<{ folderId: string; webViewLink?: string } | null> {
  const safeId = labShipmentId.replace(/['\\]/g, '');
  const query = `appProperties has { key='labShipmentId' and value='${safeId}' } and trashed=false`;
  const result = await driveJson<{
    files?: Array<{ id: string; webViewLink?: string }>;
  }>(`/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent('files(id,webViewLink)')}&pageSize=1`);
  const file = result.files?.[0];
  return file ? { folderId: file.id, webViewLink: file.webViewLink } : null;
}

/**
 * Conia una sessione di upload resumable per il browser.
 * L'init passa dal proxy connettori (nessun token esce da questo modulo);
 * la session URI restituita da Google è già autorizzata e viene usata dal
 * browser per i PUT dei chunk. NON loggare né persistere la session URI.
 * CORS: includendo l'header Origin nella richiesta di inizializzazione,
 * Google abilita le risposte CORS sull'URI di sessione restituito, così il
 * browser può caricare i chunk direttamente (PUT cross-origin) senza essere
 * bloccato dalla policy CORS. Senza Origin l'upload dal browser fallisce.
 */
export async function createResumableUploadSession(
  folderId: string,
  fileName: string,
  mimeType: string,
  fileSize: number,
  origin?: string,
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': mimeType,
    'X-Upload-Content-Length': String(fileSize),
  };
  if (origin) headers['Origin'] = origin;

  const response = await driveFetch(
    '/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: fileName, parents: [folderId] }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Google Drive resumable session error: ${response.status} ${errorText}`);
  }

  const location = response.headers.get('location');
  if (!location) {
    throw new Error('Google Drive resumable session: header Location mancante');
  }

  // NON loggare la session URI (contiene credenziali di upload)
  console.log(`✅ Resumable upload session creata per "${fileName}"`);
  return location;
}

/**
 * Carica su Drive (cartella indicata) uno stream di byte SENZA alcuna
 * ricompressione (copia byte-per-byte). Usato per il trasferimento
 * server-side delle pagine fotolibro da Firebase Storage.
 * Implementato come resumable upload: init via proxy, PUT unico sulla
 * session URI di Google (già autorizzata, nessun token esposto).
 */
export async function uploadStreamToDriveFolder(
  folderId: string,
  fileName: string,
  mimeType: string,
  body: Readable,
): Promise<{ fileId: string; webViewLink?: string; size: number }> {
  // Raccogli lo stream in buffer: serve la lunghezza esatta per il PUT unico
  // (le pagine fotolibro sono file singoli gestiti in sequenza).
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);

  const sessionUri = await createResumableUploadSession(
    folderId,
    fileName,
    mimeType || 'application/octet-stream',
    buffer.length,
  );

  const put = await fetch(sessionUri, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType || 'application/octet-stream',
      'Content-Length': String(buffer.length),
    },
    body: buffer,
  });
  if (!put.ok) {
    const text = await put.text().catch(() => '');
    throw new Error(`Google Drive upload error: ${put.status} ${text.slice(0, 300)}`);
  }
  const data: any = await put.json();

  return {
    fileId: data.id,
    webViewLink: data.webViewLink || undefined,
    size: data.size ? parseInt(data.size, 10) : buffer.length,
  };
}

/** Aggiorna il contenuto di un file Drive esistente senza cambiarne ID o nome. */
export async function updateDriveFileContent(
  fileId: string,
  mimeType: string,
  body: Readable,
): Promise<{ fileId: string; webViewLink?: string; size: number }> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  const response = await driveFetch(
    `/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true&fields=${encodeURIComponent('id,webViewLink,size')}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': mimeType || 'application/octet-stream',
        'Content-Length': String(buffer.length),
      },
      body: buffer,
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Google Drive update error: ${response.status} ${text.slice(0, 300)}`);
  }
  const data: any = await response.json();
  return {
    fileId: data.id || fileId,
    webViewLink: data.webViewLink || undefined,
    size: data.size ? parseInt(data.size, 10) : buffer.length,
  };
}

/**
 * Elimina un file o cartella da Drive.
 * Per le cartelle Drive elimina ricorsivamente anche i contenuti.
 */
export async function deleteDriveFile(fileId: string): Promise<void> {
  await driveJson(`/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: 'DELETE',
  });
  console.log(`🗑️ Drive file/folder deleted: ${fileId}`);
}

/**
 * Diagnostica opzionale: info quota storage dell'account Drive connesso.
 */
export async function getDriveStorageInfo(): Promise<{
  limit?: string;
  usage?: string;
  email?: string;
}> {
  const data = await driveJson<{
    storageQuota?: { limit?: string; usage?: string };
    user?: { emailAddress?: string };
  }>(`/drive/v3/about?fields=${encodeURIComponent('storageQuota,user')}`);

  return {
    limit: data.storageQuota?.limit || undefined,
    usage: data.storageQuota?.usage || undefined,
    email: data.user?.emailAddress || undefined,
  };
}
