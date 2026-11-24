import { describe, expect, it } from 'vitest';
import { photobookPageName } from './photobook-page-name';

describe('nome pagina fotolibro', () => {
  it('mantiene il nome completo del file caricato, inclusa estensione e maiuscole', () => {
    expect(photobookPageName('Matrimonio_Alice_INGRESSO.JPG', 3)).toBe('Matrimonio_Alice_INGRESSO.JPG');
  });

  it('usa il numero pagina come fallback solo per dati legacy senza nome', () => {
    expect(photobookPageName(null, 3)).toBe('Pagina 3');
    expect(photobookPageName('  ', 4)).toBe('Pagina 4');
  });
});
