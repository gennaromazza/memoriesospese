import { afterEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('node:timers/promises', () => ({ setTimeout: async () => undefined }));
vi.mock('@replit/connectors-sdk', () => ({ ReplitConnectors: class {
  createProxyFetch() { return h.fetch; }
} }));
import { boundedDriveRequest, transientDriveResponse } from './drive-request.js';
afterEach(() => { vi.useRealTimers(); h.fetch.mockReset(); });
describe('Richieste Drive limitate e classificate', () => {
  it('distingue rate limit 403, permessi negati, quota piena e autenticazione', () => {
    const body = (reason: string) => JSON.stringify({ error: { errors: [{ reason }] } });
    expect(transientDriveResponse(403, body('userRateLimitExceeded'))).toBe(true);
    expect(transientDriveResponse(403, body('rateLimitExceeded'))).toBe(true);
    expect(transientDriveResponse(403, body('insufficientFilePermissions'))).toBe(false);
    expect(transientDriveResponse(403, body('storageQuotaExceeded'))).toBe(false);
    expect(transientDriveResponse(401, '')).toBe(false);
    expect(transientDriveResponse(429, '')).toBe(true);
  });
  it('ripete rate limit, 503 e timeout con un limite, senza chiedere riconnessione', async () => {
    vi.useFakeTimers();
    h.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: { errors: [{ reason: 'rateLimitExceeded' }] } }), { status: 403 }))
      .mockRejectedValueOnce(new TypeError('timeout'))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const result = boundedDriveRequest('/drive/v3/files', {}, true);
    await vi.runAllTimersAsync();
    expect((await result).ok).toBe(true);
    expect(h.fetch).toHaveBeenCalledTimes(4);
    expect(h.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it('non ripete POST non idempotenti e non ripete permessi negati', async () => {
    h.fetch.mockResolvedValueOnce(new Response('', { status: 503 }));
    expect((await boundedDriveRequest('/drive/v3/files', { method: 'POST' })).status).toBe(503);
    h.fetch.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(boundedDriveRequest('/drive/v3/files', {}, true)).rejects.toThrow('permessi');
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });
  it('esaurisce i tentativi su una lettura temporaneamente non disponibile', async () => {
    vi.useFakeTimers();
    h.fetch.mockResolvedValue(new Response('', { status: 429 }));
    const result = boundedDriveRequest('/drive/v3/files', {}, true);
    await vi.runAllTimersAsync();
    expect((await result).status).toBe(429);
    expect(h.fetch).toHaveBeenCalledTimes(5);
  });
});
