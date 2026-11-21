// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({ rejectBooking: vi.fn(), markBookingAsViewed: vi.fn() }));
vi.mock('@/lib/bookings', () => api);
import { useBookingRejection } from './useBookingRejection';

const bookings = [{ id: 'one', stato: 'in_attesa' }];
type Options = Parameters<typeof useBookingRejection>[0];
const refresh = vi.fn<Options['refresh']>();
const success = vi.fn<Options['onSuccess']>();
const failed = vi.fn<Options['onError']>();

beforeEach(() => {
  api.rejectBooking.mockReset().mockResolvedValue(undefined);
  api.markBookingAsViewed.mockReset().mockResolvedValue(undefined);
  refresh.mockReset().mockResolvedValue(undefined);
  success.mockReset();
  failed.mockReset();
});

afterEach(cleanup);

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(({ rows }) => useBookingRejection({
    bookings: rows,
    refresh,
    onSuccess: success,
    onError: failed,
  }), { wrapper, initialProps: { rows: bookings } });
}

it('avvia il rifiuto al primo tocco senza attendere il badge', async () => {
  api.markBookingAsViewed.mockImplementation(() => new Promise(() => {}));
  let finishReject!: () => void;
  api.rejectBooking.mockImplementation(() => new Promise<void>(resolve => { finishReject = resolve; }));

  const hook = mount();
  act(() => hook.result.current.mutate('one'));

  await waitFor(() => expect(api.rejectBooking).toHaveBeenCalledOnce());
  expect(api.rejectBooking).toHaveBeenCalledExactlyOnceWith('one');
  expect(api.markBookingAsViewed).not.toHaveBeenCalled();
  expect(success).not.toHaveBeenCalled();

  await act(async () => { finishReject(); });
  await waitFor(() => expect(success).toHaveBeenCalledOnce());
  expect(api.markBookingAsViewed).toHaveBeenCalledExactlyOnceWith('one');
  expect(refresh).toHaveBeenCalledWith({ throwOnError: true });
  expect(failed).not.toHaveBeenCalled();
});

it('due tocchi nello stesso frame inviano una sola richiesta', async () => {
  let finishReject!: () => void;
  api.rejectBooking.mockImplementation(() => new Promise<void>(resolve => { finishReject = resolve; }));
  const hook = mount();

  act(() => {
    hook.result.current.mutate('one');
    hook.result.current.mutate('one');
  });
  await waitFor(() => expect(api.rejectBooking).toHaveBeenCalledOnce());
  expect(api.rejectBooking).toHaveBeenCalledOnce();

  await act(async () => { finishReject(); });
  await waitFor(() => expect(success).toHaveBeenCalledOnce());
  act(() => hook.result.current.mutate('one'));
  expect(api.rejectBooking).toHaveBeenCalledOnce();
});

it('il fallimento del badge dopo il rifiuto non trasforma il successo in errore', async () => {
  api.markBookingAsViewed.mockRejectedValueOnce(new Error('badge offline'));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const hook = mount();

  act(() => hook.result.current.mutate('one'));
  await waitFor(() => expect(success).toHaveBeenCalledOnce());
  await waitFor(() => expect(warning).toHaveBeenCalled());

  expect(failed).not.toHaveBeenCalled();
  expect(api.rejectBooking).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalledWith({ throwOnError: true });
  warning.mockRestore();
});

it('un errore server non mostra successo e non marca il badge come letto', async () => {
  api.rejectBooking.mockRejectedValueOnce(new Error('server unavailable'));
  const hook = mount();

  act(() => hook.result.current.mutate('one'));
  await waitFor(() => expect(failed).toHaveBeenCalledOnce());

  expect(failed).toHaveBeenCalledWith(expect.objectContaining({ message: 'server unavailable' }));
  expect(success).not.toHaveBeenCalled();
  expect(api.markBookingAsViewed).not.toHaveBeenCalled();
  expect(refresh).toHaveBeenCalledWith({ throwOnError: true });
  expect(hook.result.current.completed.one).toBeUndefined();
});

it('mantiene l’esito fino all’aggiornamento della lista', async () => {
  const hook = mount();
  act(() => hook.result.current.mutate('one'));
  await waitFor(() => expect(success).toHaveBeenCalledOnce());

  expect(hook.result.current.completed.one).toBe(true);
  expect(refresh).toHaveBeenCalledWith({ throwOnError: true });

  hook.rerender({ rows: [{ id: 'one', stato: 'annullata' }] });
  await waitFor(() => expect(hook.result.current.completed.one).toBeUndefined());
});
