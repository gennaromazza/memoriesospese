/**
 * Guard condiviso per le API amministrative.
 *
 * `requireAdmin` = email admin verificata + (se attiva l'obbligatorietà)
 * verifica passkey valida. `requireAdminIdentity` controlla soltanto l'email
 * ed è riservato alle route che servono a ottenere la verifica stessa.
 *
 * Risposte:
 *  403 { error, code: 'admin_only' }                utente non amministratore
 *  403 { error, code: 'admin_passkey_required' }    passkey obbligatoria non verificata
 *  503 { error, code: 'admin_security_unavailable' } stato non leggibile (fail-closed)
 */

import type { NextFunction, Request, Response } from 'express';
import {
  isAdminEmail,
  isAdminPasskeyClaimValid,
  readAdminPasskeyClaim,
  readAuthTime,
  type AdminPasskeyClaim,
} from './admin-identity.js';
import { loadGuardSnapshot } from './admin-security-store.js';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  /** Claims decodificati del token Firebase (assenti solo in test legacy). */
  claims?: Record<string, unknown>;
}

export const ADMIN_PASSKEY_REQUIRED_CODE = 'admin_passkey_required';

export interface AdminPasskeyEvaluation {
  passkeyRequired: boolean;
  verified: boolean;
  /** Scadenza della verifica corrente, se valida. */
  verifiedUntil: number | null;
  claim: AdminPasskeyClaim | null;
}

export async function evaluateAdminPasskey(
  user: AuthenticatedUser,
  now = Date.now(),
): Promise<AdminPasskeyEvaluation> {
  const snapshot = await loadGuardSnapshot(user.uid, now);
  const claim = readAdminPasskeyClaim(user.claims);
  const verified =
    (!snapshot.passkeyRequired || claim?.req === true) &&
    isAdminPasskeyClaimValid(
      claim,
      now,
      snapshot.verificationsValidAfter,
      readAuthTime(user.claims),
    );
  return {
    passkeyRequired: snapshot.passkeyRequired,
    verified,
    verifiedUntil: verified && claim ? claim.exp ?? null : null,
    claim,
  };
}

export interface AdminGateRejection {
  status: number;
  body: { error: string; code: string };
}

/**
 * Gate centrale per qualunque token già verificato: se l'account è quello
 * amministrativo e la passkey è obbligatoria ma non verificata, restituisce la
 * risposta da inviare; altrimenti `null`. Da usare dopo ogni `verifyIdToken`
 * che non passa da `authenticateFirebase`.
 */
export async function adminPasskeyGate(
  decoded: { uid: string; email?: string | null } & Record<string, unknown>,
  now = Date.now(),
): Promise<AdminGateRejection | null> {
  if (!isAdminEmail(decoded.email)) return null;
  let evaluation: AdminPasskeyEvaluation;
  try {
    evaluation = await evaluateAdminPasskey(
      { uid: decoded.uid, email: decoded.email ?? '', claims: decoded },
      now,
    );
  } catch {
    return {
      status: 503,
      body: {
        error: 'Verifica di sicurezza amministratore non disponibile',
        code: 'admin_security_unavailable',
      },
    };
  }
  if (evaluation.passkeyRequired && !evaluation.verified) {
    return {
      status: 403,
      body: {
        error: 'Verifica passkey richiesta per le operazioni amministrative',
        code: ADMIN_PASSKEY_REQUIRED_CODE,
      },
    };
  }
  return null;
}

export function requireAdminIdentity(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as AuthenticatedUser | undefined;
  if (!user || !isAdminEmail(user.email)) {
    return res.status(403).json({ error: 'Accesso negato: solo admin', code: 'admin_only' });
  }
  return next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as AuthenticatedUser | undefined;
  if (!user || !isAdminEmail(user.email)) {
    return res.status(403).json({ error: 'Accesso negato: solo admin', code: 'admin_only' });
  }

  let evaluation: AdminPasskeyEvaluation;
  try {
    evaluation = await evaluateAdminPasskey(user);
  } catch (error) {
    (req as any).log?.error?.({ err: error }, 'Stato sicurezza admin non disponibile');
    return res.status(503).json({
      error: 'Verifica di sicurezza amministratore non disponibile',
      code: 'admin_security_unavailable',
    });
  }

  if (evaluation.passkeyRequired && !evaluation.verified) {
    return res.status(403).json({
      error: 'Verifica passkey richiesta per le operazioni amministrative',
      code: ADMIN_PASSKEY_REQUIRED_CODE,
    });
  }

  return next();
}
