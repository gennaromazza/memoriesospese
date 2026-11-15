// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductPasskeyRecovery } from './ProductPasskeyRecovery';

const { verify } = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('@/lib/admin-passkey', () => ({ AdminPasskeyClient: { verify } }));

afterEach(() => cleanup());
beforeEach(() => verify.mockReset());

describe('ripresa passkey nel modulo prodotto', () => {
  it('dopo la verifica riuscita lascia i dati intatti e richiede un salvataggio manuale', async () => {
    verify.mockResolvedValue(1);
    const onSave = vi.fn();
    render(
      <div>
        <input aria-label="Nome prodotto" defaultValue="Tela famiglia" />
        <ProductPasskeyRecovery />
        <button type="button" onClick={onSave}>Salva Modifiche</button>
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: /verifica di nuovo la passkey/i }));
    await screen.findByText(/premi “Salva Modifiche”/i);

    expect((screen.getByLabelText('Nome prodotto') as HTMLInputElement).value).toBe('Tela famiglia');
    expect(verify).toHaveBeenCalledOnce();
    expect(screen.getByText(/non è stato ritentato automaticamente/i)).not.toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Salva Modifiche' }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('se la richiesta passkey viene annullata conserva il form e consente di riprovare', async () => {
    const cancelled = Object.assign(new Error('Not allowed'), { name: 'NotAllowedError' });
    verify.mockRejectedValueOnce(cancelled).mockResolvedValueOnce(1);
    render(
      <div>
        <input aria-label="Nome prodotto" defaultValue="Tela famiglia" />
        <ProductPasskeyRecovery />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: /verifica di nuovo la passkey/i }));
    await screen.findByText(/Verifica annullata/i);
    expect((screen.getByLabelText('Nome prodotto') as HTMLInputElement).value).toBe('Tela famiglia');

    fireEvent.click(screen.getByRole('button', { name: /verifica di nuovo la passkey/i }));
    await screen.findByText(/premi “Salva Modifiche”/i);
    expect((screen.getByLabelText('Nome prodotto') as HTMLInputElement).value).toBe('Tela famiglia');
    expect(verify).toHaveBeenCalledTimes(2);
  });
});
