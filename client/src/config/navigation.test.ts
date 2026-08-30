import { describe, expect, it } from 'vitest';
import { getDiscoverGroups, getHeaderItems } from './navigation';

describe('public navigation', () => {
  it('mantiene l’header essenziale e sposta Stampa foto nel menu Scopri', () => {
    const headerLabels = getHeaderItems().map((item) => item.label);
    const discoverLabels = getDiscoverGroups().flatMap((group) => group.items.map((item) => item.label));

    expect(headerLabels).toEqual(['Portfolio', 'Blog', 'Recensioni', 'Prenota una chiamata']);
    expect(discoverLabels).toContain('Stampa foto');
    expect(discoverLabels).toContain('La nostra storia');
  });

  it('collega tutte le destinazioni editoriali senza esporre le route private o QR', () => {
    const discoverPaths = getDiscoverGroups().flatMap((group) => group.items.map((item) => item.href));

    expect(discoverPaths).toEqual([
      '/storie',
      '/fotografo-aversa',
      '/lasciati-trasportare',
      '/stampa-foto-aversa',
      '/vision',
      '/prenota',
      '/accesso-galleria',
    ]);
    expect(discoverPaths).not.toContain('/ospiti');
    expect(new Set(discoverPaths).size).toBe(discoverPaths.length);
  });
});
