import { describe, it, expect } from 'vitest';
import { parseAddressComponents } from './places-utils';

describe('parseAddressComponents', () => {
  it('estrae via con civico, città, CAP e provincia', () => {
    expect(parseAddressComponents([
      { types: ['street_number'], longText: '123' },
      { types: ['route'], longText: 'Via Roma' },
      { types: ['locality', 'political'], longText: 'Milano' },
      { types: ['administrative_area_level_2', 'political'], longText: 'Città Metropolitana di Milano', shortText: 'MI' },
      { types: ['postal_code'], longText: '20100' },
    ])).toEqual({
      via: 'Via Roma, 123',
      citta: 'Milano',
      cap: '20100',
      provincia: 'MI',
    });
  });

  it('gestisce via senza civico e componenti mancanti', () => {
    expect(parseAddressComponents([
      { types: ['route'], longText: 'Corso Umberto I' },
      { types: ['administrative_area_level_3'], longText: 'Frattamaggiore' },
    ])).toEqual({
      via: 'Corso Umberto I',
      citta: 'Frattamaggiore',
      cap: undefined,
      provincia: undefined,
    });
  });

  it('ritorna oggetto vuoto senza componenti', () => {
    expect(parseAddressComponents(undefined)).toEqual({});
    expect(parseAddressComponents([])).toEqual({});
  });
});
