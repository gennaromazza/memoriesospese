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
  createVerifier(): Promise<{ verifier: string; verifierHash: string }>;
  sleep(milliseconds: number): Promise<void>;
  now(): number;
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

async function request<T>(path: string, body: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sessione Windows scaduta: accedi di nuovo.');
  const response = await fetch(getApiUrl(`${SECURITY_BASE}${path}`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(body),
  });
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
    createVerifier,
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now: () => Date.now(),
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
    authTime !== expectedClaim.sat ||
    expectedClaim.exp <= dependencies.now()
  ) {
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
  const initialUser = dependencies.getCurrentUser();
  if (!initialUser) throw new Error('Sessione Windows scaduta: accedi di nuovo.');
  const uid = initialUser.uid;
  const { verifier, verifierHash } = await dependencies.createVerifier();
  const started = await dependencies.request<HandoffApi>('/start', { verifierHash });
  await dependencies.openExternal(started.verificationUrl);

  const deadline = Math.min(started.expiresAt, dependencies.now() + HANDOFF_TTL_MS);
  while (dependencies.now() < deadline) {
    const currentUser = dependencies.getCurrentUser();
    if (!currentUser || currentUser.uid !== uid) {
      throw new Error('L’account Windows è cambiato durante la verifica. Ripeti la procedura.');
    }

    const status = await dependencies.request<{ status: 'pending' | 'verified' | 'expired' }>(
      `/${encodeURIComponent(started.handoffId)}/status`,
      { verifier },
    );
    if (status.status === 'verified') break;
    if (status.status === 'expired') {
      throw new Error('La richiesta di verifica è scaduta. Avviane una nuova.');
    }
    await dependencies.sleep(dependencies.pollIntervalMs);
  }

  if (dependencies.now() >= deadline) {
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