// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Booking } from '@shared/booking-types';
const api = vi.hoisted(() => ({ getAllBookings: vi.fn(), subscribeBookings: vi.fn(), stop: vi.fn() }));
vi.mock('@/lib/bookings', () => api);
import { useLiveBookings } from './useLiveBookings';

let client: QueryClient;
const pending = { id: 'booking-test', stato: 'in_attesa' } as Booking;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.subscribeBookings.mockReturnValue(api.stop);
  api.getAllBookings.mockResolvedValue([pending]);
});
afterEach(() => { cleanup(); client.clear(); });
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
describe('live booking payment updates', () => {
  it('reports a synchronous listener failure without crashing the admin page', () => {
    api.subscribeBookings.mockImplementationOnce(() => { throw new Error('listener unavailable'); });
    const hook = renderHook(() => useLiveBookings('staff'), { wrapper });
    expect(hook.result.current.isLoading).toBe(false);
    expect(hook.result.current.liveError).toContain('non disponibili');
  });
  it('waits for auth and reads updates without repeatedly fetching every booking', async () => {
    const hook = renderHook(({ uid }) => useLiveBookings(uid), { initialProps: { uid: '' }, wrapper });
    expect(api.subscribeBookings).not.toHaveBeenCalled();
    hook.rerender({ uid: 'staff' });
    expect(api.subscribeBookings).toHaveBeenCalledTimes(1);
    const next = api.subscribeBookings.mock.calls[0][0];
    act(() => next([], true));
    expect(hook.result.current.isLoading).toBe(true);
    act(() => next([pending], false));
    await waitFor(() => expect(hook.result.current.data?.[0].stato).toBe('in_attesa'));
    act(() => next([{ ...pending, stato: 'confermata' }], false));
    await waitFor(() => expect(hook.result.current.data?.[0].stato).toBe('confermata'));
    expect(api.getAllBookings).not.toHaveBeenCalled();
    hook.unmount();
    expect(api.stop).toHaveBeenCalledTimes(1);
  });
  it('does not let an older manual refresh overwrite a newer payment event', async () => {
    const hook = renderHook(() => useLiveBookings('staff'), { wrapper });
    const next = api.subscribeBookings.mock.calls[0][0];
    act(() => next([pending], false));
    let finish!: (rows: Booking[]) => void;
    api.getAllBookings.mockImplementationOnce(() => new Promise<Booking[]>(resolve => { finish = resolve; }));
    let refresh!: ReturnType<typeof hook.result.current.refetch>;
    act(() => { refresh = hook.result.current.refetch(); });
    await waitFor(() => expect(api.getAllBookings).toHaveBeenCalledTimes(1));
    act(() => next([{ ...pending, stato: 'confermata' }], false));
    await act(async () => { finish([pending]); await refresh; });
    expect(hook.result.current.data?.[0].stato).toBe('confermata');
  });
  it('clears inaccessible data and reports an authentication failure instead of silently freezing', async () => {
    const hook = renderHook(() => useLiveBookings('staff'), { wrapper });
    const [next, error] = api.subscribeBookings.mock.calls[0];
    act(() => next([pending], false));
    act(() => error(Object.assign(new Error('denied'), { code: 'permission-denied' })));
    await waitFor(() => expect(hook.result.current.data).toEqual([]));
    expect(hook.result.current.liveError).toContain('non disponibili');
    await act(async () => { await hook.result.current.refetch(); });
    expect(api.subscribeBookings).toHaveBeenCalledTimes(2);
    act(() => api.subscribeBookings.mock.calls[1][0]([{ ...pending, stato: 'confermata' }], false));
    await waitFor(() => expect(hook.result.current.data?.[0].stato).toBe('confermata'));
    expect(hook.result.current.liveError).toBeNull();
  });
});
