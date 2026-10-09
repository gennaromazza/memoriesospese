import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCollection } = vi.hoisted(() => ({ mockCollection: vi.fn() }));

vi.mock('./firebase-admin', () => ({ db: { collection: mockCollection } }));

import { buildWeddingStoryPageMeta, createSeoMiddleware } from './seo-prerender';
import {
  WEDDING_HOME_SEO,
  WEDDING_PORTFOLIO_SEO,
} from '../shared/public-seo-content';
import { WEDDING_PUBLIC_DATA_CACHE_CONTROL } from '../shared/wedding-seo-types';

type RenderedResponse = {
  body?: string;
  headers: Record<string, string>;
};

async function renderForCrawler(path: string): Promise<{
  response: RenderedResponse;
  next: ReturnType<typeof vi.fn>;
}> {
  const response: RenderedResponse = { headers: {} };
  const res = {
    setHeader: (name: string, value: string) => {
      response.headers[name] = value;
    },
    send: (body: string) => {
      response.body = body;
    },
  };
  const next = vi.fn();

  await createSeoMiddleware()(
    {
      path,
      headers: { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
    } as any,
    res as any,
    next,
  );

  return { response, next };
}

function getArticleImages(html: string): string[] {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const article = scripts
    .map(([, json]) => JSON.parse(json))
    .find(schema => schema['@type'] === 'Article');
  return article?.image ?? [];
}

describe('SEO prerender wedding-first', () => {
  beforeEach(() => mockCollection.mockReset());

  it.each([
    ['/', WEDDING_HOME_SEO.title, 'Fotografo e videografo di matrimonio ad Aversa, Napoli e Caserta'],
    [
      '/portfolio/matrimonio',
      WEDDING_PORTFOLIO_SEO.title,
      'Fotografo di Matrimonio ad Aversa, Napoli e Caserta',
    ],
  ])('renders coherent crawler HTML for %s', async (path, title, h1) => {
    const { response, next } = await renderForCrawler(path);

    expect(next).not.toHaveBeenCalled();
    expect(response.headers['Content-Type']).toBe('text/html');
    expect(response.body).toContain(`<title>${title}</title>`);
    expect(response.body).toContain(`<h1>${h1}</h1>`);
    expect(response.body).toContain('application/ld+json');
    expect(response.body).toContain('Fotografia e video di matrimonio');
  });

  it.each(['/admin', '/gallery/riservata', '/view/riservata'])(
    'does not prerender protected route %s',
    async (path) => {
      const { response, next } = await renderForCrawler(path);

      expect(next).toHaveBeenCalledOnce();
      expect(response.body).toBeUndefined();
    },
  );

  it('builds canonical, crawler-readable and structured metadata for a published Real Wedding', () => {
    const meta = buildWeddingStoryPageMeta({
      slug: 'anna-e-luca',
      title: 'Anna e Luca ad Aversa',
      excerpt: 'Una cerimonia in giardino.',
      story: '## Preparativi\n\nLa giornata è iniziata ad Aversa.\n\n## Cerimonia\n\nLa cerimonia si è svolta in giardino.',
      seoTitle: 'Anna e Luca, matrimonio ad Aversa',
      seoDescription: 'Il reportage del matrimonio di Anna e Luca ad Aversa.',
      publishedAt: { seconds: 1_780_000_000 },
      updatedAt: { seconds: 1_780_000_100 },
    }, ['https://images.example/anna-luca.jpg']);

    expect(meta.canonical).toBe('https://imagestudiofotografico.com/real-wedding/anna-e-luca');
    expect(meta.bodyContent).toContain('<h1>Anna e Luca ad Aversa</h1>');
    expect(meta.bodyContent).toContain('<h2>Preparativi</h2>');
    expect(meta.jsonLd).toMatchObject({ '@type': 'Article', headline: 'Anna e Luca ad Aversa' });
  });

  it('renders the print landing without stale static commercial claims', async () => {
    const { response, next } = await renderForCrawler('/stampa-foto-aversa');

    expect(next).not.toHaveBeenCalled();
    expect(response.headers['Content-Type']).toBe('text/html');
    expect(response.body).toContain('<h1>Stampa foto online ad Aversa: vacanze, Polaroid e ricordi</h1>');
    expect(response.body).toContain('catalogo aggiornato');
    expect(response.body).toContain('FAQPage');
    expect(response.body).toContain('https://imagestudiofotografico.com/stampa-foto-aversa');
    expect(response.body).not.toContain('AggregateOffer');
    expect(response.body).not.toContain('lowPrice');
    expect(response.body).not.toContain('€0,20');
    expect(response.body).not.toContain('€9,90');
    expect(response.body).not.toContain('/stampa-foto-aversa/ordine');
  });

  it('serves the current published cover in crawler HTML and structured data without stale caching', async () => {
    let coverPhotoId = 'photo-2';
    const story = {
      galleryId: 'gallery-1', status: 'published', slug: 'anna-e-luca', title: 'Anna e Luca',
      excerpt: 'Una cerimonia in giardino.', story: '## Cerimonia\n\nLa cerimonia si è svolta in giardino.',
      seoTitle: 'Anna e Luca ad Aversa', seoDescription: 'Il matrimonio di Anna e Luca ad Aversa.',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
    };
    mockCollection.mockReturnValue({
      where: () => ({
        get: async () => ({ docs: [{ data: () => ({ ...story, coverPhotoId }) }] }),
      }),
      doc: (photoId: string) => ({
        get: async () => ({
          exists: true,
          data: () => ({ galleryId: 'gallery-1', url: `https://images.example/${photoId}.jpg` }),
        }),
      }),
    });

    const first = await renderForCrawler('/real-wedding/anna-e-luca');

    expect(first.next).not.toHaveBeenCalled();
    expect(first.response.headers['Content-Type']).toBe('text/html');
    expect(first.response.headers['Cache-Control']).toBe(WEDDING_PUBLIC_DATA_CACHE_CONTROL);
    expect(first.response.headers['CDN-Cache-Control']).toBe('no-store');
    expect(first.response.headers['Surrogate-Control']).toBe('no-store');
    expect(first.response.headers['Pragma']).toBe('no-cache');
    expect(first.response.headers['Expires']).toBe('0');
    expect(first.response.body).toContain('<meta name="robots" content="index,follow,max-image-preview:large"');
    expect(first.response.body).toContain('<link rel="canonical" href="https://imagestudiofotografico.com/real-wedding/anna-e-luca"');
    expect(first.response.body).toContain('data-seo-prerender="true"');
    expect(first.response.body).toContain('<meta property="og:image" content="https://images.example/photo-2.jpg"');
    expect(getArticleImages(first.response.body!)[0]).toBe('https://images.example/photo-2.jpg');

    // Simulate publishing a new cover, then make a separate public crawler request.
    coverPhotoId = 'photo-3';
    const updated = await renderForCrawler('/real-wedding/anna-e-luca');
    expect(updated.next).not.toHaveBeenCalled();
    expect(updated.response.body).toContain('<meta property="og:image" content="https://images.example/photo-3.jpg"');
    expect(getArticleImages(updated.response.body!)[0]).toBe('https://images.example/photo-3.jpg');
  });

  it('falls back to the first selected photo when the configured cover is unavailable to prerender', async () => {
    const story = {
      galleryId: 'gallery-1',
      status: 'published',
      slug: 'anna-e-luca',
      title: 'Anna e Luca',
      excerpt: 'Una cerimonia in giardino.',
      story: '## Cerimonia\n\nUna giornata speciale.',
      selectedPhotoIds: ['photo-1', 'photo-2'],
      coverPhotoId: 'photo-2',
    };
    mockCollection.mockReturnValue({
      where: () => ({ get: async () => ({ docs: [{ data: () => story }] }) }),
      doc: (photoId: string) => ({
        get: async () => photoId === 'photo-2'
          ? { exists: false, data: () => undefined }
          : {
            exists: true,
            data: () => ({ galleryId: 'gallery-1', url: `https://images.example/${photoId}.jpg` }),
          },
      }),
    });

    const { response, next } = await renderForCrawler('/real-wedding/anna-e-luca');

    expect(next).not.toHaveBeenCalled();
    expect(response.body).toContain('<meta property="og:image" content="https://images.example/photo-1.jpg"');
  });

  it('keeps a draft Real Wedding out of crawler HTML', async () => {
    mockCollection.mockReturnValue({
      where: () => ({ get: async () => ({ docs: [{ data: () => ({ status: 'draft', slug: 'bozza' }) }] }) }),
    });

    const { response, next } = await renderForCrawler('/real-wedding/bozza');

    expect(next).toHaveBeenCalledOnce();
    expect(response.headers['X-Robots-Tag']).toBe('noindex, nofollow');
    expect(response.body).toBeUndefined();
  });
});
