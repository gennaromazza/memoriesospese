import { SHOP_MAX_PHOTO_BYTES } from './shop-types';

/** Indirizzo della pagina con le condizioni di vendita dello shop. */
export const SHOP_TERMS_PATH = '/shop-natale/condizioni';

/**
 * Numeri citati nei testi legali dello shop. Il server li usa per cancellare le
 * foto e la pagina delle condizioni li mostra: cambiare un valore qui cambia
 * insieme il comportamento e il testo, e richiede una nuova versione del manifesto.
 */
export const SHOP_LEGAL_TERMS = Object.freeze({
  /** Foto di bozze mai pagate: cancellate dopo questi giorni. */
  draftPhotoRetentionDays: 7,
  /** Foto di ordini annullati o rimborsati: cancellate dopo questi giorni. */
  cancelledPhotoRetentionDays: 7,
  /** Foto di ordini consegnati o ritirati: cancellate dopo questi giorni (come per le stampe). */
  deliveredPhotoRetentionDays: 90,
  /** Giorni per recedere dai prodotti non personalizzati (Codice del Consumo, art. 52). */
  withdrawalDays: 14,
  /** Termine massimo di consegna se non è indicata una data diversa (Codice del Consumo, art. 61). Solo testo: non è un controllo del sistema. */
  deliveryMaxDays: 30,
});

/**
 * Manifesto versionato accettato al checkout dello shop. Il server ne salva
 * l'hash insieme ai timestamp: il client non può fornire versioni o digest
 * propri. Ogni modifica ai testi legali dello shop richiede una nuova versione.
 */
export const SHOP_LEGAL_MANIFEST = Object.freeze({
  schemaVersion: 'shop-legal-2026-10-10.1',
  termsVersion: '2026-10-10.1',
  privacyVersion: '2026-10-10.1',
  personalizedProductionVersion: '2026-10-10.1',
  paymentPolicy: 'paypal_advance_only',
  fulfillmentMethods: ['studio_pickup', 'shipping'] as const,
  shippingRequiresBillingDetails: true,
  /** Il consenso alla produzione personalizzata serve solo se nell'ordine ci sono prodotti con foto. */
  personalizedProductionRequiredWhenPhotos: true,
  acceptedMimeTypes: ['image/jpeg'] as const,
  maxPhotoBytes: SHOP_MAX_PHOTO_BYTES,
});

export type ShopLegalManifest = typeof SHOP_LEGAL_MANIFEST;
