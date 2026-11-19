import { describe, expect, it } from 'vitest';
import { reservationDb } from './test-helpers/reservation-db.js';
import { BookingStateChangedError, updateBookingIfStateUnchanged } from './update-if-state-unchanged.js';

// Audit 19/11/2026 punto 7: due approvazioni contemporanee della stessa prenotazione creavano due eventi.
describe('updateBookingIfStateUnchanged', () => {
  it("aggiorna se lo stato e' ancora quello letto", async () => {
    const store = reservationDb();
    store.seed('bookings/b', { stato: 'in_attesa' });
    await updateBookingIfStateUnchanged(store.db, store.db.collection('bookings').doc('b'), 'in_attesa', { stato: 'confermata', googleCalendarEventId: 'e1' });
    expect(store.value('bookings/b')).toMatchObject({ stato: 'confermata', googleCalendarEventId: 'e1' });
  });

  it("rifiuta senza sovrascrivere se nel frattempo lo stato e' cambiato o la prenotazione non esiste", async () => {
    const store = reservationDb();
    store.seed('bookings/b', { stato: 'confermata', googleCalendarEventId: 'primo' });
    await expect(updateBookingIfStateUnchanged(store.db, store.db.collection('bookings').doc('b'), 'in_attesa', { stato: 'confermata', googleCalendarEventId: 'secondo' }))
      .rejects.toBeInstanceOf(BookingStateChangedError);
    expect(store.value('bookings/b').googleCalendarEventId).toBe('primo');
    await expect(updateBookingIfStateUnchanged(store.db, store.db.collection('bookings').doc('missing'), 'in_attesa', {}))
      .rejects.toBeInstanceOf(BookingStateChangedError);
  });

  it('due approvazioni concorrenti: ne passa una sola', async () => {
    const store = reservationDb();
    store.seed('bookings/b', { stato: 'in_attesa' });
    const ref = store.db.collection('bookings').doc('b');
    const results = await Promise.allSettled([
      updateBookingIfStateUnchanged(store.db, ref, 'in_attesa', { stato: 'confermata', googleCalendarEventId: 'a' }),
      updateBookingIfStateUnchanged(store.db, ref, 'in_attesa', { stato: 'confermata', googleCalendarEventId: 'b' }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(BookingStateChangedError);
  });
});
