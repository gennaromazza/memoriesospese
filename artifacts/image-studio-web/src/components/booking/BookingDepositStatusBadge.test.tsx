import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BookingDepositStatusBadge, bookingDepositStatusLabel } from './BookingDepositStatusBadge';

describe('badge acconto prenotazione', () => {
  it('segnala il pagamento in studio senza confonderlo con un esonero', () => {
    const booking = {
      depositWaiver: { reason: 'admin_status_confirmation' as const, waivedBy: 'admin', waivedAt: {} as never },
      acconto: 0,
      saldo: 50,
      transactions: [],
    };
    const markup = renderToStaticMarkup(<BookingDepositStatusBadge booking={booking} />);

    expect(markup).toContain('Acconto da pagare in studio');
    expect(markup).toContain('Non è stato registrato alcun incasso');
    expect(booking.acconto).toBe(0);
    expect(booking.saldo).toBe(50);
    expect(booking.transactions).toEqual([]);
  });

  it('mostra il pagamento online solo con ricevuta verificabile', () => {
    const booking = {
      depositPayment: { provider: 'paypal', status: 'paid', amountCents: 2500,
        currency: 'EUR', paypalCaptureId: 'CAPTURE-1', paidAt: {} as never },
    } as const;
    expect(bookingDepositStatusLabel(booking)).toBe('Acconto pagato online');
    expect(renderToStaticMarkup(<BookingDepositStatusBadge booking={booking} />)).toContain('Acconto pagato online');
  });

  it('non aggiunge badge alle prenotazioni storiche senza richiesta o pagamento', () => {
    expect(renderToStaticMarkup(<BookingDepositStatusBadge booking={{}} />)).toBe('');
    expect(bookingDepositStatusLabel({
      depositPayment: { provider: 'paypal', status: 'paid', amountCents: 2500,
        currency: 'EUR', paidAt: {} as never },
    })).toBeNull();
  });
});
