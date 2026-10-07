/**
 * Persistenza dello stato di sicurezza dell'amministratore.
 *
 * Collezione `adminSecurity/{uid}` (accesso client negato dalle regole):
 *  - passkeyRequired: la passkey è obbligatoria per l'account
 *  - verificationsValidAfter: le verifiche precedenti a questo istante sono revocate
 *  - failedAttempts / lockedUntil: rate limit delle verifiche fallite
 *  - challenge: challenge WebAuthn/recupero in sospeso (monouso, con scadenza)
 *  - recoveryCodes: soltanto hash SHA-256 dei codici di recupero
 * Sottocollezioni: `passkeys` (solo chiave pubblica) ed `events` (audit).
 */

import { createHash, randomBytes } from 'node:crypto';
import { db, FieldValue } from '../firebase-admin.js';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const RECOVERY_CODE_COUNT = 8;

export type ChallengeKind = 'registration' | 'authentication';

export interface PendingChallenge {
  kind: ChallengeKind;
  value: string;
  rpId: string;
  origin: string;
  authTime: number;
  expiresAt: number;
}

export interface DesktopHandoffChallenge {
  value: string;
  rpId: string;
  origin: string;
  authTime: number;
  expiresAt: number;
}

export type DesktopHandoffStatus = 'pending' | 'verified' | 'redeemed' | 'finalized';

export interface DesktopHandoff {
  uid: string;
  verifierHash: string;
  desktopAuthTime: number;
  createdAt: number;
  expiresAt: number;
  status: DesktopHandoffStatus;
  challenge: DesktopHandoffChallenge | null;
  verifiedAt: number | null;
  verificationAuthTime: number | null;
  verificationOrigin: string | null;
  credentialId: string | null;
  nonceHash: string | null;
  finalizedAuthTime: number | null;
}

export interface ActivationProof {
  authTime: number;
  origin: string;
  verifiedAt: number;
  credentialId: string;
}

export interface RecoveryCodeRecord {
  hash: string;
  usedAt: number | null;
}

export interface AdminSecurityState {
  passkeyRequired: boolean;
  verificationsValidAfter: number;
  failedAttempts: number;
  lockedUntil: number | null;
  challenge: PendingChallenge | null;
  activationProof: ActivationProof | null;
  recoveryCodes: RecoveryCodeRecord[];
  recoveryCodesGeneratedAt: number | null;
}

export interface StoredPasskey {
  id: string;
  publicKey: string;
  counter: number;
  transports: string[];
  rpId: string;
  label: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: number;
  lastUsedAt: number | null;
}

export type SecurityEventType =
  | 'passkey_registered'
  | 'passkey_verified'
  | 'passkey_verification_failed'
  | 'passkey_revoked'
  | 'recovery_codes_generated'
  | 'recovery_code_used'
  | 'recovery_code_failed'
  | 'enforcement_enabled'
  | 'enforcement_disabled'
  | 'lockout';

const COLLECTION = 'adminSecurity';

const defaultState = (): AdminSecurityState => ({
  passkeyRequired: false,
  verificationsValidAfter: 0,
  failedAttempts: 0,
  lockedUntil: null,
  challenge: null,
  activationProof: null,
  recoveryCodes: [],
  recoveryCodesGeneratedAt: null,
});

function stateDoc(uid: string) {
  return db.collection(COLLECTION).doc(uid);
}

function desktopHandoffDoc(uid: string, handoffId: string) {
  return stateDoc(uid).collection('desktopHandoffs').doc(handoffId);
}

function normalizeState(data: FirebaseFirestore.DocumentData | undefined): AdminSecurityState {
  const base = defaultState();
  if (!data) return base;
  return {
    passkeyRequired: data.passkeyRequired === true,
    verificationsValidAfter:
      typeof data.verificationsValidAfter === 'number' ? data.verificationsValidAfter : 0,
    failedAttempts: typeof data.failedAttempts === 'number' ? data.failedAttempts : 0,
    lockedUntil: typeof data.lockedUntil === 'number' ? data.lockedUntil : null,
    challenge:
      data.challenge && typeof data.challenge === 'object'
        ? (data.challenge as PendingChallenge)
        : null,
    activationProof:
      data.activationProof &&
      typeof data.activationProof.authTime === 'number' &&
      typeof data.activationProof.origin === 'string' &&
      typeof data.activationProof.verifiedAt === 'number' &&
      typeof data.activationProof.credentialId === 'string'
        ? (data.activationProof as ActivationProof)
        : null,
    recoveryCodes: Array.isArray(data.recoveryCodes)
      ? data.recoveryCodes
          .filter((c: unknown): c is RecoveryCodeRecord => !!c && typeof c === 'object' && typeof (c as any).hash === 'string')
          .map((c) => ({ hash: c.hash, usedAt: typeof c.usedAt === 'number' ? c.usedAt : null }))
      : [],
    recoveryCodesGeneratedAt:
      typeof data.recoveryCodesGeneratedAt === 'number' ? data.recoveryCodesGeneratedAt : null,
  };
}

export async function loadState(uid: string): Promise<AdminSecurityState> {
  const snap = await stateDoc(uid).get();
  return normalizeState(snap.data());
}

/**
 * Snapshot ridotto usato dal guard su ogni richiesta admin. Lettura sempre
 * autoritativa (nessuna cache): revoca e attivazione dell'obbligo devono
 * avere effetto immediato su ogni istanza del server.
 */
export interface GuardSnapshot {
  passkeyRequired: boolean;
  verificationsValidAfter: number;
}

export async function loadGuardSnapshot(uid: string, _now = Date.now()): Promise<GuardSnapshot> {
  const state = await loadState(uid);
  return {
    passkeyRequired: state.passkeyRequired,
    verificationsValidAfter: state.verificationsValidAfter,
  };
}

/**
 * Consuma in modo atomico la challenge in sospeso: la transazione garantisce
 * che due richieste concorrenti non possano riutilizzare la stessa challenge.
 */
export async function consumePendingChallenge(
  uid: string,
  kind: ChallengeKind,
  now: number,
): Promise<PendingChallenge | null> {
  return db.runTransaction(async (tx) => {
    const ref = stateDoc(uid);
    const snap = await tx.get(ref);
    const state = normalizeState(snap.data());
    const challenge = state.challenge;
    tx.set(ref, { challenge: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (!challenge || challenge.kind !== kind || challenge.expiresAt <= now) return null;
    return challenge;
  });
}

/**
 * Marca come usato un codice di recupero in modo atomico. Restituisce il
 * numero di codici rimasti, oppure `null` se il codice non è valido.
 */
export async function consumeRecoveryCode(uid: string, hash: string, now: number): Promise<number | null> {
  return db.runTransaction(async (tx) => {
    const ref = stateDoc(uid);
    const snap = await tx.get(ref);
    const state = normalizeState(snap.data());
    const index = state.recoveryCodes.findIndex((c) => c.hash === hash && !c.usedAt);
    if (index === -1) return null;
    const recoveryCodes = state.recoveryCodes.map((c, i) => (i === index ? { ...c, usedAt: now } : c));
    tx.set(
      ref,
      { recoveryCodes, failedAttempts: 0, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return recoveryCodes.filter((c) => !c.usedAt).length;
  });
}

export async function updateState(uid: string, patch: Partial<AdminSecurityState>): Promise<void> {
  await stateDoc(uid).set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function createDesktopHandoff(
  uid: string,
  handoffId: string,
  handoff: Omit<DesktopHandoff, 'uid'>,
): Promise<void> {
  await desktopHandoffDoc(uid, handoffId).set({
    ...handoff,
    uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function getDesktopHandoff(uid: string, handoffId: string): Promise<DesktopHandoff | null> {
  const snap = await desktopHandoffDoc(uid, handoffId).get();
  if (!snap.exists) return null;
  return { uid, ...(snap.data() as Omit<DesktopHandoff, 'uid'>) };
}

export async function saveDesktopHandoffChallenge(
  uid: string,
  handoffId: string,
  challenge: DesktopHandoffChallenge,
  now: number,
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const ref = desktopHandoffDoc(uid, handoffId);
    const snap = await tx.get(ref);
    const handoff = snap.data() as DesktopHandoff | undefined;
    if (!handoff || handoff.status !== 'pending' || handoff.expiresAt <= now) return false;
    tx.set(ref, { challenge, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}

export async function consumeDesktopHandoffChallenge(
  uid: string,
  handoffId: string,
  authTime: number,
  now: number,
): Promise<DesktopHandoffChallenge | null> {
  return db.runTransaction(async (tx) => {
    const ref = desktopHandoffDoc(uid, handoffId);
    const snap = await tx.get(ref);
    const handoff = snap.data() as DesktopHandoff | undefined;
    const challenge = handoff?.challenge;
    if (
      !handoff ||
      handoff.status !== 'pending' ||
      handoff.expiresAt <= now ||
      !challenge
    ) {
      return null;
    }
    tx.set(ref, { challenge: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (challenge.expiresAt <= now || challenge.authTime !== authTime) return null;
    return challenge;
  });
}

/**
 * Atomically advances a handoff once. The verifier/nonce checks run inside
 * the same transaction as the state change so a credential cannot be replayed.
 */
export async function transitionDesktopHandoff(
  uid: string,
  handoffId: string,
  expectedStatus: DesktopHandoffStatus,
  patch: Partial<DesktopHandoff>,
  now: number,
  predicate: (handoff: DesktopHandoff) => boolean = () => true,
): Promise<DesktopHandoff | null> {
  return db.runTransaction(async (tx) => {
    const ref = desktopHandoffDoc(uid, handoffId);
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const handoff = { uid, ...(snap.data() as Omit<DesktopHandoff, 'uid'>) };
    if (
      handoff.status !== expectedStatus ||
      handoff.expiresAt <= now ||
      !predicate(handoff)
    ) {
      return null;
    }
    tx.set(ref, { ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return handoff;
  });
}

export async function listPasskeys(uid: string): Promise<StoredPasskey[]> {
  const snap = await stateDoc(uid).collection('passkeys').get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<StoredPasskey, 'id'>) }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function getPasskey(uid: string, credentialId: string): Promise<StoredPasskey | null> {
  const snap = await stateDoc(uid).collection('passkeys').doc(credentialId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<StoredPasskey, 'id'>) };
}

export async function savePasskey(uid: string, passkey: StoredPasskey): Promise<void> {
  const { id, ...data } = passkey;
  await stateDoc(uid).collection('passkeys').doc(id).set(data);
}

export async function updatePasskey(
  uid: string,
  credentialId: string,
  patch: Partial<Omit<StoredPasskey, 'id'>>,
): Promise<void> {
  await stateDoc(uid).collection('passkeys').doc(credentialId).set(patch, { merge: true });
}

export async function deletePasskey(uid: string, credentialId: string): Promise<void> {
  await stateDoc(uid).collection('passkeys').doc(credentialId).delete();
}

export async function recordEvent(
  uid: string,
  type: SecurityEventType,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await stateDoc(uid).collection('events').add({ type, detail, at: Date.now() });
}

// ---- Codici di recupero -------------------------------------------------

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

/** Genera codici leggibili (es. `K7PM-3QZD-8WNH`) senza caratteri ambigui. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(12);
    let raw = '';
    for (const b of bytes) raw += alphabet[b % alphabet.length];
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`);
  }
  return codes;
}

/** Challenge casuale in base64url, come richiesto da WebAuthn. */
export function generateChallengeValue(): string {
  return randomBytes(32).toString('base64url');
}
