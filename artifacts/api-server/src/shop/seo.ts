import { formatShopPrice, shopDayKey, type ShopCatalogDto, type ShopProductDto } from '@shared/shop-types';

/**
 * Dati dello shop per Google: elenco dei prodotti leggibile senza JavaScript e
 * dati strutturati (Product, Offer, ItemList). Tutto viene dal catalogo che la
 * pagina mostra, così prezzi e disponibilità coincidono sempre con quelli visibili.
 */

const BASE_URL = 'https://imagestudiofotografico.com';
const SHOP_URL = `${BASE_URL}/shop-natale`;
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
    : `${product.nome}, in vendita nello shop di Natale Image Studio.`;
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
export function shopProductsJsonLd(catalog: ShopCatalogDto, now: Date): object[] {
  if (!catalog.enabled || catalog.products.length === 0) return [];
  const availability = shopAvailability(catalog, now);
  const validUntil = catalog.lastOrderDate && shopDayKey(now) <= catalog.lastOrderDate ? catalog.lastOrderDate : undefined;
  const list = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Shopping di Natale Image Studio',
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
