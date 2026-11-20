import { describe, expect, it } from 'vitest';
import { formatWeekRange, packageHeadline, packageItemNote, sharedPhotosNotice, packageItemsTitle } from './booking-package-copy';

const item = (extra: Record<string, unknown> = {}) => ({ prodottoId: 'p', prodottoNome: 'Cornice 15x20', numeroFoto: 1, quantita: 1, ...extra }) as never;

describe('formatWeekRange', () => {
  it('una sola riga, senza ripetere mese e anno quando coincidono', () => {
    expect(formatWeekRange(new Date(2026, 10, 20), new Date(2026, 10, 26))).toBe('20 – 26 nov 2026');
  });
  it('mesi diversi: li scrive entrambi', () => {
    expect(formatWeekRange(new Date(2026, 10, 28), new Date(2026, 11, 4))).toBe('28 nov – 4 dic 2026');
  });
  it('anni diversi: scrive entrambi gli anni', () => {
    expect(formatWeekRange(new Date(2026, 11, 29), new Date(2027, 0, 4))).toBe('29 dic 2026 – 4 gen 2027');
  });
  it('un solo giorno', () => {
    expect(formatWeekRange(new Date(2026, 10, 26), new Date(2026, 10, 26))).toBe('26 nov 2026');
  });
});

describe('packageHeadline (riga sotto il prezzo)', () => {
  it('prodotto singolo con foto incluse', () => {
    expect(packageHeadline({ numeroFoto: 10 } as never)).toBe('10 foto incluse');
  });
  it('senza foto incluse: nessun simbolo strano, parole semplici', () => {
    expect(packageHeadline({ numeroFoto: 0 } as never)).toBe('Foto a tua scelta');
  });
  it('pacchetto con galleria condivisa: conta solo la raccolta di origine', () => {
    const product = { isBundle: true, fotoCondivise: true, prodottoSorgenteFotoId: 'a',
      bundleItems: [item({ prodottoId: 'a', numeroFoto: 40 }), item({ prodottoId: 'b', numeroFoto: 1 })] };
    expect(packageHeadline(product as never)).toBe('40 foto nella galleria digitale');
  });
  it('pacchetto senza galleria condivisa: somma le foto dei prodotti', () => {
    const product = { isBundle: true, bundleItems: [item({ numeroFoto: 3 }), item({ prodottoId: 'x', numeroFoto: 2, quantita: 2 })] };
    expect(packageHeadline(product as never)).toBe('7 foto nella galleria digitale');
  });
  it('galleria condivisa senza origine valida: dice di accordarsi con lo studio', () => {
    const product = { isBundle: true, fotoCondivise: true, prodottoSorgenteFotoId: 'zzz', bundleItems: [item()] };
    expect(packageHeadline(product as never)).toBe('Foto da concordare con lo studio');
  });
  it('mai gergo tecnico', () => {
    for (const product of [{ numeroFoto: 0 }, { isBundle: true, fotoCondivise: true, bundleItems: [item()] }]) {
      expect(packageHeadline(product as never)).not.toMatch(/bundle|sorgente|configurare|selezione libera|∞/i);
    }
  });
});

describe('packageItemsTitle', () => {
  it('singolare e plurale, senza la parola bundle', () => {
    expect(packageItemsTitle(1)).toBe('Nel pacchetto: 1 prodotto');
    expect(packageItemsTitle(2)).toBe('Nel pacchetto: 2 prodotti');
  });
});

describe('sharedPhotosNotice', () => {
  it('una frase breve e chiara, senza "bundle" ne\' "scatti aggiuntivi"', () => {
    const text = sharedPhotosNotice();
    expect(text.length).toBeLessThan(90);
    expect(text).not.toMatch(/bundle|scatti aggiuntivi|raccolta/i);
  });
});

describe('packageItemNote (dettaglio di ogni prodotto)', () => {
  const shared = { fotoCondivise: true, prodottoSorgenteFotoId: 'a' };
  it('galleria di origine: solo il numero di foto', () => {
    expect(packageItemNote(shared as never, item({ prodottoId: 'a', numeroFoto: 40 }))).toBe('40 foto');
  });
  it('altri prodotti con galleria condivisa: le scegli dalle stesse foto', () => {
    expect(packageItemNote(shared as never, item({ prodottoId: 'b', numeroFoto: 1 }))).toBe('1 foto, scelta tra quelle dello shooting');
    expect(packageItemNote(shared as never, item({ prodottoId: 'b', numeroFoto: 2, quantita: 2 }))).toBe('2 foto ciascuno, scelte tra quelle dello shooting');
  });
  it('senza galleria condivisa', () => {
    expect(packageItemNote({} as never, item({ numeroFoto: 5 }))).toBe('5 foto');
  });
  it('senza foto: a scelta', () => {
    expect(packageItemNote({} as never, item({ numeroFoto: 0 }))).toBe('Foto a tua scelta');
  });
  it('mai gergo tecnico', () => {
    for (const note of [packageItemNote(shared as never, item({ prodottoId: 'a' })), packageItemNote(shared as never, item({ prodottoId: 'b' })), packageItemNote({} as never, item({ numeroFoto: 0 }))]) {
      expect(note).not.toMatch(/sorgente|galleria|selezione libera|bundle/i);
    }
  });
});
