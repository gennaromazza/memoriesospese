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
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : `Verifica Windows non riuscita (${response.status})`,
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

  await dependencies.request('/finalize', {});
  const refreshed = await signedInUser.getIdTokenResult(true);
  const authTime = refreshed.claims.auth_time;
  const passkeyClaim = refreshed.claims.apk;
  if (
    !passkeyClaim ||
    typeof passkeyClaim !== 'object' ||
    typeof authTime !== 'number' ||
    (passkeyClaim as Record<string, unknown>).sat !== authTime ||
    typeof (passkeyClaim as Record<string, unknown>).exp !== 'number' ||
    ((passkeyClaim as Record<string, number>).exp ?? 0) <= dependencies.now()
  ) {
    throw new Error('La sessione Windows non ha ricevuto la verifica passkey. Ripeti la procedura.');
  }
}