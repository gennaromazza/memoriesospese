import { afterEach, expect, it, vi } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('blocks fetch, HTTP, HTTPS and HTTP/2 before any provider request leaves the process', async () => {
  await expect(fetch('https://example.com/test')).rejects.toThrow('External network blocked');
  expect(() => http.get('http://example.com/test')).toThrow('External network blocked');
  expect(() => https.request({ hostname: 'example.com' })).toThrow('External network blocked');
  expect(() => http2.connect('https://example.com')).toThrow('External network blocked');
  expect(() => http.request('http://localhost:8080', { hostname: 'example.com' })).toThrow('External network blocked');
});
it('restoring a provider mock cannot restore access to the real provider', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  await expect(fetch('https://example.com')).resolves.toBeInstanceOf(Response);
  vi.unstubAllGlobals();
  await expect(fetch('https://example.com')).rejects.toThrow('External network blocked');
});
it('still allows local fixture servers', async () => {
  const server = http.createServer((_req, res) => res.end('fixture'));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as import('node:net').AddressInfo;
    expect(await (await fetch(`http://127.0.0.1:${address.port}`)).text()).toBe('fixture');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
