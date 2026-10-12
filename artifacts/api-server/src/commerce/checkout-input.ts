import type {
  PrintShopBillingDetails,
  PrintShopPostalAddress,
  PrintShopShippingConfig,
} from '@shared/print-shop-types';
import { isValidCodiceFiscale } from '../../shared/fiscal-validation.js';
import { normalizeEmail } from '../utils/normalize.js';
import { CommerceHttpError } from './errors.js';
import { cleanText } from './text.js';

/**
 * Validazione e normalizzazione dei dati di checkout comuni a stampe e shop:
 * email, indirizzo di spedizione, dati di fatturazione, costo di spedizione.
 */

export function normalizeRequiredEmail(value: string): string {
  const normalized = normalizeEmail(value || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new CommerceHttpError(400, 'email_required', 'Account senza email valida');
  }
  return normalized;
}

export function normalizeShippingConfig(
  value: any,
  defaults: PrintShopShippingConfig,
): PrintShopShippingConfig {
  const enabled = value?.enabled === true;
  const priceCents = Number.isSafeInteger(value?.priceCents) && value.priceCents >= 0
    ? Math.min(value.priceCents, 100_000_000)
    : defaults.priceCents;
  const estimatedMinDays = Number.isSafeInteger(value?.estimatedMinDays) && value.estimatedMinDays >= 1
    ? Math.min(value.estimatedMinDays, 60)
    : defaults.estimatedMinDays;
  const estimatedMaxDays = Number.isSafeInteger(value?.estimatedMaxDays) && value.estimatedMaxDays >= estimatedMinDays
    ? Math.min(value.estimatedMaxDays, 90)
    : Math.max(estimatedMinDays, defaults.estimatedMaxDays);
  return { enabled, priceCents, estimatedMinDays, estimatedMaxDays };
}

export function normalizePostalAddress(value: any): PrintShopPostalAddress {
  const address: PrintShopPostalAddress = {
    street: cleanText(value?.street, 160) || '',
    houseNumber: cleanText(value?.houseNumber, 20) || '',
    postalCode: cleanText(value?.postalCode, 5) || '',
    city: cleanText(value?.city, 100) || '',
    province: (cleanText(value?.province, 2) || '').toUpperCase(),
    country: 'IT',
  };
  if (
    !address.street ||
    !address.houseNumber ||
    !/^\d{5}$/.test(address.postalCode) ||
    !address.city ||
    !/^[A-Z]{2}$/.test(address.province) ||
    value?.country !== 'IT'
  ) {
    throw new CommerceHttpError(
      400,
      'shipping_address_required',
      'Completa correttamente via, numero civico, CAP, città e provincia dell’indirizzo',
    );
  }
  return address;
}

export function normalizeBillingDetails(value: any): PrintShopBillingDetails {
  const fiscalCode = (cleanText(value?.fiscalCode, 16) || '').replace(/\s+/g, '').toUpperCase();
  if (!isValidCodiceFiscale(fiscalCode)) {
    throw new CommerceHttpError(
      400,
      'fiscal_code_required',
      'Inserisci un codice fiscale italiano valido',
    );
  }
  return {
    fiscalCode,
    residenceAddress: normalizePostalAddress(value?.residenceAddress),
  };
}

export function assertDocumentId(value: string, field: string): void {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 200 ||
    value.includes('/') ||
    value === '.' ||
    value === '..'
  ) {
    throw new CommerceHttpError(400, 'invalid_id', `${field} non valido`);
  }
}

export function assertIdempotencyMatch(marker: any, payloadHash: string): void {
  if (marker?.payloadHash !== payloadHash) {
    throw new CommerceHttpError(
      409,
      'idempotency_payload_mismatch',
      'La stessa Idempotency-Key è già stata usata con dati diversi',
    );
  }
  if (marker?.status !== 'completed') {
    throw new CommerceHttpError(
      409,
      'idempotency_incomplete',
      'La richiesta precedente è ancora in elaborazione',
    );
  }
}
