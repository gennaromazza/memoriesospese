import type { NextFunction, Response } from 'express';

export const PRINT_SHOP_UPLOAD_RATE_LIMIT = 1_200;

export function uidRateLimiter(maxRequests: number, windowMs: number) {
  const attempts = new Map<string, { count: number; resetAt: number }>();
  return (req: any, res: Response, next: NextFunction) => {
    const key = req.user?.uid || req.ip || 'unknown';
    const now = Date.now();
    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
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
