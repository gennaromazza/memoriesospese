import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebase-admin', () => ({ db: {} }));

import {
  BLOG_SEO_RENDERING_LASTMOD,
  blogSitemapLastModifiedDate,
  buildWeddingSitemapEntries,
} from './sitemap-generator';

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
});
