import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ orders: vi.fn(), campaigns: vi.fn() }));
vi.mock('@/lib/orders', () => ({ getAllOrdersUnreconciled: mocks.orders }));
vi.mock('@/lib/booking-campaigns', () => ({ getAllCampaigns: mocks.campaigns }));
import { BOOKINGS_SCREEN_ORDERS_KEY, BOOKINGS_SCREEN_ORDERS_STALE_MS, prefetchBookingsScreen } from './bookings-screen-prefetch';

beforeEach(() => { mocks.orders.mockReset().mockResolvedValue([{ id: 'o1' }]); mocks.campaigns.mockReset().mockResolvedValue([{ id: 'c1' }]); });

describe('prefetchBookingsScreen', () => {
  it('mette in cache ordini e campagne con le stesse chiavi usate dalla schermata', async () => {
    const client = new QueryClient();
    await prefetchBookingsScreen(client);
    expect(client.getQueryData(BOOKINGS_SCREEN_ORDERS_KEY)).toEqual([{ id: 'o1' }]);
    expect(client.getQueryData(['campaigns'])).toEqual([{ id: 'c1' }]);
  });

  it('non rilegge i dati ancora freschi (aprire la dashboard piu\' volte non moltiplica le letture)', async () => {
    const client = new QueryClient();
    await prefetchBookingsScreen(client);
    await prefetchBookingsScreen(client);
    expect(mocks.orders).toHaveBeenCalledTimes(1);
    expect(mocks.campaigns).toHaveBeenCalledTimes(1);
    expect(BOOKINGS_SCREEN_ORDERS_STALE_MS).toBe(2 * 60 * 1000);
  });

  it('un errore non rompe la dashboard e lascia la cache vuota, cosi\' la schermata riprova da sola', async () => {
    mocks.orders.mockRejectedValue(new Error('offline'));
    const client = new QueryClient();
    await expect(prefetchBookingsScreen(client)).resolves.toBeUndefined();
    expect(client.getQueryData(BOOKINGS_SCREEN_ORDERS_KEY)).toBeUndefined();
  });
});
