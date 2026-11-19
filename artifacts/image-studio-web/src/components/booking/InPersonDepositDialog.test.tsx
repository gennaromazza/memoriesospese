// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({ record: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/bookings', () => ({ recordInPersonBookingDeposit: api.record }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: api.toast }) }));
import { InPersonDepositDialog } from './InPersonDepositDialog';

// Mini renderer senza @testing-library: stesso React del progetto.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null, client: QueryClient;
const onOpenChange = vi.fn(), onRecorded = vi.fn();

function mount(suggested: number | null = 5000) {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  act(() => root!.render(<QueryClientProvider client={client}>
    <InPersonDepositDialog bookingId="b1" userId="staff" suggestedAmountCents={suggested} open onOpenChange={onOpenChange} onRecorded={onRecorded} />
  </QueryClientProvider>));
}
const q = <T extends Element>(selector: string) => document.body.querySelector<T>(selector);
function type(selector: string, value: string) {
  const input = q<HTMLInputElement | HTMLSelectElement>(selector)!;
  const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
const confirmButton = () => [...document.body.querySelectorAll('button')].find(b => /Conferma incasso|Registrazione/.test(b.textContent || ''))!;
const click = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); }); };
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
  api.record.mockResolvedValue({ bookingId: 'b1', stage: 'confermata' });
});
afterEach(() => { if (root) act(() => root!.unmount()); root = null; document.body.innerHTML = ''; });

describe('registrazione acconto di persona', () => {
  it("propone l'acconto della campagna ma l'importo e' libero", () => {
    mount(5000);
    expect(q<HTMLInputElement>('#in-person-amount')!.value).toBe('50,00');
    expect(document.body.textContent).toContain('50,00');
    expect(confirmButton().disabled).toBe(false);
  });

  it('invia importo diverso, metodo e nota in centesimi e chiude dopo il successo', async () => {
    mount(5000);
    type('#in-person-amount', '20,50'); type('#in-person-method', 'carta'); type('#in-person-note', ' POS studio ');
    await click(confirmButton()); await settle();
    expect(api.record).toHaveBeenCalledTimes(1);
    expect(api.record).toHaveBeenCalledWith('b1', { amountCents: 2050, method: 'carta', requestId: expect.stringMatching(/^[0-9a-f-]{36}$/), note: 'POS studio' });
    expect(onRecorded).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(api.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Acconto registrato' }));
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['bookings'] });
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['orders'] });
  });

  it.each(['', '0', '-5', '20,555', 'abc'])('non permette di confermare con importo %j', async value => {
    mount(5000);
    type('#in-person-amount', value);
    expect(confirmButton().disabled).toBe(true);
    await click(confirmButton());
    expect(api.record).not.toHaveBeenCalled();
  });

  it('dopo un errore di rete lo stesso invio riusa lo stesso identificativo; se i dati cambiano ne usa uno nuovo', async () => {
    api.record.mockRejectedValueOnce(new Error('Esito da verificare')).mockRejectedValueOnce(new Error('Esito da verificare'));
    mount(5000);
    await click(confirmButton()); await settle();
    expect(q('[role="alert"]')!.textContent).toContain('Esito da verificare');
    expect(onOpenChange).not.toHaveBeenCalledWith(false); // resta aperto
    await click(confirmButton()); await settle();
    const [first, second] = api.record.mock.calls.map(call => call[1].requestId);
    expect(second).toBe(first);

    type('#in-person-amount', '45');
    api.record.mockResolvedValueOnce({ bookingId: 'b1' });
    await click(confirmButton()); await settle();
    expect(api.record.mock.calls[2][1].requestId).not.toBe(first);
    expect(api.record.mock.calls[2][1].amountCents).toBe(4500);
  });

  it('mostra il messaggio del server (per esempio acconto PayPal in corso) senza chiudere', async () => {
    api.record.mockRejectedValueOnce(new Error('Un pagamento PayPal è in corso o già incassato: verifica prima il pagamento PayPal.'));
    mount(5000);
    await click(confirmButton()); await settle();
    expect(q('[role="alert"]')!.textContent).toContain('PayPal è in corso');
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it('senza importo suggerito parte vuoto e non e\' confermabile finche\' non lo si inserisce', () => {
    mount(null);
    expect(q<HTMLInputElement>('#in-person-amount')!.value).toBe('');
    expect(confirmButton().disabled).toBe(true);
  });
});
