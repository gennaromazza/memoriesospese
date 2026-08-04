import { describe, it, expect } from 'vitest';
import { cfSurnameCode, cfNameCode, crossCheckDocument } from './document-ocr';

describe('cfSurnameCode / cfNameCode', () => {
  it('regole base', () => {
    expect(cfSurnameCode('Rossi')).toBe('RSS');
    expect(cfSurnameCode('Bo')).toBe('BOX'); // cognome corto → X
    expect(cfSurnameCode("D'Angelo")).toBe('DNG');
    expect(cfNameCode('Mario')).toBe('MRA');
    expect(cfNameCode('Francesco')).toBe('FNC'); // 4+ consonanti: 1ª,3ª,4ª
    expect(cfNameCode('Ada')).toBe('DAA');
  });
});

describe('crossCheckDocument', () => {
  const base = {
    tipoDocumento: 'tessera_sanitaria' as const,
    codiceFiscale: 'RSSMRA85M01H501Q', // Mario Rossi, 01/08/1985, M
    nome: 'Mario',
    cognome: 'Rossi',
    sesso: 'M' as const,
    dataNascita: '1985-08-01',
  };

  it('nessun warning quando tutto combacia', () => {
    const r = crossCheckDocument(base);
    expect(r.cfChecksumValid).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('segnala CF assente', () => {
    const r = crossCheckDocument({ tipoDocumento: 'sconosciuto' });
    expect(r.cfChecksumValid).toBe(false);
    expect(r.warnings[0]).toContain('non trovato');
  });

  it('segnala checksum errato', () => {
    const r = crossCheckDocument({ ...base, codiceFiscale: 'RSSMRA85M01H501Z' });
    expect(r.cfChecksumValid).toBe(false);
    expect(r.warnings.some((w) => w.includes('carattere finale'))).toBe(true);
  });

  it('segnala cognome/nome discordanti', () => {
    const r = crossCheckDocument({ ...base, cognome: 'Bianchi', nome: 'Luca' });
    expect(r.warnings.some((w) => w.includes('cognome'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('nome'))).toBe(true);
  });

  it('segnala data di nascita discordante', () => {
    const r = crossCheckDocument({ ...base, dataNascita: '1990-03-15' });
    expect(r.warnings.length).toBeGreaterThanOrEqual(2); // anno + mese (+ giorno)
  });

  it('sesso femminile: giorno +40', () => {
    // BNCLRA80A41F839F = Laura Bianchi, 01/01/1980, F
    const r = crossCheckDocument({
      tipoDocumento: 'cie',
      codiceFiscale: 'BNCLRA80A41F839F',
      nome: 'Laura',
      cognome: 'Bianchi',
      sesso: 'F',
      dataNascita: '1980-01-01',
    });
    expect(r.cfChecksumValid).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('segnala sesso discordante', () => {
    const r = crossCheckDocument({ ...base, sesso: 'F' });
    expect(r.warnings.some((w) => w.includes('sesso'))).toBe(true);
  });
});
