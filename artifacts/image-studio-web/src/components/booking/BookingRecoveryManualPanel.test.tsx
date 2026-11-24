// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BookingCampaignFE } from '@shared/booking-types';

const api = vi.hoisted(() => ({ preview: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/bookings', () => ({
  previewManualBookingRecovery: api.preview,
  sendManualBookingRecovery: api.send,
}));
import { BookingRecoveryManualPanel } from './BookingRecoveryManualPanel';

const campaign = {
  id: 'spring', nome: 'Primavera', attiva: true, richiedeAcconto: true,
} as BookingCampaignFE;
const preview = {
  campaignId: 'spring',
  eligible: [
    { bookingId: 'one', name: 'Ada Rossi', email: 'ada@example.test', eligible: true },
    { bookingId: 'two', name: 'Luca Bianchi', email: 'luca@example.test', eligible: true },
  ],
  excluded: [
    { bookingId: 'three', name: 'Marta Verdi', email: 'marta@example.test',
      eligible: false, reason: 'pagamento_o_modifica_da_verificare' },
  ],
};
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  vi.clearAllMocks();
  api.preview.mockResolvedValue(preview);
  api.send.mockResolvedValue({ outcomes: [{ bookingId: 'one', status: 'sent' }] });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

it('shows invitees and exclusions before the explicit send confirmation', async () => {
  render(<BookingRecoveryManualPanel campaigns={[campaign]} allowSending />);
  fireEvent.click(screen.getByTestId('button-manual-booking-recovery'));
  fireEvent.click(screen.getByRole('combobox', { name: 'Campagna' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Primavera' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mostra destinatari' }));

  expect(await screen.findByText('Destinatari idonei (2)')).toBeTruthy();
  expect(screen.getByText('Esclusi (1)')).toBeTruthy();
  expect(screen.getByText('Pagamento o modifica da verificare')).toBeTruthy();
  expect(api.send).not.toHaveBeenCalled();

  const confirm = screen.getByRole('button', { name: /Conferma invio/ });
  expect((confirm as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Seleziona Ada Rossi' }));
  expect(screen.getByText('Selezionati: 1')).toBeTruthy();
  expect((confirm as HTMLButtonElement).disabled).toBe(false);
  if ((confirm as HTMLButtonElement).disabled) {
    expect(screen.getByText(/In sviluppo puoi verificare l’anteprima/)).toBeTruthy();
    return;
  }
  fireEvent.click(confirm);
  expect(await screen.findByRole('alertdialog')).toBeTruthy();
  expect(screen.getByText(/Verranno contattati 1 destinatari selezionati/)).toBeTruthy();
  expect(api.send).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Invia email' }));
  await waitFor(() => expect(api.send).toHaveBeenCalledWith('spring', ['one']));
  expect(await screen.findByText('Inviata')).toBeTruthy();
});

it('disables the real-send action in development', () => {
  render(<BookingRecoveryManualPanel campaigns={[campaign]} />);
  fireEvent.click(screen.getByTestId('button-manual-booking-recovery'));
  expect(screen.getByText(/In sviluppo puoi verificare l’anteprima/)).toBeTruthy();
});
