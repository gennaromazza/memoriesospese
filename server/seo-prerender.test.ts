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
  statusCode?: number;
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
    status: (statusCode: number) => {
      response.statusCode = statusCode;
      return res;
    },
    type: () => res,
  };
  const next = vi.fn();

  await createSeoMiddleware()(
    {
      path,
      query: {},
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
    expect(response.body?.match(/<meta property="og:image"/g)).toHaveLength(1);
    expect(response.body?.match(/<meta name="twitter:image"/g)).toHaveLength(1);
  });

  it('includes the real wedding homepage hero image in the first HTML', async () => {
    const { response } = await renderForCrawler('/');

    expect(response.body).toContain('<img src="https://imagestudiofotografico.com/1200x630px.jpg" alt="Sposi davanti a una villa durante un matrimonio in Campania" width="1200" height="630" fetchpriority="high" />');
    expect(response.body).not.toContain('loading="lazy"');
  });

  it('renders the Image Experience landing consistently for crawlers', async () => {
    const { response, next } = await renderForCrawler('/image-experience');

    expect(next).not.toHaveBeenCalled();
    expect(response.headers['Content-Type']).toBe('text/html');
    expect(response.body).toContain('<title>Image Experience | Fotografo Matrimonio Campania da 2.200 €</title>');
    expect(response.body).toContain("<h1>Quest'anno non saremo in fiera. Saremo dove iniziano le vostre domande.</h1>");
    expect(response.body).toContain('image-experience-social-1200x630.jpg');
    expect(response.body).toContain('Cosa è incluso nella nostra Experience?');
    expect(response.body).toContain('Wedding Trailer');
    expect(response.body).toContain('https://www.matrimonio.com/fotografo-matrimonio/image-studio-fotografico--e149790');
    expect(response.body).toContain('Leggi i Real Wedding');
    expect(response.body?.match(/<h1>/g)).toHaveLength(1);
  });

  it('redirects legacy WordPress query URLs to the homepage', async () => {
    const response: RenderedResponse = { headers: {} };
    const res = {
      setHeader: (name: string, value: string) => {
        response.headers[name] = value;
      },
      send: (body: string) => {
        response.body = body;
      },
      status: (statusCode: number) => {
        response.statusCode = statusCode;
        return res;
      },
      type: () => res,
    };
    const next = vi.fn();

    await createSeoMiddleware()(
      {
        path: '/',
        query: { p: '28445' },
        headers: { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
      } as any,
      res as any,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(301);
    expect(response.headers.Location).toBe('/');
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

  it('uses the global fallback for a Real Wedding without public photos', () => {
    const meta = buildWeddingStoryPageMeta({
      slug: 'senza-foto',
      title: 'Un matrimonio senza foto pubbliche',
      excerpt: 'Una storia in attesa della selezione.',
    });

    expect(meta.ogImage).toBe('https://imagestudiofotografico.com/1200x630px.jpg');
    expect(meta.bodyContent).not.toContain('<img');
  });

  it.each([
    ['/', '/1200x630px.jpg'],
    ['/portfolio', '/1200x630px.jpg'],
    ['/fotografo-aversa', '/assets/og-image.jpg'],
    ['/stampa-foto-aversa', '/images/print-service/printed-memories-table.jpg'],
    ['/vision', '/assets/og-image.jpg'],
    ['/storie', '/images/couple-standing.png'],
    ['/prenota', '/images/couple-heart-balloon.png'],
    ['/consulenze', '/images/couple-flower-bouquet.png'],
  ])('renders one complete social metadata set for %s', async (path, imagePath) => {
    const { response } = await renderForCrawler(path);
    const html = response.body || '';

    expect(html).toContain(`content="https://imagestudiofotografico.com${imagePath}"`);
    expect(html.match(/<link rel="canonical"/g)).toHaveLength(1);
    expect(html.match(/<meta property="og:image"/g)).toHaveLength(1);
    expect(html.match(/<meta property="og:image:alt"/g)).toHaveLength(1);
    expect(html.match(/<meta name="twitter:image"/g)).toHaveLength(1);
    expect(html.match(/<meta name="twitter:image:alt"/g)).toHaveLength(1);
  });

  it.each([
    ['/portfolio/matrimonio', '/images/portfolio/matrimonio.jpg'],
    ['/portfolio/battesimo', '/images/portfolio/battesimo.jpg'],
  ])('uses a distinct curated portfolio category cover for %s', async (path, imagePath) => {
    const { response, next } = await renderForCrawler(path);
    const html = response.body || '';

    expect(next).not.toHaveBeenCalled();
    expect(html).toContain(`<link rel="canonical" href="https://imagestudiofotografico.com${path}"`);
    expect(html).toContain(`<meta property="og:image" content="https://imagestudiofotografico.com${imagePath}"`);
    expect(html).toContain(`<meta name="twitter:image" content="https://imagestudiofotografico.com${imagePath}"`);
    expect(html.match(/<meta property="og:image"/g)).toHaveLength(1);
    expect(html.match(/<meta name="twitter:image"/g)).toHaveLength(1);
  });

  it('renders the print landing without stale static commercial claims', async () => {
    const { response, next } = await renderForCrawler('/stampa-foto-aversa');

    expect(next).not.toHaveBeenCalled();
    expect(response.headers['Content-Type']).toBe('text/html');
    expect(response.body).toContain('<h1>Stampa foto online ad Aversa: vacanze e ricordi</h1>');
    expect(response.body).not.toContain('Polaroid');
    expect(response.body).toContain('catalogo aggiornato');
    expect(response.body).toContain('FAQPage');
    expect(response.body).toContain('https://imagestudiofotografico.com/stampa-foto-aversa');
    expect(response.body).not.toContain('AggregateOffer');
    expect(response.body).not.toContain('lowPrice');
    expect(response.body).not.toContain('€0,20');
    expect(response.body).not.toContain('€9,90');
    expect(response.body).not.toContain('/stampa-foto-aversa/ordine');
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

  it('puts coverPhotoId before the other selected Real Wedding photos', async () => {
    const story = {
      galleryId: 'gallery-1', status: 'published', slug: 'cover-prima', title: 'Cover prima',
      excerpt: 'Una storia.', selectedPhotoIds: ['photo-1', 'photo-cover'], coverPhotoId: 'photo-cover',
    };
    mockCollection.mockImplementation((name: string) => ({
      where: () => ({ get: async () => ({ docs: [{ data: () => story }] }) }),
      doc: (id: string) => ({
        get: async () => ({
          exists: true,
          data: () => ({
            galleryId: 'gallery-1',
            url: `https://images.example/${id}.jpg`,
          }),
        }),
      }),
    }));

    const { response } = await renderForCrawler('/real-wedding/cover-prima');
    expect(response.body).toContain(
      '<meta property="og:image" content="https://images.example/photo-cover.jpg"',
    );
  });

  it.each(['/blog/missing-article', '/real-wedding/missing-story'])(
    'returns 404 for a missing public content slug %s',
    async (path) => {
      mockCollection.mockReturnValue({
        where: () => ({ get: async () => ({ empty: true, docs: [] }) }),
      });

      const { response, next } = await renderForCrawler(path);

      expect(next).not.toHaveBeenCalled();
      expect(response.statusCode).toBe(404);
      expect(response.body).toBe('Not Found');
      expect(response.headers['X-Robots-Tag']).toBe('noindex, nofollow');
    },
  );

  it('keeps a draft Real Wedding out of crawler HTML', async () => {
    mockCollection.mockReturnValue({
      where: () => ({ get: async () => ({ docs: [{ data: () => ({ status: 'draft', slug: 'bozza' }) }] }) }),
    });

    const { response, next } = await renderForCrawler('/real-wedding/bozza');

    expect(next).toHaveBeenCalledOnce();
    expect(response.headers['X-Robots-Tag']).toBe('noindex, nofollow');
    expect(response.body).toBeUndefined();
  });

  it('includes contextual editorial links in prerendered blog HTML', async () => {
    const post = {
      slug: 'guida-completa-al-matrimonio',
      status: 'published',
      title: 'Guida completa al matrimonio',
      excerpt: 'Consigli per organizzare il matrimonio.',
      content: '<p>Una guida per gli sposi.</p>',
      category: 'Matrimonio',
      tags: ['matrimonio'],
      publishedAt: { seconds: 1_780_000_000 },
    };
    const chain = {
      where: () => chain,
      limit: () => chain,
      get: async () => ({ empty: false, docs: [{ data: () => post }] }),
    };
    mockCollection.mockImplementation((collectionName: string) => {
      if (collectionName === 'blogPosts') return chain;
      return {
        where: () => ({
          get: async () => ({ docs: [], empty: true }),
        }),
      };
    });

    const { response, next } = await renderForCrawler('/blog/guida-completa-al-matrimonio');

    expect(next).not.toHaveBeenCalled();
    expect(response.body).toContain('id="blog-contextual-links-title"');
    expect(response.body).toContain('https://imagestudiofotografico.com/portfolio/matrimonio');
    expect(response.body).toContain('https://imagestudiofotografico.com/consulenze');
  });
});
