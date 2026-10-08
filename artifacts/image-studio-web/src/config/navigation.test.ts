import { describe, expect, it } from 'vitest';
import { getDiscoverGroups, getFooterItems, getHeaderItems, getMobileItems } from './navigation';

describe('public navigation', () => {
  it('mantiene l’header essenziale e sposta Stampa foto nel menu Scopri', () => {
    const headerLabels = getHeaderItems().map((item) => item.label);
    const discoverLabels = getDiscoverGroups().flatMap((group) => group.items.map((item) => item.label));

    expect(headerLabels).toEqual(['Portfolio', 'Blog', 'Recensioni', 'Prenota una chiamata']);
    expect(getHeaderItems().find((item) => item.label === 'Recensioni')?.href).toBe('/#recensioni');
    expect(getDiscoverGroups().map((group) => group.label)).toEqual(['Il nostro mondo', 'Esperienze', 'Il tuo spazio']);
    expect(discoverLabels).toContain('Stampa le tue foto');
    expect(discoverLabels).toContain('Gennaro e Image Studio');
    expect(discoverLabels).toContain('Il libro · Lasciati Trasportare');
  });

  it('mostra «Idee regalo» in header, mobile e footer solo con la vetrina regalo attiva', () => {
    for (const get of [getHeaderItems, getMobileItems, getFooterItems]) {
      expect(get().some((item) => item.href === '/regala')).toBe(false);
      expect(get({ giftShop: false }).some((item) => item.href === '/regala')).toBe(false);
      expect(get({ giftShop: true }).some((item) => item.href === '/regala')).toBe(true);
    }
    expect(getHeaderItems({ giftShop: true }).map((item) => item.label)).toEqual([
      'Portfolio', 'Blog', 'Idee regalo', 'Recensioni', 'Prenota una chiamata',
    ]);
  });

  it('collega tutte le destinazioni editoriali senza esporre le route private o QR', () => {
    const discoverPaths = getDiscoverGroups().flatMap((group) => group.items.map((item) => item.href));

    expect(discoverPaths).toEqual([
      '/storie',
      '/lasciati-trasportare',
      '/fotografo-aversa',
      '/image-experience',
      '/stampa-foto-aversa',
      '/vision',
      '/prenota',
      '/accesso-galleria',
      '/consulenze',
    ]);
    expect(discoverPaths).not.toContain('/ospiti');
    expect(new Set(discoverPaths).size).toBe(discoverPaths.length);
  });
});
