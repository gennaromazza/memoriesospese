export const PUBLIC_SITE_URL = 'https://imagestudiofotografico.com';

export type SocialImageSource =
  | 'editorial-cover'
  | 'content-image'
  | 'selected-photo'
  | 'curated-static'
  | 'section-fallback'
  | 'global-fallback';

export interface SocialImageCandidate {
  url?: unknown;
  alt?: string;
  width?: number;
  height?: number;
  type?: string;
  source?: SocialImageSource;
}

export interface ResolvedSocialImage {
  url: string;
  alt: string;
  width?: number;
  height?: number;
  type?: string;
  source: SocialImageSource;
}

export interface StaticPageMetadata {
  title: string;
  description: string;
  canonical: string;
}

const STATIC_PAGE_METADATA: Record<string, StaticPageMetadata> = {
  '/image-experience': {
    title: 'Image Experience | Fotografo Matrimonio Campania da 2.200 €',
    description: 'Scopri Image Experience di Image Studio: un punto di partenza chiaro da 2.200 € e la libertà di configurare il servizio fotografico del vostro matrimonio.',
    canonical: `${PUBLIC_SITE_URL}/image-experience`,
  },
  '/blog': {
    title: 'Blog Fotografia Matrimoni | Consigli, Storie e Guide | Image Studio',
    description: 'Il blog di Image Studio: guide per scegliere il fotografo di matrimonio, consigli su costi e tempistiche, storie di coppie ed eventi fotografati in Campania.',
    canonical: `${PUBLIC_SITE_URL}/blog`,
  },
  '/prenota': {
    title: 'Prenota il Tuo Servizio Fotografico | Image Studio Napoli Caserta',
    description: 'Prenota il tuo servizio fotografico con Image Studio. Matrimoni, battesimi, comunioni ed eventi in Campania. Campagne attive con disponibilità limitata.',
    canonical: `${PUBLIC_SITE_URL}/prenota`,
  },
  '/consulenze': {
    title: 'Consulenza Gratuita Fotografo Matrimoni | Image Studio Napoli',
    description: 'Richiedi una consulenza gratuita con Image Studio. Parliamo del tuo matrimonio, evento o servizio fotografico. Incontro personalizzato a Napoli, Caserta o online.',
    canonical: `${PUBLIC_SITE_URL}/consulenze`,
  },
};

const TEMPORARY_URL_PARAMS = new Set([
  'expires',
  'signature',
  'policy',
  'googleaccessid',
  'x-amz-algorithm',
  'x-amz-credential',
  'x-amz-date',
  'x-amz-expires',
  'x-amz-signature',
  'x-amz-security-token',
]);

const GLOBAL_FALLBACK: ResolvedSocialImage = {
  url: `${PUBLIC_SITE_URL}/1200x630px.jpg`,
  alt: 'Sposi durante un matrimonio raccontato da Image Studio in Campania',
  width: 1200,
  height: 630,
  type: 'image/jpeg',
  source: 'global-fallback',
};

export const STATIC_IMAGES: Record<string, SocialImageCandidate> = {
  '/': {
    ...GLOBAL_FALLBACK,
    alt: 'Sposi davanti a una villa durante un matrimonio in Campania',
    source: 'curated-static',
  },
  '/blog': {
    url: '/images/social/blog.jpg',
    alt: 'Storie, consigli e fotografia di matrimonio dal blog Image Studio',
    width: 1200,
    height: 630,
    type: 'image/jpeg',
    source: 'curated-static',
  },
  '/image-experience': {
    url: '/images/image-experience/image-experience-social-1200x630.jpg',
    alt: 'Una sposa abbraccia sua madre durante i preparativi del matrimonio',
    width: 1200,
    height: 630,
    type: 'image/jpeg',
    source: 'curated-static',
  },
  '/portfolio': {
    url: '/images/social/portfolio.jpg',
    alt: 'Portfolio di fotografia di matrimonio di Image Studio',
    width: 1200,
    height: 630,
    type: 'image/jpeg',
    source: 'curated-static',
  },
  '/portfolio/matrimonio': {
    url: '/images/portfolio/matrimonio.jpg',
    alt: 'Portfolio di matrimoni ad Aversa, Napoli e Caserta',
    width: 1024,
    height: 1024,
    type: 'image/jpeg',
    source: 'curated-static',
  },
  '/portfolio/battesimo': {
    url: '/images/portfolio/battesimo.jpg',
    alt: 'Portfolio di fotografie di battesimo in Campania',
    width: 1024,
    height: 1024,
    type: 'image/jpeg',
    source: 'curated-static',
  },
  '/portfolio/comunione': {
    url: '/images/portfolio/comunione.jpg',
    alt: 'Portfolio di fotografie di prima comunione in Campania',
    width: 1024,
    height: 1024,
    type: 'image/jpeg',
    source: 'curated-static',
  },
  '/portfolio/cresima': {
    url: '/images/portfolio/cresima.jpg',
    alt: 'Portfolio di fotografie di cresima in Campania',
    width: 1024,
    height: 1024,
    type: 'image/jpeg',
    source: 'curated-static',
  },
  '/portfolio/evento': {
    url: '/images/portfolio/evento.jpg',
    alt: 'Portfolio di fotografie per eventi privati e aziendali',
    width: 1024,
    height: 1024,
    type: 'image/jpeg',
    source: 'curated-static',
  },
  '/portfolio/ritratto': {
    url: '/images/portfolio/ritratto.jpg',
    alt: 'Portfolio di ritratti fotografici professionali',
    width: 1024,
    height: 1024,
    type: 'image/jpeg',
    source: 'curated-static',
  },
  '/fotografo-aversa': {
    url: '/images/social/fotografo-aversa.jpg',
    alt: 'Gennaro Mazzacane, fotografo professionista ad Aversa',
    width: 1200,
    height: 630,
    type: 'image/jpeg',
    source: 'curated-static',
  },
  '/stampa-foto-aversa': {
    url: '/images/print-service/printed-memories-table.jpg',
    alt: 'Stampe fotografiche e ricordi stampati sul tavolo',
    width: 1600,
    height: 2400,
    type: 'image/jpeg',
    source: 'curated-static',
  },
  '/vision': {
    url: '/images/image-vision-social.jpg',
    alt: 'Image Vision di Image Studio: film di matrimonio raccontati con uno stile cinematografico',
    width: 1200,
    height: 630,
    type: 'image/jpeg',
    source: 'curated-static',
  },
  '/storie': {
    url: '/images/social/storie.jpg',
    alt: 'Gennaro Mazzacane con la sua fotocamera: la storia di Image Studio',
    width: 1200,
    height: 630,
    type: 'image/jpeg',
    source: 'curated-static',
  },
  '/lasciati-trasportare': {
    url: '/images/libro-copertina.jpg',
    alt: 'Copertina del libro Lasciati Trasportare di Image Studio',
    width: 1410,
    height: 2000,
    type: 'image/jpeg',
    source: 'curated-static',
  },
  '/prenota': {
    url: '/images/couple-heart-balloon.png',
    alt: 'Prenota un servizio fotografico con Image Studio',
    width: 1024,
    height: 1024,
    type: 'image/png',
    source: 'curated-static',
  },
  '/consulenze': {
    url: '/images/couple-flower-bouquet.png',
    alt: 'Consulenza fotografica personalizzata con Image Studio',
    width: 1024,
    height: 1024,
    type: 'image/png',
    source: 'curated-static',
  },
};

function socialCard(name: string, alt: string): SocialImageCandidate {
  return {
    url: `/images/social/${name}.jpg`, alt, width: 1200, height: 630,
    type: 'image/jpeg', source: 'curated-static',
  };
}

Object.assign(STATIC_IMAGES, {
  '/regala': socialCard('regala', 'Gift card Image Studio: un regalo fotografico con sigillo e dedica personale'),
  '/regala/come-funziona': socialCard('regala-come-funziona', 'Come funziona la gift card Image Studio: scegli, personalizza e consegna il regalo'),
  '/portfolio/famiglia': socialCard('portfolio-famiglia', 'Portfolio famiglia Image Studio: fotografie e ricordi da conservare insieme'),
  '/portfolio/altro': socialCard('portfolio-altro', 'Altri progetti fotografici nel portfolio Image Studio'),
  '/online-shop': socialCard('online-shop-natale', 'Shopping natalizio di Image Studio con idee regalo e fotografie personalizzate'),
  '/privacy': socialCard('privacy', 'Image Studio: informativa sulla privacy e trattamento dei dati personali'),
  '/cookie-policy': socialCard('cookie-policy', 'Image Studio: cookie e preferenze di navigazione'),
  '/terms': socialCard('terms', 'Image Studio: condizioni di vendita e utilizzo dei servizi'),
  '/gdpr': socialCard('gdpr', 'Image Studio: richieste di accesso, esportazione e cancellazione dei dati'),
});

const SECTION_IMAGES: Record<string, SocialImageCandidate> = {
  '/blog/': socialCard('blog-articolo', 'Guide, consigli e storie di fotografia nel blog Image Studio'),
  '/real-wedding/': socialCard('real-wedding', 'Real Wedding Image Studio: storie di matrimonio in Campania'),
  '/prenota/': socialCard('prenotazione', 'Prenotazione di un servizio fotografico Image Studio'),
  '/online-shop/categoria/': socialCard('shop-categoria', 'Prodotti fotografici personalizzati nel catalogo Image Studio'),
};

/** Resolve both the client and server image, including invalid/missing content covers. */
export function pageSocialImage(path: string, candidates: SocialImageCandidate[] = []): ResolvedSocialImage {
  const fallback = staticSocialImage(path);
  return resolveSocialImage(candidates, fallback);
}

export function blogSocialImage(post: {
  coverImage?: unknown; coverImageAlt?: string; title?: string; content?: unknown;
  coverImageWidth?: number; coverImageHeight?: number; coverImageType?: string;
}, contentImage?: SocialImageCandidate | null): ResolvedSocialImage {
  const inline = contentImage || firstImageCandidateFromHtml(post.content, post.title || 'Articolo Image Studio');
  return pageSocialImage('/blog/articolo', [
    {
      url: post.coverImage, alt: post.coverImageAlt || post.title,
      width: post.coverImageWidth, height: post.coverImageHeight, type: post.coverImageType,
      source: 'editorial-cover',
    },
    ...(inline ? [inline] : []),
  ]);
}

export function weddingSocialImage(title: string, photos: { url?: unknown; alt?: string }[]): ResolvedSocialImage {
  return pageSocialImage('/real-wedding/storia', photos.map((photo, index) => ({
    url: photo.url,
    alt: photo.alt || (index === 0 ? `Copertina del Real Wedding ${title}` : `${title} - fotografia ${index + 1}`),
    source: 'selected-photo',
  })));
}

export function shopCategorySocialImage(path: string, products: { nome: string; images: string[] }[]): ResolvedSocialImage {
  return pageSocialImage(path, products.flatMap(product => product.images.map(url => ({
    url, alt: product.nome, source: 'content-image' as const,
  }))));
}

function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local') || lower === '0.0.0.0') return true;
  if (lower === '::1' || lower === '[::1]') return true;
  const parts = lower.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part))) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

export function canonicalUrl(pathOrUrl: string): string {
  const trimmed = String(pathOrUrl || '/').trim();
  try {
    const url = new URL(trimmed, PUBLIC_SITE_URL);
    if (url.origin !== PUBLIC_SITE_URL) {
      return `${PUBLIC_SITE_URL}${url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '')}`;
    }
    url.protocol = 'https:';
    url.hash = '';
    return url.pathname === '/'
      ? `${PUBLIC_SITE_URL}/`
      : `${PUBLIC_SITE_URL}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return `${PUBLIC_SITE_URL}/`;
  }
}

export function normalizePublicImageUrl(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return null;
  try {
    const url = new URL(raw, PUBLIC_SITE_URL);
    if (url.protocol !== 'https:' || url.username || url.password || isPrivateHostname(url.hostname)) {
      return null;
    }
    for (const key of url.searchParams.keys()) {
      if (TEMPORARY_URL_PARAMS.has(key.toLowerCase())) return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function resolveSocialImage(
  candidates: SocialImageCandidate[],
  fallback: SocialImageCandidate = GLOBAL_FALLBACK,
): ResolvedSocialImage {
  for (const candidate of [...candidates, fallback, GLOBAL_FALLBACK]) {
    const url = normalizePublicImageUrl(candidate.url);
    if (!url) continue;
    return {
      url,
      alt: String(candidate.alt || GLOBAL_FALLBACK.alt).trim(),
      width: Number.isFinite(candidate.width) && Number(candidate.width) > 0
        ? Number(candidate.width)
        : undefined,
      height: Number.isFinite(candidate.height) && Number(candidate.height) > 0
        ? Number(candidate.height)
        : undefined,
      // A filename extension is not a reliable indicator of the bytes served.
      // Only emit a MIME type when the source explicitly knows the image format.
      type: candidate.type || undefined,
      source: candidate.source || 'content-image',
    };
  }
  return GLOBAL_FALLBACK;
}

export function staticSocialImage(pathOrUrl: string): ResolvedSocialImage {
  const pathname = new URL(canonicalUrl(pathOrUrl)).pathname.replace(/\/+$/, '') || '/';
  const section = Object.entries(SECTION_IMAGES).find(([prefix]) => pathname.startsWith(prefix))?.[1];
  if (section) return resolveSocialImage([{ ...section, source: 'section-fallback' }]);
  const candidate = STATIC_IMAGES[pathname]
    || (pathname.startsWith('/portfolio/') ? STATIC_IMAGES['/portfolio'] : undefined)
    || (pathname.startsWith('/prenota/') ? STATIC_IMAGES['/prenota'] : undefined)
    || (pathname.startsWith('/consulenze/') || pathname.startsWith('/consultations')
      ? STATIC_IMAGES['/consulenze']
      : undefined);
  return resolveSocialImage(candidate ? [candidate] : []);
}

export function staticPageMetadata(pathOrUrl: string): StaticPageMetadata | null {
  const pathname = new URL(canonicalUrl(pathOrUrl)).pathname.replace(/\/+$/, '') || '/';
  return STATIC_PAGE_METADATA[pathname] || null;
}

export function firstImageCandidateFromHtml(
  html: unknown,
  alt: string,
): SocialImageCandidate | null {
  const content = String(html || '');
  const matches = [
    ...content.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi),
    ...content.matchAll(/!\[[^\]]*]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/gi),
  ];
  for (const match of matches) {
    const url = normalizePublicImageUrl(match[1].replace(/&amp;/g, '&'));
    if (url) return { url, alt, source: 'content-image' };
  }
  return null;
}

export function defaultSocialImage(): ResolvedSocialImage {
  return { ...GLOBAL_FALLBACK };
}