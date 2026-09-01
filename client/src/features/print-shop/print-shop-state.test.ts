import { describe, expect, it } from 'vitest';
import { LEGACY_POLAROID_PRODUCT, PRINT_SHOP_CATALOG } from '@shared/print-shop-catalog';
import type { LocalPrintPhoto, PrintGroupDraft } from './types';
import {
  buildPrintOrderItems,
  effectivePrintDpi,
  estimateOrderTotalCents,
  validatePrintGroups,
} from './print-shop-state';

const jpegStub = {} as File;

function photo(index: number): LocalPrintPhoto {
  return {
    localId: `photo-${index}`,
    file: jpegStub,
    fileName: `photo-${index}.jpg`,
    sizeBytes: 1024,
    previewUrl: `blob:${index}`,
    sha256: `hash-${index}`,
    widthPx: 4000,
    heightPx: 3000,
    status: 'uploaded',
    progress: 100,
    retryCount: 0,
    assetId: `asset-${index}`,
    storagePath: `print-orders/u/o/asset-${index}/original.jpg`,
  };
}

function group(sku: string, id: string, photoCount: number, copies = 1): PrintGroupDraft {
  return {
    id,
    sku,
    finish: 'glossy',
    fitMode: 'border',
    assignments: Array.from({ length: photoCount }, (_, index) => ({
      localPhotoId: `photo-${index}`,
      copies,
    })),
  };
}

describe('print shop client state', () => {
  const tenByFifteen = PRINT_SHOP_CATALOG.find((product) =>
    product.printSpec.widthMm === 100 && product.printSpec.heightMm === 150,
  )!;
  const polaroid = LEGACY_POLAROID_PRODUCT;
  const legacyCatalog = [...PRINT_SHOP_CATALOG, polaroid];

  it('applica lo scaglione sulla quantità aggregata dello stesso SKU', () => {
    const first = group(tenByFifteen.sku, 'a', 6);
    const second = {
      ...group(tenByFifteen.sku, 'b', 5),
      finish: 'matte' as const,
      assignments: Array.from({ length: 5 }, (_, index) => ({ localPhotoId: `photo-${index + 6}`, copies: 1 })),
    };

    // 6 + 5 = 11: lo scaglione 11–25 del 10×15 vale 45 centesimi.
    expect(estimateOrderTotalCents([first, second], [...PRINT_SHOP_CATALOG])).toBe(11 * 45);
  });

  it('richiede esattamente 50 Polaroid diverse e una copia per file', () => {
    const photos = Array.from({ length: 50 }, (_, index) => photo(index));
    const incomplete = group(polaroid.sku, 'polaroid', 49);
    expect(validatePrintGroups([incomplete], legacyCatalog, photos))
      .toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('50') })]));

    const complete = group(polaroid.sku, 'polaroid', 50);
    expect(validatePrintGroups([complete], legacyCatalog, photos)).toEqual([]);

    complete.assignments[0].copies = 2;
    expect(validatePrintGroups([complete], legacyCatalog, photos))
      .toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('una sola copia') })]));
  });

  it('converte gli ID locali esclusivamente negli asset server-side', () => {
    const photos = [photo(0), photo(1)];
    const orderItems = buildPrintOrderItems([
      {
        ...group(tenByFifteen.sku, 'group', 2),
        assignments: [
          { localPhotoId: 'photo-0', copies: 3 },
          { localPhotoId: 'photo-1', copies: 1 },
        ],
      },
    ], photos);

    expect(orderItems[0].assignments).toEqual([
      { assetId: 'asset-0', copies: 3 },
      { assetId: 'asset-1', copies: 1 },
    ]);
  });

  it('considera automaticamente anche la rotazione della fotografia nel calcolo DPI', () => {
    const portraitDpi = effectivePrintDpi(3000, 4500, 100, 150);
    const landscapeDpi = effectivePrintDpi(4500, 3000, 100, 150);
    expect(portraitDpi).toBe(landscapeDpi);
    expect(portraitDpi).toBeGreaterThan(300);
  });
});
