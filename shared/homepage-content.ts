export interface HomepageContent {
  version: 2;
  hero: {
    eyebrow: string;
    title: string;
    tagline: string;
    description: string;
    signature: string;
    primaryCta: string;
    portfolioCta: string;
    galleryAccessText: string;
  };
  portfolio: {
    title: string;
    description: string;
    cta: string;
  };
  secondaryServices: {
    title: string;
    description: string;
    cta: string;
  };
  whatsapp: {
    title: string;
    subtitle: string;
    description: string;
    buttonText: string;
    initialMessage: string;
  };
}

export const DEFAULT_HOMEPAGE_CONTENT: HomepageContent = {
  version: 2,
  hero: {
    eyebrow: 'Fotografia e video di matrimonio',
    title: 'Fotografo e videografo di matrimonio ad Aversa, Napoli e Caserta',
    tagline: 'Lasciati Trasportare',
    description:
      'Raccontiamo il vostro giorno con fotografie e video emozionali, dal primo abbraccio ai festeggiamenti, lasciando spazio alle emozioni vere.',
    signature: 'È tutta questione di Image',
    primaryCta: 'Parliamo del tuo matrimonio',
    portfolioCta: 'Scopri il Portfolio Matrimonio',
    galleryAccessText: 'Hai partecipato a un evento? Accedi alla tua galleria',
  },
  portfolio: {
    title: 'Fotografie di matrimonio',
    description:
      'Una selezione di reportage matrimoniali: momenti autentici raccontati ad Aversa, Napoli, Caserta e in Campania.',
    cta: 'Scopri il Portfolio Matrimonio',
  },
  secondaryServices: {
    title: 'Anche per battesimi, comunioni ed eventi',
    description:
      'Lo studio realizza anche servizi fotografici per battesimi, comunioni, cresime, eventi, ritratti e famiglie. Scopri tutte le categorie del portfolio.',
    cta: 'Esplora tutte le categorie',
  },
  whatsapp: {
    title: 'Contattaci su WhatsApp',
    subtitle: 'Siamo qui per te',
    description: 'Hai domande sulle nostre gallerie o vuoi prenotare un servizio? Scrivici su WhatsApp!',
    buttonText: 'Scrivici su WhatsApp',
    initialMessage: 'Ciao, vorrei ricevere informazioni sui vostri servizi fotografici.',
  },
};

function textOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function resolveHomepageContent(value?: Partial<HomepageContent> | null): HomepageContent {
  const hero = value?.hero || {};
  const portfolio = value?.portfolio || {};
  const secondaryServices = value?.secondaryServices || {};
  const whatsapp = value?.whatsapp || {};
  return {
    version: 2,
    hero: {
      eyebrow: textOrDefault(hero.eyebrow, DEFAULT_HOMEPAGE_CONTENT.hero.eyebrow),
      title: textOrDefault(hero.title, DEFAULT_HOMEPAGE_CONTENT.hero.title),
      tagline: textOrDefault(hero.tagline, DEFAULT_HOMEPAGE_CONTENT.hero.tagline),
      description: textOrDefault(hero.description, DEFAULT_HOMEPAGE_CONTENT.hero.description),
      signature: textOrDefault(hero.signature, DEFAULT_HOMEPAGE_CONTENT.hero.signature),
      primaryCta: textOrDefault(hero.primaryCta, DEFAULT_HOMEPAGE_CONTENT.hero.primaryCta),
      portfolioCta: textOrDefault(hero.portfolioCta, DEFAULT_HOMEPAGE_CONTENT.hero.portfolioCta),
      galleryAccessText: textOrDefault(hero.galleryAccessText, DEFAULT_HOMEPAGE_CONTENT.hero.galleryAccessText),
    },
    portfolio: {
      title: textOrDefault(portfolio.title, DEFAULT_HOMEPAGE_CONTENT.portfolio.title),
      description: textOrDefault(portfolio.description, DEFAULT_HOMEPAGE_CONTENT.portfolio.description),
      cta: textOrDefault(portfolio.cta, DEFAULT_HOMEPAGE_CONTENT.portfolio.cta),
    },
    secondaryServices: {
      title: textOrDefault(secondaryServices.title, DEFAULT_HOMEPAGE_CONTENT.secondaryServices.title),
      description: textOrDefault(secondaryServices.description, DEFAULT_HOMEPAGE_CONTENT.secondaryServices.description),
      cta: textOrDefault(secondaryServices.cta, DEFAULT_HOMEPAGE_CONTENT.secondaryServices.cta),
    },
    whatsapp: {
      title: textOrDefault(whatsapp.title, DEFAULT_HOMEPAGE_CONTENT.whatsapp.title),
      subtitle: textOrDefault(whatsapp.subtitle, DEFAULT_HOMEPAGE_CONTENT.whatsapp.subtitle),
      description: textOrDefault(whatsapp.description, DEFAULT_HOMEPAGE_CONTENT.whatsapp.description),
      buttonText: textOrDefault(whatsapp.buttonText, DEFAULT_HOMEPAGE_CONTENT.whatsapp.buttonText),
      initialMessage: textOrDefault(whatsapp.initialMessage, DEFAULT_HOMEPAGE_CONTENT.whatsapp.initialMessage),
    },
  };
}
