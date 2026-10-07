import { describe, expect, it } from 'vitest';
import { LEGACY_POLAROID_PRODUCT, POLAROID_SKU, PRINT_SHOP_CATALOG } from '@shared/print-shop-catalog';
import type { LocalPrintPhoto, PrintGroupDraft } from './types';
import {
  buildPrintOrderItems,
  effectivePrintDpi,
  estimateOrderTotalCents,
  formatEuroCents,
  hasLowResolutionPhotos,
  validatePrintGroups,
} from './print-shop-state';
import {
  printOrderTotalLabel,
  printPaymentStatusLabel,
} from './order-display';

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

    // 6 + 5 = 11: lo scaglione 11–25 del 10×15 vale 60 centesimi.
    expect(estimateOrderTotalCents([first, second], [...PRINT_SHOP_CATALOG])).toBe(11 * 60);
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

  it('blocca una Polaroid senza inquadratura confermata e conserva la composizione', () => {
    const product = PRINT_SHOP_CATALOG.find((entry) => entry.sku === POLAROID_SKU)!;
    const photos = Array.from({ length: 50 }, (_, index) => photo(index));
    const draft = { ...group(POLAROID_SKU, 'polaroid-new', 50), fitMode: 'cover' as const };
    expect(validatePrintGroups([draft], [product], photos))
      .toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('inquadratura') })]));
    const composition = { version: 1 as const, x: 0.2, y: 0.8, zoom: 2 };
    const completed = { ...draft, assignments: draft.assignments.map((assignment) => ({ ...assignment, composition })) };
    expect(validatePrintGroups([completed], [product], photos)).toEqual([]);
    expect(buildPrintOrderItems([completed], photos)[0].assignments[0].composition).toEqual(composition);
    const normal = { ...completed, assignments: completed.assignments.slice(0, 1).map((entry) => ({
      ...entry, composition: { version: 1 as const, x: 0.5, y: 0.5, zoom: 1 },
    })) };
    const zoomed = { ...normal, assignments: normal.assignments.map((entry) => ({
      ...entry, composition: { ...entry.composition, zoom: 4 },
    })) };
    const smallPhoto = { ...photos[0], widthPx: 1400, heightPx: 1400 };
    expect(hasLowResolutionPhotos([normal], [product], [smallPhoto])).toBe(false);
    expect(hasLowResolutionPhotos([zoomed], [product], [smallPhoto])).toBe(true);
  });

  it('applica il prezzo per copia alla nuova Polaroid e invia ogni inquadratura selezionata', () => {
    const product = PRINT_SHOP_CATALOG.find((entry) => entry.sku === POLAROID_SKU)!;
    const photos = [photo(0), photo(1)];
    const composition = { version: 1 as const, x: 0.2, y: 0.8, zoom: 2 };
    const selected = {
      ...group(POLAROID_SKU, 'polaroid-per-copy', 2),
      finish: product.printSpec.finishes[0],
      fitMode: 'cover' as const,
      assignments: photos.map((entry) => ({
        localPhotoId: entry.localId,
        copies: 1,
        composition,
      })),
    };

    expect(estimateOrderTotalCents([selected], [product])).toBe(200);
    expect(validatePrintGroups([selected], [product], photos)).toEqual([]);
    expect(buildPrintOrderItems([selected], photos)[0]).toMatchObject({
      sku: POLAROID_SKU,
      assignments: [
        { assetId: 'asset-0', copies: 1, composition },
        { assetId: 'asset-1', copies: 1, composition },
      ],
    });
  });

  it('considera automaticamente anche la rotazione della fotografia nel calcolo DPI', () => {
    const portraitDpi = effectivePrintDpi(3000, 4500, 100, 150);
    const landscapeDpi = effectivePrintDpi(4500, 3000, 100, 150);
    expect(portraitDpi).toBe(landscapeDpi);
    expect(portraitDpi).toBeGreaterThan(300);
  });

  it('non presenta come pagato un ordine annullato non pagato da 42 euro', () => {
    const order = {
      totals: { totalCents: 4200 },
      payment: { status: 'pending' },
      fulfillment: { status: 'cancelled' },
    };

    expect(formatEuroCents(order.totals.totalCents)).toContain('42,00');
    expect(printOrderTotalLabel(order.payment.status)).toBe('Totale ordine');
    expect(printPaymentStatusLabel(order.payment.status)).toBe('Da pagare');
  });

  it('mostra come pagato solo lo stato finanziario confermato', () => {
    expect(printOrderTotalLabel('paid')).toBe('Totale pagato');
    expect(printPaymentStatusLabel('paid')).toBe('Pagato');

    for (const status of [undefined, null, 'unknown']) {
      expect(printOrderTotalLabel(status)).toBe('Totale ordine');
      expect(printPaymentStatusLabel(status)).toBe('Stato non disponibile');
    }
  });

  it('distingue incasso da assistere e rimborsi da un pagamento da completare', () => {
    expect(printPaymentStatusLabel('paid_action_required'))
      .toBe('Pagamento acquisito: contatta l’assistenza');
    expect(printPaymentStatusLabel('partially_refunded')).toBe('Rimborso parziale');
    expect(printPaymentStatusLabel('refunded')).toBe('Rimborsato');
    expect(printOrderTotalLabel('paid_action_required')).toBe('Totale ordine');
    expect(printOrderTotalLabel('partially_refunded')).toBe('Totale ordine');
    expect(printOrderTotalLabel('refunded')).toBe('Totale ordine');
  });
});
