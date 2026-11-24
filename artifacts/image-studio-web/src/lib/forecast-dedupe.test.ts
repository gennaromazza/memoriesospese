import { describe, expect, it } from 'vitest';
import { bookingsWithoutOrder } from './forecast-dedupe';

// Previsioni incasso: una prenotazione che ha gia' un ordine e' contata dall'ordine, non due volte.
describe('bookingsWithoutOrder', () => {
  const bookings = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('esclude le prenotazioni che hanno un ordine', () => {
    expect(bookingsWithoutOrder(bookings, [{ bookingId: 'a' }, { bookingId: 'c' }]).map(b => b.id)).toEqual(['b']);
  });
  it('senza ordini collegati le restituisce tutte', () => {
    expect(bookingsWithoutOrder(bookings, [{ bookingId: null }, {}, { bookingId: 'zzz' }]).map(b => b.id)).toEqual(['a', 'b', 'c']);
  });
  it('non modifica gli elenchi ricevuti', () => {
    const orders = [{ bookingId: 'a' }];
    bookingsWithoutOrder(bookings, orders);
    expect(bookings).toHaveLength(3);
    expect(orders).toEqual([{ bookingId: 'a' }]);
  });
  it('un ordine senza residuo conta comunque: la prenotazione non va ricontata', () => {
    // l'ordine e' la fonte di verita': se e' saldato, la prenotazione non porta altro da incassare
    expect(bookingsWithoutOrder([{ id: 'a' }], [{ bookingId: 'a', totale: 10 }]).map(b => b.id)).toEqual([]);
  });
});
