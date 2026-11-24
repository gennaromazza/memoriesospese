import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ list: vi.fn(), status: vi.fn() }));
vi.mock('../google-calendar.js', () => ({
  getGoogleCalendarClient: async () => ({ events: { list: h.list } }),
  getCalendarConnectionStatus: h.status, getEventById: vi.fn(), createEvent: vi.fn(), deleteEvent: vi.fn(),
}));
import { recoveryCalendar } from './calendar-recovery-google.js';
beforeEach(() => { h.list.mockReset(); h.status.mockReset(); });
it('legge tutte le pagine prima di poter dichiarare libero lo slot', async () => {
  h.list.mockResolvedValueOnce({ data: { items: [{ id: 'a' }], nextPageToken: 'next' } })
    .mockResolvedValueOnce({ data: { items: [{ id: 'b' }] } });
  expect(await recoveryCalendar.scan('calendar', new Date(0), new Date(1000))).toEqual([{ id: 'a' }, { id: 'b' }]);
  expect(h.list.mock.calls[1][0].pageToken).toBe('next');
  expect(h.list.mock.calls[0][1]).toEqual({ timeout: 15000 });
});
it('un errore alla seconda pagina non restituisce un risultato parziale', async () => {
  h.list.mockResolvedValueOnce({ data: { items: [], nextPageToken: 'next' } }).mockRejectedValueOnce(new Error('Google 503'));
  await expect(recoveryCalendar.scan('calendar', new Date(0), new Date(1000))).rejects.toThrow('Google 503');
});
it('un token ripetuto interrompe la scansione invece di dichiararla completa', async () => {
  h.list.mockResolvedValue({ data: { items: [], nextPageToken: 'same' } });
  await expect(recoveryCalendar.scan('calendar', new Date(0), new Date(1000))).rejects.toThrow('incompleta');
});
it('senza destinazione verificata non usa primary né scrive eventi di prova', async () => {
  h.status.mockResolvedValue({ connected: false, error: 'Collega il calendario' });
  await expect(recoveryCalendar.target()).rejects.toThrow('Collega il calendario');
  expect(h.list).not.toHaveBeenCalled();
});
it('verifica anche i permessi del calendario salvato nella prenotazione', async () => {
  h.list.mockResolvedValue({ data: { accessRole: 'reader' } });
  await expect(recoveryCalendar.target('saved-calendar')).rejects.toThrow('permessi');
  expect(h.list.mock.calls[0][0].calendarId).toBe('saved-calendar');
});
