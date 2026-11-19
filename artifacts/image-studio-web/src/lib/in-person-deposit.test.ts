import { describe, expect, it } from 'vitest';
import { MAX_IN_PERSON_DEPOSIT_CENTS, buildInPersonDepositRequest, formatCentsForInput, parseEuroToCents } from './in-person-deposit';

describe('parseEuroToCents', () => {
  it.each([
    ['20', 2000], ['20,5', 2050], ['20.50', 2050], ['0,99', 99], ['  35  ', 3500], ['1234,56', 123456], ['10000', 1_000_000],
  ])('legge %j come %i centesimi', (text, cents) => expect(parseEuroToCents(text)).toBe(cents));

  it.each(['', ' ', '0', '0,00', '-5', '20,555', '1.234,50', 'venti', '20€', '€20', '2e3', '12,', ',5', '1 000'])(
    'rifiuta %j', text => expect(parseEuroToCents(text)).toBeNull());

  it('arrotonda senza errori di virgola mobile', () => {
    expect(parseEuroToCents('19,99')).toBe(1999);
    expect(parseEuroToCents('0,07')).toBe(7);
    expect(parseEuroToCents('1,15')).toBe(115);
  });
});

describe('formatCentsForInput', () => {
  it('formatta per il campo di testo, con la virgola', () => {
    expect(formatCentsForInput(5000)).toBe('50,00');
    expect(formatCentsForInput(2050)).toBe('20,50');
    expect(formatCentsForInput(null)).toBe('');
    expect(formatCentsForInput(0)).toBe('');
  });
});

describe('buildInPersonDepositRequest', () => {
  it('costruisce la richiesta con importo in centesimi e identificativo stabile', () => {
    const body = buildInPersonDepositRequest({ amountText: '20,50', method: 'carta', note: '  POS studio ', requestId: 'req-12345678' });
    expect(body).toEqual({ ok: true, body: { amountCents: 2050, method: 'carta', requestId: 'req-12345678', note: 'POS studio' } });
  });
  it('omette la nota vuota', () => {
    const result = buildInPersonDepositRequest({ amountText: '10', method: 'contante', note: '   ', requestId: 'req-12345678' });
    expect(result).toEqual({ ok: true, body: { amountCents: 1000, method: 'contante', requestId: 'req-12345678' } });
  });
  it('segnala importo non valido o troppo alto', () => {
    expect(buildInPersonDepositRequest({ amountText: '0', method: 'contante', note: '', requestId: 'req-12345678' }))
      .toMatchObject({ ok: false, error: expect.stringContaining('importo') });
    expect(buildInPersonDepositRequest({ amountText: '10000,01', method: 'contante', note: '', requestId: 'req-12345678' }))
      .toMatchObject({ ok: false, error: expect.stringContaining('alto') });
    expect(MAX_IN_PERSON_DEPOSIT_CENTS).toBe(1_000_000);
  });
});
