import { signInWithCustomToken } from 'firebase/auth';
import { auth } from './firebase';
import { getApiUrl } from './api';

const SECURITY_BASE = '/api/admin/security/desktop-handoff';
const HANDOFF_TTL_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

interface HandoffApi {
  handoffId: string;
  verificationUrl: string;
  expiresAt: number;
}

export interface DesktopPasskeyClaim {
  req: boolean;
  exp: number;
  at: number;
  sat: number;
}

export class DesktopPasskeySessionRefreshError extends Error {
  constructor(
    public readonly expectedClaim: DesktopPasskeyClaim,
    public readonly expectedUid: string,
  ) {
    super('La verifica è stata completata, ma Windows non ha ancora aggiornato la sessione. Riprova l’aggiornamento senza ripetere la verifica.');
    this.name = 'DesktopPasskeySessionRefreshError';
  }
}

export class DesktopPasskeyFinalizeRetryError extends Error {
  constructor(public readonly expectedUid: string) {
    super('La verifica è completa, ma la risposta del server non è stata confermata. Riprova la finalizzazione senza ripetere la verifica.');
    this.name = 'DesktopPasskeyFinalizeRetryError';
  }
}

class HandoffHttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'HandoffHttpError';
  }
}

interface HandoffDependencies {
  request<T>(path: string, body: unknown): Promise<T>;
  openExternal(url: string): Promise<void>;
  signIn(customToken: string): Promise<void>;
  getCurrentUser(): {
    uid: string;
    getIdTokenResult(forceRefresh?: boolean): Promise<{
      claims: Record<string, unknown>;
    }>;
  } | null;
  waitForCurrentUser?(): Promise<{
    uid: string;
    getIdTokenResult(forceRefresh?: boolean): Promise<{
      claims: Record<string, unknown>;
    }>;
  } | null>;
  confirmSession?(expectedClaim: DesktopPasskeyClaim): Promise<boolean>;
  createVerifier(): Promise<{ verifier: string; verifierHash: string }>;
  sleep(milliseconds: number): Promise<void>;
  now(): number;
  monotonicNow?(): number;
  pollIntervalMs: number;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createVerifier(): Promise<{ verifier: string; verifierHash: string }> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const digest = await crypto.subtle.digest('SHA-256', verifierBytes);
  return {
    verifier: base64Url(verifierBytes),
    verifierHash: base64Url(new Uint8Array(digest)),
  };
}

async function request<T>(
  path: string,
  body: unknown,
  basePath = SECURITY_BASE,
  method: 'POST' | 'GET' = 'POST',
): Promise<T> {
  // A newly loaded renderer may still be restoring its persisted Firebase user.
  // A temporarily-null currentUser is not proof that the login has expired.
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error('Sessione Windows scaduta: accedi di nuovo.');

  const send = async (forceRefresh: boolean) => fetch(getApiUrl(`${basePath}${path}`), {
    method,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken(forceRefresh)}`,
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
  let response = await send(false);
  if (response.status === 401 && auth.currentUser?.uid === user.uid) {
    // Retry only an explicit auth rejection, which occurs before the handoff
    // operation. Never replay a redemption after an uncertain/network response.
    response = await send(true);
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new HandoffHttpError(
      typeof payload.error === 'string'
        ? payload.error
        : `Verifica Windows non riuscita (${response.status})`,
      response.status,
    );
  }
  return payload as T;
}

async function openExternal(url: string): Promise<void> {
  const parsed = new URL(url);
  if (
    parsed.origin !== 'https://imagestudiofotografico.com' ||
    parsed.pathname !== '/admin/sicurezza' ||
    !parsed.searchParams.has('desktopHandoff')
  ) {
    throw new Error('Il server ha restituito un indirizzo di verifica non attendibile.');
  }
  const desktop = window.imageStudioDesktop;
  if (!desktop) {
    throw new Error('Apri questa richiesta dall’app Windows installata.');
  }
  await desktop.openExternal(parsed.toString());
}

function createRuntimeDependencies(): HandoffDependencies {
  return {
    request,
    openExternal,
    signIn: async (customToken) => {
      await signInWithCustomToken(auth, customToken);
    },
    getCurrentUser: () => auth.currentUser,
    waitForCurrentUser: async () => {
      await auth.authStateReady();
      return auth.currentUser;
    },
    confirmSession: async (expectedClaim) => {
      const status = await request<{
        passkeyRequired: boolean;
        verified: boolean;
        verifiedUntil: number;
      }>('/status', undefined, '/api/admin/security', 'GET');
      return status.passkeyRequired === false ||
        (status.verified === true && status.verifiedUntil === expectedClaim.exp);
    },
    createVerifier,
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now: () => Date.now(),
    monotonicNow: () => performance.now(),
    pollIntervalMs: POLL_INTERVAL_MS,
  };
}

export async function refreshDesktopPasskeySession(
  expectedClaim: DesktopPasskeyClaim,
  expectedUid: string,
  dependencies: HandoffDependencies = createRuntimeDependencies(),
): Promise<void> {
  const user = dependencies.getCurrentUser();
  if (!user || user.uid !== expectedUid) {
    throw new Error('L’account Windows è cambiato. Accedi con l’account verificato e aggiorna la sessione.');
  }

  let claims: Record<string, unknown>;
  try {
    claims = (await user.getIdTokenResult(true)).claims;
  } catch {
    throw new DesktopPasskeySessionRefreshError(expectedClaim, expectedUid);
  }

  const authTime = claims.auth_time;
  const actual = claims.apk;
  const actualClaim = actual && typeof actual === 'object'
    ? actual as Record<string, unknown>
    : null;
  if (
    !actualClaim ||
    actualClaim.req !== expectedClaim.req ||
    typeof actualClaim.exp !== 'number' ||
    !Number.isFinite(actualClaim.exp) ||
    typeof actualClaim.at !== 'number' ||
    !Number.isFinite(actualClaim.at) ||
    typeof actualClaim.sat !== 'number' ||
    !Number.isFinite(actualClaim.sat) ||
    actualClaim.exp !== expectedClaim.exp ||
    actualClaim.at !== expectedClaim.at ||
    actualClaim.sat !== expectedClaim.sat ||
    authTime !== expectedClaim.sat
  ) {
    throw new DesktopPasskeySessionRefreshError(expectedClaim, expectedUid);
  }
  try {
    // Validity is checked with the server clock too: a Windows date far ahead
    // must not reject a freshly issued proof (nor accept a revoked/expired one).
    const valid = dependencies.confirmSession
      ? await dependencies.confirmSession(expectedClaim)
      : expectedClaim.exp > dependencies.now();
    if (!valid) throw new Error('Session verification rejected');
  } catch {
    throw new DesktopPasskeySessionRefreshError(expectedClaim, expectedUid);
  }
}

export async function finalizeDesktopPasskeySession(
  expectedUid: string,
  dependencies: HandoffDependencies = createRuntimeDependencies(),
): Promise<void> {
  const user = dependencies.getCurrentUser();
  if (!user || user.uid !== expectedUid) {
    throw new Error('L’account Windows è cambiato. Accedi con l’account verificato e riprova la finalizzazione.');
  }

  let finalized: { expectedClaim?: DesktopPasskeyClaim };
  try {
    finalized = await dependencies.request<{ expectedClaim?: DesktopPasskeyClaim }>('/finalize', {});
  } catch (error) {
    if (error instanceof HandoffHttpError && error.status < 500) throw error;
    throw new DesktopPasskeyFinalizeRetryError(expectedUid);
  }
  if (!finalized.expectedClaim) throw new DesktopPasskeyFinalizeRetryError(expectedUid);
  await refreshDesktopPasskeySession(finalized.expectedClaim, expectedUid, dependencies);
}

/**
 * Completes a browser-mediated passkey check without transferring the browser
 * session's verification claim to the Windows app.
 */
export async function runDesktopPasskeyHandoff(
  dependencies: HandoffDependencies = createRuntimeDependencies(),
): Promise<void> {
  let initialUser = dependencies.getCurrentUser();
  if (!initialUser && dependencies.waitForCurrentUser) {
    initialUser = await dependencies.waitForCurrentUser();
  }
  if (!initialUser) throw new Error('Sessione Windows scaduta: accedi di nuovo.');
  const uid = initialUser.uid;
  const { verifier, verifierHash } = await dependencies.createVerifier();
  const started = await dependencies.request<HandoffApi>('/start', { verifierHash });
  // expiresAt belongs to the server's clock, not the Windows clock. A PC ahead
  // by ten minutes would otherwise skip polling and immediately report expiry.
  // The server status is authoritative; this is only a monotonic local timeout.
  const elapsedNow = dependencies.monotonicNow ?? dependencies.now;
  const deadline = elapsedNow() + HANDOFF_TTL_MS;
  await dependencies.openExternal(started.verificationUrl);

  let verified = false;
  while (elapsedNow() < deadline) {
    let currentUser = dependencies.getCurrentUser();
    if (!currentUser && dependencies.waitForCurrentUser) {
      currentUser = await dependencies.waitForCurrentUser();
    }
    if (!currentUser || currentUser.uid !== uid) {
      throw new Error('L’account Windows è cambiato durante la verifica. Ripeti la procedura.');
    }

    const status = await dependencies.request<{ status: 'pending' | 'verified' | 'expired' }>(
      `/${encodeURIComponent(started.handoffId)}/status`,
      { verifier },
    );
    if (status.status === 'verified') {
      verified = true;
      break;
    }
    if (status.status === 'expired') {
      throw new Error('La richiesta di verifica è scaduta. Avviane una nuova.');
    }
    await dependencies.sleep(dependencies.pollIntervalMs);
  }

  if (!verified) {
    throw new Error('La richiesta di verifica è scaduta. Avviane una nuova.');
  }

  const redeemed = await dependencies.request<{ customToken: string }>(
    `/${encodeURIComponent(started.handoffId)}/redeem`,
    { verifier },
  );
  await dependencies.signIn(redeemed.customToken);
  const signedInUser = dependencies.getCurrentUser();
  if (!signedInUser || signedInUser.uid !== uid) {
    throw new Error('La sessione Windows non corrisponde all’account verificato.');
  }

  await finalizeDesktopPasskeySession(uid, dependencies);
}