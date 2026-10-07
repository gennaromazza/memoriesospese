import express from 'express';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { mockCollection } = vi.hoisted(() => ({ mockCollection: vi.fn() }));
vi.mock('./firebase-admin', () => ({ db: { collection: mockCollection } }));
vi.mock('./lib/logger', () => ({ logger: { error: vi.fn() } }));
import {
  apiNotFoundHandler,
  mountProductionClient,
  productionClientBuildPath,
  runtimeServerLabel,
} from './production-web.js';

const servers: Server[] = [];
const temporaryRoots: string[] = [];
beforeEach(() => mockCollection.mockReset());

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve());
  })));
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'print-shop-production-'));
  temporaryRoots.push(root);
  const buildPath = productionClientBuildPath(root);
  await mkdir(path.join(buildPath, 'assets'), { recursive: true });
  await Promise.all([
    writeFile(path.join(buildPath, 'index.html'), '<!doctype html><html><head><title>production-spa</title><link rel="canonical" href="https://imagestudiofotografico.com/" /></head><body><div id="root"></div><script type="module" src="/assets/app-abc123.js"></script></body></html>'),
    writeFile(path.join(buildPath, 'manifest.json'), '{"name":"Image Studio"}'),
    writeFile(path.join(buildPath, 'assets', 'app-abc123.js'), 'globalThis.__production = true;'),
  ]);
  return { root };
}

async function listen(app: express.Express): Promise<string> {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server address unavailable');
  return `http://127.0.0.1:${address.port}`;
}

describe('production web runtime', () => {
  it.each(['Mozilla/5.0', 'Googlebot/2.1', 'facebookexternalhit'])(
    'serves page-specific HTML from the production mount for %s',
    async userAgent => {
      const { root } = await createFixture();
      const app = express();
      mountProductionClient(app, { cwd: root });
      const baseUrl = await listen(app);
      for (const pathname of ['/', '/fotografo-aversa', '/portfolio/matrimonio', '/stampa-foto-aversa', '/portfolio/battesimo/']) {
        const response = await fetch(`${baseUrl}${pathname}`, { headers: { 'User-Agent': userAgent } });
        const html = await response.text();
        expect(response.status).toBe(200);
        expect(html).toContain(`href="https://imagestudiofotografico.com${pathname.replace(/\/$/, '') || '/'}"`);
        expect(html.match(/rel="canonical"/g)).toHaveLength(1);
        expect(html).toContain('<h1>');
        expect(html).toContain('data-seo-prerender="true"');
        expect(html).toContain('src="/assets/app-abc123.js"');
        expect(response.headers.get('cache-control')).toContain('no-store');
      }
    },
  );

  it('reads current published blog data, rejects missing slugs and keeps private routes separate', async () => {
    const { root } = await createFixture();
    let currentTitle = 'Un matrimonio ad Aversa';
    mockCollection.mockImplementation((name: string) => {
      const chain: any = {
        where: (_field: string, _operator: string, value: string) => {
          if (value === 'missing' || value === 'draft') chain.absent = true;
          return chain;
        },
        limit: () => chain,
        get: async () => ({
          empty: name !== 'blogPosts' || chain.absent,
          docs: name === 'blogPosts' && !chain.absent ? [{
            id: 'post-1',
            data: () => ({
              slug: 'reportage', title: currentTitle, status: 'published',
              metaTitle: currentTitle, excerpt: 'Un racconto autentico.',
              seoContent: 'Contenuto del reportage di matrimonio.',
              publishedAt: { seconds: 1780000000 },
            }),
          }] : [],
        }),
      };
      return chain;
    });
    const app = express();
    mountProductionClient(app, { cwd: root });
    const baseUrl = await listen(app);
    const first = await fetch(`${baseUrl}/blog/reportage`);
    expect(await first.text()).toContain('<title>Un matrimonio ad Aversa</title>');
    currentTitle = 'Il reportage aggiornato';
    const updated = await fetch(`${baseUrl}/blog/reportage`);
    const html = await updated.text();
    expect(html).toContain('<title>Il reportage aggiornato</title>');
    expect(html).toContain('href="https://imagestudiofotografico.com/blog/reportage"');
    for (const slug of ['missing', 'draft']) {
      expect((await fetch(`${baseUrl}/blog/${slug}`)).status).toBe(404);
    }
    for (const route of ['/admin/dashboard', '/gallery/private', '/quote/private', '/consulenze/template/session/prenota']) {
      const response = await fetch(`${baseUrl}${route}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('x-robots-tag')).toContain('noindex');
      expect(await response.text()).not.toContain('data-seo-prerender');
    }
  });

  it('returns a temporary error rather than a false homepage when content cannot be read', async () => {
    const failedRead = {
      where: () => failedRead,
      get: async () => { throw new Error('Firestore unavailable'); },
    };
    mockCollection.mockReturnValue(failedRead);
    const { root } = await createFixture();
    const app = express();
    mountProductionClient(app, { cwd: root });
    const response = await fetch(`${await listen(app)}/blog/reportage`);
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(await response.text()).not.toContain('production-spa');
  });

  it('labels the health runtime without importing secrets or starting the app', () => {
    expect(runtimeServerLabel('production')).toBe('production');
    expect(runtimeServerLabel('development')).toBe('development');
    expect(runtimeServerLabel(undefined)).toBe('development');
  });

  it('keeps known APIs ahead of a JSON 404 and never falls back to the SPA for /api', async () => {
    const { root } = await createFixture();
    const app = express();
    app.get('/api/known', (_req, res) => res.json({ ok: true }));
    app.use('/api', apiNotFoundHandler);
    mountProductionClient(app, { cwd: root });
    const baseUrl = await listen(app);

    const known = await fetch(`${baseUrl}/api/known`);
    expect(known.status).toBe(200);
    expect(await known.json()).toEqual({ ok: true });

    const missing = await fetch(`${baseUrl}/api/missing`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toContain('application/json');
    expect(await missing.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('serves immutable assets, revalidates public files and returns an uncached SPA fallback', async () => {
    const { root } = await createFixture();
    const app = express();
    app.use('/api', apiNotFoundHandler);
    mountProductionClient(app, { cwd: root });
    const baseUrl = await listen(app);

    const asset = await fetch(`${baseUrl}/assets/app-abc123.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');

    const manifest = await fetch(`${baseUrl}/manifest.json`);
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get('cache-control')).toBe('no-cache, max-age=0, must-revalidate');

    const route = await fetch(`${baseUrl}/stampa-foto-aversa/ordine`);
    expect(route.status).toBe(200);
    expect(route.headers.get('cache-control')).toBe('no-cache, no-store, must-revalidate');
    expect(route.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(await route.text()).toContain('production-spa');

    const validTokenRoute = await fetch(`${baseUrl}/quote/customer-token`);
    expect(validTokenRoute.status).toBe(200);
    expect(validTokenRoute.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');

    const unknownRoute = await fetch(`${baseUrl}/route-that-does-not-exist`);
    expect(unknownRoute.status).toBe(404);
    expect(await unknownRoute.text()).not.toContain('production-spa');

    const missingAsset = await fetch(`${baseUrl}/assets/missing.js`);
    expect(missingAsset.status).toBe(404);
    expect(await missingAsset.text()).not.toContain('production-spa');
  });
});
