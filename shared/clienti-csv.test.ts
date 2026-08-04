import { describe, it, expect } from 'vitest';
import { validateImportRow, parseCsvDate } from './clienti-csv';
import type { ImportCSVRow } from './clienti-types';

const baseRow: ImportCSVRow = {
  Nome: 'Mario',
  Cognome: 'Rossi',
  Email: 'mario.rossi@example.com',
};

const noExisting = new Set<string>();

describe('parseCsvDate', () => {
  it('accetta ISO e formato italiano', () => {
    expect(parseCsvDate('1985-08-01')).toBe('1985-08-01');
    expect(parseCsvDate('01/08/1985')).toBe('1985-08-01');
    expect(parseCsvDate('1/8/1985')).toBe('1985-08-01');
  });
  it('rifiuta formati non riconosciuti', () => {
    expect(parseCsvDate('agosto 1985')).toBeUndefined();
    expect(parseCsvDate('32/13/1985')).toBeUndefined();
    expect(parseCsvDate('')).toBeUndefined();
    expect(parseCsvDate(undefined)).toBeUndefined();
  });

  it('rifiuta date di calendario impossibili (anche ISO)', () => {
    expect(parseCsvDate('31/02/1985')).toBeUndefined();
    expect(parseCsvDate('1985-02-31')).toBeUndefined();
    expect(parseCsvDate('29/02/2023')).toBeUndefined(); // non bisestile
    expect(parseCsvDate('29/02/2024')).toBe('2024-02-29'); // bisestile
    expect(parseCsvDate('31/04/2020')).toBeUndefined(); // aprile ha 30 giorni
  });
});

describe('validateImportRow - dati fiscali', () => {
  it('mappa CF, P.IVA, SDI, PEC, nascita e azienda', () => {
    const r = validateImportRow({
      ...baseRow,
      'Codice Fiscale': ' rssmra85m01h501q ',
      'Partita IVA': 'IT 00743110157',
      'Codice SDI': 'm5uxcr1',
      PEC: 'Mario@PEC.it',
      'Data di Nascita': '01/08/1985',
      'Luogo di Nascita': ' Milano ',
      'Nome Azienda': 'Rossi Srl',
    }, noExisting);
    expect(r.valid).toBe(true);
    expect(r.mappedData).toMatchObject({
      codiceFiscale: 'RSSMRA85M01H501Q',
      partitaIva: '00743110157',
      codiceSdi: 'M5UXCR1',
      pec: 'mario@pec.it',
      dataNascita: '1985-08-01',
      luogoNascita: 'Milano',
      ragioneSociale: 'Rossi Srl',
      tipoSoggetto: 'azienda',
    });
    expect(r.warnings).toEqual([]);
  });

  it('P.IVA presente senza Nome Azienda implica tipoSoggetto azienda', () => {
    const r = validateImportRow({ ...baseRow, 'Partita IVA': '00743110157' }, noExisting);
    expect(r.mappedData?.tipoSoggetto).toBe('azienda');
  });

  it('dati fiscali errati producono warning non bloccanti', () => {
    const r = validateImportRow({
      ...baseRow,
      'Codice Fiscale': 'RSSMRA85M01H501Z', // checksum errato
      'Partita IVA': '12345678901', // checksum errato
      'Codice SDI': 'ABC', // troppo corto
      PEC: 'non-una-pec',
      'Data di Nascita': 'boh',
    }, noExisting);
    expect(r.valid).toBe(true);
    expect(r.warnings.length).toBe(5);
    expect(r.mappedData?.codiceFiscale).toBe('RSSMRA85M01H501Z'); // importato comunque
    expect(r.mappedData?.dataNascita).toBeUndefined(); // data illeggibile scartata
  });

  it('riga senza dati fiscali resta valida e senza campi fiscali', () => {
    const r = validateImportRow(baseRow, noExisting);
    expect(r.valid).toBe(true);
    expect(r.mappedData?.codiceFiscale).toBeUndefined();
    expect(r.mappedData?.tipoSoggetto).toBeUndefined();
  });

  it('mantiene le regole base (errori bloccanti su nome/email)', () => {
    const r = validateImportRow({ Nome: '', Cognome: 'Rossi', Email: 'x' } as ImportCSVRow, noExisting);
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('Nome mancante');
    expect(r.errors).toContain('Email non valida');
  });

  it('segnala email duplicata come warning', () => {
    const r = validateImportRow(baseRow, new Set(['mario.rossi@example.com']));
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => w.includes('già esistente'))).toBe(true);
  });
});
