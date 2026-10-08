import { describe, expect, it } from 'vitest';
import type { ShopProductDto } from '@shared/shop-types';
import { buildQuote, computeTotals, parseLineInputs, priceLines, quoteFingerprint } from './quote.js';

const product = (patch: Partial<ShopProductDto> = {}): ShopProductDto => ({
  id: 'p1',
  nome: 'Tazza',
  descrizione: '',
  priceCents: 1500,
  listPriceCents: 1500,
  discountPercent: 0,
  photosRequired: 1,
  categoria: 'natale',
  images: [],
  displayOrder: 1,
  ...patch,
});

const catalog = (...items: ShopProductDto[]) => new Map(items.map(item => [item.id, item]));
const shipping = { enabled: true, priceCents: 590, estimatedMinDays: 3, estimatedMaxDays: 6 };

describe('parseLineInputs', () => {
  it('accetta righe valide, con o senza id di riga', () => {
    expect(parseLineInputs([{ productId: 'p1', quantity: 1 }, { productId: 'p2', quantity: 3, lineId: 'l_0a1b2c3d' }])).toEqual([
      { productId: 'p1', quantity: 1 },
      { productId: 'p2', quantity: 3, lineId: 'l_0a1b2c3d' },
    ]);
  });

  it.each([
    ['carrello vuoto', [], 'empty_cart'],
    ['non un elenco', 'x', 'empty_cart'],
    ['troppe righe', Array.from({ length: 21 }, () => ({ productId: 'p', quantity: 1 })), 'too_many_lines'],
    ['prodotto mancante', [{ quantity: 1 }], 'invalid_product'],
    ['prodotto con barra', [{ productId: 'a/b', quantity: 1 }], 'invalid_product'],
    ['quantità zero', [{ productId: 'p', quantity: 0 }], 'invalid_quantity'],
    ['quantità decimale', [{ productId: 'p', quantity: 1.5 }], 'invalid_quantity'],
    ['quantità enorme', [{ productId: 'p', quantity: 21 }], 'invalid_quantity'],
    ['id di riga non valido', [{ productId: 'p', quantity: 1, lineId: '../x' }], 'invalid_line'],
  ])('rifiuta: %s', (_label, value, code) => {
    expect(() => parseLineInputs(value)).toThrowError(expect.objectContaining({ status: 400, code }));
  });
});

describe('priceLines', () => {
  it('prende prezzi e foto richieste dal catalogo, non dal cliente', () => {
    const [line] = priceLines([{ productId: 'p1', quantity: 1 }], catalog(product({ priceCents: 1990, listPriceCents: 2490, discountPercent: 20 })));
    expect(line).toMatchObject({
      productId: 'p1', productName: 'Tazza', unitPriceCents: 1990, listPriceCents: 2490, discountPercent: 20,
      quantity: 1, photosRequired: 1, lineTotalCents: 1990,
    });
    expect(line.lineId).toMatch(/^l_[a-f0-9]{8}$/);
  });

  it('segnala un prodotto non più disponibile', () => {
    expect(() => priceLines([{ productId: 'sparito', quantity: 1 }], catalog(product()))).toThrowError(
      expect.objectContaining({ status: 409, code: 'product_unavailable', details: { productId: 'sparito' } }),
    );
  });

  it('un prodotto con foto si ordina uno alla volta, uno senza foto anche in più copie', () => {
    expect(() => priceLines([{ productId: 'p1', quantity: 2 }], catalog(product()))).toThrowError(
      expect.objectContaining({ code: 'invalid_quantity' }),
    );
    const [line] = priceLines([{ productId: 'c', quantity: 3 }], catalog(product({ id: 'c', photosRequired: 0, priceCents: 300 })));
    expect(line).toMatchObject({ quantity: 3, lineTotalCents: 900, photosRequired: 0 });
  });

  it('mantiene gli id delle righe già presenti e dà id nuovi alle altre', () => {
    const lines = priceLines(
      [
        { productId: 'p1', quantity: 1, lineId: 'l_aaaaaaaa' },
        { productId: 'p1', quantity: 1, lineId: 'l_bbbbbbbb' },
        { productId: 'p1', quantity: 1 },
      ],
      catalog(product()),
      new Set(['l_aaaaaaaa']),
    );
    expect(lines[0].lineId).toBe('l_aaaaaaaa');
    expect(lines[1].lineId).not.toBe('l_bbbbbbbb');
    expect(new Set(lines.map(line => line.lineId)).size).toBe(3);
  });
});

describe('totali e impronta', () => {
  const lines = priceLines([{ productId: 'p1', quantity: 1 }, { productId: 'c', quantity: 2 }], catalog(product(), product({ id: 'c', photosRequired: 0, priceCents: 300 })));

  it('somma le righe e aggiunge la spedizione solo se scelta', () => {
    expect(computeTotals(lines, 'studio_pickup', shipping)).toEqual({ subtotalCents: 2100, shippingCents: 0, totalCents: 2100 });
    expect(computeTotals(lines, 'shipping', shipping)).toEqual({ subtotalCents: 2100, shippingCents: 590, totalCents: 2690 });
  });

  it('rifiuta la spedizione se è spenta nelle impostazioni', () => {
    expect(() => computeTotals(lines, 'shipping', { ...shipping, enabled: false })).toThrowError(
      expect.objectContaining({ status: 409, code: 'shipping_disabled' }),
    );
  });

  it("l'impronta cambia se cambia un prezzo, una quantità, la spedizione o il metodo", () => {
    const base = buildQuote(lines, 'shipping', shipping);
    expect(base.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(buildQuote(lines, 'shipping', shipping).fingerprint).toBe(base.fingerprint);
    expect(buildQuote(lines, 'studio_pickup', shipping).fingerprint).not.toBe(base.fingerprint);
    expect(buildQuote(lines, 'shipping', { ...shipping, priceCents: 700 }).fingerprint).not.toBe(base.fingerprint);
    const repriced = lines.map((line, index) => (index === 0 ? { ...line, unitPriceCents: line.unitPriceCents + 1, lineTotalCents: line.lineTotalCents + 1 } : line));
    expect(buildQuote(repriced, 'shipping', shipping).fingerprint).not.toBe(base.fingerprint);
    const moreQuantity = lines.map((line, index) => (index === 1 ? { ...line, quantity: 3, lineTotalCents: 900 } : line));
    expect(buildQuote(moreQuantity, 'shipping', shipping).fingerprint).not.toBe(base.fingerprint);
  });

  it("l'impronta ignora i campi che non cambiano ciò che si paga", () => {
    const totals = computeTotals(lines, 'studio_pickup', shipping);
    const renamed = lines.map(line => ({ ...line, productName: 'Altro nome', listPriceCents: 9999 }));
    expect(quoteFingerprint(renamed, totals, 'studio_pickup')).toBe(quoteFingerprint(lines, totals, 'studio_pickup'));
  });
});
