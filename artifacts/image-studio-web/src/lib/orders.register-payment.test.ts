import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getDocs: vi.fn(), getDoc: vi.fn(), apiRequest: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: mocks.apiRequest }));
vi.mock('@/lib/jobs', () => ({ recomputeJobAggregates: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  getDocs: mocks.getDocs, getDoc: mocks.getDoc,
  collection: vi.fn(), doc: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
  addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), Timestamp: { now: vi.fn(), fromDate: (d: Date) => d },
  serverTimestamp: vi.fn(), arrayRemove: vi.fn(), arrayUnion: vi.fn(),
}));
import { addAccontoPayment, recordSaldoPayment } from './orders';

const registered = (extra: Record<string, unknown> = {}) => Response.json({ success: true, paymentAmount: 20, transactionIndex: 0, cashMovementId: 'cash-1', ...extra });
const registerCalls = () => mocks.apiRequest.mock.calls.filter(call => /register-payment/.test(call[1]));
const notifications = () => mocks.apiRequest.mock.calls.filter(call => /payment-received-notification/.test(call[1]));

beforeEach(() => {
  mocks.apiRequest.mockReset();
  mocks.apiRequest.mockImplementation(async (_method: string, url: string) => /register-payment/.test(url) ? registered() : Response.json({ success: true }));
});

describe('registrazione pagamenti ordine: identificativo della richiesta', () => {
  it('invia sempre un identificativo, generato se non viene passato', async () => {
    await addAccontoPayment('o1', 20, 'contante');
    const body = registerCalls()[0][2];
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toMatchObject({ tipo: 'acconto', importo: 20, metodoPagamento: 'contante' });
  });

  it('usa l\'identificativo ricevuto: due invii con lo stesso valore sono lo stesso incasso', async () => {
    await addAccontoPayment('o1', 20, 'carta', undefined, new Date(), 'req-fixed-0001');
    await recordSaldoPayment('o1', 'carta', undefined, new Date(), 'req-fixed-0002');
    expect(registerCalls().map(call => call[2].requestId)).toEqual(['req-fixed-0001', 'req-fixed-0002']);
  });

  it('non rinvia l\'email al cliente se il server riconosce una ripetizione', async () => {
    mocks.apiRequest.mockImplementation(async (_m: string, url: string) => /register-payment/.test(url) ? registered({ duplicate: true }) : Response.json({ success: true }));
    await addAccontoPayment('o1', 20, 'contante', undefined, new Date(), 'req-fixed-0003');
    expect(notifications()).toHaveLength(0);
  });

  it('invia l\'email del primo incasso', async () => {
    await addAccontoPayment('o1', 20, 'contante', undefined, new Date(), 'req-fixed-0004');
    expect(notifications()).toHaveLength(1);
  });

  it('propaga l\'errore del server senza inviare email', async () => {
    mocks.apiRequest.mockImplementation(async () => Response.json({ success: false, error: 'Importo non valido' }));
    await expect(addAccontoPayment('o1', 20, 'contante')).rejects.toThrow('Importo non valido');
    expect(notifications()).toHaveLength(0);
  });
});
