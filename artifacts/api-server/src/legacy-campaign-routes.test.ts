import express from 'express';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { LEGACY_PUBLIC_URL_AUDIT, registerLegacyCampaignRoutes } from './legacy-campaign-routes';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve());
  })));
});

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

describe('legacy Image Experience campaign aliases', () => {
  it.each([
    ['/esperienza', ''],
    ['/esperienza/', ''],
    ['/esperienza', '?utm_source=campaign&utm_medium=email'],
    ['/esperienza/', '?utm_source=campaign&utm_medium=email'],
  ])('redirects %s%s permanently to Image Experience', async (path, query) => {
    const app = express();
    registerLegacyCampaignRoutes(app);
    const baseUrl = await listen(app);

    const response = await fetch(`${baseUrl}${path}${query}`, { redirect: 'manual' });

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(`/image-experience${query}`);
    expect(response.headers.get('cache-control')).toContain('max-age=86400');
  });
});

describe('legacy public landing URL audit', () => {
  it('classifies each retained public alias and its canonical destination', () => {
    expect(LEGACY_PUBLIC_URL_AUDIT).toEqual([
      { alias: '/esperienza', destination: '/image-experience', disposition: '301' },
      { alias: '/consultations', destination: '/consulenze', disposition: '301' },
      { alias: '/shop-natale/*', destination: '/online-shop/*', disposition: '301' },
      { alias: '/?p=<numeric>', destination: '/', disposition: '301' },
    ]);
  });

  it.each([
    ['/consultations', '?utm_source=old-link', '/consulenze?utm_source=old-link'],
    ['/consultations/', '', '/consulenze'],
    ['/shop-natale', '', '/online-shop'],
    ['/shop-natale/ordine/conferma', '?order=123', '/online-shop/ordine/conferma?order=123'],
    ['/?p=123', '', '/'],
  ])('redirects legacy URL %s%s permanently to %s', async (path, query, expectedLocation) => {
    const app = express();
    registerLegacyCampaignRoutes(app);
    const baseUrl = await listen(app);
    const response = await fetch(`${baseUrl}${path}${query}`, { redirect: 'manual' });

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(expectedLocation);
  });

  it('does not treat nonnumeric homepage parameters as retired WordPress URLs', async () => {
    const app = express();
    registerLegacyCampaignRoutes(app);
    app.get('/', (_req, res) => res.status(200).send('homepage'));
    const baseUrl = await listen(app);
    const response = await fetch(`${baseUrl}/?p=search`, { redirect: 'manual' });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('homepage');
  });
});