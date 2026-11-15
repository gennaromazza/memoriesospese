import type { Firestore, Transaction } from 'firebase-admin/firestore';
/** Late immediate captures intentionally have no booking: their private checkout is the financial owner. */
export async function refundSource(db: Firestore, tx: Transaction, id: string, kind?: string) {
  const rootRef = db.collection('bookings').doc(id), holdRef = db.collection('bookingCheckoutHolds').doc(id);
  const [root, hold] = await Promise.all([tx.get(rootRef), tx.get(holdRef)]);
  if (kind !== 'checkout' && root.exists) return { data: root.data()!, ref: rootRef, kind: 'booking' };
  if (kind !== 'booking' && hold.data()?.depositPayment?.status === 'paid_action_required') {
    const data = hold.data()!;
    return { data: { ...data, cliente: data.draft?.cliente, stato: 'annullata' }, ref: holdRef, kind: 'checkout' };
  }
  return null;
}
