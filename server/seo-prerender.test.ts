import { describe, expect, it, vi } from 'vitest';
import { createSeoMiddleware } from './seo-prerender';
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
});