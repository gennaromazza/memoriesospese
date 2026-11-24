// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const h = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: h.request }));
import { BookingCalendarRecoveryPanel } from './BookingCalendarRecoveryPanel';
const plan = { action: 'create', canRecover: true, inspectionKey: 'a'.repeat(64),
  calendarId: 'studio-calendar', message: 'Nessun appuntamento presente.' };
function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    <BookingCalendarRecoveryPanel bookingId="one" />
  </QueryClientProvider>);
}
beforeEach(() => h.request.mockReset());
afterEach(cleanup);
it('non chiama Google all’apertura del dettaglio e richiede prima una verifica', async () => {
  mount();
  expect(h.request).not.toHaveBeenCalled();
  expect(screen.queryByText('Crea appuntamento mancante')).toBeNull();
  h.request.mockResolvedValue({ json: async () => plan });
  fireEvent.click(screen.getByText('Verifica appuntamento'));
  await screen.findByText('Crea appuntamento mancante');
  expect(h.request).toHaveBeenCalledExactlyOnceWith('GET', '/api/booking/one/calendar-recovery', undefined);
});
it('recupera solo dopo conferma amministrativa e mostra l’esito', async () => {
  h.request.mockResolvedValueOnce({ json: async () => plan })
    .mockResolvedValueOnce({ json: async () => ({ action: 'already_linked', canRecover: false, message: 'Recuperato senza inviare email.' }) });
  mount(); fireEvent.click(screen.getByText('Verifica appuntamento'));
  fireEvent.click(await screen.findByText('Crea appuntamento mancante'));
  await screen.findByText('Recuperato senza inviare email.');
  expect(h.request).toHaveBeenLastCalledWith('POST', '/api/booking/one/calendar-recovery', { inspectionKey: plan.inspectionKey });
  expect(screen.queryByText('Crea appuntamento mancante')).toBeNull();
});
it('gli eventi già esistenti vengono collegati, non presentati come nuove creazioni', async () => {
  h.request.mockResolvedValue({ json: async () => ({ ...plan, action: 'link_existing' }) });
  mount(); fireEvent.click(screen.getByText('Verifica appuntamento'));
  await screen.findByText('Collega appuntamento esistente');
  expect(screen.queryByText('Crea appuntamento mancante')).toBeNull();
});
it('dopo un errore obbliga a verificare di nuovo prima di riprovare', async () => {
  h.request.mockResolvedValueOnce({ json: async () => plan }).mockRejectedValueOnce(new Error('409: {"error":"Prenotazione modificata"}'));
  mount(); fireEvent.click(screen.getByText('Verifica appuntamento'));
  fireEvent.click(await screen.findByText('Crea appuntamento mancante'));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Prenotazione modificata'));
  expect(screen.queryByText('Crea appuntamento mancante')).toBeNull();
});
it('un esito bloccato non espone un pulsante per forzare la creazione', async () => {
  h.request.mockResolvedValue({ json: async () => ({ action: 'blocked', canRecover: false, message: 'Serve una verifica manuale.' }) });
  mount(); fireEvent.click(screen.getByText('Verifica appuntamento'));
  await screen.findByText('Serve una verifica manuale.');
  expect(screen.queryByText('Crea appuntamento mancante')).toBeNull();
});
