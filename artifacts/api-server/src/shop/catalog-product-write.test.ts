import { describe, expect, it, vi } from 'vitest';
import { FakeDocumentReference, FakeFirestore } from '../print-shop/test-fakes';
import {
  deleteCatalogProduct,
  reorderCatalogProducts,
  saveCatalogProduct,
} from './catalog-product-write';

const product = {
  nome: 'Cornice', descrizione: 'Personalizzata', prezzo: 20, sconto: 10,
  numeroFoto: 1, categoria: 'natale', attivo: true, immagini: ['https://example.test/image.jpg'],
};

describe('salvataggio amministrativo prodotto', () => {
  it('crea prodotto e costo separati e calcola il prezzo finale sul server', async () => {
    const db = new FakeFirestore();
    const id = await saveCatalogProduct(db, { ...product, costoUnitario: 8.5 });
    const saved = (await db.collection('products').doc(id).get()).data();
    expect(saved).toMatchObject({ nome: 'Cornice', prezzoFinale: 18, attivo: true });
    expect(saved).not.toHaveProperty('costoUnitario');
    expect((await db.collection('shopProductCosts').doc(id).get()).data()).toMatchObject({ costoUnitario: 8.5 });
  });

  it('modifica senza perdere immagini e costo, elimina il costo solo con null esplicito', async () => {
    const db = new FakeFirestore();
    const id = await saveCatalogProduct(db, { ...product, costoUnitario: 8.5 });
    await saveCatalogProduct(db, { prezzo: 30 }, id);
    expect((await db.collection('products').doc(id).get()).data()).toMatchObject({ immagini: product.immagini, prezzoFinale: 27 });
    expect((await db.collection('shopProductCosts').doc(id).get()).exists).toBe(true);
    await saveCatalogProduct(db, { costoUnitario: null }, id);
    expect((await db.collection('shopProductCosts').doc(id).get()).exists).toBe(false);
  });

  it('rifiuta campi riservati, valori errati e ID inesistenti', async () => {
    const db = new FakeFirestore();
    await expect(saveCatalogProduct(db, { ...product, costoUnitario: -1 })).rejects.toThrow();
    await expect(saveCatalogProduct(db, { ...product, salesChannels: ['print_shop'] })).rejects.toThrow();
    await expect(saveCatalogProduct(db, { prezzo: 20 }, 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('blocca modifiche dei formati gestiti dal catalogo stampe', async () => {
    const db = new FakeFirestore();
    db.seed('products/print', { ...product, salesChannels: ['print_shop'] });
    await expect(saveCatalogProduct(db, { prezzo: 1 }, 'print')).rejects.toMatchObject({ code: 'print_shop_route_required' });
  });

  it('elimina prodotto e costo privato insieme e blocca il catalogo stampe', async () => {
    const db = new FakeFirestore();
    db.seed('products/p1', product);
    db.seed('shopProductCosts/p1', { costoUnitario: 8.5 });

    await deleteCatalogProduct(db, 'p1');
    expect(db.value('products/p1')).toBeUndefined();
    expect(db.value('shopProductCosts/p1')).toBeUndefined();

    db.seed('products/print', { ...product, salesChannels: ['admin', 'print_shop'] });
    db.seed('shopProductCosts/print', { costoUnitario: 4 });
    await expect(deleteCatalogProduct(db, 'print')).rejects.toMatchObject({ code: 'print_shop_route_required' });
    expect(db.value('products/print')).toBeDefined();
    expect(db.value('shopProductCosts/print')).toBeDefined();
  });

  it('riordina solo prodotti ordinari e rifiuta ID duplicati o mancanti', async () => {
    const db = new FakeFirestore();
    db.seed('products/p1', product);
    db.seed('products/p2', product);
    db.seed('products/print', { ...product, salesChannels: ['print_shop'] });

    expect(await reorderCatalogProducts(db, { ids: ['p2', 'p1'] }, new Date('2026-12-10T12:00:00Z'))).toBe(2);
    expect(db.value('products/p2')).toMatchObject({ displayOrder: 1, updatedAt: new Date('2026-12-10T12:00:00Z') });
    expect(db.value('products/p1')).toMatchObject({ displayOrder: 2 });

    await expect(reorderCatalogProducts(db, { ids: ['p1', 'p1'] })).rejects.toThrow();
    await expect(reorderCatalogProducts(db, { ids: ['missing'] })).rejects.toMatchObject({ status: 404 });
    await expect(reorderCatalogProducts(db, { ids: ['print'] })).rejects.toMatchObject({ code: 'print_shop_route_required' });
  });

  it('ripristina entrambi i documenti se la cancellazione fallisce a metà commit', async () => {
    const db = new FakeFirestore();
    db.seed('products/p1', product);
    db.seed('shopProductCosts/p1', { costoUnitario: 8.5 });
    const originalDelete = FakeDocumentReference.prototype.delete;
    const failAfterCostDelete = vi.spyOn(FakeDocumentReference.prototype, 'delete').mockImplementation(async function (this: FakeDocumentReference) {
      await originalDelete.call(this);
      if (this.path === 'shopProductCosts/p1') throw new Error('injected transaction write failure');
    });

    try {
      await expect(deleteCatalogProduct(db, 'p1')).rejects.toThrow('injected transaction write failure');
      expect(db.value('products/p1')).toEqual(product);
      expect(db.value('shopProductCosts/p1')).toEqual({ costoUnitario: 8.5 });
    } finally {
      failAfterCostDelete.mockRestore();
    }
  });

  it('ripristina il riordino se una scrittura fallisce dopo un aggiornamento', async () => {
    const db = new FakeFirestore();
    db.seed('products/p1', { ...product, displayOrder: 12 });
    db.seed('products/p2', { ...product, displayOrder: 24 });
    const originalUpdate = FakeDocumentReference.prototype.update;
    const failAfterSecondUpdate = vi.spyOn(FakeDocumentReference.prototype, 'update').mockImplementation(async function (
      this: FakeDocumentReference,
      value: any,
    ) {
      await originalUpdate.call(this, value);
      if (this.path === 'products/p2') throw new Error('injected transaction write failure');
    });

    try {
      await expect(reorderCatalogProducts(db, { ids: ['p1', 'p2'] })).rejects.toThrow('injected transaction write failure');
      expect(db.value('products/p1')).toMatchObject({ displayOrder: 12 });
      expect(db.value('products/p2')).toMatchObject({ displayOrder: 24 });
    } finally {
      failAfterSecondUpdate.mockRestore();
    }
  });
});
