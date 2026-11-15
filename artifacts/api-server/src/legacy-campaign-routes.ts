import type { Express, Request, Response } from 'express';

export const LEGACY_IMAGE_EXPERIENCE_PATHS = ['/esperienza', '/esperienza/'] as const;

/**
 * Audit delle vecchie URL pubbliche:
 * - /esperienza -> landing Image Experience
 * - /consultations -> landing consulenze in italiano
 * - /shop-natale/* -> shop neutro, mantenendo percorso e query
 * - /?p=<numero> -> homepage (permalink WordPress senza contenuto recuperabile)
 *
 * /consultations/book resta invece un flusso operativo noindex: non è una
 * landing duplicata e può ancora essere presente in link inviati ai clienti.
 */
export const LEGACY_PUBLIC_URL_AUDIT = [
  { alias: '/esperienza', destination: '/image-experience', disposition: '301' },
  { alias: '/consultations', destination: '/consulenze', disposition: '301' },
  { alias: '/shop-natale/*', destination: '/online-shop/*', disposition: '301' },
  { alias: '/?p=<numeric>', destination: '/', disposition: '301' },
] as const;

function querySuffix(req: Request): string {
  const queryStart = req.originalUrl.indexOf('?');
  return queryStart >= 0 ? req.originalUrl.slice(queryStart) : '';
}

function permanentRedirect(res: Response, destination: string): void {
  res.status(301);
  res.setHeader('Location', destination);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.type('text/plain').send('Moved Permanently');
}

export function registerLegacyCampaignRoutes(app: Express): void {
  app.get([...LEGACY_IMAGE_EXPERIENCE_PATHS], (req, res) => {
    permanentRedirect(res, `/image-experience${querySuffix(req)}`);
  });

  app.get(['/consultations', '/consultations/'], (req, res) => {
    permanentRedirect(res, `/consulenze${querySuffix(req)}`);
  });

  app.get(/^\/shop-natale(?:\/.*)?$/, (req, res) => {
    const suffix = req.path.slice('/shop-natale'.length);
    permanentRedirect(res, `/online-shop${suffix}${querySuffix(req)}`);
  });

  app.get('/', (req, res, next) => {
    const legacyWordPressId = Array.isArray(req.query?.p)
      ? req.query.p[0]
      : req.query?.p;
    if (typeof legacyWordPressId !== 'string' || !/^\d+$/.test(legacyWordPressId)) {
      next();
      return;
    }
    permanentRedirect(res, '/');
  });
}