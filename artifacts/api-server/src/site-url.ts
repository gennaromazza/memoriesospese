import type { Request } from 'express';

/** Indirizzo pubblico del sito: è quello che i clienti devono trovare nei link delle email. */
export const OFFICIAL_SITE_URL = 'https://imagestudiofotografico.com';

/** Indirizzi di lavoro (anteprima Replit, locale): non esistono per i clienti. */
function isInternalSiteUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.replit.app')
      || host.endsWith('.replit.dev') || host.endsWith('.repl.co');
  } catch {
    return true;
  }
}

/**
 * URL base del sito per i link nelle email e nei messaggi.
 * In produzione: SITE_URL (se è un dominio pubblico) oppure il dominio ufficiale. L'host della richiesta non
 * si usa mai: potrebbe essere un indirizzo interno (replit.app, "This app isn't live yet") o un Host falsificato.
 * Fuori dalla produzione (anteprima, prove): SITE_URL > host della richiesta > dominio ufficiale.
 */
export function getSiteBaseUrl(req?: Request): string {
  const production = process.env.NODE_ENV === 'production';
  const configured = process.env.SITE_URL?.trim().replace(/\/+$/, '');
  if (configured && !(production && isInternalSiteUrl(configured))) return configured;

  if (req && !production) {
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const host = req.get('x-forwarded-host') || req.get('host');
    if (host) return `${protocol}://${host}`;
  }

  return OFFICIAL_SITE_URL;
}
