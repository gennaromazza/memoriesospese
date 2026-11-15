import { ReplitConnectors } from '@replit/connectors-sdk';
import { setTimeout as sleep } from 'node:timers/promises';

const TRANSIENT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'sharingRateLimitExceeded', 'backendError']);

export function transientDriveResponse(status: number, body: string): boolean {
  if (status === 408 || status === 429 || status >= 500) return true;
  if (status !== 403) return false;
  try {
    const errors = JSON.parse(body)?.error?.errors || [];
    return errors.some((entry: any) => TRANSIENT_REASONS.has(entry.reason));
  } catch { return false; }
}

/** Only session URLs returned by Drive are accepted, never arbitrary URLs. */
export function driveSessionRequest(session: string, options: RequestInit): Promise<Response> {
  if (!/^https:\/\/(?:www\.)?googleapis\.com\//.test(session)) throw new Error('Sessione upload Drive non valida.');
  return fetch(session, { ...options, signal: AbortSignal.timeout(60_000) });
}

/** Only safe/idempotent requests may use automatic retries. Callers creating
 * files must reserve a Drive ID first; ordinary POSTs are never retried here. */
export async function boundedDriveRequest(
  path: string,
  options: RequestInit = {},
  retry = false,
): Promise<Response> {
  const connectors = new ReplitConnectors();
  const proxyFetch = connectors.createProxyFetch('google-drive');
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await proxyFetch(path, { ...options, signal: AbortSignal.timeout(60_000) });
    } catch {
      if (!retry || attempt >= 4) throw new Error('Richiesta Google Drive scaduta o connessione interrotta. Riprova il trasferimento.');
      await sleep(Math.min(8000, 500 * 2 ** attempt));
      continue;
    }
    if (response.ok || response.status === 308) return response;
    const body = await response.clone().text();
    const transient = transientDriveResponse(response.status, body);
    if (retry && transient && attempt < 4) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Math.min(15_000, Math.max(500 * 2 ** attempt, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0)));
      continue;
    }
    if (response.status === 401) throw new Error('GOOGLE_DRIVE_RECONNECTION_NEEDED: autorizzazione Google Drive scaduta.');
    if (response.status === 403 && !transient) {
      throw new Error('Google Drive ha negato l’accesso: verifica permessi e quota della cartella. Non è un limite temporaneo di richieste.');
    }
    return response;
  }
}
