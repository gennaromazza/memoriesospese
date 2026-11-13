// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  request: vi.fn(), toast: vi.fn(), analytics: vi.fn(), blog: vi.fn(),
  code: 'TESTCODE', approval: true, stato: 'in_attesa',
  slots: [] as any[],
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/queryClient', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return { apiRequest: h.request, queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) };
});
vi.mock('wouter', () => ({
  useParams: () => ({ code: h.code }),
  useLocation: () => ['/prenota/TESTCODE', vi.fn()],
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
vi.mock('@/lib/booking-campaigns', () => ({
  getCampaignByCode: async () => ({
    id: 'campaign-test', code: h.code, nome: 'Campagna test', descrizione: '',
    dataInizio: new Date(2030, 11, 1), dataFine: new Date(2030, 11, 3),
    durataShootingMinuti: 30, prodottiDisponibili: ['product-test'], attiva: true,
    richiedeApprovazione: h.approval, richiedeAcconto: false,
  }),
}));
vi.mock('@/lib/products', () => ({
  getAllProducts: async () => [{
    id: 'product-test', nome: 'Pacchetto test', prezzo: 50, prezzoFinale: 50,
    sconto: 0, numeroFoto: 5, immagini: [], attivo: true,
  }],
}));
vi.mock('@/components/gift-cards/GiftCardBookingBanner', () => ({
  useBookingGiftCard: () => ({ usableCode: undefined }), GiftCardBookingBanner: () => null,
}));
vi.mock('@/components/EmailSuggestionChip', () => ({ EmailSuggestionChip: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock('@/hooks/useSEO', () => ({ useSEO: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackAnalyticsEvent: h.analytics, trackBlogConversion: h.blog }));
import { queryClient } from '@/lib/queryClient';
import BookingPage from './BookingPage';

const slot = {
  start: '2030-12-01T09:00:00.000Z', end: '2030-12-01T09:30:00.000Z', startTime: '10:00', endTime: '10:30',
};
const nextSlot = {
  start: '2030-12-01T10:00:00.000Z', end: '2030-12-01T10:30:00.000Z', startTime: '11:00', endTime: '11:30',
};
function mount() {
  return render(<QueryClientProvider client={queryClient}><BookingPage /></QueryClientProvider>);
}
const json = (data: any) => ({ json: async () => data });
async function fillForm() {
  fireEvent.click(await screen.findByTestId('date-2030-12-01'));
  fireEvent.click(await screen.findByTestId('slot-10:00'));
  fireEvent.change(screen.getByTestId('input-nome'), { target: { value: 'Cliente' } });
  fireEvent.change(screen.getByTestId('input-cognome'), { target: { value: 'Test' } });
  fireEvent.change(screen.getByTestId('input-email'), { target: { value: 'cliente@example.com' } });
  fireEvent.change(screen.getByTestId('input-whatsapp'), { target: { value: '+390000000000' } });
  fireEvent.click(screen.getByTestId('checkbox-privacy-consent'));
}
const submit = () => fireEvent.click(screen.getByTestId('button-submit-booking'));

beforeEach(() => {
  vi.clearAllMocks(); queryClient.clear();
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  h.code = 'TESTCODE'; h.approval = true; h.stato = 'in_attesa'; h.slots = [slot];
  h.request.mockImplementation(async (_method, url) => {
    if (url.endsWith('/available-slots')) return json({ slots: h.slots });
    return json({ success: true, bookingId: 'booking-test', stato: h.stato });
  });
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });

describe('esito pubblico della prenotazione', () => {
  it.each([
    { stato: 'in_attesa', approval: false, title: 'Richiesta inviata · in attesa' },
    { stato: 'confermata', approval: true, title: 'Appuntamento confermato!' },
  ])('usa lo stato $stato restituito dal server, non quello della campagna', async ({ stato, approval, title }) => {
    h.stato = stato; h.approval = approval;
    mount();
    await fillForm();
    // Scelta esplicita del pacchetto in studio, anche dopo averne scelto uno.
    fireEvent.click(screen.getByTestId('product-product-test'));
    fireEvent.click(screen.getByTestId('product-none'));
    submit();
    const outcome = await screen.findByTestId('booking-outcome');
    expect(outcome.textContent).toContain(title);
    expect(outcome.textContent).toContain('cliente@example.com');
    expect(outcome.textContent).toContain('10:00');
    expect(outcome.textContent).toContain(stato === 'confermata'
      ? 'Il tuo appuntamento è confermato'
      : 'L’appuntamento non è ancora confermato');
    expect(h.request).toHaveBeenCalledWith('POST', '/api/booking/v2/create', expect.objectContaining({
      prodottoId: undefined, prodottoNome: undefined,
    }));
    expect(h.analytics).toHaveBeenCalledWith('booking_request_submitted', expect.objectContaining({ outcome: stato }));
    expect(h.toast.mock.calls.at(-1)?.[0].title).toBe(stato === 'confermata' ? 'Appuntamento confermato!' : 'Richiesta inviata');
  });

  it('dopo un conflitto aggiorna gli slot, conserva i dati e permette un nuovo invio', async () => {
    mount();
    await fillForm();
    let conflict = true;
    h.request.mockImplementation(async (_method, url) => {
      if (url.endsWith('/available-slots')) return json({ slots: h.slots });
      if (conflict) {
        conflict = false; h.slots = [nextSlot];
        throw new Error('409: {"error":"Slot non più disponibile"}');
      }
      return json({ success: true, bookingId: 'booking-test', stato: 'confermata' });
    });
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain('Scegli un altro slot');
    expect(screen.queryByTestId('booking-outcome')).toBeNull();
    expect(h.analytics).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Scegli un altro orario' }).getAttribute('href')).toBe('#booking-slot-picker');
    fireEvent.click(await screen.findByTestId('slot-11:00'));
    expect((screen.getByTestId('input-email') as HTMLInputElement).value).toBe('cliente@example.com');
    expect(screen.queryByTestId('slot-10:00')).toBeNull();
    submit();
    expect((await screen.findByTestId('booking-outcome')).textContent).toContain('11:00');
  });

  it.each(['server', 'invalid'])('non mostra successo per errore %s e conserva il modulo', async kind => {
    mount();
    await fillForm();
    h.request.mockImplementation(async (_method, url) => {
      if (url.endsWith('/available-slots')) return json({ slots: [slot] });
      if (kind === 'server') throw new Error('500: {"error":"Invio non riuscito"}');
      return json({ success: true, bookingId: 'test' }); // Nessuno stato verificabile.
    });
    submit();
    await screen.findByRole('alert');
    expect(screen.queryByTestId('booking-outcome')).toBeNull();
    expect((screen.getByTestId('input-email') as HTMLInputElement).value).toBe('cliente@example.com');
    expect(h.analytics).not.toHaveBeenCalled();
    expect(h.toast.mock.calls.at(-1)?.[0].variant).toBe('destructive');
  });

  it('elimina la selezione obsoleta quando tutti gli slot diventano occupati', async () => {
    mount();
    await fillForm();
    queryClient.setQueryData(['available-slots', new Date(2030, 11, 1), 'campaign-test'], []);
    expect(await screen.findByText('Nessuno slot disponibile per questa data')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('button-submit-booking')).toBeNull());
    expect(screen.queryByTestId('booking-outcome')).toBeNull();
  });

  it('il riepilogo usa i dati inviati anche se il modulo cambia durante la risposta', async () => {
    mount();
    await fillForm();
    let resolve!: (value: any) => void;
    h.request.mockImplementation(async (_method, url) => {
      if (url.endsWith('/available-slots')) return json({ slots: [slot] });
      return new Promise(done => { resolve = done; });
    });
    submit();
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    fireEvent.change(screen.getByTestId('input-email'), { target: { value: 'modificata@example.com' } });
    resolve(json({ success: true, bookingId: 'booking-test', stato: 'confermata' }));
    const outcome = await screen.findByTestId('booking-outcome');
    expect(outcome.textContent).toContain('cliente@example.com');
    expect(outcome.textContent).not.toContain('modificata@example.com');
  });

  it('non trascina l’esito di una campagna sulla successiva', async () => {
    const view = mount();
    await fillForm(); submit();
    await screen.findByTestId('booking-outcome');
    h.code = 'SECOND';
    view.rerender(<QueryClientProvider client={queryClient}><BookingPage /></QueryClientProvider>);
    await waitFor(() => expect(screen.queryByTestId('booking-outcome')).toBeNull());
    expect(await screen.findByTestId('date-2030-12-01')).toBeTruthy();
  });
});
