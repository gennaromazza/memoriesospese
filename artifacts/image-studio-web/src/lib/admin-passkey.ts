/**
 * Client della passkey amministratore.
 *
 * Il server genera e verifica ogni challenge WebAuthn; qui ci limitiamo a
 * passare le opzioni al browser (`navigator.credentials`) e a rinviare la
 * risposta firmata. Dopo una verifica riuscita il token Firebase viene
 * forzatamente aggiornato così che il nuovo claim `apk` sia visibile anche
 * alle regole Firestore per gli accessi diretti.
 */
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import type { User } from 'firebase/auth';
import { auth } from './firebase';
import { createUrl } from './basePath';

export const ADMIN_PASSKEY_REQUIRED_CODE = 'admin_passkey_required';

export interface AdminPasskeySummary {
  id: string;
  label: string;
  rpId: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface AdminSecurityStatus {
  passkeyRequired: boolean;
  passkeys: AdminPasskeySummary[];
  recoveryCodesRemaining: number;
  recoveryCodesGeneratedAt: number | null;
  lockedUntil: number | null;
  verified: boolean;
  activationReady: boolean;
  verifiedUntil: number | null;
  expectedClaim: ExpectedAdminPasskeyClaim | null;
}

export interface AdminPasskeyClaim {
  req?: boolean;
  exp?: number;
  at?: number;
  sat?: number;
}

export interface ExpectedAdminPasskeyClaim {
  req: boolean;
  exp: number;
  at: number;
  sat: number;
}

export class AdminSecurityError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export class AdminPasskeyRefreshError extends Error {
  constructor(
    public readonly expectedClaim: ExpectedAdminPasskeyClaim | null,
  ) {
    super(
      "L'operazione è stata completata, ma la sessione non ha ricevuto il claim aggiornato. Aggiorna la sessione senza ripetere la verifica o il codice.",
    );
    this.name = 'AdminPasskeyRefreshError';
  }
}

async function securityRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new AdminSecurityError(401, 'unauthenticated', 'Sessione scaduta: accedi di nuovo');
  const token = await user.getIdToken();
  const response = await fetch(createUrl(`/api/admin/security${path}`), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    credentials: 'include',
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const { error, code, ...extra } = body;
    throw new AdminSecurityError(
      response.status,
      typeof code === 'string' ? code : 'error',
      typeof error === 'string' ? error : `Errore ${response.status}`,
      extra,
    );
  }
  return body as T;
}

function parsePasskeyClaim(claims: Record<string, unknown>): AdminPasskeyClaim | null {
  const raw = claims.apk;
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  return {
    req: value.req === true,
    exp: typeof value.exp === 'number' ? value.exp : undefined,
    at: typeof value.at === 'number' ? value.at : undefined,
    sat: typeof value.sat === 'number' ? value.sat : undefined,
  };
}

function claimMatches(expected: ExpectedAdminPasskeyClaim, actual: AdminPasskeyClaim | null): boolean {
  if (!actual) return false;
  return (['req', 'exp', 'at', 'sat'] as const).every(
    (key) => actual[key] === expected[key],
  );
}

/** Forza il refresh del token; se fornito, conferma anche la claim attesa dal server. */
async function refreshClaims(expectedClaim?: ExpectedAdminPasskeyClaim | null): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new AdminSecurityError(401, 'unauthenticated', 'Sessione scaduta: accedi di nuovo');

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await user.getIdTokenResult(true);
      const actualClaim = parsePasskeyClaim(result.claims);
      if (
        expectedClaim === undefined ||
        (expectedClaim === null ? actualClaim === null : claimMatches(expectedClaim, actualClaim))
      ) return;
      lastError = new Error('Il token aggiornato non contiene ancora il claim atteso.');
    } catch (error) {
      lastError = error;
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }

  if (expectedClaim !== undefined) throw new AdminPasskeyRefreshError(expectedClaim);
  if (lastError instanceof Error) throw lastError;
  throw new Error('Aggiornamento della sessione non riuscito.');
}

export const AdminPasskeyClient = {
  supportsPasskeys(): boolean {
    return typeof window !== 'undefined' && browserSupportsWebAuthn();
  },

  platformAuthenticatorAvailable(): Promise<boolean> {
    return platformAuthenticatorIsAvailable().catch(() => false);
  },

  getStatus(): Promise<AdminSecurityStatus> {
    return securityRequest<AdminSecurityStatus>('/status');
  },

  async register(label: string): Promise<AdminPasskeySummary> {
    const optionsJSON = await securityRequest<Parameters<typeof startRegistration>[0]['optionsJSON']>(
      '/registration/options',
      { method: 'POST' },
    );
    const response = await startRegistration({ optionsJSON });
    const result = await securityRequest<{ passkey: AdminPasskeySummary }>(
      '/registration/verify',
      { method: 'POST', body: JSON.stringify({ response, label }) },
    );
    return result.passkey;
  },

  async verify(): Promise<number> {
    const optionsJSON = await securityRequest<Parameters<typeof startAuthentication>[0]['optionsJSON']>(
      '/authentication/options',
      { method: 'POST' },
    );
    const response = await startAuthentication({ optionsJSON });
    const result = await securityRequest<{ verifiedUntil: number; expectedClaim: ExpectedAdminPasskeyClaim }>('/authentication/verify', {
      method: 'POST',
      body: JSON.stringify({ response }),
    });
    await refreshClaims(result.expectedClaim);
    return result.verifiedUntil;
  },

  async verifyForDesktopHandoff(handoffId: string): Promise<void> {
    const encodedId = encodeURIComponent(handoffId);
    const optionsJSON = await securityRequest<Parameters<typeof startAuthentication>[0]['optionsJSON']>(
      `/desktop-handoff/${encodedId}/authentication/options`,
      { method: 'POST' },
    );
    const response = await startAuthentication({ optionsJSON });
    await securityRequest<{ verifiedAt: number }>(
      `/desktop-handoff/${encodedId}/authentication/verify`,
      { method: 'POST', body: JSON.stringify({ response }) },
    );
  },

  async redeemRecoveryCode(code: string): Promise<number> {
    const result = await securityRequest<{ verifiedUntil: number; expectedClaim: ExpectedAdminPasskeyClaim }>('/recovery/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    await refreshClaims(result.expectedClaim);
    return result.verifiedUntil;
  },

  async regenerateRecoveryCodes(): Promise<string[]> {
    const result = await securityRequest<{ codes: string[] }>('/recovery-codes', { method: 'POST' });
    return result.codes;
  },

  async revoke(credentialId: string): Promise<void> {
    const result = await securityRequest<{ expectedClaim: ExpectedAdminPasskeyClaim | null }>(
      `/passkeys/${encodeURIComponent(credentialId)}`,
      { method: 'DELETE' },
    );
    await refreshClaims(result.expectedClaim);
  },

  async setEnforcement(required: boolean): Promise<void> {
    const result = await securityRequest<{ expectedClaim: ExpectedAdminPasskeyClaim | null }>(
      '/enforcement',
      { method: 'POST', body: JSON.stringify({ required }) },
    );
    if (!result.expectedClaim) throw new AdminPasskeyRefreshError(null);
    try {
      await refreshClaims(result.expectedClaim);
    } catch (error) {
      if (error instanceof AdminPasskeyRefreshError) throw error;
      throw new AdminPasskeyRefreshError(result.expectedClaim ?? null);
    }
  },

  refreshEnforcementClaim(expectedClaim: ExpectedAdminPasskeyClaim | null): Promise<void> {
    return refreshClaims(expectedClaim);
  },
};

/** Legge il claim `apk` dal token corrente (senza rete se non forzato). */
export async function readPasskeyClaim(user: User, force = false) {
  const result = await user.getIdTokenResult(force);
  return parsePasskeyClaim(result.claims);
}
