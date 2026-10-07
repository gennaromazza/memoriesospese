import { PRINT_SHOP_CATALOG, PRINT_SHOP_CATEGORIES } from './print-shop-catalog';

export type PrintShopSeedCollection = 'productCategories' | 'products';
export type PrintShopSeedAction = 'create' | 'update' | 'unchanged';

export interface ExistingPrintShopSeedDocument {
  id: string;
  data: Record<string, unknown>;
}

export interface PrintShopSeedOperation {
  collection: PrintShopSeedCollection;
  id: string;
  action: PrintShopSeedAction;
  data: Record<string, unknown>;
  changedFields: readonly string[];
}

export interface PrintShopSeedPlan {
  operations: readonly PrintShopSeedOperation[];
  summary: {
    create: number;
    update: number;
    unchanged: number;
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => deepEqual(value, right[index]));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left).filter(key => left[key] !== undefined).sort();
    const rightKeys = Object.keys(right).filter(key => right[key] !== undefined).sort();
    return leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]));
  }
  return false;
}

function changedManagedFields(existing: Record<string, unknown> | undefined, desired: Record<string, unknown>): string[] {
  if (!existing) return Object.keys(desired).sort();
  return Object.keys(desired).filter(key => !deepEqual(existing[key], desired[key])).sort();
}

function createUniqueIndex(
  documents: readonly ExistingPrintShopSeedDocument[],
  key: 'sku' | 'value',
): Map<string, ExistingPrintShopSeedDocument> {
  const index = new Map<string, ExistingPrintShopSeedDocument>();
  for (const document of documents) {
    const rawValue = document.data[key];
    if (typeof rawValue !== 'string' || !rawValue.trim()) continue;
    const normalized = rawValue.trim().toLocaleLowerCase('en-US');
    const duplicate = index.get(normalized);
    if (duplicate && duplicate.id !== document.id) {
      throw new Error(`Seed interrotto: ${key} duplicato "${rawValue}" nei documenti ${duplicate.id} e ${document.id}`);
    }
    index.set(normalized, document);
  }
  return index;
}

function operationFor(
  collection: PrintShopSeedCollection,
  desiredId: string,
  desiredData: Record<string, unknown>,
  existing: ExistingPrintShopSeedDocument | undefined,
): PrintShopSeedOperation {
  const changedFields = changedManagedFields(existing?.data, desiredData);
  return {
    collection,
    id: existing?.id ?? desiredId,
    action: !existing ? 'create' : changedFields.length > 0 ? 'update' : 'unchanged',
    data: desiredData,
    changedFields,
  };
}

function selectExistingDocument(
  entityLabel: string,
  desiredId: string,
  byBusinessKey: ExistingPrintShopSeedDocument | undefined,
  byDocumentId: ExistingPrintShopSeedDocument | undefined,
): ExistingPrintShopSeedDocument | undefined {
  if (byBusinessKey && byDocumentId && byBusinessKey.id !== byDocumentId.id) {
    throw new Error(
      `Seed interrotto: ${entityLabel} (ID atteso ${desiredId}) esiste sia come ${byBusinessKey.id} sia come ${byDocumentId.id}`,
    );
  }
  return byBusinessKey ?? byDocumentId;
}

/**
 * Crea un piano idempotente senza cancellazioni. Un prodotto già esistente con
 * lo stesso SKU (anche sotto un document ID legacy) viene aggiornato in-place.
 * I campi estranei al seed vengono preservati grazie alle write con merge.
 */
export function buildPrintShopSeedPlan(
  existingProducts: readonly ExistingPrintShopSeedDocument[],
  existingCategories: readonly ExistingPrintShopSeedDocument[],
): PrintShopSeedPlan {
  const productBySku = createUniqueIndex(existingProducts, 'sku');
  const categoryByValue = createUniqueIndex(existingCategories, 'value');
  const productById = new Map(existingProducts.map(document => [document.id, document]));
  const categoryById = new Map(existingCategories.map(document => [document.id, document]));
  const operations: PrintShopSeedOperation[] = [];

  for (const category of PRINT_SHOP_CATEGORIES) {
    const { id, ...data } = category;
    const normalizedValue = category.value.toLocaleLowerCase('en-US');
    const existing = selectExistingDocument(
      `categoria ${category.value}`,
      id,
      categoryByValue.get(normalizedValue),
      categoryById.get(id),
    );
    operations.push(operationFor('productCategories', id, { ...data }, existing));
  }

  for (const product of PRINT_SHOP_CATALOG) {
    const { id, ...data } = product;
    const normalizedSku = product.sku.toLocaleLowerCase('en-US');
    const existing = selectExistingDocument(
      `prodotto ${product.sku}`,
      id,
      productBySku.get(normalizedSku),
      productById.get(id),
    );
    operations.push(operationFor('products', id, { ...data }, existing));
  }

  return {
    operations,
    summary: {
      create: operations.filter(operation => operation.action === 'create').length,
      update: operations.filter(operation => operation.action === 'update').length,
      unchanged: operations.filter(operation => operation.action === 'unchanged').length,
    },
  };
}
