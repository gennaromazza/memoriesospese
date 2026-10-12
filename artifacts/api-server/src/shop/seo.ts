import { SHOP_SEO, shopCategoryPath, shopCategorySeo } from '@shared/shop-landing-content';
import { formatShopPrice, shopDayKey, type ShopCatalogDto, type ShopProductDto } from '@shared/shop-types';

/**
 * Dati dello shop per Google: elenco dei prodotti leggibile senza JavaScript e
 * dati strutturati (Product, Offer, ItemList). Tutto viene dal catalogo che la
 * pagina mostra, così prezzi e disponibilità coincidono sempre con quelli visibili.
 */

const BASE_URL = 'https://imagestudiofotografico.com';
const SHOP_URL = `${BASE_URL}/online-shop`;
const BRAND = 'Image Studio';

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Indirizzo con cui la pagina raggiunge il prodotto (lo stesso `id` della scheda nella vetrina). */
export function shopProductUrl(productId: string): string {
  return `${SHOP_URL}#prodotto-${encodeURIComponent(productId)}`;
}

function productDescription(product: ShopProductDto): string {
  const text = product.descrizione.trim();
  if (text) return text;
  return product.photosRequired > 0
    ? `${product.nome}: prodotto personalizzato con ${product.photosRequired === 1 ? 'una tua foto' : `${product.photosRequired} tue foto`}.`
    : `${product.nome}, in vendita nello shop online Image Studio.`;
}

/** Disponibilità come la vede il cliente: ordini aperti, non ancora aperti, oppure chiusi dopo l'ultimo giorno. */
export function shopAvailability(catalog: Pick<ShopCatalogDto, 'orderingOpen' | 'lastOrderDate'>, now: Date): string {
  if (catalog.orderingOpen) return 'https://schema.org/InStock';
  if (catalog.lastOrderDate && shopDayKey(now) > catalog.lastOrderDate) return 'https://schema.org/OutOfStock';
  return 'https://schema.org/PreOrder';
}

/** Elenco dei prodotti in HTML semplice, per chi legge la pagina senza eseguire il sito. */
export function shopProductsBody(catalog: ShopCatalogDto): string {
  if (!catalog.enabled || catalog.products.length === 0) return '';
  const items = catalog.products
    .map(product => {
      const photos = product.photosRequired > 0
        ? ` ${product.photosRequired === 1 ? 'Serve 1 tua foto.' : `Servono ${product.photosRequired} tue foto.`}`
        : '';
      return `<h3>${escapeHtml(product.nome)}</h3><p>${escapeHtml(productDescription(product))}</p><p>Prezzo: ${escapeHtml(formatShopPrice(product.priceCents))}.${photos}</p>`;
    })
    .join('');
  return `<h2>I nostri prodotti</h2>${items}`;
}

/** Dati strutturati: un elenco e un Product con Offer per ogni prodotto che ha almeno un'immagine pubblica. */
export function shopProductsJsonLd(catalog: ShopCatalogDto, now: Date, listName = 'Shop online Image Studio'): object[] {
  if (!catalog.enabled || catalog.products.length === 0) return [];
  const availability = shopAvailability(catalog, now);
  const validUntil = catalog.lastOrderDate && shopDayKey(now) <= catalog.lastOrderDate ? catalog.lastOrderDate : undefined;
  const list = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    itemListElement: catalog.products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: product.nome,
      url: shopProductUrl(product.id),
    })),
  };
  const products = catalog.products
    .filter(product => product.images.some(image => /^https:\/\//i.test(image)))
    .map(product => ({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.nome,
      description: productDescription(product),
      image: product.images.filter(image => /^https:\/\//i.test(image)),
      sku: product.id,
      brand: { '@type': 'Brand', name: BRAND },
      offers: {
        '@type': 'Offer',
        url: shopProductUrl(product.id),
        priceCurrency: catalog.currency,
        price: (product.priceCents / 100).toFixed(2),
        availability,
        ...(validUntil ? { priceValidUntil: validUntil } : {}),
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@type': 'Organization', name: BRAND },
      },
    }));
  return [list, ...products];
}

// ---------------------------------------------------------------------------
// Pagine per categoria
// ---------------------------------------------------------------------------

/** Il catalogo ridotto a una sola categoria, o null se lo shop è spento o la categoria non esiste o non ha prodotti. */
export function shopCategoryCatalog(catalog: ShopCatalogDto, value: string): ShopCatalogDto | null {
  if (!catalog.enabled) return null;
  const category = catalog.categories.find(item => item.value === value);
  const products = catalog.products.filter(product => product.categoria === value);
  if (!category || products.length === 0) return null;
  return { ...catalog, categories: [category], products };
}

export interface ShopCategoryPageSeo {
  title: string;
  description: string;
  canonical: string;
  bodyContent: string;
  jsonLd: object[];
}

/** Titolo, testi e dati strutturati della pagina di una categoria; null se la pagina non deve esistere. */
export function buildShopCategoryPageMeta(catalog: ShopCatalogDto, value: string, now: Date): ShopCategoryPageSeo | null {
  const scoped = shopCategoryCatalog(catalog, value);
  if (!scoped) return null;
  const seo = shopCategorySeo(scoped.categories[0].nome);
  const canonical = `${BASE_URL}${shopCategoryPath(value)}`;
  return {
    title: seo.title,
    description: seo.description,
    canonical,
    bodyContent: `
        <h1>${escapeHtml(seo.h1)}: ${escapeHtml(seo.script)}</h1>
        <p>${escapeHtml(seo.lede)}</p>
        ${shopProductsBody(scoped)}
        <p><a href="${SHOP_URL}">${escapeHtml(SHOP_SEO.h1)}: tutte le categorie</a> · <a href="${BASE_URL}/regala">Gift card e idee regalo di Natale</a> · <a href="${BASE_URL}/">Image Studio Fotografico, Aversa</a></p>
      `,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
          { '@type': 'ListItem', position: 2, name: SHOP_SEO.breadcrumb, item: SHOP_URL },
          { '@type': 'ListItem', position: 3, name: seo.breadcrumb, item: canonical },
        ],
      },
      ...shopProductsJsonLd(scoped, now, `${seo.h1} | Image Studio`),
    ],
  };
}

/** Indirizzi delle categorie da mettere nella mappa del sito: solo quelle con almeno un prodotto, a vetrina accesa. */
export function shopCategorySitemapPaths(catalog: ShopCatalogDto): string[] {
  if (!catalog.enabled) return [];
  return catalog.categories
    .filter(category => catalog.products.some(product => product.categoria === category.value))
    .map(category => shopCategoryPath(category.value));
}
