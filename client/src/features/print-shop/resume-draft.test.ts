import { describe, expect, it } from 'vitest';
import type { PrintShopOrderListItem } from './types';
import { isResumablePrintDraft, restorePrintDraft, restorePrintDraftQuote } from './resume-draft';

function draft(overrides: Partial<PrintShopOrderListItem> = {}): PrintShopOrderListItem {
  return {
    id: 'order-1',
    orderNumber: 'ST-001',
    totals: { subtotalCents: 100, discountCents: 0, totalCents: 100 },
    payment: { method: 'paypal', status: 'pending' },
    fulfillment: { method: 'studio_pickup', status: 'draft' },
    printShop: {
      assetCount: 1,
      copyCount: 2,
      requestedItems: [{
        sku: '10x15',
        finish: 'matte',
        fitMode: 'cover',
        assignments: [{ assetId: 'asset-1', copies: 2 }],
      }],
    },
    assets: [{
      id: 'asset-1',
      status: 'ready',
      originalName: 'vacanza.jpg',
      sizeBytes: 1234,
      widthPx: 4000,
      heightPx: 3000,
    }],
    ...overrides,
  };
}

describe('ripristino bozza stampe', () => {
  it('ricostruisce file già caricati e assegnazioni senza richiedere il File locale', () => {
    const restored = restorePrintDraft(draft());
    expect(restored.photos).toEqual([
      expect.objectContaining({
        localId: 'restored-asset-1',
        fileName: 'vacanza.jpg',
        status: 'uploaded',
        progress: 100,
      }),
    ]);
    expect(restored.photos[0].file).toBeUndefined();
    expect(restored.groups).toEqual([
      expect.objectContaining({
        sku: '10x15',
        finish: 'matte',
        fitMode: 'cover',
        assignments: [{ localPhotoId: 'restored-asset-1', copies: 2 }],
      }),
    ]);
  });

  it('non ripristina asset non finalizzati né assegnazioni orfane', () => {
    const restored = restorePrintDraft(draft({
      assets: [{ id: 'asset-1', status: 'prepared', originalName: 'incompleta.jpg' }],
    }));
    expect(restored).toEqual({ photos: [], groups: [] });
  });

  it('esclude ordini pagati o scaduti e consente un pagamento fallito da riprovare', () => {
    expect(isResumablePrintDraft(draft())).toBe(true);
    expect(isResumablePrintDraft(draft({ payment: { method: 'paypal', status: 'failed' } }))).toBe(true);
    expect(isResumablePrintDraft(draft({ payment: { method: 'paypal', status: 'paid' } }))).toBe(false);
    expect(isResumablePrintDraft(draft({ payment: { method: 'paypal', status: 'expired' } }))).toBe(false);
  });

  it('ricostruisce la quote owner per riprendere un PayPal già inizializzato senza fidarsi del client', () => {
    const order = draft({
      catalogVersion: 3,
      currency: 'EUR',
      quoteFingerprint: 'a'.repeat(64),
      printShop: {
        assetCount: 1,
        copyCount: 2,
        requestedItems: [{ sku: '10x15', finish: 'matte', fitMode: 'cover', assignments: [{ assetId: 'asset-1', copies: 2 }] }],
        items: [{
          productId: 'p-1', sku: '10x15', productName: '10×15', category: 'classiche',
          catalogVersion: 3, currency: 'EUR', widthMm: 100, heightMm: 150,
          finish: 'matte', fitMode: 'cover', pricingModel: 'tiered', assetCount: 1,
          copyCount: 2, pricingQuantity: 2, unitPriceCents: 50,
          lineTotalCents: 100, assignments: [{ assetId: 'asset-1', copies: 2 }],
        }],
      },
    });
    expect(restorePrintDraftQuote(order)).toMatchObject({
      catalogVersion: 3,
      quoteFingerprint: 'a'.repeat(64),
      totals: { totalCents: 100 },
      copyCount: 2,
    });
  });
});
