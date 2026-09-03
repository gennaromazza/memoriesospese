const PUBLIC_STATIC_PATHS = new Set([
  '/',
  '/portfolio',
  '/storie',
  '/lasciati-trasportare',
  '/fotografo-aversa',
  '/stampa-foto-aversa',
  '/blog',
  '/vision',
  '/accesso-galleria',
  '/ospiti',
  '/privacy',
  '/cookie-policy',
  '/gdpr',
  '/terms',
  '/prenota',
  '/consulenze',
]);

const PORTFOLIO_CATEGORIES = new Set([
  'matrimonio',
  'battesimo',
  'comunione',
  'cresima',
  'evento',
  'ritratto',
  'famiglia',
  'altro',
]);

function normalizedPath(pathname: string): string {
  if (pathname.length > 1) return pathname.replace(/\/+$/, '');
  return '/';
}

function hasOneSegmentAfter(prefix: string, pathname: string): boolean {
  return new RegExp(`^${prefix}/[^/]+$`).test(pathname);
}

function hasTwoSegmentsAfter(prefix: string, pathname: string): boolean {
  return new RegExp(`^${prefix}/[^/]+/[^/]+$`).test(pathname);
}

/**
 * Route groups that carry a customer, gallery or collaborator token.
 * They must remain reachable by the SPA but must never be indexed.
 */
export function isPrivateClientPath(pathname: string): boolean {
  const path = normalizedPath(pathname);

  return (
    path === '/admin'
    || path.startsWith('/admin/')
    || path === '/profile'
    || path === '/quote-management-demo'
    || path === '/special-gallery'
    || hasOneSegmentAfter('/gallery', path)
    || hasOneSegmentAfter('/view', path)
    || hasOneSegmentAfter('/quote', path)
    || hasOneSegmentAfter('/preventivo-rapido', path)
    || hasOneSegmentAfter('/fotolibro', path)
    || hasOneSegmentAfter('/q', path)
    || hasOneSegmentAfter('/modulo', path)
    || hasTwoSegmentsAfter('/collaboratori/assignment', path)
    || hasOneSegmentAfter('/collaboratori/dashboard', path)
    || path === '/stampa-foto-aversa/ordine'
    || path.startsWith('/stampa-foto-aversa/ordine/')
    || path === '/stampa-foto-aversa/i-miei-ordini'
    || path.startsWith('/request-password/')
    || path === '/request-password'
    || path.startsWith('/password-result/')
  );
}

/**
 * Matches SPA routes independently from whether a content-backed slug exists.
 * Content-backed routes are checked against Firestore by the SEO middleware.
 */
export function isKnownClientPath(pathname: string): boolean {
  const path = normalizedPath(pathname);
  if (PUBLIC_STATIC_PATHS.has(path) || isPrivateClientPath(path)) return true;
  if (/^\/portfolio\/[^/]+$/.test(path)) return PORTFOLIO_CATEGORIES.has(path.slice('/portfolio/'.length));
  if (hasOneSegmentAfter('/real-wedding', path) || hasOneSegmentAfter('/blog', path)) return true;
  if (hasOneSegmentAfter('/prenota', path)) return true;
  if (hasOneSegmentAfter('/consulenze', path)) return true;
  if (/^\/consulenze\/[^/]+\/[^/]+\/prenota$/.test(path)) return true;
  if (path === '/consultations/book') return true;
  if (/^\/collaboratori\/assignment\/[^/]+\/[^/]+$/.test(path)) return true;
  return false;
}

export function normalizeClientPath(pathname: string): string {
  return normalizedPath(pathname);
}