import { describe, expect, it } from 'vitest';
import { FakeFirestore } from '../print-shop/test-fakes';
import { ShopService } from './service';

const NOW = new Date('2026-12-01T10:00:00Z');

function setup() {
  const db = new FakeFirestore();
  const service = new ShopService({ db: db as any, now: () => NOW });
  return { db, service };
}

function seedCatalog(db: FakeFirestore) {
  db.seed('productCategories/c1', { value: 'natale', nome: 'Natale', attivo: true, displayOrder: 1 });
  db.seed('productCategories/c2', { value: 'album', nome: 'Album', attivo: true, displayOrder: 2 });
  db.seed('products/p1', { nome: 'Tazza', descrizione: '', prezzo: 12, sconto: 0, numeroFoto: 1, categoria: 'natale', attivo: true, immagini: [] });
  db.seed('products/p2', { nome: 'Album 20', descrizione: '', prezzo: 90, sconto: 0, numeroFoto: 20, categoria: 'album', attivo: true, immagini: [] });
}

describe('ShopService', () => {
  it('parte spento e senza prodotti', async () => {
    const { db, service } = setup();
    seedCatalog(db);
    expect(await service.settings()).toMatchObject({ enabled: false, categoryValues: [] });
    expect(await service.publicCatalog()).toMatchObject({ enabled: false, orderingOpen: false, products: [] });
  });

  it('salva le impostazioni ripulite e senza dati riservati', async () => {
    const { db, service } = setup();
    const saved = await service.updateSettings({
      enabled: true,
      ordersOpen: false,
      categoryValues: ['natale', 'bad value'],
      lastOrderDate: '2026-12-18',
      photoWaitDays: 10,
      shipping: { enabled: true, priceCents: 590, estimatedMinDays: 3, estimatedMaxDays: 6 },
      notifyEmails: ['segreto@example.com'],
    });
    expect(saved.categoryValues).toEqual(['natale']);
    const stored = db.value('settings/shop');
    expect(stored).toMatchObject({ enabled: true, categoryValues: ['natale'], photoWaitDays: 10 });
    expect(stored.notifyEmails).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain('@');
    expect(await service.settings()).toEqual(saved);
  });

  it('il catalogo pubblico contiene solo la categoria abilitata', async () => {
    const { db, service } = setup();
    seedCatalog(db);
    await service.updateSettings({ enabled: true, ordersOpen: true, categoryValues: ['natale'] });
    const catalog = await service.publicCatalog();
    expect(catalog.products.map(product => [product.id, product.priceCents, product.photosRequired])).toEqual([['p1', 1200, 1]]);
    expect(catalog.categories.map(category => category.value)).toEqual(['natale']);
    expect(catalog.orderingOpen).toBe(true);
  });

  it('con la vetrina accesa ma senza categorie non legge i prodotti', async () => {
    const { db, service } = setup();
    seedCatalog(db);
    await service.updateSettings({ enabled: true, categoryValues: [] });
    expect(await service.publicCatalog()).toMatchObject({ enabled: true, products: [], categories: [] });
  });
});
