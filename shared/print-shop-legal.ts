import { PRINT_SHOP_ASSET_RETENTION_DAYS } from './print-shop-types';

/**
 * Manifesto versionato accettato al checkout. Il server ne salva l'hash
 * insieme ai timestamp: il client non può fornire versioni o digest propri.
 */
export const PRINT_SHOP_LEGAL_MANIFEST = Object.freeze({
  schemaVersion: 'print-shop-legal-2026-08-31.1',
  termsVersion: '2026-08-31',
  privacyVersion: '2026-08-31',
  personalizedProductionVersion: '2026-08-31',
  paymentPolicy: 'paypal_advance_only',
  fulfillmentMethod: 'studio_pickup',
  personalizedProduction: true,
  originalAssetRetentionDaysAfterDelivery: PRINT_SHOP_ASSET_RETENTION_DAYS,
  acceptedMimeTypes: ['image/jpeg'] as const,
});

export type PrintShopLegalManifest = typeof PRINT_SHOP_LEGAL_MANIFEST;
