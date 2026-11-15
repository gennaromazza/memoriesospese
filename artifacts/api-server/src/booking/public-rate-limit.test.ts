import { describe, expect, it, vi } from 'vitest';
import { bookingPublicRateLimiter } from './public-rate-limit.js';
import { requestClientKey } from '../print-shop/rate-limit.js';

function call(limiter: ReturnType<typeof bookingPublicRateLimiter>, headers: Record<string, string> = {}, ip = '10.0.0.1') {
  const res: any = { status: vi.fn(() => res), json: vi.fn(() => res), setHeader: vi.fn() };
  const next = vi.fn();
  limiter({ headers, ip } as any, res, next);
  return { allowed: next.mock.calls.length === 1, status: res.status.mock.calls[0]?.[0], body: res.json.mock.calls[0]?.[0] };
}

describe('limite pubblico del checkout prenotazioni', () => {
  it('usa il primo indirizzo inoltrato dal proxy, non quello del proxy stesso', () => {
    expect(requestClientKey({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, ip: '10.0.0.1' })).toBe('203.0.113.9');
    expect(requestClientKey({ headers: {}, ip: '10.0.0.1' })).toBe('10.0.0.1');
    expect(requestClientKey({ headers: {} })).toBe('unknown');
  });
  it('blocca oltre il limite per visitatore con 429 e Retry-After, senza coinvolgere gli altri visitatori', () => {
    let now = 1_000;
    const limiter = bookingPublicRateLimiter(2, 60_000, () => now);
    const a = { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, b = { 'x-forwarded-for': '198.51.100.4, 10.0.0.1' };
    expect(call(limiter, a).allowed).toBe(true);
    expect(call(limiter, a).allowed).toBe(true);
    const blocked = call(limiter, a);
    expect(blocked.allowed).toBe(false);
    expect(blocked.status).toBe(429);
    expect(typeof blocked.body.error).toBe('string');
    expect(call(limiter, b).allowed).toBe(true);
    now += 60_000;
    expect(call(limiter, a).allowed).toBe(true);
  });
});
