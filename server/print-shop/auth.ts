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

export function requireVerifiedGoogle(req: any, res: Response, next: NextFunction) {
  if (req.user?.emailVerified !== true) {
    res.status(403).json({
      error: { code: 'email_not_verified', message: 'Verifica il tuo indirizzo email' },
    });
    return;
  }
  if (req.user?.provider !== 'google.com') {
    res.status(403).json({
      error: { code: 'google_account_required', message: 'Accedi con Google per ordinare le stampe' },
    });
    return;
  }
  next();
}
