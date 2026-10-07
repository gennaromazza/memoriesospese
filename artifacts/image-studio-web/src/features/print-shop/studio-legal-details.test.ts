import { describe, expect, it } from 'vitest';
import { PRINT_SHOP_MAX_PICKUP_DAYS, resolveStudioLegalDetails } from './studio-legal-details';

describe('studio legal details', () => {
  it('uses and trims only real settings data', () => {
    expect(resolveStudioLegalDetails({
      name: ' Studio Reale ',
      phone: ' 081 000 0000 ',
      email: ' reclami@example.test ',
      partitaIVA: ' IT00000000000 ',
      fiscalVia: ' Via Reale 1 ',
      fiscalCap: ' 81031 ',
      fiscalComune: ' Aversa ',
      fiscalProvincia: ' ce ',
    })).toEqual({
      name: 'Studio Reale',
      address: 'Via Reale 1, 81031 Aversa (CE)',
      phone: '081 000 0000',
      email: 'reclami@example.test',
      partitaIVA: 'IT00000000000',
      complete: true,
    });
    expect(PRINT_SHOP_MAX_PICKUP_DAYS).toBe(30);
  });

  it('does not invent missing seller data', () => {
    expect(resolveStudioLegalDetails({
      name: 'Studio',
      phone: '',
      email: '',
      partitaIVA: '',
      fiscalVia: '',
      fiscalCap: '',
      fiscalComune: '',
      fiscalProvincia: '',
    })).toMatchObject({ address: '', phone: '', email: '', partitaIVA: '', complete: false });
  });

  it('does not accept a generic public address without the structured fiscal address', () => {
    expect(resolveStudioLegalDetails({
      name: 'Studio',
      phone: '0810000000',
      email: 'studio@example.test',
      partitaIVA: 'IT00000000000',
      fiscalVia: '',
      fiscalCap: '',
      fiscalComune: '',
      fiscalProvincia: '',
    }).complete).toBe(false);
  });
});
