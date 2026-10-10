import { describe, expect, it } from 'vitest';
import { parseTierRows, tiersToRows } from './shop-shipping-form';

describe('fasce di peso nel modulo', () => {
  it('legge chili ed euro con la virgola o con il punto e li converte in grammi e centesimi', () => {
    const { tiers, errors } = parseTierRows([
      { kg: '1', euro: '5,90' },
      { kg: '3', euro: '7.9' },
      { kg: '0,5', euro: '4' },
    ]);
    expect(errors).toEqual([]);
    expect(tiers).toEqual([
      { maxGrams: 500, priceCents: 400 },
      { maxGrams: 1000, priceCents: 590 },
      { maxGrams: 3000, priceCents: 790 },
    ]);
  });

  it('ignora le righe lasciate vuote', () => {
    expect(parseTierRows([{ kg: '', euro: '' }, { kg: '2', euro: '6' }])).toEqual({ tiers: [{ maxGrams: 2000, priceCents: 600 }], errors: [] });
  });

  it('segnala peso e costo non validi, con il numero della fascia', () => {
    const { tiers, errors } = parseTierRows([
      { kg: 'tanto', euro: '5' },
      { kg: '2', euro: '' },
      { kg: '-1', euro: '5' },
      { kg: '101', euro: '5' },
      { kg: '2', euro: '-3' },
    ]);
    expect(tiers).toEqual([]);
    expect(errors).toHaveLength(5);
    expect(errors[0]).toContain('Fascia 1');
    expect(errors[1]).toContain('Fascia 2');
  });

  it('non accetta due fasce con lo stesso peso massimo', () => {
    expect(parseTierRows([{ kg: '1', euro: '5' }, { kg: '1,0', euro: '6' }]).errors).toEqual(['Due fasce hanno lo stesso peso massimo.']);
  });

  it('non accetta più di 12 fasce', () => {
    const rows = Array.from({ length: 13 }, (_, index) => ({ kg: String(index + 1), euro: '5' }));
    expect(parseTierRows(rows).errors[0]).toContain('al massimo 12');
  });

  it('riporta le fasce salvate nel modulo e viceversa senza perdere nulla', () => {
    const saved = [{ maxGrams: 500, priceCents: 490 }, { maxGrams: 3000, priceCents: 790 }];
    const rows = tiersToRows(saved);
    expect(rows).toEqual([{ kg: '0,5', euro: '4,90' }, { kg: '3', euro: '7,90' }]);
    expect(parseTierRows(rows).tiers).toEqual(saved);
    expect(tiersToRows(undefined)).toEqual([]);
  });
});
