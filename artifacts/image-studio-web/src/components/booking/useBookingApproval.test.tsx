// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const api = vi.hoisted(() => ({ approveBooking: vi.fn(), markBookingAsViewed: vi.fn() }));
vi.mock('@/lib/bookings', () => api);
import { useBookingApproval } from './useBookingApproval';
const bookings = [{ id: 'one', stato: 'in_attesa' }];
type Options = Parameters<typeof useBookingApproval>[0];
const refresh = vi.fn<Options['refresh']>();
const success = vi.fn<Options['onSuccess']>();
const failed = vi.fn<Options['onError']>();
beforeEach(() => {
  api.approveBooking.mockReset().mockResolvedValue({ success: true, bookingId: 'one' });
  api.markBookingAsViewed.mockReset().mockResolvedValue(undefined);
  refresh.mockReset().mockResolvedValue(undefined); success.mockReset(); failed.mockReset();
});
afterEach(cleanup);
function mount() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(({ rows }) => useBookingApproval({ bookings: rows, refresh, onSuccess: success, onError: failed }),
    { wrapper, initialProps: { rows: bookings } });
}
it('il primo tocco approva anche se il salvataggio del badge non termina', async () => {
  api.markBookingAsViewed.mockImplementation(() => new Promise(() => {}));
  const hook = mount();
  act(() => hook.result.current.mutate('one'));
  await waitFor(() => expect(success).toHaveBeenCalledOnce());
  expect(api.approveBooking).toHaveBeenCalledExactlyOnceWith('one');
  expect(hook.result.current.completed.one).toMatchObject({ success: true });
  expect(refresh).toHaveBeenCalledWith({ throwOnError: true });
});
it('un badge rifiutato non blocca il comando e non mostra un errore di approvazione', async () => {
  api.markBookingAsViewed.mockRejectedValueOnce(new Error('offline'));
  const hook = mount(); act(() => hook.result.current.mutate('one'));
  await waitFor(() => expect(success).toHaveBeenCalledOnce());
  expect(failed).not.toHaveBeenCalled();
});
it('due tocchi nello stesso frame e un altro dopo la risposta producono una sola richiesta', async () => {
  const hook = mount();
  act(() => { hook.result.current.mutate('one'); hook.result.current.mutate('one'); });
  await waitFor(() => expect(success).toHaveBeenCalledOnce());
  act(() => hook.result.current.mutate('one'));
  expect(api.approveBooking).toHaveBeenCalledOnce();
});
it('la lista in ritardo non fa sembrare perso il salvataggio né blocca il completamento', async () => {
  refresh.mockImplementation(() => new Promise(() => {}));
  const hook = mount(); act(() => hook.result.current.mutate('one'));
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(hook.result.current.isPending).toBe(false);
  expect(hook.result.current.completed.one).toBeDefined();
  hook.rerender({ rows: [{ id: 'one', stato: 'confermata' }] });
  await waitFor(() => expect(hook.result.current.completed.one).toBeUndefined());
});
it('distingue la richiesta di acconto dalla conferma finale mentre la lista è ancora vecchia', async () => {
  api.approveBooking.mockResolvedValue({ success: true, paymentRequired: true, amountCents: 500 });
  const hook = mount(); act(() => hook.result.current.mutate('one'));
  await waitFor(() => expect(hook.result.current.completed.one?.paymentRequired).toBe(true));
  expect(bookings[0].stato).toBe('in_attesa');
  act(() => hook.result.current.mutate('one'));
  expect(api.approveBooking).toHaveBeenCalledOnce();
});
it('dopo un rifiuto aggiorna la lista ma non inventa un esito riuscito né ritenta automaticamente', async () => {
  api.approveBooking.mockRejectedValueOnce(new Error('calendar unavailable'));
  const hook = mount(); act(() => hook.result.current.mutate('one'));
  await waitFor(() => expect(failed).toHaveBeenCalledOnce());
  expect(success).not.toHaveBeenCalled();
  expect(api.markBookingAsViewed).not.toHaveBeenCalled();
  expect(hook.result.current.completed.one).toBeUndefined();
  expect(refresh).toHaveBeenCalledOnce();
  expect(api.approveBooking).toHaveBeenCalledOnce();
  act(() => hook.result.current.mutate('one'));
  await waitFor(() => expect(success).toHaveBeenCalledOnce());
});
