export const PUBLIC_SITE_URL = 'https://imagestudiofotografico.com';

export type SocialImageSource =
  | 'editorial-cover'
  | 'content-image'
  | 'selected-photo'
  | 'curated-static'
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

const STATIC_IMAGES: Record<string, SocialImageCandidate> = {
  '/': {
    ...GLOBAL_FALLBACK,
    alt: 'Sposi davanti a una villa durante un matrimonio in Campania',
    source: 'curated-static',
  },
  '/blog': {
    url: '/assets/og-image.jpg',
    alt: 'Storie, consigli e fotografia di matrimonio dal blog Image Studio',
    width: 1200,
    height: 630,
    type: 'image/jpeg',
    source: 'curated-static',
  },
  '/portfolio': {
    url: '/1200x630px.jpg',
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
    url: '/assets/og-image.jpg',
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
    url: '/assets/og-image.jpg',
    alt: 'Video matrimoniali cinematografici iMaGe Vision',
    width: 1200,
    height: 630,
    type: 'image/jpeg',
    source: 'curated-static',
  },
  '/storie': {
    url: '/images/couple-standing.png',
    alt: 'La storia e la filosofia fotografica di Image Studio',
    width: 1024,
    height: 1024,
    type: 'image/png',
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
      : `${PUBLIC_SITE_URL}${url.pathname.replace(/\/+$/, '')}${url.search}`;
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

function inferImageType(url: string): string | undefined {
  const path = decodeURIComponent(new URL(url).pathname).toLowerCase();
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.gif')) return 'image/gif';
  return undefined;
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
      type: candidate.type || inferImageType(url),
      source: candidate.source || 'content-image',
    };
  }
  return GLOBAL_FALLBACK;
}

export function staticSocialImage(pathOrUrl: string): ResolvedSocialImage {
  const pathname = new URL(canonicalUrl(pathOrUrl)).pathname.replace(/\/+$/, '') || '/';
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
  const htmlMatch = content.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i);
  const markdownMatch = content.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/i);
  const url = normalizePublicImageUrl(htmlMatch?.[1] || markdownMatch?.[1]);
  return url ? { url, alt, source: 'content-image' } : null;
}

export function defaultSocialImage(): ResolvedSocialImage {
  return { ...GLOBAL_FALLBACK };
}