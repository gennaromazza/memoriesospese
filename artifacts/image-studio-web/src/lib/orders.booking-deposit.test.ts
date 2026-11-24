import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getDocs: vi.fn(), getDoc: vi.fn(), apiRequest: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: mocks.apiRequest }));
vi.mock('@/lib/jobs', () => ({ recomputeJobAggregates: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  getDocs: mocks.getDocs, getDoc: mocks.getDoc,
  collection: vi.fn(), doc: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
  addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), Timestamp: { now: vi.fn() },
  serverTimestamp: vi.fn(), arrayRemove: vi.fn(), arrayUnion: vi.fn(),
}));
import { getAllOrders, getOrderById, getOrderTotals } from './orders';

const raw = { bookingId: 'booking', totale: 20, acconto: 0, saldo: 20, prodotti: [], transactions: [] };
const credited = { ...raw, acconto: 5, saldo: 15, transactions: [{
  tipo: 'acconto', importo: 5, metodo: 'paypal', source: 'booking_paypal_deposit',
  providerTransactionId: 'CAPTURE', emailInviata: true,
}] };
const snapshot = (data: unknown) => ({ id: 'order', exists: () => true, data: () => data });
beforeEach(() => { vi.clearAllMocks(); });

describe('riepilogo ordine dopo acconto prenotazione', () => {
  it('rilegge l’ordine riconciliato prima di mostrare pagato e saldo', async () => {
    mocks.getDocs.mockResolvedValueOnce({ docs: [snapshot(raw)] }).mockResolvedValueOnce({ docs: [snapshot(credited)] });
    mocks.apiRequest.mockResolvedValue(Response.json({ updated: 1 }));
    const [order] = await getAllOrders();
    expect(mocks.apiRequest).toHaveBeenCalledWith('POST', '/api/orders/reconcile-booking-deposits', { orderIds: ['order'] });
    expect(getOrderTotals(order)).toMatchObject({ totale: 20, totalePagato: 5, saldoResiduo: 15 });
    expect(order.transactions[0].source).toBe('booking_paypal_deposit');
  });

  it('usa gli stessi importi nella lettura singola e nell’email dell’ordine', async () => {
    mocks.getDoc.mockResolvedValueOnce(snapshot(raw)).mockResolvedValueOnce(snapshot(credited));
    mocks.apiRequest.mockResolvedValue(Response.json({ updated: 1 }));
    expect(getOrderTotals((await getOrderById('order'))!)).toMatchObject({ totalePagato: 5, saldoResiduo: 15 });
  });

  it('non riconcilia ordini senza prenotazione né ordini degli shop', async () => {
    mocks.getDocs.mockResolvedValue({ docs: [snapshot({ ...raw, bookingId: null }), {
      ...snapshot({ ...raw, orderType: 'print_shop' }), id: 'shop',
    }] });
    expect(await getAllOrders()).toHaveLength(1);
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });

  it('non mostra falsamente zero pagato quando la riconciliazione fallisce', async () => {
    mocks.getDocs.mockResolvedValue({ docs: [snapshot(raw)] });
    mocks.apiRequest.mockRejectedValue(new Error('Ricevuta da verificare'));
    await expect(getAllOrders()).rejects.toThrow('Ricevuta da verificare');
  });

  it('ripete la lettura dopo un errore e rilegge gli importi soltanto dopo la verifica', async () => {
    mocks.getDocs.mockResolvedValueOnce({ docs: [snapshot(raw)] })
      .mockResolvedValueOnce({ docs: [snapshot(raw)] })
      .mockResolvedValueOnce({ docs: [snapshot(credited)] });
    mocks.apiRequest.mockRejectedValueOnce(new Error('Servizio non disponibile'))
      .mockResolvedValueOnce(Response.json({ updated: 1 }));
    await expect(getAllOrders()).rejects.toThrow('Servizio non disponibile');
    const [order] = await getAllOrders();
    expect(getOrderTotals(order)).toMatchObject({ totalePagato: 5, saldoResiduo: 15 });
    expect(mocks.apiRequest).toHaveBeenCalledTimes(2);
    expect(mocks.getDocs).toHaveBeenCalledTimes(3);
  });

  it('non restituisce importi se fallisce la rilettura successiva alla riconciliazione', async () => {
    mocks.getDocs.mockResolvedValueOnce({ docs: [snapshot(raw)] })
      .mockRejectedValueOnce(new Error('Lettura importi non disponibile'));
    mocks.apiRequest.mockResolvedValue(Response.json({ updated: 1 }));
    await expect(getAllOrders()).rejects.toThrow('Lettura importi non disponibile');
  });

  it('rilegge anche quando un’altra richiesta ha già riconciliato lo stesso ordine', async () => {
    mocks.getDocs.mockResolvedValueOnce({ docs: [snapshot(raw)] })
      .mockResolvedValueOnce({ docs: [snapshot(credited)] });
    mocks.apiRequest.mockResolvedValue(Response.json({ updated: 0 }));
    const [order] = await getAllOrders();
    expect(getOrderTotals(order)).toMatchObject({ totalePagato: 5, saldoResiduo: 15 });
    expect(mocks.getDocs).toHaveBeenCalledTimes(2);
  });

  it.each([{}, null, { updated: '1' }, { updated: -1 }, { updated: 2 }])(
    'non considera verificati gli importi con una risposta incompleta %j', async result => {
      mocks.getDocs.mockResolvedValue({ docs: [snapshot(raw)] });
      mocks.apiRequest.mockResolvedValue(Response.json(result));
      await expect(getAllOrders()).rejects.toThrow('risposta del server non valida');
    });
});
