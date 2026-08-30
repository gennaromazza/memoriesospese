import { describe, expect, it } from 'vitest';
import {
  PRINT_FAQS,
  PRINT_PRICE_TABLES,
  PRINT_SERVICE_PATH,
  countPrintFormats,
} from './print-service-content';

describe('print service content', () => {
  it('mantiene il listino completo di 33 formati senza duplicati', () => {
    const formats = PRINT_PRICE_TABLES.flatMap((table) => table.rows.map((row) => row.format));

    expect(countPrintFormats()).toBe(33);
    expect(new Set(formats).size).toBe(33);
    expect(formats).toContain('10×15');
    expect(formats).toContain('50×80');
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
});

