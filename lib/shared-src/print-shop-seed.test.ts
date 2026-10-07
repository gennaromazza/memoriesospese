import { describe, expect, it } from 'vitest';
import { buildPrintShopSeedPlan, type ExistingPrintShopSeedDocument } from './print-shop-seed';
import { LEGACY_POLAROID_PRODUCT, POLAROID_SKU } from './print-shop-catalog';

function splitPlanDocuments() {
  const initial = buildPrintShopSeedPlan([], []);
  const products: ExistingPrintShopSeedDocument[] = [];
  const categories: ExistingPrintShopSeedDocument[] = [];
  for (const operation of initial.operations) {
    const document = { id: operation.id, data: { ...operation.data } };
    if (operation.collection === 'products') products.push(document);
    else categories.push(document);
  }
  return { initial, products, categories };
}

describe('seed catalogo stampe', () => {
  it('pianifica 3 categorie e 12 prodotti senza cancellazioni', () => {
    const plan = buildPrintShopSeedPlan([], []);
    expect(plan.operations).toHaveLength(15);
    expect(plan.summary).toEqual({ create: 15, update: 0, unchanged: 0 });
    expect(plan.operations.filter(operation => operation.collection === 'productCategories')).toHaveLength(3);
    expect(plan.operations.filter(operation => operation.collection === 'products')).toHaveLength(12);
    expect(plan.operations.find(operation => operation.data.sku === POLAROID_SKU)?.data.prezzo).toBe(1);
    expect(plan.operations.some(operation => operation.data.sku === LEGACY_POLAROID_PRODUCT.sku)).toBe(false);
  });

  it('è idempotente dopo l’applicazione dello stesso piano', () => {
    const { products, categories } = splitPlanDocuments();
    const secondRun = buildPrintShopSeedPlan(products, categories);
    expect(secondRun.summary).toEqual({ create: 0, update: 0, unchanged: 15 });
    expect(secondRun.operations.every(operation => operation.changedFields.length === 0)).toBe(true);
  });

  it('riconosce SKU e category value già presenti sotto ID legacy', () => {
    const { products, categories } = splitPlanDocuments();
    products[0] = { ...products[0], id: 'legacy-product-id' };
    categories[0] = { ...categories[0], id: 'legacy-category-id' };
    const plan = buildPrintShopSeedPlan(products, categories);

    expect(plan.operations.find(operation => operation.data.sku === products[0].data.sku)?.id).toBe('legacy-product-id');
    expect(plan.operations.find(operation => operation.data.value === categories[0].data.value)?.id).toBe('legacy-category-id');
    expect(plan.summary).toEqual({ create: 0, update: 0, unchanged: 15 });
  });

  it('aggiorna soltanto i campi gestiti e lascia intatti quelli estranei', () => {
    const { products, categories } = splitPlanDocuments();
    products[0] = {
      ...products[0],
      data: { ...products[0].data, prezzo: 999, notaInterna: 'da preservare' },
    };
    const plan = buildPrintShopSeedPlan(products, categories);
    const update = plan.operations.find(operation => operation.id === products[0].id);

    expect(plan.summary).toEqual({ create: 0, update: 1, unchanged: 14 });
    expect(update?.action).toBe('update');
    expect(update?.changedFields).toEqual(['prezzo']);
    expect(update?.data).not.toHaveProperty('notaInterna');
  });

  it('interrompe il piano in presenza di SKU duplicati invece di creare ambiguità', () => {
    const { products, categories } = splitPlanDocuments();
    products.push({ id: 'duplicate-id', data: { ...products[0].data } });
    expect(() => buildPrintShopSeedPlan(products, categories)).toThrow(/sku duplicato/i);
  });

  it('interrompe il piano se business key e ID deterministico indicano due documenti diversi', () => {
    const { products, categories } = splitPlanDocuments();
    const deterministicId = products[0].id;
    products[0] = { ...products[0], id: 'legacy-product-id' };
    products.push({ id: deterministicId, data: { nome: 'documento in conflitto' } });
    expect(() => buildPrintShopSeedPlan(products, categories)).toThrow(/esiste sia come/i);
  });

  it('disattiva solo un vecchio prodotto già esistente senza modificarne prezzo e misure', () => {
    const { products, categories } = splitPlanDocuments();
    const historic = { id: LEGACY_POLAROID_PRODUCT.id, data: {
      sku: LEGACY_POLAROID_PRODUCT.sku, attivo: true,
      salesChannels: ['admin', 'print_shop'], printSpec: LEGACY_POLAROID_PRODUCT.printSpec,
      prezzo: 9.9,
    } };
    const plan = buildPrintShopSeedPlan([...products, historic], categories);
    const operation = plan.operations.find(entry => entry.id === historic.id);
    expect(operation?.action).toBe('update');
    expect(operation?.data).toEqual({ attivo: false, salesChannels: ['admin'] });
    expect(operation?.changedFields).toEqual(['attivo', 'salesChannels']);
  });
});
