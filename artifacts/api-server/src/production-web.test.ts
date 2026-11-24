import express from 'express';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer, get as httpGet, type IncomingHttpHeaders, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { mockCollection } = vi.hoisted(() => ({ mockCollection: vi.fn() }));
vi.mock('./firebase-admin', () => ({ db: { collection: mockCollection } }));
vi.mock('./lib/logger', () => ({ logger: { error: vi.fn() } }));
import {
  acceptsEncoding,
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
  // One at a time: a fixture can live inside another one, and parallel removal
  // of a folder and its parent fails on Windows.
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function createFixture(prefix = path.join(tmpdir(), 'print-shop-production-')) {
  const root = await mkdtemp(prefix);
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

const APP_JS = 'globalThis.__production = true;\n'.repeat(200);
const APP_CSS = '.photo { display: block; }\n'.repeat(200);

/** Build fixture with the .br/.gz copies the Vite build writes next to each asset. */
async function createPrecompressedFixture(prefix?: string) {
  const { root } = await createFixture(prefix);
  const assets = path.join(productionClientBuildPath(root), 'assets');
  await Promise.all([
    writeFile(path.join(assets, 'app-abc123.js'), APP_JS),
    writeFile(path.join(assets, 'app-abc123.js.br'), brotliCompressSync(APP_JS)),
    writeFile(path.join(assets, 'app-abc123.js.gz'), gzipSync(APP_JS)),
    writeFile(path.join(assets, 'style-def456.css'), APP_CSS),
    writeFile(path.join(assets, 'style-def456.css.gz'), gzipSync(APP_CSS)),
    writeFile(path.join(assets, 'plain-789.js'), 'export {};'),
  ]);
  return { root };
}

/** Raw GET: fetch() would decode the body and hide what travelled on the wire. */
function rawGet(url: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    httpGet(url, { headers }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    }).on('error', reject);
  });
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

  it.each([
    ['gzip, deflate, br', 'br', true],
    ['GZIP', 'gzip', true],
    ['br;q=0, gzip', 'br', false],
    ['br; q=0.5', 'br', true],
    ['*', 'br', true],
    ['*;q=0', 'gzip', false],
    ['br;q=0, *', 'br', false],
    ['identity', 'gzip', false],
    ['br;q=abc', 'br', false],
    ['', 'br', false],
    [undefined, 'br', false],
  ])('reads Accept-Encoding %j for %s as %s', (header, encoding, expected) => {
    expect(acceptsEncoding(header, encoding)).toBe(expected);
  });

  it('serves the precompressed copy that the browser accepts, preferring brotli', async () => {
    const { root } = await createPrecompressedFixture();
    const app = express();
    mountProductionClient(app, { cwd: root });
    const baseUrl = await listen(app);
    const url = `${baseUrl}/assets/app-abc123.js`;

    const br = await rawGet(url, { 'Accept-Encoding': 'gzip, deflate, br' });
    expect(br.status).toBe(200);
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.headers['content-type']).toContain('javascript');
    expect(br.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(br.headers['x-content-type-options']).toBe('nosniff');
    expect(br.headers.vary).toContain('Accept-Encoding');
    expect(brotliDecompressSync(br.body).toString('utf8')).toBe(APP_JS);

    const gzip = await rawGet(url, { 'Accept-Encoding': 'gzip' });
    expect(gzip.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(gzip.body).toString('utf8')).toBe(APP_JS);

    const refusedBrotli = await rawGet(url, { 'Accept-Encoding': 'br;q=0, gzip' });
    expect(refusedBrotli.headers['content-encoding']).toBe('gzip');

    const identity = await rawGet(url);
    expect(identity.headers['content-encoding']).toBeUndefined();
    expect(identity.headers.vary).toContain('Accept-Encoding');
    expect(identity.body.toString('utf8')).toBe(APP_JS);
  });

  it('still compresses when the site is installed under a folder whose name starts with a dot', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), '.dot-parent-'));
    temporaryRoots.push(parent);
    const { root } = await createPrecompressedFixture(path.join(parent, 'site-'));
    const app = express();
    mountProductionClient(app, { cwd: root });
    const baseUrl = await listen(app);

    const res = await rawGet(`${baseUrl}/assets/app-abc123.js`, { 'Accept-Encoding': 'br' });
    expect(res.headers['content-encoding']).toBe('br');
    expect(brotliDecompressSync(res.body).toString('utf8')).toBe(APP_JS);
  });

  it('falls back to the next encoding, or to the original when no copy exists', async () => {
    const { root } = await createPrecompressedFixture();
    const app = express();
    mountProductionClient(app, { cwd: root });
    const baseUrl = await listen(app);

    const css = await rawGet(`${baseUrl}/assets/style-def456.css`, { 'Accept-Encoding': 'br, gzip' });
    expect(css.headers['content-encoding']).toBe('gzip');
    expect(css.headers['content-type']).toContain('text/css');
    expect(gunzipSync(css.body).toString('utf8')).toBe(APP_CSS);

    const plain = await rawGet(`${baseUrl}/assets/plain-789.js`, { 'Accept-Encoding': 'br, gzip' });
    expect(plain.status).toBe(200);
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.body.toString('utf8')).toBe('export {};');

    const missing = await rawGet(`${baseUrl}/assets/missing.js`, { 'Accept-Encoding': 'br, gzip' });
    expect(missing.status).toBe(404);
    expect(missing.headers['content-encoding']).toBeUndefined();
  });

  it('never serves compressed files from outside the assets folder', async () => {
    const { root } = await createPrecompressedFixture();
    await writeFile(path.join(productionClientBuildPath(root), 'index.html.br'), brotliCompressSync('secret-shell'));
    const app = express();
    mountProductionClient(app, { cwd: root });
    const baseUrl = await listen(app);

    for (const attempt of ['/assets/..%2Findex.html', '/assets/%2e%2e/index.html', '/assets/..%5Cindex.html']) {
      const res = await rawGet(`${baseUrl}${attempt}`, { 'Accept-Encoding': 'br' });
      expect(res.headers['content-encoding'], attempt).toBeUndefined();
      expect(res.body.toString('utf8'), attempt).not.toContain('secret-shell');
    }
  });
});
