import { describe, expect, it } from 'vitest';
import { deferredFixture, testAdmin, testCustomer } from './deferred-payment.test-fixtures.js';

async function setup() {
  const f = await deferredFixture({ unconfirmed: true });
  const detail = await f.service.adminOrder(f.orderId);
  const input = {
    note: 'Cliente ha richiesto le stampe per telefono', confirmed: true,
    expectedQuoteFingerprint: detail.quoteFingerprint,
    expectedSnapshotHash: detail.manualAcceptanceEligibility.snapshotHash,
    expectedTotalCents: detail.totals.totalCents,
  };
  return { ...f, input, accept: () => f.service.acceptDraftManually(f.orderId, testAdmin, input) };
}

describe('Manual acceptance of an unconfirmed print draft', () => {
  it('accepts offline instructions, then separately authorizes production without inventing money or customer consent', async () => {
    const f = await setup();
    expect((await f.service.adminOrder(f.orderId)).manualAcceptanceEligibility.canAccept).toBe(true);
    await expect(f.authorize()).rejects.toMatchObject({ code: 'order_incomplete' });
    const accepted = await f.accept();
    expect(accepted.fulfillment.status).toBe('awaiting_payment');
    expect(accepted.printShop.adminAcceptance).toMatchObject({ source: 'offline_request', by: testAdmin, note: f.input.note });
    expect(accepted.payment).toMatchObject({ status: 'pending', collectedCents: 0, dueCents: f.input.expectedTotalCents });
    expect(accepted.deferredPaymentEligibility.canAuthorize).toBe(true);
    expect(accepted.legal?.termsAcceptedAt).toBeUndefined();
    expect(accepted.legal?.privacyAcceptedAt).toBeUndefined();
    expect(accepted.printRecovery.stoppedAt).toBeTruthy();
    expect(accepted.printRecoveryDueAt).toBeUndefined();
    await expect(f.service.updateDraft(testCustomer, f.orderId, { customerNotes: 'Changed' }))
      .rejects.toMatchObject({ code: 'order_locked' });
    await expect(f.service.cancelOwnerDraft(testCustomer, f.orderId)).rejects.toMatchObject({ code: 'order_locked' });
    const owner = await f.service.ownerOrder(testCustomer, f.orderId);
    expect(owner.printShop.acceptedByStudio).toBe(true);
    expect(owner.printShop.adminAcceptance).toBeUndefined();
    await expect(f.service.createLabShipment(f.orderId, { labId: 'lab_test' }, testAdmin))
      .rejects.toMatchObject({ code: 'payment_required' });
    await f.authorize();
    const deferred = await f.service.adminOrder(f.orderId);
    expect(deferred.payment.status).toBe('deferred');
    expect(deferred.fulfillment.status).toBe('submitted');
    expect(deferred.payment.collectedCents).toBe(0);
    expect((await f.service.adminOrders({ status: 'submitted' })).some(o => o.id === f.orderId)).toBe(true);
    expect((await f.db.collection('cashMovements').get()).empty).toBe(true);
    expect((await f.db.collection('orders').doc(f.orderId).collection('legalAcceptances').get()).empty).toBe(true);
    expect(f.storage.files.has(f.path)).toBe(true);
    await f.service.updateAdminStatus(f.orderId, 'ready_to_print', testAdmin);
    const shipment = await f.service.createLabShipment(f.orderId, { labId: 'lab_test' }, testAdmin);
    await f.service.transferLabShipment(shipment.id);
    await f.service.sendLabShipment(f.orderId, shipment.id, {}, testAdmin);
    expect(f.db.value(`orders/${f.orderId}`).fulfillment.status).toBe('sent_to_laboratory');
    expect(f.db.value(`orders/${f.orderId}`).payment.status).toBe('deferred');
    expect((await f.db.collection('cashMovements').get()).empty).toBe(true);
  });

  it('is idempotent under double clicks and preserves the first audit note', async () => {
    const f = await setup();
    await Promise.all([f.accept(), f.accept()]);
    const order = f.db.value(`orders/${f.orderId}`);
    expect(order.fulfillment.history.filter((h: any) => h.action === 'draft_accepted_manually')).toHaveLength(1);
    expect((await f.db.collection('orders').doc(f.orderId).collection('adminAcceptances').get()).docs).toHaveLength(1);
    expect(order.printShop.adminAcceptance.note).toBe(f.input.note);
  });

  it.each(['price', 'shipping', 'items'])('rejects a stale admin confirmation when %s changes', async changed => {
    const f = await setup();
    const order = f.db.value(`orders/${f.orderId}`);
    if (changed === 'price') order.totals.totalCents += 1;
    if (changed === 'shipping') order.fulfillment.shippingAddress = { city: 'New destination' };
    if (changed === 'items') order.printShop.items[0].assignments[0].copies += 1;
    f.db.seed(`orders/${f.orderId}`, order);
    await expect(f.accept()).rejects.toMatchObject({ code: 'order_changed' });
    expect(f.db.value(`orders/${f.orderId}`).printShop.adminAcceptance).toBeUndefined();
  });

  it('requires explicit confirmation of low resolution and of the offline request', async () => {
    const f = await setup();
    await expect(f.service.acceptDraftManually(f.orderId, testAdmin, { ...f.input, confirmed: false }))
      .rejects.toMatchObject({ code: 'payment_confirmation_required' });
    await f.db.collection('orders').doc(f.orderId).update({
      'printShop.qualityWarnings': [{ assetId: 'asset_test' }], 'printShop.lowResolutionAccepted': false,
    });
    await expect(f.accept()).rejects.toMatchObject({ code: 'order_incomplete' });
    await f.service.acceptDraftManually(f.orderId, testAdmin, { ...f.input, lowResolutionConfirmed: true });
    await f.authorize();
    expect(f.db.value(`orders/${f.orderId}`).payment.status).toBe('deferred');
  });

  it.each(['missing_original', 'cash', 'purging', 'no_configuration', 'cancelled', 'approved_paypal'])(
    'refuses unsafe acceptance: %s', async scenario => {
      const f = await setup();
      if (scenario === 'missing_original') f.storage.files.delete(f.path);
      if (scenario === 'cash') f.db.seed('cashMovements/existing_receipt', { orderId: f.orderId });
      if (scenario === 'purging') await f.db.collection('orders').doc(f.orderId).update({ 'retention.status': 'purging' });
      if (scenario === 'no_configuration') {
        await f.db.collection('orders').doc(f.orderId).update({ 'printShop.items': [] });
        f.input.expectedSnapshotHash = (await f.service.adminOrder(f.orderId)).manualAcceptanceEligibility.snapshotHash;
      }
      if (scenario === 'cancelled') await f.db.collection('orders').doc(f.orderId).update({ 'fulfillment.status': 'cancelled' });
      if (scenario === 'approved_paypal') {
        await f.db.collection('orders').doc(f.orderId).update({ 'payment.paypalOrderId': 'PAYPAL-DEFERRED-TEST' });
        f.setProviderStatus('APPROVED');
      }
      await expect(f.accept()).rejects.toBeTruthy();
      expect(f.db.value(`orders/${f.orderId}`).printShop.adminAcceptance).toBeUndefined();
    });

  it('does not accept a forged or altered offline acceptance in place of the audit record', async () => {
    const f = await setup();
    await f.accept();
    await f.db.collection('orders').doc(f.orderId).update({ 'printShop.adminAcceptance.note': 'Forged note' });
    await expect(f.authorize()).rejects.toMatchObject({ code: 'order_incomplete' });
  });
});