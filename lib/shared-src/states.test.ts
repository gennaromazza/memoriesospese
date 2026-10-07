import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATO_COLORS,
  BOOKING_STATO_LABELS,
  BookingStato,
  canTransitionBooking,
} from './states.js';

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

  it('espone badge completi anche per gli stati tecnici', () => {
    expect(BOOKING_STATO_COLORS[BookingStato.CANCELLATION_PENDING]).toBe('bg-orange-500 text-white');
    expect(BOOKING_STATO_COLORS[BookingStato.CANCELLATA]).toBe('bg-gray-500 text-white');
    expect(BOOKING_STATO_LABELS[BookingStato.CANCELLATION_PENDING]).toBe('Cancellazione in corso');
    expect(BOOKING_STATO_LABELS[BookingStato.CANCELLATA]).toBe('Cancellata');
  });
});
