/**
 * Previsioni incasso: se una prenotazione ha gia' un ordine, il residuo viene dall'ordine.
 * Contare anche la prenotazione conterebbe due volte lo stesso lavoro.
 */
export function bookingsWithoutOrder<B extends { id?: string }>(
  bookings: B[], orders: Array<{ bookingId?: string | null }>,
): B[] {
  const covered = new Set(orders.map((order) => order.bookingId).filter((id): id is string => !!id));
  return bookings.filter((booking) => !booking.id || !covered.has(booking.id));
}
