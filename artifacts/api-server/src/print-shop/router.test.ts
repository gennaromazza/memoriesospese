import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import sharp from 'sharp';
import { PRINT_SHOP_CATALOG } from '@shared/print-shop-catalog';
import { PrintShopService } from './service.js';
import { FakeFirestore, FakeStorage } from './test-fakes.js';
import {
  PRINT_SHOP_UPLOAD_RATE_LIMIT,
  uidRateLimiter,
} from './rate-limit.js';

vi.mock('../firebase-admin.js', () => ({ db: {}, storage: {} }));
vi.mock('../email-routes.js', () => ({ getStudioContactInfo: vi.fn(), sendGmailEmail: vi.fn() }));
vi.mock('../google-drive.js', () => ({
  createShipmentFolder: vi.fn(), deleteDriveFile: vi.fn(), findShipmentFolderByShipmentId: vi.fn(),
  findOrCreateLabParentFolder: vi.fn(), revokeShipmentFolderPermission: vi.fn(),
  shareShipmentFolderWithUser: vi.fn(), uploadStreamToDriveFolder: vi.fn(),
  findDriveFilesInFolder: vi.fn(),
}));
vi.mock('./paypal-orders.js', async actual => ({
  ...await actual<any>(), loadPayPalOrdersConfig: () => ({ environment: 'sandbox' }),
}));
import { createPrintShopRouter } from './router.js';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve());
    server.closeAllConnections();
  })));
});

describe('print-shop upload rate limiting', () => {
  it('allows prepare and finalize for a 50-photo Polaroid package', () => {
    const limiter = uidRateLimiter(PRINT_SHOP_UPLOAD_RATE_LIMIT, 10 * 60_000);
    const next = vi.fn();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const response = {
      setHeader: vi.fn(),
      status,
    } as any;
    const request = { user: { uid: 'polaroid_customer' }, ip: '127.0.0.1' } as any;

    // Ogni fotografia usa due chiamate autenticate: prepare + finalize.
    for (let call = 0; call < 50 * 2; call++) {
      limiter(request, response, next);
    }

    expect(next).toHaveBeenCalledTimes(100);
    expect(status).not.toHaveBeenCalledWith(429);
    expect(PRINT_SHOP_UPLOAD_RATE_LIMIT).toBeGreaterThanOrEqual(100);
  });
});

describe('print-shop admin manifest download route', () => {
  it('returns the production HTML without sale prices or currency amounts', async () => {
    const db = new FakeFirestore();
    const storage = new FakeStorage();
    const product = PRINT_SHOP_CATALOG.find(item => item.printSpec.pricing.model === 'tiered')!;
    const service = new PrintShopService({
      db,
      storage,
      paypal: {} as any,
    });
    db.seed('orders/order_download', {
      orderType: 'print_shop',
      ownerUid: 'admin',
      orderNumber: 'ST-2026-DOWNLOAD01',
      customer: { name: 'Studio Test' },
      totals: { subtotalCents: 98765, discountCents: 0, totalCents: 98765 },
      payment: { method: 'paypal', status: 'paid' },
      fulfillment: { method: 'studio_pickup', status: 'submitted' },
      printShop: {
        assetCount: 1,
        copyCount: 3,
        items: [{
          productId: product.id,
          sku: product.sku,
          productName: product.nome,
          category: product.categoria,
          catalogVersion: product.catalogVersion,
          widthMm: product.printSpec.widthMm,
          heightMm: product.printSpec.heightMm,
          finish: 'matte',
          fitMode: 'border',
          pricingModel: 'tiered',
          unitPriceCents: 50,
          lineSubtotalCents: 150,
          lineDiscountCents: 0,
          lineTotalCents: 150,
          assetCount: 1,
          copyCount: 3,
          assignments: [{ assetId: 'asset_download', copies: 3 }],
        }],
      },
    });
    db.seed('orders/order_download/assets/asset_download', {
      status: 'ready',
      originalName: 'foto-produzione.jpg',
      widthPx: 2400,
      heightPx: 3600,
      storagePath: 'print-orders/admin/order_download/asset_download/original.jpg',
    });

    const app = express();
    app.use('/api/print-shop', createPrintShopRouter({
      service,
      storage,
      adminEmails: ['admin@example.test'],
      authenticate(req: any, _res, next) {
        req.user = { uid: 'admin', email: 'admin@example.test' };
        next();
      },
    }));
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise<void>(resolve => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;

    const response = await fetch(
      `http://127.0.0.1:${port}/api/print-shop/admin/orders/order_download/manifest?format=html`,
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="order_download-distinta.html"',
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(html).toContain('Ordine ST-2026-DOWNLOAD01');
    expect(html).toContain('Formato');
    expect(html).toContain(`${product.printSpec.widthMm} × ${product.printSpec.heightMm} mm`);
    expect(html).toContain(product.nome);
    expect(html).toContain('Opaca');
    expect(html).toContain('Foto intera con bordo bianco');
    expect(html).toContain('foto-produzione.jpg');
    expect(html).toContain('class="copies">3</td>');
    expect(html).not.toContain('Totale ordine');
    expect(html).not.toContain('987,65');
    expect(html).not.toContain('€');
    expect(html).not.toContain('EUR');
  });
});

describe('print-shop margin privacy routes', () => {
  it('does not expose private catalog costs or order margins to a non-admin', async () => {
    const service = new PrintShopService({
      db: new FakeFirestore(),
      storage: new FakeStorage(),
      paypal: {} as any,
    });
    const app = express();
    app.use('/api/print-shop', createPrintShopRouter({
      service,
      adminEmails: ['admin@example.test'],
      authenticate(req: any, _res, next) {
        req.user = { uid: 'customer', email: 'customer@example.test' };
        next();
      },
    }));
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise<void>(resolve => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;

    const [report, cost] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/api/print-shop/admin/financial-report`),
      fetch(`http://127.0.0.1:${port}/api/print-shop/admin/catalog/PRINT-10X15/cost`),
    ]);

    expect(report.status).toBe(403);
    expect(cost.status).toBe(403);
  });
});

describe('print-shop coupon artwork route', () => {
  it('requires admin authorization and accepts only a real JPEG with a matching placement', async () => {
    const db = new FakeFirestore();
    const storage = new FakeStorage();
    const service = new PrintShopService({ db, storage, paypal: {} as any });
    const coupon = await service.saveAdminPrintShopCoupon({
      code: 'ARTWORK10',
      discountType: 'percentage',
      value: 10,
      scope: 'all',
      eligibleSkus: [],
      minPrintQuantity: 0,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2027-01-01T00:00:00.000Z',
      maxUses: null,
      active: true,
      showOnPromotionsPage: true,
    }, 'admin@example.test') as any;
    const jpg = await sharp({
      create: { width: 1080, height: 1080, channels: 3, background: { r: 240, g: 230, b: 220 } },
    }).jpeg().toBuffer();

    const app = express();
    app.use('/api/print-shop', createPrintShopRouter({
      service,
      storage,
      adminEmails: ['admin@example.test'],
      authenticate(req: any, _res, next) {
        req.user = { uid: 'admin', email: 'admin@example.test' };
        next();
      },
    }));
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise<void>(resolve => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;
    const url = `http://127.0.0.1:${port}/api/print-shop/admin/coupons/${coupon.id}/graphic?templateId=darkroom&placementId=instagram-organic-square&width=1080&height=1080`;

    const uploaded = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: new Uint8Array(jpg),
    });
    expect(uploaded.status).toBe(200);
    const uploadedBody = await uploaded.json() as { graphic: Record<string, unknown> };
    expect(uploadedBody.graphic).toMatchObject({
      templateId: 'darkroom',
      placementId: 'instagram-organic-square',
      width: 1080,
      height: 1080,
      contentType: 'image/jpeg',
    });

    const invalidSize = await fetch(url.replace('height=1080', 'height=1350'), {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: new Uint8Array(jpg),
    });
    expect(invalidSize.status).toBe(400);
  });

  it('does not permit customers to save promotion artwork', async () => {
    const service = new PrintShopService({
      db: new FakeFirestore(),
      storage: new FakeStorage(),
      paypal: {} as any,
    });
    const app = express();
    app.use('/api/print-shop', createPrintShopRouter({
      service,
      adminEmails: ['admin@example.test'],
      authenticate(req: any, _res, next) {
        req.user = { uid: 'customer', email: 'customer@example.test' };
        next();
      },
    }));
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise<void>(resolve => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/api/print-shop/admin/coupons/coupon1/graphic?templateId=darkroom&placementId=instagram-organic-square&width=1080&height=1080`,
      { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: new Uint8Array([1, 2, 3]) },
    );
    expect(response.status).toBe(403);
  });
});
