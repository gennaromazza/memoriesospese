import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { deferredFixture, testAdmin, testCustomer } from './deferred-payment.test-fixtures.js';

describe('Explicit deferred print payments', () => {
  it('authorizes atomically with audit, no receipts, and redacts private authorization from customers', async () => {
    const f = await deferredFixture();
    await Promise.all([f.authorize(), f.authorize()]);
    const order = f.db.value(`orders/${f.orderId}`);
    expect(order.payment).toMatchObject({ status: 'deferred', method: 'pay_on_delivery', collectedCents: 0,
      dueCents: f.quote.totals.totalCents, deferredAuthorization: { by: testAdmin } });
    expect(order.fulfillment.history).toHaveLength(1);
    expect(order.transactions).toEqual([]);
    expect(order.acconto).toBe(0);
    expect(f.db.countCollection('cashMovements')).toBe(0);
    expect(f.messages).toHaveLength(2);
    expect(f.messages[0].subject).toContain('pagamento da completare');
    expect(f.messages[1].subject).toContain('Ordine confermato');
    expect(f.messages[1].html).not.toContain('Totale pagato');
    const publicOrder = await f.service.ownerOrder(testCustomer, f.orderId);
    expect(publicOrder.payment.deferredAuthorization.by).toBeUndefined();
    expect(publicOrder.payment.deferredAuthorization.note).toBeUndefined();
    expect(publicOrder.payment.dueCents).toBe(f.quote.totals.totalCents);
  });

  it.each(['incomplete', 'missing_file', 'purged', 'expired', 'capture', 'refund', 'armed_lifecycle', 'orphan_cash', 'orphan_refund'])(
    'refuses unsafe authorization/restoration: %s without partial writes', async (reason) => {
      const f = await deferredFixture();
      const ref = f.db.collection('orders').doc(f.orderId);
      if (reason === 'incomplete') await ref.update({ 'printShop.items': [] });
      if (reason === 'missing_file') f.storage.files.delete(f.path);
      if (reason === 'purged') await ref.update({ 'retention.status': 'purged' });
      if (reason === 'expired') await ref.update({ 'retention.deleteAfter': Timestamp.fromMillis(1) });
      if (reason === 'capture') await ref.update({ 'payment.captureStatus': 'capturing', 'payment.captureClaimToken': 'claimed' });
      if (reason === 'refund') await ref.update({ 'payment.refundedCents': 1 });
      if (reason === 'orphan_cash') f.db.seed('cashMovements/orphan', { orderId: f.orderId, importo: 1 });
      if (reason === 'orphan_refund') f.db.seed('printShopPaymentRefunds/orphan', { orderId: f.orderId, amountCents: 1 });
      if (reason === 'armed_lifecycle') f.storage.files.get(f.path)!.metadata = { customTime: '2026-01-01T00:00:00Z' };
      const before = f.db.value(`orders/${f.orderId}`);
      await expect(f.authorize()).rejects.toMatchObject({ status: 409 });
      expect(f.db.value(`orders/${f.orderId}`)).toEqual(before);
      await ref.update({ 'fulfillment.status': 'cancelled' });
      await expect(f.service.restoreDeferredCandidate(f.orderId, testAdmin, { note: 'Restore', confirmed: true }))
        .rejects.toMatchObject({ status: 409 });
      expect(f.db.value(`orders/${f.orderId}`).fulfillment.status).toBe('cancelled');
    },
  );

  it('requires separate explicit restoration and rechecks files after restoration', async () => {
    const f = await deferredFixture();
    await f.db.collection('orders').doc(f.orderId).update({ 'fulfillment.status': 'cancelled' });
    await expect(f.authorize()).rejects.toMatchObject({ code: 'restore_required' });
    await f.service.restoreDeferredCandidate(f.orderId, testAdmin, { note: 'Safe restored original', confirmed: true });
    expect(f.db.value(`orders/${f.orderId}`).payment.status).toBe('pending');
    expect(f.db.value(`orders/${f.orderId}`).fulfillment.status).toBe('awaiting_payment');
    f.storage.files.delete(f.path);
    await expect(f.authorize()).rejects.toMatchObject({ code: 'originals_unavailable' });
  });

  it('validates the immutable finalized snapshot independently of Firestore map key ordering', async () => {
    const f = await deferredFixture();
    const reorder = (value: any): any => {
      if (Array.isArray(value)) return value.map(reorder);
      if (!value || typeof value !== 'object' || value.toDate) return value;
      return Object.fromEntries(Object.keys(value).sort().reverse().map(key => [key, reorder(value[key])]));
    };
    const ref = f.db.collection('orders').doc(f.orderId);
    await ref.update({ 'printShop.items': reorder(f.db.value(`orders/${f.orderId}`).printShop.items),
      totals: reorder(f.quote.totals) });
    await expect(f.authorize()).resolves.toMatchObject({ payment: { status: 'deferred' } });
    const other = await deferredFixture();
    const items = other.db.value(`orders/${other.orderId}`).printShop.items;
    items[0].productName = 'Altered frozen snapshot';
    await other.db.collection('orders').doc(other.orderId).update({ 'printShop.items': items });
    await expect(other.authorize()).rejects.toMatchObject({ code: 'order_incomplete' });
  });

  it('preserves delivered lifecycle/retention when PayPal really captures later', async () => {
    const f = await deferredFixture();
    await f.authorize();
    const ref = f.db.collection('orders').doc(f.orderId);
    const deleteAfter = Timestamp.fromMillis(Date.UTC(2027, 0, 1));
    await ref.update({ 'fulfillment.status': 'delivered', stato: 'completato',
      retention: { status: 'scheduled', reason: 'delivered', deleteAfter } });
    await f.service.paypalWebhook({}, f.event());
    expect(f.db.value(`orders/${f.orderId}`)).toMatchObject({
      payment: { status: 'paid' }, fulfillment: { status: 'delivered' },
      retention: { status: 'scheduled', reason: 'delivered', deleteAfter }, stato: 'completato',
    });
  });

  it('keeps unapproved orders blocked; approved orders pass lab worker, retries, delivery and retention without receipt', async () => {
    const f = await deferredFixture();
    await expect(f.service.createLabShipment(f.orderId, { labId: 'lab_test' }, testAdmin))
      .rejects.toMatchObject({ code: 'payment_required' });
    await f.authorize();
    await f.service.updateAdminStatus(f.orderId, 'ready_to_print', testAdmin);
    const shipment = await f.service.createLabShipment(f.orderId, { labId: 'lab_test' }, testAdmin);
    await f.service.transferLabShipment(shipment.id);
    await f.service.transferLabShipment(shipment.id);
    await f.service.sendLabShipment(f.orderId, shipment.id, {}, testAdmin);
    await f.service.updateAdminStatus(f.orderId, 'ready_for_pickup', testAdmin);
    expect(f.messages.at(-1)!.html).toContain('Pagamento alla consegna — da incassare');
    expect(f.messages.at(-1)!.html).not.toContain('Totale pagato');
    await f.service.updateAdminStatus(f.orderId, 'delivered', testAdmin);
    expect(f.db.value(`orders/${f.orderId}`).payment.status).toBe('deferred');
    expect(f.db.countCollection('cashMovements')).toBe(0);
  });

  it('preserves active lab and DPA checks after authorization', async () => {
    const f = await deferredFixture();
    await f.authorize();
    await f.db.collection('labs').doc('lab_test').update({ attivo: false });
    await expect(f.service.createLabShipment(f.orderId, { labId: 'lab_test' }, testAdmin))
      .rejects.toMatchObject({ code: 'lab_not_found' });
    await f.db.collection('labs').doc('lab_test').update({ attivo: true, dataProcessingAgreementStatus: 'pending' });
    await expect(f.service.createLabShipment(f.orderId, { labId: 'lab_test' }, testAdmin))
      .rejects.toMatchObject({ code: 'lab_dpa_required' });
  });

  it('protects approved in-production originals even with an old draft deadline', async () => {
    const f = await deferredFixture();
    await f.authorize();
    await f.db.collection('orders').doc(f.orderId).update({ 'retention.deleteAfter': Timestamp.fromMillis(1) });
    await f.service.purgeExpiredAssets();
    expect(f.storage.deleted).toEqual([]);
    await expect(f.service.updateDraft(testCustomer, f.orderId, { customerNotes: 'change' }))
      .rejects.toMatchObject({ code: 'order_locked' });
    await expect(f.service.cancelOwnerDraft(testCustomer, f.orderId))
      .rejects.toMatchObject({ status: 409 });
  });

  it('requires explicit note/confirmation and rejects active or approved PayPal capture', async () => {
    const f = await deferredFixture();
    await expect(f.service.authorizeDeferredPayment(f.orderId, testAdmin, { note: '', confirmed: true }))
      .rejects.toMatchObject({ status: 400 });
    f.setProviderStatus('APPROVED');
    await expect(f.authorize()).rejects.toMatchObject({ code: 'paypal_payment_unresolved' });
    f.setProviderStatus('COMPLETED');
    await expect(f.authorize()).rejects.toMatchObject({ code: 'paypal_payment_unresolved' });
  });

  it('records a complete manual receipt once but never while a PayPal payment is approved', async () => {
    const f = await deferredFixture();
    await f.authorize();
    const input = { method: 'cash' as const, receivedAt: '2026-10-03T09:00:00Z', note: 'Received in studio', confirmed: true };
    f.setProviderStatus('APPROVED');
    await expect(f.service.collectDeferredPayment(f.orderId, testAdmin, input))
      .rejects.toMatchObject({ code: 'paypal_payment_unresolved' });
    f.setProviderStatus('CREATED');
    await Promise.all([
      f.service.collectDeferredPayment(f.orderId, testAdmin, input),
      f.service.collectDeferredPayment(f.orderId, testAdmin, input),
    ]);
    const order = f.db.value(`orders/${f.orderId}`);
    expect(order.transactions).toHaveLength(1);
    expect(order.payment).toMatchObject({ status: 'paid', method: 'cash',
      collectedCents: f.quote.totals.totalCents, dueCents: 0, manualReceipt: { by: testAdmin } });
    expect(order.payment.paypalCaptureId).toBeUndefined();
    expect(f.db.countCollection('cashMovements')).toBe(1);
    expect(f.db.value(`clienti/${order.clienteId}`).financials.totalRevenue).toBe(f.quote.totals.totalCents / 100);
    await expect(f.service.collectDeferredPayment(f.orderId, testAdmin, { ...input, method: 'card' }))
      .rejects.toMatchObject({ code: 'receipt_already_recorded' });
  });

  it('records a real late PayPal capture once without rewinding production and prevents manual double collection', async () => {
    const f = await deferredFixture();
    await f.authorize();
    await f.service.updateAdminStatus(f.orderId, 'ready_to_print', testAdmin);
    await Promise.all([f.service.paypalWebhook({}, f.event()), f.service.paypalWebhook({}, f.event())]);
    expect(f.db.value(`orders/${f.orderId}`).payment.status).toBe('paid');
    expect(f.db.value(`orders/${f.orderId}`).fulfillment.status).toBe('ready_to_print');
    expect(f.db.countCollection('cashMovements')).toBe(1);
    f.setProviderStatus('VOIDED');
    await expect(f.service.collectDeferredPayment(f.orderId, testAdmin, {
      method: 'cash', receivedAt: '2026-10-03T09:00:00Z', note: 'Do not duplicate', confirmed: true,
    })).rejects.toMatchObject({ code: 'manual_receipt_not_allowed' });
  });

  it('never overwrites a manual receipt when an unexpected real PayPal capture later requires reconciliation', async () => {
    const f = await deferredFixture();
    await f.authorize();
    f.setProviderStatus('VOIDED');
    await f.service.collectDeferredPayment(f.orderId, testAdmin, {
      method: 'card', receivedAt: '2026-10-03T09:00:00Z', note: 'Real card receipt', confirmed: true,
    });
    const messagesBeforeLateCapture = f.messages.length;
    await f.service.paypalWebhook({}, f.event());
    await f.service.paypalWebhook({}, f.event());
    const order = f.db.value(`orders/${f.orderId}`);
    expect(order.payment).toMatchObject({ status: 'paid_action_required', method: 'card',
      manualReceipt: { note: 'Real card receipt' }, reconciliationRequired: true });
    expect(order.transactions).toHaveLength(2); // Two real money receipts, not duplicate requests.
    expect(f.db.countCollection('cashMovements')).toBe(2);
    // Real late PayPal captures alert the studio, but not the customer with
    // another normal production confirmation.
    expect(f.messages).toHaveLength(messagesBeforeLateCapture + 1);
    expect(f.messages.at(-1)!.subject).toContain('Nuovo ordine stampe confermato');
    await f.service.paypalWebhook({}, {
      id: 'EVENT-REAL-REFUND', event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: { id: 'REAL-REFUND', custom_id: f.orderId,
        amount: { currency_code: 'EUR', value: (f.quote.totals.totalCents / 100).toFixed(2) },
        supplementary_data: { related_ids: { capture_id: 'CAPTURE-DEFERRED-TEST', order_id: 'PAYPAL-DEFERRED-TEST' } } },
    });
    const refunded = await f.service.adminOrder(f.orderId);
    expect(refunded.payment).toMatchObject({ status: 'paid', method: 'card',
      collectedCents: f.quote.totals.totalCents, dueCents: 0, reconciliationRequired: false });
    expect(refunded.fulfillment.status).toBe('submitted');
  });
});