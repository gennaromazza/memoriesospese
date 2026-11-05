import { describe, expect, it } from 'vitest';
import { FakeFirestore } from '../print-shop/test-fakes';
import { saveCatalogProduct } from './catalog-product-write';

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
});
