import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { isIP } from 'node:net';
import { FieldPath } from 'firebase-admin/firestore';
import { BlogPostStatus } from '@shared/schema';
import {
  blogSocialImage,
  normalizePublicImageUrl,
  pageSocialImage,
  weddingSocialImage,
} from '@shared/social-metadata';
import { db as firebaseDb } from './firebase-admin.js';
import { loadGallery, loadSelectedPhotos, storyFromDocument } from './wedding-seo.js';
import { logger } from './lib/logger.js';
import { sendAdminSystemAlert } from './system-alerts.js';

const DOCUMENT_PAGE_SIZE = 40;
export const MAX_SOCIAL_COVER_PROBES_PER_RUN = 120;
const PROBE_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 7_000;
const MAX_RESPONSE_BYTES = 8 * 1024;
const HEALTH_COLLECTION = 'socialCoverHealth';
const STATE_DOC = 'scan-state';

export type SocialCoverKind = 'article' | 'real_wedding' | 'campaign';

export interface SocialCoverCandidate {
  key: string;
  kind: SocialCoverKind;
  title: string;
  pageUrl: string;
  imageUrl: string;
}

export interface SocialCoverProbeResult {
  ok: boolean;
  reason?: string;
}

interface SocialCoverHealthDeps {
  db?: any;
  now?: () => number;
  loadCandidates?: () => Promise<SocialCoverCandidate[]>;
  probe?: (url: string) => Promise<SocialCoverProbeResult>;
  notify?: (newFailures: Array<SocialCoverCandidate & { reason: string }>) => Promise<void>;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrlForDisplay(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function parseAbsolutePublicHttpsUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || (url.port && url.port !== '443')
      || isIP(hostname)
      || !normalizePublicImageUrl(rawUrl)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split('.').map(Number);
    const [a, b] = octets;
    return !(
      a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 88 && octets[2] === 99)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && octets[2] === 100)
      || (a === 203 && b === 0 && octets[2] === 113)
      || a >= 224
    );
  }
  if (family !== 6) return false;

  const normalized = address.toLowerCase();
  const mapped = normalized.match(/^(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicAddress(mapped[1]);

  const firstHextet = Number.parseInt(normalized.split(':')[0] || '0', 16);
  // Restrict to IPv6 global unicast (2000::/3), excluding transition,
  // documentation, benchmarking, and other special-purpose allocations.
  if (firstHextet < 0x2000 || firstHextet >= 0x3fff) return false;
  if (/^2001:(?:0|2|10|20|db8):/i.test(normalized) || /^2002:/i.test(normalized)) return false;
  return true;
}

function isSupportedImage(contentType: string, bytes: Buffer): boolean {
  const type = contentType.split(';', 1)[0].trim().toLowerCase();
  if (type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === 'image/gif') return bytes.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/) !== null;
  if (type === 'image/webp') return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (type === 'image/avif' || type === 'image/avif-sequence') {
    const brand = bytes.toString('ascii', 8, 12);
    return bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp' && (brand === 'avif' || brand === 'avis');
  }
  return false;
}

/**
 * Probe without following redirects or downloading an unbounded response.
 * DNS is resolved once, every answer must be globally routable, and the
 * connection is pinned to one of those validated answers.
 */
export async function probeSocialCover(rawUrl: string): Promise<SocialCoverProbeResult> {
  const url = parseAbsolutePublicHttpsUrl(rawUrl);
  if (!url) return { ok: false, reason: 'URL non HTTPS o non consentito' };

  let addresses: Array<{ address: string; family: number }>;
  let dnsTimer: NodeJS.Timeout | undefined;
  try {
    addresses = await Promise.race([
      lookup(url.hostname, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => {
        dnsTimer = setTimeout(() => reject(new Error('DNS timeout')), REQUEST_TIMEOUT_MS);
        dnsTimer.unref?.();
      }),
    ]) as Array<{ address: string; family: number }>;
  } catch {
    return { ok: false, reason: 'Risoluzione DNS non riuscita' };
  } finally {
    if (dnsTimer) clearTimeout(dnsTimer);
  }
  const publicAddresses = addresses.filter(record => isPublicAddress(record.address));
  if (addresses.length === 0 || publicAddresses.length !== addresses.length) {
    return { ok: false, reason: 'Host senza soli indirizzi IP pubblici' };
  }
  const address = publicAddresses[0];

  return new Promise(resolve => {
    let settled = false;
    let hardTimeout: NodeJS.Timeout | undefined;
    let request: ReturnType<typeof https.request>;
    const finish = (result: SocialCoverProbeResult) => {
      if (settled) return;
      settled = true;
      if (hardTimeout) clearTimeout(hardTimeout);
      resolve(result);
    };
    const pinnedLookup = (_hostname: string, options: any, callback: (...args: any[]) => void) => {
      if (options?.all) {
        callback(null, [{ address: address.address, family: address.family }]);
      } else {
        callback(null, address.address, address.family);
      }
    };
    request = https.request(url, {
      method: 'GET',
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif',
        Range: `bytes=0-${MAX_RESPONSE_BYTES - 1}`,
        'User-Agent': 'ImageStudioSocialCoverHealth/1.0',
      },
      lookup: pinnedLookup as any,
      servername: url.hostname,
      maxHeaderSize: 8 * 1024,
    }, response => {
      if (response.statusCode !== 200 && response.statusCode !== 206) {
        finish({ ok: false, reason: `Risposta HTTP ${response.statusCode || 'sconosciuta'}` });
        request.destroy();
        return;
      }
      const contentType = String(response.headers['content-type'] || '');
      if (!contentType.toLowerCase().startsWith('image/')) {
        finish({ ok: false, reason: 'La risposta non dichiara un tipo immagine' });
        request.destroy();
        return;
      }

      const chunks: Buffer[] = [];
      let bytesRead = 0;
      response.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = MAX_RESPONSE_BYTES - bytesRead;
        if (remaining > 0) {
          const accepted = buffer.subarray(0, remaining);
          chunks.push(accepted);
          bytesRead += accepted.length;
        }
        const sample = Buffer.concat(chunks, bytesRead);
        if (isSupportedImage(contentType, sample)) {
          finish({ ok: true });
          request.destroy();
        } else if (bytesRead >= MAX_RESPONSE_BYTES) {
          finish({ ok: false, reason: 'Il contenuto non è un’immagine supportata valida' });
          request.destroy();
        }
      });
      response.on('end', () => {
        if (!settled) {
          const sample = Buffer.concat(chunks, bytesRead);
          finish(isSupportedImage(contentType, sample)
            ? { ok: true }
            : { ok: false, reason: 'Contenuto immagine vuoto o non valido' });
        }
      });
      response.on('error', () => finish({ ok: false, reason: 'Errore durante la lettura della risposta' }));
    });

    hardTimeout = setTimeout(() => {
      finish({ ok: false, reason: 'Timeout durante il controllo' });
      request.destroy();
    }, REQUEST_TIMEOUT_MS);
    hardTimeout.unref?.();
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      finish({ ok: false, reason: 'Timeout durante il controllo' });
      request.destroy();
    });
    request.on('error', () => finish({ ok: false, reason: 'Connessione HTTPS non riuscita' }));
    request.end();
  });
}

function makeCandidate(
  kind: SocialCoverKind,
  id: string,
  title: unknown,
  pageUrl: string,
  imageUrl: unknown,
): SocialCoverCandidate | null {
  if (typeof imageUrl !== 'string' || !imageUrl.trim()) return null;
  // Relative/local URLs and expiring URLs are intentionally left to the
  // existing social metadata resolver and are never checked by this worker.
  if (!/^https:\/\//i.test(imageUrl.trim())) return null;
  const normalized = normalizePublicImageUrl(imageUrl);
  if (!normalized || !parseAbsolutePublicHttpsUrl(normalized)) return null;
  return {
    key: `${kind}:${id}`,
    kind,
    title: String(title || id).slice(0, 160),
    pageUrl,
    imageUrl: normalized,
  };
}

async function loadDocumentPage(
  database: any,
  collectionName: string,
  cursor: string | null,
  status?: string,
): Promise<{ docs: any[]; cursor: string | null }> {
  const buildQuery = () => {
    let query = database.collection(collectionName);
    if (status) query = query.where('status', '==', status);
    return query.orderBy(FieldPath.documentId()).limit(DOCUMENT_PAGE_SIZE + 1);
  };

  let query = buildQuery();
  if (cursor) {
    const cursorDocument = await database.collection(collectionName).doc(cursor).get();
    if (cursorDocument.exists) query = query.startAfter(cursorDocument);
  }
  let snapshot = await query.get();
  if (snapshot.empty && cursor) {
    snapshot = await buildQuery().get();
  }

  const docs = snapshot.docs.slice(0, DOCUMENT_PAGE_SIZE);
  return {
    docs,
    cursor: snapshot.docs.length > DOCUMENT_PAGE_SIZE ? docs.at(-1)?.id || null : null,
  };
}

async function loadSocialCoverCandidatePage(
  database: any,
  cursors: Record<string, string | null>,
): Promise<{ candidates: SocialCoverCandidate[]; nextCursors: Record<string, string | null> }> {
  const [articles, stories, campaigns] = await Promise.all([
    loadDocumentPage(database, 'blogPosts', cursors.articles || null, BlogPostStatus.PUBLISHED),
    loadDocumentPage(database, 'weddingSeoStories', cursors.stories || null, 'published'),
    loadDocumentPage(database, 'booking_campaigns', cursors.campaigns || null),
  ]);
  const nextCursors = { articles: articles.cursor, stories: stories.cursor, campaigns: campaigns.cursor };

  const candidates: SocialCoverCandidate[] = [];

  for (const document of articles.docs) {
    const post = document.data();
    const image = blogSocialImage(post);
    if (image.source !== 'editorial-cover' && image.source !== 'content-image') continue;
    const candidate = makeCandidate(
      'article',
      document.id,
      post.title,
      `/blog/${encodeURIComponent(String(post.slug || document.id))}`,
      image.url,
    );
    if (candidate) candidates.push(candidate);
  }

  for (const document of stories.docs) {
    const story = storyFromDocument(document.id, document.data());
    const gallery = await loadGallery(story.galleryId);
    const coverPhotoId = story.coverPhotoId && story.selectedPhotoIds.includes(story.coverPhotoId)
      ? story.coverPhotoId
      : story.selectedPhotoIds[0];
    if (!gallery || !coverPhotoId) continue;
    const [photo] = await loadSelectedPhotos(gallery, [coverPhotoId]);
    const image = weddingSocialImage(story.title, photo ? [photo] : []);
    if (image.source !== 'selected-photo') continue;
    const candidate = makeCandidate(
      'real_wedding',
      document.id,
      story.title,
      `/real-wedding/${encodeURIComponent(story.slug)}`,
      image.url,
    );
    if (candidate) candidates.push(candidate);
  }

  for (const document of campaigns.docs) {
    const campaign = document.data();
    const code = typeof campaign.code === 'string' ? campaign.code.trim() : '';
    if (!code) continue;
    const pagePath = `/prenota/${encodeURIComponent(code)}`;
    const image = pageSocialImage(pagePath, [{
      url: campaign.immaginePaginaBooking,
      alt: String(campaign.nome || 'Prenotazione'),
      source: 'editorial-cover',
    }]);
    if (image.source !== 'editorial-cover') continue;
    const candidate = makeCandidate(
      'campaign',
      document.id,
      campaign.nome || code,
      pagePath,
      image.url,
    );
    if (candidate) candidates.push(candidate);
  }

  // Each source contributes at most 40 documents, so even when every document
  // has a remote cover this page never exceeds the 120-request run budget.
  return { candidates, nextCursors };
}

function buildAdminEmail(failures: Array<SocialCoverCandidate & { reason: string }>): string {
  const rows = failures.map(item => `
    <li style="margin:0 0 16px">
      <strong>${escapeHtml(item.kind.replace('_', ' '))}: ${escapeHtml(item.title)}</strong><br>
      <a href="https://imagestudiofotografico.com${escapeHtml(item.pageUrl)}">${escapeHtml(item.pageUrl)}</a><br>
      Immagine: <a href="${escapeHtml(safeUrlForDisplay(item.imageUrl))}">${escapeHtml(safeUrlForDisplay(item.imageUrl))}</a><br>
      Esito: ${escapeHtml(item.reason)}
    </li>`).join('');
  return `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto">
    <h2>Copertine social non raggiungibili</h2>
    <p>Il controllo periodico ha rilevato copertine che non restituiscono un’immagine valida. I contenuti non sono stati modificati.</p>
    <ul>${rows}</ul>
    <p>Controllo automatico con timeout e accesso limitato agli host HTTPS pubblici; i redirect non vengono seguiti.</p>
  </div>`;
}

async function resolveSocialCoverNotifications(
  database: any,
  relatedDocId: string,
  resolvedAt: number,
): Promise<number> {
  const snapshot = await database.collection('adminNotifications')
    .where('relatedDocId', '==', relatedDocId)
    .get();
  const unresolved = snapshot.docs.filter((document: any) => {
    const data = document.data();
    return data.type === 'social_cover_unavailable' && data.isResolved !== true;
  });

  await Promise.all(unresolved.map((document: any) => document.ref.update({
    isRead: true,
    isResolved: true,
    resolvedAt: new Date(resolvedAt),
  })));
  return unresolved.length;
}

async function notifyAdmin(failures: Array<SocialCoverCandidate & { reason: string }>): Promise<void> {
  if (!failures.length) return;
  const subject = `Copertine social non raggiungibili (${failures.length})`;
  const list = failures.slice(0, 20).map(item =>
    `<li><strong>${escapeHtml(item.title)}</strong> — ${escapeHtml(item.pageUrl)}: ${escapeHtml(item.reason)}</li>`,
  ).join('');
  await sendAdminSystemAlert(
    'social_cover_unavailable',
    subject,
    buildAdminEmail(failures),
  );
  logger.warn({ count: failures.length, entries: list }, 'Social covers unavailable');
}

async function performSocialCoverHealthCheck(deps: SocialCoverHealthDeps = {}): Promise<{
  candidates: number;
  checked: number;
  unavailable: number;
  newFailures: number;
}> {
  const database = deps.db || firebaseDb;
  const now = deps.now || Date.now;
  const stateRef = database.collection(HEALTH_COLLECTION).doc(STATE_DOC);
  const stateSnapshot = await stateRef.get();
  const state = stateSnapshot.data() || {};
  const isInjectedCandidateList = Boolean(deps.loadCandidates);
  const sourceCursors = state.sourceCursors || {};
  const candidatePage = isInjectedCandidateList
    ? null
    : await loadSocialCoverCandidatePage(database, sourceCursors);
  const candidates = deps.loadCandidates
    ? await deps.loadCandidates()
    : candidatePage!.candidates;
  if (!candidates.length) {
    if (candidatePage) {
      await stateRef.set({
        sourceCursors: candidatePage.nextCursors,
        candidateCount: 0,
        lastRunAt: new Date(now()),
      }, { merge: true });
    }
    return { candidates: 0, checked: 0, unavailable: 0, newFailures: 0 };
  }

  const start = Number(state.cursor || 0) % candidates.length;
  const checkedCandidates = isInjectedCandidateList
    ? candidates.slice(start, start + MAX_SOCIAL_COVER_PROBES_PER_RUN)
    : candidates.slice(0, MAX_SOCIAL_COVER_PROBES_PER_RUN);

  const failures: Array<SocialCoverCandidate & { reason: string }> = [];
  const newFailures: Array<SocialCoverCandidate & { reason: string }> = [];
  const probe = deps.probe || probeSocialCover;
  const checkedAt = now();

  for (let offset = 0; offset < checkedCandidates.length; offset += PROBE_CONCURRENCY) {
    const batch = checkedCandidates.slice(offset, offset + PROBE_CONCURRENCY);
    await Promise.all(batch.map(async candidate => {
      const result = await probe(candidate.imageUrl).catch(() => ({ ok: false, reason: 'Errore di rete' }));
      const outcome = result.ok ? null : String(result.reason || 'Immagine non raggiungibile').slice(0, 180);
      if (outcome) failures.push({ ...candidate, reason: outcome });

      const itemHash = hash(candidate.key);
      const itemRef = database.collection(HEALTH_COLLECTION).doc(itemHash);
      const notificationRef = database.collection('adminNotifications')
        .doc(`social-cover-${itemHash}-${checkedAt}`);
      const transition = await database.runTransaction(async (transaction: any) => {
        const previous = await transaction.get(itemRef);
        const previousData = previous.exists ? previous.data() : {};
        const alreadyBroken = previousData?.urlHash === hash(candidate.imageUrl) && previousData?.isBroken === true;
        const isBroken = outcome !== null;
        const shouldResolveNotifications = !isBroken
          && (previousData?.isBroken === true || !previousData?.lastHealthyAt);
        transaction.set(itemRef, {
          key: candidate.key,
          kind: candidate.kind,
          title: candidate.title,
          pageUrl: candidate.pageUrl,
          safeImageUrl: safeUrlForDisplay(candidate.imageUrl),
          urlHash: hash(candidate.imageUrl),
          isBroken,
          reason: outcome || null,
          lastHealthyAt: isBroken ? null : new Date(checkedAt),
          checkedAt: new Date(checkedAt),
        });
        if (isBroken && !alreadyBroken) {
          transaction.create(notificationRef, {
            type: 'social_cover_unavailable',
            title: 'Copertina social non raggiungibile',
            description: `${candidate.title} · ${candidate.kind.replace('_', ' ')} — ${outcome}`,
            relatedDocId: candidate.key,
            relatedDocType: candidate.kind,
            isRead: false,
            isResolved: false,
            createdAt: new Date(checkedAt),
            deepLink: candidate.pageUrl,
            safeImageUrl: safeUrlForDisplay(candidate.imageUrl),
          });
        }
        return {
          becameBroken: isBroken && !alreadyBroken,
          shouldResolveNotifications,
        };
      });
      if (transition.shouldResolveNotifications) {
        await resolveSocialCoverNotifications(database, candidate.key, checkedAt).catch(error => {
          logger.warn({ err: error, key: candidate.key }, 'Unable to resolve recovered social cover notifications');
        });
      }
      if (transition.becameBroken && outcome) newFailures.push({ ...candidate, reason: outcome });
    }));
  }

  await stateRef.set({
    ...(isInjectedCandidateList
      ? { cursor: (start + checkedCandidates.length) % candidates.length }
      : { sourceCursors: candidatePage!.nextCursors }),
    candidateCount: candidates.length,
    lastRunAt: new Date(checkedAt),
  }, { merge: true });

  if (newFailures.length) {
    await (deps.notify || notifyAdmin)(newFailures).catch(error => {
      logger.error({ err: error }, 'Unable to send social cover health alert');
    });
  }
  return {
    candidates: candidates.length,
    checked: checkedCandidates.length,
    unavailable: failures.length,
    newFailures: newFailures.length,
  };
}

let socialCoverCheckInProgress = false;

export async function runSocialCoverHealthCheck(deps: SocialCoverHealthDeps = {}): Promise<{
  candidates: number;
  checked: number;
  unavailable: number;
  newFailures: number;
}> {
  if (socialCoverCheckInProgress) {
    return { candidates: 0, checked: 0, unavailable: 0, newFailures: 0 };
  }
  socialCoverCheckInProgress = true;
  try {
    return await performSocialCoverHealthCheck(deps);
  } finally {
    socialCoverCheckInProgress = false;
  }
}
