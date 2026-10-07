import { describe, expect, it, vi } from 'vitest';
import {
  PRINT_SHOP_UPLOAD_RATE_LIMIT,
  uidRateLimiter,
} from './rate-limit.js';

describe('print-shop upload rate limiting', () => {
  it('allows prepare and finalize for a 50-photo Polaroid package', () => {
    const limiter = uidRateLimiter(PRINT_SHOP_UPLOAD_RATE_LIMIT, 10 * 60_000);
    const next = vi.fn();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const response = {
      setHeader: vi.fn(),
      status,
    } as any;
    const request = { user: { uid: 'polaroid_customer' }, ip: '127.0.0.1' } as any;

    // Ogni fotografia usa due chiamate autenticate: prepare + finalize.
    for (let call = 0; call < 50 * 2; call++) {
      limiter(request, response, next);
    }

    expect(next).toHaveBeenCalledTimes(100);
    expect(status).not.toHaveBeenCalledWith(429);
    expect(PRINT_SHOP_UPLOAD_RATE_LIMIT).toBeGreaterThanOrEqual(100);
  });
});
