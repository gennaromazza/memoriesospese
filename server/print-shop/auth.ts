import type { NextFunction, Request, Response } from 'express';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';

type TokenVerifier = (token: string) => Promise<DecodedIdToken>;

export function createPrintShopAuthenticator(
  verify: TokenVerifier = token => getAuth().verifyIdToken(token, true),
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
    try {
      const decoded = await verify(token);
      if (!decoded.uid || typeof decoded.email !== 'string' || !decoded.email) {
        throw new Error('Account Firebase senza email');
      }
      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.email_verified === true,
        provider: decoded.firebase?.sign_in_provider,
      };
      next();
    } catch {
      res.status(401).json({
        error: { code: 'unauthenticated', message: 'Token non valido o scaduto' },
      });
    }
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
