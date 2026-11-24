import type { NextFunction, Response } from 'express';

export const PRINT_SHOP_UPLOAD_RATE_LIMIT = 1_200;

/**
 * Dietro il proxy di Replit `req.ip` è l'indirizzo del proxy per tutti i
 * visitatori: senza l'header inoltrato un limite per IP diventerebbe un unico
 * contatore globale (facile da esaurire per chiunque). Si usa il primo
 * indirizzo di X-Forwarded-For, come già fanno le gift card.
 */
export function requestClientKey(req: any): string {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0]?.trim();
  return forwarded || req.ip || 'unknown';
}

export function uidRateLimiter(maxRequests: number, windowMs: number) {
  const attempts = new Map<string, { count: number; resetAt: number }>();
  return (req: any, res: Response, next: NextFunction) => {
    const key = req.user?.uid || requestClientKey(req);
    const now = Date.now();
    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      if (attempts.size > 5000) for (const [stored, value] of attempts) if (value.resetAt <= now) attempts.delete(stored);
      next();
      return;
    }
    current.count++;
    if (current.count > maxRequests) {
      res.setHeader('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
      res.status(429).json({
        error: { code: 'rate_limited', message: 'Troppi tentativi, riprova tra poco' },
      });
      return;
    }
    next();
  };
}
