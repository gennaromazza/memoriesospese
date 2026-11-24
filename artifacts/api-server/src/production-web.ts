import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { isKnownClientPath, isPrivateClientPath } from './client-routes';
import { createSeoMiddleware } from './seo-prerender';
import { registerLegacyCampaignRoutes } from './legacy-campaign-routes';

const IMMUTABLE_ASSET_CACHE = 'public, max-age=31536000, immutable';
const REVALIDATE_CACHE = 'no-cache, max-age=0, must-revalidate';
const SPA_DOCUMENT_CACHE = 'no-cache, no-store, must-revalidate';

export function runtimeServerLabel(nodeEnv = process.env.NODE_ENV): 'production' | 'development' {
  return nodeEnv === 'production' ? 'production' : 'development';
}
export function productionClientBuildPath(cwd = process.cwd()): string {
  return path.resolve(cwd, 'artifacts', 'image-studio-web', 'dist', 'public');
}

export function apiNotFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'not_found',
      message: `Endpoint API non trovato: ${req.method} ${req.originalUrl}`,
    },
  });
}

function isImmutableAsset(filePath: string): boolean {
  const normalized = filePath.split(path.sep).join('/');
  return normalized.includes('/assets/');
}

function setStaticCacheHeaders(res: Response, filePath: string): void {
  res.setHeader(
    'Cache-Control',
    isImmutableAsset(filePath) ? IMMUTABLE_ASSET_CACHE : REVALIDATE_CACHE,
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function setSpaDocumentHeaders(res: Response): void {
  res.setHeader('Cache-Control', SPA_DOCUMENT_CACHE);
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function setPrivateRouteRobotsHeader(res: Response): void {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
}

/**
 * Copies written by the web build next to each asset
 * (artifacts/image-studio-web/build/precompress-assets.ts), best first.
 * The order is the server's preference: browsers give br and gzip the same q.
 */
const PRECOMPRESSED_ENCODINGS = [
  { encoding: 'br', suffix: '.br' },
  { encoding: 'gzip', suffix: '.gz' },
] as const;
const PRECOMPRESSED_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.svg', '.json', '.html', '.txt', '.xml', '.webmanifest']);

/** True when the Accept-Encoding header allows `encoding` (q > 0, explicitly or via `*`). */
export function acceptsEncoding(header: string | undefined, encoding: string): boolean {
  if (!header) return false;
  const quality = new Map<string, number>();
  for (const part of header.split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';').map(token => token.trim());
    if (!name) continue;
    const q = params.find(param => param.startsWith('q='));
    const value = q ? Number(q.slice(2)) : 1;
    quality.set(name, Number.isFinite(value) ? value : 0);
  }
  const q = quality.get(encoding) ?? quality.get('*');
  return q !== undefined && q > 0;
}

/**
 * Sends the brotli or gzip copy of a built asset when the browser accepts it.
 * Anything else (no copy, unsupported browser, path outside the folder) falls
 * through to express.static, which serves the original file.
 */
function precompressedAssets(assetsDir: string) {
  const root = path.resolve(assetsDir);
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let relative: string;
    try {
      relative = decodeURIComponent(req.path);
    } catch {
      return next();
    }
    const extension = path.extname(relative);
    if (!PRECOMPRESSED_EXTENSIONS.has(extension)) return next();
    const filePath = path.resolve(root, `.${relative}`);
    if (!filePath.startsWith(root + path.sep)) return next();

    // Both the compressed and the original response depend on this header.
    res.vary('Accept-Encoding');
    const accept = req.get('Accept-Encoding');
    for (const { encoding, suffix } of PRECOMPRESSED_ENCODINGS) {
      if (!acceptsEncoding(accept, encoding)) continue;
      const compressed = await stat(`${filePath}${suffix}`).catch(() => null);
      if (!compressed?.isFile()) continue;

      setStaticCacheHeaders(res, filePath);
      res.type(extension);
      res.setHeader('Content-Encoding', encoding);
      // Relative to `root`: the hidden-file check then looks only inside the
      // assets folder, not at the parent folders of the installation.
      const sendOptions = { root, acceptRanges: false, cacheControl: false };
      res.sendFile(`${path.relative(root, filePath)}${suffix}`, sendOptions, error => {
        // Once bytes are on the wire (e.g. the browser closed the page), there is
        // nothing left to recover; before that, fall back to the original file.
        if (!error || res.headersSent) return;
        // Reset what was set for the compressed copy: a later 404 must not be cached as immutable.
        for (const header of ['Content-Encoding', 'Content-Type', 'Cache-Control', 'X-Content-Type-Options']) {
          res.removeHeader(header);
        }
        next();
      });
      return;
    }
    next();
  };
}

/**
 * Monta esclusivamente la build Vite gia generata. Le API devono essere
 * registrate prima di questa funzione; la relativa 404 va montata subito
 * prima, cosi un endpoint errato non puo mai ricevere index.html con status 200.
 */
export function mountProductionClient(
  app: Express,
  options: { cwd?: string } = {},
): string {
  const buildPath = productionClientBuildPath(options.cwd);

  // Redirects must run before SEO/prerendering and static SPA fallback.
  registerLegacyCampaignRoutes(app);

  // Before static hosting: even an existing HTML file must not bypass the
  // current page metadata. The renderer reads the compiled Vite shell.
  app.use(createSeoMiddleware({ indexHtmlPath: path.join(buildPath, 'index.html') }));

  app.use('/assets', precompressedAssets(path.join(buildPath, 'assets')));

  app.use(express.static(buildPath, {
    fallthrough: true,
    index: false,
    setHeaders: setStaticCacheHeaders,
  }));

  app.get(/.*/, (req: Request, res: Response, next: NextFunction) => {
    if (isPrivateClientPath(req.path)) {
      setPrivateRouteRobotsHeader(res);
    }

    // Un asset inesistente deve restare un vero 404: restituire la SPA con
    // Content-Type HTML maschererebbe errori di deploy e romperebbe le cache.
    if (path.extname(req.path)) {
      res.status(404).type('text/plain').send('Not Found');
      return;
    }

    if (!isKnownClientPath(req.path)) {
      res.status(404).type('text/plain').send('Not Found');
      return;
    }

    setSpaDocumentHeaders(res);
    res.sendFile(path.join(buildPath, 'index.html'), error => {
      if (error && !res.headersSent) next(error);
    });
  });

  return buildPath;
}
