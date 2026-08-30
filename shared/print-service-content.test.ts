import { describe, expect, it } from 'vitest';
import {
  PRINT_FAQS,
  PRINT_PRICE_TABLES,
  PRINT_SERVICE_PATH,
  countPrintFormats,
  normalizePrintFormat,
  searchPrintFormats,
} from './print-service-content';

describe('print service content', () => {
  it('mantiene il listino completo di 34 formati senza duplicati', () => {
    const formats = PRINT_PRICE_TABLES.flatMap((table) => table.rows.map((row) => row.format));

    expect(countPrintFormats()).toBe(34);
    expect(new Set(formats).size).toBe(34);
    expect(formats).toContain('10×15');
    expect(formats).toContain('50×80');
    expect(formats).toContain('10×9 Polaroid Wide');
  });

  it('mantiene prezzi e quantità allineati in ogni tabella', () => {
    for (const table of PRINT_PRICE_TABLES) {
      for (const row of table.rows) {
        expect(row.prices).toHaveLength(table.quantityHeaders.length);
      }
    }
  });

  it('espone contenuti SEO e FAQ per la landing pubblica', () => {
    expect(PRINT_SERVICE_PATH).toBe('/stampa-foto-aversa');
    expect(PRINT_FAQS).toHaveLength(5);
  });

  it('trova i formati anche con separatori e spazi diversi', () => {
    expect(normalizePrintFormat(' 20 x 30 cm ')).toBe('20x30');
    expect(searchPrintFormats('10x15').map((result) => result.row.format)).toEqual(['10×15']);
    expect(searchPrintFormats('20 × 30 centimetri').map((result) => result.row.format)).toEqual(['20×30']);
    expect(searchPrintFormats('polaroid').map((result) => result.row.format)).toEqual(['10×9 Polaroid Wide']);
  });

  it('non mostra risultati quando la ricerca è vuota o inesistente', () => {
    expect(searchPrintFormats('')).toEqual([]);
    expect(searchPrintFormats('99×99')).toEqual([]);
  });
});

