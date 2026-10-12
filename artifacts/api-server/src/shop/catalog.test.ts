import { describe, expect, it } from 'vitest';
import { shopPriceCents } from '@shared/shop-types';
import { buildShopCatalog, normalizeShopSettings } from './catalog.js';

const NOW = new Date('2026-12-01T10:00:00Z');
const settings = (patch: Record<string, unknown> = {}) =>
  normalizeShopSettings({ enabled: true, ordersOpen: true, categoryValues: ['natale'], ...patch });

const product = (patch: Record<string, unknown> = {}) => ({
  id: 'p1',
  nome: 'Tazza con foto',
  descrizione: 'Una tazza personalizzata',
  prezzo: 19.9,
  sconto: 0,
  numeroFoto: 1,
  categoria: 'natale',
  attivo: true,
  immagini: ['https://img.test/tazza.jpg'],
  displayOrder: 2,
  ...patch,
});

const categories = [{ id: 'c1', value: 'natale', nome: 'Shopping online Natale 2026', attivo: true, displayOrder: 1 }];

describe('shopPriceCents', () => {
  it('calcola il prezzo finale in centesimi con lo sconto', () => {
    expect(shopPriceCents(19.9, 0)).toEqual({ priceCents: 1990, listPriceCents: 1990, discountPercent: 0 });
    expect(shopPriceCents(20, 15)).toEqual({ priceCents: 1700, listPriceCents: 2000, discountPercent: 15 });
    expect(shopPriceCents(0.1 + 0.2, 0)?.priceCents).toBe(30);
  });

  it('rifiuta prezzi non validi e limita lo sconto', () => {
    for (const value of [0, -5, NaN, Infinity, '10', null, undefined, 2_000_000]) {
      expect(shopPriceCents(value, 0)).toBeNull();
    }
    expect(shopPriceCents(10, 100)).toBeNull();
    expect(shopPriceCents(10, 150)).toBeNull();
    expect(shopPriceCents(10, -20)?.priceCents).toBe(1000);
  });
});

describe('normalizeShopSettings', () => {
  it('usa i valori di riserva per un documento vuoto o strano', () => {
    for (const raw of [undefined, null, 'x', 42, []]) {
      expect(normalizeShopSettings(raw)).toEqual({
        enabled: false,
        ordersOpen: false,
        categoryValues: [],
        lastOrderDate: null,
        photoWaitDays: 7,
        shipping: { enabled: false, priceCents: 0, estimatedMinDays: 3, estimatedMaxDays: 7 },
      });
    }
  });

  it('ripulisce categorie, data e giorni di attesa', () => {
    const result = normalizeShopSettings({
      enabled: true,
      ordersOpen: 'si',
      categoryValues: ['natale', ' natale ', 'bad value', 7, '../x', 'altra-cat'],
      lastOrderDate: '2026-12-18',
      photoWaitDays: 500,
    });
    expect(result.enabled).toBe(true);
    expect(result.ordersOpen).toBe(false);
    expect(result.categoryValues).toEqual(['natale', 'altra-cat']);
    expect(result.lastOrderDate).toBe('2026-12-18');
    expect(result.photoWaitDays).toBe(7);
    expect(normalizeShopSettings({ lastOrderDate: '2026-02-31' }).lastOrderDate).toBeNull();
    expect(normalizeShopSettings({ lastOrderDate: 'domani' }).lastOrderDate).toBeNull();
  });
});

describe('buildShopCatalog', () => {
  it('mostra solo prodotti attivi delle categorie abilitate, con prezzi calcolati dal server', () => {
    const catalog = buildShopCatalog({
      settings: settings(),
      categories,
      now: NOW,
      products: [
        product(),
        product({ id: 'p2', nome: 'Spento', attivo: false }),
        product({ id: 'p3', nome: 'Altra categoria', categoria: 'album' }),
        product({ id: 'p4', nome: 'Stampa', salesChannels: ['admin', 'print_shop'] }),
        product({ id: 'p5', nome: 'Senza prezzo', prezzo: 0 }),
        product({ id: 'p6', nome: '   ' }),
        product({ id: 'p7', nome: 'Scontato', prezzo: 50, sconto: 10, numeroFoto: 3, displayOrder: 1 }),
      ],
    });
    expect(catalog.products.map(item => item.id)).toEqual(['p7', 'p1']);
    expect(catalog.products[0]).toMatchObject({ priceCents: 4500, listPriceCents: 5000, discountPercent: 10, photosRequired: 3 });
    expect(catalog.categories).toEqual([{ value: 'natale', nome: 'Shopping online Natale 2026' }]);
    expect(catalog.orderingOpen).toBe(true);
    expect(catalog.currency).toBe('EUR');
  });

  it('non mostra nulla se la vetrina è spenta o la categoria è disattivata', () => {
    expect(buildShopCatalog({ settings: settings({ enabled: false }), categories, products: [product()], now: NOW })).toMatchObject({
      enabled: false,
      orderingOpen: false,
      products: [],
      categories: [],
    });
    const hidden = buildShopCatalog({
      settings: settings(),
      categories: [{ ...categories[0], attivo: false }],
      products: [product()],
      now: NOW,
    });
    expect(hidden.products).toEqual([]);
  });

  it("chiude gli ordini dopo l'ultimo giorno ma lascia visibile la vetrina", () => {
    const open = buildShopCatalog({ settings: settings({ lastOrderDate: '2026-12-01' }), categories, products: [product()], now: NOW });
    expect(open.orderingOpen).toBe(true);
    const closed = buildShopCatalog({ settings: settings({ lastOrderDate: '2026-11-30' }), categories, products: [product()], now: NOW });
    expect(closed.orderingOpen).toBe(false);
    expect(closed.products).toHaveLength(1);
    const notOpenYet = buildShopCatalog({ settings: settings({ ordersOpen: false }), categories, products: [product()], now: NOW });
    expect(notOpenYet.orderingOpen).toBe(false);
  });

  it('tiene solo immagini https e limita le foto richieste', () => {
    const catalog = buildShopCatalog({
      settings: settings(),
      categories,
      now: NOW,
      products: [product({ immagini: ['http://insicuro.test/a.jpg', 'https://ok.test/b.jpg', 3, 'javascript:alert(1)'], numeroFoto: 500 })],
    });
    expect(catalog.products[0].images).toEqual(['https://ok.test/b.jpg']);
    expect(catalog.products[0].photosRequired).toBe(50);
  });
});
