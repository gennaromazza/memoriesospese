import { describe, expect, it } from 'vitest';
import type { PrintShopPostalAddress } from '@shared/print-shop-types';
import { buildOrderPatch, checkoutProblems, type CheckoutAcceptance, type CheckoutForm } from './shop-checkout';
import { shopNextStep, shopStatusInfo } from './shop-status';
import { validateShopPhotoFile } from './shop-upload';

const address: PrintShopPostalAddress = { street: 'Via Roma', houseNumber: '12', postalCode: '81031', city: 'Aversa', province: 'CE', country: 'IT' };
const blank: PrintShopPostalAddress = { street: '', houseNumber: '', postalCode: '', city: '', province: '', country: 'IT' };

const form = (patch: Partial<CheckoutForm> = {}): CheckoutForm => ({
  name: 'Alice Verdi',
  phone: '',
  notes: '',
  method: 'studio_pickup',
  shippingAddress: blank,
  fiscalCode: '',
  residenceSame: true,
  residenceAddress: blank,
  ...patch,
});
const accepted: CheckoutAcceptance = { terms: true, privacy: true, personalized: true };
const problems = (formPatch: Partial<CheckoutForm> = {}, extra: Partial<CheckoutAcceptance & { orderingOpen: boolean; hasPhotoLines: boolean }> = {}) =>
  checkoutProblems({ ...form(formPatch), ...accepted, orderingOpen: true, hasPhotoLines: true, ...extra });

describe('cosa manca prima di pagare', () => {
  it('con il ritiro in studio basta il nome e le accettazioni', () => {
    expect(problems()).toEqual([]);
    expect(problems({ name: '  ' })).toEqual(['il tuo nome']);
  });

  it('chiede le accettazioni, e quella del prodotto personalizzato solo se ci sono foto', () => {
    expect(checkoutProblems({ ...form(), terms: false, privacy: false, personalized: false, orderingOpen: true, hasPhotoLines: false })).toEqual([
      'le condizioni di vendita',
      'la privacy',
    ]);
    expect(checkoutProblems({ ...form(), terms: true, privacy: true, personalized: false, orderingOpen: true, hasPhotoLines: true })).toEqual([
      'l’accettazione del prodotto personalizzato',
    ]);
  });

  it('con gli ordini chiusi non si può pagare', () => {
    expect(problems({}, { orderingOpen: false })).toEqual(['gli ordini non sono aperti']);
  });

  it('con la spedizione servono indirizzo, codice fiscale valido e residenza', () => {
    expect(problems({ method: 'shipping' })).toEqual(['l’indirizzo di consegna', 'il codice fiscale']);
    expect(problems({ method: 'shipping', shippingAddress: address, fiscalCode: 'SBAGLIATO' })).toEqual(['il codice fiscale']);
    expect(problems({ method: 'shipping', shippingAddress: address, fiscalCode: 'rssmra85m01h501q' })).toEqual([]);
    expect(problems({ method: 'shipping', shippingAddress: address, fiscalCode: 'RSSMRA85M01H501Q', residenceSame: false })).toEqual(['l’indirizzo di residenza']);
    expect(problems({ method: 'shipping', shippingAddress: address, fiscalCode: 'RSSMRA85M01H501Q', residenceSame: false, residenceAddress: address })).toEqual([]);
  });

  it('un CAP di meno di cinque cifre non basta', () => {
    expect(problems({ method: 'shipping', shippingAddress: { ...address, postalCode: '8103' }, fiscalCode: 'RSSMRA85M01H501Q' })).toEqual(['l’indirizzo di consegna']);
  });
});

describe('dati mandati al server', () => {
  it('il ritiro non porta con sé indirizzo né dati fiscali', () => {
    expect(buildOrderPatch(form({ name: ' Alice ', phone: ' 333 ', notes: ' ciao ' }))).toEqual({
      customer: { name: 'Alice', phone: '333' },
      customerNotes: 'ciao',
      fulfillment: { method: 'studio_pickup' },
    });
  });

  it('il telefono vuoto non viene mandato', () => {
    expect(buildOrderPatch(form()).customer).toEqual({ name: 'Alice Verdi' });
  });

  it('la spedizione porta indirizzo e dati fiscali, con la residenza uguale alla consegna se richiesto', () => {
    const patch = buildOrderPatch(form({ method: 'shipping', shippingAddress: address, fiscalCode: ' rssmra85m01h501q ' }));
    expect(patch.fulfillment).toEqual({ method: 'shipping', shippingAddress: address });
    expect(patch.billingDetails).toEqual({ fiscalCode: 'RSSMRA85M01H501Q', residenceAddress: address });
    const other = { ...address, city: 'Napoli', postalCode: '80100', province: 'NA' };
    expect(buildOrderPatch(form({ method: 'shipping', shippingAddress: address, fiscalCode: 'RSSMRA85M01H501Q', residenceSame: false, residenceAddress: other })).billingDetails?.residenceAddress).toEqual(other);
  });
});

describe('stato in parole semplici', () => {
  it('ogni stato ha un testo e un tono', () => {
    const cases: Array<[Parameters<typeof shopStatusInfo>[0], string, string]> = [
      [{ fulfillmentStatus: 'draft', paymentStatus: 'pending' }, 'Da completare', 'neutral'],
      [{ fulfillmentStatus: 'awaiting_payment', paymentStatus: 'pending' }, 'In attesa di pagamento', 'wait'],
      [{ fulfillmentStatus: 'awaiting_photos', paymentStatus: 'paid' }, 'Mancano delle foto', 'wait'],
      [{ fulfillmentStatus: 'photos_received', paymentStatus: 'paid' }, 'Foto ricevute', 'ok'],
      [{ fulfillmentStatus: 'in_production', paymentStatus: 'paid' }, 'In lavorazione', 'ok'],
      [{ fulfillmentStatus: 'ready_for_pickup', paymentStatus: 'paid' }, 'Pronto per il ritiro', 'ok'],
      [{ fulfillmentStatus: 'shipped', paymentStatus: 'paid' }, 'Spedito', 'ok'],
      [{ fulfillmentStatus: 'delivered', paymentStatus: 'paid' }, 'Consegnato', 'ok'],
      [{ fulfillmentStatus: 'cancelled', paymentStatus: 'pending' }, 'Annullato', 'bad'],
      [{ fulfillmentStatus: 'cancelled', paymentStatus: 'refunded' }, 'Rimborsato', 'bad'],
      [{ fulfillmentStatus: 'cancelled', paymentStatus: 'paid_action_required' }, 'Da verificare con lo studio', 'wait'],
    ];
    for (const [order, label, tone] of cases) expect(shopStatusInfo(order)).toEqual({ label, tone });
  });

  it('dice al cliente che cosa fare, se qualcosa', () => {
    const base = { fulfillmentStatus: 'draft' as const, paymentStatus: 'pending' as const, photosMissing: 0, canUploadPhotos: false, canEdit: false };
    expect(shopNextStep({ ...base, canEdit: true })).toContain('paga');
    expect(shopNextStep({ ...base, fulfillmentStatus: 'awaiting_photos', paymentStatus: 'paid', photosMissing: 1, canUploadPhotos: true })).toBe('Carica la foto che manca.');
    expect(shopNextStep({ ...base, fulfillmentStatus: 'awaiting_photos', paymentStatus: 'paid', photosMissing: 3, canUploadPhotos: true })).toBe('Carica le 3 foto che mancano.');
    expect(shopNextStep({ ...base, fulfillmentStatus: 'in_production', paymentStatus: 'paid' })).toBeNull();
  });
});

describe('controllo del file prima di caricarlo', () => {
  const max = 30 * 1024 * 1024;
  it('accetta un JPG di dimensione ragionevole', () => {
    expect(validateShopPhotoFile({ name: 'IMG_1.JPG', type: 'image/jpeg', size: 5_000_000 }, max)).toBeNull();
    expect(validateShopPhotoFile({ name: 'a.jpeg', type: 'image/jpeg', size: 1 }, max)).toBeNull();
  });
  it('rifiuta altri formati, file vuoti e file troppo grandi', () => {
    expect(validateShopPhotoFile({ name: 'a.png', type: 'image/png', size: 100 }, max)).toBe('Carica soltanto fotografie JPG.');
    expect(validateShopPhotoFile({ name: 'a.jpg', type: 'image/png', size: 100 }, max)).toBe('Carica soltanto fotografie JPG.');
    expect(validateShopPhotoFile({ name: 'a.jpg', type: 'image/jpeg', size: 0 }, max)).toBe('La fotografia è vuota.');
    expect(validateShopPhotoFile({ name: 'a.jpg', type: 'image/jpeg', size: max + 1 }, max)).toBe('La fotografia supera il limite di 30 MB.');
  });
});
