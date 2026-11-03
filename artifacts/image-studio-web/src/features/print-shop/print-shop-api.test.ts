import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  currentUser: { getIdToken: vi.fn(async () => 'test-token') },
}));
const createUrlMock = vi.hoisted(() => vi.fn((path: string) => path));
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase', () => ({ auth: authMock }));
vi.mock('@/lib/basePath', () => ({ createUrl: createUrlMock }));

import { PrintShopApiError, printShopApi } from './print-shop-api';

describe('print shop API coupon errors', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    authMock.currentUser.getIdToken.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the server message and error code when rejecting an invalid coupon', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 'coupon_invalid',
        message: 'Il codice coupon non è valido',
      },
    }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }));

    const request = printShopApi.quoteOrder('draft-1', [], 'studio_pickup', 'NOTVALID');

    await expect(request).rejects.toMatchObject({
      name: 'PrintShopApiError',
      status: 400,
      code: 'coupon_invalid',
      message: 'Il codice coupon non è valido',
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({
      items: [],
      fulfillment: { method: 'studio_pickup' },
      couponCode: 'NOTVALID',
    });
    expect((options.headers as Headers).get('Authorization')).toBe('Bearer test-token');
  });
});
