import { describe, expect, it } from 'vitest';
import { GIFT_HOW_SEO, GIFT_SHOP_FAQS, GIFT_SHOP_SEO } from '@shared/gift-card-landing-content';
import { SHOP_FAQS, SHOP_SEO, shopCategoryPath, shopCategorySeo, shopCategoryValueFromPath } from '@shared/shop-landing-content';
import type { ShopCatalogDto, ShopProductDto } from '@shared/shop-types';
import { buildShopCategoryPageMeta, shopAvailability, shopCategoryCatalog, shopCategorySitemapPaths, shopProductUrl, shopProductsBody, shopProductsJsonLd } from './seo';

const product = (patch: Partial<ShopProductDto> = {}): ShopProductDto => ({
  id: 'tazza',
  nome: 'Tazza con la tua foto',
  descrizione: 'Una tazza personalizzata.',
  priceCents: 1500,
  listPriceCents: 1500,
  discountPercent: 0,
  photosRequired: 1,
  categoria: 'natale',
  images: ['https://img.test/tazza.jpg'],
  displayOrder: 1,
  ...patch,
});

const catalog = (patch: Partial<ShopCatalogDto> = {}): ShopCatalogDto => ({
  enabled: true,
  orderingOpen: true,
  lastOrderDate: '2026-12-18',
  currency: 'EUR',
  categories: [{ value: 'natale', nome: 'Natale' }],
  products: [product()],
  shipping: { enabled: false, priceCents: 0, estimatedMinDays: 3, estimatedMaxDays: 7 },
  photoWaitDays: 7,
  ...patch,
});

const NOW = new Date('2026-12-01T10:00:00Z');

describe('dati strutturati dello shop', () => {
  it('ogni prodotto con immagine ha un Product con prezzo, valuta, disponibilità e indirizzo', () => {
    const [list, item] = shopProductsJsonLd(catalog(), NOW) as any[];
    expect(list).toMatchObject({ '@type': 'ItemList', itemListElement: [{ position: 1, name: 'Tazza con la tua foto', url: shopProductUrl('tazza') }] });
    expect(item).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Tazza con la tua foto',
      description: 'Una tazza personalizzata.',
      image: ['https://img.test/tazza.jpg'],
      sku: 'tazza',
      offers: {
        '@type': 'Offer',
        price: '15.00',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        priceValidUntil: '2026-12-18',
        url: 'https://imagestudiofotografico.com/online-shop#prodotto-tazza',
      },
    });
  });

  it('il prezzo è quello scontato che il cliente paga, con due decimali', () => {
    const [, item] = shopProductsJsonLd(catalog({ products: [product({ priceCents: 4550, listPriceCents: 5000 })] }), NOW) as any[];
    expect(item.offers.price).toBe('45.50');
  });

  it('un prodotto senza immagine pubblica resta nell\'elenco ma non ha un Product (Google lo richiede)', () => {
    const items = shopProductsJsonLd(catalog({ products: [product(), product({ id: 'cartolina', nome: 'Cartolina', images: [] }), product({ id: 'x', nome: 'Locale', images: ['http://img.test/x.jpg'] })] }), NOW) as any[];
    expect(items[0].itemListElement).toHaveLength(3);
    expect(items.filter(item => item['@type'] === 'Product').map(item => item.name)).toEqual(['Tazza con la tua foto']);
  });

  it('la disponibilità segue lo stato degli ordini', () => {
    expect(shopAvailability({ orderingOpen: true, lastOrderDate: null }, NOW)).toBe('https://schema.org/InStock');
    expect(shopAvailability({ orderingOpen: false, lastOrderDate: '2026-12-18' }, NOW)).toBe('https://schema.org/PreOrder');
    expect(shopAvailability({ orderingOpen: false, lastOrderDate: null }, NOW)).toBe('https://schema.org/PreOrder');
    expect(shopAvailability({ orderingOpen: false, lastOrderDate: '2026-11-30' }, NOW)).toBe('https://schema.org/OutOfStock');
  });

  it('dopo l\'ultimo giorno non propone una data di validità già passata', () => {
    const [, item] = shopProductsJsonLd(catalog({ orderingOpen: false, lastOrderDate: '2026-11-30' }), NOW) as any[];
    expect(item.offers.priceValidUntil).toBeUndefined();
    expect(item.offers.availability).toBe('https://schema.org/OutOfStock');
  });

  it('con la vetrina spenta o vuota non pubblica nulla', () => {
    expect(shopProductsJsonLd(catalog({ enabled: false }), NOW)).toEqual([]);
    expect(shopProductsJsonLd(catalog({ products: [] }), NOW)).toEqual([]);
    expect(shopProductsBody(catalog({ enabled: false }))).toBe('');
    expect(shopProductsBody(catalog({ products: [] }))).toBe('');
  });

  it('senza descrizione ne scrive una vera, senza inventare caratteristiche', () => {
    const [, item] = shopProductsJsonLd(catalog({ products: [product({ descrizione: '', photosRequired: 8 })] }), NOW) as any[];
    expect(item.description).toBe('Tazza con la tua foto: prodotto personalizzato con 8 tue foto.');
  });
});

describe('elenco dei prodotti leggibile senza JavaScript', () => {
  it('mostra nome, descrizione, prezzo e foto richieste', () => {
    const html = shopProductsBody(catalog());
    expect(html).toContain('<h2>I nostri prodotti</h2>');
    expect(html).toContain('<h3>Tazza con la tua foto</h3>');
    expect(html).toContain('Una tazza personalizzata.');
    expect(html).toContain('15,00');
    expect(html).toContain('Serve 1 tua foto.');
  });

  it('il codice HTML scritto nel nome o nella descrizione non passa', () => {
    const html = shopProductsBody(catalog({ products: [product({ nome: '<script>alert(1)</script>', descrizione: 'a "b" & <i>c</i>' })] }));
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<i>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &quot;b&quot; &amp; &lt;i&gt;c&lt;/i&gt;');
  });
});

describe('titoli e descrizioni per Google', () => {
  const pages = {
    shop: { title: SHOP_SEO.title, description: SHOP_SEO.description },
    regala: { title: GIFT_SHOP_SEO.title, description: GIFT_SHOP_SEO.description },
    comeFunziona: { title: GIFT_HOW_SEO.title, description: GIFT_HOW_SEO.description },
  };

  it('i titoli stanno nei 60 caratteri che Google mostra e le descrizioni nei 160', () => {
    for (const [name, page] of Object.entries(pages)) {
      expect(page.title.length, `titolo ${name}`).toBeLessThanOrEqual(60);
      expect(page.title.length, `titolo ${name}`).toBeGreaterThanOrEqual(30);
      expect(page.description.length, `descrizione ${name}`).toBeLessThanOrEqual(160);
      expect(page.description.length, `descrizione ${name}`).toBeGreaterThanOrEqual(70);
    }
  });

  it('ogni pagina ha titolo e descrizione diversi dalle altre', () => {
    const titles = Object.values(pages).map(page => page.title);
    const descriptions = Object.values(pages).map(page => page.description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it('dicono dove e di cosa si tratta: Aversa, shop online, gift card', () => {
    expect(SHOP_SEO.title + SHOP_SEO.description).toMatch(/Aversa/);
    expect(SHOP_SEO.title).toMatch(/Shop online/);
    expect(GIFT_SHOP_SEO.title).toMatch(/[Gg]ift card/);
    expect(GIFT_SHOP_SEO.title + GIFT_SHOP_SEO.description).toMatch(/Aversa/);
  });

  it('le domande frequenti non si ripetono e hanno una risposta vera', () => {
    for (const faqs of [SHOP_FAQS, GIFT_SHOP_FAQS]) {
      const questions = faqs.map(faq => faq.question);
      expect(new Set(questions).size).toBe(questions.length);
      for (const faq of faqs) expect(faq.answer.length).toBeGreaterThan(30);
    }
  });

  it('lo shop rimanda alle gift card, non più a "idee regalo" generiche', () => {
    expect(JSON.stringify(SHOP_FAQS)).toMatch(/gift card/);
    expect(JSON.stringify(SHOP_FAQS)).not.toMatch(/usa le idee regalo/);
  });
});

describe('pagina di una categoria', () => {
  const two = catalog({
    categories: [{ value: 'natale', nome: 'Shopping online Natale 2026' }, { value: 'tazze', nome: 'Tazze & mug' }, { value: 'vuota', nome: 'Senza prodotti' }],
    products: [
      product({ id: 'tazza', categoria: 'natale' }),
      product({ id: 'mug', nome: 'Mug nero', categoria: 'tazze' }),
      product({ id: 'mug2', nome: 'Mug bianco', categoria: 'tazze' }),
    ],
  });

  it('contiene solo i prodotti della categoria, con titolo e indirizzo propri', () => {
    const meta = buildShopCategoryPageMeta(two, 'tazze', NOW)!;
    expect(meta.title).toBe('Tazze & mug | Regali Image Studio Aversa');
    expect(meta.canonical).toBe('https://imagestudiofotografico.com/online-shop/categoria/tazze');
    expect(meta.bodyContent).toContain('<h1>Tazze &amp; mug: regali che nascono da una tua foto</h1>');
    expect(meta.bodyContent).toContain('Mug nero');
    expect(meta.bodyContent).toContain('Mug bianco');
    expect(meta.bodyContent).not.toContain('Tazza con la tua foto');
    expect(meta.bodyContent).toContain('href="https://imagestudiofotografico.com/online-shop"');
    const types = (meta.jsonLd as any[]).map(item => item['@type']);
    expect(types).toEqual(['BreadcrumbList', 'ItemList', 'Product', 'Product']);
    expect((meta.jsonLd as any[])[0].itemListElement.map((item: any) => item.name)).toEqual(['Home', 'Shop online', 'Tazze & mug']);
    expect((meta.jsonLd as any[])[1].itemListElement).toHaveLength(2);
  });

  it('non esiste per una categoria sconosciuta, senza prodotti, o con la vetrina spenta', () => {
    expect(buildShopCategoryPageMeta(two, 'inesistente', NOW)).toBeNull();
    expect(buildShopCategoryPageMeta(two, 'vuota', NOW)).toBeNull();
    expect(buildShopCategoryPageMeta({ ...two, enabled: false }, 'tazze', NOW)).toBeNull();
    expect(shopCategoryCatalog(two, 'tazze')?.products).toHaveLength(2);
  });

  it('titolo e descrizione restano nei limiti di Google anche con nomi lunghissimi', () => {
    const long = 'Collezione speciale di regali personalizzati di Natale per tutta la famiglia con foto';
    const seo = shopCategorySeo(long);
    expect(seo.title.length).toBeLessThanOrEqual(60);
    expect(seo.description.length).toBeLessThanOrEqual(160);
    expect(seo.title).toContain('| Regali Image Studio Aversa');
    expect(seo.title).toContain('…');
    expect(shopCategorySeo('Album').title).toBe('Album | Regali Image Studio Aversa');
    expect(shopCategorySeo('   ').h1).toBe('Prodotti');
    expect(seo.description).toMatch(/Aversa/);
  });

  it('nella mappa del sito entrano solo le categorie con prodotti, e solo a vetrina accesa', () => {
    expect(shopCategorySitemapPaths(two)).toEqual(['/online-shop/categoria/natale', '/online-shop/categoria/tazze']);
    expect(shopCategorySitemapPaths({ ...two, enabled: false })).toEqual([]);
  });

  it("l'indirizzo si costruisce e si legge senza ambiguità, e rifiuta valori non validi", () => {
    expect(shopCategoryPath('tazze')).toBe('/online-shop/categoria/tazze');
    expect(shopCategoryPath('a b/c')).toBe('/online-shop/categoria/a%20b%2Fc');
    expect(shopCategoryValueFromPath('/online-shop/categoria/tazze')).toBe('tazze');
    expect(shopCategoryValueFromPath('/online-shop/categoria/tazze/')).toBe('tazze');
    for (const bad of ['/online-shop/categoria', '/online-shop/categoria/', '/online-shop/categoria/a/b', '/online-shop/categoria/%E0%A4%A', '/online-shop/categoria/-x', '/online-shop/categoria/<script>', '/online-shop/ordine', '/online-shop']) {
      expect(shopCategoryValueFromPath(bad), bad).toBeNull();
    }
  });
});
