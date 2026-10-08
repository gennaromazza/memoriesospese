import { describe, expect, it } from 'vitest';
import {
  assertDocumentId,
  assertIdempotencyMatch,
  normalizeBillingDetails,
  normalizePostalAddress,
  normalizeRequiredEmail,
  normalizeShippingConfig,
} from './checkout-input.js';
import { CommerceHttpError } from './errors.js';

const address = {
  street: ' Via Roma ',
  houseNumber: '12',
  postalCode: '81031',
  city: 'Aversa',
  province: 'ce',
  country: 'IT',
};

const defaults = { enabled: false, priceCents: 0, estimatedMinDays: 2, estimatedMaxDays: 5 };

describe('commerce checkout input', () => {
  it('normalizeRequiredEmail normalizza e rifiuta le email non valide', () => {
    expect(normalizeRequiredEmail('  Mario@Example.COM ')).toBe('mario@example.com');
    expect(() => normalizeRequiredEmail('senza-chiocciola')).toThrowError(CommerceHttpError);
    expect(() => normalizeRequiredEmail('')).toThrowError(expect.objectContaining({ status: 400, code: 'email_required' }));
  });

  it('normalizePostalAddress pulisce i campi e mette la provincia in maiuscolo', () => {
    expect(normalizePostalAddress(address)).toEqual({
      street: 'Via Roma',
      houseNumber: '12',
      postalCode: '81031',
      city: 'Aversa',
      province: 'CE',
      country: 'IT',
    });
  });

  it.each([
    ['via mancante', { ...address, street: '' }],
    ['civico mancante', { ...address, houseNumber: '' }],
    ['CAP non di 5 cifre', { ...address, postalCode: '8103' }],
    ['città mancante', { ...address, city: '' }],
    ['provincia non valida', { ...address, province: 'C1' }],
    ['paese non italiano', { ...address, country: 'FR' }],
    ['indirizzo assente', undefined],
  ])('normalizePostalAddress rifiuta: %s', (_label, value) => {
    expect(() => normalizePostalAddress(value)).toThrowError(
      expect.objectContaining({ status: 400, code: 'shipping_address_required' }),
    );
  });

  it('normalizeBillingDetails accetta un codice fiscale valido e normalizza indirizzo e maiuscole', () => {
    expect(normalizeBillingDetails({ fiscalCode: ' rssmra85m01h501q ', residenceAddress: address })).toEqual({
      fiscalCode: 'RSSMRA85M01H501Q',
      residenceAddress: normalizePostalAddress(address),
    });
  });

  it('normalizeBillingDetails rifiuta codici fiscali non validi', () => {
    expect(() => normalizeBillingDetails({ fiscalCode: 'RSSMRA85M01H501A', residenceAddress: address })).toThrowError(
      expect.objectContaining({ status: 400, code: 'fiscal_code_required' }),
    );
  });

  it('normalizeShippingConfig applica i valori di riserva e i limiti', () => {
    expect(normalizeShippingConfig(undefined, defaults)).toEqual(defaults);
    expect(normalizeShippingConfig({ enabled: true, priceCents: 590, estimatedMinDays: 3, estimatedMaxDays: 7 }, defaults)).toEqual({
      enabled: true,
      priceCents: 590,
      estimatedMinDays: 3,
      estimatedMaxDays: 7,
    });
    expect(normalizeShippingConfig({ enabled: true, priceCents: -1, estimatedMinDays: 0, estimatedMaxDays: 1 }, defaults)).toEqual({
      enabled: true,
      priceCents: 0,
      estimatedMinDays: 2,
      estimatedMaxDays: 5,
    });
    expect(normalizeShippingConfig({ enabled: 'si', priceCents: 1_000_000_000_000 }, defaults).enabled).toBe(false);
    expect(normalizeShippingConfig({ priceCents: 1_000_000_000 }, defaults).priceCents).toBe(100_000_000);
  });

  it('normalizeShippingConfig usa i valori di riserva passati dal modulo', () => {
    const shop = { enabled: false, priceCents: 700, estimatedMinDays: 3, estimatedMaxDays: 6 };
    expect(normalizeShippingConfig({}, shop)).toEqual(shop);
  });

  it('assertDocumentId rifiuta id che potrebbero uscire dal percorso del documento', () => {
    expect(() => assertDocumentId('ordine_1', 'ordine')).not.toThrow();
    for (const value of ['', 'a/b', '.', '..', 'x'.repeat(201)]) {
      expect(() => assertDocumentId(value, 'ordine')).toThrowError(
        expect.objectContaining({ status: 400, code: 'invalid_id', message: 'ordine non valido' }),
      );
    }
  });

  it('assertIdempotencyMatch distingue dati diversi da richiesta ancora in corso', () => {
    expect(() => assertIdempotencyMatch({ payloadHash: 'a', status: 'completed' }, 'a')).not.toThrow();
    expect(() => assertIdempotencyMatch({ payloadHash: 'a', status: 'completed' }, 'b')).toThrowError(
      expect.objectContaining({ status: 409, code: 'idempotency_payload_mismatch' }),
    );
    expect(() => assertIdempotencyMatch({ payloadHash: 'a', status: 'pending' }, 'a')).toThrowError(
      expect.objectContaining({ status: 409, code: 'idempotency_incomplete' }),
    );
  });
});
