/**
 * Messaggi editoriali condivisi tra le pagine React e il prerender SEO.
 * Questi testi descrivono solo servizi e fatti già presenti nel sito.
 */

export const WEDDING_HOME_SEO = {
  title: 'Fotografo Matrimoni Aversa, Napoli e Caserta | Image Studio',
  description:
    'Fotografia e video di matrimonio ad Aversa, Napoli, Caserta e in Campania. Reportage emozionale, consulenza gratuita e galleria digitale Memorie Sospese.',
  keywords:
    'fotografo matrimoni aversa, fotografo matrimoni napoli, fotografo matrimoni caserta, fotografo matrimonio campania, video matrimoni campania, image studio',
} as const;

export const WEDDING_PORTFOLIO_SEO = {
  title: 'Portfolio Fotografo Matrimonio | Aversa, Napoli e Caserta | Image Studio',
  description:
    'Portfolio di fotografia di matrimonio ad Aversa, Napoli, Caserta e in Campania: reportage emozionali, momenti autentici e galleria digitale Memorie Sospese.',
  keywords:
    'portfolio fotografo matrimonio aversa, portfolio fotografo matrimonio napoli, foto matrimonio caserta, fotografo matrimonio campania',
} as const;

export const WEDDING_HOME_COPY = {
  eyebrow: 'Fotografia e video di matrimonio',
  heroTitle: 'Fotografo e videografo di matrimonio ad Aversa, Napoli e Caserta',
  heroDescription:
    'Raccontiamo il vostro giorno con fotografie e video emozionali, dal primo abbraccio ai festeggiamenti, lasciando spazio alle emozioni vere.',
  portfolioTitle: 'Fotografie di matrimonio',
  portfolioDescription:
    'Una selezione di reportage matrimoniali: momenti autentici raccontati ad Aversa, Napoli, Caserta e in Campania.',
  portfolioCta: 'Scopri il Portfolio Matrimonio',
  consultationCta: 'Parliamo del tuo matrimonio',
  secondaryTitle: 'Anche per battesimi, comunioni ed eventi',
  secondaryDescription:
    'Lo studio realizza anche servizi fotografici per battesimi, comunioni, cresime, eventi, ritratti e famiglie. Scopri tutte le categorie del portfolio.',
} as const;

export const WEDDING_AREAS =
  'Aversa, Napoli, Caserta, Salerno, Costiera Amalfitana e tutta la Campania';

export const WEDDING_PROCESS_STEPS = [
  'Consulenza gratuita ad Aversa o in videocall',
  'Definizione del reportage e del pacchetto più adatto',
  'Copertura del matrimonio dai preparativi alla festa',
  'Consegna nella galleria digitale privata Memorie Sospese',
] as const;

const SITE_URL = 'https://imagestudiofotografico.com';

export const WEDDING_SERVICE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  '@id': `${SITE_URL}/portfolio/matrimonio#service`,
  name: 'Fotografia e video di matrimonio',
  description: WEDDING_PORTFOLIO_SEO.description,
  url: `${SITE_URL}/portfolio/matrimonio`,
  serviceType: ['Fotografia di matrimonio', 'Video di matrimonio'],
  provider: {
    '@type': 'ProfessionalService',
    '@id': `${SITE_URL}/#organization`,
    name: 'Image Studio',
  },
  areaServed: [
    { '@type': 'City', name: 'Aversa' },
    { '@type': 'City', name: 'Napoli' },
    { '@type': 'City', name: 'Caserta' },
    { '@type': 'AdministrativeArea', name: 'Campania' },
  ],
} as const;

export const WEDDING_PORTFOLIO_BREADCRUMB_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Portfolio',
      item: `${SITE_URL}/portfolio`,
    },
    {
      '@type': 'ListItem',
      position: 3,
      name: 'Matrimoni',
      item: `${SITE_URL}/portfolio/matrimonio`,
    },
  ],
} as const;