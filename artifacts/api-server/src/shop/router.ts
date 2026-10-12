import archiver from 'archiver';
import express, { type RequestHandler } from 'express';
import { z } from 'zod/v4';
import { SHOP_MAX_CATEGORIES, SHOP_MAX_SHIPPING_GRAMS, SHOP_MAX_SHIPPING_TIERS, SHOP_RESENDABLE_MAILS, SHOP_TRACKING_CARRIER_MAX, SHOP_TRACKING_CODE_MAX } from '@shared/shop-types';
import { billingDetailsSchema, customerSchema, postalAddressSchema } from '../commerce/schemas.js';
import { CommerceHttpError } from '../commerce/errors.js';
import { configuredAdminEmails, identity, requireAdmin, route, setSensitiveHeaders } from '../commerce/http.js';
import { resolvePrintUploadOrigin } from '../print-shop/upload-origin.js';
import { uidRateLimiter } from '../print-shop/rate-limit.js';
import type { ShopAdminService } from './admin.js';
import type { ShopMaintenance } from './maintenance.js';
import type { ShopOrderService } from './orders.js';
import type { ShopPaymentService } from './payments.js';
import type { ShopService } from './service.js';
import type { ShopUploadService } from './uploads.js';

export interface ShopRouterDependencies {
  service: ShopService;
  orders: ShopOrderService;
  uploads: ShopUploadService;
  payments: ShopPaymentService;
  admin: ShopAdminService;
  maintenance: Pick<ShopMaintenance, 'run'>;
  /** Verifica l'identità (token Firebase). */
  authenticate: RequestHandler;
  /** Chi compra deve avere un accesso valido (Google verificato o email e password). */
  verifiedCustomer: RequestHandler;
  /** Verifica che la richiesta arrivi dal processo pianificato. */
  maintenanceAuth: RequestHandler;
  adminEmails: readonly string[];
}

const shippingTierSchema = z.object({
  maxGrams: z.number().int().min(1).max(SHOP_MAX_SHIPPING_GRAMS),
  priceCents: z.number().int().min(0).max(100_000_000),
}).strict();

const shippingSchema = z.object({
  enabled: z.boolean(),
  priceCents: z.number().int().min(0).max(100_000_000),
  estimatedMinDays: z.number().int().min(1).max(60),
  estimatedMaxDays: z.number().int().min(1).max(90),
  tiers: z.array(shippingTierSchema).max(SHOP_MAX_SHIPPING_TIERS).optional(),
}).strict().refine(
  value => value.estimatedMaxDays >= value.estimatedMinDays,
  { message: 'Il tempo massimo non può essere inferiore al minimo', path: ['estimatedMaxDays'] },
).refine(
  value => (value.tiers ?? []).every((tier, index, tiers) => index === 0 || tier.maxGrams > tiers[index - 1].maxGrams),
  { message: 'Le fasce di peso devono essere in ordine crescente e senza limiti uguali', path: ['tiers'] },
);

const settingsSchema = z.object({
  enabled: z.boolean(),
  ordersOpen: z.boolean(),
  categoryValues: z.array(z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/)).max(SHOP_MAX_CATEGORIES),
  lastOrderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  photoWaitDays: z.number().int().min(1).max(60),
  shipping: shippingSchema,
}).strict();

const lineSchema = z.object({
  lineId: z.string().regex(/^l_[a-f0-9]{8}$/).optional(),
  productId: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(20),
}).strict();

const createOrderSchema = z.object({
  lines: z.array(lineSchema).min(1).max(20),
  customer: customerSchema.optional(),
  customerNotes: z.string().trim().max(1000).optional(),
}).strict();

const replaceLinesSchema = z.object({ lines: z.array(lineSchema).min(1).max(20) }).strict();

const updateOrderSchema = z.object({
  customer: customerSchema.optional(),
  customerNotes: z.string().trim().max(1000).optional(),
  fulfillment: z.discriminatedUnion('method', [
    z.object({ method: z.literal('studio_pickup') }).strict(),
    z.object({ method: z.literal('shipping'), shippingAddress: postalAddressSchema }).strict(),
  ]).optional(),
  billingDetails: billingDetailsSchema.optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Nessuna modifica indicata');

const prepareUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(100),
  sizeBytes: z.number().int().positive(),
}).strict();

const finalizeUploadSchema = z.object({ assetId: z.string().trim().min(1).max(200) }).strict();

const paypalCreateSchema = z.object({
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
  personalizedProductionAccepted: z.boolean().optional(),
  expectedQuoteFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
  expectedTotalCents: z.number().int().positive(),
}).strict();

const paypalCaptureSchema = z.object({ paypalOrderId: z.string().trim().min(8).max(80).optional() }).strict();

const maintenanceSchema = z.object({ dryRun: z.boolean().optional() }).strict();

const adminListSchema = z.object({
  view: z.enum(['active', 'attention', 'drafts', 'closed', 'all']).default('active'),
  q: z.string().trim().max(100).optional(),
});

const adminStatusSchema = z.object({
  status: z.enum(['in_production', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled']),
  note: z.string().trim().max(500).optional(),
  tracking: z.object({
    carrier: z.string().trim().max(SHOP_TRACKING_CARRIER_MAX).optional(),
    code: z.string().trim().min(1).max(SHOP_TRACKING_CODE_MAX),
  }).strict().optional(),
}).strict();

const adminNotesSchema = z.object({ note: z.string().max(2000) }).strict();
const adminRejectPhotoSchema = z.object({ reason: z.string().trim().min(1).max(300) }).strict();
const adminResendSchema = z.object({ kind: z.enum(SHOP_RESENDABLE_MAILS) });

const asciiName = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file';

export function createShopRouter(
  overrides: Partial<ShopRouterDependencies> & Omit<ShopRouterDependencies, 'adminEmails'>,
): express.Router {
  const deps: ShopRouterDependencies = {
    adminEmails: configuredAdminEmails(['PRINT_SHOP_ADMIN_EMAILS', 'SHOP_ADMIN_EMAILS']),
    ...overrides,
  };
  const router = express.Router();
  const auth = deps.authenticate;
  const customer = deps.verifiedCustomer;
  const admin = requireAdmin(deps.adminEmails);
  const handle = (handler: Parameters<typeof route>[0]) => route(handler, 'Shop');
  const createLimiter = uidRateLimiter(10, 15 * 60_000);
  const uploadLimiter = uidRateLimiter(1_200, 10 * 60_000);
  const paymentLimiter = uidRateLimiter(20, 10 * 60_000);

  // Il catalogo lo legge chiunque, senza accesso: una breve cache evita che ogni richiesta
  // costi letture su Firestore. Vale solo per questa rotta: i prezzi degli ordini restano
  // sempre ricalcolati sui dati freschi.
  const CATALOG_CACHE_MS = 30_000;
  let catalogCache: { at: number; value: ReturnType<ShopRouterDependencies['service']['publicCatalog']> } | null = null;
  const publicCatalog = () => {
    const now = Date.now();
    if (catalogCache && now - catalogCache.at < CATALOG_CACHE_MS) return catalogCache.value;
    const value = deps.service.publicCatalog();
    catalogCache = { at: now, value };
    // Un errore non resta in cache: la richiesta dopo riprova.
    value.catch(() => {
      if (catalogCache?.value === value) catalogCache = null;
    });
    return value;
  };

  // --- pubbliche ----------------------------------------------------------

  router.get('/catalog', handle(async (_req, res) => {
    // Il catalogo cambia di rado e viene letto da chiunque: una breve cache basta.
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(await publicCatalog());
  }));

  router.get('/paypal/config', (_req, res) => {
    res.json(deps.payments.paypalConfig());
  });

  router.post('/paypal/webhook', handle(async (req, res) => {
    const result = await deps.payments.paypalWebhook(
      {
        transmissionId: req.get('paypal-transmission-id') || undefined,
        transmissionTime: req.get('paypal-transmission-time') || undefined,
        certUrl: req.get('paypal-cert-url') || undefined,
        authAlgo: req.get('paypal-auth-algo') || undefined,
        transmissionSig: req.get('paypal-transmission-sig') || undefined,
      },
      req.body,
    );
    res.json(result);
  }));

  router.post('/internal/maintenance', deps.maintenanceAuth, handle(async (req, res) => {
    const input = maintenanceSchema.parse(req.body ?? {});
    res.json(await deps.maintenance.run(input));
  }));

  // --- cliente ------------------------------------------------------------

  router.get('/orders', auth, customer, handle(async (req, res) => {
    setSensitiveHeaders(res);
    res.json({ orders: await deps.orders.listOwnerOrders(identity(req)) });
  }));

  router.post('/orders', auth, customer, createLimiter, handle(async (req, res) => {
    const input = createOrderSchema.parse(req.body);
    res.status(201).json({ order: await deps.orders.createDraft(identity(req), input) });
  }));

  router.get('/orders/:orderId', auth, customer, handle(async (req, res) => {
    setSensitiveHeaders(res);
    res.json({ order: await deps.orders.getOwnerOrder(identity(req), req.params.orderId) });
  }));

  router.put('/orders/:orderId/lines', auth, customer, createLimiter, handle(async (req, res) => {
    const input = replaceLinesSchema.parse(req.body);
    res.json({ order: await deps.orders.replaceLines(identity(req), req.params.orderId, input.lines) });
  }));

  router.patch('/orders/:orderId', auth, customer, handle(async (req, res) => {
    const input = updateOrderSchema.parse(req.body);
    res.json({ order: await deps.orders.updateOrder(identity(req), req.params.orderId, input) });
  }));

  router.delete('/orders/:orderId', auth, customer, handle(async (req, res) => {
    res.json(await deps.orders.cancelDraft(identity(req), req.params.orderId));
  }));

  router.post('/orders/:orderId/lines/:lineId/uploads/prepare', auth, customer, uploadLimiter, handle(async (req, res) => {
    const input = prepareUploadSchema.parse(req.body);
    const upload = await deps.uploads.prepare(
      identity(req),
      req.params.orderId,
      req.params.lineId,
      input,
      resolvePrintUploadOrigin({ origin: req.get('origin'), protocol: req.protocol, host: req.get('host') }),
    );
    res.status(201).json({ upload });
  }));

  router.post('/orders/:orderId/uploads/finalize', auth, customer, uploadLimiter, handle(async (req, res) => {
    const input = finalizeUploadSchema.parse(req.body);
    res.json({ asset: await deps.uploads.finalize(identity(req), req.params.orderId, input.assetId) });
  }));

  router.delete('/orders/:orderId/assets/:assetId', auth, customer, handle(async (req, res) => {
    res.json(await deps.uploads.remove(identity(req), req.params.orderId, req.params.assetId));
  }));

  router.get('/orders/:orderId/assets/:assetId/preview', auth, customer, handle(async (req, res) => {
    const preview = await deps.uploads.ownerPreview(identity(req), req.params.orderId, req.params.assetId);
    setSensitiveHeaders(res);
    res.type(preview.contentType).send(preview.body);
  }));

  router.post('/orders/:orderId/paypal/create', auth, customer, paymentLimiter, handle(async (req, res) => {
    const input = paypalCreateSchema.parse(req.body);
    res.json(await deps.payments.createPaypalOrder(identity(req), req.params.orderId, input));
  }));

  router.post('/orders/:orderId/paypal/capture', auth, customer, paymentLimiter, handle(async (req, res) => {
    const input = paypalCaptureSchema.parse(req.body ?? {});
    res.json(await deps.payments.capturePaypalOrder(identity(req), req.params.orderId, input));
  }));

  // --- studio -------------------------------------------------------------

  router.get('/admin/settings', auth, admin, handle(async (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ settings: await deps.service.settings() });
  }));

  router.put('/admin/settings', auth, admin, handle(async (req, res) => {
    const input = settingsSchema.parse(req.body);
    const settings = await deps.service.updateSettings(input);
    catalogCache = null;
    res.json({ settings });
  }));

  router.get('/admin/orders', auth, admin, handle(async (req, res) => {
    const query = adminListSchema.parse({ view: req.query.view, q: typeof req.query.q === 'string' ? req.query.q : undefined });
    setSensitiveHeaders(res);
    res.json({ orders: await deps.admin.listOrders(query) });
  }));

  router.get('/admin/orders/:orderId', auth, admin, handle(async (req, res) => {
    setSensitiveHeaders(res);
    res.json({ order: await deps.admin.getOrder(req.params.orderId) });
  }));

  router.patch('/admin/orders/:orderId/status', auth, admin, handle(async (req, res) => {
    const input = adminStatusSchema.parse(req.body);
    res.json({ order: await deps.admin.updateStatus(req.params.orderId, identity(req).email, input) });
  }));

  router.put('/admin/orders/:orderId/notes', auth, admin, handle(async (req, res) => {
    const input = adminNotesSchema.parse(req.body);
    res.json({ order: await deps.admin.setAdminNotes(req.params.orderId, input.note) });
  }));

  router.post('/admin/orders/:orderId/notifications/resend', auth, admin, handle(async (req, res) => {
    const input = adminResendSchema.parse(req.body);
    res.json({ order: await deps.admin.resendNotification(req.params.orderId, input.kind) });
  }));

  router.post('/admin/orders/:orderId/assets/:assetId/reject', auth, admin, handle(async (req, res) => {
    const input = adminRejectPhotoSchema.parse(req.body);
    res.json({ order: await deps.admin.requestNewPhoto(req.params.orderId, req.params.assetId, identity(req).email, input.reason) });
  }));

  router.post('/admin/orders/:orderId/reactivate', auth, admin, handle(async (req, res) => {
    res.json({ order: await deps.admin.reactivate(req.params.orderId, identity(req).email) });
  }));

  router.get('/admin/orders/:orderId/assets/:assetId/preview', auth, admin, handle(async (req, res) => {
    const preview = await deps.uploads.adminPreview(req.params.orderId, req.params.assetId);
    setSensitiveHeaders(res);
    res.type(preview.contentType).send(preview.body);
  }));

  router.get('/admin/orders/:orderId/assets/:assetId/original', auth, admin, handle(async (req, res) => {
    const original = await deps.uploads.adminOriginal(req.params.orderId, req.params.assetId);
    setSensitiveHeaders(res);
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName(original.fileName)}"`);
    res.type(original.contentType).send(original.body);
  }));

  router.get('/admin/orders/:orderId/photos.zip', auth, admin, handle(async (req, res) => {
    const { orderNumber, entries } = await deps.admin.archiveEntries(req.params.orderId);
    if (entries.length === 0) throw new CommerceHttpError(404, 'no_photos', 'Questo ordine non ha foto da scaricare');
    setSensitiveHeaders(res);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName(orderNumber)}-foto.zip"`);
    // Le fotografie sono già compresse: l'archivio le raccoglie senza ricomprimerle.
    const archive = archiver('zip', { zlib: { level: 0 } });
    archive.on('error', error => res.destroy(error));
    archive.pipe(res);
    for (const entry of entries) {
      const original = await deps.uploads.adminOriginal(req.params.orderId, entry.assetId);
      archive.append(original.body, { name: entry.name });
    }
    await archive.finalize();
  }));

  return router;
}
