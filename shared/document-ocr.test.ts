import { describe, it, expect } from 'vitest';
import { cfSurnameCode, cfNameCode, crossCheckDocument, decodeCodiceFiscale, parseOcrText } from './document-ocr';

describe('decodeCodiceFiscale', () => {
  it('decodifica data e sesso (M)', () => {
    expect(decodeCodiceFiscale('RSSMRA85M01H501Q')).toEqual({ dataNascita: '1985-08-01', sesso: 'M' });
  });
  it('decodifica sesso F (giorno +40)', () => {
    expect(decodeCodiceFiscale('BNCLRA80A41F839F')).toEqual({ dataNascita: '1980-01-01', sesso: 'F' });
  });
  it('gestisce omocodia (cifre sostituite da lettere)', () => {
    // RSSMRA85M01H501Q con ultima cifra in omocodia: 1→M in posizione giorno
    expect(decodeCodiceFiscale('RSSMRA85M0MH501X').dataNascita).toBe('1985-08-01');
  });
  it('ritorna vuoto per CF malformato', () => {
    expect(decodeCodiceFiscale('XXX')).toEqual({});
  });
});

describe('parseOcrText', () => {
  it('estrae i dati da testo tessera sanitaria', () => {
    const text = `TESSERA SANITARIA - CARTA NAZIONALE DEI SERVIZI
Codice Fiscale
RSSMRA85M01H501Q
Cognome
ROSSI
Nome
MARIO
Luogo di nascita
ROMA (RM)`;
    const r = parseOcrText(text);
    expect(r.tipoDocumento).toBe('tessera_sanitaria');
    expect(r.codiceFiscale).toBe('RSSMRA85M01H501Q');
    expect(r.cognome).toBe('ROSSI');
    expect(r.nome).toBe('MARIO');
    expect(r.dataNascita).toBe('1985-08-01');
    expect(r.sesso).toBe('M');
    expect(r.luogoNascita).toContain('ROMA');
  });

  it('trova il CF anche se spezzato da spazi', () => {
    const r = parseOcrText('codice fiscale: RSSMRA 85M01 H501Q');
    expect(r.codiceFiscale).toBe('RSSMRA85M01H501Q');
  });

  it('riconosce la CIE con numero e scadenza', () => {
    const text = `REPUBBLICA ITALIANA
CARTA DI IDENTITA / IDENTITY CARD
CA12345AA
COGNOME / SURNAME
BIANCHI
NOME / NAME
LAURA
SCADENZA / EXPIRY 15.03.2030
BNCLRA80A41F839F`;
    const r = parseOcrText(text);
    expect(r.tipoDocumento).toBe('cie');
    expect(r.numeroDocumento).toBe('CA12345AA');
    expect(r.scadenza).toBe('2030-03-15');
    expect(r.codiceFiscale).toBe('BNCLRA80A41F839F');
    expect(r.sesso).toBe('F');
  });

  it('documento non riconosciuto', () => {
    const r = parseOcrText('foto di un gatto');
    expect(r.tipoDocumento).toBe('sconosciuto');
    expect(r.codiceFiscale).toBeUndefined();
  });
});

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
