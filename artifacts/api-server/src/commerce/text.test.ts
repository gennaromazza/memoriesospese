import { describe, expect, it } from 'vitest';
import {
  centsToEuros,
  cleanText,
  createOrderNumber,
  hashId,
  splitCustomerName,
  stableStringify,
  timestampMillis,
} from './text.js';

describe('commerce text helpers', () => {
  it('cleanText rimuove i caratteri di controllo e taglia alla lunghezza massima', () => {
    expect(cleanText('  Ciao\u0000 mondo\n ', 50)).toBe('Ciao  mondo');
    expect(cleanText('abcdefghij', 4)).toBe('abcd');
  });

  it('cleanText restituisce undefined per valori vuoti o non testuali', () => {
    expect(cleanText('   ', 10)).toBeUndefined();
    expect(cleanText(undefined, 10)).toBeUndefined();
    expect(cleanText(42, 10)).toBeUndefined();
  });

  it('createOrderNumber usa il prefisso, l\'anno di Roma e gli 8 caratteri dell\'id', () => {
    const date = new Date('2026-12-31T23:30:00Z');
    expect(createOrderNumber('ab-cd_1234efgh99', date)).toBe('ST-2027-ABCD1234');
    expect(createOrderNumber('abcdefghij', new Date('2026-06-01T10:00:00Z'), 'SH')).toBe('SH-2026-ABCDEFGH');
  });

  it('splitCustomerName separa nome e cognome con il cognome di riserva scelto', () => {
    expect(splitCustomerName('  Mario   Rossi De Luca ')).toEqual({ first: 'Mario', last: 'Rossi De Luca' });
    expect(splitCustomerName('Mario')).toEqual({ first: 'Mario', last: 'Shop stampe' });
    expect(splitCustomerName('Mario', 'Shop Natale')).toEqual({ first: 'Mario', last: 'Shop Natale' });
    expect(splitCustomerName('   ')).toEqual({ first: 'Cliente', last: 'Shop stampe' });
  });

  it('centsToEuros converte solo interi sicuri', () => {
    expect(centsToEuros(1999)).toBe(19.99);
    expect(() => centsToEuros(10.5)).toThrow();
  });

  it('hashId è uno sha256 esadecimale stabile', () => {
    expect(hashId('a')).toBe(hashId('a'));
    expect(hashId('a')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashId('a')).not.toBe(hashId('b'));
  });

  it('stableStringify non dipende dall\'ordine delle chiavi', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 4, c: 3 }] })).toBe(stableStringify({ a: [2, { c: 3, d: 4 }], b: 1 }));
  });

  it('timestampMillis legge i formati di data usati nel gestionale', () => {
    expect(timestampMillis(null)).toBe(0);
    expect(timestampMillis({ toMillis: () => 5 })).toBe(5);
    expect(timestampMillis({ toDate: () => new Date(7) })).toBe(7);
    expect(timestampMillis(new Date(9))).toBe(9);
    expect(timestampMillis({ seconds: 2 })).toBe(2000);
    expect(timestampMillis({ _seconds: 3 })).toBe(3000);
    expect(timestampMillis('1970-01-01T00:00:01Z')).toBe(1000);
    expect(timestampMillis('non una data')).toBe(0);
  });
});
