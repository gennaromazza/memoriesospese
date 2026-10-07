/**
 * Logica applicativa della passkey amministratore: registrazione, verifica,
 * codici di recupero, revoca e obbligatorietà.
 *
 * Il server genera e verifica ogni challenge; sul dispositivo resta solo la
 * chiave privata (la biometria non lascia mai il dispositivo). Su Firestore
 * vengono salvate esclusivamente chiavi pubbliche e hash dei codici di recupero.
 */

import { createHash } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import {
  ADMIN_PASSKEY_CLAIM,
  readAdminPasskeyClaim,
  type AdminPasskeyClaim,
} from './admin-identity.js';
import {
  CHALLENGE_TTL_MS,
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  consumePendingChallenge,
  consumeRecoveryCode,
  consumeDesktopHandoffChallenge,
  getDesktopHandoff,
  saveDesktopHandoffChallenge,
  transitionDesktopHandoff,
  deletePasskey,
  generateRecoveryCodes,
  getPasskey,
  hashRecoveryCode,
  listPasskeys,
  loadState,
  recordEvent,
  savePasskey,
  updatePasskey,
  updateState,
  type AdminSecurityState,
  type ActivationProof,
  type ChallengeKind,
  type DesktopHandoffChallenge,
  type StoredPasskey,
} from './admin-security-store.js';
import { isProductionPasskeyOrigin, rpIdForOrigin, type ResolvedRelyingParty } from './passkey-origins.js';

const RP_NAME = 'Image Studio Fotografico - Area amministrativa';
const DEFAULT_VERIFICATION_HOURS = 12;
const RECOVERY_GRANT_MS = 30 * 60 * 1000;
const ACTIVATION_PROOF_MS = 5 * 60 * 1000;

export const DESKTOP_HANDOFF_TTL_MS = 10 * 60 * 1000;
export class PasskeyError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface AdminIdentity {
  uid: string;
  email: string;
  /** `auth_time` del token: la verifica vale solo per questa sessione di login. */
  authTime: number;
}

function verificationTtlMs(): number {
  const hours = Number(process.env.ADMIN_PASSKEY_VERIFICATION_HOURS);
  const safe = Number.isFinite(hours) && hours > 0 && hours <= 24 ? hours : DEFAULT_VERIFICATION_HOURS;
  return safe * 60 * 60 * 1000;
}

function assertNotLocked(state: AdminSecurityState, now: number) {
  if (state.lockedUntil && state.lockedUntil > now) {
    throw new PasskeyError(
      429,
      'admin_security_locked',
      'Troppi tentativi falliti: riprova più tardi',
      { lockedUntil: state.lockedUntil },
    );
  }
}

async function registerFailure(uid: string, state: AdminSecurityState, now: number, reason: string) {
  const failedAttempts = state.failedAttempts + 1;
  const lock = failedAttempts >= MAX_FAILED_ATTEMPTS;
  await updateState(uid, {
    failedAttempts: lock ? 0 : failedAttempts,
    lockedUntil: lock ? now + LOCKOUT_MS : state.lockedUntil,
    challenge: null,
  });
  if (lock) await recordEvent(uid, 'lockout', { reason });
}

async function consumeChallenge(uid: string, kind: ChallengeKind, authTime: number, now: number) {
  // Monouso e atomica: la challenge viene azzerata nella stessa transazione in
  // cui viene letta, così due risposte concorrenti non possono entrambe passare.
  const challenge = await consumePendingChallenge(uid, kind, now);
  if (!challenge || challenge.authTime !== authTime) {
    throw new PasskeyError(400, 'challenge_expired', 'Challenge assente o scaduta: ripeti l’operazione');
  }
  return challenge;
}

/** La prova per attivare l'obbligo è un'asserzione separata, non un claim da registrazione o recovery. */
export function activationProofIsValid(
  proof: ActivationProof | null,
  identity: AdminIdentity,
  claim: AdminPasskeyClaim | null,
  origin: string | undefined,
  now = Date.now(),
): boolean {
  return !!proof && !!claim && !!origin &&
    isProductionPasskeyOrigin(origin) &&
    proof.origin === origin &&
    proof.authTime === identity.authTime &&
    proof.verifiedAt > 0 && proof.verifiedAt <= now &&
    now - proof.verifiedAt < ACTIVATION_PROOF_MS &&
    claim.sat === identity.authTime &&
    claim.at === proof.verifiedAt &&
    typeof claim.exp === 'number' && claim.exp > now;
}

// ---- Claims Firebase ----------------------------------------------------

async function writeClaim(uid: string, claim: AdminPasskeyClaim | null): Promise<void> {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const existing = { ...(user.customClaims ?? {}) } as Record<string, unknown>;
  if (claim) existing[ADMIN_PASSKEY_CLAIM] = claim;
  else delete existing[ADMIN_PASSKEY_CLAIM];
  await auth.setCustomUserClaims(uid, existing);
}

export async function getCurrentPasskeyClaim(uid: string): Promise<AdminPasskeyClaim | null> {
  const user = await getAuth().getUser(uid);
  const claim = readAdminPasskeyClaim(user.customClaims);
  if (
    !claim ||
    typeof claim.req !== 'boolean' ||
    typeof claim.exp !== 'number' ||
    typeof claim.at !== 'number' ||
    typeof claim.sat !== 'number'
  ) {
    return null;
  }
  return { req: claim.req, exp: claim.exp, at: claim.at, sat: claim.sat };
}

async function grantVerification(
  identity: AdminIdentity,
  state: AdminSecurityState,
  ttlMs: number,
  now: number,
): Promise<Required<AdminPasskeyClaim>> {
  const claim: Required<AdminPasskeyClaim> = {
    req: state.passkeyRequired,
    exp: now + ttlMs,
    // `at` deve essere successivo al marker di revoca. Un millisecondo di
    // margine evita che una verifica e una revoca nello stesso tick risultino
    // indistinguibili.
    at: Math.max(now, state.verificationsValidAfter + 1),
    sat: identity.authTime,
  };
  await writeClaim(identity.uid, claim);
  return claim;
}

/**
 * Invalida ogni verifica emessa finora: sia il server sia le regole Firestore
 * confrontano `at` del claim con `verificationsValidAfter` letto dal documento,
 * quindi anche i token già emessi vengono rifiutati subito. Non si revocano i
 * refresh token: chiuderebbe entro un'ora anche la sessione legittima, senza
 * aggiungere protezione visto che il claim è vincolato alla sessione.
 */
async function invalidateAllVerifications(uid: string, required: boolean, now: number) {
  const verificationsValidAfter = now + 1;
  await updateState(uid, { verificationsValidAfter });
  const invalidClaim = required ? { req: true, exp: 0, at: 0, sat: 0 } : null;
  await writeClaim(uid, invalidClaim);
  return invalidClaim;
}

// ---- Stato --------------------------------------------------------------

export interface PublicPasskey {
  id: string;
  label: string;
  rpId: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: number;
  lastUsedAt: number | null;
}

export async function describeSecurity(uid: string, identity?: AdminIdentity, claim?: AdminPasskeyClaim | null, origin?: string) {
  const [state, passkeys] = await Promise.all([loadState(uid), listPasskeys(uid)]);
  const publicPasskeys: PublicPasskey[] = passkeys.map((p) => ({
    id: p.id,
    label: p.label,
    rpId: p.rpId,
    deviceType: p.deviceType,
    backedUp: p.backedUp,
    createdAt: p.createdAt,
    lastUsedAt: p.lastUsedAt,
  }));
  return {
    passkeyRequired: state.passkeyRequired,
    passkeys: publicPasskeys,
    recoveryCodesRemaining: state.recoveryCodes.filter((c) => !c.usedAt).length,
    recoveryCodesGeneratedAt: state.recoveryCodesGeneratedAt,
    lockedUntil: state.lockedUntil && state.lockedUntil > Date.now() ? state.lockedUntil : null,
    activationReady: identity ? activationProofIsValid(state.activationProof, identity, claim ?? null, origin) : false,
  };
}

// ---- Registrazione ------------------------------------------------------

export async function startRegistration(
  identity: AdminIdentity,
  rp: ResolvedRelyingParty,
  now = Date.now(),
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const state = await loadState(identity.uid);
  assertNotLocked(state, now);
  const existing = await listPasskeys(identity.uid);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpId,
    userID: isoBase64URL.toBuffer(isoBase64URL.fromUTF8String(identity.uid)),
    userName: identity.email,
    userDisplayName: 'Amministratore',
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({
      id: p.id,
      transports: p.transports as AuthenticatorTransport[],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
  });

  await updateState(identity.uid, {
    challenge: {
      kind: 'registration',
      value: options.challenge,
      rpId: rp.rpId,
      origin: rp.origin,
      authTime: identity.authTime,
      expiresAt: now + CHALLENGE_TTL_MS,
    },
  });
  return options;
}

export async function finishRegistration(
  identity: AdminIdentity,
  rp: ResolvedRelyingParty,
  response: RegistrationResponseJSON,
  label: string,
  now = Date.now(),
): Promise<{ passkey: PublicPasskey }> {
  const state = await loadState(identity.uid);
  assertNotLocked(state, now);
  const challenge = await consumeChallenge(identity.uid, 'registration', identity.authTime, now);
  if (challenge.origin !== rp.origin) {
    throw new PasskeyError(400, 'origin_mismatch', 'Origine della richiesta non corrispondente');
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.value,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rpId,
      requireUserVerification: true,
    });
  } catch (error) {
    await registerFailure(identity.uid, state, now, 'registration');
    throw new PasskeyError(400, 'registration_failed', safeMessage(error));
  }
  if (!verification.verified || !verification.registrationInfo) {
    await registerFailure(identity.uid, state, now, 'registration');
    throw new PasskeyError(400, 'registration_failed', 'Registrazione passkey non verificata');
  }

  const info = verification.registrationInfo;
  const stored: StoredPasskey = {
    id: info.credential.id,
    publicKey: isoBase64URL.fromBuffer(info.credential.publicKey),
    counter: info.credential.counter,
    transports: info.credential.transports ?? [],
    rpId: challenge.rpId,
    label: sanitizeLabel(label),
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    createdAt: now,
    lastUsedAt: null,
  };
  await savePasskey(identity.uid, stored);
  await updateState(identity.uid, { failedAttempts: 0 });
  await recordEvent(identity.uid, 'passkey_registered', { credentialId: stored.id, label: stored.label });

  return {
    passkey: {
      id: stored.id,
      label: stored.label,
      rpId: stored.rpId,
      deviceType: stored.deviceType,
      backedUp: stored.backedUp,
      createdAt: stored.createdAt,
      lastUsedAt: null,
    },
  };
}

// ---- Autenticazione -----------------------------------------------------

export async function startAuthentication(
  identity: AdminIdentity,
  rp: ResolvedRelyingParty,
  now = Date.now(),
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const state = await loadState(identity.uid);
  assertNotLocked(state, now);
  const passkeys = (await listPasskeys(identity.uid)).filter((p) => p.rpId === rp.rpId);
  if (passkeys.length === 0) {
    throw new PasskeyError(404, 'no_passkey', 'Nessuna passkey registrata per questo dominio');
  }

  const options = await generateAuthenticationOptions({
    rpID: rp.rpId,
    userVerification: 'required',
    allowCredentials: passkeys.map((p) => ({
      id: p.id,
      // A phone-registered platform passkey may report only "internal".
      // Browsers then hide the cross-device QR flow unless "hybrid" is also
      // advertised. This is only a transport hint; the credential signature
      // and RP/origin checks remain authoritative.
      transports: (p.transports.includes('internal')
        ? [...new Set([...p.transports, 'hybrid'])]
        : p.transports) as AuthenticatorTransport[],
    })),
  });

  await updateState(identity.uid, {
    challenge: {
      kind: 'authentication',
      value: options.challenge,
      rpId: rp.rpId,
      origin: rp.origin,
      authTime: identity.authTime,
      expiresAt: now + CHALLENGE_TTL_MS,
    },
  });
  return options;
}

export async function startDesktopHandoffAuthentication(
  identity: AdminIdentity,
  rp: ResolvedRelyingParty,
  handoffId: string,
  now = Date.now(),
) {
  const handoff = await getDesktopHandoff(identity.uid, handoffId);
  if (!handoff || handoff.status !== 'pending' || handoff.expiresAt <= now) {
    throw new PasskeyError(404, 'desktop_handoff_not_found', 'Richiesta Windows non valida o scaduta');
  }

  const state = await loadState(identity.uid);
  assertNotLocked(state, now);
  const passkeys = (await listPasskeys(identity.uid)).filter((p) => p.rpId === rp.rpId);
  if (passkeys.length === 0) {
    throw new PasskeyError(404, 'no_passkey', 'Nessuna passkey registrata per questo dominio');
  }

  const options = await generateAuthenticationOptions({
    rpID: rp.rpId,
    userVerification: 'required',
    allowCredentials: passkeys.map((p) => ({
      id: p.id,
      transports: p.transports as AuthenticatorTransport[],
    })),
  });
  const saved = await saveDesktopHandoffChallenge(identity.uid, handoffId, {
    value: options.challenge,
    rpId: rp.rpId,
    origin: rp.origin,
    authTime: identity.authTime,
    expiresAt: now + CHALLENGE_TTL_MS,
  }, now);
  if (!saved) {
    throw new PasskeyError(404, 'desktop_handoff_not_found', 'Richiesta Windows non valida o scaduta');
  }
  return options;
}
export async function finishAuthentication(
  identity: AdminIdentity,
  rp: ResolvedRelyingParty,
  response: AuthenticationResponseJSON,
  now = Date.now(),
): Promise<AdminPasskeyClaim> {
  const state = await loadState(identity.uid);
  assertNotLocked(state, now);
  const challenge = await consumeChallenge(identity.uid, 'authentication', identity.authTime, now);
  const passkey = await verifyAuthenticationAssertion(identity, rp, response, challenge, state, now);
  const claim = await grantVerification(identity, state, verificationTtlMs(), now);
  await updateState(identity.uid, {
    activationProof: {
      authTime: identity.authTime,
      origin: challenge.origin,
      verifiedAt: claim.at,
      credentialId: passkey.id,
    },
  });
  return claim;
}

export async function finishDesktopHandoffAuthentication(
  identity: AdminIdentity,
  rp: ResolvedRelyingParty,
  handoffId: string,
  response: AuthenticationResponseJSON,
  now = Date.now(),
): Promise<{ verifiedAt: number }> {
  const state = await loadState(identity.uid);
  assertNotLocked(state, now);
  const challenge = await consumeDesktopHandoffChallenge(
    identity.uid,
    handoffId,
    identity.authTime,
    now,
  );
  if (!challenge) {
    throw new PasskeyError(400, 'challenge_expired', 'Challenge assente o scaduta: ripeti l’operazione');
  }

  const passkey = await verifyAuthenticationAssertion(identity, rp, response, challenge, state, now);
  const transitioned = await transitionDesktopHandoff(
    identity.uid,
    handoffId,
    'pending',
    {
      status: 'verified',
      challenge: null,
      verifiedAt: now,
      verificationAuthTime: identity.authTime,
      verificationOrigin: rp.origin,
      credentialId: passkey.id,
    },
    now,
  );
  if (!transitioned) {
    throw new PasskeyError(400, 'desktop_handoff_not_found', 'Richiesta Windows non valida o scaduta');
  }
  return { verifiedAt: now };
}
export async function regenerateRecoveryCodes(identity: AdminIdentity, now = Date.now()): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await updateState(identity.uid, {
    recoveryCodes: codes.map((code) => ({ hash: hashRecoveryCode(code), usedAt: null })),
    recoveryCodesGeneratedAt: now,
  });
  await recordEvent(identity.uid, 'recovery_codes_generated', { count: codes.length });
  return codes;
}

/**
 * Un codice di recupero concede una verifica breve (30 minuti) sufficiente a
 * registrare una nuova passkey o a disattivare temporaneamente l'obbligo.
 */
export async function redeemRecoveryCode(
  identity: AdminIdentity,
  code: string,
  now = Date.now(),
): Promise<AdminPasskeyClaim> {
  const state = await loadState(identity.uid);
  assertNotLocked(state, now);
  const hash = hashRecoveryCode(code);
  const remaining = await consumeRecoveryCode(identity.uid, hash, now);
  if (remaining === null) {
    await registerFailure(identity.uid, state, now, 'recovery_code');
    await recordEvent(identity.uid, 'recovery_code_failed', {});
    throw new PasskeyError(400, 'invalid_recovery_code', 'Codice di recupero non valido');
  }
  await recordEvent(identity.uid, 'recovery_code_used', { remaining });
  return grantVerification(identity, state, RECOVERY_GRANT_MS, now);
}

// ---- Revoca e obbligatorietà -------------------------------------------

export async function revokePasskey(identity: AdminIdentity, credentialId: string, now = Date.now()) {
  const state = await loadState(identity.uid);
  const passkeys = await listPasskeys(identity.uid);
  const target = passkeys.find((p) => p.id === credentialId);
  if (!target) throw new PasskeyError(404, 'passkey_not_found', 'Passkey non trovata');
  if (state.passkeyRequired && passkeys.length === 1) {
    throw new PasskeyError(
      409,
      'last_passkey',
      'Non puoi revocare l’unica passkey mentre è obbligatoria: registrane un’altra o disattiva prima l’obbligo',
    );
  }
  await deletePasskey(identity.uid, credentialId);
  // Le verifiche già emesse (anche su altri dispositivi) diventano non valide.
  await updateState(identity.uid, { activationProof: null });
  const expectedClaim = await invalidateAllVerifications(identity.uid, state.passkeyRequired, now);
  await recordEvent(identity.uid, 'passkey_revoked', { credentialId, label: target.label });
  return expectedClaim;
}

export async function setEnforcement(
  identity: AdminIdentity,
  required: boolean,
  claim: AdminPasskeyClaim | null = null,
  origin?: string,
  now = Date.now(),
) {
  const state = await loadState(identity.uid);
  if (required) {
    if (!activationProofIsValid(state.activationProof, identity, claim, origin, now)) {
      throw new PasskeyError(403, 'authentication_required_for_enforcement', 'Verifica una passkey dal sito di produzione in questa sessione prima di attivare l’obbligo');
    }
    const passkeys = await listPasskeys(identity.uid);
    if (passkeys.length === 0) {
      throw new PasskeyError(409, 'no_passkey', 'Registra almeno una passkey prima di renderla obbligatoria');
    }
    if (!passkeys.some((p) => p.id === state.activationProof?.credentialId && p.rpId === rpIdForOrigin(origin!))) {
      throw new PasskeyError(403, 'authentication_required_for_enforcement', 'La passkey verificata non è più disponibile');
    }
    if (!state.recoveryCodes.some((c) => !c.usedAt)) {
      throw new PasskeyError(
        409,
        'no_recovery_codes',
        'Genera e conserva i codici di recupero prima di rendere obbligatoria la passkey',
      );
    }
  }
  await updateState(identity.uid, { passkeyRequired: required });
  await recordEvent(identity.uid, required ? 'enforcement_enabled' : 'enforcement_disabled', {});
  if (required) {
    // Attivazione: solo la sessione che attiva (già verificata) resta valida;
    // ogni altra sessione aperta con la sola password deve fare la verifica.
    const verificationsValidAfter = now + 1;
    await updateState(identity.uid, { verificationsValidAfter });
    return grantVerification(
      identity,
      { ...state, passkeyRequired: true, verificationsValidAfter },
      verificationTtlMs(),
      now,
    );
  }
  // Disattivazione: si mantiene l'eventuale verifica corrente, con req=false.
  const user = await getAuth().getUser(identity.uid);
  const current = (user.customClaims?.[ADMIN_PASSKEY_CLAIM] ?? {}) as AdminPasskeyClaim;
  const disabledClaim: AdminPasskeyClaim = {
    req: false,
    exp: typeof current.exp === 'number' ? current.exp : 0,
    at: typeof current.at === 'number' ? current.at : 0,
    sat: typeof current.sat === 'number' ? current.sat : 0,
  };
  await writeClaim(identity.uid, disabledClaim);
  return disabledClaim;
}

// ---- Utilità ------------------------------------------------------------

function sanitizeLabel(label: string): string {
  const trimmed = (label ?? '').toString().trim().slice(0, 60);
  return trimmed || 'Passkey';
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Errore sconosciuto';
}

async function verifyAuthenticationAssertion(
  identity: AdminIdentity,
  rp: ResolvedRelyingParty,
  response: AuthenticationResponseJSON,
  challenge: Pick<DesktopHandoffChallenge, 'value' | 'rpId' | 'origin'>,
  state: AdminSecurityState,
  now: number,
) {
  if (challenge.origin !== rp.origin) {
    throw new PasskeyError(400, 'origin_mismatch', 'Origine della richiesta non corrispondente');
  }

  const passkey = await getPasskey(identity.uid, response.id);
  if (!passkey || passkey.rpId !== challenge.rpId) {
    await registerFailure(identity.uid, state, now, 'unknown_credential');
    await recordEvent(identity.uid, 'passkey_verification_failed', { reason: 'unknown_credential' });
    throw new PasskeyError(400, 'unknown_credential', 'Passkey non riconosciuta');
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.value,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rpId,
      requireUserVerification: true,
      credential: {
        id: passkey.id,
        publicKey: isoBase64URL.toBuffer(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports as AuthenticatorTransport[],
      },
    });
  } catch (error) {
    await registerFailure(identity.uid, state, now, 'authentication');
    await recordEvent(identity.uid, 'passkey_verification_failed', { reason: safeMessage(error) });
    throw new PasskeyError(400, 'verification_failed', 'Verifica passkey non riuscita');
  }
  if (!verification.verified) {
    await registerFailure(identity.uid, state, now, 'authentication');
    await recordEvent(identity.uid, 'passkey_verification_failed', { reason: 'not_verified' });
    throw new PasskeyError(400, 'verification_failed', 'Verifica passkey non riuscita');
  }

  await updatePasskey(identity.uid, passkey.id, {
    counter: verification.authenticationInfo.newCounter,
    lastUsedAt: now,
  });
  await updateState(identity.uid, { failedAttempts: 0 });
  await recordEvent(identity.uid, 'passkey_verified', { credentialId: passkey.id });
  return passkey;
}

/**
 * Finalizes only the Firebase session minted for this verified desktop flow.
 * The one-time custom-token claim is checked and consumed before the normal
 * session-bound admin claim is granted.
 */
export async function finalizeDesktopHandoff(
  identity: AdminIdentity,
  handoffId: string,
  nonce: string,
  now = Date.now(),
): Promise<Required<AdminPasskeyClaim>> {
  const nonceHash = createHash('sha256').update(nonce).digest('hex');
  const existingHandoff = await getDesktopHandoff(identity.uid, handoffId);
  if (existingHandoff?.status === 'finalized') {
    const state = await loadState(identity.uid);
    const existingClaim = await getCurrentPasskeyClaim(identity.uid);
    if (
      existingHandoff.nonceHash === nonceHash &&
      existingHandoff.finalizedAuthTime === identity.authTime &&
      existingClaim &&
      typeof existingClaim.req === 'boolean' &&
      typeof existingClaim.exp === 'number' &&
      Number.isFinite(existingClaim.exp) &&
      typeof existingClaim.at === 'number' &&
      Number.isFinite(existingClaim.at) &&
      typeof existingClaim.sat === 'number' &&
      Number.isFinite(existingClaim.sat) &&
      existingClaim.sat === identity.authTime &&
      existingClaim.exp > now &&
      existingClaim.at > state.verificationsValidAfter &&
      (!state.passkeyRequired || existingClaim.req === true)
    ) {
      // A retry may return only the same still-valid session proof. It never
      // creates a replacement claim or extends the original verification.
      return {
        req: existingClaim.req,
        exp: existingClaim.exp,
        at: existingClaim.at,
        sat: existingClaim.sat,
      };
    }
    throw new PasskeyError(409, 'desktop_handoff_invalid', 'Sessione Windows già finalizzata o non più valida');
  }

  const handoff = await transitionDesktopHandoff(
    identity.uid,
    handoffId,
    'redeemed',
    { status: 'finalized', finalizedAuthTime: identity.authTime },
    now,
    (current) => current.nonceHash === nonceHash,
  );
  if (!handoff) {
    throw new PasskeyError(400, 'desktop_handoff_invalid', 'Sessione Windows non valida o già utilizzata');
  }

  const state = await loadState(identity.uid);
  const claim = await grantVerification(identity, state, verificationTtlMs(), now);
  await recordEvent(identity.uid, 'passkey_verified', {
    credentialId: handoff.credentialId ?? 'desktop-handoff',
    platform: 'windows-desktop',
  });
  return claim;
}
