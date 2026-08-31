import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import archiver from 'archiver';
import { z, ZodError } from 'zod';
import { PRINT_SHOP_CATEGORIES } from '../../shared/print-shop-catalog.js';
import { isValidCodiceFiscale } from '../../shared/fiscal-validation.js';
import { db, storage } from '../firebase-admin.js';
import { getStudioContactInfo, sendGmailEmail } from '../email-routes.js';
import {
  createShipmentFolder,
  deleteDriveFile,
  findShipmentFolderByShipmentId,
  findOrCreateLabParentFolder,
  revokeShipmentFolderPermission,
  shareShipmentFolderWithUser,
  uploadStreamToDriveFolder,
} from '../google-drive.js';
import {
  PayPalOrdersClient,
  loadPayPalOrdersConfig,
} from './paypal-orders.js';
import {
  PrintShopHttpError,
  PrintShopService,
  type PrintShopIdentity,
} from './service.js';
import {
  PRINT_SHOP_UPLOAD_RATE_LIMIT,
  uidRateLimiter,
} from './rate-limit.js';
import { authenticatePrintShop, requirePrintShopCustomer } from './auth.js';
import { requireMaintenanceOidc } from './maintenance-auth.js';
import { resolvePrintUploadOrigin } from './upload-origin.js';

const DEFAULT_ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];
const PRINT_SHOP_CATEGORY_IDS = PRINT_SHOP_CATEGORIES.map(category => category.id) as [
  string,
  ...string[],
];

const defaultPaypal = new PayPalOrdersClient(loadPayPalOrdersConfig());

export const printShopService = new PrintShopService({
  db,
  storage,
  paypal: defaultPaypal,
  drive: {
    findOrCreateLabParentFolder,
    createShipmentFolder,
    shareShipmentFolderWithUser,
    revokeShipmentFolderPermission,
    findShipmentFolderByShipmentId,
    deleteDriveFile,
    uploadStreamToDriveFolder,
  },
  mail: {
    async send(to, subject, html, logInfo) {
      await sendGmailEmail(to, subject, html, undefined, logInfo as any);
    },
    async studio() {
      return getStudioContactInfo();
    },
  },
});

export async function runPrintShopRetentionCleanup(options: { dryRun?: boolean } = {}) {
  return printShopService.purgeExpiredAssets(options);
}

interface RouterDependencies {
  service: PrintShopService;
  authenticate: RequestHandler;
  verifiedCustomer: RequestHandler;
  adminEmails: readonly string[];
  storage: any;
  scheduleBackground: (task: () => Promise<void>) => void;
  runLabExpiry: () => Promise<{ expired: number }>;
}

const customerSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  phone: z.string().trim().min(3).max(40).optional(),
}).strict();

const postalAddressSchema = z.object({
  street: z.string().trim().min(1).max(160),
  houseNumber: z.string().trim().min(1).max(20),
  postalCode: z.string().trim().regex(/^\d{5}$/, 'Il CAP deve contenere 5 cifre'),
  city: z.string().trim().min(1).max(100),
  province: z.string().trim().regex(/^[A-Za-z]{2}$/, 'La provincia deve contenere 2 lettere')
    .transform(value => value.toUpperCase()),
  country: z.literal('IT'),
}).strict();

const billingDetailsSchema = z.object({
  fiscalCode: z.string().trim().transform(value => value.replace(/\s+/g, '').toUpperCase())
    .pipe(z.string().refine(isValidCodiceFiscale, 'Inserisci un codice fiscale italiano valido')),
  residenceAddress: postalAddressSchema,
}).strict();

const fulfillmentDraftSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('studio_pickup') }).strict(),
  z.object({
    method: z.literal('shipping'),
    shippingAddress: postalAddressSchema,
  }).strict(),
]);

const createOrderSchema = z.object({
  customer: customerSchema.optional(),
  customerNotes: z.string().trim().max(1000).optional(),
}).strict();

const updateOrderSchema = z.object({
  customer: customerSchema.optional(),
  customerNotes: z.string().trim().max(1000).optional(),
  lowResolutionAccepted: z.boolean().optional(),
  fulfillment: fulfillmentDraftSchema.optional(),
  billingDetails: billingDetailsSchema.optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Nessuna modifica indicata');

const assignmentSchema = z.object({
  assetId: z.string().trim().min(1).max(200),
  copies: z.number().int().min(1).max(10_000),
}).strict();

const quoteSchema = z.object({
  items: z.array(z.object({
    sku: z.string().trim().min(1).max(80),
    finish: z.enum(['glossy', 'matte']),
    fitMode: z.enum(['border', 'cover']),
    assignments: z.array(assignmentSchema).min(1).max(2_000),
  }).strict()).min(1).max(100),
  fulfillment: z.object({
    method: z.enum(['studio_pickup', 'shipping']),
  }).strict().optional(),
}).strict();

const shippingAdminSchema = z.object({
  enabled: z.boolean(),
  priceCents: z.number().int().min(0).max(100_000_000),
  estimatedMinDays: z.number().int().min(1).max(60),
  estimatedMaxDays: z.number().int().min(1).max(90),
}).strict().refine(
  value => value.estimatedMaxDays >= value.estimatedMinDays,
  { message: 'Il tempo massimo non può essere inferiore al minimo', path: ['estimatedMaxDays'] },
);

const prepareUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(100),
  sizeBytes: z.number().int().positive(),
}).strict();

const finalizeUploadSchema = z.object({
  assetId: z.string().trim().min(1).max(200),
}).strict();

const paypalCreateSchema = z.object({
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
  personalizedProductionAccepted: z.literal(true),
  expectedQuoteFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
  expectedTotalCents: z.number().int().positive(),
}).strict();
const paypalCaptureSchema = z.object({
  paypalOrderId: z.string().trim().min(8).max(80).optional(),
}).strict();

const statusSchema = z.object({
  status: z.enum([
    'submitted',
    'files_check',
    'ready_to_print',
    'sent_to_laboratory',
    'printing',
    'ready_for_pickup',
    'delivered',
    'cancelled',
  ]),
  note: z.string().trim().max(500).optional(),
}).strict();

const labShipmentSchema = z.object({
  labId: z.string().trim().min(1).max(200),
  expiryDays: z.number().int().min(1).max(90).optional(),
}).strict();

const sendLabSchema = z.object({
  labId: z.string().trim().min(1).max(200).optional(),
}).strict();

const labCostSchema = z.object({
  importo: z.number().min(0).max(1_000_000),
}).strict();

const retentionSchema = z.object({ dryRun: z.boolean().optional() }).strict();

const priceTierSchema = z.object({
  minQuantity: z.number().int().min(1).max(1_000_000),
  maxQuantity: z.number().int().min(1).max(1_000_000).nullable().optional()
    .transform(value => value ?? undefined),
  unitPriceCents: z.number().int().min(1).max(100_000_000),
}).strict();

const printSpecAdminSchema = z.object({
  widthMm: z.number().positive().max(5_000),
  heightMm: z.number().positive().max(5_000),
  finishes: z.array(z.enum(['glossy', 'matte'])).length(2),
  fitModes: z.array(z.enum(['border', 'cover'])).length(2),
  qualityWarningDpi: z.number().int().min(1).max(2_400),
  qualityTargetDpi: z.number().int().min(1).max(2_400),
  pricing: z.discriminatedUnion('model', [
    z.object({
      model: z.literal('tiered'),
      tiers: z.array(priceTierSchema).min(1).max(100),
    }).strict(),
    z.object({
      model: z.literal('package'),
      packageSize: z.number().int().min(1).max(2_000),
      packagePriceCents: z.number().int().min(1).max(100_000_000),
      requireDistinctAssets: z.boolean(),
      allowMultiplePackages: z.boolean(),
    }).strict(),
  ]),
}).strict();

const catalogAdminUpdateSchema = z.object({
  nome: z.string().trim().min(1).max(200).optional(),
  descrizione: z.string().trim().min(1).max(2_000).optional(),
  categoria: z.enum(PRINT_SHOP_CATEGORY_IDS).optional(),
  displayOrder: z.number().int().min(0).max(1_000_000).optional(),
  attivo: z.boolean().optional(),
  printSpec: printSpecAdminSchema,
}).strict();

export function createPrintShopRouter(
  overrides: Partial<RouterDependencies> = {},
): express.Router {
  const deps: RouterDependencies = {
    service: overrides.service || printShopService,
    authenticate: overrides.authenticate || authenticatePrintShop,
    verifiedCustomer: overrides.verifiedCustomer || requirePrintShopCustomer,
    adminEmails: overrides.adminEmails || configuredAdminEmails(),
    storage: overrides.storage || storage,
    scheduleBackground:
      overrides.scheduleBackground ||
      (task => {
        setImmediate(() => void task().catch(error => {
          console.error('❌ [PrintShop] background task failed:', error);
        }));
      }),
    runLabExpiry:
      overrides.runLabExpiry ||
      (async () => {
        const { runLabShipmentExpiryCheck } = await import('../lab-routes.js');
        return runLabShipmentExpiryCheck();
      }),
  };
  const router = express.Router();
  const createLimiter = uidRateLimiter(10, 15 * 60_000);
  const quoteLimiter = uidRateLimiter(80, 10 * 60_000);
  // Un pacchetto Polaroid richiede prepare+finalize per 50 file. Gli upload
  // hanno quindi un budget separato dalle quote, che restano più restrittive.
  const uploadLimiter = uidRateLimiter(PRINT_SHOP_UPLOAD_RATE_LIMIT, 10 * 60_000);
  const paymentLimiter = uidRateLimiter(20, 10 * 60_000);
  const auth = deps.authenticate;
  const customer = deps.verifiedCustomer;
  const admin = requireAdmin(deps.adminEmails);

  router.get('/catalog', route(async (_req, res) => {
    res.json(await deps.service.publicCatalog());
  }));

  router.get('/paypal/config', (_req, res) => {
    res.json(deps.service.paypalConfig());
  });

  router.post('/paypal/webhook', route(async (req, res) => {
    const result = await deps.service.paypalWebhook(
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

  router.post('/internal/retention', requireMaintenanceOidc, route(async (_req, res) => {
    const lifecycle = await deps.service.retryPendingGcsLifecycle(25);
    const cleanup = await deps.service.purgeExpiredAssets();
    const lab = await deps.runLabExpiry();
    res.json({
      ok: true,
      lifecycle,
      cleanup: {
        eligible: cleanup.eligible,
        purged: cleanup.purged,
        preparedPurged: cleanup.preparedPurged,
        failedCount: cleanup.failed.length,
      },
      lab,
    });
  }));

  // Ordini, dati cliente e viste amministrative non devono mai essere
  // riutilizzati dalla cache del browser, di proxy o CDN condivise.
  router.use(['/orders', '/admin'], (_req, res, next) => {
    setSensitiveDownloadHeaders(res);
    next();
  });

  router.post('/orders', auth, customer, createLimiter, route(async (req: any, res) => {
    const input = createOrderSchema.parse(req.body || {});
    const order = await deps.service.createDraft(
      identity(req),
      input,
      req.get('idempotency-key') || undefined,
    );
    res.status(201).json({ order });
  }));

  router.get('/orders', auth, customer, route(async (req: any, res) => {
    res.json({ orders: await deps.service.listOwnerOrders(identity(req)) });
  }));

  router.get('/orders/:orderId', auth, customer, route(async (req: any, res) => {
    res.json({ order: await deps.service.ownerOrder(identity(req), req.params.orderId) });
  }));

  router.delete('/orders/:orderId', auth, customer, route(async (req: any, res) => {
    res.json(await deps.service.cancelOwnerDraft(identity(req), req.params.orderId));
  }));

  router.patch('/orders/:orderId', auth, customer, route(async (req: any, res) => {
    const input = updateOrderSchema.parse(req.body || {});
    const order = await deps.service.updateDraft(identity(req), req.params.orderId, input);
    res.json({ order });
  }));

  router.post('/orders/:orderId/quote', auth, customer, quoteLimiter, route(async (req: any, res) => {
    const input = quoteSchema.parse(req.body);
    const quote = await deps.service.quote(identity(req), req.params.orderId, input);
    res.json({ quote });
  }));

  router.post('/orders/:orderId/uploads/prepare', auth, customer, uploadLimiter, route(async (req: any, res) => {
    const input = prepareUploadSchema.parse(req.body);
    const upload = await deps.service.prepareUpload(
      identity(req),
      req.params.orderId,
      input,
      req.get('idempotency-key') || undefined,
      resolvePrintUploadOrigin({
        origin: req.get('origin'),
        protocol: req.protocol,
        host: req.get('host'),
      }),
    );
    res.status(201).json({ upload });
  }));

  router.post('/orders/:orderId/uploads/finalize', auth, customer, uploadLimiter, route(async (req: any, res) => {
    const input = finalizeUploadSchema.parse(req.body);
    const asset = await deps.service.finalizeUpload(
      identity(req),
      req.params.orderId,
      input.assetId,
    );
    res.json({ asset });
  }));

  router.post('/orders/:orderId/assets/:assetId/finalize', auth, customer, uploadLimiter, route(async (req: any, res) => {
    const asset = await deps.service.finalizeUpload(
      identity(req),
      req.params.orderId,
      req.params.assetId,
    );
    res.json({ asset });
  }));

  router.delete('/orders/:orderId/assets/:assetId', auth, customer, route(async (req: any, res) => {
    const result = await deps.service.removeAsset(identity(req), req.params.orderId, req.params.assetId);
    res.json({ success: true, ...result });
  }));

  router.post('/orders/:orderId/paypal/create', auth, customer, paymentLimiter, route(async (req: any, res) => {
    const input = paypalCreateSchema.parse(req.body);
    res.json(await deps.service.createPaypalOrder(identity(req), req.params.orderId, input));
  }));

  router.post('/orders/:orderId/paypal/capture', auth, customer, paymentLimiter, route(async (req: any, res) => {
    const input = paypalCaptureSchema.parse(req.body || {});
    res.json(await deps.service.capturePaypalOrder(identity(req), req.params.orderId, input));
  }));

  router.get('/admin/orders', auth, admin, route(async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json({
      orders: await deps.service.adminOrders({
        status: queryString(req.query.status),
        paymentStatus: queryString(req.query.paymentStatus),
        limit: Number.isFinite(limit) ? limit : undefined,
      }),
    });
  }));

  router.get('/admin/catalog/:sku', auth, admin, route(async (req, res) => {
    res.json({ product: await deps.service.adminCatalogProduct(req.params.sku) });
  }));

  router.patch('/admin/catalog/:sku', auth, admin, route(async (req: any, res) => {
    const input = catalogAdminUpdateSchema.parse(req.body);
    res.json({
      product: await deps.service.updateAdminCatalogProduct(
        req.params.sku,
        input,
        req.user.email,
      ),
    });
  }));

  router.get('/admin/shipping', auth, admin, route(async (_req, res) => {
    res.json({ shipping: await deps.service.shippingConfiguration() });
  }));

  router.patch('/admin/shipping', auth, admin, route(async (req: any, res) => {
    const input = shippingAdminSchema.parse(req.body);
    res.json({
      shipping: await deps.service.updateShippingConfiguration(input, req.user.email),
    });
  }));

  router.get('/admin/retention/config', auth, admin, route(async (_req, res) => {
    res.json(await deps.service.retentionConfiguration());
  }));

  router.get('/admin/orders/:orderId', auth, admin, route(async (req, res) => {
    res.json({ order: await deps.service.adminOrder(req.params.orderId) });
  }));

  router.delete('/admin/orders/:orderId', auth, admin, route(async (req: any, res) => {
    res.json(await deps.service.removeAdminOrder(req.params.orderId, req.user.email));
  }));

  router.patch('/admin/orders/:orderId/status', auth, admin, route(async (req: any, res) => {
    const input = statusSchema.parse(req.body);
    const order = await deps.service.updateAdminStatus(
      req.params.orderId,
      input.status,
      req.user.email,
      input.note,
    );
    res.json({ order });
  }));

  router.get('/admin/orders/:orderId/manifest', auth, admin, route(async (req, res) => {
    const format = queryString(req.query.format) || 'json';
    if (format === 'csv') {
      const csv = await deps.service.manifestCsv(req.params.orderId);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      setSensitiveDownloadHeaders(res);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeDownloadName(req.params.orderId)}-distinta.csv"`,
      );
      res.send(`\uFEFF${csv}`);
      return;
    }
    if (format === 'html') {
      const html = await deps.service.manifestHtml(req.params.orderId);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      setSensitiveDownloadHeaders(res);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeDownloadName(req.params.orderId)}-distinta.html"`,
      );
      res.send(html);
      return;
    }
    if (format !== 'json') {
      throw new PrintShopHttpError(400, 'invalid_format', 'Formato distinta non valido');
    }
    setSensitiveDownloadHeaders(res);
    res.json(await deps.service.manifest(req.params.orderId));
  }));

  router.get('/admin/orders/:orderId/archive', auth, admin, route(async (req, res) => {
    const data = await deps.service.archiveData(req.params.orderId);
    const archive = archiver('zip', { zlib: { level: 0 } });
    res.setHeader('Content-Type', 'application/zip');
    setSensitiveDownloadHeaders(res);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeDownloadName(data.order.orderNumber)}.zip"`,
    );
    archive.on('warning', warning => console.warn('⚠️ [PrintShop ZIP]', warning));
    archive.on('error', error => {
      console.error('❌ [PrintShop ZIP]', error);
      if (!res.headersSent) res.status(500).json({ error: 'Errore creazione archivio' });
      else res.destroy(error);
    });
    archive.pipe(res);
    archive.append(data.manifestHtml, { name: 'distinta.html' });
    archive.append(JSON.stringify(data.manifestJson, null, 2), { name: 'distinta.json' });
    data.assets.forEach((asset, index) => {
      const source = deps.storage.bucket().file(asset.storagePath).createReadStream();
      archive.append(source, {
        name: `originali/${String(index + 1).padStart(4, '0')}_${safeDownloadName(
          asset.originalName || asset.id,
        )}.jpg`,
      });
    });
    await archive.finalize();
  }));

  router.get('/admin/orders/:orderId/lab-shipments', auth, admin, route(async (req, res) => {
    res.json({ shipments: await deps.service.listLabShipments(req.params.orderId) });
  }));

  router.post('/admin/orders/:orderId/lab-shipments', auth, admin, route(async (req: any, res) => {
    const input = labShipmentSchema.parse(req.body);
    const shipment = await deps.service.createLabShipment(
      req.params.orderId,
      input,
      req.user.email,
    );
    if (shipment.transfer?.status !== 'completed') {
      deps.scheduleBackground(() => deps.service.transferLabShipment(shipment.id));
    }
    res.status(202).json({
      shipmentId: shipment.id,
      status: shipment.transfer?.status || 'pending',
      shipment,
    });
  }));

  router.post('/admin/orders/:orderId/lab-shipments/:shipmentId/transfer', auth, admin, route(async (req, res) => {
    const shipments = await deps.service.listLabShipments(req.params.orderId);
    if (!shipments.some(shipment => shipment.id === req.params.shipmentId)) {
      throw new PrintShopHttpError(404, 'shipment_not_found', 'Spedizione non trovata');
    }
    deps.scheduleBackground(() => deps.service.transferLabShipment(req.params.shipmentId));
    res.status(202).json({ shipmentId: req.params.shipmentId, status: 'queued' });
  }));

  router.post('/admin/orders/:orderId/lab-shipments/:shipmentId/send', auth, admin, route(async (req: any, res) => {
    const input = sendLabSchema.parse(req.body || {});
    const shipment = await deps.service.sendLabShipment(
      req.params.orderId,
      req.params.shipmentId,
      input,
      req.user.email,
    );
    res.json({ shipment });
  }));

  router.post('/admin/orders/:orderId/lab-shipments/:shipmentId/cost', auth, admin, route(async (req: any, res) => {
    const input = labCostSchema.parse(req.body);
    res.json(await deps.service.setLabShipmentCost(
      req.params.orderId,
      req.params.shipmentId,
      input.importo,
      req.user.email,
    ));
  }));

  router.post('/admin/retention/run', auth, admin, route(async (req, res) => {
    const input = retentionSchema.parse(req.body || {});
    res.json(await deps.service.purgeExpiredAssets({ dryRun: input.dryRun !== false }));
  }));

  return router;
}

function route(
  handler: (req: any, res: Response, next: NextFunction) => Promise<void>,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      sendError(res, error);
    }
  };
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: 'invalid_request', message: 'Dati non validi', details: error.issues },
    });
    return;
  }
  if (error instanceof PrintShopHttpError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
    });
    return;
  }
  console.error('❌ [PrintShop] Unexpected error:', error);
  res.status(500).json({ error: { code: 'internal', message: 'Errore interno' } });
}

function identity(req: any): PrintShopIdentity {
  if (!req.user?.uid || !req.user?.email) {
    throw new PrintShopHttpError(401, 'unauthenticated', 'Accesso richiesto');
  }
  return { uid: req.user.uid, email: req.user.email };
}

function requireAdmin(adminEmails: readonly string[]) {
  const allowed = new Set(adminEmails.map(email => email.trim().toLowerCase()));
  return (req: any, res: Response, next: NextFunction) => {
    if (!allowed.has(String(req.user?.email || '').trim().toLowerCase())) {
      res.status(403).json({ error: { code: 'forbidden', message: 'Accesso riservato allo studio' } });
      return;
    }
    next();
  };
}

function configuredAdminEmails(): string[] {
  const env = (process.env.PRINT_SHOP_ADMIN_EMAILS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ADMIN_EMAILS, ...env])];
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function safeDownloadName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '_').replace(/^\.+/, '').slice(0, 120) || 'ordine-stampe';
}

function setSensitiveDownloadHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export default createPrintShopRouter();
