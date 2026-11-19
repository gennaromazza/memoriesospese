import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VademecumContent } from './VademecumContent';
import { VADEMECUM_NATALE_2026_CONTENT } from './natale-2026';

describe('Vademecum di Natale 2026', () => {
  const html = renderToStaticMarkup(<VademecumContent content={VADEMECUM_NATALE_2026_CONTENT} />);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

  it('contiene tutte le sezioni del regolamento', () => {
    for (const title of VADEMECUM_NATALE_2026_CONTENT.sections.map(section => section.title)) expect(text).toContain(title);
    expect(VADEMECUM_NATALE_2026_CONTENT.sections).toHaveLength(8);
  });

  it('riporta i numeri e i termini che il cliente deve leggere', () => {
    expect(text).toContain('fino a 5 persone');
    expect(text).toContain('anche a 6');
    expect(text).toContain('Almeno 4 giorni prima dello shooting');
    expect(text).toContain('Nei 4 giorni precedenti allo shooting');
    expect(text).toContain('arrivare 10 minuti prima');
    expect(text).toContain('circa 45 minuti');
    expect(text).toContain('10 minuti di ritardo = 35 minuti di shooting');
    expect(text).toContain('15 minuti di ritardo = 30 minuti di shooting');
    expect(text).toContain('20 minuti di ritardo = 25 minuti di shooting');
    expect(text).toContain('È tutta questione di IMAGE.');
  });

  it('usa una struttura accessibile: un solo h1, titoli di sezione h2 ed elenchi veri', () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.match(/<h2/g)).toHaveLength(8);
    expect(html).toContain('<ul');
    expect(html.match(/<li/g)!.length).toBeGreaterThanOrEqual(5);
  });

  it('non contiene segnaposto o testo tecnico', () => {
    expect(text).not.toMatch(/undefined|null|\[object|TODO|lorem/i);
  });
});
