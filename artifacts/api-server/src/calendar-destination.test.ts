import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ stored: null as any, writes: vi.fn(), queue: Promise.resolve() }));
vi.mock('./firebase-admin.js', () => ({
  db: {
    collection: () => ({ doc: () => ({ get: async () => ({ data: () => h.stored }) }) }),
    runTransaction: (fn: any) => {
      const next = h.queue.then(() => fn({
        get: async () => ({ data: () => h.stored }),
        set: (_ref: any, data: any) => { h.stored = data; h.writes(data); },
      }));
      h.queue = next.catch(() => {});
      return next;
    },
  },
}));
import { confirmStudioCalendarId, getStudioCalendarId } from './calendar-destination.js';

beforeEach(() => { vi.stubEnv('GOOGLE_CALENDAR_ID', ''); h.stored = null; h.writes.mockReset(); h.queue = Promise.resolve(); });
afterEach(() => vi.unstubAllEnvs());

describe('destinazione del calendario protetta', () => {
  it('non sceglie automaticamente un calendario mancante', async () => {
    expect(await getStudioCalendarId()).toBeNull();
    expect(h.writes).not.toHaveBeenCalled();
  });
  it('salva la scelta confermata e la rilegge senza cambiare segreti', async () => {
    await confirmStudioCalendarId('studio@example.test', 'admin@test');
    expect(await getStudioCalendarId()).toBe('studio@example.test');
    expect(process.env.GOOGLE_CALENDAR_ID).toBe('');
    expect(h.writes).toHaveBeenCalledTimes(1);
    await confirmStudioCalendarId('studio@example.test', 'admin@test');
    expect(h.writes).toHaveBeenCalledTimes(1);
  });
  it('non sostituisce una destinazione salvata', async () => {
    h.stored = { calendarId: 'old@example.test' };
    await expect(confirmStudioCalendarId('new@example.test', 'admin@test')).rejects.toThrow('non può sostituirlo');
    expect(h.writes).not.toHaveBeenCalled();
  });
  it('rispetta la destinazione del deployment anche se non accessibile', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_ID', 'original@example.test');
    expect(await getStudioCalendarId()).toBe('original@example.test');
    await expect(confirmStudioCalendarId('new@example.test', 'admin@test')).rejects.toThrow();
    expect(h.writes).not.toHaveBeenCalled();
  });
  it('non permette a due conferme concorrenti di cambiare destinazione', async () => {
    const results = await Promise.allSettled([
      confirmStudioCalendarId('first@example.test', 'admin1@test'),
      confirmStudioCalendarId('second@example.test', 'admin2@test'),
    ]);
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(await getStudioCalendarId()).toBe('first@example.test');
  });
});
