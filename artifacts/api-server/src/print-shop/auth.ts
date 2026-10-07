import type { NextFunction, Request, Response } from 'express';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { adminPasskeyGate, type AdminGateRejection } from '../admin-security/admin-guard.js';

type TokenVerifier = (token: string) => Promise<DecodedIdToken>;

type AdminGate = (decoded: DecodedIdToken) => Promise<AdminGateRejection | null>;

export function createPrintShopAuthenticator(
  verify: TokenVerifier = token => getAuth().verifyIdToken(token, true),
  gate: AdminGate = decoded => adminPasskeyGate(decoded),
) {
  return async (req: any, res: Response, next: NextFunction) => {
    const authorization = String(req.headers?.authorization || '');
    if (!authorization.startsWith('Bearer ')) {
      res.status(401).json({
        error: { code: 'unauthenticated', message: 'Accesso richiesto' },
      });
      return;
    }
    const token = authorization.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({
        error: { code: 'unauthenticated', message: 'Token mancante' },
      });
      return;
    }
    let decoded: DecodedIdToken;
    try {
      decoded = await verify(token);
      if (!decoded.uid || typeof decoded.email !== 'string' || !decoded.email) {
        throw new Error('Account Firebase senza email');
      }
      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.email_verified === true,
        provider: decoded.firebase?.sign_in_provider,
      };
    } catch {
      res.status(401).json({
        error: { code: 'unauthenticated', message: 'Token non valido o scaduto' },
      });
      return;
    }
    // L'account amministrativo con passkey obbligatoria deve averla verificata
    // anche per lo shop stampe (gestione ordini, listini, ecc.).
    const rejection = await gate(decoded);
    if (rejection) {
      res.status(rejection.status).json({ error: { code: rejection.body.code, message: rejection.body.error } });
      return;
    }
    next();
  };
}
export const authenticatePrintShop = createPrintShopAuthenticator();

export function requirePrintShopCustomer(req: any, res: Response, next: NextFunction) {
  const provider = req.user?.provider;
  if (provider === 'google.com' && req.user?.emailVerified !== true) {
    res.status(403).json({
      error: { code: 'email_not_verified', message: 'Verifica il tuo indirizzo email' },
    });
    return;
  }
  if (provider !== 'google.com' && provider !== 'password') {
    res.status(403).json({
      error: { code: 'unsupported_auth_provider', message: 'Accedi con Google oppure con email e password' },
    });
    return;
  }
  next();
}
