import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { boundedDriveRequest, driveSessionRequest, transientDriveResponse } from './drive-request.js';
import { orderPhotobookPages, photobookPageFileName, type OrderedPhotobookPage } from './photobook-page-order.js';

export interface DrivePageFile {
  id: string;
  name: string;
  size?: string;
  md5Checksum?: string;
  webViewLink?: string;
  appProperties?: Record<string, string>;
}
const FIELDS = 'id,name,size,md5Checksum,webViewLink,appProperties';

async function json(response: Response): Promise<any> {
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) throw new Error('Limite temporaneo di richieste Google Drive raggiunto. Riprova il trasferimento tra poco.');
    if (response.status >= 500) throw new Error('Google Drive temporaneamente non disponibile. Riprova il trasferimento.');
    throw new Error(`Google Drive: richiesta non riuscita (${response.status}).`);
  }
  return response.json();
}

export async function listPhotobookDriveFiles(folderId: string): Promise<DrivePageFile[]> {
  const files: DrivePageFile[] = [];
  let token = '';
  do {
    const params = new URLSearchParams({
      q: `'${folderId.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' in parents and trashed = false`,
      fields: `nextPageToken,incompleteSearch,files(${FIELDS})`,
      supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', pageSize: '1000',
      ...(token ? { pageToken: token } : {}),
    });
    const data = await json(await boundedDriveRequest(`/drive/v3/files?${params}`, {}, true));
    if (data.incompleteSearch) throw new Error('Inventario Drive incompleto: riprova la verifica prima di inviare.');
    files.push(...(data.files || []));
    token = data.nextPageToken || '';
  } while (token);
  return files;
}

async function sourceIdentity(source: any): Promise<{ size: number; md5: string; mimeType: string }> {
  const [meta] = await source.getMetadata();
  const size = Number(meta.size);
  if (!Number.isSafeInteger(size) || size < 1) throw new Error('Dimensione originale non valida.');
  const mimeType = String(meta.contentType || 'application/octet-stream');
  if (meta.md5Hash) {
    const md5 = Buffer.from(meta.md5Hash, 'base64').toString('hex');
    if (!/^[a-f0-9]{32}$/.test(md5)) throw new Error('Checksum originale non valido.');
    return { size, md5, mimeType };
  }
  // Legacy/emulated objects may not have an MD5. Hash as a stream, not a Buffer.
  const hash = createHash('md5');
  let bytes = 0;
  await pipeline(source.createReadStream(), new Writable({
    write(chunk, _encoding, callback) { hash.update(chunk); bytes += chunk.length; callback(); },
  }), { signal: AbortSignal.timeout(600_000) });
  if (bytes !== size) throw new Error('Originale incompleto durante la verifica.');
  return { size, md5: hash.digest('hex'), mimeType };
}

export function matchDrivePage(files: DrivePageFile[], page: OrderedPhotobookPage, identity: { size: number; md5: string }) {
  const name = photobookPageFileName(page);
  const candidates = files.filter(file => file.name === name);
  if (candidates.length > 1) throw new Error(`Pagina ${page.pageNumber}: copie duplicate su Drive. Verifica manualmente la cartella, senza reinviare.`);
  const file = candidates[0];
  if (!file) return undefined;
  const sourceKey = createHash('sha256').update(page.storagePath).digest('hex');
  if (Number(file.size) !== identity.size || file.md5Checksum !== identity.md5
    || (file.appProperties?.pbSource && file.appProperties.pbSource !== sourceKey)
    || (file.appProperties?.pbPage && file.appProperties.pbPage !== page.id)) {
    throw new Error(`Pagina ${page.pageNumber}: file Drive diverso dall’originale corrente. Serve una verifica manuale prima di riprovare.`);
  }
  return file;
}

/** Read-only, byte-level gate. Remote filenames alone never prove completion. */
export async function verifyPhotobookDrivePages(folderId: string, pages: OrderedPhotobookPage[], bucket: any) {
  const ordered = orderPhotobookPages(pages);
  if (!ordered.length) throw new Error('Nessuna pagina corrente da verificare su Drive.');
  const names = new Set(ordered.map(photobookPageFileName));
  const files = await listPhotobookDriveFiles(folderId);
  const unexpected = files.filter(file => /^pagina-\d+-/.test(file.name) && !names.has(file.name));
  if (unexpected.length) throw new Error(`Drive contiene ${unexpected.length} pagine obsolete: occorre archiviarle esplicitamente prima dell’invio.`);
  const verified: DrivePageFile[] = [];
  // Bound concurrent Storage metadata requests while preserving numeric order.
  for (let offset = 0; offset < ordered.length; offset += 4) {
    verified.push(...await Promise.all(ordered.slice(offset, offset + 4).map(async page => {
      const identity = await sourceIdentity(bucket.file(page.storagePath));
      const file = matchDrivePage(files, page, identity);
      if (!file) throw new Error(`Pagina ${page.pageNumber} mancante su Drive. Riprova il trasferimento delle pagine.`);
      return file;
    })));
  }
  return verified;
}

/** Each page gets a durable preallocated ID BEFORE opening a session.
 * Reuse it after lost responses/crashes; never create a second ID on ambiguity.
 * Bytes are spooled to temporary disk and sent in 8 MiB chunks (bounded RAM). */
export async function copyPhotobookPage(options: {
  folderId: string;
  page: OrderedPhotobookPage;
  source: any;
  reservedId?: string;
  reserve(id: string): Promise<void>;
  assertActive(): Promise<void>;
}) {
  const { folderId, page, source, assertActive } = options;
  const identity = await sourceIdentity(source);
  const existing = matchDrivePage(await listPhotobookDriveFiles(folderId), page, identity);
  if (existing) return { file: existing, skipped: true };
  let fileId = options.reservedId;
  if (!fileId) {
    const ids = await json(await boundedDriveRequest('/drive/v3/files/generateIds?count=1&space=drive&type=files', {}, true));
    fileId = ids.ids?.[0];
    if (!fileId) throw new Error('Impossibile riservare l’identità della pagina su Drive.');
    await options.reserve(fileId);
  }
  const directory = await mkdtemp(join(tmpdir(), 'photobook-page-'));
  const path = join(directory, 'original');
  const deadline = Date.now() + 30 * 60_000;
  try {
    const hash = createHash('md5');
    let bytes = 0;
    await pipeline(source.createReadStream(), new Transform({
      transform(chunk, _encoding, callback) { hash.update(chunk); bytes += chunk.length; callback(null, chunk); },
    }), createWriteStream(path, { flags: 'wx' }), { signal: AbortSignal.timeout(600_000) });
    if (bytes !== identity.size || hash.digest('hex') !== identity.md5) throw new Error('L’originale è cambiato durante la copia. Riprova dalla versione corrente.');
    await assertActive();
    const metadata = {
      id: fileId, name: photobookPageFileName(page), parents: [folderId],
      appProperties: { pbPage: page.id, pbSource: createHash('sha256').update(page.storagePath).digest('hex') },
    };
    // Preallocated ID makes POST replay safe, including lost session responses.
    const initialize = () => boundedDriveRequest('/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Length': String(bytes), 'X-Upload-Content-Type': identity.mimeType },
      body: JSON.stringify(metadata),
    }, true);
    let init = await initialize();
    if (init.status === 409) {
      const recovered = matchDrivePage(await listPhotobookDriveFiles(folderId), page, identity);
      if (recovered?.id === fileId) return { file: recovered, skipped: true };
      // The original ID may have been permanently deleted, trashed or moved
      // outside this folder since a previous successful transfer. Do not touch
      // that file; reserve a replacement only after checking its real location.
      const previous = await boundedDriveRequest(`/drive/v3/files/${encodeURIComponent(fileId!)}?fields=id,parents,trashed&supportsAllDrives=true`, {}, true);
      const previousData = previous.ok ? await previous.json() as any : undefined;
      if (previous.status !== 404 && (!previous.ok || (!previousData.trashed && previousData.parents?.includes(folderId)))) {
        throw new Error('Identità Drive già utilizzata: verifica la copia prima di riprovare.');
      }
      await assertActive();
      const ids = await json(await boundedDriveRequest('/drive/v3/files/generateIds?count=1&space=drive&type=files', {}, true));
      fileId = ids.ids?.[0];
      if (!fileId) throw new Error('Impossibile riservare la pagina sostitutiva.');
      await options.reserve(fileId);
      metadata.id = fileId;
      init = await initialize();
    }
    if (!init.ok) throw new Error(`Avvio upload Drive non riuscito (${init.status}).`);
    const session = init.headers.get('location');
    // The connector-provided capability URL is never logged or persisted.
    if (!session || !/^https:\/\/(?:www\.)?googleapis\.com\//.test(session)) throw new Error('Sessione upload Drive non valida.');
    let offset = 0;
    let failures = 0;
    const handle = await open(path, 'r');
    try {
      while (offset < bytes) {
        if (Date.now() >= deadline) throw new Error('Tempo massimo per la pagina superato. Riprendi il trasferimento.');
        await assertActive();
        const chunk = Buffer.alloc(Math.min(8 * 1024 * 1024, bytes - offset));
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, offset);
        if (bytesRead !== chunk.length) throw new Error('File temporaneo incompleto.');
        let response: Response | undefined;
        try {
          response = await driveSessionRequest(session, { method: 'PUT', headers: {
            'Content-Type': identity.mimeType, 'Content-Length': String(chunk.length),
            'Content-Range': `bytes ${offset}-${offset + chunk.length - 1}/${bytes}`,
          }, body: chunk, signal: AbortSignal.timeout(60_000) });
          if (response.ok) { offset = bytes; break; }
          if (response.status !== 308 && !transientDriveResponse(response.status, await response.clone().text())) {
            throw new Error(`Upload Drive rifiutato (${response.status}).`);
          }
        } catch (error) {
          // A rejected HTTP response is definitive; only transport uncertainty
          // and transient statuses are probed before retrying.
          if (response && response.status !== 308 && !transientDriveResponse(response.status, await response.clone().text())) throw error;
        }
        if (!response || response.status !== 308) {
          if (++failures > 4) throw new Error('Upload interrotto dopo più tentativi. Riprendi il trasferimento.');
          await sleep(Math.min(8000, 500 * 2 ** (failures - 1)));
          // Never blindly replay bytes after a timeout. Ask which bytes committed.
          response = await driveSessionRequest(session, { method: 'PUT', headers: {
            'Content-Length': '0', 'Content-Range': `bytes */${bytes}`,
          }, signal: AbortSignal.timeout(60_000) });
          if (response.ok) { offset = bytes; break; }
          if (response.status !== 308) throw new Error(`Stato upload incerto (${response.status}). Riprendi per riconciliare Drive.`);
        }
        const end = response.headers.get('range')?.match(/^bytes=0-(\d+)$/)?.[1];
        const next = end ? Number(end) + 1 : 0;
        if (next < offset || next > bytes) throw new Error('Avanzamento upload Drive non valido.');
        if (next === offset && ++failures > 4) throw new Error('Upload Drive senza avanzamento. Riprova.');
        offset = next;
      }
    } finally { await handle.close(); }
    const copied = matchDrivePage(await listPhotobookDriveFiles(folderId), page, identity);
    if (!copied || copied.id !== fileId) throw new Error('Upload non ancora verificato su Drive. Riprendi per riconciliare la pagina.');
    return { file: copied, skipped: false };
  } catch (error) {
    // Covers a lost completion response and a crash before Firestore persistence.
    await assertActive();
    const recovered = matchDrivePage(await listPhotobookDriveFiles(folderId), page, identity);
    if (recovered) return { file: recovered, skipped: true };
    if ((error as NodeJS.ErrnoException)?.code === 'ENOSPC') {
      throw new Error('Spazio temporaneo del server esaurito durante la preparazione della pagina. Libera spazio prima di riprovare.');
    }
    throw error;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
