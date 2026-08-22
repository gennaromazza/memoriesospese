import { describe, expect, it } from 'vitest';
import {
  buildFatturaPaXml,
  calculateInvoiceTotals,
  FORFETTARIO_N2_2_CAUSALE,
  validateFatturaPaInput,
} from './fattura-pa';

const sender = {
  name: 'Studio & Foto <Roma>',
  partitaIVA: '00743110157',
  codiceFiscale: 'RSSMRA85M01H501Q',
  regimeFiscale: 'RF19',
  fiscalVia: 'Via Roma & Figli 1',
  fiscalCap: '00100',
  fiscalComune: 'Roma',
  fiscalProvincia: 'rm',
};

const recipient = {
  nome: 'Mario',
  cognome: 'Rossi',
  codiceFiscale: 'RSSMRA85M01H501Q',
  via: 'Via Cliente 2',
  cap: '20100',
  citta: 'Milano',
  provincia: 'mi',
  tipoSoggetto: 'privato' as const,
  email: 'mario@example.test',
};

function xmlFor(taxableAmount: number, taxTreatment: 'iva_ordinaria' | 'fuori_campo' = 'fuori_campo') {
  const totals = calculateInvoiceTotals({ taxableAmount, taxTreatment });
  return buildFatturaPaXml({
    sender, recipient, totals,
    input: {
      issueDate: '2026-08-21', invoiceNumber: '2026/0006',
      description: 'Servizio foto & video <matrimonio>', jobReference: 'Matrimonio Rossi',
      taxableAmount, taxTreatment,
    },
  });
}

describe('FatturaPA FPR12', () => {
  it('calcola imponibile, imposta e totale', () => {
    expect(calculateInvoiceTotals({ taxableAmount: 100, taxTreatment: 'iva_ordinaria' })).toEqual({
      imponibile: 100, imposta: 22, totale: 122, aliquota: 22,
    });
  });

  it('genera XML FPR12 escapato e normalizza le province', () => {
    const xml = xmlFor(100, 'iva_ordinaria');
    expect(xml).toContain('versione="FPR12"');
    expect(xml).toContain('Studio &amp; Foto &lt;Roma&gt;');
    expect(xml).toContain('Servizio foto &amp; video &lt;matrimonio&gt;');
    expect(xml).toContain('<ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>');
    expect(xml).toContain('<Provincia>RM</Provincia>');
    expect(xml).toContain('<Provincia>MI</Provincia>');
  });

  it('non tratta una email ordinaria come PEC', () => {
    const xml = xmlFor(50);
    expect(xml).toContain('<CodiceDestinatario>0000000</CodiceDestinatario>');
    expect(xml).not.toContain('<PECDestinatario>');
    expect(xml).not.toContain('mario@example.test');
  });

  it('inserisce una PEC valida quando il codice destinatario è 0000000', () => {
    const totals = calculateInvoiceTotals({ taxableAmount: 50, taxTreatment: 'fuori_campo' });
    const xml = buildFatturaPaXml({
      sender, recipient: { ...recipient, pec: 'fatture@pec.it' }, totals,
      input: {
        issueDate: '2026-08-21', invoiceNumber: '2026/0006', description: 'Foto',
        jobReference: 'Job', taxableAmount: 50, taxTreatment: 'fuori_campo',
      },
    });
    expect(xml).toContain('<PECDestinatario>fatture@pec.it</PECDestinatario>');
  });

  it('applica natura N2.2, causale e bollo al forfettario sopra 77,47 euro', () => {
    const xml = xmlFor(400);
    expect(xml).toContain('<Natura>N2.2</Natura>');
    expect(xml).toContain('<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>2.00</ImportoBollo></DatiBollo>');
    expect(xml).toContain(FORFETTARIO_N2_2_CAUSALE.replace("'", '&apos;'));
  });

  it('non applica il bollo quando l’imponibile non supera 77,47 euro', () => {
    expect(xmlFor(77.47)).not.toContain('<DatiBollo>');
  });

  it('rifiuta trattamenti sconosciuti e date impossibili', () => {
    const result = validateFatturaPaInput(sender, recipient, {
      issueDate: '2026-02-31', taxableAmount: 100,
      taxTreatment: 'aliquota_inventata' as any, description: 'Foto',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'Data emissione non valida', 'Trattamento IVA/fiscale non supportato',
    ]));
  });
});
