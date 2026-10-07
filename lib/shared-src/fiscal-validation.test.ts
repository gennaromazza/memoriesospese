import { describe, it, expect } from 'vitest';
import {
  isValidCodiceFiscale,
  isValidPartitaIva,
  isValidCodiceSdi,
  isValidPec,
  isEmptyOrValidCodiceFiscale,
  isEmptyOrValidPartitaIva,
  normalizeFiscalString,
} from './fiscal-validation';

describe('isValidCodiceFiscale', () => {
  it('accetta CF validi noti', () => {
    // Esempi pubblici con checksum corretto
    expect(isValidCodiceFiscale('RSSMRA85M01H501Q')).toBe(true);
    expect(isValidCodiceFiscale('MRTMTT91D08F205J')).toBe(true);
    expect(isValidCodiceFiscale('BNCLRA80A41F839F')).toBe(true);
  });

  it('è case-insensitive e tollera spazi', () => {
    expect(isValidCodiceFiscale(' rssmra85m01h501q ')).toBe(true);
  });

  it('rifiuta checksum sbagliato', () => {
    expect(isValidCodiceFiscale('RSSMRA85M01H501A')).toBe(false);
  });

  it('rifiuta lunghezza/formato errati', () => {
    expect(isValidCodiceFiscale('RSSMRA85M01H501')).toBe(false);
    expect(isValidCodiceFiscale('12345678901234567')).toBe(false);
    expect(isValidCodiceFiscale('RSSMRA85X01H501Z')).toBe(false); // mese X non valido
    expect(isValidCodiceFiscale('')).toBe(false);
  });

  it('accetta omocodia (cifre sostituite da lettere) con checksum ricalcolato', () => {
    // RSSMRA85M01H501Z con ultima cifra del giorno omocodificata: 01 -> 0M... ricalcolo checksum
    // Costruito: RSSMRA85M0MH501 + check
    // Verifica solo che il formato omocodico non venga rifiutato a priori:
    // usiamo un CF omocodico con checksum valido calcolato dalla stessa tabella.
    const base = 'RSSMRA85M0MH501';
    // calcola manualmente il carattere atteso usando la funzione stessa per confronto brute-force
    let ok = false;
    for (let c = 65; c <= 90; c++) {
      if (isValidCodiceFiscale(base + String.fromCharCode(c))) { ok = true; break; }
    }
    expect(ok).toBe(true);
  });
});

describe('isValidPartitaIva', () => {
  it('accetta P.IVA valide note', () => {
    expect(isValidPartitaIva('00743110157')).toBe(true); // esempio classico
    expect(isValidPartitaIva('12345678903')).toBe(true);
  });

  it('tollera prefisso IT e spazi', () => {
    expect(isValidPartitaIva('IT 00743110157')).toBe(true);
  });

  it('rifiuta checksum sbagliato o formato errato', () => {
    expect(isValidPartitaIva('12345678901')).toBe(false);
    expect(isValidPartitaIva('1234567890')).toBe(false);
    expect(isValidPartitaIva('abcdefghijk')).toBe(false);
    expect(isValidPartitaIva('')).toBe(false);
  });
});

describe('isValidCodiceSdi', () => {
  it('accetta 7 alfanumerici e 0000000', () => {
    expect(isValidCodiceSdi('M5UXCR1')).toBe(true);
    expect(isValidCodiceSdi('0000000')).toBe(true);
    expect(isValidCodiceSdi(' subm70n ')).toBe(true);
  });
  it('rifiuta lunghezze diverse o caratteri non validi', () => {
    expect(isValidCodiceSdi('ABC123')).toBe(false);
    expect(isValidCodiceSdi('ABC12345')).toBe(false);
    expect(isValidCodiceSdi('ABC-123')).toBe(false);
  });
});

describe('isValidPec', () => {
  it('accetta email valide', () => {
    expect(isValidPec('studio@pec.fotografo.it')).toBe(true);
  });
  it('rifiuta formati non email', () => {
    expect(isValidPec('non-una-pec')).toBe(false);
    expect(isValidPec('a@b')).toBe(false);
  });
});

describe('varianti opzionali', () => {
  it('stringa vuota o undefined è valida', () => {
    expect(isEmptyOrValidCodiceFiscale('')).toBe(true);
    expect(isEmptyOrValidCodiceFiscale(undefined)).toBe(true);
    expect(isEmptyOrValidPartitaIva('  ')).toBe(true);
  });
  it('valore presente ma errato è invalido', () => {
    expect(isEmptyOrValidCodiceFiscale('XXX')).toBe(false);
    expect(isEmptyOrValidPartitaIva('123')).toBe(false);
  });
});

describe('normalizeFiscalString', () => {
  it('rimuove spazi e converte in maiuscolo', () => {
    expect(normalizeFiscalString(' rss mra ')).toBe('RSSMRA');
  });
});
