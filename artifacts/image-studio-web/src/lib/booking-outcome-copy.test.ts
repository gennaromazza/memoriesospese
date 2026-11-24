import { describe, expect, it } from 'vitest';
import { pendingBookingNextStep } from './booking-outcome-copy';

// Dopo l'invio di una richiesta il cliente deve sapere cosa succede dopo, soprattutto se dovra' pagare.
describe('pendingBookingNextStep', () => {
  it('richiesta con approvazione e acconto: spiega email col link, importo, un\'ora e conferma solo dopo il pagamento', () => {
    const text = pendingBookingNextStep({ requiresDepositAfterApproval: true, depositAmountCents: 5000 });
    expect(text).toContain('email');
    expect(text).toContain('link');
    expect(text).toMatch(/50,00\s*€/);
    expect(text).toContain('un’ora');
    expect(text).toContain('solo dopo il pagamento');
    expect(text).toContain('spam');
  });

  it('senza importo valido non inventa una cifra', () => {
    for (const cents of [undefined, null, 0, -5, 12.5]) {
      const text = pendingBookingNextStep({ requiresDepositAfterApproval: true, depositAmountCents: cents as any });
      expect(text).toContain('acconto');
      expect(text).not.toMatch(/\d+,\d{2}\s*€/);
    }
  });

  it('senza acconto resta il messaggio di sola approvazione', () => {
    const text = pendingBookingNextStep({ requiresDepositAfterApproval: false, depositAmountCents: 5000 });
    expect(text).toBe('La conferma definitiva arriverà via email solo dopo l’approvazione. Controlla anche la cartella spam.');
    expect(text).not.toContain('link');
  });
});
