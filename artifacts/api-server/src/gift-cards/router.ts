import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z, ZodError } from 'zod/v4';
import type { GiftCardStatus } from '@shared/gift-card-types';
import { GiftCardHttpError, type GiftCardService } from './service.js';

export interface GiftCardRouterDependencies {
  service: GiftCardService;
  authenticate: RequestHandler;
  adminEmails: readonly string[];
}

const PUBLIC_FAILURE_LIMIT = 30;
const PUBLIC_FAILURE_WINDOW_MS = 10 * 60 * 1000;

const sellSchema = z.object({
  typeId: z.string().trim().min(1).max(200),
  recipientName: z.string().max(200).default(''),
  message: z.string().max(500).default(''),
  paymentMethod: z.enum(['contante', 'carta', 'bonifico', 'paypal', 'altro']),
  expiresOn: z.string().trim().max(10).nullable().optional(),
  noExpiry: z.boolean().optional(),
}).strict();

const cancelSchema = z.object({ reason: z.string().max(500) }).strict();
const expirySchema = z.object({ expiresOn: z.string().trim().max(10).nullable() }).strict();
const STATUS_FILTER = ['in_attesa_pagamento', 'attiva', 'riscattata', 'scaduta', 'annullata'] as const;

function send(res: Response, status: number, body: unknown) {
  res.status(status).json(body);
}

function handle(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };
}

function clientKey(req: Request): string {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
  return forwarded || req.ip || 'unknown';
}

/**
 * Conta soltanto le ricerche andate a vuoto: chi prova a indovinare i codici
 * produce quasi solo 404, mentre i clienti veri non vengono mai rallentati.
 */
function createFailedLookupLimiter(now: () => number = Date.now): RequestHandler {
  const failures = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const key = clientKey(req);
    const current = failures.get(key);
    if (current && current.resetAt > now() && current.count >= PUBLIC_FAILURE_LIMIT) {
      res.setHeader('Retry-After', String(Math.ceil((current.resetAt - now()) / 1000)));
      send(res, 429, { error: { code: 'rate_limited', message: 'Troppi tentativi, riprova tra qualche minuto' } });
      return;
    }
    res.on('finish', () => {
      if (res.statusCode !== 404) return;
      const entry = failures.get(key);
      if (!entry || entry.resetAt <= now()) {
        failures.set(key, { count: 1, resetAt: now() + PUBLIC_FAILURE_WINDOW_MS });
      } else {
        entry.count++;
      }
      if (failures.size > 5000) {
        for (const [storedKey, value] of failures) if (value.resetAt <= now()) failures.delete(storedKey);
      }
    });
    next();
  };
}

export function createGiftCardRouter(deps: GiftCardRouterDependencies): express.Router {
  const { service } = deps;
  const router = express.Router();

  const requireAdmin: RequestHandler = (req: any, res, next) => {
    if (!deps.adminEmails.includes(String(req.user?.email || '').toLowerCase())) {
      send(res, 403, { error: { code: 'forbidden', message: 'Accesso negato: solo admin' } });
      return;
    }
    next();
  };
  const admin: RequestHandler[] = [deps.authenticate, requireAdmin];
  const adminEmail = (req: Request) => String((req as any).user?.email || '');

  // ---------------------------------------------------------- pubblico
  router.get(
    '/public/:code',
    createFailedLookupLimiter(),
    handle(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      send(res, 200, await service.getPublic(String(req.params.code)));
    }),
  );

  // -------------------------------------------------------------- tipi
  router.get('/types', ...admin, handle(async (_req, res) => {
    send(res, 200, { types: await service.listTypes() });
  }));
  router.post('/types', ...admin, handle(async (req, res) => {
    send(res, 201, await service.saveType(null, req.body, adminEmail(req)));
  }));
  router.put('/types/:id', ...admin, handle(async (req, res) => {
    send(res, 200, await service.saveType(String(req.params.id), req.body, adminEmail(req)));
  }));

  // ----------------------------------------------------- card emesse
  router.post('/sell', ...admin, handle(async (req, res) => {
    const input = sellSchema.parse(req.body);
    send(res, 201, await service.sell(input, adminEmail(req)));
  }));
  router.get('/', ...admin, handle(async (req, res) => {
    const status = String(req.query.status || '');
    const filter = (STATUS_FILTER as readonly string[]).includes(status) ? (status as GiftCardStatus) : undefined;
    send(res, 200, { cards: await service.list({ status: filter }) });
  }));
  router.get('/:code', ...admin, handle(async (req, res) => {
    send(res, 200, await service.get(String(req.params.code)));
  }));
  router.post('/:code/confirm-payment', ...admin, handle(async (req, res) => {
    send(res, 200, await service.confirmPayment(String(req.params.code), adminEmail(req)));
  }));
  router.post('/:code/cancel', ...admin, handle(async (req, res) => {
    const { reason } = cancelSchema.parse(req.body);
    send(res, 200, await service.cancel(String(req.params.code), reason, adminEmail(req)));
  }));
  router.patch('/:code/expiry', ...admin, handle(async (req, res) => {
    const { expiresOn } = expirySchema.parse(req.body);
    send(res, 200, await service.setExpiry(String(req.params.code), expiresOn, adminEmail(req)));
  }));

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof GiftCardHttpError) {
      send(res, error.status, { error: { code: error.code, message: error.message, details: error.details } });
      return;
    }
    if (error instanceof ZodError) {
      send(res, 422, {
        error: {
          code: 'invalid_input',
          message: 'Dati non validi',
          details: error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })),
        },
      });
      return;
    }
    console.error('[gift-cards] errore inatteso', error instanceof Error ? error.message : 'sconosciuto');
    send(res, 500, { error: { code: 'internal_error', message: 'Errore interno' } });
  });

  return router;
}
