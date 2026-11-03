import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./firebase-admin', () => ({ db: {} }));

import {
  BLOG_SEO_RENDERING_LASTMOD,
  blogSitemapLastModifiedDate,
  buildShopCategorySitemapEntries,
  buildStaticSitemapEntries,
  buildWeddingSitemapEntries,
} from './sitemap-generator';
import { ShopService } from './shop/service';

describe('Blog sitemap', () => {
  it('signals the latest real article or shared SEO rendering update', () => {
    expect(blogSitemapLastModifiedDate({
      publishedAt: { seconds: 1_763_505_600 } as any,
    })).toBe(BLOG_SEO_RENDERING_LASTMOD);

    expect(blogSitemapLastModifiedDate({
      publishedAt: { seconds: 1_763_505_600 } as any,
      updatedAt: { seconds: Date.UTC(2026, 8, 10) / 1000 } as any,
    })).toBe('2026-09-10');
  });
});

describe('Real Wedding sitemap', () => {
  it('includes only published stories with their canonical URL and last modification', () => {
    const xml = buildWeddingSitemapEntries([
      { status: 'published', slug: 'anna-e-luca', updatedAt: { seconds: 1_780_000_000 } },
      { status: 'draft', slug: 'bozza-privata', updatedAt: { seconds: 1_780_000_100 } },
      { status: 'published', slug: '' },
    ]);

    expect(xml).toContain('https://imagestudiofotografico.com/real-wedding/anna-e-luca');
    expect(xml).toContain('<lastmod>2026-05-28</lastmod>');
    expect(xml).not.toContain('bozza-privata');
  });

  it('adds the published cover image when one is available', () => {
    const xml = buildWeddingSitemapEntries([
      {
        status: 'published',
        slug: 'anna-e-luca',
        title: 'Anna e Luca ad Aversa',
        coverImage: 'https://firebasestorage.googleapis.com/cover.jpg?alt=media&token=abc',
      },
    ]);

    expect(xml).toContain('<image:image>');
    expect(xml).toContain('<image:loc>https://firebasestorage.googleapis.com/cover.jpg?alt=media&amp;token=abc</image:loc>');
    expect(xml).toContain('<image:title>Anna e Luca ad Aversa</image:title>');
  });
});

describe('Static sitemap', () => {
  it('publishes canonical destinations but no audited legacy aliases', () => {
    const xml = buildStaticSitemapEntries();

    expect(xml.match(/<loc>https:\/\/imagestudiofotografico\.com\/image-experience<\/loc>/g)?.length)
      .toBe(1);
    expect(xml).toContain('<loc>https://imagestudiofotografico.com/portfolio/matrimonio</loc>');
    for (const alias of ['/esperienza', '/consultations', '/shop-natale', '/?p=']) {
      expect(xml).not.toContain(`https://imagestudiofotografico.com${alias}`);
    }
  });
});

describe('Sitemap della vetrina shop', () => {
  const original = process.env.SHOP_INDEXABLE;
  afterEach(() => {
    if (original === undefined) delete process.env.SHOP_INDEXABLE;
    else process.env.SHOP_INDEXABLE = original;
  });

  it('non elenca la vetrina finché è nascosta a Google', () => {
    delete process.env.SHOP_INDEXABLE;
    expect(buildStaticSitemapEntries('https://example.test')).not.toContain('/online-shop');
  });

  it('non include lo shop staticamente: serve verificare il catalogo attivo', () => {
    process.env.SHOP_INDEXABLE = 'true';
    expect(buildStaticSitemapEntries('https://example.test')).not.toContain('/online-shop');
  });

  it('include vetrina e sole categorie con prodotti vendibili', async () => {
    process.env.SHOP_INDEXABLE = 'true';
    vi.spyOn(ShopService.prototype, 'publicCatalog').mockResolvedValue({
      enabled: true,
      orderingOpen: true,
      lastOrderDate: null,
      currency: 'EUR',
      shipping: {} as any,
      photoWaitDays: 7,
      categories: [
        { value: 'natale', nome: 'Natale' },
        { value: 'vuota', nome: 'Vuota' },
      ],
      products: [{ id: 'p1', categoria: 'natale' }],
    } as any);

    const xml = await buildShopCategorySitemapEntries('https://example.test');

    expect(xml).toContain('<loc>https://example.test/online-shop</loc>');
    expect(xml).toContain('<loc>https://example.test/online-shop/categoria/natale</loc>');
    expect(xml).not.toContain('/categoria/vuota');
  });

  it('esclude vetrina e categorie quando shop o catalogo sono spenti', async () => {
    process.env.SHOP_INDEXABLE = 'true';
    vi.spyOn(ShopService.prototype, 'publicCatalog').mockResolvedValue({
      enabled: false,
      orderingOpen: false,
      lastOrderDate: null,
      currency: 'EUR',
      shipping: {} as any,
      photoWaitDays: 7,
      categories: [],
      products: [],
    } as any);

    expect(await buildShopCategorySitemapEntries('https://example.test')).toBe('');
  });
});

describe('Sitemap delle pagine regalo', () => {
  const original = process.env.GIFT_SHOP_INDEXABLE;
  afterEach(() => {
    if (original === undefined) delete process.env.GIFT_SHOP_INDEXABLE;
    else process.env.GIFT_SHOP_INDEXABLE = original;
  });

  it('non elenca le pagine regalo finché sono nascoste a Google', () => {
    delete process.env.GIFT_SHOP_INDEXABLE;
    const xml = buildStaticSitemapEntries('https://example.test');
    expect(xml).not.toContain('/regala');
  });

  it('le elenca quando vengono aperte a Google', () => {
    process.env.GIFT_SHOP_INDEXABLE = 'true';
    const xml = buildStaticSitemapEntries('https://example.test');
    expect(xml).toContain('<loc>https://example.test/regala</loc>');
    expect(xml).toContain('<loc>https://example.test/regala/come-funziona</loc>');
  });
});
