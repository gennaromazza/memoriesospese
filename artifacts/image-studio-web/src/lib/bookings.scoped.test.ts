import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({ onSnapshot: vi.fn(), getDocs: vi.fn(), where: vi.fn(), query: vi.fn(), collection: vi.fn(), orderBy: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: fs.collection, doc: vi.fn(), getDoc: vi.fn(), getDocs: fs.getDocs, onSnapshot: fs.onSnapshot,
  addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), query: fs.query, where: fs.where, orderBy: fs.orderBy,
  Timestamp: { now: vi.fn() }, serverTimestamp: vi.fn(),
}));
import { chunkCampaignIds, getBookingsForCampaigns, subscribeBookingsForCampaigns } from './bookings';

const at = (millis: number) => ({ toMillis: () => millis });
const doc = (id: string, millis: number | null) => ({ id, data: () => ({ campaignId: 'c', ...(millis === null ? {} : { dataShootingInizio: at(millis) }) }) });
const snap = (docs: any[], fromCache = false) => ({ docs, metadata: { fromCache } });
const ids = (count: number) => Array.from({ length: count }, (_, n) => `c${n}`);

beforeEach(() => {
  Object.values(fs).forEach(mock => mock.mockReset());
  fs.collection.mockReturnValue('bookings-collection');
  fs.where.mockImplementation((field, op, value) => ({ field, op, value }));
  fs.query.mockImplementation((...parts) => ({ parts }));
});

describe('chunkCampaignIds', () => {
  it('gruppi da al massimo 30 id (limite di Firestore per "in"), senza doppioni e senza vuoti', () => {
    expect(chunkCampaignIds(ids(30)).map(group => group.length)).toEqual([30]);
    expect(chunkCampaignIds(ids(31)).map(group => group.length)).toEqual([30, 1]);
    expect(chunkCampaignIds(['b', 'a', 'b', '', undefined as never])).toEqual([['a', 'b']]);
    expect(chunkCampaignIds([])).toEqual([]);
  });
});

describe('subscribeBookingsForCampaigns', () => {
  it('senza campagne non interroga Firestore e consegna subito una lista vuota', () => {
    const onUpdate = vi.fn();
    const stop = subscribeBookingsForCampaigns([], onUpdate, vi.fn());
    expect(onUpdate).toHaveBeenCalledWith([], false);
    expect(fs.onSnapshot).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });

  it('una sola interrogazione "in" sulle campagne, senza ordinamento sul server', () => {
    fs.onSnapshot.mockReturnValue(vi.fn());
    subscribeBookingsForCampaigns(['b', 'a'], vi.fn(), vi.fn());
    expect(fs.where).toHaveBeenCalledWith('campaignId', 'in', ['a', 'b']);
    expect(fs.orderBy).not.toHaveBeenCalled();
    expect(fs.onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('con piu\' gruppi aspetta che tutti rispondano, poi unisce e ordina dal più recente', () => {
    const handlers: Array<(snapshot: any) => void> = [];
    fs.onSnapshot.mockImplementation((_query, _options, next) => { handlers.push(next); return vi.fn(); });
    const onUpdate = vi.fn();
    subscribeBookingsForCampaigns(ids(31), onUpdate, vi.fn());
    expect(handlers).toHaveLength(2);
    handlers[0](snap([doc('vecchia', 1000), doc('nuova', 9000)]));
    expect(onUpdate).not.toHaveBeenCalled(); // manca ancora il secondo gruppo
    handlers[1](snap([doc('media', 5000), doc('senza-data', null)], true));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [rows, fromCache] = onUpdate.mock.calls[0];
    expect(rows.map((row: any) => row.id)).toEqual(['nuova', 'media', 'vecchia', 'senza-data']);
    expect(fromCache).toBe(true);
    // Aggiornamento in tempo reale di un solo gruppo: l'elenco unito resta coerente e riordinato.
    handlers[1](snap([doc('media', 20000), doc('senza-data', null)], false));
    const [next, nextFromCache] = onUpdate.mock.calls[1];
    expect(next.map((row: any) => row.id)).toEqual(['media', 'nuova', 'vecchia', 'senza-data']);
    expect(nextFromCache).toBe(false);
  });

  it('chiude tutti gli ascolti e inoltra gli errori', () => {
    const stops = [vi.fn(), vi.fn()];
    const errors: Array<(error: Error) => void> = [];
    fs.onSnapshot.mockImplementation((_query, _options, _next, error) => { errors.push(error); return stops[errors.length - 1]; });
    const onError = vi.fn();
    const stop = subscribeBookingsForCampaigns(ids(31), vi.fn(), onError);
    errors[1](new Error('permission-denied'));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'permission-denied' }));
    stop();
    expect(stops[0]).toHaveBeenCalled();
    expect(stops[1]).toHaveBeenCalled();
  });
});

describe('getBookingsForCampaigns', () => {
  it('legge un gruppo per volta di campagne e restituisce tutto ordinato', async () => {
    fs.getDocs.mockResolvedValueOnce(snap([doc('a', 1000)])).mockResolvedValueOnce(snap([doc('b', 3000)]));
    const rows = await getBookingsForCampaigns(ids(31));
    expect(rows.map(row => row.id)).toEqual(['b', 'a']);
    expect(fs.getDocs).toHaveBeenCalledTimes(2);
  });
  it('senza campagne non legge nulla', async () => {
    expect(await getBookingsForCampaigns([])).toEqual([]);
    expect(fs.getDocs).not.toHaveBeenCalled();
  });
});
