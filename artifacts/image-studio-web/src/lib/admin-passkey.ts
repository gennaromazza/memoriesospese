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
import { signInWithCustomToken, type User } from 'firebase/auth';
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
  rememberedDevices: RememberedDeviceSummary[];
  rememberedDeviceId: string | null;
  recoveryCodesRemaining: number;
  recoveryCodesGeneratedAt: number | null;
  lockedUntil: number | null;
  verified: boolean;
  activationReady: boolean;
  verifiedUntil: number | null;
  expectedClaim: ExpectedAdminPasskeyClaim | null;
}

export interface RememberedDeviceSummary {
  id: string;
  label: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
  status: 'active' | 'expired' | 'revoked';
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

export interface PreviewPasskeyHandoff {
  handoffId: string;
  verifier: string;
  verificationUrl: string;
  expiresAt: number;
  uid: string;
}

export type DeviceEnrollmentStatus =
  | 'pending'
  | 'approved'
  | 'registered'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export interface DeviceEnrollmentHandoff {
  enrollmentId: string;
  verifier: string;
  approvalUrl: string;
  expiresAt: number;
  uid: string;
}

export interface DeviceEnrollmentApprovalInfo {
  status: DeviceEnrollmentStatus;
  deviceLabel: string;
  expiresAt: number;
}

/** Matches DESKTOP_HANDOFF_TTL_MS on the server; this is only a local polling limit. */
export const PREVIEW_HANDOFF_TIMEOUT_MS = 10 * 60 * 1000;
export const DEVICE_ENROLLMENT_TIMEOUT_MS = 10 * 60 * 1000;

const OFFICIAL_PASSKEY_ORIGINS = new Set([
  'https://imagestudiofotografico.com',
  'https://www.imagestudiofotografico.com',
]);

export function canRestoreRememberedDeviceAtOrigin(origin: string): boolean {
  return OFFICIAL_PASSKEY_ORIGINS.has(origin);
}

type PasskeyHandoffStatus = 'pending' | 'verified' | 'expired';

/** Verification and lock state are already evaluated against the server clock. */
export function isAdminPasskeyVerificationRequired(status: AdminSecurityStatus): boolean {
  return status.passkeyRequired && !status.verified;
}

/**
 * Il server conosce le passkey dell'account e del dominio, non quelle presenti
 * fisicamente nel browser corrente. Perciò una passkey dello stesso RP non
 * deve nascondere la possibilità di autorizzare un dispositivo nuovo.
 */
export function canOfferDeviceEnrollment(status: AdminSecurityStatus, currentRpId: string): boolean {
  return getDeviceEnrollmentUnavailableReason(status, currentRpId) === null;
}

export function getDeviceEnrollmentUnavailableReason(
  status: AdminSecurityStatus,
  currentRpId: string,
): string | null {
  if (!status.passkeyRequired) {
    return 'Per associare un nuovo dispositivo con il QR, attiva prima l’obbligo passkey nelle impostazioni di Sicurezza.';
  }
  if (currentRpId !== 'imagestudiofotografico.com') {
    return 'Il QR di associazione è disponibile solo sul sito ufficiale. Apri imagestudiofotografico.com sul dispositivo da associare.';
  }
  if (!status.passkeys.some((passkey) => passkey.rpId === 'imagestudiofotografico.com')) {
    return 'Serve una passkey già registrata sul sito ufficiale e disponibile su un dispositivo fidato. Se non puoi usarla, accedi con un codice di recupero e registra una passkey.';
  }
  return null;
}

export function isAdminPasskeyLocked(status: AdminSecurityStatus): boolean {
  return status.lockedUntil !== null;
}

/** The deadline is measured with performance.now(), never against server timestamps. */
export function hasPreviewHandoffTimedOut(deadline: number, monotonicNow: number): boolean {
  return monotonicNow >= deadline;
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

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createHandoffVerifier(): Promise<{ verifier: string; verifierHash: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, verifierHash: base64Url(new Uint8Array(digest)) };
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

  async verify(options?: { rememberDevice?: boolean; deviceLabel?: string }): Promise<number> {
    const optionsJSON = await securityRequest<Parameters<typeof startAuthentication>[0]['optionsJSON']>(
      '/authentication/options',
      { method: 'POST' },
    );
    const response = await startAuthentication({ optionsJSON });
    const result = await securityRequest<{
      verifiedUntil: number;
      expectedClaim: ExpectedAdminPasskeyClaim;
      customToken?: string;
      rememberedDevice?: { id: string; expiresAt: number };
    }>('/authentication/verify', {
      method: 'POST',
      body: JSON.stringify({
        response,
        ...(options?.rememberDevice ? {
          rememberDevice: true,
          deviceLabel: options.deviceLabel ?? 'Browser personale',
        } : {}),
      }),
    });
    if (result.customToken && result.rememberedDevice) {
      const currentUid = auth.currentUser?.uid;
      const signedIn = await signInWithCustomToken(auth, result.customToken);
      if (!currentUid || signedIn.user.uid !== currentUid) {
        throw new Error('La sessione del dispositivo non corrisponde all’account amministratore.');
      }
      const token = await signedIn.user.getIdTokenResult(true);
      const trust = token.claims.adminDeviceTrust;
      if (!trust || typeof trust !== 'object' || (trust as Record<string, unknown>).id !== result.rememberedDevice.id) {
        throw new Error('La sessione non ha ricevuto la fiducia del dispositivo. Ricarica la pagina per riprovare.');
      }
    } else {
      await refreshClaims(result.expectedClaim);
    }
    return result.verifiedUntil;
  },

  async restoreRememberedDevice(): Promise<boolean> {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) throw new AdminSecurityError(401, 'unauthenticated', 'Sessione scaduta: accedi di nuovo');
    const result = await securityRequest<{ restored: boolean; customToken?: string }>('/devices/restore', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (result.customToken) {
      const signedIn = await signInWithCustomToken(auth, result.customToken);
      if (signedIn.user.uid !== currentUid) {
        throw new Error('Il dispositivo ricordato appartiene a un altro account.');
      }
      const token = await signedIn.user.getIdTokenResult(true);
      if (!token.claims.adminDeviceTrust || typeof token.claims.adminDeviceTrust !== 'object') {
        throw new Error('Non è stato possibile ripristinare la fiducia del dispositivo.');
      }
    }
    return result.restored;
  },

  forgetRememberedDevice(deviceId: string): Promise<void> {
    return securityRequest<{ success: boolean }>(`/devices/${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
    }).then(() => undefined);
  },

  forgetAllRememberedDevices(): Promise<void> {
    return securityRequest<{ success: boolean }>('/devices/revoke-all', {
      method: 'POST',
      body: JSON.stringify({}),
    }).then(() => undefined);
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

  async startDeviceEnrollment(deviceLabel: string): Promise<DeviceEnrollmentHandoff> {
    const user = auth.currentUser;
    if (!user) throw new AdminSecurityError(401, 'unauthenticated', 'Sessione scaduta: accedi di nuovo');
    const { verifier, verifierHash } = await createHandoffVerifier();
    const started = await securityRequest<{
      enrollmentId: string;
      approvalUrl: string;
      expiresAt: number;
    }>('/device-enrollment/start', {
      method: 'POST',
      body: JSON.stringify({ verifierHash, deviceLabel }),
    });
    const approvalUrl = new URL(started.approvalUrl);
    if (
      approvalUrl.origin !== 'https://imagestudiofotografico.com' ||
      approvalUrl.pathname !== '/admin/authorize-device' ||
      approvalUrl.searchParams.get('deviceEnrollment') !== started.enrollmentId ||
      [...approvalUrl.searchParams.keys()].some((key) => key !== 'deviceEnrollment')
    ) {
      throw new Error('Il server ha restituito un indirizzo di autorizzazione non attendibile.');
    }
    return { ...started, verifier, uid: user.uid };
  },

  async getDeviceEnrollmentStatus(
    handoff: DeviceEnrollmentHandoff,
  ): Promise<{ status: DeviceEnrollmentStatus; deviceLabel: string; expiresAt: number }> {
    const user = auth.currentUser;
    if (!user || user.uid !== handoff.uid) {
      throw new Error('L’account amministratore è cambiato. Avvia una nuova richiesta.');
    }
    return securityRequest<{ status: DeviceEnrollmentStatus; deviceLabel: string; expiresAt: number }>(
      `/device-enrollment/${encodeURIComponent(handoff.enrollmentId)}/status`,
      { method: 'POST', body: JSON.stringify({ verifier: handoff.verifier }) },
    );
  },

  async cancelDeviceEnrollment(handoff: DeviceEnrollmentHandoff): Promise<void> {
    const user = auth.currentUser;
    if (!user || user.uid !== handoff.uid) {
      throw new Error('L’account amministratore è cambiato. Avvia una nuova richiesta.');
    }
    await securityRequest<{ cancelled: boolean }>(
      `/device-enrollment/${encodeURIComponent(handoff.enrollmentId)}/cancel`,
      { method: 'POST', body: JSON.stringify({ verifier: handoff.verifier }) },
    );
  },

  async registerDeviceEnrollmentPasskey(
    handoff: DeviceEnrollmentHandoff,
  ): Promise<AdminPasskeySummary> {
    const user = auth.currentUser;
    if (!user || user.uid !== handoff.uid) {
      throw new Error('L’account amministratore è cambiato. Avvia una nuova richiesta.');
    }
    const encodedId = encodeURIComponent(handoff.enrollmentId);
    const body = JSON.stringify({ verifier: handoff.verifier });
    const optionsJSON = await securityRequest<Parameters<typeof startRegistration>[0]['optionsJSON']>(
      `/device-enrollment/${encodedId}/registration/options`,
      { method: 'POST', body },
    );
    const response = await startRegistration({ optionsJSON });
    const result = await securityRequest<{ passkey: AdminPasskeySummary }>(
      `/device-enrollment/${encodedId}/registration/verify`,
      { method: 'POST', body: JSON.stringify({ verifier: handoff.verifier, response }) },
    );
    return result.passkey;
  },

  async getDeviceEnrollmentApprovalInfo(enrollmentId: string): Promise<DeviceEnrollmentApprovalInfo> {
    return securityRequest<DeviceEnrollmentApprovalInfo>(
      `/device-enrollment/${encodeURIComponent(enrollmentId)}/approval-info`,
      { method: 'POST' },
    );
  },

  async approveDeviceEnrollment(enrollmentId: string): Promise<void> {
    const encodedId = encodeURIComponent(enrollmentId);
    const optionsJSON = await securityRequest<Parameters<typeof startAuthentication>[0]['optionsJSON']>(
      `/device-enrollment/${encodedId}/authentication/options`,
      { method: 'POST' },
    );
    const response = await startAuthentication({ optionsJSON });
    await securityRequest<{ approvedAt: number }>(
      `/device-enrollment/${encodedId}/authentication/verify`,
      { method: 'POST', body: JSON.stringify({ response }) },
    );
  },

  async rejectDeviceEnrollment(enrollmentId: string): Promise<void> {
    await securityRequest<{ rejected: boolean }>(
      `/device-enrollment/${encodeURIComponent(enrollmentId)}/reject`,
      { method: 'POST' },
    );
  },

  async startPreviewHandoff(): Promise<PreviewPasskeyHandoff> {
    const user = auth.currentUser;
    if (!user) throw new AdminSecurityError(401, 'unauthenticated', 'Sessione scaduta: accedi di nuovo');
    const { verifier, verifierHash } = await createHandoffVerifier();
    const started = await securityRequest<{
      handoffId: string;
      verificationUrl: string;
      expiresAt: number;
    }>('/desktop-handoff/start', {
      method: 'POST',
      body: JSON.stringify({ verifierHash, target: 'preview' }),
    });

    const verificationUrl = new URL(started.verificationUrl);
    if (
      verificationUrl.origin !== 'https://imagestudiofotografico.com' ||
      verificationUrl.pathname !== '/admin/sicurezza' ||
      verificationUrl.searchParams.get('desktopHandoff') !== started.handoffId ||
      verificationUrl.searchParams.get('handoffTarget') !== 'preview'
    ) {
      throw new Error('Il server ha restituito un indirizzo di verifica non attendibile.');
    }

    return { ...started, verifier, uid: user.uid };
  },

  async getPreviewHandoffStatus(
    handoff: PreviewPasskeyHandoff,
  ): Promise<{ status: PasskeyHandoffStatus }> {
    const user = auth.currentUser;
    if (!user || user.uid !== handoff.uid) {
      throw new Error('L’account amministratore è cambiato. Avvia una nuova verifica.');
    }
    return securityRequest<{ status: PasskeyHandoffStatus }>(
      `/desktop-handoff/${encodeURIComponent(handoff.handoffId)}/status`,
      { method: 'POST', body: JSON.stringify({ verifier: handoff.verifier }) },
    );
  },

  async completePreviewHandoff(handoff: PreviewPasskeyHandoff): Promise<number> {
    const user = auth.currentUser;
    if (!user || user.uid !== handoff.uid) {
      throw new Error('L’account amministratore è cambiato. Avvia una nuova verifica.');
    }

    const redeemed = await securityRequest<{ customToken: string }>(
      `/desktop-handoff/${encodeURIComponent(handoff.handoffId)}/redeem`,
      { method: 'POST', body: JSON.stringify({ verifier: handoff.verifier }) },
    );
    const signedIn = await signInWithCustomToken(auth, redeemed.customToken);
    if (signedIn.user.uid !== handoff.uid) {
      throw new Error('La sessione verificata non corrisponde all’account amministratore.');
    }

    const finalized = await securityRequest<{
      verifiedUntil: number;
      expectedClaim: ExpectedAdminPasskeyClaim;
    }>('/desktop-handoff/finalize', { method: 'POST' });
    await refreshClaims(finalized.expectedClaim);
    return finalized.verifiedUntil;
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
