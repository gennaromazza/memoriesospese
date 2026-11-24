import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import express from 'express';
import sharp from 'sharp';
import {
  STATIC_IMAGES, blogSocialImage, defaultSocialImage, pageSocialImage,
  shopCategorySocialImage, staticSocialImage, weddingSocialImage,
} from '@shared/social-metadata';
import { isKnownClientPath, isPrivateClientPath, PUBLIC_STATIC_PATHS } from './client-routes';
import { WEDDING_HOME_SEO } from '../shared/public-seo-content';

const { collection } = vi.hoisted(() => ({ collection: vi.fn() }));
vi.mock('./firebase-admin', () => ({ db: { collection } }));
// Run the real hook's effect against a small head-only DOM adapter.
vi.mock('../../image-studio-web/node_modules/react/index.js', () => ({ useEffect: (effect: () => void) => effect() }));
// Runtime import keeps this server's Node-only typecheck from following DOM code.
const hookPath = fileURLToPath(new URL('../../image-studio-web/src/hooks/useSEO.ts', import.meta.url));
const { useSEO } = await import(hookPath);
import { createSeoMiddleware } from './seo-prerender';
import { buildShopCategoryPageMeta } from './shop/seo';

const publicDir = fileURLToPath(new URL('../../image-studio-web/public/', import.meta.url));
const indexHtmlPath = fileURLToPath(new URL('../../image-studio-web/index.html', import.meta.url));
const clientAppPath = fileURLToPath(new URL('../../image-studio-web/src/App.tsx', import.meta.url));
const clientAppSource = await readFile(clientAppPath, 'utf-8');
const CLIENT_ROUTE_PATTERNS = [...clientAppSource.matchAll(/<Route\b[^>]*\bpath=["']([^"']+)["']/gs)]
  .map((match) => match[1]);
const ROUTE_PARAMETER_SAMPLES: Record<string, string> = {
  action: 'confirm',
  assignmentId: 'route-test',
  categoria: 'matrimonio',
  code: 'route-test',
  galleryId: 'route-test',
  id: 'route-test',
  jobId: 'route-test',
  slug: 'route-test',
  tipo: 'matrimonio',
  token: 'route-test-private-token',
  value: 'regali',
};
const CANONICAL_ROUTE_ALIASES: Record<string, string> = {
  '/consultations': '/consulenze',
};
const paths = [
  '/', '/portfolio', '/portfolio/matrimonio', '/portfolio/battesimo',
  '/portfolio/comunione', '/portfolio/cresima', '/portfolio/evento',
  '/portfolio/ritratto', '/portfolio/famiglia', '/portfolio/altro',
  '/blog', '/image-experience', '/vision', '/fotografo-aversa',
  '/stampa-foto-aversa', '/storie', '/lasciati-trasportare', '/prenota',
  '/consulenze', '/regala', '/regala/come-funziona', '/online-shop',
  '/privacy', '/cookie-policy', '/terms', '/gdpr',
];
const dynamicPaths = ['/blog/prova', '/real-wedding/prova', '/prenota/prova', '/online-shop/categoria/prova'];
const REQUIRED_SOCIAL_META = [
  'og:title', 'og:description', 'og:type', 'og:url', 'og:image', 'og:image:alt',
  'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt',
];

function concreteClientPath(pattern: string): string {
  return pattern.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_match, name: string) => ROUTE_PARAMETER_SAMPLES[name] || 'route-test');
}

function shouldNeverBeIndexedClientPath(path: string): boolean {
  return /^\/(?:admin(?:\/|$)|profile$|quote-management-demo$|special-gallery$|accesso-galleria$|negozi$|consultations\/book$|consulenze\/[^/]+(?:\/|$)|gallery\/[^/]+$|view\/[^/]+$|quote\/[^/]+$|preventivo-rapido\/[^/]+$|fotolibro\/[^/]+(?:\/|$)|q\/[^/]+$|modulo\/[^/]+$|regalo\/[^/]+$|collaboratori\/(?:assignment\/[^/]+\/[^/]+|dashboard\/[^/]+)$|stampa-foto-aversa\/(?:ordine(?:\/|$)|i-miei-ordini$)|online-shop\/(?:condizioni$|ordine(?:\/|$)|i-miei-ordini$)|request-password(?:\/[^/]+)?$|password-result\/[^/]+$)/.test(path);
}

async function render(path: string) {
  let html = '';
  const res: any = {
    setHeader: vi.fn(), status: vi.fn(() => res), type: vi.fn(() => res),
    send: (body: string) => { html = body; },
  };
  const next = vi.fn();
  await createSeoMiddleware({ indexHtmlPath })({ path, headers: {}, query: {} } as any, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).not.toHaveBeenCalled();
  const titles = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
  expect(titles, `${path}: deve esserci un solo title`).toHaveLength(1);
  expect(titles[0][1].trim(), `${path}: title non deve essere vuoto`).toBeTruthy();
  if (path !== '/') {
    expect(titles[0][1].trim(), `${path}: non deve riusare il title della home`).not.toBe(WEDDING_HOME_SEO.title);
  }
  const descriptions = [...html.matchAll(/<meta\b(?=[^>]*\bname=["']description["'])[^>]*>/gi)];
  expect(descriptions, `${path}: deve esserci una sola description`).toHaveLength(1);
  const description = descriptions[0][0].match(/\bcontent=["']([^"']*)["']/i)?.[1]?.trim();
  expect(description, `${path}: description non deve essere vuota`).toBeTruthy();
  if (path !== '/') {
    expect(description, `${path}: non deve riusare la description della home`).not.toBe(WEDDING_HOME_SEO.description);
  }
  const canonicals = [...html.matchAll(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/gi)];
  expect(canonicals, `${path}: deve esserci un solo canonical`).toHaveLength(1);
  const canonical = canonicals[0][0].match(/\bhref=["']([^"']*)["']/i)?.[1];
  expect(canonical, `${path}: canonical non deve essere vuoto`).toBeTruthy();
  const canonicalPath = new URL(canonical!).pathname;
  if (path !== '/') {
    expect(canonicalPath, `${path}: canonical deve essere specifico della pagina, non della home`).not.toBe('/');
  }
  expect(canonicalPath, `${path}: canonical deve essere coerente con la route o con un alias esplicito`)
    .toBe(CANONICAL_ROUTE_ALIASES[path] || path);
  const robots = [...html.matchAll(/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/gi)];
  expect(robots, `${path}: deve essere presente la direttiva robots`).toHaveLength(1);
  const robotsContent = robots[0][0].match(/\bcontent=["']([^"']*)["']/i)?.[1] || '';
  if (path === '/ospiti') {
    expect(robotsContent).toMatch(/noindex/i);
  } else {
    expect(robotsContent).not.toMatch(/noindex/i);
  }
  for (const key of REQUIRED_SOCIAL_META) {
    const tags = [...html.matchAll(new RegExp(`<meta\\b[^>]*(?:property|name)=["']${key}["'][^>]*>`, 'gi'))];
    expect(tags, `${path}: deve esserci un solo meta ${key}`).toHaveLength(1);
    const content = tags[0][0].match(/\bcontent=["']([^"']*)["']/i)?.[1];
    expect(content?.trim(), `${path}: ${key} non deve essere vuoto`).toBeTruthy();
  }
  return html;
}

async function expectPrivateRouteNotIndexed(path: string) {
  const headers = new Map<string, string>();
  let body = '';
  const res: any = {
    setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
    status: vi.fn(() => res),
    type: vi.fn(() => res),
    send: (value: string) => { body = value; },
  };
  const next = vi.fn();
  await createSeoMiddleware({ indexHtmlPath })({ path, headers: {}, query: {} } as any, res, next);
  expect(headers.get('x-robots-tag'), `${path}: deve essere esclusa dall'indicizzazione`).toMatch(/noindex/i);
  expect(next, `${path}: i contenuti privati devono restare al di fuori del prerender SEO`).toHaveBeenCalledOnce();
  expect(body, `${path}: il prerender non deve esporre dati o contenuti riservati`).toBe('');
}

function headDom(html: string) {
  const nodes: any[] = [];
  function element(tagName: string, attributes: Record<string, string> = {}) {
    return {
      tagName, attributes, dataset: {},
      setAttribute(key: string, value: string) { this.attributes[key] = value; },
      remove() { nodes.splice(nodes.indexOf(this), 1); },
    };
  }
  for (const match of html.matchAll(/<(meta|link)\b([^>]+)>/g)) {
    const attrs: Record<string, string> = {};
    for (const attr of match[2].matchAll(/([\w:-]+)="([^"]*)"/g)) {
      attrs[attr[1]] = attr[2].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    }
    nodes.push(element(match[1], attrs));
  }
  const doc = {
    title: '',
    createElement: (tag: string) => element(tag),
    head: { appendChild: (node: any) => { nodes.push(node); return node; } },
    querySelectorAll: (selector: string) => {
      const match = /^(meta|link|script)\[([\w-]+)(?:="([^"]*)")?]$/.exec(selector);
      if (!match) throw new Error(`Unsupported head selector: ${selector}`);
      return nodes.filter(node => node.tagName === match[1]
        && (match[3] === undefined ? match[2] in node.attributes : node.attributes[match[2]] === match[3]));
    },
  };
  vi.stubGlobal('document', doc);
  return () => Object.fromEntries(['og:image', 'og:image:alt', 'twitter:image', 'twitter:image:alt'].map(key => {
    const tags = nodes.filter(node => node.attributes.property === key || node.attributes.name === key);
    expect(tags).toHaveLength(1);
    return [key, tags[0].attributes.content];
  }));
}

function hydrate(path: string, image?: ReturnType<typeof staticSocialImage>) {
  vi.stubGlobal('window', { location: { pathname: path } });
  useSEO({
    title: 'Pagina di prova', description: 'Descrizione', canonical: path,
    ogImage: image?.url, ogImageAlt: image?.alt, ogImageSource: image?.source,
    ogImageWidth: image?.width, ogImageHeight: image?.height, ogImageType: image?.type,
  });
}

beforeEach(() => {
  vi.stubEnv('GIFT_SHOP_INDEXABLE', 'true');
  vi.stubEnv('SHOP_INDEXABLE', 'true');
  collection.mockImplementation(() => {
    const chain: any = {
      where: () => chain, orderBy: () => chain, limit: () => chain,
      get: async () => ({ docs: [], empty: true }),
      doc: () => ({ get: async () => ({ exists: false }) }),
    };
    return chain;
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('public social image inventory', () => {
  it('recognizes every route declared by the client and keeps private routes out of SEO prerendering', async () => {
    expect(CLIENT_ROUTE_PATTERNS.length).toBeGreaterThan(0);
    for (const pattern of CLIENT_ROUTE_PATTERNS) {
      const path = concreteClientPath(pattern);
      expect(isKnownClientPath(path), `La route client ${pattern} non è riconosciuta dal server (${path})`).toBe(true);
      const expectedPrivate = shouldNeverBeIndexedClientPath(path);
      if (expectedPrivate) {
        expect(isPrivateClientPath(path), `La route riservata ${pattern} deve essere marcata privata dal server`).toBe(true);
      }
      if (expectedPrivate || isPrivateClientPath(path)) {
        await expectPrivateRouteNotIndexed(path);
      }
    }
  });

  it('prerenders complete metadata for an indexable shop category from its public catalog', async () => {
    collection.mockImplementation((name: string) => {
      if (name === 'settings') {
        return {
          doc: () => ({
            get: async () => ({
              exists: true,
              data: () => ({ enabled: true, ordersOpen: true, categoryValues: ['regali'] }),
            }),
          }),
        };
      }
      const docsByCollection: Record<string, Array<{ id: string; data: () => Record<string, unknown> }>> = {
        productCategories: [{
          id: 'category-regali',
          data: () => ({ value: 'regali', nome: 'Regali', attivo: true, displayOrder: 1 }),
        }],
        products: [{
          id: 'product-tazza',
          data: () => ({
            nome: 'Tazza personalizzata',
            descrizione: 'Una tazza con la tua fotografia',
            prezzo: 15,
            sconto: 0,
            numeroFoto: 1,
            categoria: 'regali',
            attivo: true,
            immagini: ['https://cdn.example/tazza.jpg'],
          }),
        }],
      };
      const chain: any = {
        where: () => chain,
        get: async () => ({ docs: docsByCollection[name] || [], empty: !(docsByCollection[name]?.length) }),
      };
      return chain;
    });

    const html = await render('/online-shop/categoria/regali');
    expect(html).toContain('Tazza personalizzata');
  });

  it('prerenders a complete Open Graph card for every public static route', async () => {
    const clientStaticRoutes = CLIENT_ROUTE_PATTERNS.filter(path => !path.includes(':'));
    const routes = new Set([...paths, ...PUBLIC_STATIC_PATHS, ...clientStaticRoutes]);
    for (const path of routes) {
      if (!isPrivateClientPath(path)) await render(path);
    }

    const guestPage = await render('/ospiti');
    expect(guestPage).toContain('<meta name="robots" content="noindex,nofollow,noarchive"');
  });
  it('maps every included static page to a distinct image URL and distinct bytes', async () => {
    expect(Object.keys(STATIC_IMAGES).sort()).toEqual([...paths].sort());
    const images = paths.map(staticSocialImage);
    expect(new Set(images.map(image => image.url)).size).toBe(paths.length);
    const hashes = await Promise.all(images.map(async image =>
      createHash('sha256').update(await readFile(`${publicDir}${new URL(image.url).pathname}`)).digest('hex')));
    expect(new Set(hashes).size).toBe(paths.length);
    expect(images.every(image => image.alt.trim() && image.source === 'curated-static')).toBe(true);
  });

  it.each(paths)('keeps the first HTML and real client hook in agreement for %s', async path => {
    const html = await render(path);
    const snapshot = headDom(html);
    const before = snapshot();
    const image = staticSocialImage(path);
    expect(before['og:image']).toBe(image.url);
    expect(before['og:image:alt']).toBe(image.alt);
    expect(before['twitter:image']).toBe(image.url);
    hydrate(path);
    expect(snapshot()).toEqual(before);
  });

  it.each(dynamicPaths)('uses a section fallback, not the global image, for %s', path => {
    const fallback = pageSocialImage(path, [{ url: '' }, { url: 'blob:private' }, { url: 'https://cdn.example/x.jpg?X-Amz-Signature=secret' }]);
    expect(fallback.source).toBe('section-fallback');
    expect(fallback.url).not.toBe(defaultSocialImage().url);
    expect(fallback.alt).not.toBe(defaultSocialImage().alt);
  });

  it('uses distinct dynamic section fallback images', () => {
    expect(new Set(dynamicPaths.map(path => staticSocialImage(path).url)).size).toBe(dynamicPaths.length);
  });

  it('rejects an invalid blog cover and uses the next valid inline photo with its own alt', () => {
    const image = blogSocialImage({
      title: 'La festa', coverImage: 'blob:private', coverImageAlt: 'Alt copertina scartata',
      content: '<img src="data:invalid"><img src="https://cdn.example/festa.jpg?a=1&amp;b=2">',
    });
    expect(image.url).toBe('https://cdn.example/festa.jpg?a=1&b=2');
    expect(image.alt).toBe('La festa');
  });

  it.each([undefined, '', 'blob:private'])('keeps blog fallback metadata aligned without a usable cover (%s)', async coverImage => {
    const post = { slug: 'prova', title: 'Articolo senza copertina', content: '<p>Testo</p>', coverImage, status: 'published' };
    collection.mockImplementation((name: string) => {
      const chain: any = { where: () => chain, limit: () => chain, get: async () => ({
        docs: name === 'blogPosts' ? [{ data: () => post }] : [], empty: name !== 'blogPosts',
      }) };
      return chain;
    });
    const snapshot = headDom(await render('/blog/prova'));
    const before = snapshot();
    expect(before['og:image']).toBe(staticSocialImage('/blog/prova').url);
    hydrate('/blog/prova', blogSocialImage(post));
    expect(snapshot()).toEqual(before);
  });

  it.each([undefined, '', 'blob:private', 'https://cdn.example/shooting.jpg'])('aligns booking covers and missing-image fallback (%s)', async url => {
    const campaign = { nome: 'Shooting', code: 'prova', immaginePaginaBooking: url };
    const chain: any = { where: () => chain, limit: () => chain, get: async () => ({ empty: false, docs: [{ data: () => campaign }] }) };
    collection.mockReturnValue(chain);
    const snapshot = headDom(await render('/prenota/prova'));
    const before = snapshot();
    vi.stubGlobal('window', { location: { pathname: '/prenota/prova' } });
    useSEO({ title: 'Shooting', description: 'Test', canonical: '/prenota/prova', ogImage: url, ogImageAlt: 'Prenotazione Shooting', ogImageSource: 'editorial-cover' });
    expect(snapshot()).toEqual(before);
  });

  it.each([
    { photos: [] },
    { photos: [{ url: 'blob:invalid' }] },
    { photos: [{ url: 'https://cdn.example/sposi.jpg', alt: 'Gli sposi in giardino' }] },
  ])('aligns Real Wedding images, custom alt and fallback: $photos', async ({ photos }) => {
    const story = {
      slug: 'prova', title: 'Gli sposi',
      selectedPhotoIds: photos.map((_, index) => `photo-${index}`), galleryId: 'gallery', status: 'published',
      photoAltTexts: Object.fromEntries(photos.map((photo, index) => [`photo-${index}`, 'alt' in photo ? photo.alt : ''])),
    };
    collection.mockImplementation((name: string) => {
      const chain: any = {
        where: () => chain,
        get: async () => ({ docs: [{ data: () => story }] }),
        doc: (id: string) => ({ get: async () => ({
          exists: true, data: () => ({ ...photos[Number(id.split('-')[1])], galleryId: 'gallery' }),
        }) }),
      };
      return chain;
    });
    const snapshot = headDom(await render('/real-wedding/prova'));
    const before = snapshot();
    hydrate('/real-wedding/prova', weddingSocialImage(story.title, photos));
    expect(snapshot()).toEqual(before);
  });

  it('aligns shop category content images and fallback on both sides', () => {
    for (const images of [[], ['blob:private'], ['https://cdn.example/tazza.jpg']]) {
      const products = [{ id: 'p', nome: 'Tazza', descrizione: '', categoria: 'regali', images, priceCents: 1000, photosRequired: 1, displayOrder: 0 }];
      const catalog: any = { enabled: true, orderingOpen: true, categories: [{ value: 'regali', nome: 'Regali' }], products, currency: 'EUR' };
      const meta = buildShopCategoryPageMeta(catalog, 'regali', new Date());
      expect(meta?.socialImage).toEqual(shopCategorySocialImage('/online-shop/categoria/regali', products));
    }
  });

  it('preserves server metadata while content is loading', () => {
    const snapshot = headDom('<meta property="og:image" content="server.jpg"><meta property="og:image:alt" content="Server"><meta name="twitter:image" content="server.jpg"><meta name="twitter:image:alt" content="Server">');
    const before = snapshot();
    useSEO({ title: 'Loading', description: '', pending: true });
    expect(snapshot()).toEqual(before);
  });

  it('serves every selected static and section image as a public decodable image with accurate dimensions', async () => {
    const app = express();
    app.use(express.static(publicDir));
    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address() as { port: number };
      for (const route of [...paths, ...dynamicPaths]) {
        const image = staticSocialImage(route);
        const response = await fetch(`http://127.0.0.1:${address.port}${new URL(image.url).pathname}`);
        expect(response.status, route).toBe(200);
        expect(response.headers.get('content-type'), route).toBe(image.type);
        const decoded = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
        expect(decoded.width, route).toBe(image.width);
        expect(decoded.height, route).toBe(image.height);
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
