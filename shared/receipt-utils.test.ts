import { describe, it, expect } from 'vitest';
import { buildClienteFiscaleSnapshot } from './receipt-utils';

describe('buildClienteFiscaleSnapshot', () => {
  it('costruisce lo snapshot completo con indirizzo formattato', () => {
    expect(buildClienteFiscaleSnapshot({
      codiceFiscale: 'RSSMRA85M01H501Q',
      partitaIva: '00743110157',
      via: 'Via Roma 1',
      cap: '20100',
      citta: 'Milano',
      provincia: 'MI',
    })).toEqual({
      codiceFiscale: 'RSSMRA85M01H501Q',
      partitaIva: '00743110157',
      indirizzo: 'Via Roma 1, 20100 Milano, MI',
    });
  });

  it('omette le parti mancanti senza separatori orfani', () => {
    expect(buildClienteFiscaleSnapshot({ via: 'Via Roma 1', citta: 'Milano' })).toEqual({
      codiceFiscale: undefined,
      partitaIva: undefined,
      indirizzo: 'Via Roma 1, Milano',
    });
    expect(buildClienteFiscaleSnapshot({ codiceFiscale: 'RSSMRA85M01H501Q' })).toEqual({
      codiceFiscale: 'RSSMRA85M01H501Q',
      partitaIva: undefined,
      indirizzo: undefined,
    });
  });

  it('gestisce cliente assente o vuoto', () => {
    expect(buildClienteFiscaleSnapshot(undefined)).toEqual({});
    expect(buildClienteFiscaleSnapshot(null)).toEqual({});
    expect(buildClienteFiscaleSnapshot({})).toEqual({
      codiceFiscale: undefined,
      partitaIva: undefined,
      indirizzo: undefined,
    });
  });
});
