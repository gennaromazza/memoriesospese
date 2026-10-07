import { describe, expect, it } from 'vitest';
import { deferredFixture, testAdmin, testCustomer } from './deferred-payment.test-fixtures.js';

async function manualOrder() {
  const f = await deferredFixture({ unconfirmed: true });
  const detail = await f.service.adminOrder(f.orderId);
  const input = {
    note: 'Cliente ha confermato le stampe per telefono', confirmed: true,
    expectedQuoteFingerprint: detail.quoteFingerprint,
    expectedSnapshotHash: detail.manualAcceptanceEligibility.snapshotHash,
    expectedTotalCents: detail.totals.totalCents,
  };
  return { ...f, accept: () => f.service.acceptDraftManually(f.orderId, testAdmin, input) };
}

describe('Transactional customer updates for each confirmed print-order step', () => {
  it('does not email an unconfirmed draft, and distinguishes online approval from payment', async () => {
    const draft = await manualOrder();
    expect(draft.messages).toEqual([]);
    const online = await deferredFixture();
    expect(online.messages).toHaveLength(1);
    expect(online.messages[0].subject).toContain('pagamento da completare');
    expect(online.messages[0].html).toContain('Il pagamento non risulta ancora acquisito');
    expect(online.messages[0].html).not.toContain('Totale pagato');
  });

  it('notifies offline acceptance, deferred confirmation and every production step, with local pickup', async () => {
    const f = await manualOrder();
    await Promise.all([f.accept(), f.accept()]);
    await f.authorize();
    await f.authorize();
    await f.service.updateAdminStatus(f.orderId, 'files_check', testAdmin);
    await f.service.updateAdminStatus(f.orderId, 'ready_to_print', testAdmin);
    const shipment = await f.service.createLabShipment(f.orderId, { labId: 'lab_test' }, testAdmin);
    await f.service.transferLabShipment(shipment.id);
    await f.service.sendLabShipment(f.orderId, shipment.id, {}, testAdmin);
    await f.service.sendLabShipment(f.orderId, shipment.id, {}, testAdmin);
    await f.service.updateAdminStatus(f.orderId, 'printing', testAdmin);
    await f.service.updateAdminStatus(f.orderId, 'printing', testAdmin);
    await f.service.updateAdminStatus(f.orderId, 'ready_for_pickup', testAdmin);
    await f.service.updateAdminStatus(f.orderId, 'delivered', testAdmin);
    const clientEmails = f.messages.filter(message => message.to === testCustomer.email);
    expect(clientEmails).toHaveLength(8);
    expect(clientEmails[0].subject).toContain('preso in carico dallo studio');
    expect(clientEmails[1].subject).toContain('Ordine confermato');
    expect(clientEmails.map(message => message.subject).join(' ')).toContain('Stampe in produzione');
    for (const message of clientEmails) {
      expect(message.html).toContain('In studio');
      expect(message.html).toContain('Via Test 1, Aversa');
      expect(message.html).not.toContain('Totale pagato');
      expect(message.html).not.toContain('A domicilio');
      expect(message.html).toContain('https://studio.example.test/stampa-foto-aversa/i-miei-ordini');
    }
    expect(f.db.value(`orders/${f.orderId}`).notifications.printing.status).toBe('sent');
    expect(f.messages.filter(message => message.to === 'lab@example.test')).toHaveLength(1);
    expect((await f.db.collection('cashMovements').get()).empty).toBe(true);
  });

  it('records a failed email without undoing acceptance and does not blindly duplicate the attempt', async () => {
    const f = await manualOrder();
    f.setMailFailure(true);
    const accepted = await f.accept();
    expect(accepted.printShop.adminAcceptance).toBeTruthy();
    expect(accepted.notifications.manualAcceptance.status).toBe('failed');
    f.setMailFailure(false);
    await f.accept();
    expect(f.messages).toEqual([]);
    await f.authorize();
    expect(f.messages).toHaveLength(1);
  });

  it('allows an explicitly confirmed admin resend of an already-sent customer email and records it', async () => {
    const f = await manualOrder();
    await f.accept();
    const before = f.db.value(`orders/${f.orderId}`);

    const result = await f.service.resendCustomerNotification(
      f.orderId,
      'manual_acceptance',
      testAdmin,
    );

    const after = f.db.value(`orders/${f.orderId}`);
    expect(result).toEqual({ sent: true, skipped: false });
    expect(f.messages).toHaveLength(2);
    expect(f.messages[0].to).toBe(f.messages[1].to);
    expect(f.messages[0].subject).toBe(f.messages[1].subject);
    expect(after.notifications.manualAcceptance).toMatchObject({
      status: 'sent',
      attempts: 2,
      manualResends: 1,
      lastAttemptBy: testAdmin,
      lastAttemptSource: 'admin_resend',
    });
    expect(after.notifications.manualAcceptance.manualResendHistory).toEqual([
      expect.objectContaining({
        attempt: 1,
        by: testAdmin,
        eventId: after.notifications.manualAcceptance.eventId,
      }),
    ]);
    expect(after.notifications.manualAcceptance.manualResendHistory[0].at).toMatch(/2026-10-03T/);
    expect(after.payment).toEqual(before.payment);
    expect(after.fulfillment.status).toBe(before.fulfillment.status);
  });

  it('lets an admin recover a definitively failed email without changing the order', async () => {
    const f = await manualOrder();
    f.setMailFailure(true);
    await f.accept();
    expect(f.db.value(`orders/${f.orderId}`).notifications.manualAcceptance.status).toBe('failed');
    expect(f.messages).toHaveLength(0);

    f.setMailFailure(false);
    await f.service.resendCustomerNotification(f.orderId, 'manual_acceptance', testAdmin);

    expect(f.messages).toHaveLength(1);
    expect(f.db.value(`orders/${f.orderId}`).notifications.manualAcceptance).toMatchObject({
      status: 'sent',
      attempts: 2,
      manualResends: 1,
    });
  });

  it('never retries an unresolved send, including one whose provider accepted the resend', async () => {
    const f = await manualOrder();
    await f.accept();
    await f.db.collection('orders').doc(f.orderId).update({
      'notifications.manualAcceptance.status': 'sending',
    });
    await expect(f.service.resendCustomerNotification(
      f.orderId,
      'manual_acceptance',
      testAdmin,
    )).rejects.toMatchObject({ status: 409, code: 'notification_not_resendable' });
    expect(f.messages).toHaveLength(1);

    const retry = await manualOrder();
    await retry.accept();
    retry.messages.length = 0;
    const originalTransaction = retry.db.runTransaction.bind(retry.db);
    let transactionCount = 0;
    retry.db.runTransaction = async (callback: any) => {
      if (++transactionCount === 2) throw new Error('Database acknowledgement unavailable');
      return originalTransaction(callback);
    };

    expect(await retry.service.resendCustomerNotification(
      retry.orderId,
      'manual_acceptance',
      testAdmin,
    )).toEqual({ sent: true, skipped: false });
    expect(retry.db.value(`orders/${retry.orderId}`).notifications.manualAcceptance.status).toBe('sending');
    await expect(retry.service.resendCustomerNotification(
      retry.orderId,
      'manual_acceptance',
      testAdmin,
    )).rejects.toMatchObject({ status: 409, code: 'notification_not_resendable' });
    expect(retry.messages).toHaveLength(1);
  });

  it('records cancellation and restoration as distinct updates, without inventing production or payment', async () => {
    const f = await manualOrder();
    await f.accept();
    await f.authorize();
    await f.service.updateAdminStatus(f.orderId, 'cancelled', testAdmin);
    await f.service.restoreDeferredCandidate(f.orderId, testAdmin, { note: 'Cliente ha chiesto la riapertura', confirmed: true });
    expect(f.messages.at(-2)!.subject).toContain('annullato');
    expect(f.messages.at(-1)!.subject).toContain('riaperto');
    expect(f.messages.at(-1)!.html).toContain('non avvia da sola la produzione');
    expect(f.messages.at(-1)!.html).not.toContain('Totale pagato');
    f.setTime(Date.UTC(2026, 9, 3, 11));
    await f.authorize();
    await f.service.updateAdminStatus(f.orderId, 'cancelled', testAdmin);
    expect(f.messages.filter(message => message.subject.includes('Ordine confermato'))).toHaveLength(2);
    expect(f.messages.filter(message => message.subject.includes('annullato'))).toHaveLength(2);
  });

  it('uses shipping rather than pickup copy when the order is delivered to an address', async () => {
    const f = await manualOrder();
    await f.accept();
    await f.authorize();
    await f.db.collection('orders').doc(f.orderId).update({
      'fulfillment.method': 'shipping',
      'fulfillment.shippingAddress': { street: 'Via Consegna', houseNumber: '2',
        postalCode: '81031', city: 'Aversa', province: 'CE', country: 'IT' },
    });
    await f.service.updateAdminStatus(f.orderId, 'ready_to_print', testAdmin);
    await f.service.updateAdminStatus(f.orderId, 'printing', testAdmin);
    await f.service.updateAdminStatus(f.orderId, 'ready_for_pickup', testAdmin);
    const message = f.messages.at(-1)!;
    expect(message.subject).toContain('pronte per la spedizione');
    expect(message.html).toContain('Via Consegna');
    expect(message.html).toContain('A domicilio');
    expect(message.html).not.toContain('Ritiro in studio');
    expect(message.html).not.toContain('Porta con te il numero');
    expect(f.messages.at(-2)!.html).toContain('pronto per la spedizione');
  });

  it('does not lose separate notification results while two events finish together', async () => {
    const f = await manualOrder();
    await f.accept();
    await f.authorize();
    await Promise.all([
      f.service.sendCustomerNotificationBestEffort(f.orderId, 'files_check'),
      f.service.sendCustomerNotificationBestEffort(f.orderId, 'ready_to_print'),
    ]);
    const notifications = f.db.value(`orders/${f.orderId}`).notifications;
    expect(notifications.filesCheck.status).toBe('sent');
    expect(notifications.readyToPrint.status).toBe('sent');
    expect(notifications.manualAcceptance.status).toBe('sent');
  });

  it('re-evaluates the claim when Firestore retries after another sender won', async () => {
    const f = await manualOrder();
    await f.accept();
    await f.db.collection('orders').doc(f.orderId).update({ notifications: {} });
    const originalTransaction = f.db.runTransaction.bind(f.db);
    let retry = true;
    f.db.runTransaction = async (callback: any) => {
      if (retry) {
        retry = false;
        let claimedUpdate: any;
        await callback({ get: (ref: any) => ref.get(),
          update: (_ref: any, update: any) => { claimedUpdate = update; } });
        // First attempt was discarded; a different process committed this claim.
        await f.db.collection('orders').doc(f.orderId).update(claimedUpdate);
      }
      return originalTransaction(callback);
    };
    expect(await f.service.sendCustomerNotificationBestEffort(f.orderId, 'manual_acceptance'))
      .toEqual({ sent: false, skipped: true });
    expect(f.messages).toHaveLength(1);
  });

  it('keeps an accepted email acknowledgement ambiguous instead of marking it failed and resending', async () => {
    const f = await manualOrder();
    await f.accept();
    f.messages.length = 0;
    await f.db.collection('orders').doc(f.orderId).update({ notifications: {} });
    const originalTransaction = f.db.runTransaction.bind(f.db);
    let calls = 0;
    f.db.runTransaction = async (callback: any) => {
      if (++calls === 2) throw new Error('Database acknowledgement unavailable');
      return originalTransaction(callback);
    };
    expect(await f.service.sendCustomerNotificationBestEffort(f.orderId, 'manual_acceptance'))
      .toEqual({ sent: true, skipped: false });
    expect(f.db.value(`orders/${f.orderId}`).notifications.manualAcceptance.status).toBe('sending');
    expect(await f.service.sendCustomerNotificationBestEffort(f.orderId, 'manual_acceptance'))
      .toEqual({ sent: false, skipped: true });
    expect(f.messages).toHaveLength(1);
  });

  it('also notifies cancellation through removal, but not removal of an unconfirmed draft', async () => {
    const unconfirmed = await manualOrder();
    await unconfirmed.service.removeAdminOrder(unconfirmed.orderId, testAdmin);
    expect(unconfirmed.messages).toEqual([]);
    const accepted = await manualOrder();
    await accepted.accept();
    await accepted.service.removeAdminOrder(accepted.orderId, testAdmin);
    await accepted.service.removeAdminOrder(accepted.orderId, testAdmin);
    expect(accepted.messages.filter(message => message.subject.includes('annullato'))).toHaveLength(1);
    const online = await deferredFixture();
    await online.service.cancelOwnerDraft(testCustomer, online.orderId);
    expect(online.messages.at(-1)!.subject).toContain('annullato');
  });

  it('notifies the cancellation caused by a real full refund exactly once', async () => {
    const f = await deferredFixture();
    await f.service.paypalWebhook({}, f.event());
    const event = {
      id: 'EVENT-FULL-REFUND', event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: { id: 'FULL-REFUND', custom_id: f.orderId,
        amount: { currency_code: 'EUR', value: (f.quote.totals.totalCents / 100).toFixed(2) },
        supplementary_data: { related_ids: { capture_id: 'CAPTURE-DEFERRED-TEST', order_id: 'PAYPAL-DEFERRED-TEST' } } },
    };
    await f.service.paypalWebhook({}, event);
    await f.service.paypalWebhook({}, event);
    expect(f.messages.filter(message => message.to === testCustomer.email && message.subject.includes('annullato')))
      .toHaveLength(1);
    expect(f.db.value(`orders/${f.orderId}`).payment.status).toBe('refunded');
  });
});