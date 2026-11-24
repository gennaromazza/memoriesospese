import { describe, expect, it } from 'vitest';
import { VADEMECUM_NATALE_2026, vademecumForCampaign, vademecumUrl, canSubmitBooking } from '@shared/seasonal-vademecum';

describe('vademecumForCampaign', () => {
  it.each([
    [{ nome: 'Natale 2026', temaStagionale: null }],
    [{ nome: 'Mini sessioni natalizie', temaStagionale: 'natale' }],
    [{ nome: 'Set di Natale', temaStagionale: null }],
    [{ nome: 'NATALE 2026 - famiglie' }],
    [{ nome: 'Natale', temaStagionale: 'natale' }],
  ])('si applica a %j', campaign => {
    expect(vademecumForCampaign(campaign)).toEqual(VADEMECUM_NATALE_2026);
  });

  it.each([
    [{ nome: 'Natale 2025', temaStagionale: 'natale' }],
    [{ nome: 'Natale 2027' }],
    [{ nome: 'Carnevale 2026', temaStagionale: 'carnevale' }],
    [{ nome: 'Matrimoni', temaStagionale: null }],
    [{ nome: '', temaStagionale: null }],
    [{}],
    [null],
    [undefined],
  ])('non si applica a %j', campaign => {
    expect(vademecumForCampaign(campaign as any)).toBeNull();
  });

  it('un anno diverso dal 2026 nel nome esclude la campagna anche col tema natale', () => {
    expect(vademecumForCampaign({ nome: 'Natale 2024', temaStagionale: 'natale' })).toBeNull();
  });
});

describe('vademecumUrl', () => {
  it('costruisce il link assoluto per le email e quello relativo per il sito', () => {
    expect(vademecumUrl(VADEMECUM_NATALE_2026)).toBe('https://imagestudiofotografico.com/vademecum-natale-2026');
    expect(VADEMECUM_NATALE_2026.path).toBe('/vademecum-natale-2026');
  });
});

describe('canSubmitBooking', () => {
  it('serve la privacy; con il vademecum serve anche averlo letto', () => {
    expect(canSubmitBooking({ privacyConsent: true, vademecumRequired: false, vademecumConsent: false })).toBe(true);
    expect(canSubmitBooking({ privacyConsent: false, vademecumRequired: false, vademecumConsent: true })).toBe(false);
    expect(canSubmitBooking({ privacyConsent: true, vademecumRequired: true, vademecumConsent: false })).toBe(false);
    expect(canSubmitBooking({ privacyConsent: true, vademecumRequired: true, vademecumConsent: true })).toBe(true);
    expect(canSubmitBooking({ privacyConsent: false, vademecumRequired: true, vademecumConsent: true })).toBe(false);
  });
});
