import type { ShopCatalogDto, ShopSettings } from '@shared/shop-types';
import { buildShopCatalog, normalizeShopSettings, type ShopDocument } from './catalog.js';
import {
  deleteCatalogProduct,
  reorderCatalogProducts,
  saveCatalogProduct,
} from './catalog-product-write.js';

export const SHOP_SETTINGS_PATH = { collection: 'settings', doc: 'shop' } as const;

export interface ShopServiceDependencies {
  db: any;
  now?: () => Date;
}

export class ShopService {
  constructor(private readonly deps: ShopServiceDependencies) {}

  async saveCatalogProduct(input: unknown, id?: string): Promise<string> {
    return saveCatalogProduct(this.deps.db, input, id);
  }

  async deleteCatalogProduct(id: unknown): Promise<void> {
    return deleteCatalogProduct(this.deps.db, id);
  }

  async reorderCatalogProducts(input: unknown): Promise<number> {
    return reorderCatalogProducts(this.deps.db, input, this.now());
  }

  protected now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  /** Impostazioni ripulite: valori mancanti o non validi tornano a quelli di riserva. */
  async settings(): Promise<ShopSettings> {
    const doc = await this.deps.db.collection(SHOP_SETTINGS_PATH.collection).doc(SHOP_SETTINGS_PATH.doc).get();
    return normalizeShopSettings(doc.exists ? doc.data() : undefined);
  }

  /** Costi unitari visibili solo tramite una rotta admin autenticata. */
  async adminProductCosts(): Promise<Array<{ productId: string; costoUnitario: number }>> {
    const snapshot = await this.deps.db.collection('shopProductCosts').get();
    return snapshot.docs.flatMap((doc: any) => {
      const costoUnitario = doc.data()?.costoUnitario;
      return typeof costoUnitario === 'number' && Number.isFinite(costoUnitario) && costoUnitario >= 0
        ? [{ productId: doc.id, costoUnitario }]
        : [];
    });
  }

  /**
   * Salva le impostazioni dopo averle ripulite. Il documento è pubblico in
   * lettura: non ci si scrive nulla di riservato (nemmeno chi ha modificato).
   */
  async updateSettings(input: unknown): Promise<ShopSettings> {
    const settings = normalizeShopSettings(input);
    await this.deps.db.collection(SHOP_SETTINGS_PATH.collection).doc(SHOP_SETTINGS_PATH.doc).set({
      ...settings,
      updatedAt: this.now(),
    });
    return settings;
  }

  /** Catalogo mostrato ai clienti: prodotti attivi delle categorie abilitate. */
  async publicCatalog(): Promise<ShopCatalogDto> {
    const settings = await this.settings();
    const now = this.now();
    if (!settings.enabled || settings.categoryValues.length === 0) {
      return buildShopCatalog({ settings, products: [], categories: [], now });
    }
    const [productsSnapshot, categoriesSnapshot] = await Promise.all([
      this.deps.db.collection('products').where('categoria', 'in', settings.categoryValues).get(),
      this.deps.db.collection('productCategories').where('value', 'in', settings.categoryValues).get(),
    ]);
    const read = (snapshot: any): ShopDocument[] =>
      snapshot.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
    return buildShopCatalog({
      settings,
      products: read(productsSnapshot),
      categories: read(categoriesSnapshot),
      now,
    });
  }
}
