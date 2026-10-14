import { describe, expect, it } from 'vitest';
import { assignPageNumbers, pageNumberFromFileName } from './photobook-page-numbers';

const f = (name: string) => ({ name });

describe('pageNumberFromFileName', () => {
  it('legge l\'ultimo numero del nome', () => {
    expect(pageNumberFromFileName('7.jpg')).toBe(7);
    expect(pageNumberFromFileName('IMG_0007.JPG')).toBe(7);
    expect(pageNumberFromFileName('album 2024 pag 12.png')).toBe(12);
  });
  it('ignora nomi senza numero o fuori intervallo', () => {
    expect(pageNumberFromFileName('copertina.jpg')).toBeNull();
    expect(pageNumberFromFileName('0.jpg')).toBeNull();
    expect(pageNumberFromFileName('1234.jpg')).toBeNull();
  });
});

describe('assignPageNumbers', () => {
  it('rimette la pagina 7 al suo posto se è libera', () => {
    const taken = [...Array(30).keys()].map((i) => i + 1).filter((n) => n !== 7);
    const out = assignPageNumbers([f('7.jpg')], taken);
    expect(out.map((o) => o.pageNumber)).toEqual([7]);
  });
  it('mette in coda i numeri già occupati e i nomi senza numero', () => {
    const out = assignPageNumbers([f('3.jpg'), f('copertina.jpg')], [1, 2, 3]);
    expect(out.map((o) => [o.file.name, o.pageNumber, o.appended])).toEqual([
      ['3.jpg', 4, true],
      ['copertina.jpg', 5, true],
    ]);
  });
  it('ordina un caricamento nuovo in modo numerico', () => {
    const out = assignPageNumbers([f('10.jpg'), f('2.jpg'), f('1.jpg')], []);
    expect(out.map((o) => [o.file.name, o.pageNumber])).toEqual([
      ['1.jpg', 1],
      ['2.jpg', 2],
      ['10.jpg', 10],
    ]);
  });
});
