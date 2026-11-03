import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMock = vi.hoisted(() => {
  const batchSet = vi.fn();
  const batchUpdate = vi.fn();
  const batchDelete = vi.fn();
  const batchCommit = vi.fn().mockResolvedValue(undefined);
  return {
    db: {},
    batchSet,
    batchUpdate,
    batchDelete,
    batchCommit,
    collection: vi.fn(),
    doc: vi.fn(),
    addDoc: vi.fn(),
    getDocs: vi.fn(),
    getDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    query: vi.fn(),
    orderBy: vi.fn(),
    Timestamp: { fromDate: vi.fn() },
    serverTimestamp: vi.fn(() => ({ serverTimestamp: true })),
    writeBatch: vi.fn(() => ({
      set: batchSet,
      update: batchUpdate,
      delete: batchDelete,
      commit: batchCommit,
    })),
  };
});

const shopApiMock = vi.hoisted(() => ({
  getAdminProductCosts: vi.fn(),
}));

vi.mock('firebase/firestore', () => firestoreMock);
vi.mock('@/lib/firebase', () => ({ db: firestoreMock.db }));
vi.mock('@/features/shop/shop-api', () => ({ shopApi: shopApiMock }));
vi.mock('./product-categories', () => ({
  getProductCategories: vi.fn(),
  getActiveProductCategories: vi.fn(),
  createProductCategory: vi.fn(),
  updateProductCategory: vi.fn(),
  deleteProductCategory: vi.fn(),
  reorderProductCategories: vi.fn(),
  toggleProductCategoryStatus: vi.fn(),
}));

import { createProduct, deleteProduct, getAllProducts, getAllProductsWithShopCosts, updateProduct } from './products';

function newProduct(patch: Record<string, unknown> = {}) {
  return {
    nome: 'Tazza di Natale',
    descrizione: 'Personalizzata',
    prezzo: 20,
    sconto: 10,
    numeroFoto: 1,
    categoria: 'natale',
    attivo: true,
    ...patch,
  } as any;
}

describe('costo riservato dei prodotti shop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMock.collection.mockImplementation((_db: unknown, path: string) => ({ path }));
    firestoreMock.doc.mockImplementation((first: any, ...parts: string[]) => {
      if (parts.length === 0 && typeof first?.path === 'string') {
        return { id: 'new-product', path: `${first.path}/new-product` };
      }
      const path = parts.join('/');
      return { id: parts.at(-1), path };
    });
    firestoreMock.addDoc.mockResolvedValue({ id: 'legacy-new-product' });
    firestoreMock.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ nome: 'Tazza di Natale', prezzo: 20, sconto: 10 }),
    });
    firestoreMock.getDocs.mockImplementation(async (ref: { path: string }) => {
      if (ref.path === 'products') {
        return { docs: [{ id: 'legacy', data: () => ({ nome: 'Legacy', prezzo: 20, sconto: 0 }) }] };
      }
      throw new Error(`Unexpected collection: ${ref.path}`);
    });
    shopApiMock.getAdminProductCosts.mockResolvedValue([{ productId: 'legacy', costoUnitario: 8.25 }]);
  });

  it('salva il prodotto e il costo in documenti separati nella stessa scrittura', async () => {
    const id = await createProduct(newProduct({ costoUnitario: 8.5 }));

    expect(id).toBe('new-product');
    expect(firestoreMock.batchSet).toHaveBeenCalledTimes(2);
    const [productRef, productData] = firestoreMock.batchSet.mock.calls[0];
    expect(productRef.path).toBe('products/new-product');
    expect(productData).not.toHaveProperty('costoUnitario');
    expect(firestoreMock.batchSet.mock.calls[1]).toMatchObject([
      { path: 'shopProductCosts/new-product' },
      { costoUnitario: 8.5 },
    ]);
    expect(firestoreMock.batchCommit).toHaveBeenCalledOnce();
  });

  it('crea un prodotto ordinario direttamente senza includere costi o canali riservati', async () => {
    const id = await createProduct(newProduct({ costoUnitario: undefined }));

    expect(id).toBe('legacy-new-product');
    expect(firestoreMock.addDoc).toHaveBeenCalledOnce();
    const [, productData] = firestoreMock.addDoc.mock.calls[0];
    expect(productData).toMatchObject({ nome: 'Tazza di Natale', prezzoFinale: 18 });
    expect(productData).not.toHaveProperty('costoUnitario');
    expect(productData).not.toHaveProperty('salesChannels');
    expect(firestoreMock.writeBatch).not.toHaveBeenCalled();
  });

  it('non instrada prodotti gestiti dallo shop alle scritture client', async () => {
    await expect(createProduct(newProduct({
      salesChannels: ['admin', 'print_shop'],
    }))).rejects.toMatchObject({ code: 'print_shop_route_required' });

    expect(firestoreMock.addDoc).not.toHaveBeenCalled();
    expect(firestoreMock.writeBatch).not.toHaveBeenCalled();
  });

  it('aggiorna o rimuove il costo senza scriverlo nel documento pubblico del prodotto', async () => {
    await updateProduct('p1', { costoUnitario: 0 });
    const [, productData] = firestoreMock.batchUpdate.mock.calls[0];
    expect(productData).not.toHaveProperty('costoUnitario');
    expect(firestoreMock.batchSet).toHaveBeenCalledWith(
      { id: 'p1', path: 'shopProductCosts/p1' },
      expect.objectContaining({ costoUnitario: 0 }),
    );

    await updateProduct('p1', { costoUnitario: undefined });
    expect(firestoreMock.batchDelete).toHaveBeenCalledWith({ id: 'p1', path: 'shopProductCosts/p1' });
  });

  it('rifiuta costi negativi e carica i costi solo tramite la funzione admin dedicata', async () => {
    await expect(createProduct(newProduct({ costoUnitario: -1 }))).rejects.toThrow(/non negativo/);
    expect(firestoreMock.addDoc).not.toHaveBeenCalled();
    expect(firestoreMock.batchSet).not.toHaveBeenCalled();

    const publicProducts = await getAllProducts();
    expect(publicProducts[0]).not.toHaveProperty('costoUnitario');
    const adminProducts = await getAllProductsWithShopCosts();
    expect(adminProducts[0]).toMatchObject({ id: 'legacy', costoUnitario: 8.25 });
  });

  it('elimina anche il documento privato del costo quando si rimuove il prodotto', async () => {
    await deleteProduct('p1');
    expect(firestoreMock.batchDelete).toHaveBeenCalledWith({ id: 'p1', path: 'products/p1' });
    expect(firestoreMock.batchDelete).toHaveBeenCalledWith({ id: 'p1', path: 'shopProductCosts/p1' });
  });

  it('non aggiorna direttamente un prodotto già gestito dal catalogo stampe', async () => {
    firestoreMock.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ nome: 'Formato', salesChannels: ['admin', 'print_shop'] }),
    });

    await expect(updateProduct('print-format', { nome: 'Formato modificato' }))
      .rejects.toMatchObject({ code: 'print_shop_route_required' });
    expect(firestoreMock.updateDoc).not.toHaveBeenCalled();
    expect(firestoreMock.batchUpdate).not.toHaveBeenCalled();
  });
});
