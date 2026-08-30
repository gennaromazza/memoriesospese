import { describe, expect, it } from 'vitest';
import { getDiscoverGroups, getHeaderItems } from './navigation';

describe('public navigation', () => {
  it('mantiene l’header essenziale e sposta Stampa foto nel menu Scopri', () => {
    const headerLabels = getHeaderItems().map((item) => item.label);
    const discoverLabels = getDiscoverGroups().flatMap((group) => group.items.map((item) => item.label));

    expect(headerLabels).toEqual(['Portfolio', 'Blog', 'Recensioni', 'Prenota una chiamata']);
    expect(getDiscoverGroups().map((group) => group.label)).toEqual(['Il nostro mondo', 'Esperienze', 'Il tuo spazio']);
    expect(discoverLabels).toContain('Stampa le tue foto');
    expect(discoverLabels).toContain('Gennaro e Image Studio');
    expect(discoverLabels).toContain('Il libro · Lasciati Trasportare');
  });

  it('collega tutte le destinazioni editoriali senza esporre le route private o QR', () => {
    const discoverPaths = getDiscoverGroups().flatMap((group) => group.items.map((item) => item.href));

    expect(discoverPaths).toEqual([
      '/storie',
      '/lasciati-trasportare',
      '/fotografo-aversa',
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
