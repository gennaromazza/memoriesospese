import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod/v4';
import { CommerceHttpError } from './errors.js';

/**
 * Pezzi HTTP comuni ai moduli di vendita online: risposta d'errore uniforme,
 * identità del cliente e controllo degli amministratori.
 */

export const DEFAULT_ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

export interface CommerceIdentity {
  uid: string;
  email: string;
}

export function sendError(res: Response, error: unknown, logLabel = 'Commerce'): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: 'invalid_request', message: 'Dati non validi', details: error.issues },
    });
    return;
  }
  if (error instanceof CommerceHttpError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
    });
    return;
  }
  console.error(`❌ [${logLabel}] Unexpected error:`, error);
  res.status(500).json({ error: { code: 'internal', message: 'Errore interno' } });
}

export function route(
  handler: (req: any, res: Response, next: NextFunction) => Promise<void>,
  logLabel = 'Commerce',
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      sendError(res, error, logLabel);
    }
  };
}

export function identity(req: any): CommerceIdentity {
  if (!req.user?.uid || !req.user?.email) {
    throw new CommerceHttpError(401, 'unauthenticated', 'Accesso richiesto');
  }
  return { uid: req.user.uid, email: req.user.email };
}

export function requireAdmin(adminEmails: readonly string[]) {
  const allowed = new Set(adminEmails.map(email => email.trim().toLowerCase()));
  return (req: any, res: Response, next: NextFunction) => {
    if (!allowed.has(String(req.user?.email || '').trim().toLowerCase())) {
      res.status(403).json({ error: { code: 'forbidden', message: 'Accesso riservato allo studio' } });
      return;
    }
    next();
  };
}

/** Email amministratore predefinita più quelle elencate nelle variabili d'ambiente indicate. */
export function configuredAdminEmails(
  envNames: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const fromEnv = envNames
    .flatMap(name => (env[name] || '').split(','))
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ADMIN_EMAILS, ...fromEnv])];
}
