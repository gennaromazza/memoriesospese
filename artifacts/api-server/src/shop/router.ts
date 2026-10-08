import express, { type RequestHandler } from 'express';
import { z } from 'zod/v4';
import { SHOP_MAX_CATEGORIES } from '@shared/shop-types';
import { configuredAdminEmails, requireAdmin, route } from '../commerce/http.js';
import type { ShopService } from './service.js';

export interface ShopRouterDependencies {
  service: ShopService;
  authenticate: RequestHandler;
  adminEmails: readonly string[];
}

const shippingSchema = z.object({
  enabled: z.boolean(),
  priceCents: z.number().int().min(0).max(100_000_000),
  estimatedMinDays: z.number().int().min(1).max(60),
  estimatedMaxDays: z.number().int().min(1).max(90),
}).strict().refine(
  value => value.estimatedMaxDays >= value.estimatedMinDays,
  { message: 'Il tempo massimo non può essere inferiore al minimo', path: ['estimatedMaxDays'] },
);

const settingsSchema = z.object({
  enabled: z.boolean(),
  ordersOpen: z.boolean(),
  categoryValues: z.array(z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/)).max(SHOP_MAX_CATEGORIES),
  lastOrderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  photoWaitDays: z.number().int().min(1).max(60),
  shipping: shippingSchema,
}).strict();

export function createShopRouter(overrides: Partial<ShopRouterDependencies> & Pick<ShopRouterDependencies, 'service' | 'authenticate'>): express.Router {
  const deps: ShopRouterDependencies = {
    adminEmails: configuredAdminEmails(['PRINT_SHOP_ADMIN_EMAILS', 'SHOP_ADMIN_EMAILS']),
    ...overrides,
  };
  const router = express.Router();
  const auth = deps.authenticate;
  const admin = requireAdmin(deps.adminEmails);
  const handle = (handler: Parameters<typeof route>[0]) => route(handler, 'Shop');

  router.get('/catalog', handle(async (_req, res) => {
    // Il catalogo cambia di rado e viene letto da chiunque: una breve cache basta.
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(await deps.service.publicCatalog());
  }));

  router.get('/admin/settings', auth, admin, handle(async (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ settings: await deps.service.settings() });
  }));

  router.put('/admin/settings', auth, admin, handle(async (req, res) => {
    const input = settingsSchema.parse(req.body);
    res.json({ settings: await deps.service.updateSettings(input) });
  }));

  return router;
}
