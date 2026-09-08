import { describe, expect, it } from 'vitest';
import {
  BLOG_CONTEXTUAL_LINK_SLUGS,
  buildBlogContextualLinks,
  getBlogContextualLinks,
  getBlogCluster,
  selectRelevantWeddingStory,
} from './blog-contextual-links';

const AUDIT_SLUGS = [
  'foto-di-matrimonio-spontanee-il-segreto-e-non-saper-posare',
  'perche-non-ti-piaci-nelle-foto-la-verita-che-nessuno-ti-racconta-sulla-fotogenia',
  'servizio-fotografico-e-video-matrimonio-a-napoli-e-caserta-image-experience-2200',
  'matrimonio-matrimonio-napoli',
  'guida-completa-al-matrimonio',
  'fotografo-matrimonio-aversa-come-costruire-un-servizio-fotografico-che-vi-rappresenti-davvero',
  'tendenze-matrimonio-2026-in-campania-idee-stile-e-ispirazioni-gennaro-mazzacane',
  'servizio-fotografico-di-carnevale-ad-aversa-un-esperienza-pensata-per-i-bambini',
  'perche-scegliere-le-foto-e-piu-difficile-che-scattarle',
  'fotografia-sincera-il-mio-approccio-come-fotografo-ad-aversa',
  'il-libro-digitale-interattivo-la-vostra-storia-d-amore-raccontata-da-voi',
  'oltre-il-sito-vetrina-la-vera-rivoluzione-digitale-per-il-tuo-matrimonio',
  'fotolibro-online-come-utilizzarlo-per-le-tue-foto-ricordo',
  'il-fascino-del-matrimonio-allaperto-tra-natura-e-bellezza',
  'il-fotografo-per-il-tuo-matrimonio-come-scegliere-quello-piu-adatto-a-te',
  'passi-damore',
  'foto-di-natale-prenota-subito-le-tue-foto-ricordo-di-natale-2018',
  'il-fotografo-di-matrimonio-a-napoli-innovazione-e-tradizione-a-confronto',
  'quattro-suggerimenti-per-foto-di-nozze-perfette',
  'foto-reportage-del-matrimonio-a-napoli-sempre-piu-coppie-lo-richiedono',
  'immagini-matrimonio-divertenti-gli-scatti-imperdibili',
  'location-foto-matrimonio-napoli-4-consigli-per-te',
  'album-fotografico-del-matrimonio-cosa-occorre-sapere-per-scegliere-il-meglio',
  'addobbi-nuziali-quando-le-decorazioni-creano-latmosfera-giusta',
  'fotoreportage-di-matrimonio-fedelta',
  'sposarsi-in-costiera-amalfitana-5-luoghi-mozzafiato-per-il-giorno-piu-bello-della-tua-vita',
  'le-foto-della-sposa-gli-scatti-che-non-possono-mancare',
  'foto-perfette-4-consigli-utili',
  'photo-box-scopri-subito-unoccasione-davvero-imperdibile',
  'fotografia-lunga-esposizione-piccoli-suggerimenti-per-uno-scatto-perfetto',
  'costo-servizio-fotografico-matrimonio-facciamo-due-conti',
  'fotografo-di-matrimoni-a-napoli-e-provincia-consigli-utili',
  'foto-artistiche-in-bianco-e-nero-fascino-senza-tempo',
  'servizio-fotografico-battesimo-idea-regalo',
  'matrimonio-a-natale-7-buoni-motivi-per-sposarsi-a-dicembre',
  'consigli-utili-sul-bouquet-da-un-fotografo-di-matrimoni',
  'servizio-fotografico-economico-5-consigli-utili',
  'foto-matrimonio-in-spiaggia-divertimento-e-fantasia-al-potere',
  'il-20-e-21-ottobre-vieni-a-trovarci-alla-fiera-tutto-sposi',
  'book-fotografico-questione-di-scelte',
  'tendenze-per-gli-album-di-nozze-per-il-2019',
  'idee-foto-quando-la-semplicita-e-la-vera-novita-da-inseguire',
  'lalbum-fotografico-del-matrimonio-6-consigli-davvero-utili',
  'foto-anteprima-matrimonio-napoli-il-racconto-della-tua-storia-damore',
  'foto-da-matrimonio-la-poesia-degli-scatti-semplici-e-spontanei',
  'foto-del-matrimonio-4-consigli-per-migliorare-il-servizio-fotografico',
  'foto-con-luce-naturale-quando-lo-scatto-diventa-arte',
  'foto-per-matrimoni-in-costiera-amalfitana-ad-ogni-scatto-unemozione-unica',
  'cornici-con-foto-ai-tuoi-invitati-le-regaliamo-noi',
  'battesimi-foto-idee-e-consigli-utili-per-scoprirne-di-piu',
  'servizio-fotografico-sempre-piu-coppie-scelgono-il-reportage-delle-nozze',
  'immagini-matrimonio-non-scegliermi',
  'album-panoramico-i-vantaggi',
  'foto-dei-particolari-in-un-matrimonio-quando-i-dettagli-fanno-la-differenza',
  'paesaggio-di-notte-7-consigli-utili-per-foto-impeccabili',
  'apertura-nuova-sede-ad-aversa-lo-studio-gennaro-mazzacane-raddoppia',
  'fotografo-sposa-larte-di-ritrarre-la-personalita-femminile',
  'le-foto-degli-abbracci-in-un-matrimonio',
  'fotografia-effetto-seta-5-consigli-utili-per-uno-scatto-perfetto',
  'foto-di-famiglia-a-natale-le-foto-di-oggi-sono-i-tuoi-ricordi-di-domani',
  'instagram-stories-la-femminilita-tra-ironia-e-sensualita',
  'fotografare-cerimonie-quando-protagonista-e-lemozione',
  'foto-ritratto-5-consigli-utili',
  'matrimonio-con-la-pioggia-quando-limprevisto-si-trasforma-in-magia',
  'le-fotografie-per-un-matrimonio-in-autunno-3-consigli-utili',
  'le-foto-agli-sposi-di-spalle-quando-i-dettagli-descrivono-unemozione',
  'fotoritocco-del-matrimonio-cerchiamo-di-scoprirne-di-piu',
  'fotografo-aversa-le-foto-del-matrimonio-di-angelica-e-emmanuele',
];

describe('blog contextual editorial map', () => {
  it('covers each audited published article exactly once', () => {
    expect(BLOG_CONTEXTUAL_LINK_SLUGS).toHaveLength(68);
    expect(new Set(BLOG_CONTEXTUAL_LINK_SLUGS).size).toBe(68);
    expect([...BLOG_CONTEXTUAL_LINK_SLUGS].sort()).toEqual([...AUDIT_SLUGS].sort());
    for (const slug of AUDIT_SLUGS) expect(getBlogCluster(slug)).not.toBeNull();
  });

  it('keeps the default link set focused and on public routes', () => {
    const allowed = /^\/(?:blog\/[a-z0-9-]+|portfolio(?:\/[a-z]+)?|fotografo-aversa|consulenze|prenota|storie)$/;
    for (const slug of AUDIT_SLUGS) {
      const links = getBlogContextualLinks(slug);
      expect(links).toHaveLength(2);
      expect(new Set(links.map(item => item.href)).size).toBe(links.length);
      expect(links.every(item => allowed.test(item.href))).toBe(true);
      expect(links.filter(item => item.kind === 'conversion').length).toBeLessThanOrEqual(1);
    }
  });

  it('adds only a published, valid Real Wedding supplied at runtime', () => {
    const source = 'Il reportage del matrimonio ad Aversa racconta la giornata degli sposi.';
    const candidates = [
      { slug: '', title: 'Senza URL', excerpt: 'matrimonio ad Aversa' },
      { slug: 'bozza-aversa', title: 'Bozza ad Aversa', excerpt: 'matrimonio ad Aversa', status: 'draft' },
      { slug: 'anna-e-luca', title: 'Anna e Luca ad Aversa', excerpt: 'Reportage del matrimonio', status: 'published' },
    ];
    expect(selectRelevantWeddingStory(
      'fotografo-matrimonio-aversa-come-costruire-un-servizio-fotografico-che-vi-rappresenti-davvero',
      source,
      candidates,
    )?.slug).toBe('anna-e-luca');

    const links = buildBlogContextualLinks(
      'guida-completa-al-matrimonio',
      'Guida per organizzare il matrimonio.',
      [{ slug: 'anna-e-luca', title: 'Anna e Luca', excerpt: 'Una storia di matrimonio ad Aversa' }],
    );
    expect(links.filter(item => item.kind === 'story')).toHaveLength(1);
    expect(links.find(item => item.kind === 'story')?.href).toBe('/real-wedding/anna-e-luca');
  });

  it('does not invent a story link when no published candidate is supplied', () => {
    const links = buildBlogContextualLinks('guida-completa-al-matrimonio', 'Guida matrimonio');
    expect(links).toHaveLength(2);
    expect(links.some(item => item.href.startsWith('/real-wedding/'))).toBe(false);
  });
});