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
import {
  findOrdersNeedingDepositReconciliation, getAllOrders, getAllOrdersUnreconciled,
  reconcileBookingDepositsForOrders,
} from './orders';

const paid = (extra: Record<string, unknown> = {}) => ({
  provider: 'paypal', status: 'paid', currency: 'EUR', amountCents: 500, paypalCaptureId: 'CAPTURE', ...extra,
});
const credit = (extra: Record<string, unknown> = {}) => ({
  tipo: 'acconto', importo: 5, metodo: 'paypal', source: 'booking_paypal_deposit', providerTransactionId: 'CAPTURE', ...extra,
});
const order = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, bookingId: `b-${id}`, totale: 20, transactions: [], ...extra }) as any;
const booking = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id: `b-${id}`, depositPayment: paid(), ...extra }) as any;
const snapshot = (id: string, data: unknown) => ({ id, exists: () => true, data: () => data });

beforeEach(() => { mocks.getDocs.mockReset(); mocks.getDoc.mockReset(); mocks.apiRequest.mockReset(); });

describe('findOrdersNeedingDepositReconciliation', () => {
  it('seleziona solo gli ordini con acconto PayPal pagato non ancora copiato', () => {
    const orders = [
      order('missing'),
      order('done', { transactions: [credit()] }),
      order('nobooking', { bookingId: null }),
      order('unpaid'),
      order('shop', { orderType: 'print_shop' }),
    ];
    const bookings = [booking('missing'), booking('done'), booking('unpaid', { depositPayment: paid({ status: 'pending' }) }),
      booking('shop')];
    expect(findOrdersNeedingDepositReconciliation(orders, bookings)).toEqual(['missing']);
  });

  it('ignora gli ordini la cui prenotazione non e\' stata caricata o non ha acconto', () => {
    expect(findOrdersNeedingDepositReconciliation([order('a'), order('b')], [booking('b', { depositPayment: undefined })])).toEqual([]);
  });

  it('riconosce una ricevuta con importo sbagliato e un rimborso non ancora riportato', () => {
    const orders = [order('wrong', { transactions: [credit({ importo: 4 })] }), order('refund', { transactions: [credit()] }),
      order('refund-ok', { transactions: [credit({ importo: 0 })] })];
    const bookings = [booking('wrong'), booking('refund', { bookingRefund: { status: 'completed' } }),
      booking('refund-ok', { bookingRefund: { status: 'completed' } })];
    expect(findOrdersNeedingDepositReconciliation(orders, bookings)).toEqual(['wrong', 'refund']);
  });

  it('ritiene da verificare un acconto presente due volte o con altra capture', () => {
    const orders = [order('dup', { transactions: [credit(), credit()] }),
      order('other', { transactions: [credit({ providerTransactionId: 'OLD' })] })];
    expect(findOrdersNeedingDepositReconciliation(orders, [booking('dup'), booking('other')])).toEqual(['dup', 'other']);
  });
});

describe('acconto incassato di persona', () => {
  const inPerson = (extra: Record<string, unknown> = {}) => ({ provider: 'in_person', status: 'paid', amountCents: 2000, receiptId: 'rcpt-1', ...extra });
  const line = (extra: Record<string, unknown> = {}) => ({ tipo: 'acconto', importo: 20, source: 'booking_in_person_deposit', receiptId: 'rcpt-1', ...extra });

  it('seleziona l\'ordine se la riga dell\'acconto di persona non e\' ancora stata copiata', () => {
    expect(findOrdersNeedingDepositReconciliation([order('a')], [booking('a', { depositPayment: inPerson() })])).toEqual(['a']);
  });
  it('non seleziona un ordine gia\' a posto', () => {
    expect(findOrdersNeedingDepositReconciliation([order('a', { transactions: [line()] })], [booking('a', { depositPayment: inPerson() })])).toEqual([]);
  });
  it('riconosce importo o ricevuta diversi e righe duplicate', () => {
    const orders = [order('wrong', { transactions: [line({ importo: 15 })] }), order('other', { transactions: [line({ receiptId: 'old' })] }),
      order('dup', { transactions: [line(), line()] })];
    const bookings = ['wrong', 'other', 'dup'].map(id => booking(id, { depositPayment: inPerson() }));
    expect(findOrdersNeedingDepositReconciliation(orders, bookings)).toEqual(['wrong', 'other', 'dup']);
  });
  it('ignora ricevute di persona non valide o non pagate', () => {
    const bookings = [booking('a', { depositPayment: inPerson({ receiptId: undefined }) }), booking('b', { depositPayment: inPerson({ status: 'pending' }) }),
      booking('c', { depositPayment: inPerson({ amountCents: 0 }) })];
    expect(findOrdersNeedingDepositReconciliation([order('a'), order('b'), order('c')], bookings)).toEqual([]);
  });
});

describe('getAllOrdersUnreconciled', () => {
  it('legge una sola volta, senza chiamare il server', async () => {
    mocks.getDocs.mockResolvedValue({ docs: [snapshot('o1', { bookingId: 'b', totale: 10, prodotti: [], transactions: [] }),
      snapshot('shop', { orderType: 'shop', totale: 1 })] });
    const orders = await getAllOrdersUnreconciled();
    expect(orders.map(o => o.id)).toEqual(['o1']);
    expect(mocks.getDocs).toHaveBeenCalledTimes(1);
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });
});

describe('reconcileBookingDepositsForOrders', () => {
  it('invia gli ordini a gruppi di 50 con un timeout', async () => {
    mocks.apiRequest.mockImplementation(async (_m, _u, body) => Response.json({ updated: body.orderIds.length }));
    const ids = Array.from({ length: 120 }, (_, n) => `o${n}`);
    const result = await reconcileBookingDepositsForOrders(ids);
    expect(result).toEqual({ updated: 120, failedIds: [] });
    expect(mocks.apiRequest).toHaveBeenCalledTimes(3);
    expect(mocks.apiRequest.mock.calls[0][3]).toEqual({ signal: expect.any(AbortSignal) });
  });

  it('un gruppo in errore o scaduto non impedisce gli altri e segna i suoi ordini come falliti', async () => {
    mocks.apiRequest
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(Response.json({ updated: 1 }));
    const ids = Array.from({ length: 60 }, (_, n) => `o${n}`);
    const result = await reconcileBookingDepositsForOrders(ids);
    expect(result.updated).toBe(1);
    expect(result.failedIds).toEqual(ids.slice(0, 50));
  });

  it('riporta come falliti gli ordini indicati dal server in una risposta parziale', async () => {
    mocks.apiRequest.mockResolvedValue(Response.json({ updated: 1, failed: ['bad', 'unknown'] }));
    const result = await reconcileBookingDepositsForOrders(['ok', 'bad']);
    expect(result).toEqual({ updated: 1, failedIds: ['bad'] });
  });

  it('tratta come fallita una risposta incompleta', async () => {
    mocks.apiRequest.mockResolvedValue(Response.json({ updated: 'x' }));
    expect(await reconcileBookingDepositsForOrders(['a'])).toEqual({ updated: 0, failedIds: ['a'] });
  });
});

describe('getAllOrders resta fail-closed per gli altri schermi', () => {
  it('rifiuta se il server segnala ordini non verificati', async () => {
    mocks.getDocs.mockResolvedValue({ docs: [snapshot('order', { bookingId: 'b', totale: 20, prodotti: [], transactions: [] })] });
    mocks.apiRequest.mockResolvedValue(Response.json({ updated: 0, failed: ['order'] }));
    await expect(getAllOrders()).rejects.toThrow('non verificabili');
  });
});
