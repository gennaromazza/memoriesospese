import { describe, expect, it } from 'vitest';
import { buildPrintShopSeedPlan, type ExistingPrintShopSeedDocument } from './print-shop-seed';

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
  it('pianifica 3 categorie e 11 prodotti senza cancellazioni', () => {
    const plan = buildPrintShopSeedPlan([], []);
    expect(plan.operations).toHaveLength(14);
    expect(plan.summary).toEqual({ create: 14, update: 0, unchanged: 0 });
    expect(plan.operations.filter(operation => operation.collection === 'productCategories')).toHaveLength(3);
    expect(plan.operations.filter(operation => operation.collection === 'products')).toHaveLength(11);
  });

  it('è idempotente dopo l’applicazione dello stesso piano', () => {
    const { products, categories } = splitPlanDocuments();
    const secondRun = buildPrintShopSeedPlan(products, categories);
    expect(secondRun.summary).toEqual({ create: 0, update: 0, unchanged: 14 });
    expect(secondRun.operations.every(operation => operation.changedFields.length === 0)).toBe(true);
  });

  it('riconosce SKU e category value già presenti sotto ID legacy', () => {
    const { products, categories } = splitPlanDocuments();
    products[0] = { ...products[0], id: 'legacy-product-id' };
    categories[0] = { ...categories[0], id: 'legacy-category-id' };
    const plan = buildPrintShopSeedPlan(products, categories);

    expect(plan.operations.find(operation => operation.data.sku === products[0].data.sku)?.id).toBe('legacy-product-id');
    expect(plan.operations.find(operation => operation.data.value === categories[0].data.value)?.id).toBe('legacy-category-id');
    expect(plan.summary).toEqual({ create: 0, update: 0, unchanged: 14 });
  });

  it('aggiorna soltanto i campi gestiti e lascia intatti quelli estranei', () => {
    const { products, categories } = splitPlanDocuments();
    products[0] = {
      ...products[0],
      data: { ...products[0].data, prezzo: 999, notaInterna: 'da preservare' },
    };
    const plan = buildPrintShopSeedPlan(products, categories);
    const update = plan.operations.find(operation => operation.id === products[0].id);

    expect(plan.summary).toEqual({ create: 0, update: 1, unchanged: 13 });
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
});
