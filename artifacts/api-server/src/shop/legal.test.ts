import { describe, expect, it } from 'vitest';
import { SHOP_LEGAL_MANIFEST, SHOP_LEGAL_TERMS, SHOP_TERMS_PATH } from '@shared/shop-legal';
import { isPrivateClientPath } from '../client-routes.js';
import { SHOP_CANCELLED_RETENTION_DAYS, SHOP_DELIVERED_RETENTION_DAYS, SHOP_DRAFT_RETENTION_DAYS } from './order-model.js';

describe('testi legali e comportamento del server', () => {
  it('le foto si cancellano nei giorni che le condizioni dichiarano al cliente', () => {
    expect(SHOP_DRAFT_RETENTION_DAYS).toBe(SHOP_LEGAL_TERMS.draftPhotoRetentionDays);
    expect(SHOP_CANCELLED_RETENTION_DAYS).toBe(SHOP_LEGAL_TERMS.cancelledPhotoRetentionDays);
    expect(SHOP_DELIVERED_RETENTION_DAYS).toBe(SHOP_LEGAL_TERMS.deliveredPhotoRetentionDays);
  });

  it('le tre versioni accettate al checkout viaggiano insieme', () => {
    const { termsVersion, privacyVersion, personalizedProductionVersion, schemaVersion } = SHOP_LEGAL_MANIFEST;
    expect(privacyVersion).toBe(termsVersion);
    expect(personalizedProductionVersion).toBe(termsVersion);
    expect(schemaVersion).toBe(`shop-legal-${termsVersion}`);
    expect(termsVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it('la pagina delle condizioni esiste per il sito ma non finisce su Google', () => {
    expect(SHOP_TERMS_PATH).toBe('/online-shop/condizioni');
    expect(isPrivateClientPath(SHOP_TERMS_PATH)).toBe(true);
  });

  it('i giorni del recesso e della consegna sono quelli di legge', () => {
    expect(SHOP_LEGAL_TERMS.withdrawalDays).toBe(14);
    expect(SHOP_LEGAL_TERMS.deliveryMaxDays).toBe(30);
  });
});
