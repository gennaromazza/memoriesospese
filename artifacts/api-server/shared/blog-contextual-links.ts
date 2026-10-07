/**
 * Editorial interlinking for the public blog.
 *
 * The map is deliberately explicit: links should be chosen by editorial
 * intent, not by repeating the same keyword or by a fuzzy title matcher.
 * It is shared by the browser and the crawler prerender.
 */

export type BlogContextualLinkKind =
  | 'guide'
  | 'local'
  | 'portfolio'
  | 'service'
  | 'conversion'
  | 'story';

export interface BlogContextualLink {
  href: string;
  anchor: string;
  kind: BlogContextualLinkKind;
}

export interface BlogWeddingStoryCandidate {
  slug: string;
  title: string;
  excerpt?: string;
  story?: string;
  status?: 'published' | 'draft';
}

interface BlogCluster {
  id: string;
  description: string;
  posts: readonly string[];
  links: readonly BlogContextualLink[];
  weddingTerms: readonly string[];
}

const link = (
  href: string,
  anchor: string,
  kind: BlogContextualLinkKind,
): BlogContextualLink => ({ href, anchor, kind });

const weddingChoiceLinks = [
  link('/fotografo-aversa', 'conoscere il fotografo ad Aversa', 'local'),
  link('/portfolio/matrimonio', 'vedere il portfolio dei matrimoni', 'portfolio'),
  link('/consulenze', 'parlare del vostro servizio fotografico', 'conversion'),
] as const;

const weddingPlanningLinks = [
  link('/portfolio/matrimonio', 'esplorare il portfolio matrimonio', 'portfolio'),
  link('/consulenze', 'prenotare una consulenza', 'conversion'),
  link(
    '/blog/location-foto-matrimonio-napoli-4-consigli-per-te',
    'scegliere la location con consapevolezza',
    'guide',
  ),
  link(
    '/blog/foto-di-matrimonio-spontanee-il-segreto-e-non-saper-posare',
    'scoprire come nascono le foto spontanee',
    'guide',
  ),
] as const;

const reportageLinks = [
  link('/portfolio/matrimonio', 'guardare i reportage di matrimonio', 'portfolio'),
  link('/fotografo-aversa', 'conoscere lo studio fotografico ad Aversa', 'local'),
  link('/consulenze', 'raccontare il vostro progetto in consulenza', 'conversion'),
  link(
    '/blog/foto-di-matrimonio-spontanee-il-segreto-e-non-saper-posare',
    'approfondire lo stile spontaneo',
    'guide',
  ),
] as const;

const localLocationLinks = [
  link('/fotografo-aversa', 'scoprire il servizio fotografico ad Aversa', 'local'),
  link('/portfolio/matrimonio', 'vedere esempi di matrimoni fotografati', 'portfolio'),
  link('/consulenze', 'chiedere una consulenza sul vostro matrimonio', 'conversion'),
  link(
    '/blog/sposarsi-in-costiera-amalfitana-5-luoghi-mozzafiato-per-il-giorno-piu-bello-della-tua-vita',
    'leggere i consigli sulle location in Campania',
    'guide',
  ),
] as const;

const albumProductLinks = [
  link('/portfolio/matrimonio', 'vedere come il racconto continua nel portfolio', 'portfolio'),
  link('/consulenze', 'parlare di album e prodotti durante una consulenza', 'conversion'),
  link(
    '/blog/album-fotografico-del-matrimonio-cosa-occorre-sapere-per-scegliere-il-meglio',
    'orientarsi nella scelta dell’album',
    'guide',
  ),
  link(
    '/blog/fotolibro-online-come-utilizzarlo-per-le-tue-foto-ricordo',
    'scoprire le possibilità del fotolibro online',
    'guide',
  ),
] as const;

const familyCeremonyLinks = [
  link('/portfolio/famiglia', 'esplorare il portfolio famiglia', 'portfolio'),
  link('/portfolio/battesimo', 'vedere il portfolio battesimi', 'portfolio'),
  link('/fotografo-aversa', 'conoscere lo studio ad Aversa', 'local'),
  link('/consulenze', 'chiedere informazioni sul servizio', 'conversion'),
] as const;

const portraitTechniqueLinks = [
  link('/portfolio/ritratto', 'vedere il portfolio dei ritratti', 'portfolio'),
  link('/portfolio/matrimonio', 'confrontare gli stili nel portfolio matrimonio', 'portfolio'),
  link('/storie', 'conoscere la storia dello studio', 'story'),
  link('/consulenze', 'parlare del vostro progetto fotografico', 'conversion'),
] as const;

const digitalNewsLinks = [
  link('/storie', 'conoscere il percorso dello studio', 'story'),
  link('/portfolio/matrimonio', 'esplorare il portfolio matrimonio', 'portfolio'),
  link('/consulenze', 'parlare del progetto con lo studio', 'conversion'),
] as const;

const CLUSTERS: readonly BlogCluster[] = [
  {
    id: 'wedding-choice',
    description: 'Scelta del fotografo, approccio e posizionamento locale.',
    posts: [
      'perche-non-ti-piaci-nelle-foto-la-verita-che-nessuno-ti-racconta-sulla-fotogenia',
      'fotografia-sincera-il-mio-approccio-come-fotografo-ad-aversa',
      'il-fotografo-per-il-tuo-matrimonio-come-scegliere-quello-piu-adatto-a-te',
      'fotografo-matrimonio-aversa-come-costruire-un-servizio-fotografico-che-vi-rappresenti-davvero',
      'il-fotografo-di-matrimonio-a-napoli-innovazione-e-tradizione-a-confronto',
      'fotografo-di-matrimoni-a-napoli-e-provincia-consigli-utili',
      'foto-di-natale-prenota-subito-le-tue-foto-ricordo-di-natale-2018',
      'fotografo-aversa-le-foto-del-matrimonio-di-angelica-e-emmanuele',
    ],
    links: weddingChoiceLinks,
    weddingTerms: ['matrimonio', 'sposi', 'nozze'],
  },
  {
    id: 'wedding-planning',
    description: 'Guide di pianificazione, stagionalità e preparazione del matrimonio.',
    posts: [
      'matrimonio-matrimonio-napoli',
      'guida-completa-al-matrimonio',
      'tendenze-matrimonio-2026-in-campania-idee-stile-e-ispirazioni-gennaro-mazzacane',
      'il-fascino-del-matrimonio-allaperto-tra-natura-e-bellezza',
      'addobbi-nuziali-quando-le-decorazioni-creano-latmosfera-giusta',
      'consigli-utili-sul-bouquet-da-un-fotografo-di-matrimoni',
      'matrimonio-a-natale-7-buoni-motivi-per-sposarsi-a-dicembre',
      'matrimonio-con-la-pioggia-quando-limprevisto-si-trasforma-in-magia',
      'le-fotografie-per-un-matrimonio-in-autunno-3-consigli-utili',
      'foto-dei-particolari-in-un-matrimonio-quando-i-dettagli-fanno-la-differenza',
      'il-20-e-21-ottobre-vieni-a-trovarci-alla-fiera-tutto-sposi',
    ],
    links: weddingPlanningLinks,
    weddingTerms: ['matrimonio', 'sposi', 'nozze', 'cerimonia'],
  },
  {
    id: 'reportage-style',
    description: 'Reportage, spontaneità, emozioni e immagini del matrimonio.',
    posts: [
      'foto-di-matrimonio-spontanee-il-segreto-e-non-saper-posare',
      'foto-reportage-del-matrimonio-a-napoli-sempre-piu-coppie-lo-richiedono',
      'fotoreportage-di-matrimonio-fedelta',
      'immagini-matrimonio-divertenti-gli-scatti-imperdibili',
      'foto-matrimonio-in-spiaggia-divertimento-e-fantasia-al-potere',
      'foto-da-matrimonio-la-poesia-degli-scatti-semplici-e-spontanei',
      'foto-del-matrimonio-4-consigli-per-migliorare-il-servizio-fotografico',
      'servizio-fotografico-sempre-piu-coppie-scelgono-il-reportage-delle-nozze',
      'le-foto-della-sposa-gli-scatti-che-non-possono-mancare',
      'le-foto-degli-abbracci-in-un-matrimonio',
      'le-foto-agli-sposi-di-spalle-quando-i-dettagli-descrivono-unemozione',
      'passi-damore',
    ],
    links: reportageLinks,
    weddingTerms: ['matrimonio', 'sposi', 'nozze', 'cerimonia'],
  },
  {
    id: 'local-location',
    description: 'Location e servizi fotografici con un focus territoriale.',
    posts: [
      'location-foto-matrimonio-napoli-4-consigli-per-te',
      'sposarsi-in-costiera-amalfitana-5-luoghi-mozzafiato-per-il-giorno-piu-bello-della-tua-vita',
      'foto-per-matrimoni-in-costiera-amalfitana-ad-ogni-scatto-unemozione-unica',
      'apertura-nuova-sede-ad-aversa-lo-studio-gennaro-mazzacane-raddoppia',
      'servizio-fotografico-e-video-matrimonio-a-napoli-e-caserta-image-experience-2200',
      'foto-anteprima-matrimonio-napoli-il-racconto-della-tua-storia-damore',
    ],
    links: localLocationLinks,
    weddingTerms: ['aversa', 'napoli', 'caserta', 'campania', 'costiera', 'matrimonio'],
  },
  {
    id: 'albums-products',
    description: 'Album, book, fotolibri e prodotti che prolungano il ricordo.',
    posts: [
      'il-libro-digitale-interattivo-la-vostra-storia-d-amore-raccontata-da-voi',
      'fotolibro-online-come-utilizzarlo-per-le-tue-foto-ricordo',
      'album-fotografico-del-matrimonio-cosa-occorre-sapere-per-scegliere-il-meglio',
      'foto-perfette-4-consigli-utili',
      'quattro-suggerimenti-per-foto-di-nozze-perfette',
      'photo-box-scopri-subito-unoccasione-davvero-imperdibile',
      'book-fotografico-questione-di-scelte',
      'tendenze-per-gli-album-di-nozze-per-il-2019',
      'lalbum-fotografico-del-matrimonio-6-consigli-davvero-utili',
      'album-panoramico-i-vantaggi',
      'cornici-con-foto-ai-tuoi-invitati-le-regaliamo-noi',
    ],
    links: albumProductLinks,
    weddingTerms: ['matrimonio', 'sposi', 'nozze', 'storia'],
  },
  {
    id: 'family-ceremony',
    description: 'Famiglia, bambini e cerimonie non nuziali.',
    posts: [
      'servizio-fotografico-di-carnevale-ad-aversa-un-esperienza-pensata-per-i-bambini',
      'servizio-fotografico-battesimo-idea-regalo',
      'battesimi-foto-idee-e-consigli-utili-per-scoprirne-di-piu',
      'foto-di-famiglia-a-natale-le-foto-di-oggi-sono-i-tuoi-ricordi-di-domani',
      'fotografare-cerimonie-quando-protagonista-e-lemozione',
    ],
    links: familyCeremonyLinks,
    weddingTerms: ['battesimo', 'famiglia', 'bambini', 'natale', 'cerimonia'],
  },
  {
    id: 'portrait-technique',
    description: 'Tecnica fotografica, ritratto e post-produzione.',
    posts: [
      'perche-scegliere-le-foto-e-piu-difficile-che-scattarle',
      'fotografia-lunga-esposizione-piccoli-suggerimenti-per-uno-scatto-perfetto',
      'foto-artistiche-in-bianco-e-nero-fascino-senza-tempo',
      'foto-con-luce-naturale-quando-lo-scatto-diventa-arte',
      'idee-foto-quando-la-semplicita-e-la-vera-novita-da-inseguire',
      'paesaggio-di-notte-7-consigli-utili-per-foto-impeccabili',
      'fotografo-sposa-larte-di-ritrarre-la-personalita-femminile',
      'fotografia-effetto-seta-5-consigli-utili-per-uno-scatto-perfetto',
      'instagram-stories-la-femminilita-tra-ironia-e-sensualita',
      'foto-ritratto-5-consigli-utili',
      'fotoritocco-del-matrimonio-cerchiamo-di-scoprirne-di-piu',
    ],
    links: portraitTechniqueLinks,
    weddingTerms: ['ritratto', 'sposa', 'matrimonio', 'foto'],
  },
  {
    id: 'digital-news',
    description: 'Storie dello studio, servizi digitali e comunicazioni editoriali.',
    posts: [
      'oltre-il-sito-vetrina-la-vera-rivoluzione-digitale-per-il-tuo-matrimonio',
      'servizio-fotografico-economico-5-consigli-utili',
      'costo-servizio-fotografico-matrimonio-facciamo-due-conti',
      'immagini-matrimonio-non-scegliermi',
    ],
    links: digitalNewsLinks,
    weddingTerms: ['matrimonio', 'sposi', 'nozze', 'studio'],
  },
] as const;

const clusterByPost = new Map<string, BlogCluster>();
for (const cluster of CLUSTERS) {
  for (const slug of cluster.posts) {
    if (clusterByPost.has(slug)) {
      throw new Error(`Lo slug blog è presente in più cluster: ${slug}`);
    }
    clusterByPost.set(slug, cluster);
  }
}

/** The complete editorial inventory audited on 3 September 2026. */
export const BLOG_CONTEXTUAL_LINK_SLUGS = Object.freeze([...clusterByPost.keys()]);

export function getBlogCluster(slug: string): BlogCluster | null {
  return clusterByPost.get(slug) || null;
}

/**
 * Returns the two primary contextual links. A post can refer to itself in a
 * cluster (for example the album pillar), so self-links are filtered first.
 */
export function getBlogContextualLinks(slug: string): BlogContextualLink[] {
  const cluster = getBlogCluster(slug);
  if (!cluster) return [];

  const seen = new Set<string>();
  return cluster.links
    .filter(candidate => candidate.href !== `/blog/${slug}`)
    .filter(candidate => {
      if (seen.has(candidate.href)) return false;
      seen.add(candidate.href);
      return true;
    })
    .slice(0, 2)
    .map(candidate => ({ ...candidate }));
}

function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Selects one published story supplied by the caller. The story slug is
 * never guessed or embedded in the map; missing or empty slugs are ignored.
 */
export function selectRelevantWeddingStory(
  sourceSlug: string,
  sourceText: string,
  candidates: readonly BlogWeddingStoryCandidate[],
): BlogWeddingStoryCandidate | null {
  const cluster = getBlogCluster(sourceSlug);
  if (!cluster) return null;
  const normalizedSource = normalizeForMatch(sourceText);

  const ranked = candidates
    .filter(candidate => Boolean(candidate.slug.trim()) && candidate.status !== 'draft')
    .map((candidate, index) => {
      const candidateText = normalizeForMatch(
        `${candidate.title} ${candidate.excerpt || ''} ${candidate.story || ''}`,
      );
      const score = cluster.weddingTerms.reduce((total, term) => (
        total
        + (candidateText.includes(normalizeForMatch(term)) ? 2 : 0)
        + (normalizedSource.includes(normalizeForMatch(term)) && candidateText.includes(normalizeForMatch(term)) ? 1 : 0)
      ), 0);
      return { candidate, score, index };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return ranked[0]?.candidate || null;
}

export function buildBlogContextualLinks(
  sourceSlug: string,
  sourceText: string,
  weddingStories: readonly BlogWeddingStoryCandidate[] = [],
): BlogContextualLink[] {
  const links = getBlogContextualLinks(sourceSlug);
  const story = selectRelevantWeddingStory(sourceSlug, sourceText, weddingStories);
  if (story) {
    links.push({
      href: `/real-wedding/${encodeURIComponent(story.slug)}`,
      anchor: `leggere la storia di ${story.title}`,
      kind: 'story',
    });
  }
  return links.slice(0, 3);
}