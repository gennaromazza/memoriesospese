// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mini renderHook senza dipendere da @testing-library: stesso React del progetto.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: Root[] = [];
function renderHook<T>(callback: () => T, options: { wrapper: React.ComponentType<{ children: React.ReactNode }> }) {
  const result = { current: undefined as unknown as T };
  const root = createRoot(document.createElement('div'));
  mounted.push(root);
  const Probe = () => { result.current = callback(); return null; };
  const draw = () => act(() => { root.render(<options.wrapper><Probe /></options.wrapper>); });
  draw();
  return { result, rerender: draw };
}
function cleanup() { while (mounted.length) { const root = mounted.pop()!; act(() => root.unmount()); } }
async function waitFor(assertion: () => void, timeoutMs = 2000) {
  const started = Date.now();
  for (;;) {
    try { assertion(); return; } catch (error) {
      if (Date.now() - started > timeoutMs) throw error;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    }
  }
}

const api = vi.hoisted(() => ({
  find: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock('@/lib/orders', () => ({
  findOrdersNeedingDepositReconciliation: api.find,
  reconcileBookingDepositsForOrders: api.reconcile,
}));
import { useBookingDepositVerification } from './useBookingDepositVerification';

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const orders = [{ id: 'o1' }, { id: 'o2' }] as any[];
const bookings = [{ id: 'b1' }] as any[];

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.find.mockReturnValue(['o1']);
});
afterEach(() => { cleanup(); client.clear(); });

const render = (ready = true) =>
  renderHook(() => useBookingDepositVerification({ orders, bookings, ready }), { wrapper });

describe('verifica acconti in background (schermata Prenotazioni)', () => {
  it('blocca subito solo l\'ordine da verificare e lo sblocca dopo il ricaricamento', async () => {
    let release!: (value: { updated: number; failedIds: string[] }) => void;
    api.reconcile.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);

    const hook = render();
    expect(hook.result.current.lockedOrderIds.has('o1')).toBe(true);
    expect(hook.result.current.lockedOrderIds.has('o2')).toBe(false);
    await waitFor(() => expect(api.reconcile).toHaveBeenCalledWith(['o1']));

    await act(async () => { release({ updated: 1, failedIds: [] }); });

    await waitFor(() => expect(hook.result.current.lockedOrderIds.size).toBe(0));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['orders'] });
  });

  it('resta bloccato finché gli ordini non sono stati riletti', async () => {
    api.reconcile.mockResolvedValue({ updated: 1, failedIds: [] });
    let finishRefetch!: () => void;
    vi.spyOn(client, 'invalidateQueries').mockReturnValue(new Promise<void>((resolve) => { finishRefetch = resolve; }));

    const hook = render();
    await waitFor(() => expect(api.reconcile).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current.lockedOrderIds.has('o1')).toBe(true);

    await act(async () => { finishRefetch(); });
    await waitFor(() => expect(hook.result.current.lockedOrderIds.size).toBe(0));
  });

  it('un ordine non verificato resta bloccato, segnalato come fallito e Riprova lo rilancia', async () => {
    api.reconcile.mockResolvedValueOnce({ updated: 0, failedIds: ['o1'] });
    const hook = render();
    await waitFor(() => expect(hook.result.current.failedCount).toBe(1));
    expect(hook.result.current.lockedOrderIds.has('o1')).toBe(true);
    expect(api.reconcile).toHaveBeenCalledTimes(1);

    api.reconcile.mockResolvedValueOnce({ updated: 1, failedIds: [] });
    vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    act(() => hook.result.current.retry());
    await waitFor(() => expect(api.reconcile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hook.result.current.lockedOrderIds.size).toBe(0));
    expect(hook.result.current.failedCount).toBe(0);
  });

  it('non invia lo stesso ordine due volte nella stessa sessione', async () => {
    api.reconcile.mockResolvedValue({ updated: 0, failedIds: [] });
    vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const hook = render();
    await waitFor(() => expect(hook.result.current.lockedOrderIds.size).toBe(0));
    hook.rerender();
    expect(api.reconcile).toHaveBeenCalledTimes(1);
  });

  it('aspetta che le prenotazioni siano caricate e non chiama il server senza candidati', async () => {
    const hook = render(false);
    expect(hook.result.current.lockedOrderIds.size).toBe(0);
    expect(api.reconcile).not.toHaveBeenCalled();
    api.find.mockReturnValue([]);
    hook.rerender();
    expect(api.reconcile).not.toHaveBeenCalled();
  });
});
