import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebase-admin', () => ({ db: {} }));

import { buildWeddingSitemapEntries } from './sitemap-generator';

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
