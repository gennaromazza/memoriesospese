import { describe, expect, it } from 'vitest';
import {
  describeShopShippingTier,
  formatShopWeight,
  isShopShippingByWeight,
  isShopShippingFree,
  shopFreeShippingProgress,
  shopFreeShippingThreshold,
  shopOrderWeight,
  shopShippingPriceRange,
  shopShippingQuote,
  shopShippingTiers,
  shopShippingUnavailableMessage,
} from '@shared/shop-shipping';
import type { ShopShippingConfig } from '@shared/shop-types';
import { FakeFirestore } from '../print-shop/test-fakes';
import { normalizeShopSettings, shopProductDto } from './catalog';
import { buildQuote, computeTotals, priceLines } from './quote';
import { ShopOrderService } from './orders';
import { ShopService } from './service';

const base = { enabled: true, priceCents: 590, estimatedMinDays: 5, estimatedMaxDays: 8 };
// Fino a 1 kg 5,90 €, da 1 a 3 kg 7,90 €, da 3 a 5 kg 9,90 €.
const byWeight: ShopShippingConfig = {
  ...base,
  tiers: [
    { maxGrams: 3000, priceCents: 790 },
    { maxGrams: 1000, priceCents: 590 },
    { maxGrams: 5000, priceCents: 990 },
  ],
};
const line = (weightGrams: number | null, quantity = 1) => ({ quantity, weightGrams });

describe('fasce di peso', () => {
  it('le ordina e scarta quelle sbagliate o con lo stesso limite', () => {
    expect(shopShippingTiers(byWeight).map(tier => tier.maxGrams)).toEqual([1000, 3000, 5000]);
    expect(shopShippingTiers({
      tiers: [
        { maxGrams: 0, priceCents: 100 },
        { maxGrams: 1500.5, priceCents: 100 },
        { maxGrams: 2000, priceCents: -1 },
        { maxGrams: 2000, priceCents: 300 },
        { maxGrams: 2000, priceCents: 400 },
        { maxGrams: 200_000, priceCents: 100 },
      ],
    })).toEqual([{ maxGrams: 2000, priceCents: 400 }]);
    expect(shopShippingTiers({})).toEqual([]);
    expect(shopShippingTiers(undefined)).toEqual([]);
  });

  it('non accetta più di 12 fasce', () => {
    const tiers = Array.from({ length: 20 }, (_, index) => ({ maxGrams: (index + 1) * 100, priceCents: 500 }));
    expect(shopShippingTiers({ tiers })).toHaveLength(12);
  });

  it('senza fasce il costo resta unico', () => {
    expect(isShopShippingByWeight(base)).toBe(false);
    expect(isShopShippingByWeight(byWeight)).toBe(true);
    expect(shopShippingQuote(base, [line(null)])).toMatchObject({ available: true, cents: 590 });
  });
});

describe('costo della spedizione per peso', () => {
  it('il limite di ogni fascia è compreso', () => {
    expect(shopShippingQuote(byWeight, [line(1000)])).toMatchObject({ available: true, cents: 590, weightGrams: 1000 });
    expect(shopShippingQuote(byWeight, [line(1001)])).toMatchObject({ available: true, cents: 790 });
    expect(shopShippingQuote(byWeight, [line(3000)])).toMatchObject({ available: true, cents: 790 });
    expect(shopShippingQuote(byWeight, [line(3001)])).toMatchObject({ available: true, cents: 990 });
    expect(shopShippingQuote(byWeight, [line(5000)])).toMatchObject({ available: true, cents: 990 });
  });

  it('moltiplica il peso per la quantità e somma le righe', () => {
    // 2 x 600 g + 1 x 450 g = 1650 g, fascia da 1 a 3 kg.
    expect(shopShippingQuote(byWeight, [line(600, 2), line(450)])).toMatchObject({ available: true, cents: 790, weightGrams: 1650 });
    expect(shopOrderWeight([line(600, 2), line(450)])).toEqual({ grams: 1650, complete: true });
  });

  it('oltre l\'ultima fascia non si spedisce online', () => {
    const quote = shopShippingQuote(byWeight, [line(5001)]);
    expect(quote).toMatchObject({ available: false, reason: 'too_heavy', weightGrams: 5001, maxGrams: 5000 });
    expect(shopShippingUnavailableMessage(quote as any)).toContain('online spediamo fino a 5 kg');
  });

  it('se un prodotto non ha il peso non si indovina: la spedizione non è calcolabile', () => {
    for (const missing of [null, undefined, 0, -5]) {
      expect(shopShippingQuote(byWeight, [line(300), { quantity: 1, weightGrams: missing }]))
        .toMatchObject({ available: false, reason: 'missing_weight', weightGrams: null });
    }
    expect(shopOrderWeight([line(300), line(null)])).toMatchObject({ complete: false });
  });

  it('spedizione spenta', () => {
    expect(shopShippingQuote({ ...byWeight, enabled: false }, [line(300)])).toMatchObject({ available: false, reason: 'disabled' });
  });

  it('range di prezzi per la vetrina', () => {
    expect(shopShippingPriceRange(byWeight)).toEqual({ minCents: 590, maxCents: 990 });
    expect(shopShippingPriceRange(base)).toEqual({ minCents: 590, maxCents: 590 });
    expect(shopShippingPriceRange({ ...base, enabled: false })).toBeNull();
  });

  it('descrive le fasce e i pesi', () => {
    const tiers = shopShippingTiers(byWeight);
    expect(tiers.map((_, index) => describeShopShippingTier(tiers, index))).toEqual(['fino a 1 kg', 'da 1 kg a 3 kg', 'da 3 kg a 5 kg']);
    expect(describeShopShippingTier([{ maxGrams: 500, priceCents: 1 }, { maxGrams: 1000, priceCents: 2 }], 1)).toBe('da 500 g a 1 kg');
    expect(formatShopWeight(450)).toBe('450 g');
    expect(formatShopWeight(1500)).toBe('1,5 kg');
    expect(formatShopWeight(3000)).toBe('3 kg');
  });
});

describe('impostazioni e prodotti', () => {
  it('le impostazioni conservano le fasce valide, ordinate', () => {
    const settings = normalizeShopSettings({ enabled: true, shipping: { ...byWeight, tiers: [...byWeight.tiers!, { maxGrams: -3, priceCents: 1 }] } });
    expect(settings.shipping.tiers).toEqual([
      { maxGrams: 1000, priceCents: 590 },
      { maxGrams: 3000, priceCents: 790 },
      { maxGrams: 5000, priceCents: 990 },
    ]);
  });

  it('senza fasce valide resta il costo unico, senza il campo', () => {
    const settings = normalizeShopSettings({ enabled: true, shipping: { ...base, tiers: [{ maxGrams: 0, priceCents: 1 }] } });
    expect(settings.shipping).toEqual(base);
    expect('tiers' in settings.shipping).toBe(false);
  });

  it('il prodotto porta il peso del catalogo, o null se manca', () => {
    const product = (extra: Record<string, unknown>) =>
      shopProductDto({ id: 'p', nome: 'Tazza', prezzo: 10, sconto: 0, categoria: 'natale', attivo: true, ...extra }, new Set(['natale']));
    expect(product({ pesoGrammi: 450 })?.weightGrams).toBe(450);
    expect(product({ pesoGrammi: 450.4 })?.weightGrams).toBe(450);
    expect(product({})?.weightGrams).toBeNull();
    expect(product({ pesoGrammi: 0 })?.weightGrams).toBeNull();
    expect(product({ pesoGrammi: 'pesante' })?.weightGrams).toBeNull();
    expect(product({ pesoGrammi: 999_999_999 })?.weightGrams).toBe(100_000);
  });
});

describe('preventivo', () => {
  const catalog = new Map([
    ['mug', { id: 'mug', nome: 'Tazza', priceCents: 1500, listPriceCents: 1500, discountPercent: 0, photosRequired: 0, weightGrams: 450, categoria: 'natale', images: [], displayOrder: 1, descrizione: '' }],
    ['album', { id: 'album', nome: 'Album', priceCents: 4000, listPriceCents: 4000, discountPercent: 0, photosRequired: 0, weightGrams: 2200, categoria: 'natale', images: [], displayOrder: 2, descrizione: '' }],
    ['nuovo', { id: 'nuovo', nome: 'Senza peso', priceCents: 500, listPriceCents: 500, discountPercent: 0, photosRequired: 0, weightGrams: null, categoria: 'natale', images: [], displayOrder: 3, descrizione: '' }],
  ]);

  it('le righe portano il peso del prodotto al momento dell\'ordine', () => {
    const lines = priceLines([{ productId: 'mug', quantity: 2 }, { productId: 'nuovo', quantity: 1 }], catalog as any);
    expect(lines.map(row => row.weightGrams)).toEqual([450, null]);
  });

  it('il ritiro in studio non paga spedizione e non guarda il peso', () => {
    const lines = priceLines([{ productId: 'nuovo', quantity: 1 }], catalog as any);
    expect(computeTotals(lines, 'studio_pickup', byWeight)).toEqual({ subtotalCents: 500, shippingCents: 0, totalCents: 500 });
  });

  it('con la spedizione il costo segue il peso e finisce nel totale e nell\'impronta', () => {
    const light = priceLines([{ productId: 'mug', quantity: 1 }], catalog as any);
    const heavy = priceLines([{ productId: 'mug', quantity: 1 }, { productId: 'album', quantity: 1 }], catalog as any);
    expect(computeTotals(light, 'shipping', byWeight)).toEqual({ subtotalCents: 1500, shippingCents: 590, totalCents: 2090 });
    // 450 + 2200 = 2650 g
    expect(computeTotals(heavy, 'shipping', byWeight)).toEqual({ subtotalCents: 5500, shippingCents: 790, totalCents: 6290 });
    expect(buildQuote(light, 'shipping', byWeight).fingerprint).not.toBe(buildQuote(light, 'shipping', { ...byWeight, tiers: [{ maxGrams: 5000, priceCents: 1200 }] }).fingerprint);
  });

  it('rifiuta la spedizione con un codice chiaro quando non si può calcolare', () => {
    const tooHeavy = priceLines([{ productId: 'album', quantity: 3 }], catalog as any); // 6600 g
    expect(() => computeTotals(tooHeavy, 'shipping', byWeight)).toThrowError(expect.objectContaining({ status: 409, code: 'shipping_too_heavy' }));
    const noWeight = priceLines([{ productId: 'nuovo', quantity: 1 }], catalog as any);
    expect(() => computeTotals(noWeight, 'shipping', byWeight)).toThrowError(expect.objectContaining({ status: 409, code: 'shipping_weight_missing' }));
    expect(() => computeTotals(noWeight, 'shipping', { ...byWeight, enabled: false })).toThrowError(expect.objectContaining({ status: 409, code: 'shipping_disabled' }));
  });
});

describe('ordini con la spedizione per peso', () => {
  const NOW = new Date('2026-12-01T10:00:00Z');
  const alice = { uid: 'alice', email: 'alice@example.com' };
  const address = { street: 'Via Roma', houseNumber: '12', postalCode: '81031', city: 'Aversa', province: 'CE', country: 'IT' };

  async function setup() {
    const db = new FakeFirestore();
    db.seed('productCategories/c1', { value: 'natale', nome: 'Natale', attivo: true, displayOrder: 1 });
    db.seed('products/mug', { nome: 'Tazza', descrizione: '', prezzo: 15, sconto: 0, numeroFoto: 0, pesoGrammi: 450, categoria: 'natale', attivo: true, immagini: [] });
    db.seed('products/album', { nome: 'Album', descrizione: '', prezzo: 40, sconto: 0, numeroFoto: 0, pesoGrammi: 2200, categoria: 'natale', attivo: true, immagini: [] });
    db.seed('products/nuovo', { nome: 'Senza peso', descrizione: '', prezzo: 5, sconto: 0, numeroFoto: 0, categoria: 'natale', attivo: true, immagini: [] });
    const shop = new ShopService({ db: db as any, now: () => NOW });
    await shop.updateSettings({ enabled: true, ordersOpen: true, categoryValues: ['natale'], shipping: byWeight });
    const orders = new ShopOrderService({ db: db as any, shop, now: () => NOW });
    return { db, shop, orders };
  }

  it('il cliente vede il costo della fascia giusta e il peso nelle righe', async () => {
    const { orders } = await setup();
    const draft = await orders.createDraft(alice, { lines: [{ productId: 'mug', quantity: 1 }, { productId: 'album', quantity: 1 }] });
    expect(draft.lines.map(row => row.weightGrams)).toEqual([450, 2200]);
    const shipped = await orders.updateOrder(alice, draft.id, { fulfillment: { method: 'shipping', shippingAddress: address } });
    expect(shipped.totals).toEqual({ subtotalCents: 5500, shippingCents: 790, totalCents: 6290 });
  });

  it('cambiando il carrello il costo si ricalcola', async () => {
    const { orders } = await setup();
    const draft = await orders.createDraft(alice, { lines: [{ productId: 'mug', quantity: 1 }] });
    await orders.updateOrder(alice, draft.id, { fulfillment: { method: 'shipping', shippingAddress: address } });
    const heavier = await orders.replaceLines(alice, draft.id, [{ productId: 'mug', quantity: 5 }]); // 2250 g
    expect(heavier.fulfillment.method).toBe('shipping');
    expect(heavier.totals.shippingCents).toBe(790);
  });

  it('se il carrello diventa troppo pesante l\'ordine torna al ritiro in studio', async () => {
    const { orders } = await setup();
    const draft = await orders.createDraft(alice, { lines: [{ productId: 'mug', quantity: 1 }] });
    await orders.updateOrder(alice, draft.id, { fulfillment: { method: 'shipping', shippingAddress: address } });
    const tooHeavy = await orders.replaceLines(alice, draft.id, [{ productId: 'album', quantity: 3 }]); // 6600 g
    expect(tooHeavy.fulfillment.method).toBe('studio_pickup');
    expect(tooHeavy.totals.shippingCents).toBe(0);
    await expect(orders.updateOrder(alice, draft.id, { fulfillment: { method: 'shipping', shippingAddress: address } }))
      .rejects.toMatchObject({ status: 409, code: 'shipping_too_heavy' });
  });

  it('un prodotto senza peso blocca la spedizione ma non il ritiro', async () => {
    const { orders } = await setup();
    const draft = await orders.createDraft(alice, { lines: [{ productId: 'nuovo', quantity: 1 }] });
    expect(draft.totals.shippingCents).toBe(0);
    await expect(orders.updateOrder(alice, draft.id, { fulfillment: { method: 'shipping', shippingAddress: address } }))
      .rejects.toMatchObject({ status: 409, code: 'shipping_weight_missing' });
  });
});

describe('spedizione gratuita sopra una soglia', () => {
  const catalog = new Map([
    ['mug', { id: 'mug', nome: 'Tazza', priceCents: 1500, listPriceCents: 1500, discountPercent: 0, photosRequired: 0, weightGrams: 450, categoria: 'natale', images: [], displayOrder: 1, descrizione: '' }],
    ['album', { id: 'album', nome: 'Album', priceCents: 4000, listPriceCents: 4000, discountPercent: 0, photosRequired: 0, weightGrams: 2200, categoria: 'natale', images: [], displayOrder: 2, descrizione: '' }],
    ['nuovo', { id: 'nuovo', nome: 'Senza peso', priceCents: 6000, listPriceCents: 6000, discountPercent: 0, photosRequired: 0, weightGrams: null, categoria: 'natale', images: [], displayOrder: 3, descrizione: '' }],
  ]);
  const withFree: ShopShippingConfig = { ...byWeight, freeShippingOverCents: 5000 };

  it('la soglia vale solo con la spedizione accesa e un importo valido', () => {
    expect(shopFreeShippingThreshold(withFree)).toBe(5000);
    expect(shopFreeShippingThreshold({ ...withFree, enabled: false })).toBeNull();
    expect(shopFreeShippingThreshold({ ...withFree, freeShippingOverCents: 0 })).toBeNull();
    expect(shopFreeShippingThreshold({ ...withFree, freeShippingOverCents: 12.5 })).toBeNull();
    expect(shopFreeShippingThreshold(byWeight)).toBeNull();
  });

  it('è gratuita dalla soglia in su, non sotto', () => {
    expect(isShopShippingFree(withFree, 4999)).toBe(false);
    expect(isShopShippingFree(withFree, 5000)).toBe(true);
    expect(isShopShippingFree(byWeight, 999_999)).toBe(false);
  });

  it('dice quanto manca per sbloccarla', () => {
    expect(shopFreeShippingProgress(withFree, 1500)).toEqual({ thresholdCents: 5000, remainingCents: 3500, percent: 30, unlocked: false });
    expect(shopFreeShippingProgress(withFree, 7000)).toMatchObject({ remainingCents: 0, percent: 100, unlocked: true });
    expect(shopFreeShippingProgress(byWeight, 1500)).toBeNull();
  });

  it('il server azzera la spedizione sopra la soglia e la fa pagare sotto', () => {
    const under = priceLines([{ productId: 'mug', quantity: 1 }], catalog as any);
    const over = priceLines([{ productId: 'mug', quantity: 1 }, { productId: 'album', quantity: 1 }], catalog as any);
    expect(computeTotals(under, 'shipping', withFree)).toEqual({ subtotalCents: 1500, shippingCents: 590, totalCents: 2090 });
    expect(computeTotals(over, 'shipping', withFree)).toEqual({ subtotalCents: 5500, shippingCents: 0, totalCents: 5500 });
    expect(computeTotals(over, 'studio_pickup', withFree)).toEqual({ subtotalCents: 5500, shippingCents: 0, totalCents: 5500 });
  });

  it('la spedizione gratuita non aggira il controllo del peso', () => {
    const noWeight = priceLines([{ productId: 'nuovo', quantity: 1 }], catalog as any);
    expect(() => computeTotals(noWeight, 'shipping', withFree)).toThrowError(expect.objectContaining({ code: 'shipping_weight_missing' }));
  });

  it("cambiare la soglia cambia l'impronta del preventivo", () => {
    const lines = priceLines([{ productId: 'mug', quantity: 1 }, { productId: 'album', quantity: 1 }], catalog as any);
    expect(buildQuote(lines, 'shipping', withFree).fingerprint).not.toBe(buildQuote(lines, 'shipping', byWeight).fingerprint);
  });

  it('le impostazioni salvate tengono la soglia valida e scartano quella sbagliata', () => {
    expect(normalizeShopSettings({ shipping: { ...base, freeShippingOverCents: 5000 } }).shipping.freeShippingOverCents).toBe(5000);
    expect(normalizeShopSettings({ shipping: { ...base, freeShippingOverCents: -5 } }).shipping.freeShippingOverCents).toBeUndefined();
    expect(normalizeShopSettings({ shipping: base }).shipping.freeShippingOverCents).toBeUndefined();
  });
});
