import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCollection } = vi.hoisted(() => ({ mockCollection: vi.fn() }));

vi.mock('./firebase-admin', () => ({ db: { collection: mockCollection } }));

import { buildWeddingStoryPageMeta, createSeoMiddleware } from './seo-prerender';
import {
  WEDDING_HOME_SEO,
  WEDDING_PORTFOLIO_SEO,
} from '../shared/public-seo-content';

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

  it('renders the print landing with canonical content, pricing and FAQ schema', async () => {
    const { response, next } = await renderForCrawler('/stampa-foto-aversa');

    expect(next).not.toHaveBeenCalled();
    expect(response.headers['Content-Type']).toBe('text/html');
    expect(response.body).toContain('<h1>Stampa foto ad Aversa: vacanze, Polaroid e ricordi</h1>');
    expect(response.body).toContain('34 formati');
    expect(response.body).toContain('FAQPage');
    expect(response.body).toContain('https://imagestudiofotografico.com/stampa-foto-aversa');
  });

  it('serves a published Real Wedding as indexable HTML to a crawler', async () => {
    const story = {
      galleryId: 'gallery-1', status: 'published', slug: 'anna-e-luca', title: 'Anna e Luca',
      excerpt: 'Una cerimonia in giardino.', story: '## Cerimonia\n\nLa cerimonia si è svolta in giardino.',
      seoTitle: 'Anna e Luca ad Aversa', seoDescription: 'Il matrimonio di Anna e Luca ad Aversa.',
      selectedPhotoIds: ['photo-1'],
    };
    mockCollection.mockReturnValue({
      where: () => ({ get: async () => ({ docs: [{ data: () => story }] }) }),
      doc: () => ({ get: async () => ({ exists: true, data: () => ({ galleryId: 'gallery-1', url: 'https://images.example/anna.jpg' }) }) }),
    });

    const { response, next } = await renderForCrawler('/real-wedding/anna-e-luca');

    expect(next).not.toHaveBeenCalled();
    expect(response.headers['Content-Type']).toBe('text/html');
    expect(response.body).toContain('<meta name="robots" content="index,follow,max-image-preview:large"');
    expect(response.body).toContain('<link rel="canonical" href="https://imagestudiofotografico.com/real-wedding/anna-e-luca"');
    expect(response.body).toContain('data-seo-prerender="true"');
    expect(response.body).toContain('https://images.example/anna.jpg');
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
