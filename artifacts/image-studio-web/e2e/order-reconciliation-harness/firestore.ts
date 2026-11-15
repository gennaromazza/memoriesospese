// Only this in-memory/browser-local store is available to the real orders client.
export const db = {};
export class Timestamp {
  constructor(private millis: number) {}
  static now() { return new Timestamp(Date.now()); }
  static fromDate(date: Date) { return new Timestamp(date.getTime()); }
  toDate() { return new Date(this.millis); }
}
const key = 'order-reconciliation-fixture';
export const initialOrder = { bookingId: 'booking', totale: 20, acconto: 0, saldo: 20,
  prodotti: [{ prodottoId: 'print', prodottoNome: 'Stampa prova', prodottoPrezzo: 20, quantita: 1 }],
  transactions: [], nomeCliente: 'Cliente Fittizio', stato: 'bozza' };
export function readOrder() { return JSON.parse(localStorage.getItem(key) || JSON.stringify(initialOrder)); }
export function saveOrder(order: unknown) { localStorage.setItem(key, JSON.stringify(order)); }
export const collection = (..._args: unknown[]) => ({});
export const doc = (..._args: unknown[]) => ({});
export const query = (..._args: unknown[]) => ({});
export const where = (..._args: unknown[]) => ({});
export const orderBy = (..._args: unknown[]) => ({});
export const getDocs = async () => {
  if (localStorage.getItem('fail-order-read') === 'yes') throw new Error('Lettura fixture non disponibile');
  return { docs: [{ id: 'order', data: () => ({ ...readOrder(), createdAt: Timestamp.now(),
    transactions: readOrder().transactions.map((line: object) => ({ ...line, data: Timestamp.now() })),
  }) }] };
};
export const getDoc = async () => ({ ...(await getDocs()).docs[0], exists: () => true });
const forbidden = () => { throw new Error('Scrittura non consentita nel test di riconciliazione'); };
export const addDoc = forbidden, updateDoc = forbidden, deleteDoc = forbidden;
export const serverTimestamp = forbidden, arrayRemove = forbidden, arrayUnion = forbidden;
