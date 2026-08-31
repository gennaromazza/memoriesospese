import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { hasValidLabDpa } from '../lab-dpa.js';
import {
  PRINT_FINISH_OPTIONS,
  PRINT_FIT_OPTIONS,
  PRINT_SHOP_CATEGORIES,
  calculatePrintQuote,
  validateJpegUpload,
} from '../../shared/print-shop-catalog.js';
import {
  PRINT_SHOP_ASSET_RETENTION_DAYS,
  PRINT_SHOP_CURRENCY,
  PRINT_SHOP_MAX_JPEG_BYTES,
  PrintShopValidationError,
  type PrintOrderItemInput,
  type PrintOrderItemSnapshot,
  type PrintShopCatalogProduct,
  type PrintShopFulfillmentStatus,
  type PrintShopQuote,
  type PrintShopQuoteInput,
} from '../../shared/print-shop-types.js';
import {
  PRINT_SHOP_LEGAL_MANIFEST,
  type PrintShopLegalManifest,
} from '../../shared/print-shop-legal.js';
import { normalizeEmail } from '../utils/normalize.js';
import {
  PayPalApiError,
  PayPalConfigurationError,
  PayPalOrdersClient,
  paypalRequestId,
  paypalValueToCents,
  type PayPalOrderResponse,
  type PayPalWebhookHeaders,
} from './paypal-orders.js';

export interface PrintShopIdentity {
  uid: string;
  email: string;
}

export interface PrintShopDriveAdapter {
  findOrCreateLabParentFolder(): Promise<string>;
  createShipmentFolder(
    parentId: string,
    name: string,
    metadata?: {
      labShipmentId?: string;
      orderId?: string;
      expiresAt?: string;
      deferPublicAccess?: boolean;
    },
  ): Promise<{ folderId: string; webViewLink?: string }>;
  shareShipmentFolderWithUser?(
    folderId: string,
    emailAddress: string,
  ): Promise<{ webViewLink?: string; permissionId: string }>;
  revokeShipmentFolderPermission?(folderId: string, permissionId: string): Promise<void>;
  findShipmentFolderByShipmentId?(
    shipmentId: string,
  ): Promise<{ folderId: string; webViewLink?: string } | null>;
  deleteDriveFile?(fileId: string): Promise<void>;
  uploadStreamToDriveFolder(
    folderId: string,
    fileName: string,
    mimeType: string,
    body: Readable,
  ): Promise<{ fileId: string; webViewLink?: string; size: number }>;
}

export interface PrintShopMailAdapter {
  send(
    to: string,
    subject: string,
    html: string,
    logInfo?: Record<string, unknown>,
  ): Promise<void>;
  studio(): Promise<{ name: string; email: string; phone: string }>;
}

export interface PrintShopServiceDependencies {
  db: any;
  storage: any;
  paypal: PayPalOrdersClient;
  drive?: PrintShopDriveAdapter;
  mail?: PrintShopMailAdapter;
  now?: () => Timestamp;
  retentionDays?: number;
  maxJpegBytes?: number;
}

export class PrintShopHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PrintShopHttpError';
  }
}

export interface PrintShopManifestRow {
  orderNumber: string;
  sku: string;
  productName: string;
  widthMm: number;
  heightMm: number;
  finish: 'glossy' | 'matte';
  fitMode: 'border' | 'cover';
  assetId: string;
  fileName: string;
  copies: number;
  widthPx?: number;
  heightPx?: number;
}

export interface PrintShopCatalogAdminUpdate {
  nome?: string;
  descrizione?: string;
  categoria?: string;
  displayOrder?: number;
  attivo?: boolean;
  printSpec: PrintShopCatalogProduct['printSpec'];
}

interface PrintShopSellerSnapshot {
  name: string;
  email: string;
  phone: string;
  fiscalAddress: {
    street: string;
    postalCode: string;
    city: string;
    province: string;
    country: 'IT';
  };
  vatNumber: string;
  fiscalCode: string;
}

interface CompletedCapture {
  captureId: string;
  paypalOrderId: string;
  amountCents: number;
  currency: string;
  status: string;
  customId?: string;
  invoiceId?: string;
  merchantId?: string;
  payerEmail?: string;
  raw?: unknown;
}

const MODIFIABLE_STATUSES = new Set(['draft', 'awaiting_payment']);
const PRINT_SHOP_CATEGORY_IDS = new Set(PRINT_SHOP_CATEGORIES.map(category => category.id));
const LAB_CREATE_STATUSES = new Set<PrintShopFulfillmentStatus>([
  'submitted',
  'files_check',
  'ready_to_print',
]);
const LAB_TRANSFER_STATUSES = new Set<PrintShopFulfillmentStatus>([
  ...LAB_CREATE_STATUSES,
  'sent_to_laboratory',
]);
const ADMIN_TRANSITIONS: Record<string, readonly PrintShopFulfillmentStatus[]> = {
  submitted: ['files_check', 'ready_to_print', 'cancelled'],
  files_check: ['ready_to_print', 'cancelled'],
  ready_to_print: ['sent_to_laboratory', 'printing', 'cancelled'],
  sent_to_laboratory: ['printing', 'ready_for_pickup', 'cancelled'],
  printing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

let processFinalizeSlotsInUse = 0;

export class PrintShopService {
  private readonly now: () => Timestamp;
  private readonly retentionDays: number;
  private readonly maxJpegBytes: number;
  private readonly draftRetentionDays = positiveEnvInt('PRINT_SHOP_DRAFT_RETENTION_DAYS', 7, 1, 30);
  private readonly cancelledRetentionDays = positiveEnvInt(
    'PRINT_SHOP_CANCELLED_RETENTION_DAYS',
    30,
    1,
    90,
  );
  private readonly preparedRetentionHours = positiveEnvInt(
    'PRINT_SHOP_PREPARED_UPLOAD_RETENTION_HOURS',
    24,
    1,
    168,
  );
  private readonly paypalOrderTtlMinutes = positiveEnvInt(
    'PRINT_SHOP_PAYPAL_ORDER_TTL_MINUTES',
    180,
    15,
    1_440,
  );
  private readonly maxAssetsPerOrder = positiveEnvInt(
    'PRINT_SHOP_MAX_ASSETS_PER_ORDER',
    500,
    50,
    2_000,
  );
  private readonly maxDeclaredBytesPerOrder = positiveEnvInt(
    'PRINT_SHOP_MAX_DECLARED_BYTES_PER_ORDER',
    2_147_483_648,
    100_000_000,
    20_000_000_000,
  );
  private readonly maxConcurrentFinalizations = positiveEnvInt(
    'PRINT_SHOP_MAX_CONCURRENT_FINALIZATIONS',
    4,
    1,
    20,
  );
  private readonly maxConcurrentFinalizationsPerUid = positiveEnvInt(
    'PRINT_SHOP_MAX_CONCURRENT_FINALIZATIONS_PER_UID',
    4,
    1,
    10,
  );
  private readonly maxProcessFinalizations = positiveEnvInt(
    'PRINT_SHOP_MAX_PROCESS_FINALIZATIONS',
    2,
    1,
    8,
  );
  private readonly maxImagePixels = positiveEnvInt(
    'PRINT_SHOP_MAX_IMAGE_PIXELS',
    80_000_000,
    1_000_000,
    200_000_000,
  );
  private readonly maxActiveDraftsPerUid = positiveEnvInt(
    'PRINT_SHOP_MAX_ACTIVE_DRAFTS_PER_UID',
    10,
    1,
    30,
  );
  private readonly maxAssetsPerUid = positiveEnvInt(
    'PRINT_SHOP_MAX_ASSETS_PER_UID',
    500,
    50,
    2_000,
  );
  private readonly maxDeclaredBytesPerUid = positiveEnvInt(
    'PRINT_SHOP_MAX_DECLARED_BYTES_PER_UID',
    2_147_483_648,
    100_000_000,
    20_000_000_000,
  );
  private lifecycleCheckCache?: { checkedAt: number; configured: boolean; bucket?: string };

  constructor(private readonly deps: PrintShopServiceDependencies) {
    this.now = deps.now || (() => Timestamp.now());
    this.retentionDays = deps.retentionDays || PRINT_SHOP_ASSET_RETENTION_DAYS;
    this.maxJpegBytes = deps.maxJpegBytes || PRINT_SHOP_MAX_JPEG_BYTES;
  }

  paypalConfig() {
    return {
      ...this.deps.paypal.publicConfig(),
      currency: PRINT_SHOP_CURRENCY,
    };
  }

  async retentionConfiguration(): Promise<{
    configured: boolean;
    bucket?: string;
    daysSinceCustomTime: number;
    prefix: string;
  }> {
    const status = await this.checkGcsLifecycleConfiguration(true);
    return {
      ...status,
      daysSinceCustomTime: this.retentionDays,
      prefix: 'print-orders/',
    };
  }

  async publicCatalog(): Promise<Record<string, unknown>> {
    const catalog = await this.loadCatalog();
    const categoryIds = new Set(catalog.map(product => product.categoria));
    const categories = PRINT_SHOP_CATEGORIES
      .filter(category => categoryIds.has(category.id))
      .map(category => ({ ...category }));
    const version = catalog.reduce(
      (max, product) => Math.max(max, product.catalogVersion || 1),
      1,
    );
    return {
      currency: PRINT_SHOP_CURRENCY,
      catalogVersion: version,
      categories,
      finishOptions: PRINT_FINISH_OPTIONS,
      fitOptions: PRINT_FIT_OPTIONS,
      products: catalog.map(product => ({
        id: product.id,
        nome: product.nome,
        descrizione: product.descrizione,
        prezzo: product.prezzo,
        sconto: product.sconto,
        prezzoFinale: product.prezzoFinale,
        numeroFoto: product.numeroFoto,
        categoria: product.categoria,
        attivo: true,
        immagini: product.immagini || [],
        displayOrder: product.displayOrder,
        sku: product.sku,
        salesChannels: ['print_shop'],
        currency: product.currency,
        catalogVersion: product.catalogVersion,
        printSpec: product.printSpec,
      })),
    };
  }

  async createDraft(
    identity: PrintShopIdentity,
    input: {
      customer?: { name?: string; phone?: string };
      customerNotes?: string;
    },
    idempotencyKey?: string,
  ): Promise<any> {
    const email = normalizeRequiredEmail(identity.email);
    const customerName = cleanText(input.customer?.name, 160) || email.split('@')[0];
    const phone = cleanText(input.customer?.phone, 40);
    const idempotency = this.idempotency(
      identity.uid,
      'create-order',
      idempotencyKey,
      input,
      'order',
    );
    const orderRef = idempotency
      ? this.deps.db.collection('orders').doc(idempotency.resourceId)
      : this.deps.db.collection('orders').doc();
    const orderNumber = createOrderNumber(orderRef.id, new Date());
    const customerQuery = await this.deps.db
      .collection('clienti')
      .where('email', '==', email)
      .limit(1)
      .get();
    const existingCustomer = customerQuery.empty ? undefined : customerQuery.docs[0];
    const customerRef = existingCustomer
      ? existingCustomer.ref
      : this.deps.db.collection('clienti').doc();
    const now = this.now();

    const orderData: any = {
      orderType: 'print_shop',
      source: 'print_shop',
      orderNumber,
      ownerUid: identity.uid,
      clienteId: customerRef.id,
      catalogVersion: 1,
      currency: PRINT_SHOP_CURRENCY,
      customer: { name: customerName, email, ...(phone ? { phone } : {}) },
      nomeCliente: customerName,
      emailCliente: email,
      ...(phone ? { telefonoCliente: phone, whatsappCliente: phone } : {}),
      products: [],
      prodotti: [],
      totals: { subtotalCents: 0, discountCents: 0, totalCents: 0 },
      totale: 0,
      acconto: 0,
      saldo: 0,
      transactions: [],
      stato: 'bozza',
      fulfillment: { method: 'studio_pickup', status: 'draft' },
      payment: { method: 'paypal', status: 'pending' },
      printShop: {
        items: [],
        requestedItems: [],
        assetCount: 0,
        copyCount: 0,
        assetRetentionDays: this.retentionDays,
        lowResolutionAccepted: false,
        uploadQuota: {
          assetCount: 0,
          totalDeclaredBytes: 0,
          readyCount: 0,
          finalizingCount: 0,
        },
        ...(cleanText(input.customerNotes, 1000)
          ? { customerNotes: cleanText(input.customerNotes, 1000) }
          : {}),
      },
      retention: this.draftRetention(now),
      createdAt: now,
      updatedAt: now,
    };

    let replay = false;
    await this.deps.db.runTransaction(async (transaction: any) => {
      if (idempotency) {
        const marker = await transaction.get(idempotency.ref);
        if (marker.exists) {
          assertIdempotencyMatch(marker.data(), idempotency.payloadHash);
          replay = true;
          return;
        }
      }
      const ownerOrders = await transaction.get(
        this.deps.db.collection('orders').where('ownerUid', '==', identity.uid),
      );
      const activeDrafts = ownerOrders.docs.filter((doc: any) => {
        const value = doc.data();
        return (
          value.orderType === 'print_shop' &&
          MODIFIABLE_STATUSES.has(value.fulfillment?.status || 'draft') &&
          value.retention?.status !== 'purged'
        );
      }).length;
      if (activeDrafts >= this.maxActiveDraftsPerUid) {
        throw new PrintShopHttpError(
          409,
          'active_draft_limit',
          'Hai già troppi ordini in preparazione: completa o elimina una bozza prima di crearne un’altra',
          { maxActiveDrafts: this.maxActiveDraftsPerUid },
        );
      }
      if (existingCustomer) {
        transaction.update(customerRef, {
          'sourceRefs.orderIds': FieldValue.arrayUnion(orderRef.id),
          'sourceRefs.userIds': FieldValue.arrayUnion(identity.uid),
          'lifecycle.lastInteractionAt': now,
          updatedAt: now,
        });
      } else {
        const names = splitCustomerName(customerName);
        transaction.set(customerRef, {
          nome: names.first,
          cognome: names.last,
          email,
          ...(phone ? { whatsapp: phone, cellulare1: phone } : {}),
          tags: ['print-shop'],
          source: 'print_shop',
          sourceRefs: {
            bookingIds: [],
            orderIds: [orderRef.id],
            galleryIds: [],
            userIds: [identity.uid],
          },
          lifecycle: {
            firstContactAt: now,
            lastInteractionAt: now,
            status: 'cliente',
          },
          financials: {
            totalRevenue: 0,
            outstandingBalance: 0,
            totalOrders: 0,
          },
          createdAt: now,
          updatedAt: now,
        });
      }
      transaction.set(orderRef, orderData);
      if (idempotency) {
        transaction.set(idempotency.ref, {
          uid: identity.uid,
          scope: idempotency.scope,
          keyHash: idempotency.keyHash,
          payloadHash: idempotency.payloadHash,
          resourceType: 'order',
          resourceId: orderRef.id,
          status: 'completed',
          createdAt: now,
          completedAt: now,
          expiresAt: Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000),
        });
      }
    });
    if (replay) {
      const replayDoc = await orderRef.get();
      if (!replayDoc.exists || replayDoc.data()?.ownerUid !== identity.uid) {
        throw new PrintShopHttpError(409, 'idempotency_incomplete', 'Richiesta precedente non completata');
      }
      return {
        ...publicOwnerOrder({ id: replayDoc.id, ...replayDoc.data() }),
        idempotentReplay: true,
      };
    }
    return publicOwnerOrder({ id: orderRef.id, ...orderData });
  }

  async listOwnerOrders(identity: PrintShopIdentity): Promise<any[]> {
    const snapshot = await this.deps.db
      .collection('orders')
      .where('ownerUid', '==', identity.uid)
      .get();
    return snapshot.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .filter((order: any) =>
        order.orderType === 'print_shop' &&
        order.fulfillment?.cancellationReason !== 'customer_deleted_draft')
      .sort((a: any, b: any) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt))
      .map((order: any) => publicOwnerOrder(order));
  }

  async ownerOrder(identity: PrintShopIdentity, orderId: string): Promise<any> {
    const order = await this.requireOwnerOrder(identity, orderId);
    if (order.fulfillment?.cancellationReason === 'customer_deleted_draft') {
      throw new PrintShopHttpError(404, 'order_not_found', 'Ordine non trovato');
    }
    const assets = await this.listAssets(orderId);
    return publicOwnerOrder(order, assets);
  }

  async cancelOwnerDraft(
    identity: PrintShopIdentity,
    orderId: string,
  ): Promise<{ success: true; cancelled: true; idempotentReplay: boolean }> {
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    const now = this.now();
    let replay = false;
    await this.deps.db.runTransaction(async (transaction: any) => {
      const doc = await transaction.get(orderRef);
      if (
        !doc.exists ||
        doc.data()?.orderType !== 'print_shop' ||
        doc.data()?.ownerUid !== identity.uid
      ) {
        throw new PrintShopHttpError(404, 'order_not_found', 'Ordine non trovato');
      }
      const order = doc.data();
      if (
        order.fulfillment?.status === 'cancelled' &&
        ['expired', 'failed'].includes(order.payment?.status)
      ) {
        replay = true;
        return;
      }
      if (
        order.payment?.status === 'paid' ||
        order.payment?.status === 'paid_action_required' ||
        order.payment?.status === 'partially_refunded' ||
        order.payment?.status === 'refunded'
      ) {
        throw new PrintShopHttpError(
          409,
          'paid_order_not_deletable',
          'Un ordine pagato non può essere eliminato dal cliente',
        );
      }
      assertModifiable(order, now.toMillis(), { allowPendingPaypal: true });
      transaction.update(orderRef, {
        payment: {
          ...order.payment,
          method: 'paypal',
          status: 'expired',
          cancelledAt: now,
        },
        fulfillment: {
          ...order.fulfillment,
          method: 'studio_pickup',
          status: 'cancelled',
          cancelledAt: now,
          cancellationReason: 'customer_deleted_draft',
        },
        retention: {
          status: 'scheduled',
          reason: 'cancelled',
          assetRetentionDays: 0,
          deleteAfter: now,
        },
        stato: 'annullato',
        updatedAt: now,
      });
    });
    if (!replay) {
      await this.purgeExpiredAssets().catch(() => undefined);
    }
    return { success: true, cancelled: true, idempotentReplay: replay };
  }

  async updateDraft(
    identity: PrintShopIdentity,
    orderId: string,
    input: {
      customer?: { name?: string; phone?: string };
      customerNotes?: string;
      lowResolutionAccepted?: boolean;
    },
  ): Promise<any> {
    const order = await this.requireOwnerOrder(identity, orderId);
    assertModifiable(order, this.now().toMillis());
    const updateNow = this.now();
    const update: any = { updatedAt: updateNow, retention: this.draftRetention(updateNow) };
    if (input.customer) {
      const name = cleanText(input.customer.name, 160) || order.customer?.name;
      const phone = cleanText(input.customer.phone, 40);
      update.customer = {
        ...order.customer,
        ...(name ? { name } : {}),
        ...(phone ? { phone } : {}),
      };
      if (name) update.nomeCliente = name;
      if (phone) {
        update.telefonoCliente = phone;
        update.whatsappCliente = phone;
      }
    }
    if (input.customerNotes !== undefined) {
      update['printShop.customerNotes'] = cleanText(input.customerNotes, 1000) || '';
    }
    if (input.lowResolutionAccepted !== undefined) {
      update['printShop.lowResolutionAccepted'] = input.lowResolutionAccepted;
      update['printShop.lowResolutionAcceptedFingerprint'] = input.lowResolutionAccepted
        ? order.quoteFingerprint || ''
        : FieldValue.delete();
    }
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    await this.deps.db.runTransaction(async (transaction: any) => {
      const fresh = await transaction.get(orderRef);
      if (!fresh.exists || fresh.data()?.ownerUid !== identity.uid) {
        throw new PrintShopHttpError(404, 'order_not_found', 'Ordine non trovato');
      }
      assertModifiable(fresh.data(), updateNow.toMillis());
      if (input.customer && fresh.data()?.clienteId) {
        const customerRef = this.deps.db.collection('clienti').doc(fresh.data().clienteId);
        const customerDoc = await transaction.get(customerRef);
        if (customerDoc.exists) {
          const stored = customerDoc.data();
          const shopManaged = stored.source === 'print_shop';
          const nextName = cleanText(input.customer.name, 160);
          const nextPhone = cleanText(input.customer.phone, 40);
          const crmUpdate: Record<string, unknown> = {
            'lifecycle.lastInteractionAt': updateNow,
            updatedAt: updateNow,
          };
          if (nextName && (shopManaged || !cleanText(`${stored.nome || ''} ${stored.cognome || ''}`, 160))) {
            const names = splitCustomerName(nextName);
            crmUpdate.nome = names.first;
            crmUpdate.cognome = names.last;
          }
          if (nextPhone && (shopManaged || (!stored.whatsapp && !stored.cellulare1))) {
            crmUpdate.whatsapp = nextPhone;
            crmUpdate.cellulare1 = nextPhone;
          }
          transaction.update(customerRef, crmUpdate);
        }
      }
      transaction.update(orderRef, update);
    });
    return this.ownerOrder(identity, orderId);
  }

  async quote(
    identity: PrintShopIdentity,
    orderId: string,
    input: PrintShopQuoteInput,
    options: { allowPendingPaypal?: boolean } = {},
  ): Promise<PrintShopQuote> {
    const order = await this.requireOwnerOrder(identity, orderId);
    assertModifiable(order, this.now().toMillis(), options);
    const catalog = await this.loadCatalog();
    let quote: PrintShopQuote;
    try {
      quote = calculatePrintQuote(input, catalog);
    } catch (error) {
      if (error instanceof PrintShopValidationError) {
        throw new PrintShopHttpError(400, 'invalid_quote', error.message, error.issues);
      }
      throw error;
    }
    const assets = await this.requireReadyAssets(orderId, quote.items);
    const qualityWarnings = calculateQualityWarnings(quote.items, assets, catalog);
    quote = { ...quote, qualityWarnings };
    await Promise.all(
      [...assets.values()].map(asset => {
        const warning = qualityWarnings
          .filter(candidate => candidate.assetId === asset.id)
          .sort((a, b) => a.effectiveDpi - b.effectiveDpi)[0];
        return asset.ref.update({
          qualityWarning: warning || FieldValue.delete(),
          updatedAt: this.now(),
        });
      }),
    );
    const now = this.now();
    const fingerprint = quoteFingerprint(quote);
    const preserveLowResolutionAcceptance = Boolean(
      order.printShop?.lowResolutionAccepted === true &&
      order.printShop?.lowResolutionAcceptedFingerprint === fingerprint,
    );
    const prodotti = compatibilityProducts(quote.items);
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    await this.deps.db.runTransaction(async (transaction: any) => {
      const [freshOrder, ...freshAssets] = await Promise.all([
        transaction.get(orderRef),
        ...[...assets.values()].map(asset => transaction.get(asset.ref)),
      ]);
      if (!freshOrder.exists || freshOrder.data()?.ownerUid !== identity.uid) {
        throw new PrintShopHttpError(404, 'order_not_found', 'Ordine non trovato');
      }
      assertModifiable(freshOrder.data(), now.toMillis(), options);
      if (freshAssets.some(asset => !asset.exists || asset.data()?.status !== 'ready')) {
        throw new PrintShopHttpError(
          409,
          'asset_not_ready',
          'Una fotografia è cambiata durante il riepilogo: riprova',
        );
      }
      const freshData = freshOrder.data();
      const preservePendingPaypalOrder = Boolean(
        freshData.payment?.status === 'pending' &&
        freshData.payment?.paypalOrderId &&
        freshData.payment?.quoteFingerprint === fingerprint,
      );
      transaction.update(orderRef, {
        catalogVersion: quote.catalogVersion,
        totals: quote.totals,
        totale: centsToEuros(quote.totals.totalCents),
        saldo: centsToEuros(quote.totals.totalCents),
        products: prodotti,
        prodotti,
        'printShop.items': quote.items,
        'printShop.requestedItems': input.items.map(item => ({
          ...item,
          assignments: item.assignments.map(assignment => ({ ...assignment })),
        })),
        'printShop.assetCount': quote.assetCount,
        'printShop.copyCount': quote.copyCount,
        'printShop.qualityWarnings': qualityWarnings,
        'printShop.lowResolutionAccepted':
          qualityWarnings.length === 0 || preserveLowResolutionAcceptance,
        'printShop.lowResolutionAcceptedFingerprint':
          qualityWarnings.length > 0 && preserveLowResolutionAcceptance
            ? fingerprint
            : FieldValue.delete(),
        quoteFingerprint: fingerprint,
        fulfillment: { method: 'studio_pickup', status: 'draft' },
        payment: preservePendingPaypalOrder
          ? freshData.payment
          : { method: 'paypal', status: 'pending' },
        stato: 'bozza',
        retention: this.draftRetention(now),
        updatedAt: now,
      });
    });
    return { ...quote, quoteFingerprint: fingerprint };
  }

  async prepareUpload(
    identity: PrintShopIdentity,
    orderId: string,
    candidate: { fileName: string; contentType: string; sizeBytes: number },
    idempotencyKey?: string,
    uploadOrigin?: string,
  ): Promise<Record<string, unknown>> {
    const order = await this.requireOwnerOrder(identity, orderId);
    assertModifiable(order, this.now().toMillis());
    await this.ensureUploadQuota(orderId, identity.uid);
    const validation = validateJpegUpload(candidate, this.maxJpegBytes);
    if (!validation.valid) {
      throw new PrintShopHttpError(
        400,
        'invalid_jpeg',
        validation.issues.map(issue => issue.message).join(' '),
        validation.issues,
      );
    }
    const idempotency = this.idempotency(
      identity.uid,
      `prepare-upload:${orderId}`,
      idempotencyKey,
      candidate,
      'asset',
    );
    const assetRef = idempotency
      ? this.deps.db.collection('orders').doc(orderId).collection('assets').doc(idempotency.resourceId)
      : this.deps.db.collection('orders').doc(orderId).collection('assets').doc();
    const storagePath = `print-orders/${identity.uid}/${orderId}/${assetRef.id}/original.jpg`;
    const now = this.now();
    const assetData = {
      ownerUid: identity.uid,
      orderId,
      status: 'prepared',
      originalName: candidate.fileName.trim(),
      declaredContentType: 'image/jpeg',
      declaredSizeBytes: candidate.sizeBytes,
      storagePath,
      expiresAt: Timestamp.fromMillis(
        now.toMillis() + this.preparedRetentionHours * 60 * 60 * 1000,
      ),
      createdAt: now,
      updatedAt: now,
    };
    let replay = false;
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    await this.deps.db.runTransaction(async (transaction: any) => {
      const freshOrder = await transaction.get(orderRef);
      if (!freshOrder.exists || freshOrder.data()?.ownerUid !== identity.uid) {
        throw new PrintShopHttpError(404, 'order_not_found', 'Ordine non trovato');
      }
      assertModifiable(freshOrder.data(), now.toMillis());
      if (idempotency) {
        const marker = await transaction.get(idempotency.ref);
        if (marker.exists) {
          assertIdempotencyMatch(marker.data(), idempotency.payloadHash);
          replay = true;
          return;
        }
      }
      const ownerOrders = await transaction.get(
        this.deps.db.collection('orders').where('ownerUid', '==', identity.uid),
      );
      const ownerUsage = ownerOrders.docs.reduce(
        (usage: { assets: number; bytes: number }, doc: any) => {
          const value = doc.data();
          if (
            value.orderType !== 'print_shop' ||
            value.retention?.status === 'purged' ||
            !MODIFIABLE_STATUSES.has(value.fulfillment?.status || 'draft')
          ) {
            return usage;
          }
          usage.assets += Number(value.printShop?.uploadQuota?.assetCount || 0);
          usage.bytes += Number(value.printShop?.uploadQuota?.totalDeclaredBytes || 0);
          return usage;
        },
        { assets: 0, bytes: 0 },
      );
      if (
        ownerUsage.assets + 1 > this.maxAssetsPerUid ||
        ownerUsage.bytes + candidate.sizeBytes > this.maxDeclaredBytesPerUid
      ) {
        throw new PrintShopHttpError(
          409,
          'user_upload_quota_exceeded',
          'Hai raggiunto il limite complessivo di fotografie o spazio per gli ordini in preparazione',
          { maxAssets: this.maxAssetsPerUid, maxBytes: this.maxDeclaredBytesPerUid },
        );
      }
      const persistedQuota = freshOrder.data()?.printShop?.uploadQuota;
      const assetCount = Number.isSafeInteger(persistedQuota?.assetCount)
        ? persistedQuota.assetCount
        : 0;
      const totalDeclaredBytes = Number.isSafeInteger(persistedQuota?.totalDeclaredBytes)
        ? persistedQuota.totalDeclaredBytes
        : 0;
      if (
        assetCount + 1 > this.maxAssetsPerOrder ||
        totalDeclaredBytes + candidate.sizeBytes > this.maxDeclaredBytesPerOrder
      ) {
        throw new PrintShopHttpError(
          409,
          'upload_quota_exceeded',
          'Hai raggiunto il limite di fotografie o spazio per questo ordine',
          {
            maxAssets: this.maxAssetsPerOrder,
            maxBytes: this.maxDeclaredBytesPerOrder,
          },
        );
      }
      transaction.set(assetRef, assetData);
      transaction.update(orderRef, {
        retention: this.draftRetention(now),
        'printShop.uploadQuota': {
          assetCount: assetCount + 1,
          totalDeclaredBytes: totalDeclaredBytes + candidate.sizeBytes,
          readyCount: Number.isSafeInteger(persistedQuota?.readyCount)
            ? persistedQuota.readyCount
            : 0,
          finalizingCount: Number.isSafeInteger(persistedQuota?.finalizingCount)
            ? persistedQuota.finalizingCount
            : 0,
        },
        updatedAt: now,
      });
      if (idempotency) {
        transaction.set(idempotency.ref, {
          uid: identity.uid,
          scope: idempotency.scope,
          keyHash: idempotency.keyHash,
          payloadHash: idempotency.payloadHash,
          resourceType: 'asset',
          resourceId: assetRef.id,
          orderId,
          status: 'completed',
          createdAt: now,
          completedAt: now,
          expiresAt: Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000),
        });
      }
    });
    if (replay) {
      const replayDoc = await assetRef.get();
      if (!replayDoc.exists || replayDoc.data()?.ownerUid !== identity.uid) {
        throw new PrintShopHttpError(409, 'idempotency_incomplete', 'Richiesta precedente non completata');
      }
    }
    const [uploadUrl] = await this.deps.storage.bucket().file(storagePath).createResumableUpload({
      origin: uploadOrigin,
      metadata: {
        contentType: 'image/jpeg',
        cacheControl: 'private,max-age=0,no-store',
        metadata: {
          ownerUid: identity.uid,
          orderId,
          assetId: assetRef.id,
          originalFileName: candidate.fileName.trim(),
        },
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    return {
      assetId: assetRef.id,
      storagePath,
      uploadUrl,
      contentType: 'image/jpeg',
      maxFileBytes: this.maxJpegBytes,
      requiredMetadata: {
        ownerUid: identity.uid,
        orderId,
        assetId: assetRef.id,
      },
      idempotentReplay: replay,
    };
  }

  async finalizeUpload(
    identity: PrintShopIdentity,
    orderId: string,
    assetId: string,
  ): Promise<any> {
    const order = await this.requireOwnerOrder(identity, orderId);
    assertModifiable(order, this.now().toMillis());
    await this.ensureUploadQuota(orderId, identity.uid);
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    const assetRef = this.deps.db
      .collection('orders')
      .doc(orderId)
      .collection('assets')
      .doc(assetId);
    const claimedAt = this.now();
    const claimToken = hashId(
      `finalize:${identity.uid}:${orderId}:${assetId}:${claimedAt.toMillis()}:${Math.random()}`,
    );
    let asset: any;
    let readyReplay: any;
    await this.deps.db.runTransaction(async (transaction: any) => {
      const [freshOrder, freshAsset] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(assetRef),
      ]);
      if (
        !freshOrder.exists ||
        freshOrder.data()?.ownerUid !== identity.uid ||
        !freshAsset.exists ||
        freshAsset.data()?.ownerUid !== identity.uid
      ) {
        throw new PrintShopHttpError(404, 'asset_not_found', 'Fotografia non trovata');
      }
      assertModifiable(freshOrder.data(), claimedAt.toMillis());
      asset = freshAsset.data();
      if (asset.status === 'ready') {
        readyReplay = publicAsset({ id: assetId, ...asset });
        return;
      }
      const staleFinalize =
        asset.status === 'finalizing' &&
        timestampMillis(asset.finalizeClaimedAt) <= claimedAt.toMillis() - 15 * 60 * 1000;
      if (asset.status === 'finalizing' && !staleFinalize) {
        throw new PrintShopHttpError(409, 'finalize_running', 'Verifica del file già in corso');
      }
      if (asset.status !== 'prepared' && !staleFinalize) {
        throw new PrintShopHttpError(409, 'asset_not_prepared', 'Il file non è più finalizzabile');
      }
      if (timestampMillis(asset.expiresAt) <= claimedAt.toMillis()) {
        throw new PrintShopHttpError(409, 'upload_expired', 'Il tempo per completare il file è scaduto');
      }
      const persisted = freshOrder.data()?.printShop?.uploadQuota || {};
      const finalizingCount = Number.isSafeInteger(persisted.finalizingCount)
        ? persisted.finalizingCount
        : 0;
      const ownerOrders = await transaction.get(
        this.deps.db.collection('orders').where('ownerUid', '==', identity.uid),
      );
      const uidFinalizingCount = ownerOrders.docs.reduce(
        (total: number, doc: any) =>
          total + Number(doc.data()?.printShop?.uploadQuota?.finalizingCount || 0),
        0,
      );
      if (!staleFinalize && finalizingCount >= this.maxConcurrentFinalizations) {
        throw new PrintShopHttpError(
          429,
          'finalize_concurrency_limit',
          'Troppe fotografie in verifica contemporaneamente: attendi qualche secondo',
        );
      }
      if (!staleFinalize && uidFinalizingCount >= this.maxConcurrentFinalizationsPerUid) {
        throw new PrintShopHttpError(
          429,
          'finalize_user_concurrency_limit',
          'Troppe fotografie del tuo account sono in verifica: attendi qualche secondo',
        );
      }
      transaction.update(assetRef, {
        status: 'finalizing',
        finalizeClaimToken: claimToken,
        finalizeClaimedAt: claimedAt,
        updatedAt: claimedAt,
      });
      transaction.update(orderRef, {
        'printShop.uploadQuota': {
          assetCount: Number.isSafeInteger(persisted.assetCount)
            ? persisted.assetCount
            : 0,
          totalDeclaredBytes: Number.isSafeInteger(persisted.totalDeclaredBytes)
            ? persisted.totalDeclaredBytes
            : 0,
          readyCount: Number.isSafeInteger(persisted.readyCount)
            ? persisted.readyCount
            : 0,
          finalizingCount: staleFinalize ? finalizingCount : finalizingCount + 1,
        },
        updatedAt: claimedAt,
      });
    });
    if (readyReplay) return readyReplay;

    let buffer: Buffer;
    let sizeBytes: number;
    let contentType: string;
    let imageMetadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
    let perceptual: { hash: string; color: { r: number; g: number; b: number } };
    const releaseProcessSlot = tryAcquireFinalizeSlot(this.maxProcessFinalizations);
    if (!releaseProcessSlot) {
      const error = new PrintShopHttpError(
        429,
        'finalize_busy',
        'Il controllo delle fotografie è momentaneamente occupato: riprova tra pochi secondi',
      );
      await this.releaseFinalizeClaim(orderRef, assetRef, claimToken, error);
      throw error;
    }
    try {
      const file = this.deps.storage.bucket().file(asset.storagePath);
      const [exists] = await file.exists();
      if (!exists) {
        throw new PrintShopHttpError(
          409,
          'upload_incomplete',
          'Il caricamento non risulta completato',
        );
      }
      const [metadata] = await file.getMetadata();
      sizeBytes = Number(metadata.size || 0);
      contentType = String(metadata.contentType || '').toLowerCase();
      if (sizeBytes !== Number(asset.declaredSizeBytes)) {
        throw new PrintShopHttpError(
          400,
          'size_mismatch',
          'La dimensione del file caricato non corrisponde a quella dichiarata',
        );
      }
      if (contentType !== 'image/jpeg' || sizeBytes > this.maxJpegBytes || sizeBytes <= 0) {
        throw new PrintShopHttpError(400, 'invalid_jpeg', 'Il file caricato non è un JPG valido');
      }
      [buffer] = await file.download();
      const validation = validateJpegUpload(
        {
          fileName: asset.originalName,
          contentType,
          sizeBytes,
          firstBytes: buffer.subarray(0, 3),
        },
        this.maxJpegBytes,
      );
      const hasEndMarker =
        buffer.length >= 2 &&
        buffer[buffer.length - 2] === 0xff &&
        buffer[buffer.length - 1] === 0xd9;
      if (!validation.valid || !hasEndMarker) {
        throw new PrintShopHttpError(400, 'invalid_jpeg', 'Il contenuto non è un JPEG integro');
      }
      imageMetadata = await sharp(buffer, {
        failOn: 'error',
        limitInputPixels: this.maxImagePixels,
      }).metadata();
      if (imageMetadata.format !== 'jpeg' || !imageMetadata.width || !imageMetadata.height) {
        throw new PrintShopHttpError(400, 'invalid_jpeg', 'Il file non contiene una fotografia JPEG');
      }
      perceptual = await computePerceptualFingerprint(buffer, this.maxImagePixels);
    } catch (error) {
      await this.releaseFinalizeClaim(orderRef, assetRef, claimToken, error);
      if (error instanceof PrintShopHttpError) throw error;
      throw new PrintShopHttpError(400, 'invalid_jpeg', 'Il file JPEG è danneggiato');
    } finally {
      releaseProcessSlot();
    }
    const now = this.now();
    const update = {
      status: 'ready',
      contentType: 'image/jpeg',
      sizeBytes,
      widthPx: imageMetadata.width,
      heightPx: imageMetadata.height,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      perceptualHash: perceptual.hash,
      perceptualColor: perceptual.color,
      expiresAt: FieldValue.delete(),
      finalizedAt: now,
      updatedAt: now,
    };
    let result: any;
    try {
      await this.deps.db.runTransaction(async (transaction: any) => {
        const [freshOrder, freshAsset] = await Promise.all([
          transaction.get(orderRef),
          transaction.get(assetRef),
        ]);
        if (!freshOrder.exists || !freshAsset.exists) {
          throw new PrintShopHttpError(404, 'asset_not_found', 'Fotografia non trovata');
        }
        assertModifiable(freshOrder.data(), now.toMillis());
        if (freshAsset.data()?.finalizeClaimToken !== claimToken) {
          throw new PrintShopHttpError(409, 'finalize_claim_lost', 'La verifica del file è stata interrotta');
        }
        const quota = freshOrder.data()?.printShop?.uploadQuota || {};
        transaction.update(assetRef, {
          ...update,
          finalizeClaimToken: FieldValue.delete(),
          finalizeClaimedAt: FieldValue.delete(),
        });
        transaction.update(orderRef, {
          retention: this.draftRetention(now),
          'printShop.uploadQuota': {
            assetCount: Number(quota.assetCount || 0),
            totalDeclaredBytes: Number(quota.totalDeclaredBytes || 0),
            readyCount: Number(quota.readyCount || 0) + 1,
            finalizingCount: Math.max(0, Number(quota.finalizingCount || 1) - 1),
          },
          updatedAt: now,
        });
        result = publicAsset({ id: assetId, ...asset, ...update });
      });
    } catch (error) {
      await this.releaseFinalizeClaim(orderRef, assetRef, claimToken, error);
      throw error;
    }
    return result;
  }

  async removeAsset(
    identity: PrintShopIdentity,
    orderId: string,
    assetId: string,
  ): Promise<{ quoteInvalidated: boolean }> {
    const order = await this.requireOwnerOrder(identity, orderId);
    assertModifiable(order, this.now().toMillis());
    let quoteInvalidated = Boolean(
      Array.isArray(order.printShop?.items) &&
      order.printShop.items.some((item: any) =>
        item.assignments?.some((assignment: any) => assignment.assetId === assetId),
      )
    );
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    const assetRef = this.deps.db
      .collection('orders').doc(orderId)
      .collection('assets')
      .doc(assetId);
    const assetDoc = await assetRef.get();
    if (!assetDoc.exists || assetDoc.data()?.ownerUid !== identity.uid) {
      throw new PrintShopHttpError(404, 'asset_not_found', 'Fotografia non trovata');
    }
    const storagePath = assetDoc.data()?.storagePath;
    const now = this.now();
    const deleteClaimToken = hashId(
      `remove:${identity.uid}:${orderId}:${assetId}:${now.toMillis()}:${Math.random()}`,
    );
    await this.deps.db.runTransaction(async (transaction: any) => {
      const [freshOrder, freshAsset] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(assetRef),
      ]);
      if (
        !freshOrder.exists ||
        freshOrder.data()?.ownerUid !== identity.uid ||
        !freshAsset.exists ||
        freshAsset.data()?.ownerUid !== identity.uid
      ) {
        throw new PrintShopHttpError(404, 'asset_not_found', 'Fotografia non trovata');
      }
      assertModifiable(freshOrder.data(), now.toMillis());
      quoteInvalidated = Boolean(
        Array.isArray(freshOrder.data()?.printShop?.items) &&
        freshOrder.data().printShop.items.some((item: any) =>
          item.assignments?.some((assignment: any) => assignment.assetId === assetId),
        ),
      );
      const assetStatus = freshAsset.data()?.status;
      const recentDelete =
        assetStatus === 'deleting' &&
        timestampMillis(freshAsset.data()?.deleteClaimedAt) > now.toMillis() - 15 * 60 * 1000;
      if (recentDelete) {
        throw new PrintShopHttpError(409, 'asset_busy', 'Rimozione della fotografia già in corso');
      }
      if (!['prepared', 'ready', 'delete_failed', 'deleting'].includes(assetStatus)) {
        throw new PrintShopHttpError(409, 'asset_busy', 'La fotografia è in elaborazione');
      }
      if (quoteInvalidated) {
        transaction.update(orderRef, {
          products: [],
          prodotti: [],
          totals: { subtotalCents: 0, discountCents: 0, totalCents: 0 },
          totale: 0,
          saldo: 0,
          'printShop.items': [],
          'printShop.requestedItems': [],
          'printShop.assetCount': 0,
          'printShop.copyCount': 0,
          quoteFingerprint: FieldValue.delete(),
          payment: { method: 'paypal', status: 'pending' },
          fulfillment: { method: 'studio_pickup', status: 'draft' },
          stato: 'bozza',
          updatedAt: now,
        });
      }
      const quota = freshOrder.data()?.printShop?.uploadQuota;
      if (Number.isSafeInteger(quota?.assetCount) && !freshAsset.data()?.quotaReleasedAt) {
        transaction.update(orderRef, {
          'printShop.uploadQuota.assetCount': Math.max(0, quota.assetCount - 1),
          'printShop.uploadQuota.totalDeclaredBytes': Math.max(
            0,
            Number(quota.totalDeclaredBytes || 0) -
              Number(freshAsset.data()?.declaredSizeBytes || freshAsset.data()?.sizeBytes || 0),
          ),
          'printShop.uploadQuota.readyCount': Math.max(
            0,
            Number(quota.readyCount || 0) - (freshAsset.data()?.status === 'ready' ? 1 : 0),
          ),
          updatedAt: now,
        });
      }
      transaction.update(assetRef, {
        status: 'deleting',
        deleteClaimToken,
        deleteClaimedAt: now,
        quotaReleasedAt: freshAsset.data()?.quotaReleasedAt || now,
        updatedAt: now,
      });
    });
    try {
      if (storagePath) {
        await this.deps.storage
          .bucket()
          .file(storagePath)
          .delete({ ignoreNotFound: true });
      }
      await this.deps.db.runTransaction(async (transaction: any) => {
        const fresh = await transaction.get(assetRef);
        if (!fresh.exists || fresh.data()?.deleteClaimToken !== deleteClaimToken) return;
        transaction.delete(assetRef);
      });
    } catch (error: any) {
      await this.deps.db.runTransaction(async (transaction: any) => {
        const fresh = await transaction.get(assetRef);
        if (!fresh.exists || fresh.data()?.deleteClaimToken !== deleteClaimToken) return;
        transaction.update(assetRef, {
          status: 'delete_failed',
          deleteClaimToken: FieldValue.delete(),
          deleteClaimedAt: FieldValue.delete(),
          deleteLastError: String(error?.message || error).slice(0, 500),
          updatedAt: this.now(),
        });
      }).catch(() => undefined);
      throw new PrintShopHttpError(
        503,
        'asset_delete_failed',
        'La fotografia non è stata rimossa; puoi riprovare senza creare file orfani',
      );
    }
    return { quoteInvalidated };
  }

  async createPaypalOrder(
    identity: PrintShopIdentity,
    orderId: string,
    input: {
      termsAccepted: boolean;
      privacyAccepted: boolean;
      personalizedProductionAccepted: boolean;
      expectedQuoteFingerprint: string;
      expectedTotalCents: number;
    },
  ): Promise<Record<string, unknown>> {
    if (
      input.termsAccepted !== true ||
      input.privacyAccepted !== true ||
      input.personalizedProductionAccepted !== true
    ) {
      throw new PrintShopHttpError(
        400,
        'legal_acceptance_required',
        'Accetta condizioni di vendita, privacy e produzione personalizzata prima del pagamento',
      );
    }
    await this.assertLiveRetentionConfigured();
    let order = await this.requireOwnerOrder(identity, orderId);
    if (
      input.expectedQuoteFingerprint !== order.quoteFingerprint ||
      input.expectedTotalCents !== Number(order.totals?.totalCents)
    ) {
      throw new PrintShopHttpError(
        409,
        'quote_changed',
        'Il riepilogo o il prezzo sono cambiati: controlla e accetta nuovamente',
      );
    }
    assertModifiable(order, this.now().toMillis(), { allowPendingPaypal: true });
    const requestedItems = order.printShop?.requestedItems as PrintOrderItemInput[] | undefined;
    if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
      throw new PrintShopHttpError(
        409,
        'quote_required',
        'Calcola il riepilogo prima di procedere al pagamento',
      );
    }

    // Ricalcolo autorevole immediatamente prima di creare l'ordine PayPal.
    const quote = await this.quote(
      identity,
      orderId,
      { items: requestedItems },
      { allowPendingPaypal: true },
    );
    order = await this.requireOwnerOrder(identity, orderId);
    if (quote.totals.totalCents <= 0) {
      throw new PrintShopHttpError(409, 'empty_total', 'Il totale dell’ordine non è valido');
    }
    if (
      Array.isArray(order.printShop?.qualityWarnings) &&
      order.printShop.qualityWarnings.length > 0 &&
      (order.printShop?.lowResolutionAccepted !== true ||
        order.printShop?.lowResolutionAcceptedFingerprint !== order.quoteFingerprint)
    ) {
      throw new PrintShopHttpError(
        409,
        'low_resolution_confirmation_required',
        'Conferma di voler stampare le fotografie segnalate a bassa risoluzione',
        order.printShop.qualityWarnings,
      );
    }
    const fingerprint = quoteFingerprint(quote);
    if (
      input.expectedQuoteFingerprint !== fingerprint ||
      input.expectedTotalCents !== quote.totals.totalCents
    ) {
      throw new PrintShopHttpError(
        409,
        'quote_changed',
        'Il riepilogo o il prezzo sono cambiati: controlla e accetta nuovamente',
      );
    }
    const sellerSnapshot = await this.loadSellerSnapshot();
    const legalManifest = PRINT_SHOP_LEGAL_MANIFEST;
    const legalManifestHash = printShopLegalManifestHash(legalManifest);
    const sellerSnapshotHash = hashId(stableStringify(sellerSnapshot));
    const currentPaymentAttempt = Math.max(
      Number(order.printShop?.paypalAttempt || 0),
      Number(order.payment?.attempt || 0),
    );
    const existingLegalAcceptance = currentPaymentAttempt > 0
      ? await this.deps.db
          .collection('orders')
          .doc(orderId)
          .collection('legalAcceptances')
          .doc(hashId(
            `${fingerprint}:${legalManifestHash}:${sellerSnapshotHash}:${currentPaymentAttempt}`,
          ))
          .get()
      : undefined;
    const acceptance = existingLegalAcceptance?.exists
      ? existingLegalAcceptance.data()
      : undefined;
    const hasCompleteLegalProof = Boolean(
      order.legal?.termsAcceptedAt &&
      order.legal?.privacyAcceptedAt &&
      order.legal?.personalizedProductionAcceptedAt &&
      order.legal?.termsVersion === legalManifest.termsVersion &&
      order.legal?.privacyVersion === legalManifest.privacyVersion &&
      order.legal?.personalizedProductionVersion ===
        legalManifest.personalizedProductionVersion &&
      order.legal?.manifestVersion === legalManifest.schemaVersion &&
      order.legal?.manifestHash === legalManifestHash &&
      order.legal?.sellerSnapshotHash === sellerSnapshotHash &&
      order.legal?.quoteFingerprint === fingerprint &&
      Number(order.legal?.totalCents) === quote.totals.totalCents &&
      acceptance?.termsAccepted === true &&
      acceptance?.privacyAccepted === true &&
      acceptance?.personalizedProductionAccepted === true &&
      acceptance?.paymentAttempt === currentPaymentAttempt &&
      acceptance?.quoteFingerprint === fingerprint &&
      Number(acceptance?.totalCents) === quote.totals.totalCents &&
      acceptance?.manifestHash === legalManifestHash &&
      acceptance?.sellerSnapshotHash === sellerSnapshotHash,
    );
    const pendingCreatedAt = timestampMillis(order.payment?.createdAt);
    const pendingStillReusable =
      pendingCreatedAt > 0 &&
      pendingCreatedAt >
        this.now().toMillis() - this.paypalOrderTtlMinutes * 60 * 1000;
    if (
      order.payment?.paypalOrderId &&
      order.payment?.quoteFingerprint === fingerprint &&
      order.payment?.status === 'pending' &&
      pendingStillReusable &&
      hasCompleteLegalProof
    ) {
      return {
        paypalOrderId: order.payment.paypalOrderId,
        status: order.payment.paypalStatus || 'CREATED',
        amount: quote.totals,
        currency: PRINT_SHOP_CURRENCY,
        reused: true,
      };
    }

    const previousAttempt = Math.max(
      Number(order.printShop?.paypalAttempt || 0),
      Number(order.payment?.attempt || 0),
    );
    const paymentAttempt = previousAttempt + 1;
    const invoiceId = `${order.orderNumber}-A${paymentAttempt}`;

    let paypalOrder: PayPalOrderResponse;
    try {
      paypalOrder = await this.deps.paypal.createOrder(
        {
          internalOrderId: orderId,
          orderNumber: order.orderNumber,
          invoiceId,
          amountCents: quote.totals.totalCents,
          currency: PRINT_SHOP_CURRENCY,
        },
        paypalRequestId(
          'print-shop',
          'create',
          orderId,
          fingerprint,
          String(paymentAttempt),
        ),
      );
    } catch (error) {
      throw mapPayPalError(error);
    }
    if (!paypalOrder.id) {
      throw new PrintShopHttpError(502, 'paypal_invalid_response', 'PayPal non ha restituito un ordine valido');
    }
    const now = this.now();
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    const legalAcceptanceRef = orderRef.collection('legalAcceptances').doc(
      hashId(`${fingerprint}:${legalManifestHash}:${sellerSnapshotHash}:${paymentAttempt}`),
    );
    let concurrentReplay = false;
    await this.deps.db.runTransaction(async (transaction: any) => {
      const fresh = await transaction.get(orderRef);
      const data = fresh.data();
      if (!fresh.exists || data?.ownerUid !== identity.uid) {
        throw new PrintShopHttpError(404, 'order_not_found', 'Ordine non trovato');
      }
      assertModifiable(data, now.toMillis(), { allowPendingPaypal: true });
      const attemptChanged = Number(data.printShop?.paypalAttempt || 0) !== previousAttempt;
      if (
        attemptChanged &&
        data.payment?.status === 'pending' &&
        data.payment?.paypalOrderId === paypalOrder.id &&
        data.payment?.quoteFingerprint === fingerprint
      ) {
        concurrentReplay = true;
        return;
      }
      if (data.quoteFingerprint !== fingerprint || data.payment?.status === 'paid' || attemptChanged) {
        throw new PrintShopHttpError(
          409,
          'order_changed',
          'L’ordine è cambiato durante il pagamento: aggiorna il riepilogo',
        );
      }
      transaction.update(orderRef, {
        payment: {
          method: 'paypal',
          status: 'pending',
          paypalOrderId: paypalOrder.id,
          paypalStatus: paypalOrder.status || 'CREATED',
          quoteFingerprint: fingerprint,
          amountCents: quote.totals.totalCents,
          currency: PRINT_SHOP_CURRENCY,
          attempt: paymentAttempt,
          invoiceId,
          createdAt: now,
        },
        'printShop.paypalAttempt': paymentAttempt,
        fulfillment: { method: 'studio_pickup', status: 'awaiting_payment' },
        stato: 'bozza',
        legal: {
          ...(data.legal || {}),
          termsAcceptedAt: now,
          termsVersion: legalManifest.termsVersion,
          privacyAcceptedAt: now,
          privacyVersion: legalManifest.privacyVersion,
          personalizedProductionAcceptedAt: now,
          personalizedProductionVersion: legalManifest.personalizedProductionVersion,
          manifestVersion: legalManifest.schemaVersion,
          manifestHash: legalManifestHash,
          sellerSnapshot,
          sellerSnapshotHash,
          quoteFingerprint: fingerprint,
          totalCents: quote.totals.totalCents,
        },
        updatedAt: now,
      });
      transaction.set(legalAcceptanceRef, {
        orderId,
        ownerUid: identity.uid,
        paymentAttempt,
        quoteFingerprint: fingerprint,
        totalCents: quote.totals.totalCents,
        currency: PRINT_SHOP_CURRENCY,
        termsAccepted: true,
        privacyAccepted: true,
        personalizedProductionAccepted: true,
        manifest: legalManifest,
        manifestHash: legalManifestHash,
        sellerSnapshot,
        sellerSnapshotHash,
        acceptedAt: now,
      });
    });
    const approveUrl = paypalOrder.links?.find(link => link.rel === 'approve')?.href;
    return {
      paypalOrderId: paypalOrder.id,
      status: paypalOrder.status || 'CREATED',
      ...(approveUrl ? { approveUrl } : {}),
      amount: quote.totals,
      currency: PRINT_SHOP_CURRENCY,
      reused: concurrentReplay,
    };
  }

  async capturePaypalOrder(
    identity: PrintShopIdentity,
    orderId: string,
    input: { paypalOrderId?: string },
  ): Promise<Record<string, unknown>> {
    const initialOrder = await this.requireOwnerOrder(identity, orderId);
    const storedPaypalOrderId = initialOrder.payment?.paypalOrderId;
    if (!storedPaypalOrderId) {
      throw new PrintShopHttpError(409, 'paypal_order_required', 'Pagamento PayPal non inizializzato');
    }
    if (input.paypalOrderId && input.paypalOrderId !== storedPaypalOrderId) {
      throw new PrintShopHttpError(409, 'paypal_order_mismatch', 'Ordine PayPal non corrispondente');
    }
    if (initialOrder.payment?.status === 'paid' && initialOrder.payment?.paypalCaptureId) {
      return {
        success: true,
        duplicate: true,
        orderId,
        paypalOrderId: storedPaypalOrderId,
        captureId: initialOrder.payment.paypalCaptureId,
        status: 'paid',
      };
    }
    // PayPal can complete the capture before our browser callback (or webhook)
    // records it.  In that case the local order may no longer look payable even
    // though the provider is authoritative. Reconcile before offering another
    // payment attempt: this also prevents a possible duplicate charge.
    if (
      initialOrder.payment?.status !== 'pending' ||
      initialOrder.fulfillment?.status !== 'awaiting_payment'
    ) {
      try {
        const providerOrder = await this.deps.paypal.getOrder(storedPaypalOrderId);
        const completed = extractCompletedCapture(providerOrder);
        if (completed) {
          await this.recordCompletedPayment(orderId, completed);
          return {
            success: true,
            duplicate: true,
            orderId,
            paypalOrderId: storedPaypalOrderId,
            captureId: completed.captureId,
            status: 'paid',
          };
        }
      } catch (error) {
        if (error instanceof PrintShopHttpError) throw error;
        // Preserve the meaningful local-state error when PayPal is unavailable
        // or confirms that no completed capture exists.
      }
      throw new PrintShopHttpError(409, 'order_not_payable', 'L’ordine non è in attesa di pagamento');
    }
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    const claimNow = this.now();
    const captureClaimToken = hashId(
      `capture:${identity.uid}:${orderId}:${storedPaypalOrderId}:${claimNow.toMillis()}:${Math.random()}`,
    );
    let capturedReplay: any;
    await this.deps.db.runTransaction(async (transaction: any) => {
      const fresh = await transaction.get(orderRef);
      if (!fresh.exists || fresh.data()?.ownerUid !== identity.uid) {
        throw new PrintShopHttpError(404, 'order_not_found', 'Ordine non trovato');
      }
      const order = fresh.data();
      if (order.payment?.status === 'paid' && order.payment?.paypalCaptureId) {
        capturedReplay = order.payment;
        return;
      }
      if (
        order.payment?.status !== 'pending' ||
        order.payment?.paypalOrderId !== storedPaypalOrderId ||
        order.fulfillment?.status !== 'awaiting_payment'
      ) {
        throw new PrintShopHttpError(409, 'order_not_payable', 'L’ordine non è in attesa di pagamento');
      }
      assertModifiable(order, claimNow.toMillis(), { allowPendingPaypal: true });
      const recentCapture =
        order.payment?.captureStatus === 'capturing' &&
        timestampMillis(order.payment?.captureClaimedAt) >
          claimNow.toMillis() - 15 * 60 * 1000;
      if (recentCapture) {
        throw new PrintShopHttpError(409, 'capture_running', 'Pagamento già in acquisizione');
      }
      transaction.update(orderRef, {
        payment: {
          ...order.payment,
          captureStatus: 'capturing',
          captureClaimToken,
          captureClaimedAt: claimNow,
        },
        retention: {
          ...order.retention,
          status: 'capture_in_progress',
        },
        updatedAt: claimNow,
      });
    });
    if (capturedReplay) {
      return {
        success: true,
        duplicate: true,
        orderId,
        paypalOrderId: capturedReplay.paypalOrderId,
        captureId: capturedReplay.paypalCaptureId,
        status: 'paid',
      };
    }

    let response: PayPalOrderResponse;
    try {
      response = await this.deps.paypal.captureOrder(
        storedPaypalOrderId,
        paypalRequestId('print-shop', 'capture', orderId, storedPaypalOrderId),
      );
    } catch (error) {
      // A lost response or an already-captured PayPal order is recoverable. Ask
      // PayPal for the authoritative state before releasing the local claim.
      try {
        const providerOrder = await this.deps.paypal.getOrder(storedPaypalOrderId);
        const completed = extractCompletedCapture(providerOrder);
        if (completed) {
          await this.recordCompletedPayment(orderId, completed);
          return {
            success: true,
            duplicate: true,
            orderId,
            paypalOrderId: storedPaypalOrderId,
            captureId: completed.captureId,
            status: 'paid',
          };
        }
      } catch (reconciliationError) {
        if (reconciliationError instanceof PrintShopHttpError) throw reconciliationError;
      }
      await this.releaseCaptureClaim(orderRef, captureClaimToken, error);
      throw mapPayPalError(error);
    }
    const capture = extractCompletedCapture(response);
    if (!capture) {
      await this.releaseCaptureClaim(
        orderRef,
        captureClaimToken,
        new Error(`PayPal status ${response.status || 'UNKNOWN'}`),
      );
      throw new PrintShopHttpError(
        409,
        'paypal_not_completed',
        'PayPal non ha confermato il pagamento',
        { status: response.status },
      );
    }
    await this.recordCompletedPayment(orderId, capture);
    return {
      success: true,
      duplicate: false,
      orderId,
      paypalOrderId: storedPaypalOrderId,
      captureId: capture.captureId,
      status: 'paid',
    };
  }

  async paypalWebhook(
    headers: PayPalWebhookHeaders,
    event: any,
  ): Promise<Record<string, unknown>> {
    let verified = false;
    try {
      verified = await this.deps.paypal.verifyWebhook(headers, event);
    } catch (error) {
      throw mapPayPalError(error);
    }
    if (!verified) {
      throw new PrintShopHttpError(401, 'invalid_webhook_signature', 'Firma webhook PayPal non valida');
    }
    const eventId = cleanText(event?.id, 160);
    const eventType = cleanText(event?.event_type, 160);
    if (!eventId || !eventType) {
      throw new PrintShopHttpError(400, 'invalid_webhook', 'Evento PayPal non valido');
    }
    const eventRef = this.deps.db
      .collection('printShopPaymentEvents')
      .doc(hashId(`paypal-event:${eventId}`));
    if ((await eventRef.get()).exists) return { ok: true, duplicate: true };

    const eventRecord = {
      provider: 'paypal',
      providerEventId: eventId,
      type: eventType,
      payloadHash: createHash('sha256').update(JSON.stringify(event)).digest('hex'),
      receivedAt: this.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000),
    };

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const capture = captureFromWebhook(event);
      if (!capture) {
        await eventRef.set({ ...eventRecord, status: 'ignored_invalid', processedAt: this.now() });
        return { ok: true, ignored: true };
      }
      const orderId = await this.resolveWebhookOrderId(capture);
      if (!orderId) {
        await eventRef.set({ ...eventRecord, status: 'ignored_unknown_order', processedAt: this.now() });
        return { ok: true, ignored: true };
      }
      await this.recordCompletedPayment(orderId, capture, eventRef, eventRecord);
      return { ok: true, orderId };
    }

    if (eventType === 'PAYMENT.CAPTURE.DENIED') {
      const capture = captureFromWebhook(event);
      const orderId = capture ? await this.resolveWebhookOrderId(capture) : null;
      await this.recordFailedPayment(orderId, eventRef, eventRecord, event);
      return { ok: true, ...(orderId ? { orderId } : { ignored: true }) };
    }

    if (
      eventType === 'PAYMENT.CAPTURE.REFUNDED' ||
      eventType === 'PAYMENT.CAPTURE.REVERSED'
    ) {
      const orderId = await this.resolveRefundOrderId(event);
      if (!orderId) {
        await eventRef.set({ ...eventRecord, status: 'ignored_unknown_order', processedAt: this.now() });
        return { ok: true, ignored: true };
      }
      await this.recordRefund(orderId, eventRef, eventRecord, event);
      return { ok: true, orderId };
    }

    await eventRef.set({ ...eventRecord, status: 'ignored_event_type', processedAt: this.now() });
    return { ok: true, ignored: true };
  }

  private async recordCompletedPayment(
    orderId: string,
    capture: CompletedCapture,
    eventRef?: any,
    eventRecord?: Record<string, unknown>,
  ): Promise<void> {
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    const captureRef = this.deps.db
      .collection('printShopPaymentCaptures')
      .doc(hashId(`paypal-capture:${capture.captureId}`));
    const cashRef = this.deps.db
      .collection('cashMovements')
      .doc(`print_paypal_${hashId(capture.captureId).slice(0, 32)}`);
    const now = this.now();
    let customerConfirmationAllowed = true;
    await this.deps.db.runTransaction(async (transaction: any) => {
      const readRefs = [orderRef, captureRef, ...(eventRef ? [eventRef] : [])];
      const reads = await Promise.all(readRefs.map(ref => transaction.get(ref)));
      const orderDoc = reads[0];
      const captureDoc = reads[1];
      const eventDoc = eventRef ? reads[2] : undefined;
      if (eventDoc?.exists) return;
      if (!orderDoc.exists) {
        if (eventRef) {
          transaction.set(eventRef, {
            ...eventRecord,
            status: 'ignored_unknown_order',
            processedAt: now,
          });
        }
        return;
      }
      const order = orderDoc.data();
      validateCaptureAgainstOrder(orderId, order, capture, this.deps.paypal.config.merchantId);
      const filesUnavailable =
        order.retention?.status === 'purging' || order.retention?.status === 'purged';
      if (filesUnavailable) customerConfirmationAllowed = false;
      if (captureDoc.exists) {
        if (eventRef) {
          transaction.set(eventRef, { ...eventRecord, status: 'processed_duplicate', processedAt: now });
        }
        return;
      }
      const clienteRef = order.clienteId
        ? this.deps.db.collection('clienti').doc(order.clienteId)
        : undefined;
      const clienteDoc = clienteRef ? await transaction.get(clienteRef) : undefined;
      const amountEuros = centsToEuros(capture.amountCents);
      const existingTransactions = Array.isArray(order.transactions) ? order.transactions : [];
      const {
        captureClaimToken: _captureClaimToken,
        captureClaimedAt: _captureClaimedAt,
        ...paymentBeforeCapture
      } = order.payment || {};
      const newTransaction = {
        tipo: 'saldo',
        importo: amountEuros,
        metodo: 'paypal',
        data: now,
        emailInviata: false,
        cashMovementId: cashRef.id,
        provider: 'paypal',
        providerOrderId: capture.paypalOrderId,
        providerCaptureId: capture.captureId,
        note: `Pagamento anticipato shop stampe ${order.orderNumber}`,
      };
      transaction.update(orderRef, {
        payment: {
          ...paymentBeforeCapture,
          method: 'paypal',
          status: filesUnavailable ? 'paid_action_required' : 'paid',
          captureStatus: 'completed',
          paypalOrderId: capture.paypalOrderId,
          paypalCaptureId: capture.captureId,
          paypalStatus: 'COMPLETED',
          amountCents: capture.amountCents,
          currency: capture.currency,
          ...(capture.payerEmail ? { payerEmail: capture.payerEmail } : {}),
          refundedCents: order.payment?.refundedCents || 0,
          paidAt: now,
        },
        fulfillment: filesUnavailable
          ? {
              ...order.fulfillment,
              method: 'studio_pickup',
              status: 'cancelled',
              cancellationReason: 'payment_after_asset_purge',
              cancelledAt: now,
            }
          : { ...order.fulfillment, method: 'studio_pickup', status: 'submitted' },
        transactions: [...existingTransactions, newTransaction],
        acconto: amountEuros,
        saldo: 0,
        metodoPagamentoSaldo: 'paypal',
        dataSaldo: now,
        stato: filesUnavailable ? 'attenzione_pagamento' : 'in_lavorazione',
        submittedAt: now,
        retention: filesUnavailable
          ? {
              ...order.retention,
              reconciliationRequired: true,
              reconciliationReason: 'paypal_completed_after_asset_purge',
            }
          : {
              status: 'production',
              assetRetentionDays: this.retentionDays,
            },
        updatedAt: now,
      });
      transaction.set(cashRef, {
        tipo: 'entrata',
        categoria: 'Vendita diretta',
        importo: amountEuros,
        descrizione: `Shop stampe ${order.orderNumber} - ${order.nomeCliente || order.emailCliente}`,
        data: now,
        metodoPagamento: 'paypal',
        note: filesUnavailable
          ? `PayPal capture ${capture.captureId} - RIMBORSO/AZIONE MANUALE RICHIESTA: file scaduti`
          : `PayPal capture ${capture.captureId}`,
        origine: 'walk-in',
        origineTema: 'print_shop',
        origineRef: orderId,
        orderId,
        provider: 'paypal',
        providerTransactionId: capture.captureId,
        createdAt: now,
        updatedAt: now,
      });
      transaction.set(captureRef, {
        provider: 'paypal',
        orderId,
        paypalOrderId: capture.paypalOrderId,
        captureId: capture.captureId,
        amountCents: capture.amountCents,
        currency: capture.currency,
        recordedAt: now,
      });
      if (clienteRef && clienteDoc?.exists) {
        transaction.update(clienteRef, {
          'financials.totalRevenue': FieldValue.increment(amountEuros),
          'financials.totalOrders': FieldValue.increment(1),
          'sourceRefs.orderIds': FieldValue.arrayUnion(orderId),
          'lifecycle.lastInteractionAt': now,
          updatedAt: now,
        });
      }
      if (eventRef) {
        transaction.set(eventRef, {
          ...eventRecord,
          status: filesUnavailable ? 'processed_manual_action_required' : 'processed',
          processedAt: now,
        });
      }
    });
    if (customerConfirmationAllowed) {
      await this.sendCustomerNotificationBestEffort(orderId, 'payment_confirmed');
    }
  }

  private async recordFailedPayment(
    orderId: string | null,
    eventRef: any,
    eventRecord: Record<string, unknown>,
    event: any,
  ): Promise<void> {
    const now = this.now();
    await this.deps.db.runTransaction(async (transaction: any) => {
      const eventDoc = await transaction.get(eventRef);
      if (eventDoc.exists) return;
      const orderRef = orderId ? this.deps.db.collection('orders').doc(orderId) : undefined;
      const orderDoc = orderRef ? await transaction.get(orderRef) : undefined;
      if (orderRef && orderDoc?.exists && orderDoc.data()?.payment?.status === 'pending') {
        const order = orderDoc.data();
        transaction.update(orderRef, {
          payment: {
            ...order.payment,
            status: 'failed',
            paypalStatus: event?.resource?.status || 'DENIED',
            failedAt: now,
          },
          fulfillment: { ...order.fulfillment, status: 'awaiting_payment' },
          updatedAt: now,
        });
      }
      transaction.set(eventRef, {
        ...eventRecord,
        status: orderDoc?.exists ? 'processed' : 'ignored_unknown_order',
        processedAt: now,
      });
    });
  }

  private async recordRefund(
    orderId: string,
    eventRef: any,
    eventRecord: Record<string, unknown>,
    event: any,
  ): Promise<void> {
    const resource = event?.resource || {};
    const refundId = cleanText(resource.id, 160) || cleanText(event?.id, 160)!;
    const eventType = String(event?.event_type || '');
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    const cashRef = this.deps.db
      .collection('cashMovements')
      .doc(`print_refund_${hashId(refundId).slice(0, 32)}`);
    const refundRef = this.deps.db
      .collection('printShopPaymentRefunds')
      .doc(hashId(`paypal-refund:${refundId}`));
    const now = this.now();
    let terminalRefund = false;
    await this.deps.db.runTransaction(async (transaction: any) => {
      const [eventDoc, orderDoc, refundDoc] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(orderRef),
        transaction.get(refundRef),
      ]);
      if (eventDoc.exists) return;
      if (refundDoc.exists) {
        transaction.set(eventRef, {
          ...eventRecord,
          status: 'processed_duplicate_refund',
          processedAt: now,
        });
        return;
      }
      if (!orderDoc.exists) {
        transaction.set(eventRef, { ...eventRecord, status: 'ignored_unknown_order', processedAt: now });
        return;
      }
      const order = orderDoc.data();
      const relatedCaptureId = cleanText(
        resource.supplementary_data?.related_ids?.capture_id || resource.parent_payment,
        200,
      );
      if (
        order.payment?.paypalCaptureId &&
        (!relatedCaptureId || relatedCaptureId !== order.payment.paypalCaptureId)
      ) {
        transaction.set(eventRef, {
          ...eventRecord,
          status: 'ignored_capture_mismatch',
          processedAt: now,
        });
        return;
      }
      const alreadyRefunded = Number(order.payment?.refundedCents || 0);
      const amountFromEvent = paypalValueToCents(resource.amount?.value);
      const paidCents = Number(order.payment?.amountCents || order.totals?.totalCents || 0);
      const refundCents =
        amountFromEvent !== null
          ? amountFromEvent
          : eventType === 'PAYMENT.CAPTURE.REVERSED'
            ? Math.max(0, paidCents - alreadyRefunded)
            : 0;
      if (
        refundCents <= 0 ||
        String(resource.amount?.currency_code || 'EUR') !== 'EUR' ||
        alreadyRefunded + refundCents > paidCents
      ) {
        transaction.set(eventRef, { ...eventRecord, status: 'ignored_invalid_amount', processedAt: now });
        return;
      }
      const totalRefunded = alreadyRefunded + refundCents;
      const fullRefund = totalRefunded === paidCents;
      if (fullRefund) terminalRefund = true;
      const refunds = Array.isArray(order.payment?.refunds) ? order.payment.refunds : [];
      const amountEuros = centsToEuros(refundCents);
      const clienteRef = order.clienteId
        ? this.deps.db.collection('clienti').doc(order.clienteId)
        : undefined;
      const clienteDoc = clienteRef ? await transaction.get(clienteRef) : undefined;
      transaction.update(orderRef, {
        payment: {
          ...order.payment,
          status: fullRefund ? 'refunded' : 'partially_refunded',
          refundedCents: totalRefunded,
          refundedAt: now,
          refunds: [
            ...refunds,
            {
              id: refundId,
              amountCents: refundCents,
              currency: 'EUR',
              eventType,
              createdAt: now,
              cashMovementId: cashRef.id,
            },
          ],
        },
        ...(fullRefund
          ? {
              fulfillment: { ...order.fulfillment, status: 'cancelled' },
              stato: 'annullato',
              retention: this.cancelledRetention(now, 'refunded'),
            }
          : {}),
        updatedAt: now,
      });
      transaction.set(cashRef, {
        tipo: 'uscita',
        categoria: 'Rimborso',
        importo: amountEuros,
        descrizione: `Rimborso shop stampe ${order.orderNumber}`,
        data: now,
        metodoPagamento: 'paypal',
        note: `PayPal refund ${refundId}`,
        origine: 'walk-in',
        origineTema: 'print_shop',
        origineRef: orderId,
        orderId,
        provider: 'paypal',
        providerTransactionId: refundId,
        createdAt: now,
        updatedAt: now,
      });
      transaction.set(refundRef, {
        provider: 'paypal',
        refundId,
        orderId,
        captureId: relatedCaptureId || order.payment?.paypalCaptureId || null,
        amountCents: refundCents,
        currency: 'EUR',
        eventType,
        recordedAt: now,
      });
      if (clienteRef && clienteDoc?.exists) {
        transaction.update(clienteRef, {
          'financials.totalRevenue': FieldValue.increment(-amountEuros),
          'lifecycle.lastInteractionAt': now,
          updatedAt: now,
        });
      }
      transaction.set(eventRef, { ...eventRecord, status: 'processed', processedAt: now });
    });
    if (terminalRefund) {
      await this.cleanupTerminalLabShipments(orderId).catch(error => {
        console.error('⚠️ [PrintShop] cleanup laboratorio dopo rimborso fallito:', error);
      });
    }
  }

  private async resolveWebhookOrderId(capture: CompletedCapture): Promise<string | null> {
    if (capture.customId) {
      const direct = await this.deps.db.collection('orders').doc(capture.customId).get();
      if (
        direct.exists &&
        direct.data()?.orderType === 'print_shop' &&
        direct.data()?.payment?.paypalOrderId === capture.paypalOrderId
      ) {
        return direct.id;
      }
    }
    const snapshot = await this.deps.db
      .collection('orders')
      .where('payment.paypalOrderId', '==', capture.paypalOrderId)
      .limit(2)
      .get();
    const matches = snapshot.docs.filter((doc: any) => doc.data()?.orderType === 'print_shop');
    return matches.length === 1 ? matches[0].id : null;
  }

  private async resolveRefundOrderId(event: any): Promise<string | null> {
    const resource = event?.resource || {};
    const orderId = cleanText(
      resource.supplementary_data?.related_ids?.order_id || resource.custom_id,
      200,
    );
    if (orderId) {
      const direct = await this.deps.db.collection('orders').doc(orderId).get();
      if (direct.exists && direct.data()?.orderType === 'print_shop') return direct.id;
    }
    const captureId = cleanText(
      resource.supplementary_data?.related_ids?.capture_id || resource.parent_payment,
      200,
    );
    if (!captureId) return null;
    const snapshot = await this.deps.db
      .collection('orders')
      .where('payment.paypalCaptureId', '==', captureId)
      .limit(2)
      .get();
    const matches = snapshot.docs.filter((doc: any) => doc.data()?.orderType === 'print_shop');
    return matches.length === 1 ? matches[0].id : null;
  }

  async adminCatalogProduct(sku: string): Promise<PrintShopCatalogProduct> {
    const normalizedSku = normalizeCatalogSku(sku);
    const snapshot = await this.deps.db
      .collection('products')
      .where('sku', '==', normalizedSku)
      .limit(2)
      .get();
    if (snapshot.empty) {
      throw new PrintShopHttpError(404, 'catalog_product_not_found', 'Prodotto shop non trovato');
    }
    if (snapshot.size !== 1) {
      throw new PrintShopHttpError(409, 'catalog_duplicate_sku', 'Lo SKU non è univoco');
    }
    const product = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    if (
      !Array.isArray((product as any).salesChannels) ||
      !(product as any).salesChannels.includes('print_shop') ||
      !isCatalogProduct(product)
    ) {
      throw new PrintShopHttpError(503, 'catalog_invalid', 'Configurazione prodotto shop non valida');
    }
    return product;
  }

  async updateAdminCatalogProduct(
    sku: string,
    input: PrintShopCatalogAdminUpdate,
    adminEmail: string,
  ): Promise<PrintShopCatalogProduct> {
    const normalizedSku = normalizeCatalogSku(sku);
    const snapshot = await this.deps.db
      .collection('products')
      .where('sku', '==', normalizedSku)
      .limit(2)
      .get();
    if (snapshot.empty) {
      throw new PrintShopHttpError(404, 'catalog_product_not_found', 'Prodotto shop non trovato');
    }
    if (snapshot.size !== 1) {
      throw new PrintShopHttpError(409, 'catalog_duplicate_sku', 'Lo SKU non è univoco');
    }
    const productRef = snapshot.docs[0].ref;
    let result: PrintShopCatalogProduct | undefined;
    await this.deps.db.runTransaction(async (transaction: any) => {
      const doc = await transaction.get(productRef);
      if (!doc.exists || normalizeCatalogSku(doc.data()?.sku) !== normalizedSku) {
        throw new PrintShopHttpError(409, 'catalog_product_changed', 'Il prodotto è cambiato');
      }
      const current = { id: doc.id, ...doc.data() } as any;
      if (!Array.isArray(current.salesChannels) || !current.salesChannels.includes('print_shop')) {
        throw new PrintShopHttpError(404, 'catalog_product_not_found', 'Prodotto shop non trovato');
      }
      const pricing = input.printSpec.pricing;
      const currentPricing = current.printSpec?.pricing;
      const isPolaroidSku = normalizedSku === 'PRINT-POLAROID-100X090';
      if (input.categoria !== undefined && !PRINT_SHOP_CATEGORY_IDS.has(input.categoria)) {
        throw new PrintShopHttpError(
          400,
          'catalog_validation_failed',
          'Categoria shop non valida',
        );
      }
      if (currentPricing?.model && currentPricing.model !== pricing.model) {
        throw new PrintShopHttpError(
          400,
          'catalog_validation_failed',
          'Il modello di prezzo del formato non può essere cambiato',
        );
      }
      if (isPolaroidSku && input.categoria !== undefined && input.categoria !== 'stampe-polaroid') {
        throw new PrintShopHttpError(
          400,
          'catalog_validation_failed',
          'La categoria del pacchetto Polaroid non può essere cambiata',
        );
      }
      const firstPriceCents = pricing.model === 'tiered'
        ? pricing.tiers[0]?.unitPriceCents
        : pricing.packagePriceCents;
      if (!Number.isSafeInteger(firstPriceCents) || Number(firstPriceCents) < 1) {
        throw new PrintShopHttpError(400, 'catalog_validation_failed', 'Prezzo non valido');
      }
      const next: any = {
        ...current,
        ...(input.nome !== undefined ? { nome: input.nome } : {}),
        ...(input.descrizione !== undefined ? { descrizione: input.descrizione } : {}),
        ...(input.categoria !== undefined ? { categoria: input.categoria } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
        ...(input.attivo !== undefined ? { attivo: input.attivo } : {}),
        sku: normalizedSku,
        currency: PRINT_SHOP_CURRENCY,
        salesChannels: [...new Set([...current.salesChannels, 'print_shop'])],
        printSpec: input.printSpec,
        catalogVersion: Number(current.catalogVersion || 0) + 1,
        prezzo: Number(firstPriceCents) / 100,
        prezzoFinale: Number(firstPriceCents) / 100,
        sconto: 0,
        numeroFoto: pricing.model === 'package' ? pricing.packageSize : 1,
        updatedAt: this.now(),
        updatedBy: adminEmail,
      };
      if (!isCatalogProduct(next)) {
        throw new PrintShopHttpError(
          400,
          'catalog_validation_failed',
          'Dimensioni, opzioni o scaglioni prezzo non sono validi',
        );
      }
      const { id: _id, ...persisted } = next;
      transaction.update(productRef, persisted);
      result = next;
    });
    if (!result) throw new PrintShopHttpError(409, 'catalog_product_changed', 'Prodotto cambiato');
    return result;
  }

  async adminOrders(filters: {
    status?: string;
    paymentStatus?: string;
    limit?: number;
  } = {}): Promise<any[]> {
    const snapshot = await this.deps.db
      .collection('orders')
      .where('orderType', '==', 'print_shop')
      .get();
    return snapshot.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .filter((order: any) =>
        !filters.status || order.fulfillment?.status === filters.status,
      )
      .filter((order: any) =>
        !filters.paymentStatus || order.payment?.status === filters.paymentStatus,
      )
      .sort((a: any, b: any) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt))
      .slice(0, Math.min(Math.max(filters.limit || 100, 1), 250));
  }

  async adminOrder(orderId: string): Promise<any> {
    const order = await this.requirePrintOrder(orderId);
    const assets = await this.listAssets(orderId);
    return { ...order, assets: assets.map(publicAsset) };
  }

  async updateAdminStatus(
    orderId: string,
    status: PrintShopFulfillmentStatus,
    adminEmail: string,
    note?: string,
  ): Promise<any> {
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    const now = this.now();
    await this.deps.db.runTransaction(async (transaction: any) => {
      const doc = await transaction.get(orderRef);
      if (!doc.exists || doc.data()?.orderType !== 'print_shop') {
        throw new PrintShopHttpError(404, 'order_not_found', 'Ordine non trovato');
      }
      const order = doc.data();
      const current = order.fulfillment?.status as PrintShopFulfillmentStatus;
      if (current === status) return;
      if (!ADMIN_TRANSITIONS[current]?.includes(status)) {
        throw new PrintShopHttpError(
          409,
          'invalid_status_transition',
          `Passaggio di stato non consentito: ${current} → ${status}`,
        );
      }
      if (status !== 'cancelled' && order.payment?.status !== 'paid') {
        throw new PrintShopHttpError(409, 'payment_required', 'Il pagamento anticipato non risulta acquisito');
      }
      if (status === 'cancelled' && order.payment?.status === 'paid') {
        throw new PrintShopHttpError(
          409,
          'refund_required',
          'Rimborsa il pagamento PayPal prima di annullare l’ordine',
        );
      }
      const history = Array.isArray(order.fulfillment?.history)
        ? order.fulfillment.history
        : [];
      const fulfillment: any = {
        ...order.fulfillment,
        status,
        history: [
          ...history,
          {
            from: current,
            to: status,
            at: now,
            by: adminEmail,
            ...(cleanText(note, 500) ? { note: cleanText(note, 500) } : {}),
          },
        ],
      };
      const update: any = {
        fulfillment,
        stato: compatibilityStatus(status),
        updatedAt: now,
      };
      if (status === 'ready_for_pickup') fulfillment.readyAt = now;
      if (status === 'delivered') {
        fulfillment.deliveredAt = now;
        update.retention = {
          assetRetentionDays: this.retentionDays,
          deleteAfter: Timestamp.fromMillis(
            now.toMillis() + this.retentionDays * 24 * 60 * 60 * 1000,
          ),
          status: 'scheduled',
          reason: 'delivered',
          gcsLifecycle: {
            status: 'pending',
            queuedAt: now,
            prefix: 'print-orders/',
          },
        };
      } else if (status === 'cancelled') {
        update.retention = this.cancelledRetention(now, 'cancelled');
      }
      transaction.update(orderRef, update);
    });
    if (status === 'ready_for_pickup') {
      await this.sendCustomerNotificationBestEffort(orderId, 'ready_for_pickup');
    }
    if (status === 'delivered') {
      void this.armGcsLifecycleForDeliveredOrder(orderId, now).catch(error => {
        console.error('⚠️ [PrintShop] customTime lifecycle GCS non impostato:', error);
      });
    }
    if (status === 'cancelled') {
      await this.cleanupTerminalLabShipments(orderId).catch(error => {
        console.error('⚠️ [PrintShop] cleanup laboratorio dopo annullamento fallito:', error);
      });
    }
    return this.adminOrder(orderId);
  }

  private async armGcsLifecycleForDeliveredOrder(
    orderId: string,
    deliveredAt: Timestamp,
  ): Promise<void> {
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    await this.requirePrintOrder(orderId);
    const assets = await this.listAssets(orderId);
    // Include anche gli originali JPG caricati e poi non assegnati: dopo il
    // pagamento non sono più utili, ma devono comunque avere una scadenza
    // indipendente dal processo Replit.
    const retainedAssets = assets.filter(asset => asset.status === 'ready' && asset.storagePath);
    const customTime = deliveredAt.toDate().toISOString();
    const failures: string[] = [];
    const results = await mapWithConcurrency(retainedAssets, 10, async asset => {
      const assetId = asset.id;
      try {
        await this.deps.storage.bucket().file(asset.storagePath).setMetadata({ customTime });
        await this.deps.db
          .collection('orders')
          .doc(orderId)
          .collection('assets')
          .doc(assetId)
          .update({
            retentionCustomTime: deliveredAt,
            retentionCustomTimeSetAt: this.now(),
            updatedAt: this.now(),
          });
        return null;
      } catch {
        return assetId;
      }
    });
    failures.push(...results.filter((assetId): assetId is string => Boolean(assetId)));
    await orderRef.update({
      'retention.gcsLifecycle.status': failures.length === 0 ? 'armed' : 'partial',
      'retention.gcsLifecycle.customTime': deliveredAt,
      'retention.gcsLifecycle.prefix': 'print-orders/',
      'retention.gcsLifecycle.originalAssetCount': retainedAssets.length,
      'retention.gcsLifecycle.failedAssetCount': failures.length,
      'retention.gcsLifecycle.lastAttemptAt': this.now(),
      ...(failures.length > 0
        ? { 'retention.gcsLifecycle.failedAssetIds': failures.join(',').slice(0, 1500) }
        : { 'retention.gcsLifecycle.failedAssetIds': FieldValue.delete() }),
      updatedAt: this.now(),
    });
  }

  async sendCustomerNotificationBestEffort(
    orderId: string,
    kind: 'payment_confirmed' | 'ready_for_pickup',
  ): Promise<{ sent: boolean; skipped: boolean }> {
    if (!this.deps.mail) return { sent: false, skipped: true };
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    const markerKey = kind === 'payment_confirmed' ? 'paymentConfirmed' : 'readyForPickup';
    const now = this.now();
    let claimed = false;
    let order: any;
    await this.deps.db.runTransaction(async (transaction: any) => {
      const doc = await transaction.get(orderRef);
      if (!doc.exists || doc.data()?.orderType !== 'print_shop') return;
      order = { id: doc.id, ...doc.data() };
      const marker = order.notifications?.[markerKey];
      const recentSending =
        marker?.status === 'sending' &&
        timestampMillis(marker.attemptedAt) > now.toMillis() - 10 * 60 * 1000;
      if (marker?.status === 'sent' || recentSending) return;
      transaction.update(orderRef, {
        notifications: {
          ...(order.notifications || {}),
          [markerKey]: {
            status: 'sending',
            attemptedAt: now,
            attempts: Number(marker?.attempts || 0) + 1,
          },
        },
        updatedAt: now,
      });
      claimed = true;
    });
    if (!claimed || !order) return { sent: false, skipped: true };
    const email = cleanText(order.customer?.email || order.emailCliente, 254);
    if (!email) {
      await this.finishNotification(orderRef, order, markerKey, 'failed', 'Email cliente mancante');
      return { sent: false, skipped: true };
    }
    try {
      const studio = await this.deps.mail.studio();
      const subject =
        kind === 'payment_confirmed'
          ? `Ordine ${order.orderNumber} ricevuto e pagato`
          : `Le tue stampe ${order.orderNumber} sono pronte per il ritiro`;
      const html = createCustomerOrderEmail(kind, order, studio);
      await this.deps.mail.send(email, subject, html, {
        type: kind === 'payment_confirmed' ? 'print_shop_paid' : 'print_shop_ready',
        relatedDocId: orderId,
        relatedDocType: 'order',
        clientName: order.customer?.name || order.nomeCliente || email,
      });
      await this.finishNotification(orderRef, order, markerKey, 'sent');
      return { sent: true, skipped: false };
    } catch (error: any) {
      await this.finishNotification(
        orderRef,
        order,
        markerKey,
        'failed',
        String(error?.message || error).slice(0, 500),
      ).catch(() => undefined);
      return { sent: false, skipped: false };
    }
  }

  private async finishNotification(
    orderRef: any,
    previousOrder: any,
    markerKey: string,
    status: 'sent' | 'failed',
    error?: string,
  ): Promise<void> {
    const fresh = await orderRef.get();
    const order = fresh.exists ? fresh.data() : previousOrder;
    const current = order.notifications?.[markerKey] || {};
    const now = this.now();
    await orderRef.update({
      notifications: {
        ...(order.notifications || {}),
        [markerKey]: {
          ...current,
          status,
          ...(status === 'sent' ? { sentAt: now } : { failedAt: now, lastError: error }),
        },
      },
      updatedAt: now,
    });
  }

  async manifest(orderId: string): Promise<{
    order: Record<string, unknown>;
    rows: PrintShopManifestRow[];
  }> {
    const order = await this.requirePrintOrder(orderId);
    const assets = await this.listAssets(orderId);
    const assetMap = new Map(assets.map(asset => [asset.id, asset]));
    const rows: PrintShopManifestRow[] = [];
    for (const item of (order.printShop?.items || []) as PrintOrderItemSnapshot[]) {
      for (const assignment of item.assignments || []) {
        const asset = assetMap.get(assignment.assetId);
        if (!asset) {
          throw new PrintShopHttpError(
            409,
            'manifest_asset_missing',
            `File ${assignment.assetId} non trovato`,
          );
        }
        rows.push({
          orderNumber: order.orderNumber,
          sku: item.sku,
          productName: item.productName,
          widthMm: item.widthMm,
          heightMm: item.heightMm,
          finish: item.finish,
          fitMode: item.fitMode,
          assetId: assignment.assetId,
          fileName: asset.originalName || `${assignment.assetId}.jpg`,
          copies: assignment.copies,
          ...(asset.widthPx ? { widthPx: asset.widthPx } : {}),
          ...(asset.heightPx ? { heightPx: asset.heightPx } : {}),
        });
      }
    }
    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        customer: order.customer,
        totals: order.totals,
        fulfillment: order.fulfillment,
        payment: order.payment,
        assetCount: order.printShop?.assetCount || 0,
        copyCount: order.printShop?.copyCount || 0,
      },
      rows,
    };
  }

  async manifestCsv(orderId: string): Promise<string> {
    const { rows } = await this.manifest(orderId);
    const header = [
      'ordine',
      'sku',
      'prodotto',
      'formato_mm',
      'carta',
      'adattamento',
      'file',
      'asset_id',
      'copie',
      'pixel',
    ];
    const lines = rows.map(row => [
      row.orderNumber,
      row.sku,
      row.productName,
      `${row.widthMm}x${row.heightMm}`,
      row.finish === 'glossy' ? 'lucida' : 'opaca',
      row.fitMode === 'border' ? 'bordo bianco' : 'a tutta pagina',
      row.fileName,
      row.assetId,
      String(row.copies),
      row.widthPx && row.heightPx ? `${row.widthPx}x${row.heightPx}` : '',
    ]);
    return [header, ...lines]
      .map(columns => columns.map(value => csvCell(String(value))).join(','))
      .join('\r\n');
  }

  async archiveData(orderId: string): Promise<{
    order: any;
    assets: any[];
    manifestCsv: string;
    manifestJson: Record<string, unknown>;
  }> {
    const order = await this.requirePrintOrder(orderId);
    const assets = await this.listAssets(orderId);
    const referencedIds = referencedAssetIds(order);
    const assetsById = new Map(assets.map(asset => [asset.id, asset]));
    const referencedAssets = referencedIds.map(assetId => assetsById.get(assetId));
    const unavailableId = referencedIds.find(assetId => {
      const asset = assetsById.get(assetId);
      return !asset || asset.status !== 'ready' || !asset.storagePath;
    });
    if (unavailableId) {
      throw new PrintShopHttpError(
        409,
        'archive_asset_missing',
        `Il file ordinato ${unavailableId} non è disponibile per l’archivio`,
      );
    }
    const manifestJson = await this.manifest(orderId);
    const manifestCsv = await this.manifestCsv(orderId);
    return {
      order,
      assets: referencedAssets,
      manifestCsv,
      manifestJson,
    };
  }

  async listLabShipments(orderId: string): Promise<any[]> {
    await this.requirePrintOrder(orderId);
    const snapshot = await this.deps.db
      .collection('labShipments')
      .where('orderId', '==', orderId)
      .get();
    return snapshot.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
  }

  async createLabShipment(
    orderId: string,
    input: { labId: string; expiryDays?: number },
    adminEmail: string,
  ): Promise<any> {
    const order = await this.requirePrintOrder(orderId);
    assertLabOrderAction(order, LAB_CREATE_STATUSES);
    const labDoc = await this.deps.db.collection('labs').doc(input.labId).get();
    if (!labDoc.exists || labDoc.data()?.attivo === false) {
      throw new PrintShopHttpError(404, 'lab_not_found', 'Laboratorio non trovato o non attivo');
    }
    const lab = labDoc.data();
    assertLabDataProcessingAgreement(lab);
    if (!lab.email) {
      throw new PrintShopHttpError(409, 'lab_email_required', 'Email del laboratorio mancante');
    }
    const existing = await this.deps.db
      .collection('labShipments')
      .where('orderId', '==', orderId)
      .get();
    const reusable = existing.docs.find((doc: any) => {
      const data = doc.data();
      return data.labId === input.labId && data.status !== 'scaduto';
    });
    const now = this.now();
    const expiryDays =
      Number.isSafeInteger(input.expiryDays) && (input.expiryDays || 0) > 0
        ? Math.min(input.expiryDays!, 90)
        : 20;
    const expiresAt = Timestamp.fromMillis(now.toMillis() + expiryDays * 24 * 60 * 60 * 1000);
    const shipmentRef = reusable?.ref || this.deps.db
      .collection('labShipments')
      .doc(`pslab_${hashId(`${orderId}:${input.labId}`).slice(0, 32)}`);
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    let result: any;
    await this.deps.db.runTransaction(async (transaction: any) => {
      const [freshOrderDoc, freshShipmentDoc] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(shipmentRef),
      ]);
      if (!freshOrderDoc.exists || freshOrderDoc.data()?.orderType !== 'print_shop') {
        throw new PrintShopHttpError(404, 'order_not_found', 'Ordine non trovato');
      }
      const freshOrder = { id: freshOrderDoc.id, ...freshOrderDoc.data() };
      assertLabOrderAction(freshOrder, LAB_CREATE_STATUSES);
      if (freshShipmentDoc.exists && freshShipmentDoc.data()?.status !== 'scaduto') {
        result = { id: freshShipmentDoc.id, ...freshShipmentDoc.data(), reused: true };
        return;
      }
      const referencedIds = referencedAssetIds(freshOrder);
      if (referencedIds.length === 0) {
        throw new PrintShopHttpError(409, 'empty_print_order', 'L’ordine non contiene fotografie');
      }
      const shipment = {
        sourceType: 'print_shop',
        orderId,
        orderNumber: freshOrder.orderNumber,
        labId: input.labId,
        labNome: lab.nome || 'Laboratorio',
        labEmail: lab.email,
        descrizione: `Ordine stampe ${freshOrder.orderNumber}`,
        files: [],
        status: 'da_inviare',
        expiryDays,
        expiresAt,
        transfer: {
          status: 'pending',
          total: referencedIds.length,
          transferred: 0,
          failed: [],
        },
        createdAt: now,
        updatedAt: now,
        createdBy: adminEmail,
      };
      transaction.set(shipmentRef, shipment);
      transaction.update(orderRef, {
        fulfillment: {
          ...freshOrder.fulfillment,
          laboratory: {
            laboratoryId: input.labId,
            laboratoryName: lab.nome || 'Laboratorio',
            labShipmentId: shipmentRef.id,
            transferMethod: 'email',
            assignedAt: now,
          },
        },
        updatedAt: now,
      });
      result = { id: shipmentRef.id, ...shipment, reused: false };
    });
    return result;
  }

  async transferLabShipment(shipmentId: string): Promise<void> {
    if (!this.deps.drive) {
      throw new PrintShopHttpError(503, 'drive_unavailable', 'Google Drive non configurato');
    }
    const shipmentRef = this.deps.db.collection('labShipments').doc(shipmentId);
    const now = this.now();
    let shipment: any;
    let order: any;
    await this.deps.db.runTransaction(async (transaction: any) => {
      const shipmentDoc = await transaction.get(shipmentRef);
      if (!shipmentDoc.exists || shipmentDoc.data()?.sourceType !== 'print_shop') {
        throw new PrintShopHttpError(404, 'shipment_not_found', 'Spedizione non trovata');
      }
      shipment = shipmentDoc.data();
      const orderRef = this.deps.db.collection('orders').doc(shipment.orderId);
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists || orderDoc.data()?.orderType !== 'print_shop') {
        throw new PrintShopHttpError(404, 'order_not_found', 'Ordine non trovato');
      }
      order = { id: orderDoc.id, ...orderDoc.data() };
      assertLabOrderAction(order, LAB_TRANSFER_STATUSES);
      const labDoc = shipment.labId
        ? await transaction.get(this.deps.db.collection('labs').doc(shipment.labId))
        : undefined;
      if (!labDoc?.exists || labDoc.data()?.attivo === false) {
        throw new PrintShopHttpError(404, 'lab_not_found', 'Laboratorio non trovato o non attivo');
      }
      assertLabDataProcessingAgreement(labDoc.data());
      if (shipment.transfer?.status === 'completed') return;
      if (shipment.transfer?.status === 'running') {
        const heartbeat = timestampMillis(shipment.transfer?.heartbeatAt);
        if (heartbeat && heartbeat > Date.now() - 15 * 60 * 1000) {
          throw new PrintShopHttpError(409, 'transfer_running', 'Trasferimento già in corso');
        }
      }
      const transferExpiresAt = shipment.expiresAt || Timestamp.fromMillis(
        now.toMillis() + Math.min(Math.max(Number(shipment.expiryDays || 20), 1), 90) * 86_400_000,
      );
      shipment = { ...shipment, expiresAt: transferExpiresAt };
      transaction.update(shipmentRef, {
        'transfer.status': 'running',
        'transfer.startedAt': shipment.transfer?.startedAt || now,
        'transfer.heartbeatAt': now,
        'transfer.lastError': FieldValue.delete(),
        expiresAt: transferExpiresAt,
        updatedAt: now,
      });
    });
    if (shipment.transfer?.status === 'completed') return;
    try {
      const assets = await this.listAssets(shipment.orderId);
      const referencedIds = referencedAssetIds(order);
      const assetsById = new Map(assets.map(asset => [asset.id, asset]));
      const readyAssets = referencedIds.map(assetId => assetsById.get(assetId));
      const unavailableId = referencedIds.find(assetId => {
        const asset = assetsById.get(assetId);
        return !asset || asset.status !== 'ready' || !asset.storagePath;
      });
      if (referencedIds.length === 0 || unavailableId) {
        throw new PrintShopHttpError(
          409,
          'transfer_asset_missing',
          unavailableId
            ? `Il file ordinato ${unavailableId} non è pronto`
            : 'L’ordine non contiene fotografie da trasferire',
        );
      }
      let folderId = shipment.driveFolderId;
      let shareableLink = shipment.shareableLink;
      if (!folderId) {
        const recovered = await this.deps.drive.findShipmentFolderByShipmentId?.(shipmentId);
        const folder = recovered || await (async () => {
          const parentId = await this.deps.drive!.findOrCreateLabParentFolder();
          return this.deps.drive!.createShipmentFolder(
            parentId,
            sanitizeFileName(order.orderNumber),
            {
              labShipmentId: shipmentId,
              orderId: shipment.orderId,
              expiresAt: new Date(timestampMillis(shipment.expiresAt)).toISOString(),
              deferPublicAccess: true,
            },
          );
        })();
        folderId = folder.folderId;
        shareableLink = folder.webViewLink;
        try {
          await shipmentRef.update({
            driveFolderId: folderId,
            shareableLink: shareableLink || null,
            expiresAt: shipment.expiresAt,
            updatedAt: this.now(),
          });
        } catch (error) {
          if (!recovered && this.deps.drive.deleteDriveFile) {
            await this.deps.drive.deleteDriveFile(folderId).catch(() => undefined);
          }
          throw error;
        }
      }
      const latest = await shipmentRef.get();
      shipment = latest.data();
      const files: any[] = Array.isArray(shipment.files) ? [...shipment.files] : [];

      // Un rimborso o un cambio di stato terminale avvenuto mentre veniva
      // creata la cartella deve fermare il trasferimento prima degli originali.
      order = await this.requirePrintOrder(shipment.orderId);
      assertLabOrderAction(order, LAB_TRANSFER_STATUSES);

      if (!files.some(file => file.kind === 'manifest')) {
        const csv = await this.manifestCsv(shipment.orderId);
        const uploaded = await this.deps.drive.uploadStreamToDriveFolder(
          folderId,
          `${order.orderNumber}-distinta.csv`,
          'text/csv',
          Readable.from([Buffer.from(csv, 'utf8')]),
        );
        files.push({
          kind: 'manifest',
          driveFileId: uploaded.fileId,
          name: `${order.orderNumber}-distinta.csv`,
          size: uploaded.size,
          mimeType: 'text/csv',
          ...(uploaded.webViewLink ? { webViewLink: uploaded.webViewLink } : {}),
          uploadedAt: this.now(),
        });
      }

      let transferred = files.filter(file => file.kind === 'original').length;
      for (const [index, asset] of readyAssets.entries()) {
        if (files.some(file => file.assetId === asset.id)) continue;
        const source = this.deps.storage.bucket().file(asset.storagePath);
        const fileName = `${String(index + 1).padStart(4, '0')}_${asset.id}_${sanitizeFileName(
          asset.originalName || 'foto.jpg',
        )}`;
        const uploaded = await this.deps.drive.uploadStreamToDriveFolder(
          folderId,
          fileName,
          'image/jpeg',
          source.createReadStream(),
        );
        files.push({
          kind: 'original',
          assetId: asset.id,
          driveFileId: uploaded.fileId,
          name: fileName,
          size: uploaded.size,
          mimeType: 'image/jpeg',
          ...(uploaded.webViewLink ? { webViewLink: uploaded.webViewLink } : {}),
          uploadedAt: this.now(),
        });
        transferred++;
        await shipmentRef.update({
          files,
          'transfer.transferred': transferred,
          'transfer.heartbeatAt': this.now(),
          updatedAt: this.now(),
        });
      }
      await this.deps.db.runTransaction(async (transaction: any) => {
        const currentOrderDoc = await transaction.get(
          this.deps.db.collection('orders').doc(shipment.orderId),
        );
        if (!currentOrderDoc.exists || currentOrderDoc.data()?.orderType !== 'print_shop') {
          throw new PrintShopHttpError(404, 'order_not_found', 'Ordine non trovato');
        }
        assertLabOrderAction(
          { id: currentOrderDoc.id, ...currentOrderDoc.data() },
          LAB_TRANSFER_STATUSES,
        );
        const finishedAt = this.now();
        transaction.update(shipmentRef, {
          files,
          driveFolderId: folderId,
          shareableLink: shareableLink || null,
          'transfer.status': 'completed',
          'transfer.total': readyAssets.length,
          'transfer.transferred': readyAssets.length,
          'transfer.failed': [],
          'transfer.finishedAt': finishedAt,
          'transfer.heartbeatAt': finishedAt,
          updatedAt: finishedAt,
        });
      });
    } catch (error: any) {
      await shipmentRef.update({
        'transfer.status': 'failed',
        'transfer.lastError': String(error?.message || error).slice(0, 500),
        'transfer.finishedAt': this.now(),
        'transfer.heartbeatAt': this.now(),
        updatedAt: this.now(),
      });
      throw error;
    }
  }

  async sendLabShipment(
    orderId: string,
    shipmentId: string,
    input: { labId?: string },
    adminEmail: string,
  ): Promise<any> {
    if (!this.deps.mail) {
      throw new PrintShopHttpError(503, 'mail_unavailable', 'Invio email non configurato');
    }
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    const shipmentRef = this.deps.db.collection('labShipments').doc(shipmentId);
    const [initialOrder, shipmentDoc] = await Promise.all([
      this.requirePrintOrder(orderId),
      shipmentRef.get(),
    ]);
    if (
      !shipmentDoc.exists ||
      shipmentDoc.data()?.sourceType !== 'print_shop' ||
      shipmentDoc.data()?.orderId !== orderId
    ) {
      throw new PrintShopHttpError(404, 'shipment_not_found', 'Spedizione non trovata');
    }
    assertLabOrderAction(initialOrder, LAB_TRANSFER_STATUSES);
    const initialShipment = shipmentDoc.data();
    if (initialShipment.status === 'inviato' && initialShipment.sentAt) {
      return { id: shipmentDoc.id, ...initialShipment, idempotentReplay: true };
    }
    if (initialShipment.transfer?.status !== 'completed' || !initialShipment.driveFolderId) {
      throw new PrintShopHttpError(
        409,
        'transfer_incomplete',
        'Attendi il completamento del trasferimento su Google Drive',
      );
    }
    const labId = input.labId || initialShipment.labId;
    if (!labId) throw new PrintShopHttpError(400, 'lab_required', 'Seleziona un laboratorio');
    const labDoc = await this.deps.db.collection('labs').doc(labId).get();
    if (!labDoc.exists || labDoc.data()?.attivo === false || !labDoc.data()?.email) {
      throw new PrintShopHttpError(404, 'lab_not_found', 'Laboratorio non valido');
    }
    let lab = labDoc.data();
    assertLabDataProcessingAgreement(lab);
    const now = this.now();
    const expiryDays = Math.min(Math.max(Number(initialShipment.expiryDays || 20), 1), 90);
    const policyExpiryMillis = now.toMillis() + expiryDays * 24 * 60 * 60 * 1000;
    const existingExpiryMillis = timestampMillis(initialShipment.expiresAt);
    const expiresAt = Timestamp.fromMillis(
      existingExpiryMillis > 0
        ? Math.min(existingExpiryMillis, policyExpiryMillis)
        : policyExpiryMillis,
    );
    const claimToken = hashId(
      `lab-send:${shipmentId}:${adminEmail}:${now.toMillis()}:${Math.random()}`,
    );
    let claimedOrder: any;
    let claimedShipment: any;
    let replay = false;
    await this.deps.db.runTransaction(async (transaction: any) => {
      const [freshShipment, freshOrder] = await Promise.all([
        transaction.get(shipmentRef),
        transaction.get(orderRef),
      ]);
      if (
        !freshShipment.exists ||
        freshShipment.data()?.sourceType !== 'print_shop' ||
        freshShipment.data()?.orderId !== orderId ||
        !freshOrder.exists ||
        freshOrder.data()?.orderType !== 'print_shop'
      ) {
        throw new PrintShopHttpError(404, 'shipment_not_found', 'Spedizione non trovata');
      }
      claimedOrder = { id: freshOrder.id, ...freshOrder.data() };
      claimedShipment = freshShipment.data();
      const freshLab = await transaction.get(this.deps.db.collection('labs').doc(labId));
      if (!freshLab.exists || freshLab.data()?.attivo === false || !freshLab.data()?.email) {
        throw new PrintShopHttpError(404, 'lab_not_found', 'Laboratorio non valido');
      }
      assertLabDataProcessingAgreement(freshLab.data());
      lab = freshLab.data();
      assertLabOrderAction(claimedOrder, LAB_TRANSFER_STATUSES);
      if (claimedShipment.status === 'inviato' && claimedShipment.sentAt) {
        replay = true;
        return;
      }
      assertLabOrderAction(claimedOrder, LAB_CREATE_STATUSES);
      if (claimedShipment.transfer?.status !== 'completed' || !claimedShipment.driveFolderId) {
        throw new PrintShopHttpError(
          409,
          'transfer_incomplete',
          'Attendi il completamento del trasferimento su Google Drive',
        );
      }
      if (!input.labId && claimedShipment.labId !== labId) {
        throw new PrintShopHttpError(
          409,
          'shipment_changed',
          'Il laboratorio è cambiato: ricarica la spedizione',
        );
      }
      const previousSend = claimedShipment.sendState || {};
      const recentClaim =
        previousSend.status === 'sending' &&
        timestampMillis(previousSend.attemptedAt) > now.toMillis() - 15 * 60 * 1000;
      if (recentClaim) {
        throw new PrintShopHttpError(409, 'send_running', 'Invio al laboratorio già in corso');
      }
      transaction.update(shipmentRef, {
        sendState: {
          status: 'sending',
          claimToken,
          attemptedAt: now,
          attempts: Number(previousSend.attempts || 0) + 1,
        },
        expiresAt,
        updatedAt: now,
      });
    });
    if (replay) {
      return { id: shipmentId, ...claimedShipment, idempotentReplay: true };
    }

    let shareableLink = claimedShipment.shareableLink as string | undefined;
    let activePermissionId = claimedShipment.drivePermissionId as string | undefined;
    try {
      const permissionMatchesLab = Boolean(
        claimedShipment.drivePermissionId &&
        normalizeEmail(claimedShipment.drivePermissionEmail || '') === normalizeEmail(lab.email),
      );
      if (!this.deps.drive?.shareShipmentFolderWithUser || !claimedShipment.driveFolderId) {
        throw new PrintShopHttpError(
          503,
          'drive_share_unavailable',
          'Condivisione sicura della cartella Drive non configurata',
        );
      }
      if (
        claimedShipment.drivePermissionId &&
        !permissionMatchesLab &&
        this.deps.drive.revokeShipmentFolderPermission
      ) {
        await this.deps.drive.revokeShipmentFolderPermission(
          claimedShipment.driveFolderId,
          claimedShipment.drivePermissionId,
        );
      }
      // Esegue sempre l'audit dei permessi: l'helper rimuove eventuali legacy
      // `anyone` e reader di laboratori precedenti anche quando il documento
      // Firestore contiene già un permissionId apparentemente valido.
      const shared = await this.deps.drive.shareShipmentFolderWithUser(
        claimedShipment.driveFolderId,
        lab.email,
      );
      shareableLink = shared.webViewLink;
      activePermissionId = shared.permissionId;
      if (!shareableLink) {
        throw new PrintShopHttpError(502, 'drive_share_failed', 'Google Drive non ha restituito il link');
      }
      await this.deps.db.runTransaction(async (transaction: any) => {
        const current = await transaction.get(shipmentRef);
        if (current.data()?.sendState?.claimToken !== claimToken) {
          throw new PrintShopHttpError(409, 'send_claim_lost', 'Invio già finalizzato da un’altra richiesta');
        }
        transaction.update(shipmentRef, {
          shareableLink,
          drivePermissionId: shared.permissionId,
          drivePermissionEmail: lab.email,
          drivePermissionRevokedAt: FieldValue.delete(),
          expiresAt,
          updatedAt: this.now(),
        });
      });
      const studio = await this.deps.mail.studio();
      const html = createLabEmail({
        labName: lab.nome || 'Laboratorio',
        studio,
        orderNumber: claimedOrder.orderNumber,
        assetCount: referencedAssetIds(claimedOrder).length,
        link: shareableLink,
        expiresAt: expiresAt.toDate(),
      });
      await this.deps.mail.send(
        lab.email,
        `File pronti per la stampa: ${claimedOrder.orderNumber} | ${studio.name}`,
        html,
        {
          type: 'print_shop_lab_shipment',
          relatedDocId: shipmentId,
          relatedDocType: 'labShipment',
          clientName: lab.nome || 'Laboratorio',
        },
      );
    } catch (error: any) {
      if (
        activePermissionId &&
        claimedShipment.driveFolderId &&
        this.deps.drive?.revokeShipmentFolderPermission
      ) {
        await this.deps.drive.revokeShipmentFolderPermission(
          claimedShipment.driveFolderId,
          activePermissionId,
        ).catch(() => undefined);
      }
      await this.deps.db.runTransaction(async (transaction: any) => {
        const current = await transaction.get(shipmentRef);
        if (current.data()?.sendState?.claimToken !== claimToken) return;
        transaction.update(shipmentRef, {
          sendState: {
            ...current.data().sendState,
            status: 'failed',
            failedAt: this.now(),
            lastError: String(error?.message || error).slice(0, 500),
          },
          drivePermissionId: FieldValue.delete(),
          drivePermissionEmail: FieldValue.delete(),
          drivePermissionRevokedAt: this.now(),
          updatedAt: this.now(),
        });
      }).catch(() => undefined);
      throw error;
    }

    await this.deps.db.runTransaction(async (transaction: any) => {
      const [freshShipment, freshOrder] = await Promise.all([
        transaction.get(shipmentRef),
        transaction.get(orderRef),
      ]);
      if (!freshShipment.exists || freshShipment.data()?.sendState?.claimToken !== claimToken) {
        throw new PrintShopHttpError(409, 'send_claim_lost', 'Invio già finalizzato da un’altra richiesta');
      }
      const sentAt = this.now();
      const currentOrder = freshOrder.exists
        ? { id: freshOrder.id, ...freshOrder.data() }
        : undefined;
      const mayAdvanceOrder = Boolean(
        currentOrder && isLabOrderActionAllowed(currentOrder, LAB_CREATE_STATUSES),
      );
      transaction.update(shipmentRef, {
        status: 'inviato',
        sentAt,
        expiresAt,
        labId,
        labNome: lab.nome || 'Laboratorio',
        labEmail: lab.email,
        sentBy: adminEmail,
        sendState: {
          ...freshShipment.data().sendState,
          status: 'sent',
          sentAt,
          ...(mayAdvanceOrder ? {} : { orderAdvanceSkipped: true }),
        },
        updatedAt: sentAt,
      });
      if (mayAdvanceOrder) {
        transaction.update(orderRef, {
          fulfillment: {
            ...currentOrder.fulfillment,
            status: 'sent_to_laboratory',
            laboratory: {
              ...(currentOrder.fulfillment?.laboratory || {}),
              laboratoryId: labId,
              laboratoryName: lab.nome || 'Laboratorio',
              labShipmentId: shipmentId,
              transferMethod: 'email',
              sentAt,
            },
          },
          stato: 'in_lavorazione',
          updatedAt: sentAt,
        });
      }
    });
    const updated = await shipmentRef.get();
    return { id: updated.id, ...updated.data(), idempotentReplay: false };
  }

  async setLabShipmentCost(
    orderId: string,
    shipmentId: string,
    importo: number,
    adminEmail: string,
  ): Promise<{ shipment: any; order: any }> {
    if (!Number.isFinite(importo) || importo < 0 || importo > 1_000_000) {
      throw new PrintShopHttpError(400, 'invalid_cost', 'Costo laboratorio non valido');
    }
    const cents = Math.round((importo + Number.EPSILON) * 100);
    if (Math.abs(importo * 100 - cents) > 0.00001) {
      throw new PrintShopHttpError(400, 'invalid_cost', 'Usa al massimo due decimali');
    }
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    const shipmentRef = this.deps.db.collection('labShipments').doc(shipmentId);
    const now = this.now();
    await this.deps.db.runTransaction(async (transaction: any) => {
      const [orderDoc, shipmentDoc] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(shipmentRef),
      ]);
      if (!orderDoc.exists || orderDoc.data()?.orderType !== 'print_shop') {
        throw new PrintShopHttpError(404, 'order_not_found', 'Ordine non trovato');
      }
      if (
        !shipmentDoc.exists ||
        shipmentDoc.data()?.sourceType !== 'print_shop' ||
        shipmentDoc.data()?.orderId !== orderId
      ) {
        throw new PrintShopHttpError(404, 'shipment_not_found', 'Spedizione non trovata');
      }
      const order = orderDoc.data();
      const existingCosts = Array.isArray(order.printShop?.supplierCosts)
        ? order.printShop.supplierCosts
        : [];
      const supplierCosts = [
        ...existingCosts.filter((cost: any) => cost.labShipmentId !== shipmentId),
        {
          labShipmentId: shipmentId,
          labId: shipmentDoc.data()?.labId,
          labName: shipmentDoc.data()?.labNome,
          amountCents: cents,
          updatedAt: now,
          updatedBy: adminEmail,
        },
      ];
      const totalSupplierCostCents = supplierCosts.reduce(
        (total: number, cost: any) => total + Number(cost.amountCents || 0),
        0,
      );
      transaction.update(shipmentRef, {
        costoImporto: importo,
        costoImportoCents: cents,
        costoUpdatedAt: now,
        costoUpdatedBy: adminEmail,
        updatedAt: now,
      });
      transaction.update(orderRef, {
        'printShop.supplierCosts': supplierCosts,
        'printShop.totalSupplierCostCents': totalSupplierCostCents,
        'printShop.estimatedMarginCents':
          Number(order.totals?.totalCents || 0) - totalSupplierCostCents,
        updatedAt: now,
      });
    });
    const [shipment, order] = await Promise.all([shipmentRef.get(), orderRef.get()]);
    return {
      shipment: { id: shipment.id, ...shipment.data() },
      order: { id: order.id, ...order.data() },
    };
  }

  async purgeExpiredAssets(options: { dryRun?: boolean } = {}): Promise<{
    eligible: number;
    purged: number;
    preparedPurged: number;
    failed: Array<{ orderId: string; error: string }>;
    dryRun: boolean;
  }> {
    const dryRun = options.dryRun === true;
    if (!dryRun) {
      await this.retryPendingGcsLifecycle(5).catch(error => {
        console.error('⚠️ [PrintShop] retry lifecycle GCS fallito:', error);
      });
    }
    const snapshot = await this.deps.db
      .collection('orders')
      .where('orderType', '==', 'print_shop')
      .get();
    const nowMillis = this.now().toMillis();
    const eligible = snapshot.docs.filter((doc: any) =>
      isOrderEligibleForRetentionPurge(doc.data(), nowMillis),
    );
    const failed: Array<{ orderId: string; error: string }> = [];
    let purged = 0;
    for (const orderDoc of eligible) {
      if (dryRun) continue;
      const claimToken = hashId(
        `retention:${orderDoc.id}:${nowMillis}:${Math.random()}`,
      );
      let claimed = false;
      try {
        await this.deps.db.runTransaction(async (transaction: any) => {
          const fresh = await transaction.get(orderDoc.ref);
          if (!fresh.exists || fresh.data()?.orderType !== 'print_shop') return;
          const order = fresh.data();
          if (!isOrderEligibleForRetentionPurge(order, nowMillis)) return;
          transaction.update(orderDoc.ref, {
            retention: {
              ...order.retention,
              status: 'purging',
              purgeClaimToken: claimToken,
              purgeClaimedAt: this.now(),
            },
            updatedAt: this.now(),
          });
          claimed = true;
        });
        if (!claimed) continue;
        const assetsSnapshot = await orderDoc.ref.collection('assets').get();
        const purgedAt = this.now();
        for (const assetDoc of assetsSnapshot.docs) {
          const asset = assetDoc.data();
          if (asset.assetsPurgedAt || asset.status === 'purged') continue;
          if (asset.storagePath) {
            await this.deps.storage
              .bucket()
              .file(asset.storagePath)
              .delete({ ignoreNotFound: true });
          }
          await assetDoc.ref.update({
            status: 'purged',
            assetsPurgedAt: purgedAt,
            finalizeClaimToken: FieldValue.delete(),
            finalizeClaimedAt: FieldValue.delete(),
            updatedAt: purgedAt,
          });
        }
        await this.deps.db.runTransaction(async (transaction: any) => {
          const fresh = await transaction.get(orderDoc.ref);
          if (fresh.data()?.retention?.purgeClaimToken !== claimToken) return;
          const freshOrder = fresh.data();
          const terminalPaymentStatuses = new Set([
            'paid',
            'paid_action_required',
            'refunded',
            'partially_refunded',
          ]);
          const expireUnpaidDraft =
            !terminalPaymentStatuses.has(freshOrder.payment?.status) &&
            MODIFIABLE_STATUSES.has(freshOrder.fulfillment?.status || 'draft');
          transaction.update(orderDoc.ref, {
            retention: {
              ...freshOrder.retention,
              ...(freshOrder.retention?.gcsLifecycle
                ? {
                    gcsLifecycle: {
                      ...freshOrder.retention.gcsLifecycle,
                      status: 'purged',
                      purgedAt,
                    },
                  }
                : {}),
              status: 'purged',
              assetsPurgedAt: purgedAt,
              purgeClaimToken: FieldValue.delete(),
              purgeClaimedAt: FieldValue.delete(),
            },
            'printShop.uploadQuota': {
              assetCount: 0,
              totalDeclaredBytes: 0,
              readyCount: 0,
              finalizingCount: 0,
            },
            ...(expireUnpaidDraft
              ? {
                  payment: {
                    ...freshOrder.payment,
                    status: 'expired',
                    expiredAt: purgedAt,
                  },
                  fulfillment: {
                    ...freshOrder.fulfillment,
                    status: 'cancelled',
                    cancelledAt: purgedAt,
                    cancellationReason: 'asset_retention_expired',
                  },
                  stato: 'annullato',
                }
              : {}),
            updatedAt: purgedAt,
          });
        });
        purged++;
      } catch (error: any) {
        failed.push({ orderId: orderDoc.id, error: String(error?.message || error).slice(0, 500) });
        await this.deps.db.runTransaction(async (transaction: any) => {
          const fresh = await transaction.get(orderDoc.ref);
          if (fresh.data()?.retention?.purgeClaimToken !== claimToken) return;
          transaction.update(orderDoc.ref, {
            'retention.status': 'failed',
            'retention.purgeClaimToken': FieldValue.delete(),
            'retention.purgeClaimedAt': FieldValue.delete(),
            'retention.lastError': String(error?.message || error).slice(0, 500),
            'retention.lastAttemptAt': this.now(),
            updatedAt: this.now(),
          });
        }).catch(() => undefined);
      }
    }
    let preparedPurged = 0;
    try {
      const preparedSnapshot = await this.deps.db
        .collectionGroup('assets')
        .where('expiresAt', '<=', this.now())
        .get();
      for (const assetDoc of preparedSnapshot.docs) {
        const asset = assetDoc.data();
        const staleFinalization =
          asset.status === 'finalizing' &&
          timestampMillis(asset.finalizeClaimedAt) <= nowMillis - 30 * 60 * 1000;
        if ((asset.status !== 'prepared' && !staleFinalization) || asset.assetsPurgedAt) continue;
        if (dryRun) {
          preparedPurged++;
          continue;
        }
        const claimToken = hashId(
          `prepared-retention:${assetDoc.ref.path}:${nowMillis}:${Math.random()}`,
        );
        let claimed = false;
        try {
          const orderRef = asset.orderId
            ? this.deps.db.collection('orders').doc(asset.orderId)
            : undefined;
          await this.deps.db.runTransaction(async (transaction: any) => {
            const freshAsset = await transaction.get(assetDoc.ref);
            const orderDoc = orderRef ? await transaction.get(orderRef) : undefined;
            if (!freshAsset.exists) return;
            const current = freshAsset.data();
            const currentStaleFinalization =
              current.status === 'finalizing' &&
              timestampMillis(current.finalizeClaimedAt) <= nowMillis - 30 * 60 * 1000;
            if (
              (current.status !== 'prepared' && !currentStaleFinalization) ||
              timestampMillis(current.expiresAt) > nowMillis ||
              current.assetsPurgedAt
            ) {
              return;
            }
            transaction.update(assetDoc.ref, {
              status: 'purging',
              purgeClaimToken: claimToken,
              purgeClaimedAt: this.now(),
              updatedAt: this.now(),
            });
            if (orderDoc?.exists) {
              const quota = orderDoc.data()?.printShop?.uploadQuota;
              if (Number.isSafeInteger(quota?.assetCount)) {
                transaction.update(orderRef, {
                  'printShop.uploadQuota.assetCount': Math.max(0, quota.assetCount - 1),
                  'printShop.uploadQuota.totalDeclaredBytes': Math.max(
                    0,
                    Number(quota.totalDeclaredBytes || 0) -
                      Number(current.declaredSizeBytes || current.sizeBytes || 0),
                  ),
                  'printShop.uploadQuota.finalizingCount': Math.max(
                    0,
                    Number(quota.finalizingCount || 0) -
                      (current.status === 'finalizing' ? 1 : 0),
                  ),
                  updatedAt: this.now(),
                });
              }
            }
            claimed = true;
          });
          if (!claimed) continue;
          if (asset.storagePath) {
            await this.deps.storage
              .bucket()
              .file(asset.storagePath)
              .delete({ ignoreNotFound: true });
          }
          const purgedAt = this.now();
          await this.deps.db.runTransaction(async (transaction: any) => {
            const fresh = await transaction.get(assetDoc.ref);
            if (fresh.data()?.purgeClaimToken !== claimToken) return;
            transaction.update(assetDoc.ref, {
              status: 'purged',
              assetsPurgedAt: purgedAt,
              purgeReason: 'prepared_upload_expired',
              purgeClaimToken: FieldValue.delete(),
              purgeClaimedAt: FieldValue.delete(),
              finalizeClaimToken: FieldValue.delete(),
              finalizeClaimedAt: FieldValue.delete(),
              updatedAt: purgedAt,
            });
          });
          preparedPurged++;
        } catch (error: any) {
          failed.push({
            orderId: asset.orderId || assetDoc.id,
            error: String(error?.message || error).slice(0, 500),
          });
          await this.deps.db.runTransaction(async (transaction: any) => {
            const fresh = await transaction.get(assetDoc.ref);
            if (fresh.data()?.purgeClaimToken !== claimToken) return;
            transaction.update(assetDoc.ref, {
              status: 'prepared',
              purgeClaimToken: FieldValue.delete(),
              purgeClaimedAt: FieldValue.delete(),
              purgeLastError: String(error?.message || error).slice(0, 500),
              updatedAt: this.now(),
            });
          }).catch(() => undefined);
        }
      }
    } catch (error: any) {
      // Un adapter Firestore privo di collectionGroup non deve impedire il
      // cleanup degli ordini; in produzione Admin SDK lo supporta sempre.
      if (typeof this.deps.db.collectionGroup === 'function') {
        failed.push({ orderId: 'prepared-assets', error: String(error?.message || error).slice(0, 500) });
      }
    }
    return { eligible: eligible.length, purged, preparedPurged, failed, dryRun };
  }

  async retryPendingGcsLifecycle(limit = 5): Promise<{ attempted: number }> {
    const snapshot = await this.deps.db
      .collection('orders')
      .where('orderType', '==', 'print_shop')
      .get();
    const pending = snapshot.docs
      .filter((doc: any) =>
        doc.data()?.fulfillment?.status === 'delivered' &&
        doc.data()?.retention?.status !== 'purged' &&
        doc.data()?.retention?.gcsLifecycle?.status !== 'armed',
      )
      .slice(0, Math.max(1, Math.min(limit, 25)));
    for (const doc of pending) {
      const deliveredAt = doc.data()?.fulfillment?.deliveredAt;
      if (!deliveredAt) continue;
      await this.armGcsLifecycleForDeliveredOrder(doc.id, deliveredAt).catch(() => undefined);
    }
    return { attempted: pending.length };
  }

  private async requireOwnerOrder(
    identity: PrintShopIdentity,
    orderId: string,
  ): Promise<any> {
    const order = await this.requirePrintOrder(orderId);
    if (order.ownerUid !== identity.uid) {
      // Non rivelare l'esistenza dell'ordine di un altro cliente.
      throw new PrintShopHttpError(404, 'order_not_found', 'Ordine non trovato');
    }
    return order;
  }

  private idempotency(
    uid: string,
    scope: string,
    key: string | undefined,
    payload: unknown,
    resourceType: 'order' | 'asset',
  ):
    | {
        ref: any;
        scope: string;
        keyHash: string;
        payloadHash: string;
        resourceId: string;
      }
    | undefined {
    if (!key) return undefined;
    const normalized = key.trim();
    if (!/^[a-z0-9._:-]{8,200}$/i.test(normalized)) {
      throw new PrintShopHttpError(
        400,
        'invalid_idempotency_key',
        'Idempotency-Key non valida',
      );
    }
    const keyHash = hashId(normalized);
    const markerId = hashId(`${uid}:${scope}:${normalized}`);
    return {
      ref: this.deps.db.collection('printShopIdempotency').doc(markerId),
      scope,
      keyHash,
      payloadHash: createHash('sha256').update(stableStringify(payload)).digest('hex'),
      resourceId: `${resourceType === 'order' ? 'ps' : 'pa'}_${markerId.slice(0, 28)}`,
    };
  }

  private async assertLiveRetentionConfigured(): Promise<void> {
    if (this.deps.paypal.config.environment !== 'live') return;
    const status = await this.checkGcsLifecycleConfiguration();
    if (!status.configured) {
      throw new PrintShopHttpError(
        503,
        'retention_lifecycle_not_configured',
        'Checkout live sospeso: configura e verifica la retention automatica degli originali',
      );
    }
  }

  private async loadSellerSnapshot(): Promise<PrintShopSellerSnapshot> {
    const doc = await this.deps.db.collection('settings').doc('studio').get();
    const data = doc.exists ? doc.data() : undefined;
    const snapshot: PrintShopSellerSnapshot = {
      name: cleanText(data?.name || data?.ragioneSociale, 200) || '',
      email: normalizeEmail(cleanText(data?.email, 254) || ''),
      phone: cleanText(data?.phone || data?.telefono, 60) || '',
      fiscalAddress: {
        street: cleanText(data?.fiscalVia || data?.address, 240) || '',
        postalCode: cleanText(data?.fiscalCap, 20) || '',
        city: cleanText(data?.fiscalComune, 120) || '',
        province: (cleanText(data?.fiscalProvincia, 10) || '').toUpperCase(),
        country: 'IT',
      },
      vatNumber: cleanText(data?.partitaIVA || data?.partitaIva, 40) || '',
      fiscalCode: cleanText(data?.codiceFiscale, 40) || '',
    };
    const address = snapshot.fiscalAddress;
    if (
      !snapshot.name ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(snapshot.email) ||
      !snapshot.phone ||
      !address.street ||
      !address.postalCode ||
      !address.city ||
      !address.province ||
      (!snapshot.vatNumber && !snapshot.fiscalCode)
    ) {
      throw new PrintShopHttpError(
        503,
        'seller_settings_incomplete',
        'Completa i dati fiscali e di contatto dello studio prima di attivare il checkout',
      );
    }
    return snapshot;
  }

  private async checkGcsLifecycleConfiguration(
    force = false,
  ): Promise<{ configured: boolean; bucket?: string }> {
    const checkedAt = Date.now();
    if (
      !force &&
      this.lifecycleCheckCache &&
      this.lifecycleCheckCache.checkedAt > checkedAt - 10 * 60_000
    ) {
      return {
        configured: this.lifecycleCheckCache.configured,
        ...(this.lifecycleCheckCache.bucket ? { bucket: this.lifecycleCheckCache.bucket } : {}),
      };
    }
    try {
      const bucket = this.deps.storage.bucket();
      const [metadata] = await bucket.getMetadata();
      const rules = Array.isArray(metadata.lifecycle?.rule) ? metadata.lifecycle.rule : [];
      const configured = rules.some((rule: any) =>
        rule?.action?.type === 'Delete' &&
        Number(rule?.condition?.daysSinceCustomTime) === this.retentionDays &&
        Array.isArray(rule?.condition?.matchesPrefix) &&
        rule.condition.matchesPrefix.includes('print-orders/'),
      );
      this.lifecycleCheckCache = {
        configured,
        checkedAt,
        ...(bucket.name ? { bucket: bucket.name } : {}),
      };
      return { configured, ...(bucket.name ? { bucket: bucket.name } : {}) };
    } catch {
      this.lifecycleCheckCache = { configured: false, checkedAt };
      return { configured: false };
    }
  }

  private draftRetention(now: Timestamp) {
    return {
      status: 'scheduled',
      reason: 'draft',
      assetRetentionDays: this.draftRetentionDays,
      deleteAfter: Timestamp.fromMillis(
        now.toMillis() + this.draftRetentionDays * 24 * 60 * 60 * 1000,
      ),
    };
  }

  private cancelledRetention(now: Timestamp, reason: 'cancelled' | 'refunded') {
    return {
      status: 'scheduled',
      reason,
      assetRetentionDays: this.cancelledRetentionDays,
      deleteAfter: Timestamp.fromMillis(
        now.toMillis() + this.cancelledRetentionDays * 24 * 60 * 60 * 1000,
      ),
    };
  }

  private async releaseFinalizeClaim(
    orderRef: any,
    assetRef: any,
    claimToken: string,
    error: unknown,
  ): Promise<void> {
    await this.deps.db.runTransaction(async (transaction: any) => {
      const [orderDoc, assetDoc] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(assetRef),
      ]);
      if (!assetDoc.exists || assetDoc.data()?.finalizeClaimToken !== claimToken) return;
      const now = this.now();
      transaction.update(assetRef, {
        status: 'prepared',
        finalizeClaimToken: FieldValue.delete(),
        finalizeClaimedAt: FieldValue.delete(),
        finalizeLastError: String((error as any)?.message || error).slice(0, 500),
        updatedAt: now,
      });
      if (orderDoc.exists) {
        const quota = orderDoc.data()?.printShop?.uploadQuota || {};
        transaction.update(orderRef, {
          'printShop.uploadQuota.finalizingCount': Math.max(
            0,
            Number(quota.finalizingCount || 1) - 1,
          ),
          updatedAt: now,
        });
      }
    }).catch(() => undefined);
  }

  private async releaseCaptureClaim(
    orderRef: any,
    claimToken: string,
    error: unknown,
  ): Promise<void> {
    await this.deps.db.runTransaction(async (transaction: any) => {
      const orderDoc = await transaction.get(orderRef);
      if (
        !orderDoc.exists ||
        orderDoc.data()?.payment?.captureClaimToken !== claimToken ||
        orderDoc.data()?.payment?.status === 'paid'
      ) {
        return;
      }
      const now = this.now();
      const order = orderDoc.data();
      const {
        captureClaimToken: _claimToken,
        captureClaimedAt: _claimedAt,
        ...payment
      } = order.payment || {};
      transaction.update(orderRef, {
        payment: {
          ...payment,
          captureStatus: 'retryable',
          captureFailedAt: now,
          captureLastError: String((error as any)?.message || error).slice(0, 500),
        },
        retention: {
          ...(order.retention || {}),
          status: 'scheduled',
          deleteAfter: Timestamp.fromMillis(
            Math.max(
              timestampMillis(order.retention?.deleteAfter),
              now.toMillis() + 24 * 60 * 60 * 1000,
            ),
          ),
        },
        updatedAt: now,
      });
    }).catch(() => undefined);
  }

  private async cleanupTerminalLabShipments(orderId: string): Promise<void> {
    const snapshot = await this.deps.db
      .collection('labShipments')
      .where('orderId', '==', orderId)
      .get();
    for (const shipmentDoc of snapshot.docs) {
      const shipment = shipmentDoc.data();
      if (shipment.sourceType !== 'print_shop' || shipment.status === 'scaduto') continue;
      const now = this.now();
      await shipmentDoc.ref.update({ expiresAt: now, updatedAt: now });
      if (!shipment.driveFolderId || !this.deps.drive?.deleteDriveFile) continue;
      try {
        if (
          shipment.drivePermissionId &&
          !shipment.drivePermissionRevokedAt &&
          this.deps.drive.revokeShipmentFolderPermission
        ) {
          await this.deps.drive.revokeShipmentFolderPermission(
            shipment.driveFolderId,
            shipment.drivePermissionId,
          );
          await shipmentDoc.ref.update({
            drivePermissionRevokedAt: this.now(),
            updatedAt: this.now(),
          });
        }
        await this.deps.drive.deleteDriveFile(shipment.driveFolderId);
        await shipmentDoc.ref.update({
          status: 'scaduto',
          deletedFromDrive: true,
          terminalCleanupAt: this.now(),
          updatedAt: this.now(),
        });
      } catch (error: any) {
        await shipmentDoc.ref.update({
          expiresAt: this.now(),
          terminalCleanupLastError: String(error?.message || error).slice(0, 500),
          updatedAt: this.now(),
        });
      }
    }
  }

  private async ensureUploadQuota(orderId: string, ownerUid: string): Promise<void> {
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (Number.isSafeInteger(orderDoc.data()?.printShop?.uploadQuota?.assetCount)) return;
    const assetsSnapshot = await orderRef.collection('assets').get();
    const computed = assetsSnapshot.docs.reduce(
      (
        quota: {
          assetCount: number;
          totalDeclaredBytes: number;
          readyCount: number;
          finalizingCount: number;
        },
        doc: any,
      ) => {
        const asset = doc.data();
        if (asset.status === 'purged') return quota;
        quota.assetCount++;
        quota.totalDeclaredBytes += Number(asset.declaredSizeBytes || asset.sizeBytes || 0);
        if (asset.status === 'ready') quota.readyCount++;
        if (asset.status === 'finalizing') quota.finalizingCount++;
        return quota;
      },
      { assetCount: 0, totalDeclaredBytes: 0, readyCount: 0, finalizingCount: 0 },
    );
    await this.deps.db.runTransaction(async (transaction: any) => {
      const fresh = await transaction.get(orderRef);
      if (!fresh.exists || fresh.data()?.ownerUid !== ownerUid) {
        throw new PrintShopHttpError(404, 'order_not_found', 'Ordine non trovato');
      }
      if (Number.isSafeInteger(fresh.data()?.printShop?.uploadQuota?.assetCount)) return;
      transaction.update(orderRef, {
        'printShop.uploadQuota': {
          ...computed,
          version: 1,
          backfilledAt: this.now(),
        },
        updatedAt: this.now(),
      });
    });
  }

  private async requirePrintOrder(orderId: string): Promise<any> {
    assertDocumentId(orderId, 'orderId');
    const doc = await this.deps.db.collection('orders').doc(orderId).get();
    if (!doc.exists || doc.data()?.orderType !== 'print_shop') {
      throw new PrintShopHttpError(404, 'order_not_found', 'Ordine non trovato');
    }
    return { id: doc.id, ...doc.data() };
  }

  private async listAssets(orderId: string): Promise<any[]> {
    const snapshot = await this.deps.db
      .collection('orders')
      .doc(orderId)
      .collection('assets')
      .get();
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
  }

  private async requireReadyAssets(
    orderId: string,
    items: readonly PrintOrderItemSnapshot[],
  ): Promise<Map<string, any>> {
    const assetIds = new Set(
      items.flatMap(item => item.assignments.map(assignment => assignment.assetId)),
    );
    const assetsById = new Map<string, any>();
    for (const assetId of assetIds) {
      assertDocumentId(assetId, 'assetId');
      const doc = await this.deps.db
        .collection('orders')
        .doc(orderId)
        .collection('assets')
        .doc(assetId)
        .get();
      if (!doc.exists || doc.data()?.status !== 'ready') {
        throw new PrintShopHttpError(
          409,
          'asset_not_ready',
          'Completa il caricamento di tutte le fotografie prima del riepilogo',
          { assetId },
        );
      }
      assetsById.set(assetId, { id: doc.id, ref: doc.ref, ...doc.data() });
    }
    for (const item of items) {
      if (item.pricingModel !== 'package') continue;
      const hashes = new Set<string>();
      const visualFingerprints: Array<{
        assetId: string;
        hash: string;
        color: { r: number; g: number; b: number };
      }> = [];
      for (const assignment of item.assignments) {
        const asset = assetsById.get(assignment.assetId);
        const hash = asset?.sha256;
        if (typeof hash !== 'string' || !hash) {
          throw new PrintShopHttpError(
            409,
            'asset_not_ready',
            'Una fotografia non è stata verificata correttamente',
            { assetId: assignment.assetId },
          );
        }
        if (hashes.has(hash)) {
          throw new PrintShopHttpError(
            400,
            'duplicate_photo_content',
            'Le 50 fotografie Polaroid devono essere tutte diverse, anche se hanno nomi differenti',
            { assetId: assignment.assetId },
          );
        }
        hashes.add(hash);
        if (
          typeof asset?.perceptualHash !== 'string' ||
          !/^[a-f0-9]{16}$/i.test(asset.perceptualHash) ||
          !Number.isFinite(asset?.perceptualColor?.r) ||
          !Number.isFinite(asset?.perceptualColor?.g) ||
          !Number.isFinite(asset?.perceptualColor?.b)
        ) {
          throw new PrintShopHttpError(
            409,
            'asset_not_ready',
            'Una fotografia non dispone della verifica visiva richiesta',
            { assetId: assignment.assetId },
          );
        }
        const duplicateVisual = visualFingerprints.find(candidate =>
          perceptualHammingDistance(candidate.hash, asset.perceptualHash) <= 6 &&
          colorDistance(candidate.color, asset.perceptualColor) <= 45,
        );
        if (duplicateVisual) {
          throw new PrintShopHttpError(
            400,
            'duplicate_photo_content',
            'Le 50 fotografie Polaroid devono essere visivamente tutte diverse',
            { assetId: assignment.assetId, duplicateOf: duplicateVisual.assetId },
          );
        }
        visualFingerprints.push({
          assetId: assignment.assetId,
          hash: asset.perceptualHash,
          color: asset.perceptualColor,
        });
      }
    }
    return assetsById;
  }

  private async loadCatalog(): Promise<PrintShopCatalogProduct[]> {
    let snapshot: any;
    try {
      snapshot = await this.deps.db
        .collection('products')
        .where('attivo', '==', true)
        .get();
    } catch (error: any) {
      throw new PrintShopHttpError(
        503,
        'catalog_unavailable',
        'Catalogo temporaneamente non disponibile',
        String(error?.message || error),
      );
    }
    const candidates = snapshot.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .filter((product: any) =>
        Array.isArray(product.salesChannels) &&
        product.salesChannels.includes('print_shop'),
      );
    if (candidates.length === 0) {
      throw new PrintShopHttpError(
        503,
        'catalog_not_seeded',
        'Il catalogo stampe non è ancora disponibile',
      );
    }
    const invalid = candidates.find((product: any) => !isCatalogProduct(product));
    if (invalid) {
      throw new PrintShopHttpError(
        503,
        'catalog_invalid',
        `Il prodotto ${cleanText(invalid.sku || invalid.id, 100) || 'senza SKU'} ha una configurazione non valida`,
      );
    }
    const catalog = candidates as PrintShopCatalogProduct[];
    const normalizedSkus = catalog.map(product => product.sku.trim().toUpperCase());
    if (new Set(normalizedSkus).size !== normalizedSkus.length) {
      throw new PrintShopHttpError(503, 'catalog_invalid', 'Il catalogo contiene SKU duplicati');
    }
    return catalog.sort((a, b) => a.displayOrder - b.displayOrder);
  }
}

export function extractCompletedCapture(
  response: PayPalOrderResponse,
): CompletedCapture | null {
  for (const unit of response.purchase_units || []) {
    for (const capture of unit.payments?.captures || []) {
      const amountCents = paypalValueToCents(capture.amount?.value);
      if (
        typeof capture.id !== 'string' ||
        String(capture.status || '').toUpperCase() !== 'COMPLETED' ||
        amountCents === null
      ) {
        continue;
      }
      return {
        captureId: capture.id,
        paypalOrderId: response.id,
        amountCents,
        currency: String(capture.amount?.currency_code || ''),
        status: String(capture.status),
        customId: cleanText(unit.custom_id, 200),
        invoiceId: cleanText(unit.invoice_id, 200),
        merchantId: cleanText(unit.payee?.merchant_id || capture.payee?.merchant_id, 200),
        payerEmail: cleanText(response.payer?.email_address, 254),
        raw: response,
      };
    }
  }
  return null;
}

function captureFromWebhook(event: any): CompletedCapture | null {
  const resource = event?.resource || {};
  const amountCents = paypalValueToCents(resource.amount?.value);
  const captureId = cleanText(resource.id, 200);
  const paypalOrderId = cleanText(
    resource.supplementary_data?.related_ids?.order_id,
    200,
  );
  if (!captureId || !paypalOrderId || amountCents === null) return null;
  return {
    captureId,
    paypalOrderId,
    amountCents,
    currency: String(resource.amount?.currency_code || ''),
    status: String(resource.status || ''),
    customId: cleanText(resource.custom_id, 200),
    invoiceId: cleanText(resource.invoice_id, 200),
    merchantId: cleanText(resource.payee?.merchant_id, 200),
    payerEmail: cleanText(resource.payer?.email_address, 254),
    raw: event,
  };
}

function validateCaptureAgainstOrder(
  orderId: string,
  order: any,
  capture: CompletedCapture,
  expectedMerchantId?: string,
): void {
  if (
    capture.status.toUpperCase() !== 'COMPLETED' ||
    capture.paypalOrderId !== order.payment?.paypalOrderId ||
    capture.amountCents !== Number(order.totals?.totalCents) ||
    capture.currency !== PRINT_SHOP_CURRENCY ||
    (capture.customId && capture.customId !== orderId) ||
    (capture.invoiceId &&
      capture.invoiceId !== (order.payment?.invoiceId || order.orderNumber)) ||
    (expectedMerchantId && capture.merchantId !== expectedMerchantId)
  ) {
    throw new PrintShopHttpError(
      409,
      'paypal_capture_mismatch',
      'Il pagamento PayPal non corrisponde all’ordine',
    );
  }
}

function mapPayPalError(error: unknown): PrintShopHttpError {
  if (error instanceof PrintShopHttpError) return error;
  if (error instanceof PayPalConfigurationError) {
    return new PrintShopHttpError(503, 'paypal_not_configured', error.message);
  }
  if (error instanceof PayPalApiError) {
    return new PrintShopHttpError(
      error.status >= 400 && error.status < 500 ? 409 : 502,
      'paypal_error',
      'PayPal non ha completato l’operazione',
      error.details,
    );
  }
  return new PrintShopHttpError(502, 'paypal_error', 'PayPal temporaneamente non disponibile');
}

function createOrderNumber(id: string, date: Date): string {
  const year = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    timeZone: 'Europe/Rome',
  }).format(date);
  return `ST-${year}-${id.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()}`;
}

function quoteFingerprint(quote: PrintShopQuote): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        currency: quote.currency,
        catalogVersion: quote.catalogVersion,
        totals: quote.totals,
        items: quote.items,
      }),
    )
    .digest('hex');
}

function assertIdempotencyMatch(marker: any, payloadHash: string): void {
  if (marker?.payloadHash !== payloadHash) {
    throw new PrintShopHttpError(
      409,
      'idempotency_payload_mismatch',
      'La stessa Idempotency-Key è già stata usata con dati diversi',
    );
  }
  if (marker?.status !== 'completed') {
    throw new PrintShopHttpError(
      409,
      'idempotency_incomplete',
      'La richiesta precedente è ancora in elaborazione',
    );
  }
}

export function printShopLegalManifestHash(
  manifest: PrintShopLegalManifest | Record<string, unknown> = PRINT_SHOP_LEGAL_MANIFEST,
): string {
  return createHash('sha256').update(stableStringify(manifest)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function compatibilityProducts(items: readonly PrintOrderItemSnapshot[]): any[] {
  return items.map(item => {
    const isPackage = item.pricingModel === 'package';
    return {
      prodottoId: item.productId,
      prodottoNome: `${item.productName} - ${item.finish === 'glossy' ? 'Lucida' : 'Opaca'}`,
      prodottoPrezzo: centsToEuros(
        isPackage ? item.packagePriceCents || item.lineTotalCents : item.unitPriceCents || 0,
      ),
      prodottoNumeroFoto: item.assetCount,
      quantita: isPackage ? 1 : item.copyCount,
      sku: item.sku,
      printFinish: item.finish,
      printFitMode: item.fitMode,
      lineTotalCents: item.lineTotalCents,
    };
  });
}

function calculateQualityWarnings(
  items: readonly PrintOrderItemSnapshot[],
  assets: Map<string, any>,
  catalog: readonly PrintShopCatalogProduct[],
) {
  const warnings: Array<{
    assetId: string;
    sku: string;
    effectiveDpi: number;
    warningBelowDpi: number;
    targetDpi: number;
  }> = [];
  for (const item of items) {
    const product = catalog.find(candidate => candidate.sku === item.sku);
    if (!product) continue;
    const printLongInches = Math.max(item.widthMm, item.heightMm) / 25.4;
    const printShortInches = Math.min(item.widthMm, item.heightMm) / 25.4;
    for (const assignment of item.assignments) {
      const asset = assets.get(assignment.assetId);
      const pixelLong = Math.max(Number(asset?.widthPx || 0), Number(asset?.heightPx || 0));
      const pixelShort = Math.min(Number(asset?.widthPx || 0), Number(asset?.heightPx || 0));
      if (!pixelLong || !pixelShort || !printLongInches || !printShortInches) continue;
      const longDpi = pixelLong / printLongInches;
      const shortDpi = pixelShort / printShortInches;
      // "cover" riempie e ritaglia: conta l'asse limitante. "border" adatta
      // l'intera immagine: conta l'asse che determina la scala di adattamento.
      const effectiveDpi = Math.round(
        item.fitMode === 'cover' ? Math.min(longDpi, shortDpi) : Math.max(longDpi, shortDpi),
      );
      const warningBelowDpi = product.printSpec.qualityWarningDpi;
      if (effectiveDpi < warningBelowDpi) {
        warnings.push({
          assetId: assignment.assetId,
          sku: item.sku,
          effectiveDpi,
          warningBelowDpi,
          targetDpi: product.printSpec.qualityTargetDpi,
        });
      }
    }
  }
  return warnings;
}

function compatibilityStatus(status: PrintShopFulfillmentStatus): string {
  if (status === 'draft' || status === 'awaiting_payment') return 'bozza';
  if (status === 'delivered') return 'completato';
  if (status === 'cancelled') return 'annullato';
  return 'in_lavorazione';
}

function assertModifiable(
  order: any,
  nowMillis = Date.now(),
  options: { allowPendingPaypal?: boolean } = {},
): void {
  const retentionStatus = order.retention?.status;
  const retentionExpired =
    timestampMillis(order.retention?.deleteAfter) > 0 &&
    timestampMillis(order.retention?.deleteAfter) <= nowMillis;
  const pendingPaypalLocked = Boolean(
    !options.allowPendingPaypal &&
    order.payment?.status === 'pending' &&
    order.payment?.paypalOrderId,
  );
  if (
    order.payment?.status === 'paid' ||
    !MODIFIABLE_STATUSES.has(order.fulfillment?.status || 'draft') ||
    pendingPaypalLocked ||
    retentionExpired ||
    retentionStatus === 'purging' ||
    retentionStatus === 'purged' ||
    retentionStatus === 'failed' ||
    retentionStatus === 'capture_in_progress'
  ) {
    throw new PrintShopHttpError(
      409,
      'order_locked',
      'L’ordine non può più essere modificato',
    );
  }
}

function referencedAssetIds(order: any): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of (order.printShop?.items || []) as PrintOrderItemSnapshot[]) {
    for (const assignment of item.assignments || []) {
      const assetId = cleanText(assignment.assetId, 200);
      if (assetId && !seen.has(assetId)) {
        seen.add(assetId);
        result.push(assetId);
      }
    }
  }
  return result;
}

function isLabOrderActionAllowed(
  order: any,
  statuses: ReadonlySet<PrintShopFulfillmentStatus>,
): boolean {
  return (
    order?.payment?.status === 'paid' &&
    statuses.has(order?.fulfillment?.status as PrintShopFulfillmentStatus)
  );
}

function assertLabOrderAction(
  order: any,
  statuses: ReadonlySet<PrintShopFulfillmentStatus>,
): void {
  if (order?.payment?.status !== 'paid') {
    throw new PrintShopHttpError(
      409,
      'payment_required',
      'Il pagamento anticipato non risulta acquisito',
    );
  }
  if (!statuses.has(order?.fulfillment?.status as PrintShopFulfillmentStatus)) {
    throw new PrintShopHttpError(
      409,
      'lab_action_not_allowed',
      `Operazione laboratorio non consentita nello stato ${order?.fulfillment?.status || 'sconosciuto'}`,
    );
  }
}

function assertLabDataProcessingAgreement(lab: any): void {
  if (!hasValidLabDpa(lab)) {
    throw new PrintShopHttpError(
      409,
      'lab_dpa_required',
      'Il laboratorio non può ricevere file finché l’accordo sul trattamento dei dati non risulta firmato',
    );
  }
}

function isCatalogProduct(value: any): value is PrintShopCatalogProduct {
  const pricing = value?.printSpec?.pricing;
  const tiersValid = pricing?.model === 'tiered' &&
    Array.isArray(pricing.tiers) &&
    pricing.tiers.length > 0 &&
    pricing.tiers.every((tier: any, index: number) => {
      if (
        !Number.isSafeInteger(tier?.minQuantity) || tier.minQuantity < 1 ||
        !Number.isSafeInteger(tier?.unitPriceCents) || tier.unitPriceCents < 1 ||
        (tier.maxQuantity !== undefined &&
          (!Number.isSafeInteger(tier.maxQuantity) || tier.maxQuantity < tier.minQuantity))
      ) return false;
      if (index === 0 && tier.minQuantity !== 1) return false;
      const previous = pricing.tiers[index - 1];
      if (index > 0 && (previous.maxQuantity === undefined || tier.minQuantity !== previous.maxQuantity + 1)) {
        return false;
      }
      return index === pricing.tiers.length - 1 || tier.maxQuantity !== undefined;
    });
  const normalizedSku = typeof value?.sku === 'string'
    ? value.sku.trim().toUpperCase()
    : '';
  const isPolaroidSku = normalizedSku === 'PRINT-POLAROID-100X090';
  const packageValid = pricing?.model === 'package' &&
    Number.isSafeInteger(pricing.packageSize) && pricing.packageSize > 0 &&
    Number.isSafeInteger(pricing.packagePriceCents) && pricing.packagePriceCents > 0 &&
    typeof pricing.requireDistinctAssets === 'boolean' &&
    typeof pricing.allowMultiplePackages === 'boolean' &&
    (!isPolaroidSku || (
      value?.categoria === 'stampe-polaroid' &&
      pricing.packageSize === 50 &&
      pricing.requireDistinctAssets === true &&
      pricing.allowMultiplePackages === false
    ));
  const finishes = value?.printSpec?.finishes;
  const fitModes = value?.printSpec?.fitModes;
  return Boolean(
    value &&
      typeof value.id === 'string' &&
      typeof value.sku === 'string' && value.sku.trim() &&
      typeof value.nome === 'string' && value.nome.trim() &&
      typeof value.categoria === 'string' && PRINT_SHOP_CATEGORY_IDS.has(value.categoria) &&
      value.currency === PRINT_SHOP_CURRENCY &&
      Number.isSafeInteger(value.catalogVersion) && value.catalogVersion > 0 &&
      Number.isSafeInteger(value.displayOrder) && value.displayOrder >= 0 &&
      Number.isFinite(value.prezzo) && value.prezzo >= 0 &&
      Number.isFinite(value.prezzoFinale) && value.prezzoFinale >= 0 &&
      Number.isFinite(value.sconto) && value.sconto >= 0 &&
      Number.isFinite(value.printSpec?.widthMm) && value.printSpec.widthMm > 0 &&
      Number.isFinite(value.printSpec?.heightMm) && value.printSpec.heightMm > 0 &&
      Number.isFinite(value.printSpec?.qualityWarningDpi) && value.printSpec.qualityWarningDpi > 0 &&
      Number.isFinite(value.printSpec?.qualityTargetDpi) &&
      value.printSpec.qualityTargetDpi >= value.printSpec.qualityWarningDpi &&
      Array.isArray(finishes) && finishes.length === 2 &&
      new Set(finishes).size === 2 &&
      finishes.includes('glossy') && finishes.includes('matte') &&
      Array.isArray(fitModes) && fitModes.length === 2 &&
      new Set(fitModes).size === 2 &&
      fitModes.includes('border') && fitModes.includes('cover') &&
      (tiersValid || packageValid),
  );
}

function publicOwnerOrder(order: any, assets?: any[]): any {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    catalogVersion: order.catalogVersion,
    currency: order.currency,
    customer: order.customer
      ? {
          name: order.customer.name,
          email: order.customer.email,
          ...(order.customer.phone ? { phone: order.customer.phone } : {}),
        }
      : undefined,
    totals: order.totals,
    quoteFingerprint: order.quoteFingerprint,
    payment: {
      method: 'paypal',
      status: order.payment?.status || 'pending',
      ...(order.payment?.amountCents !== undefined
        ? { amountCents: order.payment.amountCents }
        : {}),
      ...(order.payment?.currency ? { currency: order.payment.currency } : {}),
      ...(order.payment?.paidAt ? { paidAt: order.payment.paidAt } : {}),
      ...(order.payment?.refundedAt ? { refundedAt: order.payment.refundedAt } : {}),
      ...(order.payment?.refundedCents !== undefined
        ? { refundedCents: order.payment.refundedCents }
        : {}),
    },
    fulfillment: {
      method: 'studio_pickup',
      status: order.fulfillment?.status || 'draft',
      ...(order.fulfillment?.readyAt ? { readyAt: order.fulfillment.readyAt } : {}),
      ...(order.fulfillment?.deliveredAt
        ? { deliveredAt: order.fulfillment.deliveredAt }
        : {}),
      ...(order.fulfillment?.cancelledAt
        ? { cancelledAt: order.fulfillment.cancelledAt }
        : {}),
    },
    printShop: {
      items: Array.isArray(order.printShop?.items) ? order.printShop.items : [],
      requestedItems: Array.isArray(order.printShop?.requestedItems)
        ? order.printShop.requestedItems
        : [],
      assetCount: Number(order.printShop?.assetCount || 0),
      copyCount: Number(order.printShop?.copyCount || 0),
      assetRetentionDays: Number(order.printShop?.assetRetentionDays || 0),
      lowResolutionAccepted: order.printShop?.lowResolutionAccepted === true,
      qualityWarnings: Array.isArray(order.printShop?.qualityWarnings)
        ? order.printShop.qualityWarnings
        : [],
      ...(order.printShop?.customerNotes
        ? { customerNotes: order.printShop.customerNotes }
        : {}),
    },
    ...(assets ? { assets: assets.map(publicAsset) } : {}),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    ...(order.submittedAt ? { submittedAt: order.submittedAt } : {}),
  };
}

function publicAsset(asset: any): any {
  return {
    id: asset.id,
    status: asset.status,
    originalName: asset.originalName,
    contentType: asset.contentType || asset.declaredContentType,
    sizeBytes: asset.sizeBytes || asset.declaredSizeBytes,
    ...(asset.widthPx ? { widthPx: asset.widthPx } : {}),
    ...(asset.heightPx ? { heightPx: asset.heightPx } : {}),
    ...(asset.qualityWarning ? { qualityWarning: asset.qualityWarning } : {}),
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    ...(asset.finalizedAt ? { finalizedAt: asset.finalizedAt } : {}),
  };
}

function normalizeRequiredEmail(value: string): string {
  const normalized = normalizeEmail(value || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new PrintShopHttpError(400, 'email_required', 'Account senza email valida');
  }
  return normalized;
}

function normalizeCatalogSku(value: string): string {
  const normalized = (cleanText(value, 80) || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{1,79}$/.test(normalized)) {
    throw new PrintShopHttpError(400, 'invalid_sku', 'SKU non valido');
  }
  return normalized;
}

function splitCustomerName(value: string): { first: string; last: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return {
    first: parts.shift() || 'Cliente',
    last: parts.join(' ') || 'Shop stampe',
  };
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ');
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

function assertDocumentId(value: string, field: string): void {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 200 ||
    value.includes('/') ||
    value === '.' ||
    value === '..'
  ) {
    throw new PrintShopHttpError(400, 'invalid_id', `${field} non valido`);
  }
}

function centsToEuros(cents: number): number {
  if (!Number.isSafeInteger(cents)) throw new Error('Importo in centesimi non valido');
  return cents / 100;
}

function positiveEnvInt(name: string, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

function isOrderEligibleForRetentionPurge(order: any, nowMillis: number): boolean {
  const deleteAfter = timestampMillis(order?.retention?.deleteAfter);
  if (deleteAfter <= 0 || deleteAfter > nowMillis || order?.retention?.status === 'purged') {
    return false;
  }

  // Un claim recente appartiene a un'altra istanza. Dopo 30 minuti è invece
  // recuperabile: delete(ignoreNotFound) e purgeClaimToken rendono il retry
  // idempotente anche se l'istanza precedente dovesse riprendere.
  const recentPurge =
    order?.retention?.status === 'purging' &&
    timestampMillis(order?.retention?.purgeClaimedAt) > nowMillis - 30 * 60 * 1000;
  const recentCapture =
    order?.retention?.status === 'capture_in_progress' &&
    timestampMillis(order?.payment?.captureClaimedAt) > nowMillis - 30 * 60 * 1000;
  if (recentPurge || recentCapture) return false;

  // Il pagamento non deve mai far scadere file ancora in produzione. Per un
  // ordine pagato il fallback applicativo interviene soltanto dopo la consegna
  // e la deleteAfter impostata in quel passaggio; così copre anche customTime
  // GCS partial/fallito senza riaprire la race con capture/produzione.
  if (order?.payment?.status === 'paid') {
    return (
      order?.fulfillment?.status === 'delivered' &&
      timestampMillis(order?.fulfillment?.deliveredAt) > 0
    );
  }
  return true;
}

function timestampMillis(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const seconds = value.seconds ?? value._seconds;
  if (typeof seconds === 'number') return seconds * 1000;
  if (typeof value === 'string') return Date.parse(value) || 0;
  return 0;
}

function hashId(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function computePerceptualFingerprint(
  buffer: Buffer,
  maxPixels = 80_000_000,
): Promise<{ hash: string; color: { r: number; g: number; b: number } }> {
  const { data } = await sharp(buffer, { limitInputPixels: maxPixels })
    .rotate()
    .resize(9, 8, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let hash = '';
  let nibble = 0;
  let nibbleBits = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 9; x++) {
      const offset = (y * 9 + x) * 3;
      red += data[offset];
      green += data[offset + 1];
      blue += data[offset + 2];
      if (x < 8) {
        const next = offset + 3;
        const luminance = data[offset] * 299 + data[offset + 1] * 587 + data[offset + 2] * 114;
        const nextLuminance = data[next] * 299 + data[next + 1] * 587 + data[next + 2] * 114;
        nibble = (nibble << 1) | (luminance > nextLuminance ? 1 : 0);
        nibbleBits++;
        if (nibbleBits === 4) {
          hash += nibble.toString(16);
          nibble = 0;
          nibbleBits = 0;
        }
      }
    }
  }
  const pixels = 9 * 8;
  return {
    hash: hash.padStart(16, '0'),
    color: {
      r: Math.round(red / pixels),
      g: Math.round(green / pixels),
      b: Math.round(blue / pixels),
    },
  };
}

function tryAcquireFinalizeSlot(limit: number): (() => void) | null {
  if (processFinalizeSlotsInUse >= limit) return null;
  processFinalizeSlotsInUse++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    processFinalizeSlotsInUse = Math.max(0, processFinalizeSlotsInUse - 1);
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index]!, index);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

function perceptualHammingDistance(left: string, right: string): number {
  let distance = 0;
  const bitCounts = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const xor = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    distance += bitCounts[xor] || 0;
  }
  return distance;
}

function colorDistance(
  left: { r: number; g: number; b: number },
  right: { r: number; g: number; b: number },
): number {
  return Math.sqrt(
    (left.r - right.r) ** 2 +
      (left.g - right.g) ** 2 +
      (left.b - right.b) ** 2,
  );
}

function csvCell(value: string): string {
  const neutralized = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

function sanitizeFileName(value: string): string {
  return (
    value
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180) || 'file.jpg'
  );
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createLabEmail(input: {
  labName: string;
  studio: { name: string; email: string; phone: string };
  orderNumber: string;
  assetCount: number;
  link: string;
  expiresAt: Date;
}): string {
  const expiry = new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'long',
    timeZone: 'Europe/Rome',
  }).format(input.expiresAt);
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#333">
    <div style="max-width:600px;margin:auto;padding:24px">
      <h1 style="color:#8b5a3c">File pronti per la stampa</h1>
      <p>Ciao <strong>${escapeHtml(input.labName)}</strong>,</p>
      <p>${escapeHtml(input.studio.name)} ti ha inviato l’ordine
      <strong>${escapeHtml(input.orderNumber)}</strong>.</p>
      <p>Originali JPG: <strong>${input.assetCount}</strong>. Nella cartella trovi anche la distinta CSV con formato, carta, adattamento e copie.</p>
      <p style="margin:28px 0"><a href="${escapeHtml(input.link)}" style="background:#8b5a3c;color:#fff;padding:14px 24px;text-decoration:none;border-radius:6px">Scarica file e distinta</a></p>
      <p>Il collegamento sarà disponibile fino al <strong>${escapeHtml(expiry)}</strong>.</p>
      <p>${escapeHtml(input.studio.name)}<br>${escapeHtml(input.studio.email)} · ${escapeHtml(input.studio.phone)}</p>
    </div></body></html>`;
}

function createCustomerOrderEmail(
  kind: 'payment_confirmed' | 'ready_for_pickup',
  order: any,
  studio: { name: string; email: string; phone: string },
): string {
  const customerName = escapeHtml(order.customer?.name || order.nomeCliente || 'Cliente');
  const rows = (order.printShop?.items || [])
    .map(
      (item: any) => `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(item.productName)}<br><small>${item.widthMm}×${item.heightMm} mm · ${item.finish === 'glossy' ? 'lucida' : 'opaca'} · ${item.fitMode === 'border' ? 'bordo bianco' : 'a tutta pagina'}</small></td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${Number(item.copyCount || 0)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">€ ${centsToEuros(Number(item.lineTotalCents || 0)).toFixed(2).replace('.', ',')}</td>
      </tr>`,
    )
    .join('');
  const isPaid = kind === 'payment_confirmed';
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#333;background:#faf8f5;padding:20px">
    <div style="max-width:620px;margin:auto;background:#fff;border-radius:12px;overflow:hidden">
      <div style="background:#8b5a3c;color:#fff;padding:24px"><h1 style="margin:0">${isPaid ? 'Ordine ricevuto' : 'Stampe pronte per il ritiro'}</h1></div>
      <div style="padding:24px"><p>Ciao <strong>${customerName}</strong>,</p>
      <p>${isPaid
        ? `il pagamento dell’ordine <strong>${escapeHtml(order.orderNumber)}</strong> è stato acquisito. Controlleremo i file e avvieremo la stampa.`
        : `l’ordine <strong>${escapeHtml(order.orderNumber)}</strong> è pronto. Puoi ritirarlo presso la nostra sede.`}</p>
      <table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2" style="padding:12px 8px;font-weight:bold">Totale pagato</td><td style="padding:12px 8px;text-align:right;font-weight:bold">€ ${centsToEuros(Number(order.totals?.totalCents || 0)).toFixed(2).replace('.', ',')}</td></tr></tfoot></table>
      <p style="margin-top:24px"><strong>${escapeHtml(studio.name)}</strong><br>${escapeHtml(studio.email)} · ${escapeHtml(studio.phone)}</p>
      </div></div></body></html>`;
}
