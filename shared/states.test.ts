import { describe, expect, it } from 'vitest';
import { BookingStato, canTransitionBooking } from './states.js';

describe('stati Booking compatibili con la cancellazione Calendar', () => {
  it('mantiene gli stati storici e modella il percorso tecnico senza migrazioni', () => {
    expect(BookingStato.ANNULLATA).toBe('annullata');
    expect(BookingStato.CANCELLATION_PENDING).toBe('cancellation_pending');
    expect(BookingStato.CANCELLATA).toBe('cancellata');
    expect(canTransitionBooking(BookingStato.CONFERMATA, BookingStato.CANCELLATION_PENDING)).toBe(true);
    expect(canTransitionBooking(BookingStato.CANCELLATION_PENDING, BookingStato.CANCELLATA)).toBe(true);
  });

  it('non permette di riaprire una prenotazione già cancellata', () => {
    expect(canTransitionBooking(BookingStato.CANCELLATA, BookingStato.CONFERMATA)).toBe(false);
    expect(canTransitionBooking(BookingStato.ANNULLATA, BookingStato.CONFERMATA)).toBe(false);
  });
});
