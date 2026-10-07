/**
 * Route `/api/admin/security`: gestione passkey dell'amministratore.
 *
 * Tutte le route richiedono un token Firebase valido con email admin.
 * Le operazioni che modificano lo stato (revoca, obbligatorietà, nuovi codici,
 * registrazione di passkey aggiuntive) richiedono anche una verifica passkey
 * corrente quando l'obbligo è attivo; le route di verifica e recupero no,
 * perché servono proprio a ottenerla.
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getAuth } from 'firebase-admin/auth';
import { authenticateFirebase } from '../email-routes.js';
import {
  ADMIN_PASSKEY_REQUIRED_CODE,
  evaluateAdminPasskey,
  requireAdminIdentity,
  type AuthenticatedUser,
} from './admin-guard.js';
import { isProductionPasskeyOrigin, resolveRelyingParty } from './passkey-origins.js';
import { readAdminPasskeyClaim, readAuthTime } from './admin-identity.js';
import {
  PasskeyError,
  describeSecurity,
  finishAuthentication,
  finishDesktopHandoffAuthentication,
  finishRegistration,
  finalizeDesktopHandoff,
  getCurrentPasskeyClaim,
  redeemRecoveryCode,
  regenerateRecoveryCodes,
  revokePasskey,
  setEnforcement,
  startAuthentication,
  startDesktopHandoffAuthentication,
  startRegistration,
  DESKTOP_HANDOFF_TTL_MS,
} from './passkey-service.js';
import {
  createDesktopHandoff,
  getDesktopHandoff,
  listPasskeys,
  loadState,
  transitionDesktopHandoff,
} from './admin-security-store.js';

const router = express.Router();
const handoffIdSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const verifierSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const verifierHashSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
// Queste route servono a ottenere la verifica: il gate centrale di
// `authenticateFirebase` non deve bloccarle.
router.use((req, _res, next) => {
  (req as any).adminPasskeyGateExempt = true;
  return next();
});
router.use(authenticateFirebase, requireAdminIdentity);

function identityOf(req: Request, res: Response) {
  const user = (req as any).user as AuthenticatedUser;
  const authTime = readAuthTime(user.claims);
  if (authTime === null) {
    res.status(401).json({ error: 'Token privo di auth_time', code: 'invalid_token' });
    return null;
  }
  return { uid: user.uid, email: user.email, authTime };
}

function relyingPartyOf(req: Request, res: Response) {
  const rp = resolveRelyingParty(req.headers.origin);
  if (!rp) {
    res.status(400).json({ error: 'Origine non consentita per la passkey', code: 'origin_not_allowed' });
    return null;
  }
  return rp;
}

// Le GET same-origin di fetch non inviano normalmente Origin; per lo stato
// informativo usiamo il Referer. L'azione POST usa invece soltanto Origin.
function statusOrigin(req: Request): string | undefined {
  if (req.headers.origin) return req.headers.origin;
  try {
    return req.headers.referer ? new URL(req.headers.referer).origin : undefined;
  } catch {
    return undefined;
  }
}

function handoffVerifierMatches(expectedHash: string, verifier: string): boolean {
  const actual = createHash('sha256').update(verifier).digest('base64url');
  const expected = Buffer.from(expectedHash);
  const actualBytes = Buffer.from(actual);
  return expected.length === actualBytes.length && timingSafeEqual(expected, actualBytes);
}

function desktopHandoffClaim(req: Request): { id: string; nonce: string } | null {
  const user = (req as any).user as AuthenticatedUser;
  const claim = user.claims?.adminDesktopHandoff;
  if (!claim || typeof claim !== 'object') return null;
  const value = claim as Record<string, unknown>;
  if (
    typeof value.id !== 'string' ||
    !handoffIdSchema.safeParse(value.id).success ||
    typeof value.nonce !== 'string' ||
    !verifierSchema.safeParse(value.nonce).success
  ) {
    return null;
  }
  return { id: value.id, nonce: value.nonce };
}

/**
 * Quando l'obbligo è attivo le modifiche richiedono una verifica corrente.
 * Prima dell'attivazione (bootstrap) basta l'identità admin.
 */
async function requireVerifiedWhenEnforced(req: Request, res: Response, next: NextFunction) {
  try {
    const evaluation = await evaluateAdminPasskey((req as any).user as AuthenticatedUser);
    if (evaluation.passkeyRequired && !evaluation.verified) {      res.status(403).json({
        error: 'Verifica passkey richiesta per modificare le impostazioni di sicurezza',
        code: ADMIN_PASSKEY_REQUIRED_CODE,
      });
      return;
    }
    return next();
  } catch (error) {
    next(error);
  }
}

/** La prima passkey può essere registrata senza verifica; le successive no. */
async function requireVerifiedForAdditionalPasskey(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user as AuthenticatedUser;
    const existing = await listPasskeys(user.uid);
    if (existing.length === 0) return next();
    const evaluation = await evaluateAdminPasskey(user);
    if (!evaluation.verified) {      res.status(403).json({
        error: 'Verifica la passkey esistente prima di aggiungerne un’altra',
        code: ADMIN_PASSKEY_REQUIRED_CODE,
      });
      return;
    }
    return next();
  } catch (error) {
    next(error);
  }
}

function handleError(error: unknown, req: Request, res: Response) {
  if (error instanceof PasskeyError) {
    return res.status(error.status).json({ error: error.message, code: error.code, ...error.extra });
  }
  (req as any).log?.error?.({ err: error }, 'Errore sicurezza admin');  res.status(500).json({ error: 'Errore interno di sicurezza', code: 'internal' });
  return;
}

router.get('/status', async (req, res) => {
  try {
    const user = (req as any).user as AuthenticatedUser;
    const identity = identityOf(req, res);
    if (!identity) return;
    const [summary, evaluation, expectedClaim] = await Promise.all([
      describeSecurity(user.uid, identity, readAdminPasskeyClaim(user.claims), statusOrigin(req)),
      evaluateAdminPasskey(user),
      getCurrentPasskeyClaim(user.uid),
    ]);
    res.json({
      ...summary,
      activationReady: summary.activationReady && evaluation.verified,
      verified: evaluation.verified,
      verifiedUntil: evaluation.verifiedUntil,
      expectedClaim,
    });
  } catch (error) {
    handleError(error, req, res);
  }
});

/**
 * The desktop cannot perform WebAuthn from its app:// origin. Start a short,
 * session-bound handoff that the trusted production website can complete.
 */
router.post('/desktop-handoff/start', async (req, res) => {
  const body = z.object({ verifierHash: verifierHashSchema }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Richiesta Windows non valida', code: 'invalid_body' });
    return;
  }
  const identity = identityOf(req, res);
  if (!identity) return;
  try {
    const state = await loadState(identity.uid);
    if (!state.passkeyRequired) {
      res.status(409).json({ error: 'La verifica passkey non è richiesta', code: 'passkey_not_required' });
      return;
    }
    const productionPasskeys = (await listPasskeys(identity.uid))
      .filter((passkey) => passkey.rpId === 'imagestudiofotografico.com');
    if (productionPasskeys.length === 0) {
      res.status(404).json({ error: 'Nessuna passkey registrata per il sito di produzione', code: 'no_passkey' });
      return;
    }

    const handoffId = randomBytes(32).toString('base64url');
    const now = Date.now();
    await createDesktopHandoff(identity.uid, handoffId, {
      verifierHash: body.data.verifierHash,
      desktopAuthTime: identity.authTime,
      createdAt: now,
      expiresAt: now + DESKTOP_HANDOFF_TTL_MS,
      status: 'pending',
      challenge: null,
      verifiedAt: null,
      verificationAuthTime: null,
      verificationOrigin: null,
      credentialId: null,
      nonceHash: null,
      finalizedAuthTime: null,
    });

    const verificationUrl = new URL('/admin/sicurezza', 'https://imagestudiofotografico.com');
    verificationUrl.searchParams.set('desktopHandoff', handoffId);
    res.json({
      handoffId,
      verificationUrl: verificationUrl.toString(),
      expiresAt: now + DESKTOP_HANDOFF_TTL_MS,
    });
  } catch (error) {
    handleError(error, req, res);
  }
});

router.post('/desktop-handoff/:handoffId/authentication/options', async (req, res) => {
  const handoffId = handoffIdSchema.safeParse(req.params.handoffId);
  if (!handoffId.success) {
    res.status(404).json({ error: 'Richiesta Windows non valida o scaduta', code: 'desktop_handoff_not_found' });
    return;
  }
  const rp = relyingPartyOf(req, res);
  if (!rp) return;
  if (!isProductionPasskeyOrigin(rp.origin)) {
    res.status(400).json({ error: 'La verifica Windows richiede il sito di produzione', code: 'origin_not_allowed' });
    return;
  }
  try {
    const identity = identityOf(req, res);
    if (!identity) return;
    res.json(await startDesktopHandoffAuthentication(identity, rp, handoffId.data));
  } catch (error) {
    handleError(error, req, res);
  }
});

const desktopHandoffVerifySchema = z.object({
  response: z.object({ id: z.string().min(1) }).passthrough(),
});

router.post('/desktop-handoff/:handoffId/authentication/verify', async (req, res) => {
  const handoffId = handoffIdSchema.safeParse(req.params.handoffId);
  if (!handoffId.success) {
    res.status(404).json({ error: 'Richiesta Windows non valida o scaduta', code: 'desktop_handoff_not_found' });
    return;
  }
  const rp = relyingPartyOf(req, res);
  if (!rp) return;
  if (!isProductionPasskeyOrigin(rp.origin)) {
    res.status(400).json({ error: 'La verifica Windows richiede il sito di produzione', code: 'origin_not_allowed' });
    return;
  }
  const parsed = desktopHandoffVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Risposta di autenticazione non valida', code: 'invalid_body' });
    return;
  }
  const identity = identityOf(req, res);
  if (!identity) return;
  try {
    res.json(await finishDesktopHandoffAuthentication(
      identity,
      rp,
      handoffId.data,
      parsed.data.response as any,
    ));
  } catch (error) {
    handleError(error, req, res);
  }
});

const desktopHandoffSecretSchema = z.object({ verifier: verifierSchema });

router.post('/desktop-handoff/:handoffId/status', async (req, res) => {
  const handoffId = handoffIdSchema.safeParse(req.params.handoffId);
  const body = desktopHandoffSecretSchema.safeParse(req.body);
  if (!handoffId.success || !body.success) {
    res.status(400).json({ error: 'Richiesta Windows non valida', code: 'invalid_body' });
    return;
  }
  const identity = identityOf(req, res);
  if (!identity) return;
  try {
    const handoff = await getDesktopHandoff(identity.uid, handoffId.data);
    if (
      !handoff ||
      handoff.desktopAuthTime !== identity.authTime ||
      !handoffVerifierMatches(handoff.verifierHash, body.data.verifier)
    ) {
      res.status(404).json({ error: 'Richiesta Windows non valida o scaduta', code: 'desktop_handoff_not_found' });
      return;
    }
    if (handoff.expiresAt <= Date.now()) {
      res.json({ status: 'expired' });
      return;
    }
    res.json({ status: handoff.status === 'verified' ? 'verified' : 'pending' });
  } catch (error) {
    handleError(error, req, res);
  }
});

router.post('/desktop-handoff/:handoffId/redeem', async (req, res) => {
  const handoffId = handoffIdSchema.safeParse(req.params.handoffId);
  const body = desktopHandoffSecretSchema.safeParse(req.body);
  if (!handoffId.success || !body.success) {
    res.status(400).json({ error: 'Richiesta Windows non valida', code: 'invalid_body' });
    return;
  }
  const identity = identityOf(req, res);
  if (!identity) return;
  try {
    const nonce = randomBytes(32).toString('base64url');
    const nonceHash = createHash('sha256').update(nonce).digest('hex');
    const handoff = await transitionDesktopHandoff(
      identity.uid,
      handoffId.data,
      'verified',
      { status: 'redeemed', nonceHash },
      Date.now(),
      (current) =>
        current.desktopAuthTime === identity.authTime &&
        handoffVerifierMatches(current.verifierHash, body.data.verifier),
    );
    if (!handoff) {
      res.status(400).json({ error: 'La verifica Windows non è pronta o è già stata utilizzata', code: 'desktop_handoff_not_ready' });
      return;
    }
    const customToken = await getAuth().createCustomToken(identity.uid, {
      adminDesktopHandoff: { id: handoffId.data, nonce },
    });
    res.json({ customToken });
  } catch (error) {
    handleError(error, req, res);
  }
});

router.post('/desktop-handoff/finalize', async (req, res) => {
  const identity = identityOf(req, res);
  if (!identity) return;
  const handoffClaim = desktopHandoffClaim(req);
  if (!handoffClaim) {
    res.status(400).json({ error: 'Sessione Windows non valida', code: 'desktop_handoff_invalid' });
    return;
  }
  try {
    const claim = await finalizeDesktopHandoff(identity, handoffClaim.id, handoffClaim.nonce);
    res.json({ verifiedUntil: claim.exp, expectedClaim: claim });
  } catch (error) {
    handleError(error, req, res);
  }
});

router.post('/registration/options', requireVerifiedForAdditionalPasskey, async (req, res) => {
  const rp = relyingPartyOf(req, res);
  if (!rp) return;
  try {
    const identity = identityOf(req, res);
    if (!identity) return;
    res.json(await startRegistration(identity, rp));
  } catch (error) {
    handleError(error, req, res);
  }
});

const registrationVerifySchema = z.object({
  response: z.object({ id: z.string().min(1) }).passthrough(),
  label: z.string().max(60).optional().default(''),
});

router.post('/registration/verify', requireVerifiedForAdditionalPasskey, async (req, res) => {
  const rp = relyingPartyOf(req, res);
  if (!rp) return;
  const parsed = registrationVerifySchema.safeParse(req.body);
  if (!parsed.success) {    res.status(400).json({ error: 'Risposta di registrazione non valida', code: 'invalid_body' });
    return;
  }
  const identity = identityOf(req, res);
  if (!identity) return;
  try {
    const result = await finishRegistration(
      identity,
      rp,
      parsed.data.response as any,
      parsed.data.label,
    );
    res.json({ passkey: result.passkey });
  } catch (error) {
    handleError(error, req, res);
  }
});

router.post('/authentication/options', async (req, res) => {
  const rp = relyingPartyOf(req, res);
  if (!rp) return;
  try {
    const identity = identityOf(req, res);
    if (!identity) return;
    res.json(await startAuthentication(identity, rp));
  } catch (error) {
    handleError(error, req, res);
  }
});

const authenticationVerifySchema = z.object({
  response: z.object({ id: z.string().min(1) }).passthrough(),
});

router.post('/authentication/verify', async (req, res) => {
  const rp = relyingPartyOf(req, res);
  if (!rp) return;
  const parsed = authenticationVerifySchema.safeParse(req.body);
  if (!parsed.success) {    res.status(400).json({ error: 'Risposta di autenticazione non valida', code: 'invalid_body' });
    return;
  }
  const identity = identityOf(req, res);
  if (!identity) return;
  try {
    const claim = await finishAuthentication(identity, rp, parsed.data.response as any);
    res.json({ verifiedUntil: claim.exp, expectedClaim: claim });
  } catch (error) {
    handleError(error, req, res);
  }
});

const recoverySchema = z.object({ code: z.string().min(8).max(40) });

router.post('/recovery/verify', async (req, res) => {
  const parsed = recoverySchema.safeParse(req.body);
  if (!parsed.success) {    res.status(400).json({ error: 'Codice di recupero mancante', code: 'invalid_body' });
    return;
  }
  const identity = identityOf(req, res);
  if (!identity) return;
  try {
    const claim = await redeemRecoveryCode(identity, parsed.data.code);
    res.json({ verifiedUntil: claim.exp, expectedClaim: claim });
  } catch (error) {
    handleError(error, req, res);
  }
});

router.post('/recovery-codes', requireVerifiedWhenEnforced, async (req, res) => {
  const identity = identityOf(req, res);
  if (!identity) return;
  try {
    const codes = await regenerateRecoveryCodes(identity);
    res.json({ codes });
  } catch (error) {
    handleError(error, req, res);
  }
});

router.delete('/passkeys/:credentialId', requireVerifiedWhenEnforced, async (req, res) => {
  const identity = identityOf(req, res);
  if (!identity) return;
  try {
    const expectedClaim = await revokePasskey(identity, String(req.params.credentialId));
    res.json({ success: true, expectedClaim });
  } catch (error) {
    handleError(error, req, res);
  }
});

const enforcementSchema = z.object({ required: z.boolean() });

router.post('/enforcement', requireVerifiedWhenEnforced, async (req, res) => {
  const parsed = enforcementSchema.safeParse(req.body);
  if (!parsed.success) {    res.status(400).json({ error: 'Parametro required mancante', code: 'invalid_body' });
    return;
  }
  try {
    // L'attivazione richiede una verifica passkey nella sessione corrente,
    // così l'admin dimostra di avere una passkey funzionante prima del blocco.
    if (parsed.data.required) {
      const evaluation = await evaluateAdminPasskey((req as any).user as AuthenticatedUser);
      if (!evaluation.verified) {        res.status(403).json({
          error: 'Verifica la passkey prima di renderla obbligatoria',
          code: ADMIN_PASSKEY_REQUIRED_CODE,
        });
        return;
      }
    }
    const identity = identityOf(req, res);
    if (!identity) return;
    const user = (req as any).user as AuthenticatedUser;
    const claim = await setEnforcement(identity, parsed.data.required, readAdminPasskeyClaim(user.claims), req.headers.origin);
    res.json({
      passkeyRequired: parsed.data.required,
      verifiedUntil: claim.exp || null,
      expectedClaim: claim,
    });
  } catch (error) {
    handleError(error, req, res);
  }
});

export default router;
