import { describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { PRINT_SHOP_CATALOG } from '../../shared/print-shop-catalog.js';
import { PRINT_SHOP_LEGAL_MANIFEST } from '../../shared/print-shop-legal.js';
import {
  PrintShopHttpError,
  PrintShopService,
  printShopLegalManifestHash,
} from './service.js';
import { FakeFirestore, FakeStorage } from './test-fakes.js';

const identity = { uid: 'user_one', email: 'cliente@example.com' };

function paypalFake() {
  return {
    config: {
      environment: 'sandbox',
      clientId: 'client',
      clientSecret: 'secret',
      webhookId: '',
    },
    publicConfig: () => ({
      enabled: true,
      checkoutEnabled: true,
      webhookReady: false,
      environment: 'sandbox',
      clientId: 'client',
    }),
    createOrder: vi.fn(async (input: any) => ({
      id: 'PAYPAL-ORDER-123',
      status: 'CREATED',
      links: [{ rel: 'approve', href: 'https://paypal.test/approve' }],
      input,
    })),
    captureOrder: vi.fn(),
    getOrder: vi.fn(),
    verifyWebhook: vi.fn(async () => true),
  } as any;
}

function createService(options: {
  db?: FakeFirestore;
  storage?: FakeStorage;
  paypal?: any;
  mail?: any;
  drive?: any;
  now?: () => Timestamp;
} = {}) {
  const db = options.db || new FakeFirestore();
  const storage = options.storage || new FakeStorage();
  const paypal = options.paypal || paypalFake();
  if (!db.value('settings/studio')) {
    db.seed('settings/studio', {
      name: 'Image Studio Fotografico',
      email: 'studio@example.com',
      phone: '+39 334 0000000',
      fiscalVia: 'Via Roma 1',
      fiscalCap: '81031',
      fiscalComune: 'Aversa',
      fiscalProvincia: 'CE',
      partitaIVA: '01234567890',
      codiceFiscale: 'RSSMRA85M01F839X',
    });
  }
  return {
    db,
    storage,
    paypal,
    service: new PrintShopService({
      db,
      storage,
      paypal,
      mail: options.mail,
      drive: options.drive,
      now: options.now,
    }),
  };
}

function baseOrder(overrides: Record<string, any> = {}) {
  return {
    orderType: 'print_shop',
    ownerUid: identity.uid,
    clienteId: 'client_1',
    orderNumber: 'ST-2026-TEST0001',
    customer: { name: 'Mario Rossi', email: identity.email },
    nomeCliente: 'Mario Rossi',
    emailCliente: identity.email,
    catalogVersion: 1,
    currency: 'EUR',
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
      assetRetentionDays: 90,
      lowResolutionAccepted: false,
      qualityWarnings: [],
    },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  };
}

function seedProduct(db: FakeFirestore, product: any) {
  db.seed(`products/${product.id}`, { ...product, attivo: true });
}

function seedReadyAsset(
  db: FakeFirestore,
  orderId: string,
  assetId: string,
  overrides: Record<string, any> = {},
) {
  const fingerprint = createHash('sha256').update(assetId).digest('hex');
  db.seed(`orders/${orderId}/assets/${assetId}`, {
    ownerUid: identity.uid,
    orderId,
    status: 'ready',
    originalName: `${assetId}.jpg`,
    contentType: 'image/jpeg',
    sizeBytes: 1000,
    widthPx: 6000,
    heightPx: 4000,
    sha256: `hash_${assetId}`,
    perceptualHash: fingerprint.slice(0, 16),
    perceptualColor: {
      r: Number.parseInt(fingerprint.slice(16, 18), 16),
      g: Number.parseInt(fingerprint.slice(18, 20), 16),
      b: Number.parseInt(fingerprint.slice(20, 22), 16),
    },
    storagePath: `print-orders/${identity.uid}/${orderId}/${assetId}/original.jpg`,
    ...overrides,
  });
}

function checkoutInput(db: FakeFirestore, orderId: string, overrides: Record<string, any> = {}) {
  const order = db.value(`orders/${orderId}`);
  return {
    termsAccepted: true,
    privacyAccepted: true,
    personalizedProductionAccepted: true,
    expectedQuoteFingerprint: order.quoteFingerprint,
    expectedTotalCents: order.totals.totalCents,
    ...overrides,
  };
}

async function jpeg(color: { r: number; g: number; b: number }, quality = 90): Promise<Buffer> {
  return sharp({
    create: { width: 32, height: 32, channels: 3, background: color },
  }).jpeg({ quality }).toBuffer();
}

function seedPreparedAsset(
  db: FakeFirestore,
  storage: FakeStorage,
  orderId: string,
  assetId: string,
  buffer: Buffer,
  ownerUid = identity.uid,
) {
  const storagePath = `print-orders/${ownerUid}/${orderId}/${assetId}/original.jpg`;
  db.seed(`orders/${orderId}/assets/${assetId}`, {
    ownerUid,
    orderId,
    status: 'prepared',
    originalName: `${assetId}.jpg`,
    declaredContentType: 'image/jpeg',
    declaredSizeBytes: buffer.length,
    storagePath,
    expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
  });
  storage.put(storagePath, buffer);
}

function snapshotItem(assetIds: string[]) {
  const product = PRINT_SHOP_CATALOG.find(item => item.printSpec.pricing.model === 'tiered')!;
  const assignments = assetIds.map(assetId => ({ assetId, copies: 1 }));
  return {
    productId: product.id,
    sku: product.sku,
    productName: product.nome,
    category: product.categoria,
    catalogVersion: product.catalogVersion,
    widthMm: product.printSpec.widthMm,
    heightMm: product.printSpec.heightMm,
    finish: 'matte' as const,
    fitMode: 'border' as const,
    pricingModel: 'tiered' as const,
    unitPriceCents: 50,
    lineSubtotalCents: assetIds.length * 50,
    lineDiscountCents: 0,
    lineTotalCents: assetIds.length * 50,
    assetCount: assetIds.length,
    copyCount: assetIds.length,
    assignments,
  };
}

describe('PrintShopService durable idempotency', () => {
  it('creates one draft under concurrent retries and rejects payload reuse', async () => {
    const { db, service } = createService();
    const key = '2b53678d-9cc7-4a70-a1a1-draft';
    const input = { customer: { name: 'Mario Rossi', phone: '+39123456' } };

    const [first, second] = await Promise.all([
      service.createDraft(identity, input, key),
      service.createDraft(identity, input, key),
    ]);

    expect(first.id).toBe(second.id);
    expect(db.countCollection('orders')).toBe(1);
    expect([first.idempotentReplay, second.idempotentReplay]).toContain(true);

    await expect(
      service.createDraft(identity, { customer: { name: 'Payload diverso' } }, key),
    ).rejects.toMatchObject({
      status: 409,
      code: 'idempotency_payload_mismatch',
    });
    expect(db.countCollection('orders')).toBe(1);
  });

  it('replays the same prepared upload resource under concurrency', async () => {
    const { db, storage, service } = createService();
    db.seed('orders/order_upload', baseOrder());
    const candidate = {
      fileName: 'ritratto.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1234,
    };
    const key = '34392b16-8953-4f1d-upload';
    const [first, second] = await Promise.all([
      service.prepareUpload(identity, 'order_upload', candidate, key, 'https://imagestudiofotografico.com'),
      service.prepareUpload(identity, 'order_upload', candidate, key, 'https://imagestudiofotografico.com'),
    ]);
    expect(first.assetId).toBe(second.assetId);
    expect(db.countCollection('orders/order_upload/assets')).toBe(1);
    expect([first.idempotentReplay, second.idempotentReplay]).toContain(true);
    expect(first.uploadUrl).toMatch(/^https:\/\/storage\.test\/upload\//);
    expect(storage.resumableUploads).toHaveLength(2);
    expect(storage.resumableUploads[0]).toMatchObject({
      path: first.storagePath,
      options: {
        origin: 'https://imagestudiofotografico.com',
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
          contentType: 'image/jpeg',
          cacheControl: 'private,max-age=0,no-store',
          metadata: {
            ownerUid: identity.uid,
            orderId: 'order_upload',
            assetId: first.assetId,
            originalFileName: candidate.fileName,
          },
        },
      },
    });
  });
});

describe('PrintShopService production validation', () => {
  it('rejects a PayPal capture whose amount does not match the frozen server total', async () => {
    const paypal = paypalFake();
    paypal.captureOrder.mockResolvedValue({
      id: 'PAYPAL-ORDER-123',
      status: 'COMPLETED',
      purchase_units: [{
        reference_id: 'order_capture_bad',
        custom_id: 'order_capture_bad',
        invoice_id: 'ST-2026-TEST0001',
        payments: { captures: [{
          id: 'CAPTURE-BAD-123',
          status: 'COMPLETED',
          amount: { currency_code: 'EUR', value: '9.99' },
        }] },
      }],
    });
    const { db, service } = createService({ paypal });
    db.seed('orders/order_capture_bad', baseOrder({
      totals: { subtotalCents: 1000, discountCents: 0, totalCents: 1000 },
      totale: 10,
      saldo: 10,
      fulfillment: { method: 'studio_pickup', status: 'awaiting_payment' },
      payment: { method: 'paypal', status: 'pending', paypalOrderId: 'PAYPAL-ORDER-123' },
    }));
    await expect(
      service.capturePaypalOrder(identity, 'order_capture_bad', {
        paypalOrderId: 'PAYPAL-ORDER-123',
      }),
    ).rejects.toMatchObject({ code: 'paypal_capture_mismatch', status: 409 });
    expect(db.countCollection('cashMovements')).toBe(0);
  });

  it('records revenue and PayPal fee once, then replays an already captured payment', async () => {
    const paypal = paypalFake();
    paypal.captureOrder.mockResolvedValue({
      id: 'PAYPAL-ORDER-123',
      status: 'COMPLETED',
      payer: { email_address: 'payer@example.com' },
      purchase_units: [{
        reference_id: 'order_capture_ok',
        custom_id: 'order_capture_ok',
        invoice_id: 'ST-2026-TEST0001',
        payments: { captures: [{
          id: 'CAPTURE-OK-123',
          status: 'COMPLETED',
          amount: { currency_code: 'EUR', value: '10.00' },
          seller_receivable_breakdown: {
            paypal_fee: { currency_code: 'EUR', value: '0.45' },
          },
        }] },
      }],
    });
    const { db, service } = createService({ paypal });
    db.seed('orders/order_capture_ok', baseOrder({
      totals: { subtotalCents: 1000, discountCents: 0, totalCents: 1000 },
      totale: 10,
      saldo: 10,
      fulfillment: { method: 'studio_pickup', status: 'awaiting_payment' },
      payment: { method: 'paypal', status: 'pending', paypalOrderId: 'PAYPAL-ORDER-123' },
    }));
    const first = await service.capturePaypalOrder(identity, 'order_capture_ok', {});
    const replay = await service.capturePaypalOrder(identity, 'order_capture_ok', {});
    expect(first).toMatchObject({ success: true, duplicate: false, captureId: 'CAPTURE-OK-123' });
    expect(replay).toMatchObject({ success: true, duplicate: true, captureId: 'CAPTURE-OK-123' });
    expect(paypal.captureOrder).toHaveBeenCalledTimes(1);
    expect(db.countCollection('cashMovements')).toBe(2);
    expect(db.value('orders/order_capture_ok').payment).toMatchObject({
      status: 'paid',
      paypalFeeCents: 45,
      netAmountCents: 955,
    });
    expect(db.value('orders/order_capture_ok').printShop.estimatedMarginCents).toBe(955);
    expect(db.value(`cashMovements/print_paypal_fee_${createHash('sha256').update('CAPTURE-OK-123').digest('hex').slice(0, 32)}`)).toMatchObject({
      tipo: 'uscita',
      categoria: 'Commissioni di pagamento',
      importo: 0.45,
      origine: 'print_shop',
    });
  });

  it('rejects a Polaroid package containing duplicate bytes under different asset IDs', async () => {
    const { db, service } = createService();
    const product = PRINT_SHOP_CATALOG.find(
      item => item.printSpec.pricing.model === 'package',
    )!;
    seedProduct(db, product);
    db.seed('orders/order_polaroid', baseOrder());
    const assignments = Array.from({ length: 50 }, (_, index) => ({
      assetId: `asset_${index}`,
      copies: 1,
    }));
    assignments.forEach((assignment, index) =>
      seedReadyAsset(db, 'order_polaroid', assignment.assetId, {
        sha256: index < 2 ? 'same-content' : `unique-${index}`,
      }),
    );

    await expect(
      service.quote(identity, 'order_polaroid', {
        items: [{
          sku: product.sku,
          finish: 'matte',
          fitMode: 'border',
          assignments,
        }],
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'duplicate_photo_content',
    });
  });

  it('computes authoritative DPI warnings and blocks checkout until accepted', async () => {
    const paypal = paypalFake();
    const { db, service } = createService({ paypal });
    const product = PRINT_SHOP_CATALOG.find(
      item => item.printSpec.pricing.model === 'tiered',
    )!;
    seedProduct(db, product);
    db.seed('orders/order_dpi', baseOrder());
    seedReadyAsset(db, 'order_dpi', 'asset_low', {
      widthPx: 300,
      heightPx: 200,
    });
    const request = {
      items: [{
        sku: product.sku,
        finish: 'glossy' as const,
        fitMode: 'cover' as const,
        assignments: [{ assetId: 'asset_low', copies: 1 }],
      }],
    };
    const quote = await service.quote(identity, 'order_dpi', request);
    expect(quote.qualityWarnings).toHaveLength(1);
    expect(quote.qualityWarnings![0].effectiveDpi).toBeLessThan(
      product.printSpec.qualityWarningDpi,
    );
    expect(db.value('orders/order_dpi/assets/asset_low').qualityWarning).toBeTruthy();

    await expect(
      service.createPaypalOrder(identity, 'order_dpi', {
        ...checkoutInput(db, 'order_dpi'),
      }),
    ).rejects.toMatchObject({ code: 'low_resolution_confirmation_required' });
    expect(paypal.createOrder).not.toHaveBeenCalled();

    await service.updateDraft(identity, 'order_dpi', { lowResolutionAccepted: true });
    await expect(service.createPaypalOrder(
      identity,
      'order_dpi',
      checkoutInput(db, 'order_dpi'),
    )).resolves.toMatchObject({ paypalOrderId: 'PAYPAL-ORDER-123' });
    expect(paypal.createOrder).toHaveBeenCalledTimes(1);
  });

  it('adds the configured shipping fee and requires shipping and billing data before PayPal', async () => {
    const paypal = paypalFake();
    const { db, service } = createService({ paypal });
    const product = PRINT_SHOP_CATALOG.find(
      item => item.printSpec.pricing.model === 'tiered',
    )!;
    seedProduct(db, product);
    db.seed('settings/printShop', {
      shipping: { enabled: true, priceCents: 690, estimatedMinDays: 2, estimatedMaxDays: 5 },
    });
    db.seed('orders/order_shipping', baseOrder());
    db.seed('clienti/client_1', {
      nome: 'Mario',
      cognome: 'Rossi',
      email: identity.email,
      source: 'print_shop',
    });
    seedReadyAsset(db, 'order_shipping', 'asset_shipping');
    const request = {
      items: [{
        sku: product.sku,
        finish: 'matte' as const,
        fitMode: 'border' as const,
        assignments: [{ assetId: 'asset_shipping', copies: 1 }],
      }],
      fulfillment: { method: 'shipping' as const },
    };

    const quote = await service.quote(identity, 'order_shipping', request);
    expect(quote.fulfillment).toEqual({ method: 'shipping' });
    expect(quote.totals.shippingCents).toBe(690);
    expect(quote.totals.totalCents).toBe(quote.totals.subtotalCents + 690);
    expect(db.value('orders/order_shipping').fulfillment.method).toBe('shipping');

    await expect(
      service.createPaypalOrder(identity, 'order_shipping', checkoutInput(db, 'order_shipping')),
    ).rejects.toMatchObject({ code: 'shipping_address_required' });
    expect(paypal.createOrder).not.toHaveBeenCalled();

    const address = {
      street: 'Via Roma',
      houseNumber: '12',
      postalCode: '81031',
      city: 'Aversa',
      province: 'CE',
      country: 'IT' as const,
    };
    await service.updateDraft(identity, 'order_shipping', {
      customer: { name: 'Mario Rossi', phone: '+39 333 1234567' },
      fulfillment: { method: 'shipping', shippingAddress: address },
      billingDetails: { fiscalCode: 'RSSMRA85M01H501Q', residenceAddress: address },
    });
    expect(db.value('clienti/client_1')).toMatchObject({
      codiceFiscale: 'RSSMRA85M01H501Q',
      indirizzo: 'Via Roma 12',
      cap: '81031',
      citta: 'Aversa',
      provincia: 'CE',
    });
    await expect(
      service.createPaypalOrder(identity, 'order_shipping', checkoutInput(db, 'order_shipping')),
    ).resolves.toMatchObject({ paypalOrderId: 'PAYPAL-ORDER-123' });
    expect(paypal.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: quote.totals.totalCents }),
      expect.any(String),
    );
  });

  it('keeps shipping disabled by default and rejects a shipping quote', async () => {
    const { db, service } = createService();
    const product = PRINT_SHOP_CATALOG.find(
      item => item.printSpec.pricing.model === 'tiered',
    )!;
    seedProduct(db, product);
    db.seed('orders/order_shipping_disabled', baseOrder());
    seedReadyAsset(db, 'order_shipping_disabled', 'asset_shipping_disabled');

    expect(await service.shippingConfiguration()).toEqual({
      enabled: false,
      priceCents: 0,
      estimatedMinDays: 2,
      estimatedMaxDays: 5,
    });
    await expect(service.quote(identity, 'order_shipping_disabled', {
      items: [{
        sku: product.sku,
        finish: 'glossy',
        fitMode: 'cover',
        assignments: [{ assetId: 'asset_shipping_disabled', copies: 1 }],
      }],
      fulfillment: { method: 'shipping' },
    })).rejects.toMatchObject({ code: 'shipping_disabled', status: 409 });
  });

  it('stores a valid admin shipping configuration and rejects invalid delivery times', async () => {
    const { db, service } = createService();
    await expect(service.updateShippingConfiguration({
      enabled: true,
      priceCents: 790,
      estimatedMinDays: 3,
      estimatedMaxDays: 6,
    }, 'admin@example.com')).resolves.toEqual({
      enabled: true,
      priceCents: 790,
      estimatedMinDays: 3,
      estimatedMaxDays: 6,
    });
    expect(db.value('settings/printShop').shipping).toMatchObject({ enabled: true, priceCents: 790 });
    await expect(service.updateShippingConfiguration({
      enabled: true,
      priceCents: 790,
      estimatedMinDays: 7,
      estimatedMaxDays: 4,
    }, 'admin@example.com')).rejects.toMatchObject({
      code: 'invalid_shipping_configuration',
      status: 400,
    });
  });

  it('requires all legal acceptances and stores their audit versions', async () => {
    const paypal = paypalFake();
    const { db, service } = createService({ paypal });
    const product = PRINT_SHOP_CATALOG.find(
      item => item.printSpec.pricing.model === 'tiered',
    )!;
    seedProduct(db, product);
    db.seed('orders/order_legal', baseOrder({
      printShop: { ...baseOrder().printShop, lowResolutionAccepted: true },
    }));
    seedReadyAsset(db, 'order_legal', 'asset_high');
    await service.quote(identity, 'order_legal', {
      items: [{
        sku: product.sku,
        finish: 'matte',
        fitMode: 'border',
        assignments: [{ assetId: 'asset_high', copies: 1 }],
      }],
    });

    await expect(
      service.createPaypalOrder(identity, 'order_legal', {
        ...checkoutInput(db, 'order_legal'),
        privacyAccepted: false,
      }),
    ).rejects.toMatchObject({ code: 'legal_acceptance_required' });

    const result = await service.createPaypalOrder(
      identity,
      'order_legal',
      checkoutInput(db, 'order_legal'),
    );
    expect(result.paypalOrderId).toBe('PAYPAL-ORDER-123');
    const legal = db.value('orders/order_legal').legal;
    expect(legal.termsAcceptedAt).toBeTruthy();
    expect(legal.privacyAcceptedAt).toBeTruthy();
    expect(legal.personalizedProductionAcceptedAt).toBeTruthy();
    expect(legal.termsVersion).toBeTruthy();
    expect(legal.manifestHash).toBe(printShopLegalManifestHash());
    expect(legal.sellerSnapshot).toMatchObject({
      name: 'Image Studio Fotografico',
      vatNumber: '01234567890',
      fiscalAddress: { city: 'Aversa', province: 'CE' },
    });
    expect(db.countCollection('orders/order_legal/legalAcceptances')).toBe(1);
    expect(printShopLegalManifestHash({
      ...PRINT_SHOP_LEGAL_MANIFEST,
      termsVersion: '2026-09-01',
    })).not.toBe(legal.manifestHash);
  });

  it('reuses PayPal only with the complete current legal proof and replaces legacy pending orders', async () => {
    const paypal = paypalFake();
    let providerAttempt = 0;
    paypal.createOrder.mockImplementation(async () => ({
      id: `PAYPAL-LEGAL-${++providerAttempt}`,
      status: 'CREATED',
      links: [],
    }));
    const { db, service } = createService({ paypal });
    const product = PRINT_SHOP_CATALOG.find(item => item.printSpec.pricing.model === 'tiered')!;
    seedProduct(db, product);
    db.seed('orders/order_legal_reuse', baseOrder());
    seedReadyAsset(db, 'order_legal_reuse', 'asset');
    await service.quote(identity, 'order_legal_reuse', {
      items: [{
        sku: product.sku,
        finish: 'matte',
        fitMode: 'border',
        assignments: [{ assetId: 'asset', copies: 1 }],
      }],
    });
    const accepted = checkoutInput(db, 'order_legal_reuse');
    const first = await service.createPaypalOrder(identity, 'order_legal_reuse', accepted);
    const replay = await service.createPaypalOrder(identity, 'order_legal_reuse', accepted);
    expect(first.paypalOrderId).toBe('PAYPAL-LEGAL-1');
    expect(replay).toMatchObject({ paypalOrderId: 'PAYPAL-LEGAL-1', reused: true });
    expect(paypal.createOrder).toHaveBeenCalledTimes(1);

    const pending = db.value('orders/order_legal_reuse');
    db.seed('orders/order_legal_reuse', {
      ...pending,
      // Simula un pending creato prima dell'introduzione dello snapshot venditore/manifesto.
      legal: {
        termsAcceptedAt: pending.legal.termsAcceptedAt,
        quoteFingerprint: pending.quoteFingerprint,
        totalCents: pending.totals.totalCents,
      },
    });
    const replacement = await service.createPaypalOrder(identity, 'order_legal_reuse', accepted);
    expect(replacement).toMatchObject({ paypalOrderId: 'PAYPAL-LEGAL-2', reused: false });
    expect(paypal.createOrder).toHaveBeenCalledTimes(2);
    expect(db.value('orders/order_legal_reuse').payment.attempt).toBe(2);
  });

  it('uses a fresh PayPal idempotency key after a failed payment attempt', async () => {
    const paypal = paypalFake();
    let providerAttempt = 0;
    paypal.createOrder.mockImplementation(async () => ({
      id: `PAYPAL-ORDER-${++providerAttempt}`,
      status: 'CREATED',
      links: [],
    }));
    const { db, service } = createService({ paypal });
    const product = PRINT_SHOP_CATALOG.find(item => item.printSpec.pricing.model === 'tiered')!;
    seedProduct(db, product);
    db.seed('orders/order_paypal_retry', baseOrder());
    seedReadyAsset(db, 'order_paypal_retry', 'asset_retry');
    await service.quote(identity, 'order_paypal_retry', {
      items: [{
        sku: product.sku,
        finish: 'matte',
        fitMode: 'border',
        assignments: [{ assetId: 'asset_retry', copies: 1 }],
      }],
    });
    const legal = checkoutInput(db, 'order_paypal_retry');
    const first = await service.createPaypalOrder(identity, 'order_paypal_retry', legal);
    const failedOrder = db.value('orders/order_paypal_retry');
    db.seed('orders/order_paypal_retry', {
      ...failedOrder,
      payment: { ...failedOrder.payment, status: 'failed', paypalStatus: 'DENIED' },
      fulfillment: { ...failedOrder.fulfillment, status: 'awaiting_payment' },
    });
    const second = await service.createPaypalOrder(identity, 'order_paypal_retry', legal);

    expect(first.paypalOrderId).toBe('PAYPAL-ORDER-1');
    expect(second.paypalOrderId).toBe('PAYPAL-ORDER-2');
    expect(paypal.createOrder.mock.calls[0][1]).not.toBe(paypal.createOrder.mock.calls[1][1]);
    expect(paypal.createOrder.mock.calls[0][0].invoiceId).toBe('ST-2026-TEST0001-A1');
    expect(paypal.createOrder.mock.calls[1][0].invoiceId).toBe('ST-2026-TEST0001-A2');
    expect(db.value('orders/order_paypal_retry').payment.attempt).toBe(2);
    expect(db.value('orders/order_paypal_retry').printShop.paypalAttempt).toBe(2);
  });

  it('binds legal consent to the exact quote fingerprint and amount', async () => {
    const paypal = paypalFake();
    const { db, service } = createService({ paypal });
    const product = PRINT_SHOP_CATALOG.find(item => item.printSpec.pricing.model === 'tiered')!;
    seedProduct(db, product);
    db.seed('orders/order_quote_binding', baseOrder());
    seedReadyAsset(db, 'order_quote_binding', 'asset_binding');
    await service.quote(identity, 'order_quote_binding', {
      items: [{
        sku: product.sku,
        finish: 'matte',
        fitMode: 'border',
        assignments: [{ assetId: 'asset_binding', copies: 1 }],
      }],
    });

    await expect(service.createPaypalOrder(identity, 'order_quote_binding', {
      ...checkoutInput(db, 'order_quote_binding'),
      expectedTotalCents: db.value('orders/order_quote_binding').totals.totalCents + 1,
    })).rejects.toMatchObject({ code: 'quote_changed', status: 409 });
    expect(paypal.createOrder).not.toHaveBeenCalled();
    expect(db.value('orders/order_quote_binding').legal).toBeUndefined();
  });

  it('gates live checkout on the verified GCS lifecycle rule', async () => {
    const paypal = paypalFake();
    paypal.config.environment = 'live';
    const created = createService({ paypal });
    const input = {
      termsAccepted: true,
      privacyAccepted: true,
      personalizedProductionAccepted: true,
      expectedQuoteFingerprint: 'a'.repeat(64),
      expectedTotalCents: 100,
    };
    await expect(created.service.createPaypalOrder(identity, 'missing_order', input))
      .rejects.toMatchObject({ code: 'retention_lifecycle_not_configured', status: 503 });
    created.storage.lifecycleRules = [{
      action: { type: 'Delete' },
      condition: { daysSinceCustomTime: 90, matchesPrefix: ['print-orders/'] },
    }];
    const verified = createService({ db: created.db, storage: created.storage, paypal });
    await expect(verified.service.createPaypalOrder(identity, 'missing_order', input))
      .rejects.toMatchObject({ code: 'order_not_found', status: 404 });
  });

  it('locks quote changes while PayPal capture is in progress', async () => {
    let releaseCapture!: () => void;
    const captureGate = new Promise<void>(resolve => { releaseCapture = resolve; });
    const paypal = paypalFake();
    paypal.captureOrder.mockImplementation(async () => {
      await captureGate;
      return {
        id: 'PAYPAL-CAPTURE-RACE',
        status: 'COMPLETED',
        purchase_units: [{
          reference_id: 'order_capture_race',
          custom_id: 'order_capture_race',
          invoice_id: 'ST-2026-TEST0001-A1',
          payments: { captures: [{
            id: 'CAPTURE-RACE-1',
            status: 'COMPLETED',
            amount: { currency_code: 'EUR', value: '10.00' },
          }] },
        }],
      };
    });
    const { db, service } = createService({ paypal });
    const fingerprint = 'a'.repeat(64);
    db.seed('orders/order_capture_race', baseOrder({
      quoteFingerprint: fingerprint,
      totals: { subtotalCents: 1000, discountCents: 0, totalCents: 1000 },
      totale: 10,
      saldo: 10,
      fulfillment: { method: 'studio_pickup', status: 'awaiting_payment' },
      payment: {
        method: 'paypal',
        status: 'pending',
        paypalOrderId: 'PAYPAL-CAPTURE-RACE',
        invoiceId: 'ST-2026-TEST0001-A1',
      },
    }));

    const capture = service.capturePaypalOrder(identity, 'order_capture_race', {});
    await vi.waitFor(() => {
      expect(db.value('orders/order_capture_race').retention.status).toBe('capture_in_progress');
    });
    await expect(service.createPaypalOrder(identity, 'order_capture_race', {
      termsAccepted: true,
      privacyAccepted: true,
      personalizedProductionAccepted: true,
      expectedQuoteFingerprint: fingerprint,
      expectedTotalCents: 1000,
    })).rejects.toMatchObject({ code: 'order_locked', status: 409 });
    releaseCapture();
    await expect(capture).resolves.toMatchObject({ success: true, status: 'paid' });
    expect(db.value('orders/order_capture_race').payment.status).toBe('paid');
  });

  it('reconciles a completed PayPal capture when the local order is inconsistent', async () => {
    const paypal = paypalFake();
    paypal.getOrder.mockResolvedValue({
      id: 'PAYPAL-RECONCILE-1',
      status: 'COMPLETED',
      purchase_units: [{
        reference_id: 'order_reconcile_paid',
        custom_id: 'order_reconcile_paid',
        invoice_id: 'ST-2026-TEST0001-A1',
        payments: { captures: [{
          id: 'CAPTURE-RECONCILE-1',
          status: 'COMPLETED',
          amount: { currency_code: 'EUR', value: '10.00' },
        }] },
      }],
    });
    const { db, service } = createService({ paypal });
    db.seed('orders/order_reconcile_paid', baseOrder({
      totals: { subtotalCents: 1000, discountCents: 0, totalCents: 1000 },
      totale: 10,
      saldo: 10,
      payment: {
        method: 'paypal',
        status: 'failed',
        paypalOrderId: 'PAYPAL-RECONCILE-1',
        invoiceId: 'ST-2026-TEST0001-A1',
      },
      fulfillment: { method: 'studio_pickup', status: 'awaiting_payment' },
    }));

    await expect(service.capturePaypalOrder(identity, 'order_reconcile_paid', {}))
      .resolves.toMatchObject({ success: true, duplicate: true, status: 'paid' });
    expect(paypal.captureOrder).not.toHaveBeenCalled();
    expect(db.value('orders/order_reconcile_paid').payment).toMatchObject({
      status: 'paid',
      paypalCaptureId: 'CAPTURE-RECONCILE-1',
    });
    expect(db.value('orders/order_reconcile_paid').fulfillment.status).toBe('submitted');
  });

  it('deduplicates the same PayPal refund delivered under different webhook event IDs', async () => {
    const paypal = paypalFake();
    const { db, service } = createService({ paypal });
    db.seed('orders/order_refund_dedup', baseOrder({
      totals: { subtotalCents: 1000, discountCents: 0, totalCents: 1000 },
      payment: {
        method: 'paypal',
        status: 'paid',
        amountCents: 1000,
        paypalOrderId: 'PAYPAL-REFUND-ORDER',
        paypalCaptureId: 'CAPTURE-REFUND-1',
      },
      fulfillment: { method: 'studio_pickup', status: 'submitted' },
    }));
    const resource = {
      id: 'REFUND-SAME-1',
      status: 'COMPLETED',
      amount: { currency_code: 'EUR', value: '5.00' },
      supplementary_data: {
        related_ids: { capture_id: 'CAPTURE-REFUND-1' },
      },
    };
    await service.paypalWebhook({}, {
      id: 'WH-REFUND-EVENT-A',
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource,
    });
    await service.paypalWebhook({}, {
      id: 'WH-REFUND-EVENT-B',
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource,
    });
    const payment = db.value('orders/order_refund_dedup').payment;
    expect(payment.refundedCents).toBe(500);
    expect(payment.refunds).toHaveLength(1);
    expect(db.countCollection('cashMovements')).toBe(1);
    expect(db.countCollection('printShopPaymentRefunds')).toBe(1);
  });

  it('rejects visually identical Polaroid photos even after JPEG re-encoding', async () => {
    const { db, storage, service } = createService();
    const product = PRINT_SHOP_CATALOG.find(item => item.printSpec.pricing.model === 'package')!;
    seedProduct(db, product);
    db.seed('orders/order_visual_duplicate', baseOrder());
    const first = await jpeg({ r: 220, g: 30, b: 40 }, 60);
    const second = await jpeg({ r: 220, g: 30, b: 40 }, 95);
    seedPreparedAsset(db, storage, 'order_visual_duplicate', 'asset_0', first);
    seedPreparedAsset(db, storage, 'order_visual_duplicate', 'asset_1', second);
    await service.finalizeUpload(identity, 'order_visual_duplicate', 'asset_0');
    await service.finalizeUpload(identity, 'order_visual_duplicate', 'asset_1');
    for (let index = 2; index < 50; index++) {
      seedReadyAsset(db, 'order_visual_duplicate', `asset_${index}`);
    }
    const assignments = Array.from({ length: 50 }, (_, index) => ({
      assetId: `asset_${index}`,
      copies: 1,
    }));
    expect(db.value('orders/order_visual_duplicate/assets/asset_0').sha256)
      .not.toBe(db.value('orders/order_visual_duplicate/assets/asset_1').sha256);
    await expect(service.quote(identity, 'order_visual_duplicate', {
      items: [{ sku: product.sku, finish: 'matte', fitMode: 'border', assignments }],
    })).rejects.toMatchObject({ code: 'duplicate_photo_content', status: 400 });
  });

  it('accepts genuinely different Polaroid photos with different visual color', async () => {
    const { db, storage, service } = createService();
    const product = PRINT_SHOP_CATALOG.find(item => item.printSpec.pricing.model === 'package')!;
    seedProduct(db, product);
    db.seed('orders/order_visual_unique', baseOrder());
    seedPreparedAsset(
      db,
      storage,
      'order_visual_unique',
      'asset_0',
      await jpeg({ r: 230, g: 20, b: 20 }),
    );
    seedPreparedAsset(
      db,
      storage,
      'order_visual_unique',
      'asset_1',
      await jpeg({ r: 20, g: 20, b: 230 }),
    );
    await service.finalizeUpload(identity, 'order_visual_unique', 'asset_0');
    await service.finalizeUpload(identity, 'order_visual_unique', 'asset_1');
    for (let index = 2; index < 50; index++) {
      seedReadyAsset(db, 'order_visual_unique', `asset_${index}`);
    }
    const assignments = Array.from({ length: 50 }, (_, index) => ({
      assetId: `asset_${index}`,
      copies: 1,
    }));
    await expect(service.quote(identity, 'order_visual_unique', {
      items: [{ sku: product.sku, finish: 'matte', fitMode: 'border', assignments }],
    })).resolves.toMatchObject({ assetCount: 50, copyCount: 50 });
  });
});

describe('PrintShopService notifications and retention', () => {
  it('skips customer notifications safely without a mail adapter', async () => {
    const { db, service } = createService();
    db.seed('orders/order_no_mail', baseOrder());
    await expect(
      service.sendCustomerNotificationBestEffort('order_no_mail', 'payment_confirmed'),
    ).resolves.toEqual({ sent: false, skipped: true });
  });

  it('sends a customer notification only once', async () => {
    const send = vi.fn(async (..._args: any[]) => undefined);
    const mail = {
      send,
      studio: vi.fn(async () => ({
        name: 'Image Studio',
        email: 'studio@example.com',
        phone: '+39000',
      })),
    };
    const { db, service } = createService({ mail });
    db.seed('orders/order_notify', baseOrder({
      totals: { subtotalCents: 1000, discountCents: 0, totalCents: 1000 },
      printShop: { ...baseOrder().printShop, items: [] },
    }));
    expect(await service.sendCustomerNotificationBestEffort(
      'order_notify',
      'payment_confirmed',
    )).toEqual({ sent: true, skipped: false });
    expect(await service.sendCustomerNotificationBestEffort(
      'order_notify',
      'payment_confirmed',
    )).toEqual({ sent: false, skipped: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][2]).toContain('IMAGE STUDIO');
    expect(send.mock.calls[0][2]).toContain('#708594');
    expect(send.mock.calls[0][2]).toContain('PAGAMENTO CONFERMATO');
    expect(db.value('orders/order_notify').notifications.paymentConfirmed.status).toBe('sent');
  });

  it('purges a paid delivered order after the 90-day deadline even when GCS customTime retries fail', async () => {
    const now = Timestamp.fromMillis(Date.UTC(2026, 7, 31));
    const { db, storage, service } = createService({ now: () => now });
    db.seed('orders/order_old', baseOrder({
      payment: { method: 'paypal', status: 'paid' },
      fulfillment: { method: 'studio_pickup', status: 'delivered', deliveredAt: Timestamp.fromMillis(now.toMillis() - 91 * 86_400_000) },
      retention: {
        status: 'scheduled',
        reason: 'delivered',
        deleteAfter: Timestamp.fromMillis(now.toMillis() - 1),
        gcsLifecycle: { status: 'partial', failedAssetCount: 1 },
      },
    }));
    const path = `print-orders/${identity.uid}/order_old/asset_old/original.jpg`;
    seedReadyAsset(db, 'order_old', 'asset_old', { storagePath: path });
    storage.put(path, Buffer.from('jpeg'));
    storage.failMetadataPaths.add(path);

    expect(await service.purgeExpiredAssets({ dryRun: true })).toMatchObject({
      eligible: 1,
      purged: 0,
      dryRun: true,
    });
    expect(storage.files.has(path)).toBe(true);
    expect(await service.purgeExpiredAssets()).toMatchObject({ eligible: 1, purged: 1 });
    expect(storage.files.has(path)).toBe(false);
    expect(db.value('orders/order_old')).toMatchObject({
      payment: { status: 'paid' },
      fulfillment: { status: 'delivered' },
      retention: { status: 'purged', gcsLifecycle: { status: 'purged' } },
    });
    expect(db.value('orders/order_old/assets/asset_old')).toMatchObject({
      status: 'purged',
    });
    expect(db.value('orders/order_old/assets/asset_old').assetsPurgedAt).toBeTruthy();
    expect(await service.purgeExpiredAssets()).toMatchObject({ eligible: 0, purged: 0 });
  });

  it('never purges a paid order before delivery even if an obsolete deleteAfter is already due', async () => {
    const now = Timestamp.fromMillis(Date.UTC(2026, 7, 31));
    const { db, storage, service } = createService({ now: () => now });
    const path = `print-orders/${identity.uid}/order_paid_in_production/asset/original.jpg`;
    db.seed('orders/order_paid_in_production', baseOrder({
      payment: { method: 'paypal', status: 'paid', paidAt: now },
      fulfillment: { method: 'studio_pickup', status: 'printing' },
      retention: {
        status: 'scheduled',
        reason: 'draft',
        deleteAfter: Timestamp.fromMillis(now.toMillis() - 1),
        gcsLifecycle: { status: 'partial', failedAssetCount: 1 },
      },
    }));
    seedReadyAsset(db, 'order_paid_in_production', 'asset', { storagePath: path });
    storage.put(path, Buffer.from('jpeg'));

    expect(await service.purgeExpiredAssets({ dryRun: true })).toMatchObject({
      eligible: 0,
      purged: 0,
    });
    expect(await service.purgeExpiredAssets()).toMatchObject({ eligible: 0, purged: 0 });
    expect(storage.files.has(path)).toBe(true);
    expect(db.value('orders/order_paid_in_production')).toMatchObject({
      payment: { status: 'paid' },
      fulfillment: { status: 'printing' },
      retention: { status: 'scheduled' },
    });
    expect(db.value('orders/order_paid_in_production/assets/asset')).toMatchObject({
      status: 'ready',
    });
  });

  it('recovers a stale purge claim for a paid delivered order without racing a recent claim', async () => {
    const now = Timestamp.fromMillis(Date.UTC(2026, 7, 31));
    const { db, storage, service } = createService({ now: () => now });
    const stalePath = `print-orders/${identity.uid}/order_stale_purge/asset/original.jpg`;
    const recentPath = `print-orders/${identity.uid}/order_recent_purge/asset/original.jpg`;
    const deliveredAt = Timestamp.fromMillis(now.toMillis() - 91 * 86_400_000);
    const dueRetention = {
      status: 'purging',
      reason: 'delivered',
      deleteAfter: Timestamp.fromMillis(now.toMillis() - 1),
    };
    db.seed('orders/order_stale_purge', baseOrder({
      payment: { method: 'paypal', status: 'paid' },
      fulfillment: { method: 'studio_pickup', status: 'delivered', deliveredAt },
      retention: {
        ...dueRetention,
        purgeClaimToken: 'stale-claim',
        purgeClaimedAt: Timestamp.fromMillis(now.toMillis() - 31 * 60 * 1000),
      },
    }));
    db.seed('orders/order_recent_purge', baseOrder({
      payment: { method: 'paypal', status: 'paid' },
      fulfillment: { method: 'studio_pickup', status: 'delivered', deliveredAt },
      retention: {
        ...dueRetention,
        purgeClaimToken: 'recent-claim',
        purgeClaimedAt: Timestamp.fromMillis(now.toMillis() - 60 * 1000),
      },
    }));
    seedReadyAsset(db, 'order_stale_purge', 'asset', { storagePath: stalePath });
    seedReadyAsset(db, 'order_recent_purge', 'asset', { storagePath: recentPath });
    storage.put(stalePath, Buffer.from('stale'));
    storage.put(recentPath, Buffer.from('recent'));

    expect(await service.purgeExpiredAssets()).toMatchObject({ eligible: 1, purged: 1 });
    expect(storage.files.has(stalePath)).toBe(false);
    expect(storage.files.has(recentPath)).toBe(true);
    expect(db.value('orders/order_stale_purge').retention.status).toBe('purged');
    expect(db.value('orders/order_recent_purge').retention.status).toBe('purging');
  });

  it('expires unpaid drafts and prepared orphan uploads idempotently', async () => {
    const now = Timestamp.fromMillis(Date.UTC(2026, 7, 31));
    const { db, storage, service } = createService({ now: () => now });
    db.seed('orders/order_abandoned', baseOrder({
      fulfillment: { method: 'studio_pickup', status: 'awaiting_payment' },
      payment: { method: 'paypal', status: 'pending', paypalOrderId: 'OLD-PAYPAL' },
      retention: {
        status: 'scheduled',
        reason: 'draft',
        deleteAfter: Timestamp.fromMillis(now.toMillis() - 1),
      },
    }));
    const readyPath = 'print-orders/user_one/order_abandoned/ready/original.jpg';
    seedReadyAsset(db, 'order_abandoned', 'ready', { storagePath: readyPath });
    storage.put(readyPath, Buffer.from('ready'));

    const orphanPath = 'print-orders/user_one/missing_order/orphan/original.jpg';
    db.seed('orders/missing_order/assets/orphan', {
      ownerUid: identity.uid,
      orderId: 'missing_order',
      status: 'prepared',
      storagePath: orphanPath,
      expiresAt: Timestamp.fromMillis(now.toMillis() - 1),
    });
    storage.put(orphanPath, Buffer.from('prepared'));

    expect(await service.purgeExpiredAssets({ dryRun: true })).toMatchObject({
      eligible: 1,
      purged: 0,
      preparedPurged: 1,
    });
    expect(await service.purgeExpiredAssets()).toMatchObject({
      eligible: 1,
      purged: 1,
      preparedPurged: 1,
      failed: [],
    });
    expect(storage.files.has(readyPath)).toBe(false);
    expect(storage.files.has(orphanPath)).toBe(false);
    expect(db.value('orders/order_abandoned')).toMatchObject({
      payment: { status: 'expired' },
      fulfillment: { status: 'cancelled' },
      retention: { status: 'purged' },
    });
    expect(db.value('orders/missing_order/assets/orphan')).toMatchObject({
      status: 'purged',
      purgeReason: 'prepared_upload_expired',
    });
    expect(await service.purgeExpiredAssets()).toMatchObject({
      eligible: 0,
      purged: 0,
      preparedPurged: 0,
    });
  });

  it('never overwrites a completed-payment reconciliation during retention purge', async () => {
    const now = Timestamp.fromMillis(Date.UTC(2026, 7, 31));
    const { db, storage, service } = createService({ now: () => now });
    const path = 'print-orders/user_one/order_purge_payment/asset/original.jpg';
    db.seed('orders/order_purge_payment', baseOrder({
      payment: { method: 'paypal', status: 'pending', paypalOrderId: 'PAYPAL-LATE' },
      fulfillment: { method: 'studio_pickup', status: 'awaiting_payment' },
      retention: { status: 'scheduled', deleteAfter: Timestamp.fromMillis(now.toMillis() - 1) },
    }));
    seedReadyAsset(db, 'order_purge_payment', 'asset', { storagePath: path });
    storage.put(path, Buffer.from('jpeg'));
    storage.onDelete = async () => {
      const current = db.value('orders/order_purge_payment');
      db.seed('orders/order_purge_payment', {
        ...current,
        payment: { ...current.payment, status: 'paid_action_required' },
        fulfillment: { ...current.fulfillment, status: 'cancelled' },
      });
    };

    await service.purgeExpiredAssets();
    expect(db.value('orders/order_purge_payment')).toMatchObject({
      payment: { status: 'paid_action_required' },
      retention: { status: 'purged' },
    });
  });

  it('records a late completed PayPal webhook as manual action when originals are purging', async () => {
    const paypal = paypalFake();
    const { db, service } = createService({ paypal });
    db.seed('orders/order_late_webhook', baseOrder({
      totals: { subtotalCents: 1000, discountCents: 0, totalCents: 1000 },
      totale: 10,
      saldo: 10,
      payment: {
        method: 'paypal',
        status: 'pending',
        paypalOrderId: 'PAYPAL-LATE-WEBHOOK',
        invoiceId: 'ST-2026-TEST0001-A1',
      },
      fulfillment: { method: 'studio_pickup', status: 'awaiting_payment' },
      retention: { status: 'purging', purgeClaimToken: 'cleanup-claim' },
    }));
    const event = {
      id: 'WH-EVENT-LATE-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'CAPTURE-LATE-1',
        status: 'COMPLETED',
        custom_id: 'order_late_webhook',
        invoice_id: 'ST-2026-TEST0001-A1',
        amount: { currency_code: 'EUR', value: '10.00' },
        supplementary_data: { related_ids: { order_id: 'PAYPAL-LATE-WEBHOOK' } },
      },
    };

    await expect(service.paypalWebhook({}, event)).resolves.toMatchObject({
      ok: true,
      orderId: 'order_late_webhook',
    });
    expect(db.value('orders/order_late_webhook')).toMatchObject({
      payment: { status: 'paid_action_required' },
      fulfillment: { status: 'cancelled' },
      retention: { status: 'purging', reconciliationRequired: true },
    });
    expect(db.countCollection('cashMovements')).toBe(1);
  });

  it('claims an expired prepared upload before deletion so finalize cannot win the race', async () => {
    const now = Timestamp.fromMillis(Date.UTC(2026, 7, 31));
    const { db, storage, service } = createService({ now: () => now });
    const path = 'print-orders/user_one/order_prepare_race/asset/original.jpg';
    db.seed('orders/order_prepare_race', baseOrder({
      printShop: {
        ...baseOrder().printShop,
        uploadQuota: { assetCount: 1, totalDeclaredBytes: 4, readyCount: 0, finalizingCount: 0 },
      },
    }));
    db.seed('orders/order_prepare_race/assets/asset', {
      ownerUid: identity.uid,
      orderId: 'order_prepare_race',
      status: 'prepared',
      originalName: 'asset.jpg',
      declaredContentType: 'image/jpeg',
      declaredSizeBytes: 4,
      storagePath: path,
      expiresAt: Timestamp.fromMillis(now.toMillis() - 1),
    });
    storage.put(path, Buffer.from('jpeg'));
    let finalizeError: any;
    storage.onDelete = async () => {
      try {
        await service.finalizeUpload(identity, 'order_prepare_race', 'asset');
      } catch (error) {
        finalizeError = error;
      }
    };

    await service.purgeExpiredAssets();
    expect(finalizeError).toMatchObject({ code: 'asset_not_prepared', status: 409 });
    expect(db.value('orders/order_prepare_race/assets/asset').status).toBe('purged');
  });

  it('arms GCS customTime on every ready original when delivered', async () => {
    const now = Timestamp.fromMillis(Date.UTC(2026, 7, 31));
    const { db, storage, service } = createService({ now: () => now });
    db.seed('orders/order_delivered_lifecycle', baseOrder({
      payment: { method: 'paypal', status: 'paid' },
      fulfillment: { method: 'studio_pickup', status: 'ready_for_pickup' },
      printShop: {
        ...baseOrder().printShop,
        items: [snapshotItem(['asset_used'])],
        assetCount: 1,
      },
    }));
    seedReadyAsset(db, 'order_delivered_lifecycle', 'asset_used');
    seedReadyAsset(db, 'order_delivered_lifecycle', 'asset_unused');
    const used = db.value('orders/order_delivered_lifecycle/assets/asset_used').storagePath;
    const unused = db.value('orders/order_delivered_lifecycle/assets/asset_unused').storagePath;
    storage.put(used, Buffer.from('used'));
    storage.put(unused, Buffer.from('unused'));

    await service.updateAdminStatus('order_delivered_lifecycle', 'delivered', 'admin@example.com');
    await vi.waitFor(() => {
      expect(storage.metadataUpdates.map(update => update.path).sort()).toEqual([used, unused].sort());
      expect(db.value('orders/order_delivered_lifecycle').retention.gcsLifecycle)
        .toMatchObject({ status: 'armed', originalAssetCount: 2, failedAssetCount: 0 });
    });
    expect(storage.files.get(unused)?.metadata).toBeTruthy();
  });

  it('does not reveal another customer order', async () => {
    const { db, service } = createService();
    db.seed('orders/order_private', baseOrder({ ownerUid: 'someone_else' }));
    await expect(service.ownerOrder(identity, 'order_private')).rejects.toBeInstanceOf(
      PrintShopHttpError,
    );
    await expect(service.ownerOrder(identity, 'order_private')).rejects.toMatchObject({
      status: 404,
      code: 'order_not_found',
    });
  });
});

describe('PrintShopService privacy, quotas and abuse guardrails', () => {
  it('returns an allowlisted customer projection for create, list and detail', async () => {
    const { db, service } = createService();
    const created = await service.createDraft(identity, {}, 'projection-create-key');
    expect(created.ownerUid).toBeUndefined();
    expect(created.clienteId).toBeUndefined();
    expect(created.retention).toBeUndefined();

    const internal = db.value(`orders/${created.id}`);
    db.seed(`orders/${created.id}`, {
      ...internal,
      cashMovementId: 'cash-secret',
      retention: { status: 'scheduled', deleteAfter: Timestamp.now() },
      payment: {
        ...internal.payment,
        paypalOrderId: 'provider-secret',
        providerPayload: { secret: true },
      },
      fulfillment: {
        ...internal.fulfillment,
        laboratory: { laboratoryId: 'lab-secret', laboratoryName: 'Costo Lab' },
        history: [{ by: 'admin@example.com', note: 'nota interna' }],
      },
      printShop: {
        ...internal.printShop,
        supplierCosts: [{ amountCents: 999 }],
        estimatedMarginCents: 1,
      },
    });
    seedReadyAsset(db, created.id, 'asset_projection', {
      storagePath: 'private/storage/path.jpg',
      sha256: 'private-sha',
      finalizeClaimToken: 'claim-secret',
    });

    const [listed] = await service.listOwnerOrders(identity);
    const detail = await service.ownerOrder(identity, created.id);
    for (const response of [listed, detail]) {
      const serialized = JSON.stringify(response);
      expect(serialized).not.toContain('cash-secret');
      expect(serialized).not.toContain('provider-secret');
      expect(serialized).not.toContain('lab-secret');
      expect(serialized).not.toContain('supplierCosts');
      expect(serialized).not.toContain('estimatedMargin');
      expect(serialized).not.toContain('nota interna');
      expect(serialized).not.toContain('ownerUid');
      expect(serialized).not.toContain('clienteId');
      expect(serialized).not.toContain('retention');
    }
    expect(JSON.stringify(detail)).not.toContain('private/storage');
    expect(JSON.stringify(detail)).not.toContain('private-sha');
    expect(JSON.stringify(detail)).not.toContain('claim-secret');
  });

  it('synchronizes checkout contact data into the CRM without overwriting external records', async () => {
    const { db, service } = createService();
    const created = await service.createDraft(identity, {}, 'crm-create-key');
    const clientId = db.value(`orders/${created.id}`).clienteId;
    await service.updateDraft(identity, created.id, {
      customer: { name: 'Mario De Rossi', phone: '+39 333 1234567' },
    });
    expect(db.value(`clienti/${clientId}`)).toMatchObject({
      nome: 'Mario',
      cognome: 'De Rossi',
      whatsapp: '+39 333 1234567',
      cellulare1: '+39 333 1234567',
    });

    db.seed('clienti/external_client', {
      source: 'booking',
      nome: 'Nome Curato',
      cognome: 'CRM',
      whatsapp: '+39000111',
    });
    db.seed('orders/external_order', baseOrder({ clienteId: 'external_client' }));
    await service.updateDraft(identity, 'external_order', {
      customer: { name: 'Nome Shop', phone: '+39000999' },
    });
    expect(db.value('clienti/external_client')).toMatchObject({
      nome: 'Nome Curato',
      cognome: 'CRM',
      whatsapp: '+39000111',
    });
  });

  it('neutralizes spreadsheet formulas in customer-controlled manifest filenames', async () => {
    const { db, service } = createService();
    db.seed('orders/order_csv', baseOrder({
      printShop: { ...baseOrder().printShop, items: [snapshotItem(['asset_csv'])] },
    }));
    seedReadyAsset(db, 'order_csv', 'asset_csv', {
      originalName: '  =HYPERLINK("https://evil.invalid","x").jpg',
    });
    const csv = await service.manifestCsv('order_csv');
    expect(csv).toContain("'  =HYPERLINK");
    expect(csv).not.toContain('"  =HYPERLINK');
  });

  it('creates a self-contained HTML manifest readable in a browser', async () => {
    const { db, service } = createService();
    db.seed('orders/order_html', baseOrder({
      printShop: { ...baseOrder().printShop, items: [snapshotItem(['asset_html'])] },
    }));
    seedReadyAsset(db, 'order_html', 'asset_html', { originalName: '<foto & prova>.jpg' });
    const html = await service.manifestHtml('order_html');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Distinta di stampa');
    expect(html).toContain('&lt;foto &amp; prova&gt;.jpg');
    expect(html).toContain('Foto intera con bordo bianco');
    expect(html).not.toContain('<foto & prova>');
  });

  it('hides admin-deleted orders while retaining paid financial records', async () => {
    const { db, service } = createService();
    db.seed('orders/order_admin_paid', baseOrder({
      payment: { method: 'paypal', status: 'paid', paypalCaptureId: 'CAPTURE-ADMIN' },
      fulfillment: { method: 'studio_pickup', status: 'submitted' },
    }));
    await expect(service.removeAdminOrder('order_admin_paid', 'admin@example.com'))
      .resolves.toEqual({ success: true, financialRecordRetained: true });
    expect(db.value('orders/order_admin_paid')).toMatchObject({
      payment: { status: 'paid', paypalCaptureId: 'CAPTURE-ADMIN' },
      adminVisibility: { hidden: true, financialRecordRetained: true },
    });
    expect(await service.adminOrders()).toEqual([]);
  });

  it('keeps the asset retryable when Storage deletion fails', async () => {
    const { db, storage, service } = createService();
    const path = 'print-orders/user_one/order_remove/asset/original.jpg';
    db.seed('orders/order_remove', baseOrder({
      printShop: {
        ...baseOrder().printShop,
        uploadQuota: { assetCount: 1, totalDeclaredBytes: 4, readyCount: 1, finalizingCount: 0 },
      },
    }));
    seedReadyAsset(db, 'order_remove', 'asset', {
      storagePath: path,
      declaredSizeBytes: 4,
      sizeBytes: 4,
    });
    storage.put(path, Buffer.from('jpeg'));
    storage.failDeletePaths.add(path);

    await expect(service.removeAsset(identity, 'order_remove', 'asset'))
      .rejects.toMatchObject({ code: 'asset_delete_failed', status: 503 });
    expect(storage.files.has(path)).toBe(true);
    expect(db.value('orders/order_remove/assets/asset').status).toBe('delete_failed');
    storage.failDeletePaths.delete(path);
    await expect(service.removeAsset(identity, 'order_remove', 'asset')).resolves.toEqual({
      quoteInvalidated: false,
    });
    expect(storage.files.has(path)).toBe(false);
    expect(db.value('orders/order_remove/assets/asset')).toBeUndefined();
    expect(db.value('orders/order_remove').printShop.uploadQuota.assetCount).toBe(0);
  });

  it('cancels and purges an unpaid owner draft idempotently but never deletes paid orders', async () => {
    const { db, storage, service } = createService();
    const path = 'print-orders/user_one/order_cancel/asset/original.jpg';
    db.seed('orders/order_cancel', baseOrder({
      printShop: {
        ...baseOrder().printShop,
        uploadQuota: { assetCount: 1, totalDeclaredBytes: 4, readyCount: 1, finalizingCount: 0 },
      },
    }));
    seedReadyAsset(db, 'order_cancel', 'asset', { storagePath: path });
    storage.put(path, Buffer.from('jpeg'));

    await expect(service.cancelOwnerDraft(identity, 'order_cancel')).resolves.toMatchObject({
      success: true,
      cancelled: true,
      idempotentReplay: false,
    });
    expect(storage.files.has(path)).toBe(false);
    expect(db.value('orders/order_cancel')).toMatchObject({
      payment: { status: 'expired' },
      fulfillment: { status: 'cancelled' },
      retention: { status: 'purged' },
    });
    await expect(service.cancelOwnerDraft(identity, 'order_cancel')).resolves.toMatchObject({
      idempotentReplay: true,
    });
    await expect(service.ownerOrder(identity, 'order_cancel')).rejects.toMatchObject({
      code: 'order_not_found',
      status: 404,
    });
    expect((await service.listOwnerOrders(identity)).map(order => order.id))
      .not.toContain('order_cancel');

    db.seed('orders/order_paid_delete', baseOrder({
      payment: { method: 'paypal', status: 'paid' },
      fulfillment: { method: 'studio_pickup', status: 'submitted' },
    }));
    await expect(service.cancelOwnerDraft(identity, 'order_paid_delete'))
      .rejects.toMatchObject({ code: 'paid_order_not_deletable', status: 409 });
  });

  it('enforces the durable 500-asset quota without rescanning asset documents per upload', async () => {
    const { db, service } = createService();
    db.seed('orders/order_500', baseOrder());
    for (let index = 0; index < 500; index++) {
      await service.prepareUpload(identity, 'order_500', {
        fileName: `photo-${index}.jpg`,
        contentType: 'image/jpeg',
        sizeBytes: 100,
      });
    }
    expect(db.countCollection('orders/order_500/assets')).toBe(500);
    await expect(service.prepareUpload(identity, 'order_500', {
      fileName: 'photo-over-limit.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 100,
    })).rejects.toMatchObject({ code: 'user_upload_quota_exceeded', status: 409 });
  });

  it('limits active drafts and aggregate UID upload usage across orders', async () => {
    const { db, service } = createService();
    for (let index = 0; index < 10; index++) {
      db.seed(`orders/active_${index}`, baseOrder({
        printShop: {
          ...baseOrder().printShop,
          uploadQuota: index === 0
            ? { assetCount: 500, totalDeclaredBytes: 50_000, readyCount: 0, finalizingCount: 0 }
            : { assetCount: 0, totalDeclaredBytes: 0, readyCount: 0, finalizingCount: 0 },
        },
      }));
    }
    await expect(service.createDraft(identity, {}, 'draft-over-limit'))
      .rejects.toMatchObject({ code: 'active_draft_limit', status: 409 });
    await expect(service.prepareUpload(identity, 'active_1', {
      fileName: 'over-account-limit.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 100,
    })).rejects.toMatchObject({ code: 'user_upload_quota_exceeded', status: 409 });
  });

  it('enforces the persistent per-UID finalization concurrency limit across orders', async () => {
    const { db, storage, service } = createService();
    for (let index = 0; index < 4; index++) {
      db.seed(`orders/finalizing_${index}`, baseOrder({
        printShop: {
          ...baseOrder().printShop,
          uploadQuota: { assetCount: 1, totalDeclaredBytes: 100, readyCount: 0, finalizingCount: 1 },
        },
      }));
    }
    const buffer = await jpeg({ r: 1, g: 2, b: 3 });
    db.seed('orders/finalizing_candidate', baseOrder({
      printShop: {
        ...baseOrder().printShop,
        uploadQuota: {
          assetCount: 1,
          totalDeclaredBytes: buffer.length,
          readyCount: 0,
          finalizingCount: 0,
        },
      },
    }));
    seedPreparedAsset(db, storage, 'finalizing_candidate', 'asset', buffer);
    await expect(service.finalizeUpload(identity, 'finalizing_candidate', 'asset'))
      .rejects.toMatchObject({ code: 'finalize_user_concurrency_limit', status: 429 });
    expect(db.value('orders/finalizing_candidate/assets/asset').status).toBe('prepared');
  });

  it('enforces a process-wide Sharp semaphore across different users', async () => {
    const previous = process.env.PRINT_SHOP_MAX_PROCESS_FINALIZATIONS;
    process.env.PRINT_SHOP_MAX_PROCESS_FINALIZATIONS = '2';
    try {
      const { db, storage, service } = createService();
      const buffer = await jpeg({ r: 80, g: 120, b: 160 });
      let downloads = 0;
      let releaseDownloads!: () => void;
      const gate = new Promise<void>(resolve => { releaseDownloads = resolve; });
      storage.onDownload = async () => {
        downloads++;
        await gate;
      };
      const identities = Array.from({ length: 3 }, (_, index) => ({
        uid: `semaphore_user_${index}`,
        email: `semaphore${index}@example.com`,
      }));
      identities.forEach((user, index) => {
        db.seed(`orders/semaphore_${index}`, baseOrder({
          ownerUid: user.uid,
          customer: { name: 'Cliente', email: user.email },
          emailCliente: user.email,
          printShop: {
            ...baseOrder().printShop,
            uploadQuota: {
              assetCount: 1,
              totalDeclaredBytes: buffer.length,
              readyCount: 0,
              finalizingCount: 0,
            },
          },
        }));
        seedPreparedAsset(db, storage, `semaphore_${index}`, 'asset', buffer, user.uid);
      });
      const first = service.finalizeUpload(identities[0], 'semaphore_0', 'asset');
      await vi.waitFor(() => expect(downloads).toBe(1));
      const second = service.finalizeUpload(identities[1], 'semaphore_1', 'asset');
      await vi.waitFor(() => expect(downloads).toBe(2));
      await expect(service.finalizeUpload(identities[2], 'semaphore_2', 'asset'))
        .rejects.toMatchObject({ code: 'finalize_busy', status: 429 });
      releaseDownloads();
      await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    } finally {
      if (previous === undefined) delete process.env.PRINT_SHOP_MAX_PROCESS_FINALIZATIONS;
      else process.env.PRINT_SHOP_MAX_PROCESS_FINALIZATIONS = previous;
    }
  });

  it('rejects decompression bombs above the configured pixel ceiling', async () => {
    const previous = process.env.PRINT_SHOP_MAX_IMAGE_PIXELS;
    process.env.PRINT_SHOP_MAX_IMAGE_PIXELS = '1000000';
    try {
      const { db, storage, service } = createService();
      const oversizedPixels = await sharp({
        create: {
          width: 1_100,
          height: 1_000,
          channels: 3,
          background: { r: 10, g: 20, b: 30 },
        },
      }).jpeg().toBuffer();
      db.seed('orders/order_pixel_limit', baseOrder({
        printShop: {
          ...baseOrder().printShop,
          uploadQuota: {
            assetCount: 1,
            totalDeclaredBytes: oversizedPixels.length,
            readyCount: 0,
            finalizingCount: 0,
          },
        },
      }));
      seedPreparedAsset(db, storage, 'order_pixel_limit', 'asset', oversizedPixels);
      await expect(service.finalizeUpload(identity, 'order_pixel_limit', 'asset'))
        .rejects.toMatchObject({ code: 'invalid_jpeg', status: 400 });
      expect(db.value('orders/order_pixel_limit/assets/asset').status).toBe('prepared');
    } finally {
      if (previous === undefined) delete process.env.PRINT_SHOP_MAX_IMAGE_PIXELS;
      else process.env.PRINT_SHOP_MAX_IMAGE_PIXELS = previous;
    }
  });

  it('fails closed when any active shop catalog product has invalid pricing', async () => {
    const { db, service } = createService();
    const product = PRINT_SHOP_CATALOG.find(item => item.printSpec.pricing.model === 'tiered')!;
    seedProduct(db, product);
    seedProduct(db, {
      ...product,
      id: 'invalid-price-product',
      sku: 'INVALID-PRICE',
      printSpec: {
        ...product.printSpec,
        pricing: { model: 'tiered', tiers: [{ minQuantity: 1, unitPriceCents: -1 }] },
      },
    });
    await expect(service.publicCatalog()).rejects.toMatchObject({
      code: 'catalog_invalid',
      status: 503,
    });
  });

  it('updates catalog pricing with immutable SKU, contiguous tiers and version audit', async () => {
    const { db, service } = createService();
    const product = PRINT_SHOP_CATALOG.find(item => item.printSpec.pricing.model === 'tiered')!;
    seedProduct(db, product);
    const pricing = product.printSpec.pricing;
    if (pricing.model !== 'tiered') throw new Error('fixture tiered attesa');
    const updated = await service.updateAdminCatalogProduct(product.sku, {
      printSpec: {
        ...product.printSpec,
        pricing: {
          model: 'tiered',
          tiers: pricing.tiers.map((tier, index) => ({
            ...tier,
            unitPriceCents: tier.unitPriceCents + (index === 0 ? 1 : 0),
          })),
        },
      },
    }, 'admin@example.com');
    expect(updated.sku).toBe(product.sku);
    expect(updated.catalogVersion).toBe(product.catalogVersion + 1);
    expect((updated.printSpec.pricing as any).tiers[0].unitPriceCents)
      .toBe(pricing.tiers[0].unitPriceCents + 1);
    expect(db.value(`products/${product.id}`)).toMatchObject({
      sku: product.sku,
      updatedBy: 'admin@example.com',
      catalogVersion: product.catalogVersion + 1,
    });

    const badTiers = pricing.tiers.map(tier => ({ ...tier }));
    badTiers[1] = { ...badTiers[1], minQuantity: badTiers[1].minQuantity + 1 };
    await expect(service.updateAdminCatalogProduct(product.sku, {
      printSpec: {
        ...product.printSpec,
        pricing: { model: 'tiered', tiers: badTiers },
      },
    }, 'admin@example.com')).rejects.toMatchObject({
      code: 'catalog_validation_failed',
      status: 400,
    });

    await expect(service.updateAdminCatalogProduct(product.sku, {
      printSpec: {
        ...product.printSpec,
        finishes: ['matte'],
      },
    }, 'admin@example.com')).rejects.toMatchObject({
      code: 'catalog_validation_failed',
      status: 400,
    });

    await expect(service.updateAdminCatalogProduct(product.sku, {
      printSpec: {
        ...product.printSpec,
        fitModes: ['border'],
      },
    }, 'admin@example.com')).rejects.toMatchObject({
      code: 'catalog_validation_failed',
      status: 400,
    });
  });

  it('enforces exactly 50 distinct single photos for the Polaroid catalog package', async () => {
    const { db, service } = createService();
    const product = PRINT_SHOP_CATALOG.find(item => item.printSpec.pricing.model === 'package')!;
    seedProduct(db, product);
    const pricing = product.printSpec.pricing;
    if (pricing.model !== 'package') throw new Error('fixture package attesa');
    await expect(service.updateAdminCatalogProduct(product.sku, {
      printSpec: {
        ...product.printSpec,
        pricing: { ...pricing, packageSize: 49 },
      },
    }, 'admin@example.com')).rejects.toMatchObject({
      code: 'catalog_validation_failed',
      status: 400,
    });

    await expect(service.updateAdminCatalogProduct(product.sku, {
      categoria: 'stampe-foto',
      printSpec: product.printSpec,
    }, 'admin@example.com')).rejects.toMatchObject({
      code: 'catalog_validation_failed',
      status: 400,
    });
  });
});

describe('PrintShopService laboratory safety', () => {
  it('records and updates laboratory costs in the financial cash ledger without duplicates', async () => {
    const { db, service } = createService();
    db.seed('orders/order_lab_cost', baseOrder({
      totals: { subtotalCents: 2000, discountCents: 0, totalCents: 2000 },
      payment: { method: 'paypal', status: 'paid', paypalFeeCents: 50 },
      fulfillment: { method: 'studio_pickup', status: 'ready_to_print' },
    }));
    db.seed('labShipments/shipment_cost', {
      sourceType: 'print_shop',
      orderId: 'order_lab_cost',
      labId: 'lab_cost',
      labNome: 'Laboratorio Test',
      status: 'da_inviare',
    });

    await service.setLabShipmentCost('order_lab_cost', 'shipment_cost', 6.5, 'admin@example.com');
    expect(db.countCollection('cashMovements')).toBe(1);
    const movementId = `print_lab_cost_${createHash('sha256').update('shipment_cost').digest('hex').slice(0, 32)}`;
    expect(db.value(`cashMovements/${movementId}`)).toMatchObject({
      tipo: 'uscita',
      categoria: 'Produzione stampe',
      importo: 6.5,
      origine: 'print_shop',
      orderId: 'order_lab_cost',
    });
    expect(db.value('orders/order_lab_cost').printShop.estimatedMarginCents).toBe(1300);

    await service.setLabShipmentCost('order_lab_cost', 'shipment_cost', 7, 'admin@example.com');
    expect(db.countCollection('cashMovements')).toBe(1);
    expect(db.value(`cashMovements/${movementId}`).importo).toBe(7);
    expect(db.value('orders/order_lab_cost').printShop.estimatedMarginCents).toBe(1250);

    await service.setLabShipmentCost('order_lab_cost', 'shipment_cost', 0, 'admin@example.com');
    expect(db.countCollection('cashMovements')).toBe(0);
  });

  it('includes only assets referenced by the paid quote in archive and Drive transfer', async () => {
    const uploads: Array<{ name: string; body: Buffer }> = [];
    const drive = {
      findOrCreateLabParentFolder: vi.fn(async () => 'parent'),
      createShipmentFolder: vi.fn(async (_parent: string, _name: string, _metadata?: any) => ({
        folderId: 'folder',
        webViewLink: 'https://drive.test/folder',
      })),
      uploadStreamToDriveFolder: vi.fn(async (_folder: string, name: string, _mime: string, body: any) => {
        const chunks: Buffer[] = [];
        for await (const chunk of body) chunks.push(Buffer.from(chunk));
        const buffer = Buffer.concat(chunks);
        uploads.push({ name, body: buffer });
        return { fileId: `file_${uploads.length}`, size: buffer.length };
      }),
    };
    const { db, storage, service } = createService({ drive });
    db.seed('orders/order_lab_files', baseOrder({
      payment: { method: 'paypal', status: 'paid' },
      fulfillment: { method: 'studio_pickup', status: 'ready_to_print' },
      printShop: {
        ...baseOrder().printShop,
        items: [snapshotItem(['asset_used'])],
        assetCount: 1,
        copyCount: 1,
      },
    }));
    seedReadyAsset(db, 'order_lab_files', 'asset_used');
    seedReadyAsset(db, 'order_lab_files', 'asset_unused');
    storage.put(
      db.value('orders/order_lab_files/assets/asset_used').storagePath,
      Buffer.from('used'),
    );
    storage.put(
      db.value('orders/order_lab_files/assets/asset_unused').storagePath,
      Buffer.from('unused'),
    );
    db.seed('labs/lab_files', {
      nome: 'Lab File',
      email: 'lab-files@example.com',
      attivo: true,
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementSignedAt: Timestamp.now(),
      dataProcessingAgreementReference: 'DPA-LAB-FILES',
    });
    db.seed('labShipments/shipment_files', {
      sourceType: 'print_shop',
      orderId: 'order_lab_files',
      labId: 'lab_files',
      files: [],
      status: 'da_inviare',
      expiryDays: 20,
      transfer: { status: 'pending', total: 1, transferred: 0, failed: [] },
    });

    const archive = await service.archiveData('order_lab_files');
    expect(archive.assets.map(asset => asset.id)).toEqual(['asset_used']);
    expect(archive.manifestHtml).toContain('Distinta di stampa');
    await service.transferLabShipment('shipment_files');
    expect(drive.createShipmentFolder.mock.calls[0][1]).toBe('ST-2026-TEST0001');
    expect(drive.createShipmentFolder.mock.calls[0][2]).toMatchObject({
      deferPublicAccess: true,
    });
    expect(db.value('labShipments/shipment_files').expiresAt).toBeTruthy();
    expect(uploads).toHaveLength(2);
    expect(uploads.some(upload => upload.name.endsWith('-distinta.html'))).toBe(true);
    expect(uploads.some(upload => upload.name.includes('asset_used'))).toBe(true);
    expect(uploads.some(upload => upload.name.includes('asset_unused'))).toBe(false);
    expect(db.value('labShipments/shipment_files').files
      .filter((file: any) => file.kind === 'original')
      .map((file: any) => file.assetId)).toEqual(['asset_used']);
  });

  it('rejects laboratory actions for refunded or terminal orders', async () => {
    const drive = {
      findOrCreateLabParentFolder: vi.fn(),
      createShipmentFolder: vi.fn(),
      uploadStreamToDriveFolder: vi.fn(),
    };
    const { db, service } = createService({ drive });
    db.seed('orders/order_terminal', baseOrder({
      payment: { method: 'paypal', status: 'paid' },
      fulfillment: { method: 'studio_pickup', status: 'delivered' },
      printShop: { ...baseOrder().printShop, items: [snapshotItem(['asset_one'])] },
    }));
    await expect(
      service.createLabShipment('order_terminal', { labId: 'lab_one' }, 'admin@example.com'),
    ).rejects.toMatchObject({ code: 'lab_action_not_allowed', status: 409 });

    db.seed('orders/order_terminal', baseOrder({
      payment: { method: 'paypal', status: 'refunded' },
      fulfillment: { method: 'studio_pickup', status: 'cancelled' },
      printShop: { ...baseOrder().printShop, items: [snapshotItem(['asset_one'])] },
    }));
    db.seed('labShipments/shipment_terminal', {
      sourceType: 'print_shop',
      orderId: 'order_terminal',
      status: 'da_inviare',
      transfer: { status: 'pending', total: 1, transferred: 0, failed: [] },
    });
    await expect(service.transferLabShipment('shipment_terminal')).rejects.toMatchObject({
      code: 'payment_required',
      status: 409,
    });
    expect(drive.findOrCreateLabParentFolder).not.toHaveBeenCalled();
  });

  it('claims lab email delivery once and replays without duplicate messages', async () => {
    let releaseSend!: () => void;
    const sendGate = new Promise<void>(resolve => { releaseSend = resolve; });
    const send = vi.fn(async () => sendGate);
    const mail = {
      send,
      studio: vi.fn(async () => ({
        name: 'Image Studio',
        email: 'studio@example.com',
        phone: '+39000',
      })),
    };
    const drive = {
      shareShipmentFolderWithUser: vi.fn(async () => ({
        webViewLink: 'https://drive.test/send',
        permissionId: 'permission_send',
      })),
      revokeShipmentFolderPermission: vi.fn(async () => undefined),
    };
    const { db, service } = createService({ mail, drive });
    db.seed('orders/order_send', baseOrder({
      payment: { method: 'paypal', status: 'paid' },
      fulfillment: { method: 'studio_pickup', status: 'ready_to_print' },
      printShop: {
        ...baseOrder().printShop,
        items: [snapshotItem(['asset_send'])],
        assetCount: 1,
      },
    }));
    db.seed('labs/lab_send', {
      nome: 'Lab Test',
      email: 'lab@example.com',
      attivo: true,
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementSignedAt: Timestamp.now(),
      dataProcessingAgreementReference: 'DPA-LAB-SEND',
    });
    db.seed('labShipments/shipment_send', {
      sourceType: 'print_shop',
      orderId: 'order_send',
      labId: 'lab_send',
      status: 'da_inviare',
      expiryDays: 20,
      shareableLink: 'https://drive.test/send',
      driveFolderId: 'folder_send',
      transfer: { status: 'completed', total: 1, transferred: 1, failed: [] },
    });

    const first = service.sendLabShipment(
      'order_send',
      'shipment_send',
      {},
      'admin@example.com',
    );
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await expect(service.sendLabShipment(
      'order_send',
      'shipment_send',
      {},
      'admin@example.com',
    )).rejects.toMatchObject({ code: 'send_running', status: 409 });
    releaseSend();
    await expect(first).resolves.toMatchObject({ idempotentReplay: false, status: 'inviato' });
    await expect(service.sendLabShipment(
      'order_send',
      'shipment_send',
      {},
      'admin@example.com',
    )).resolves.toMatchObject({ idempotentReplay: true, status: 'inviato' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(drive.shareShipmentFolderWithUser).toHaveBeenCalledWith(
      'folder_send',
      'lab@example.com',
    );
    expect(db.value('labShipments/shipment_send')).toMatchObject({
      drivePermissionId: 'permission_send',
      drivePermissionEmail: 'lab@example.com',
    });
    expect(db.value('orders/order_send').fulfillment.status).toBe('sent_to_laboratory');
  });

  it('never regresses a concurrently delivered order after the lab email is sent', async () => {
    let db!: FakeFirestore;
    const shareShipmentFolderWithUser = vi.fn(async () => ({
      webViewLink: 'https://drive.test/race',
      permissionId: 'permission_race',
    }));
    const send = vi.fn(async () => {
      const order = db.value('orders/order_race');
      db.seed('orders/order_race', {
        ...order,
        fulfillment: { ...order.fulfillment, status: 'delivered' },
      });
    });
    const created = createService({
      mail: {
        send,
        studio: vi.fn(async () => ({ name: 'Studio', email: 's@test', phone: '' })),
      },
      drive: {
        shareShipmentFolderWithUser,
        revokeShipmentFolderPermission: vi.fn(async () => undefined),
      },
    });
    db = created.db;
    db.seed('orders/order_race', baseOrder({
      payment: { method: 'paypal', status: 'paid' },
      fulfillment: { method: 'studio_pickup', status: 'ready_to_print' },
      printShop: { ...baseOrder().printShop, items: [snapshotItem(['asset_race'])] },
    }));
    db.seed('labs/lab_race', {
      nome: 'Lab',
      email: 'lab@test',
      attivo: true,
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementSignedAt: Timestamp.now(),
      dataProcessingAgreementReference: 'DPA-LAB-RACE',
    });
    db.seed('labShipments/shipment_race', {
      sourceType: 'print_shop',
      orderId: 'order_race',
      labId: 'lab_race',
      status: 'da_inviare',
      expiryDays: 20,
      shareableLink: 'https://drive.test/race',
      driveFolderId: 'folder_race',
      drivePermissionId: 'permission_race',
      drivePermissionEmail: 'lab@test',
      transfer: { status: 'completed', total: 1, transferred: 1, failed: [] },
    });

    await created.service.sendLabShipment(
      'order_race',
      'shipment_race',
      {},
      'admin@example.com',
    );
    // Anche un permissionId persistito viene verificato: l'helper revoca
    // eventuali permessi `anyone`/reader obsoleti prima dell'email.
    expect(shareShipmentFolderWithUser).toHaveBeenCalledWith('folder_race', 'lab@test');
    expect(db.value('orders/order_race').fulfillment.status).toBe('delivered');
    expect(db.value('labShipments/shipment_race').sendState.orderAdvanceSkipped).toBe(true);
  });

  it('blocks print files until the laboratory DPA is explicitly signed', async () => {
    const { db, service } = createService();
    db.seed('orders/order_dpa', baseOrder({
      payment: { method: 'paypal', status: 'paid' },
      fulfillment: { method: 'studio_pickup', status: 'ready_to_print' },
      printShop: { ...baseOrder().printShop, items: [snapshotItem(['asset_dpa'])] },
    }));
    db.seed('labs/lab_dpa', {
      nome: 'Lab senza accordo',
      email: 'lab@example.com',
      attivo: true,
      dataProcessingAgreementStatus: 'pending',
    });

    await expect(service.createLabShipment(
      'order_dpa',
      { labId: 'lab_dpa' },
      'admin@example.com',
    )).rejects.toMatchObject({ code: 'lab_dpa_required', status: 409 });

    db.seed('labs/lab_dpa', {
      nome: 'Lab con stato ma prova incompleta',
      email: 'lab@example.com',
      attivo: true,
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementReference: 'DPA-SENZA-DATA',
    });
    await expect(service.createLabShipment(
      'order_dpa',
      { labId: 'lab_dpa' },
      'admin@example.com',
    )).rejects.toMatchObject({ code: 'lab_dpa_required', status: 409 });

    db.seed('labs/lab_dpa', {
      nome: 'Lab con accordo completo',
      email: 'lab@example.com',
      attivo: true,
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementSignedAt: Timestamp.now(),
      dataProcessingAgreementReference: 'DPA-COMPLETO',
    });
    await expect(service.createLabShipment(
      'order_dpa',
      { labId: 'lab_dpa' },
      'admin@example.com',
    )).resolves.toMatchObject({ labId: 'lab_dpa', reused: false });
    expect(db.countCollection('labShipments')).toBe(1);
  });
});
