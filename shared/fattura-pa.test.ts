import { describe, expect, it } from 'vitest';
import {
  buildFatturaPaXml,
  calculateInvoiceTotals,
  type FatturaPaRecipient,
  type FatturaPaSender,
  validateFatturaPaInput,
} from './fattura-pa';
import { buildFatturaPaXml, calculateInvoiceTotals, FORFETTARIO_N2_2_CAUSALE, validateFatturaPaInput } from './fattura-pa';

const sender = {
  name: 'Studio & Foto <Roma>',
  partitaIVA: '00743110157',
  codiceFiscale: 'RSSMRA85M01H501Q',
  regimeFiscale: 'RF19',
  fiscalVia: 'Via Roma & Figli 1',
  fiscalCap: '00100',
  fiscalComune: 'Roma',
  fiscalProvincia: 'RM',
};

const recipient = {
  nome: 'Mario',
  cognome: 'Rossi',
  codiceFiscale: 'RSSMRA85M01H501Q',
  via: 'Via Cliente 2',
  cap: '20100',
  citta: 'Milano',
  provincia: 'MI',
  codiceSdi: '0000000',
  email: 'mario@example.test',
};

describe('FatturaPA FPR12', () => {
  it('calcola imponibile, imposta e totale', () => {
    expect(calculateInvoiceTotals({ taxableAmount: 100, taxTreatment: 'iva_ordinaria' })).toEqual({
      imponibile: 100, imposta: 22, totale: 122, aliquota: 22,
    });
  });

  it('segnala tutti i dati obbligatori mancanti', () => {
    const result = validateFatturaPaInput(sender, recipient, {
      issueDate: '2026-02-31',
      taxableAmount: 100,
      taxTreatment: 'aliquota_inventata' as any,
      description: 'Foto',
    });
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining([
      'Mittente: partita IVA',
      'Mittente: indirizzo (via)',
      'Cliente: partita IVA o codice fiscale',
      'Cliente: codice destinatario SDI o PEC',
    ]));
  });

  it('genera XML FPR12 ben escapato e con riferimento lavoro', () => {
    const totals = calculateInvoiceTotals({ taxableAmount: 50, taxTreatment: 'fuori_campo' });
    const xml = buildFatturaPaXml({
      sender, recipient, totals,
      input: {
        issueDate: '2026-08-21', invoiceNumber: '2026/0006', description: 'Consulenza',
        jobReference: 'Job', taxableAmount: 50, taxTreatment: 'fuori_campo',
      },
    });

    const privateRecipient = {
      ...recipient,
      tipoSoggetto: 'privato' as const,
      codiceSdi: undefined,
      pec: undefined,
      email: 'mario.rossi@example.com',
    };

    const companyRecipient = {
      ...recipient,
      tipoSoggetto: 'azienda' as const,
      ragioneSociale: 'Rossi S.r.l.',
      partitaIva: '00743110157',
      codiceFiscale: undefined,
      codiceSdi: undefined,
      pec: undefined,
    };
    expect(xml).toContain('versione="FPR12"');
    expect(xml).toContain('xmlns="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"');
    expect(xml).toContain('Studio &amp; Foto &lt;Roma&gt;');
    expect(xml).toContain('Servizio foto &amp; video &lt;matrimonio&gt;');
    expect(xml).toContain('<ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>');
    expect(xml).toContain('<CodiceDestinatario>0000000</CodiceDestinatario>');
  });

  it('usa Natura per una riga senza IVA', () => {
    const totals = calculateInvoiceTotals({ taxableAmount: 50, taxTreatment: 'fuori_campo' });
    const xml = buildFatturaPaXml({
      sender, recipient, totals,
      input: {
        issueDate: '2026-08-21', invoiceNumber: '2026/0006', description: 'Consulenza',
        jobReference: 'Job', taxableAmount: 50, taxTreatment: 'fuori_campo',
      },
    });

    const privateRecipient = {
      ...recipient,
      tipoSoggetto: 'privato' as const,
      codiceSdi: undefined,
      pec: undefined,
      email: 'mario.rossi@example.com',
    };

    const companyRecipient = {
      ...recipient,
      tipoSoggetto: 'azienda' as const,
      ragioneSociale: 'Rossi S.r.l.',
      partitaIva: '00743110157',
      codiceFiscale: undefined,
      codiceSdi: undefined,
      pec: undefined,
    };

    expect(totals).toEqual({ imponibile: 50, imposta: 0, totale: 50, aliquota: 0, natura: 'N2.2' });
    expect(xml).toContain('<Natura>N2.2</Natura>');
    expect(xml).toContain('<ImponibileImporto>50.00</ImponibileImporto>');
    expect(xml).toContain('<Imposta>0.00</Imposta>');
    expect(xml).not.toContain('<EsigibilitaIVA>');
    expect(xml).toContain(FORFETTARIO_N2_2_CAUSALE.replace("'", '&apos;'));
  });

  it('rifiuta trattamenti sconosciuti e date impossibili', () => {
    const result = validateFatturaPaInput(sender, recipient, {
      issueDate: '2026-02-31',
      taxableAmount: 100,
      taxTreatment: 'aliquota_inventata' as any,
      description: 'Foto',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'Data emissione non valida',
      'Trattamento IVA/fiscale non supportato',
    ]));
  });
});

    const validation = validateFatturaPaInput(sender, privateRecipient, {
      issueDate: '2026-08-21', taxableAmount: 50, taxTreatment: 'iva_ordinaria', description: 'Foto',
    });

    const validPecRecipient = { ...companyRecipient, pec: 'fatture@pec.it' };

    const missingDelivery = validateFatturaPaInput(sender, companyRecipient, {
      issueDate: '2026-08-21', taxableAmount: 50, taxTreatment: 'iva_ordinaria', description: 'Foto',
    });

    const invalidPecRecipient = { ...companyRecipient, pec: 'email-non-valida' };
