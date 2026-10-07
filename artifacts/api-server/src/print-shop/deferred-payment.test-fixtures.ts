import { Timestamp } from 'firebase-admin/firestore';
import { PRINT_SHOP_CATALOG } from '@shared/print-shop-catalog';
import { PrintShopService } from './service.js';
import { FakeFirestore, FakeStorage } from './test-fakes.js';

export const testAdmin = 'admin@example.test';
export const testCustomer = { uid: 'deferred_customer', email: 'customer@example.test' };

/** Entire fixture is in memory. It never connects to Firebase, PayPal, mail or Drive. */
export async function deferredFixture(options: { unconfirmed?: boolean } = {}) {
  const db = new FakeFirestore();
  const storage = new FakeStorage();
  let time = Timestamp.fromMillis(Date.UTC(2026, 9, 3, 10));
  let providerStatus = 'CREATED';
  const paypal: any = {
    config: { environment: 'sandbox' },
    publicConfig: () => ({ enabled: true, checkoutEnabled: true, environment: 'sandbox' }),
    createOrder: async () => ({ id: 'PAYPAL-DEFERRED-TEST', status: 'CREATED' }),
    getOrder: async () => ({ id: 'PAYPAL-DEFERRED-TEST', status: providerStatus }),
    verifyWebhook: async () => true,
  };
  const messages: Array<{ to: string; subject: string; html: string }> = [];
  let mailFails = false;
  const mail = {
    studio: async () => ({ name: 'Test Studio', email: 'studio@example.test', phone: '+393331234567', address: 'Via Test 1, Aversa' }),
    send: async (to: string, subject: string, html: string) => {
      if (mailFails) throw new Error('Email provider unavailable');
      messages.push({ to, subject, html });
    },
  };
  const drive = {
    findOrCreateLabParentFolder: async () => 'parent_test',
    createShipmentFolder: async () => ({ folderId: 'folder_test', webViewLink: 'https://drive.test/folder' }),
    shareShipmentFolderWithUser: async () => ({ permissionId: 'permission_test', webViewLink: 'https://drive.test/folder' }),
    uploadStreamToDriveFolder: async (_folder: string, name: string, _mime: string, body: any) => {
      let size = 0;
      for await (const chunk of body) size += Buffer.byteLength(chunk);
      return { fileId: `file_${name}`, size };
    },
  };
  const service = new PrintShopService({ db, storage, paypal, mail, drive, now: () => time,
    siteUrl: () => 'https://studio.example.test' });
  db.seed('settings/studio', {
    name: 'Test Studio', email: 'studio@example.test', phone: '+393331234567',
    fiscalVia: 'Via Test 1', fiscalCap: '81031', fiscalComune: 'Aversa', fiscalProvincia: 'CE',
    partitaIVA: '01234567890', codiceFiscale: 'RSSMRA85M01F839X',
  });
  const product = PRINT_SHOP_CATALOG.find(item => item.printSpec.pricing.model === 'tiered' && item.sku !== 'PRINT-POLAROID-100X150')!;
  db.seed(`products/${product.id}`, product);
  const draft = await service.createDraft(testCustomer, { customer: { name: 'Test Customer' } });
  const orderId = draft.id;
  const path = `print-orders/${testCustomer.uid}/${orderId}/asset_test/original.jpg`;
  storage.put(path, Buffer.from('fake original bytes'));
  db.seed(`orders/${orderId}/assets/asset_test`, {
    ownerUid: testCustomer.uid, orderId, status: 'ready', storagePath: path,
    originalName: 'test.jpg', contentType: 'image/jpeg', sizeBytes: 19,
    widthPx: 6000, heightPx: 4000, sha256: 'fake_hash',
  });
  const quote = await service.quote(testCustomer, orderId, { items: [{
    sku: product.sku, finish: product.printSpec.finishes[0], fitMode: 'border',
    assignments: [{ assetId: 'asset_test', copies: 1 }],
  }] });
  if (!options.unconfirmed) await service.createPaypalOrder(testCustomer, orderId, {
    termsAccepted: true, privacyAccepted: true, personalizedProductionAccepted: true,
    expectedQuoteFingerprint: quote.quoteFingerprint!, expectedTotalCents: quote.totals.totalCents,
  });
  db.seed('labs/lab_test', {
    nome: 'Test Lab', email: 'lab@example.test', attivo: true, cartellaDriveId: 'lab_parent',
    dataProcessingAgreementStatus: 'signed', dataProcessingAgreementSignedAt: time,
    dataProcessingAgreementReference: 'Test signed agreement',
  });
  return {
    service, db, storage, paypal, orderId, path, messages, quote,
    setTime: (millis: number) => { time = Timestamp.fromMillis(millis); },
    setProviderStatus: (status: string) => { providerStatus = status; },
    setMailFailure: (value: boolean) => { mailFails = value; },
    authorize: () => service.authorizeDeferredPayment(orderId, testAdmin, {
      note: 'Studio approval for delivery', confirmed: true,
    }),
    event: (captureId = 'CAPTURE-DEFERRED-TEST') => ({
      id: `EVENT-${captureId}`, event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: captureId, status: 'COMPLETED', custom_id: orderId,
        invoice_id: db.value(`orders/${orderId}`).payment.invoiceId,
        amount: { currency_code: 'EUR', value: (quote.totals.totalCents / 100).toFixed(2) },
        supplementary_data: { related_ids: { order_id: 'PAYPAL-DEFERRED-TEST' } } },
    }),
  };
}