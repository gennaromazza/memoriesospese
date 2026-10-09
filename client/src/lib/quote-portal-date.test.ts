import { describe, expect, it } from 'vitest';
import { getQuoteManualSignatureDateValue } from './quote-portal-date';

describe('getQuoteManualSignatureDateValue', () => {
  it('usa il giorno italiano dopo mezzanotte in inverno', () => {
    expect(getQuoteManualSignatureDateValue(new Date('2026-02-14T23:05:00.000Z')))
      .toBe('2026-02-15');
  });

  it('usa il giorno italiano dopo mezzanotte in estate', () => {
    expect(getQuoteManualSignatureDateValue(new Date('2026-07-14T22:05:00.000Z')))
      .toBe('2026-07-15');
  });

  it('gestisce il cambio d’anno in Italia', () => {
    expect(getQuoteManualSignatureDateValue(new Date('2026-12-31T23:05:00.000Z')))
      .toBe('2027-01-01');
  });
});
