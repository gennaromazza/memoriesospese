import { SHOP_MAX_PHOTO_BYTES } from './shop-types';

/**
 * Manifesto versionato accettato al checkout dello shop. Il server ne salva
 * l'hash insieme ai timestamp: il client non può fornire versioni o digest
 * propri. Ogni modifica ai testi legali dello shop richiede una nuova versione.
 */
export const SHOP_LEGAL_MANIFEST = Object.freeze({
  schemaVersion: 'shop-legal-2026-10-08.1',
  termsVersion: '2026-10-08.1',
  privacyVersion: '2026-10-08.1',
  personalizedProductionVersion: '2026-10-08.1',
  paymentPolicy: 'paypal_advance_only',
  fulfillmentMethods: ['studio_pickup', 'shipping'] as const,
  shippingRequiresBillingDetails: true,
  /** Il consenso alla produzione personalizzata serve solo se nell'ordine ci sono prodotti con foto. */
  personalizedProductionRequiredWhenPhotos: true,
  acceptedMimeTypes: ['image/jpeg'] as const,
  maxPhotoBytes: SHOP_MAX_PHOTO_BYTES,
});

export type ShopLegalManifest = typeof SHOP_LEGAL_MANIFEST;
