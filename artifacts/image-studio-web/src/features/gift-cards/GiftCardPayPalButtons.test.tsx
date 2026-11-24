// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GiftCardPayPalButtons } from './GiftCardPayPalButtons';

afterEach(() => { cleanup(); document.querySelector('script[data-gift-card-paypal="true"]')?.remove(); });
it('notifica al checkout anche il mancato caricamento dello SDK, senza dichiarare falsamente assenza di addebiti', async () => {
  const error = vi.fn();
  render(<GiftCardPayPalButtons config={{ enabled: true, clientId: 'test-sdk', currency: 'EUR' }}
    enabled createOrder={vi.fn()} onApprove={vi.fn()} onError={error} />);
  const script = document.querySelector('script[data-gift-card-paypal="true"]')!;
  fireEvent.error(script);
  await waitFor(() => expect(error).toHaveBeenCalledOnce());
  expect((await screen.findByRole('alert')).textContent).toContain('Impossibile collegarsi');
  expect(error.mock.calls[0][0]).not.toContain('Non è stato addebitato nulla');
});
