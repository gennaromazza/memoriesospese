import express from 'express';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { registerLegacyCampaignRoutes } from './legacy-campaign-routes';

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
  });
});