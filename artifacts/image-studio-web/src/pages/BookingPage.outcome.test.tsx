// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';

const h = vi.hoisted(() => ({
  request: vi.fn(), toast: vi.fn(), analytics: vi.fn(), blog: vi.fn(),
  code: 'TESTCODE', approval: true, stato: 'in_attesa',
  slots: [] as any[],
  deposit: false, giftCode: undefined as string | undefined,
  hold: vi.fn(), resume: vi.fn(), config: vi.fn(), order: vi.fn(), capture: vi.fn(), status: vi.fn(), release: vi.fn(),
}));
vi.mock('@workspace/api-client-react', () => ({
  createBookingCheckoutHold: h.hold, resumeBookingCheckoutHold: h.resume, getBookingPayPalConfig: h.config,
  createBookingDepositOrder: h.order, captureBookingDeposit: h.capture, getBookingDepositStatus: h.status,
  releaseBookingCheckoutHold: h.release,
}));
vi.mock('@/features/gift-cards/GiftCardPayPalButtons', () => ({
  GiftCardPayPalButtons: ({ enabled, createOrder, onApprove, onCancel, onError }: any) => <div data-testid="paypal-buttons">
    <button type="button" disabled={!enabled} data-testid="sdk-pay" onClick={async () => {
      try { await onApprove(await createOrder()); } catch { /* SDK reports its own callback errors. */ }
    }}>Paga con PayPal</button>
    <button type="button" data-testid="sdk-cancel" onClick={onCancel}>Annulla PayPal</button>
    <button type="button" data-testid="sdk-error" onClick={() => onError('SDK non disponibile')}>Errore PayPal</button>
  </div>,
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/queryClient', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return { apiRequest: h.request, queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) };
});
vi.mock('wouter', () => ({
  useParams: () => ({ code: h.code, bookingId: 'hold-test' }),
  useLocation: () => ['/prenota/TESTCODE', vi.fn()],
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
vi.mock('@/lib/booking-campaigns', () => ({
  getCampaignByCode: async () => ({
    id: 'campaign-test', code: h.code, nome: 'Campagna test', descrizione: '',
    dataInizio: new Date(2030, 11, 1), dataFine: new Date(2030, 11, 3),
    durataShootingMinuti: 30, prodottiDisponibili: ['product-test'], attiva: true,
    richiedeApprovazione: h.approval, richiedeAcconto: h.deposit, accontoImportoCentesimi: 2000,
  }),
}));
vi.mock('@/lib/products', () => ({
  getAllProducts: async () => [{
    id: 'product-test', nome: 'Pacchetto test', prezzo: 50, prezzoFinale: 50,
    sconto: 0, numeroFoto: 5, immagini: [], attivo: true,
  }],
}));
vi.mock('@/components/gift-cards/GiftCardBookingBanner', () => ({
  useBookingGiftCard: () => ({ usableCode: h.giftCode }), GiftCardBookingBanner: () => null,
}));
vi.mock('@/components/EmailSuggestionChip', () => ({ EmailSuggestionChip: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock('@/hooks/useSEO', () => ({ useSEO: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackAnalyticsEvent: h.analytics, trackBlogConversion: h.blog }));
import { queryClient } from '@/lib/queryClient';
import BookingPage from './BookingPage';
import BookingDepositPaymentPage from './BookingDepositPaymentPage';

const slot = {
  start: '2030-12-01T09:00:00.000Z', end: '2030-12-01T09:30:00.000Z', startTime: '10:00', endTime: '10:30',
};
const nextSlot = {
  start: '2030-12-01T10:00:00.000Z', end: '2030-12-01T10:30:00.000Z', startTime: '11:00', endTime: '11:30',
};
function mount(strict = false) {
  const page = <QueryClientProvider client={queryClient}><BookingPage /></QueryClientProvider>;
  return render(strict ? <StrictMode>{page}</StrictMode> : page);
}
const payment = { bookingId: 'hold-test', paypalOrderId: 'ORDER-TEST', paypalCaptureId: 'CAPTURE-TEST',
  amountCents: 2500, currency: 'EUR', status: 'paid', bookingConfirmed: true, duplicate: false };
function holdView() {
  return { bookingId: 'hold-test', campaignId: 'campaign-test', flow: 'immediate', status: 'active', depositAmountCents: 2500, currency: 'EUR',
    expiresAt: new Date(Date.now() + 600_000).toISOString(), serverTime: new Date().toISOString(),
    dataShootingInizio: slot.start, dataShootingFine: slot.end, token: '1'.repeat(64) };
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
  sessionStorage.clear(); h.deposit = false; h.giftCode = undefined;
  h.hold.mockReset().mockImplementation(async () => holdView());
  h.resume.mockReset().mockImplementation(async () => holdView());
  h.config.mockReset().mockResolvedValue({ enabled: true, clientId: 'public-test', currency: 'EUR', environment: 'sandbox' });
  h.order.mockReset().mockResolvedValue({ bookingId: 'hold-test', paypalOrderId: 'ORDER-TEST', depositAmountCents: 2500, currency: 'EUR' });
  h.capture.mockReset().mockResolvedValue(payment);
  h.status.mockReset().mockResolvedValue({ bookingId: 'hold-test', campaignId: 'campaign-test', flow: 'immediate', status: 'unpaid',
    dataShootingInizio: slot.start, dataShootingFine: slot.end });
  h.release.mockReset().mockResolvedValue({ bookingId: 'hold-test', status: 'cancelled' });
  h.request.mockImplementation(async (_method, url) => {
    if (url.endsWith('/available-slots')) return json({ slots: h.slots });
    return json({ success: true, bookingId: 'booking-test', stato: h.stato });
  });
});
async function openApprovedLink(strict = false) {
  const approved = { ...holdView(), flow: 'approved', expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
  window.history.replaceState({}, '', `/prenota/acconto/hold-test#${'1'.repeat(64)}`);
  h.resume.mockResolvedValue(approved);
  h.status.mockResolvedValue({ bookingId: 'hold-test', campaignId: 'campaign-test', flow: 'approved', status: 'unpaid',
    dataShootingInizio: slot.start, dataShootingFine: slot.end });
  const page = <BookingDepositPaymentPage />;
  const result = render(strict ? <StrictMode>{page}</StrictMode> : page);
  await screen.findByTestId('paypal-buttons');
  return result;
}
describe('link acconto dopo approvazione', () => {
  it('opens the existing request directly, strips the token and charges only after PayPal approval', async () => {
    await openApprovedLink(true);
    expect(window.location.hash).toBe('');
    expect(h.hold).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
    expect(screen.queryByTestId('button-cancel-booking-payment')).toBeNull();
    await pay();
    expect(await screen.findByTestId('approved-deposit-receipt')).toBeTruthy();
    expect(h.capture).toHaveBeenCalledTimes(1);
    expect(h.capture).toHaveBeenCalledWith('hold-test', { token: '1'.repeat(64) });
  });
  it('preserves the original reservation after native PayPal cancellation', async () => {
    await openApprovedLink();
    fireEvent.click(screen.getByTestId('sdk-cancel'));
    expect(await screen.findByText(/Hai annullato il pagamento PayPal, non la prenotazione/)).toBeTruthy();
    expect(h.release).not.toHaveBeenCalled();
    expect(h.hold).not.toHaveBeenCalled();
    await pay();
    expect(await screen.findByTestId('approved-deposit-receipt')).toBeTruthy();
  });
  it('allows reloading a failed SDK without releasing or recreating the booking', async () => {
    await openApprovedLink();
    fireEvent.click(screen.getByTestId('sdk-error'));
    fireEvent.click(await screen.findByTestId('button-retry-booking-paypal'));
    await pay();
    expect(await screen.findByTestId('approved-deposit-receipt')).toBeTruthy();
    expect(h.release).not.toHaveBeenCalled();
    expect(h.hold).not.toHaveBeenCalled();
  });
  it('reloads a paid link as a receipt without another capture or SDK configuration', async () => {
    const first = await openApprovedLink();
    await pay(); await screen.findByTestId('approved-deposit-receipt');
    first.unmount();
    h.status.mockResolvedValue({ bookingId: 'hold-test', campaignId: 'campaign-test', flow: 'approved',
      status: 'paid', payment, dataShootingInizio: slot.start, dataShootingFine: slot.end });
    h.capture.mockClear(); h.config.mockClear();
    render(<BookingDepositPaymentPage />);
    expect(await screen.findByTestId('approved-deposit-receipt')).toBeTruthy();
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.config).not.toHaveBeenCalled();
  });
  it('rejects an incomplete link without calling payment APIs', async () => {
    window.history.replaceState({}, '', '/prenota/acconto/hold-test#invalid');
    render(<BookingDepositPaymentPage />);
    expect(await screen.findByText(/Il link di pagamento non è valido/)).toBeTruthy();
    expect(h.status).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
  });
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });

async function openCheckout(strict = false) {
  h.approval = false; h.deposit = true;
  mount(strict); await fillForm(); submit();
  await screen.findByTestId('booking-deposit-checkout');
}
async function pay() {
  await waitFor(() => expect((screen.getByTestId('sdk-pay') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByTestId('sdk-pay'));
}
describe('acconto PayPal immediato', () => {
  it('usa l’importo del server e conferma solo dopo la cattura, anche scegliendo i prodotti in studio', async () => {
    await openCheckout();
    expect((await screen.findByTestId('booking-deposit-amount')).textContent).toContain('25,00');
    expect(h.hold.mock.calls[0][0]).toMatchObject({ campaignId: 'campaign-test', cliente: { nome: 'Cliente' } });
    expect(h.hold.mock.calls[0][0]).not.toHaveProperty('depositAmountCents');
    expect(h.hold.mock.calls[0][0]).not.toHaveProperty('prodottoId');
    await pay();
    expect(await screen.findByText('Appuntamento confermato!')).toBeTruthy();
    expect(screen.getByTestId('booking-deposit-paid').textContent).toContain('25,00');
    expect(h.capture).toHaveBeenCalledWith('hold-test', { token: '1'.repeat(64) });
    expect(h.order).toHaveBeenCalledWith('hold-test', { token: '1'.repeat(64) });
    expect(h.request.mock.calls.some(call => call[1].endsWith('/create'))).toBe(false);
  });
  it('non prepara due riserve in StrictMode', async () => {
    await openCheckout(true);
    await screen.findByTestId('booking-deposit-amount');
    expect(h.hold).toHaveBeenCalledOnce();
  });
  it.each(['sdk-cancel', 'sdk-error'])('libera lo slot da %s e conserva i dati del cliente', async button => {
    await openCheckout();
    fireEvent.click(await screen.findByTestId(button));
    await waitFor(() => expect(screen.getByTestId('booking-payment-message').textContent).toContain('liberato'));
    expect(h.release).toHaveBeenCalledOnce();
    expect(h.capture).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('button-return-booking-form'));
    fireEvent.click(await screen.findByTestId('slot-10:00'));
    expect((await screen.findByTestId('input-nome') as HTMLInputElement).value).toBe('Cliente');
    expect(screen.queryByTestId('booking-deposit-checkout')).toBeNull();
  });
  it('scade sul termine server senza usare l’orologio del cliente per rinnovarlo', async () => {
    h.hold.mockImplementation(async () => { const view = holdView(); return { ...view, expiresAt: view.serverTime }; });
    await openCheckout();
    await waitFor(() => expect(screen.getByTestId('booking-payment-message').textContent).toContain('scaduto'));
    expect(h.release).toHaveBeenCalledOnce();
    expect(h.order).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
  });
  it('riconcilia una risposta persa senza ripetere l’addebito', async () => {
    h.capture.mockRejectedValue(new Error('network'));
    await openCheckout(); await pay();
    await screen.findByTestId('button-verify-booking-payment');
    expect(h.release).not.toHaveBeenCalled();
    h.status.mockResolvedValue({ bookingId: 'hold-test', status: 'paid', payment,
      dataShootingInizio: slot.start, dataShootingFine: slot.end });
    fireEvent.click(screen.getByTestId('button-verify-booking-payment'));
    expect(await screen.findByText('Appuntamento confermato!')).toBeTruthy();
    expect(h.capture).toHaveBeenCalledOnce();
  });
  it('non dichiara confermato un incasso tardivo', async () => {
    h.capture.mockResolvedValue({ ...payment, status: 'paid_action_required', bookingConfirmed: false });
    await openCheckout(); await pay();
    await waitFor(() => expect(screen.getByTestId('booking-payment-message').textContent).toContain('verifica dello studio'));
    expect(screen.queryByText('Appuntamento confermato!')).toBeNull();
    expect(screen.queryByTestId('button-return-booking-form')).toBeNull();
  });
  it('riprende una ricevuta dopo reload anche se PayPal è stato disattivato', async () => {
    sessionStorage.setItem('booking-deposit:campaign-test', JSON.stringify({ bookingId: 'hold-test', token: '1'.repeat(64), captureAttempted: true }));
    h.config.mockResolvedValue({ enabled: false, clientId: null, currency: 'EUR', environment: 'live' });
    h.status.mockResolvedValue({ bookingId: 'hold-test', status: 'paid', payment,
      dataShootingInizio: slot.start, dataShootingFine: slot.end });
    mount();
    expect(await screen.findByText('Appuntamento confermato!')).toBeTruthy();
    expect(h.config).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.hold).not.toHaveBeenCalled();
  });
  it('mantiene la ricevuta anche dopo il successo e riapre il modulo solo su scelta esplicita', async () => {
    await openCheckout(); await pay();
    await screen.findByText('Appuntamento confermato!');
    expect(sessionStorage.getItem('booking-deposit:campaign-test')).not.toBeNull();
    h.status.mockResolvedValue({ bookingId: 'hold-test', status: 'paid', payment,
      dataShootingInizio: slot.start, dataShootingFine: slot.end });
    cleanup(); mount();
    await screen.findByText('Appuntamento confermato!');
    expect(h.hold).toHaveBeenCalledOnce();
    expect(h.capture).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('button-new-paid-booking'));
    await screen.findByTestId('date-2030-12-01');
    expect(sessionStorage.getItem('booking-deposit:campaign-test')).toBeNull();
    expect(screen.queryByTestId('booking-outcome')).toBeNull();
  });
  it('non apre riserve se PayPal non è disponibile', async () => {
    h.config.mockResolvedValue({ enabled: false, clientId: null, currency: 'EUR', environment: 'live' });
    await openCheckout();
    await waitFor(() => expect(screen.getByTestId('booking-payment-message').textContent).toContain('PayPal non è disponibile'));
    expect(h.hold).not.toHaveBeenCalled();
  });
  it('non ignora una gift card già applicata facendo pagare di nuovo', async () => {
    h.approval = false; h.deposit = true; h.giftCode = 'GIFT-TEST';
    mount(); await fillForm(); submit();
    expect(await screen.findByText(/Per usare la gift card con una campagna/)).toBeTruthy();
    expect(h.hold).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
  });
  it.each([
    { approval: true, deposit: true }, { approval: true, deposit: false }, { approval: false, deposit: false },
  ])('non mostra PayPal per $approval/$deposit', async ({ approval, deposit }) => {
    h.approval = approval; h.deposit = deposit;
    mount(); await fillForm(); submit();
    await screen.findByTestId('booking-outcome');
    expect(h.hold).not.toHaveBeenCalled();
    expect(screen.queryByTestId('paypal-buttons')).toBeNull();
  });
});

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
