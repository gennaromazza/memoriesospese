import { describe, it, expect } from 'vitest';
import { suggestEmailCorrection } from './email-suggest';

describe('suggestEmailCorrection', () => {
  it('corregge il typo classico gnail.com → gmail.com', () => {
    expect(suggestEmailCorrection('mario@gnail.com')).toBe('mario@gmail.com');
  });

  it('corregge altri typo frequenti di gmail', () => {
    expect(suggestEmailCorrection('anna@gamil.com')).toBe('anna@gmail.com');
    expect(suggestEmailCorrection('anna@gmial.com')).toBe('anna@gmail.com');
    expect(suggestEmailCorrection('anna@gmail.con')).toBe('anna@gmail.com');
    expect(suggestEmailCorrection('anna@gmail.co')).toBe('anna@gmail.com');
    expect(suggestEmailCorrection('anna@gmail.it')).toBe('anna@gmail.com');
  });

  it('corregge typo su altri provider comuni', () => {
    expect(suggestEmailCorrection('x@hotmial.com')).toBe('x@hotmail.com');
    expect(suggestEmailCorrection('x@librro.it')).toBe('x@libero.it');
    expect(suggestEmailCorrection('x@outlok.com')).toBe('x@outlook.com');
    expect(suggestEmailCorrection('x@virglio.it')).toBe('x@virgilio.it');
  });

  it('NON suggerisce per domini già corretti', () => {
    expect(suggestEmailCorrection('mario@gmail.com')).toBeNull();
    expect(suggestEmailCorrection('mario@libero.it')).toBeNull();
    expect(suggestEmailCorrection('mario@pec.it')).toBeNull();
  });

  it('NON suggerisce per domini aziendali/personalizzati lontani da quelli noti', () => {
    expect(suggestEmailCorrection('info@studiofotograficorossi.it')).toBeNull();
    expect(suggestEmailCorrection('mario@azienda-srl.com')).toBeNull();
  });

  it('NON suggerisce mentre si sta ancora digitando', () => {
    expect(suggestEmailCorrection('mario')).toBeNull();
    expect(suggestEmailCorrection('mario@')).toBeNull();
    expect(suggestEmailCorrection('mario@gmail')).toBeNull();
    expect(suggestEmailCorrection('mario@gmail.')).toBeNull();
    expect(suggestEmailCorrection('')).toBeNull();
  });

  it('è case-insensitive e ignora spazi', () => {
    expect(suggestEmailCorrection('  Mario@GNAIL.COM ')).toBe('mario@gmail.com');
  });

  it('mantiene intatta la parte prima della @', () => {
    expect(suggestEmailCorrection('mario.rossi+foto@gnail.com')).toBe('mario.rossi+foto@gmail.com');
  });
});
