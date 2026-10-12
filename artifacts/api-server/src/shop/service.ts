import type { ShopCatalogDto, ShopSettings } from '@shared/shop-types';
import { buildShopCatalog, normalizeShopSettings, type ShopDocument } from './catalog.js';

export const SHOP_SETTINGS_PATH = { collection: 'settings', doc: 'shop' } as const;

export interface ShopServiceDependencies {
  db: any;
  now?: () => Date;
}

export class ShopService {
  constructor(private readonly deps: ShopServiceDependencies) {}

  protected now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  /** Impostazioni ripulite: valori mancanti o non validi tornano a quelli di riserva. */
  async settings(): Promise<ShopSettings> {
    const doc = await this.deps.db.collection(SHOP_SETTINGS_PATH.collection).doc(SHOP_SETTINGS_PATH.doc).get();
    return normalizeShopSettings(doc.exists ? doc.data() : undefined);
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
